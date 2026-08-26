import {
  markDisclosureSourceAttempt,
  markDisclosureSourceError,
  markDisclosureSourceSuccess,
  normalizeSecuritiesCode,
  readDisclosureSourceState,
  tdnetDocumentKey,
  upsertDisclosure,
  type DisclosureUpsertResult,
} from './disclosureStore';
import * as tls from 'node:tls';

import { classifyDisclosure } from './disclosureClassification';
import type {
  DisclosureSettings,
  DisclosureSource,
} from '../disclosureTypes';

const EDINET_BASE_URL = 'https://api.edinet-fsa.go.jp/api/v2';
const EDINET_DB_BASE_URL = 'https://edinetdb.jp/v1';
const TDNET_BASE_URL = 'https://webapi.yanoshin.jp/webapi/tdnet';
const TDNET_DISCLOSURE_BASE_URL = 'https://www.release.tdnet.info/inbs/';
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_EDINET_DB_PAGES = 20;
const MAX_TDNET_SCRAPE_PAGES = 100;
let systemCaEnabled = false;

export interface SourceSyncResult {
  source: DisclosureSource;
  newDisclosureIds: number[];
  processed: number;
  baselineWasComplete: boolean;
}

function stringValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function booleanFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function apiKeyFor(source: DisclosureSource): string {
  if (source === 'tdnet' || source === 'tdnet-scrape') return '';
  return source === 'edinet'
    ? process.env.EDINET_API_KEY?.trim() || ''
    : process.env.EDINET_DB_API_KEY?.trim() || '';
}

export function disclosureSourceConfigured(source: DisclosureSource): boolean {
  return source === 'tdnet' || source === 'tdnet-scrape' || Boolean(apiKeyFor(source));
}

async function fetchWithTimeout(url: URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function enableSystemCaCertificates(): void {
  if (systemCaEnabled) return;
  const tlsWithSystemCa = tls as typeof tls & {
    getCACertificates?: (type?: 'default' | 'system' | 'bundled' | 'extra') => string[];
    setDefaultCACertificates?: (certificates: string[]) => void;
  };
  if (tlsWithSystemCa.getCACertificates && tlsWithSystemCa.setDefaultCACertificates) {
    tlsWithSystemCa.setDefaultCACertificates([
      ...tlsWithSystemCa.getCACertificates('default'),
      ...tlsWithSystemCa.getCACertificates('system'),
    ]);
  }
  systemCaEnabled = true;
}

async function fetchJson(url: URL, init: RequestInit = {}): Promise<unknown> {
  const response = await fetchWithTimeout(url, init);
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 500);
    throw new Error(`${url.hostname}からの取得に失敗しました（HTTP ${response.status}）。${detail}`);
  }
  return response.json() as Promise<unknown>;
}

function toJstDate(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function dateRange(days: number): string[] {
  const result: string[] = [];
  const now = Date.now();
  for (let offset = Math.max(0, days - 1); offset >= 0; offset -= 1) {
    result.push(toJstDate(new Date(now - offset * 86_400_000)));
  }
  return result;
}

function normalizePublishedAt(value: unknown, fallbackDate: string): string {
  const raw = stringValue(value);
  if (!raw) return `${fallbackDate}T00:00:00+09:00`;
  const parsed = new Date(raw.includes('T') || /[zZ]|[+-]\d\d:\d\d$/.test(raw)
    ? raw
    : `${raw.replace(' ', 'T')}+09:00`);
  return Number.isNaN(parsed.getTime()) ? `${fallbackDate}T00:00:00+09:00` : parsed.toISOString();
}

function registerResult(result: DisclosureUpsertResult, newIds: number[]): void {
  if (result.isNew) newIds.push(result.id);
}

export async function syncEdinet(settings: DisclosureSettings): Promise<SourceSyncResult> {
  const source: DisclosureSource = 'edinet';
  const apiKey = apiKeyFor(source);
  if (!apiKey) throw new Error('EDINET APIキーが設定されていません。');
  const state = readDisclosureSourceState(source);
  const dates = state.baselineComplete ? dateRange(2) : dateRange(settings.backfillDays);
  const newDisclosureIds: number[] = [];
  let processed = 0;
  markDisclosureSourceAttempt(source);
  try {
    for (const date of dates) {
      const url = new URL(`${EDINET_BASE_URL}/documents.json`);
      url.searchParams.set('date', date);
      url.searchParams.set('type', '2');
      url.searchParams.set('Subscription-Key', apiKey);
      const payload = await fetchJson(url) as { results?: unknown };
      const results = Array.isArray(payload?.results) ? payload.results : [];
      for (const raw of results) {
        if (!raw || typeof raw !== 'object') continue;
        const item = raw as Record<string, unknown>;
        const documentId = stringValue(item.docID);
        if (!documentId) continue;
        const title = stringValue(item.docDescription) || 'EDINET提出書類';
        const secCode = normalizeSecuritiesCode(item.secCode);
        registerResult(upsertDisclosure({
          source,
          sourceDocumentId: documentId,
          companyName: stringValue(item.filerName) || stringValue(item.issuerEdinetCode) || '名称未取得',
          edinetCode: stringValue(item.edinetCode) || stringValue(item.issuerEdinetCode),
          secCode,
          tickerCode: secCode ? `${secCode}.JP` : null,
          title,
          tag: classifyDisclosure(title, source, stringValue(item.docTypeCode) || '', settings.noiseFilterKeywords),
          publishedAt: normalizePublishedAt(item.submitDateTime, date),
          pdfAvailable: booleanFlag(item.pdfFlag),
          withdrawn: stringValue(item.withdrawalStatus) === '2' || stringValue(item.disclosureStatus) === '2',
          metadata: {
            docId: documentId,
            docTypeCode: stringValue(item.docTypeCode),
            ordinanceCode: stringValue(item.ordinanceCode),
            formCode: stringValue(item.formCode),
            pdfFlag: stringValue(item.pdfFlag),
            withdrawalStatus: stringValue(item.withdrawalStatus),
          },
        }), newDisclosureIds);
        processed += 1;
      }
    }
    markDisclosureSourceSuccess(source, { baselineComplete: true });
    return { source, newDisclosureIds, processed, baselineWasComplete: state.baselineComplete };
  } catch (error) {
    markDisclosureSourceError(source, error);
    throw error;
  }
}

function extractEdinetDbItems(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((item) => item && typeof item === 'object') as Record<string, unknown>[];
  if (!payload || typeof payload !== 'object') return [];
  const source = payload as Record<string, unknown>;
  for (const key of ['data', 'documents', 'items', 'results']) {
    const candidate = source[key];
    if (Array.isArray(candidate)) {
      return candidate.filter((item) => item && typeof item === 'object') as Record<string, unknown>[];
    }
    if (candidate && typeof candidate === 'object') {
      const nested = candidate as Record<string, unknown>;
      for (const nestedKey of ['documents', 'items', 'results']) {
        if (Array.isArray(nested[nestedKey])) {
          return (nested[nestedKey] as unknown[])
            .filter((item) => item && typeof item === 'object') as Record<string, unknown>[];
        }
      }
    }
  }
  return [];
}

function extractNextCursor(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;
  const meta = source.meta && typeof source.meta === 'object'
    ? source.meta as Record<string, unknown>
    : {};
  return stringValue(meta.next_cursor) || stringValue(source.next_cursor);
}

function registerEdinetDbItems(
  items: Record<string, unknown>[],
  fallbackDate: string,
  newDisclosureIds: number[],
  noiseKeywords: string[],
): number {
  let processed = 0;
  for (const item of items) {
    const documentId = stringValue(item.doc_id) || stringValue(item.id) || stringValue(item.document_id);
    if (!documentId) continue;
    const documentType = stringValue(item.doc_type) || stringValue(item.type) || '';
    const title = stringValue(item.title) || 'EDINET DB開示資料';
    const edinetCode = stringValue(item.company_code)
      || stringValue(item.edinet_code)
      || stringValue((item.company as Record<string, unknown> | undefined)?.edinet_code);
    const secCode = normalizeSecuritiesCode(
      item.sec_code
      || item.securities_code
      || item.stock_code
      || (item.company as Record<string, unknown> | undefined)?.sec_code,
    );
    const companyName = stringValue(item.company_name)
      || stringValue(item.filer_name)
      || stringValue((item.company as Record<string, unknown> | undefined)?.name)
      || edinetCode
      || secCode
      || '名称未取得';
    const sourceUrl = stringValue(item.source_url) || stringValue(item.url);
    registerResult(upsertDisclosure({
      source: 'edinet-db',
      sourceDocumentId: documentId,
      companyName,
      edinetCode,
      secCode,
      tickerCode: secCode ? `${secCode}.JP` : null,
      title,
      tag: classifyDisclosure(title, 'edinet-db', documentType, noiseKeywords),
      publishedAt: normalizePublishedAt(
        item.published_at || item.discovered_at || item.created_at,
        fallbackDate,
      ),
      sourceUrl,
      pdfAvailable: true,
      metadata: {
        docId: documentId,
        docType: documentType,
        sha256: stringValue(item.sha256),
        fileSize: Number(item.file_size) || null,
        sourceUrl,
      },
    }), newDisclosureIds);
    processed += 1;
  }
  return processed;
}

export async function syncEdinetDb(settings: DisclosureSettings): Promise<SourceSyncResult> {
  const source: DisclosureSource = 'edinet-db';
  const apiKey = apiKeyFor(source);
  if (!apiKey) throw new Error('EDINET DB APIキーが設定されていません。');
  const state = readDisclosureSourceState(source);
  const baselineStart = new Date(Date.now() - settings.backfillDays * 86_400_000);
  const incrementalStart = state.lastSuccessAt
    ? new Date(new Date(state.lastSuccessAt).getTime() - 6 * 3_600_000)
    : baselineStart;
  const publishedAfter = toJstDate(state.baselineComplete ? incrementalStart : baselineStart);
  const newDisclosureIds: number[] = [];
  let processed = 0;
  let cursor: string | null = null;
  markDisclosureSourceAttempt(source);
  try {
    for (let page = 0; page < MAX_EDINET_DB_PAGES; page += 1) {
      const url = new URL(`${EDINET_DB_BASE_URL}/ir/documents`);
      url.searchParams.set('published_after', publishedAfter);
      url.searchParams.set('is_latest_only', 'false');
      url.searchParams.set('limit', '500');
      if (cursor) url.searchParams.set('cursor', cursor);
      const payload = await fetchJson(url, { headers: { 'X-API-Key': apiKey } });
      const items = extractEdinetDbItems(payload);
      processed += registerEdinetDbItems(items, publishedAfter, newDisclosureIds, settings.noiseFilterKeywords);
      const nextCursor = extractNextCursor(payload);
      if (!nextCursor || nextCursor === cursor || items.length === 0) break;
      cursor = nextCursor;
    }
    markDisclosureSourceSuccess(source, { baselineComplete: true, cursor });
    return { source, newDisclosureIds, processed, baselineWasComplete: state.baselineComplete };
  } catch (error) {
    markDisclosureSourceError(source, error);
    throw error;
  }
}

export async function syncEdinetDbCompanies(
  settings: DisclosureSettings,
  edinetCodes: string[],
): Promise<SourceSyncResult> {
  const source: DisclosureSource = 'edinet-db';
  const apiKey = apiKeyFor(source);
  if (!apiKey) throw new Error('EDINET DB APIキーが設定されていません。');
  const companies = Array.from(new Set(
    edinetCodes.map((code) => code.trim().toUpperCase()).filter((code) => /^E\d{5}$/.test(code)),
  )).slice(0, 20);
  if (companies.length === 0) throw new Error('再取得できるEDINETコードが見つかりませんでした。');

  const publishedAfter = toJstDate(new Date(Date.now() - settings.backfillDays * 86_400_000));
  const newDisclosureIds: number[] = [];
  let processed = 0;
  let cursor: string | null = null;
  for (let page = 0; page < MAX_EDINET_DB_PAGES; page += 1) {
    const url = new URL(`${EDINET_DB_BASE_URL}/ir/documents`);
    url.searchParams.set('published_after', publishedAfter);
    url.searchParams.set('is_latest_only', 'false');
    url.searchParams.set('limit', '500');
    for (const code of companies) url.searchParams.append('company', code);
    if (cursor) url.searchParams.set('cursor', cursor);
    const payload = await fetchJson(url, { headers: { 'X-API-Key': apiKey } });
    const items = extractEdinetDbItems(payload);
    processed += registerEdinetDbItems(items, publishedAfter, newDisclosureIds, settings.noiseFilterKeywords);
    const nextCursor = extractNextCursor(payload);
    if (!nextCursor || nextCursor === cursor || items.length === 0) break;
    cursor = nextCursor;
  }
  return {
    source,
    newDisclosureIds,
    processed,
    baselineWasComplete: true,
  };
}

function primitiveString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return stringValue(value);
}

function unwrapTdnetItem(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const wrapped = row.Tdnet || row.tdnet;
  return wrapped && typeof wrapped === 'object'
    ? wrapped as Record<string, unknown>
    : row;
}

function extractTdnetItems(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.map(unwrapTdnetItem).filter((item): item is Record<string, unknown> => Boolean(item));
  }
  if (!payload || typeof payload !== 'object') return [];
  const source = payload as Record<string, unknown>;
  for (const candidate of [source.items, source.data, source.results]) {
    if (Array.isArray(candidate)) {
      return candidate.map(unwrapTdnetItem).filter((item): item is Record<string, unknown> => Boolean(item));
    }
  }
  const single = unwrapTdnetItem(source);
  return single && (single.id !== undefined || single.document_url !== undefined) ? [single] : [];
}

function registerTdnetItems(
  items: Record<string, unknown>[],
  fallbackDate: string,
  newDisclosureIds: number[],
  settings: DisclosureSettings,
): number {
  let processed = 0;
  for (const item of items) {
    const title = stringValue(item.title) || 'TDNET適時開示資料';
    const companyCode = primitiveString(item.company_code);
    const secCode = normalizeSecuritiesCode(companyCode);
    const publishedAt = normalizePublishedAt(item.pubdate || item.published_at, fallbackDate);
    const sourceUrl = stringValue(item.document_url) || stringValue(item.url);
    const documentKey = tdnetDocumentKey(sourceUrl);
    const documentId = primitiveString(item.id)
      || [publishedAt, companyCode || '', title, sourceUrl || ''].join('|');
    registerResult(upsertDisclosure({
      source: 'tdnet',
      sourceDocumentId: documentId,
      companyName: stringValue(item.company_name) || secCode || '名称未取得',
      secCode,
      tickerCode: secCode ? `${secCode}.JP` : null,
      title,
      tag: classifyDisclosure(title, 'tdnet', '', settings.noiseFilterKeywords),
      publishedAt,
      sourceUrl,
      pdfAvailable: Boolean(sourceUrl),
      metadata: {
        tdnetId: primitiveString(item.id),
        companyCode,
        markets: stringValue(item.markets_string),
        documentUrl: sourceUrl,
        tdnetDocumentKey: documentKey,
        retrievalChannel: 'api',
        xbrlUrl: stringValue(item.url_xbrl),
        updateHistory: item.update_history ?? null,
      },
    }), newDisclosureIds);
    processed += 1;
  }
  return processed;
}

async function fetchTdnetList(identifier: string): Promise<Record<string, unknown>[]> {
  const url = new URL(`${TDNET_BASE_URL}/list/${encodeURIComponent(identifier)}.json`);
  url.searchParams.set('limit', '1000');
  return extractTdnetItems(await fetchJson(url));
}

export async function syncTdnet(settings: DisclosureSettings): Promise<SourceSyncResult> {
  const source: DisclosureSource = 'tdnet';
  const state = readDisclosureSourceState(source);
  const dates = state.baselineComplete ? dateRange(2) : dateRange(settings.backfillDays);
  const newDisclosureIds: number[] = [];
  let processed = 0;
  markDisclosureSourceAttempt(source);
  try {
    for (const date of dates) {
      const items = await fetchTdnetList(date.replaceAll('-', ''));
      processed += registerTdnetItems(items, date, newDisclosureIds, settings);
    }
    markDisclosureSourceSuccess(source, { baselineComplete: true });
    return { source, newDisclosureIds, processed, baselineWasComplete: state.baselineComplete };
  } catch (error) {
    markDisclosureSourceError(source, error);
    throw error;
  }
}

export async function syncTdnetCompanies(
  settings: DisclosureSettings,
  securitiesCodes: string[],
): Promise<SourceSyncResult> {
  const source: DisclosureSource = 'tdnet';
  const codes = Array.from(new Set(
    securitiesCodes.map(normalizeSecuritiesCode).filter((code): code is string => Boolean(code)),
  )).slice(0, 20);
  if (codes.length === 0) throw new Error('再取得できる証券コードが見つかりませんでした。');
  const cutoff = Date.now() - settings.backfillDays * 86_400_000;
  const fallbackDate = toJstDate(new Date());
  const newDisclosureIds: number[] = [];
  let processed = 0;
  for (const code of codes) {
    const items = (await fetchTdnetList(code)).filter((item) => {
      const published = normalizePublishedAt(item.pubdate || item.published_at, fallbackDate);
      return new Date(published).getTime() >= cutoff;
    });
    processed += registerTdnetItems(items, fallbackDate, newDisclosureIds, settings);
  }
  return { source, newDisclosureIds, processed, baselineWasComplete: true };
}

function decodeHtmlText(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  return value
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hexadecimal: string) => String.fromCodePoint(Number.parseInt(hexadecimal, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => namedEntities[name.toLowerCase()] ?? match)
    .replace(/[\u00a0\s]+/g, ' ')
    .trim();
}

function extractTdnetCell(rowHtml: string, className: string): string {
  const pattern = new RegExp(
    `<td\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`,
    'i',
  );
  return pattern.exec(rowHtml)?.[1] || '';
}

export interface TdnetScrapedItem {
  time: string;
  companyCode: string;
  companyName: string;
  title: string;
  documentUrl: string;
  markets: string;
  updateHistory: string;
}

export function parseTdnetDisclosurePage(html: string): TdnetScrapedItem[] {
  const items: TdnetScrapedItem[] = [];
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = match[1];
    const time = decodeHtmlText(extractTdnetCell(rowHtml, 'kjTime'));
    const companyCode = decodeHtmlText(extractTdnetCell(rowHtml, 'kjCode'));
    const companyName = decodeHtmlText(extractTdnetCell(rowHtml, 'kjName'));
    const titleCell = extractTdnetCell(rowHtml, 'kjTitle');
    const documentLink = /<a\b[^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/i.exec(titleCell);
    if (!/^\d{2}:\d{2}$/.test(time) || !companyCode || !companyName || !documentLink) continue;
    const documentUrl = new URL(decodeHtmlText(documentLink[1]), TDNET_DISCLOSURE_BASE_URL).toString();
    const parsedUrl = new URL(documentUrl);
    if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'www.release.tdnet.info') continue;
    items.push({
      time,
      companyCode,
      companyName,
      title: decodeHtmlText(documentLink[2]) || 'TDNET適時開示資料',
      documentUrl,
      markets: decodeHtmlText(extractTdnetCell(rowHtml, 'kjPlace')),
      updateHistory: decodeHtmlText(extractTdnetCell(rowHtml, 'kjHistroy')),
    });
  }
  return items;
}

async function fetchTdnetHtml(pathname: string): Promise<string> {
  if (!/^I_(?:main_00|list_\d{3}_\d{8})\.html$/.test(pathname)) {
    throw new Error('TDNETスクレイピング対象ページが不正です。');
  }
  enableSystemCaCertificates();
  const url = new URL(pathname, TDNET_DISCLOSURE_BASE_URL);
  url.searchParams.set('_', String(Date.now()));
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Cache-Control': 'no-cache',
      'User-Agent': 'MooView/1.0 TDNET disclosure synchronization',
    },
  });
  if (!response.ok) {
    throw new Error(`TDNET公式ページの取得に失敗しました（HTTP ${response.status}）。`);
  }
  return response.text();
}

export async function syncTdnetScrape(settings: DisclosureSettings): Promise<SourceSyncResult> {
  const source: DisclosureSource = 'tdnet-scrape';
  const state = readDisclosureSourceState(source);
  const newDisclosureIds: number[] = [];
  let processed = 0;
  markDisclosureSourceAttempt(source);
  try {
    const mainHtml = await fetchTdnetHtml('I_main_00.html');
    const firstPage = /<iframe\b[^>]*\bid=["']main_list["'][^>]*\bsrc=["'](I_list_001_(\d{8})\.html)["']/i.exec(mainHtml)
      || /<iframe\b[^>]*\bsrc=["'](I_list_001_(\d{8})\.html)["'][^>]*\bid=["']main_list["']/i.exec(mainHtml);
    if (!firstPage) throw new Error('TDNET公式ページから当日の一覧URLを取得できませんでした。');
    const dateCompact = firstPage[2];
    const fallbackDate = `${dateCompact.slice(0, 4)}-${dateCompact.slice(4, 6)}-${dateCompact.slice(6, 8)}`;
    const firstPageHtml = await fetchTdnetHtml(firstPage[1]);
    const totalMatch = /全\s*([\d,]+)件/.exec(decodeHtmlText(firstPageHtml));
    const total = Number((totalMatch?.[1] || '0').replaceAll(',', ''));
    const pageCount = Math.min(
      MAX_TDNET_SCRAPE_PAGES,
      Math.max(1, Math.ceil(total / 100)),
    );
    for (let page = 1; page <= pageCount; page += 1) {
      const pageHtml = page === 1
        ? firstPageHtml
        : await fetchTdnetHtml(`I_list_${String(page).padStart(3, '0')}_${dateCompact}.html`);
      for (const item of parseTdnetDisclosurePage(pageHtml)) {
        const secCode = normalizeSecuritiesCode(item.companyCode);
        const documentKey = tdnetDocumentKey(item.documentUrl);
        if (!documentKey) continue;
        const title = item.title;
        registerResult(upsertDisclosure({
          source,
          sourceDocumentId: `tdnet-scrape:${documentKey}`,
          companyName: item.companyName,
          secCode,
          tickerCode: secCode ? `${secCode}.JP` : null,
          title,
          tag: classifyDisclosure(title, source, '', settings.noiseFilterKeywords),
          publishedAt: normalizePublishedAt(`${fallbackDate} ${item.time}:00`, fallbackDate),
          sourceUrl: item.documentUrl,
          pdfAvailable: true,
          metadata: {
            companyCode: item.companyCode,
            markets: item.markets,
            updateHistory: item.updateHistory || null,
            documentUrl: item.documentUrl,
            tdnetDocumentKey: documentKey,
            retrievalChannel: 'scraping',
            scrapedAt: new Date().toISOString(),
          },
        }), newDisclosureIds);
        processed += 1;
      }
    }
    markDisclosureSourceSuccess(source, { baselineComplete: true });
    return { source, newDisclosureIds, processed, baselineWasComplete: state.baselineComplete };
  } catch (error) {
    markDisclosureSourceError(source, error);
    throw error;
  }
}

export async function fetchDisclosurePdf(
  source: DisclosureSource,
  sourceDocumentId: string,
  sourceUrl: string | null,
): Promise<Response> {
  if (source === 'edinet') {
    const apiKey = apiKeyFor(source);
    if (!apiKey) throw new Error('EDINET APIキーが設定されていません。');
    const url = new URL(`${EDINET_BASE_URL}/documents/${encodeURIComponent(sourceDocumentId)}`);
    url.searchParams.set('type', '2');
    url.searchParams.set('Subscription-Key', apiKey);
    const response = await fetchWithTimeout(url);
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('application/pdf')) {
      const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 300);
      throw new Error(`EDINET PDFを取得できませんでした（HTTP ${response.status}）。${detail}`);
    }
    return response;
  }

  if (source === 'tdnet' || source === 'tdnet-scrape') {
    if (!sourceUrl) throw new Error('TDNETの資料URLがありません。');
    const parsedUrl = new URL(sourceUrl);
    const allowedHosts = new Set(['webapi.yanoshin.jp', 'www.release.tdnet.info']);
    if (parsedUrl.protocol !== 'https:' || !allowedHosts.has(parsedUrl.hostname)) {
      throw new Error('TDNETの資料URLが許可された配信元ではありません。');
    }
    const response = await fetchWithTimeout(parsedUrl, { redirect: 'follow' });
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('application/pdf')) {
      throw new Error(`TDNET PDFを取得できませんでした（HTTP ${response.status}）。`);
    }
    return response;
  }

  const apiKey = apiKeyFor(source);
  if (!apiKey) throw new Error('EDINET DB APIキーが設定されていません。');
  const signedUrlEndpoint = new URL(
    `${EDINET_DB_BASE_URL}/ir/documents/${encodeURIComponent(sourceDocumentId)}/pdf-url`,
  );
  let pdfUrl: string | null = null;
  try {
    const payload = await fetchJson(signedUrlEndpoint, { headers: { 'X-API-Key': apiKey } });
    if (payload && typeof payload === 'object') {
      const sourcePayload = payload as Record<string, unknown>;
      pdfUrl = stringValue(sourcePayload.pdf_url)
        || stringValue((sourcePayload.data as Record<string, unknown> | undefined)?.pdf_url);
    }
  } catch (error) {
    if (!sourceUrl) throw error;
  }
  pdfUrl ||= sourceUrl;
  if (!pdfUrl) throw new Error('EDINET DBのPDF URLを取得できませんでした。');
  const parsedUrl = new URL(pdfUrl);
  if (parsedUrl.protocol !== 'https:') throw new Error('PDF URLの通信方式が安全ではありません。');
  const response = await fetchWithTimeout(parsedUrl);
  if (!response.ok) throw new Error(`EDINET DB PDFを取得できませんでした（HTTP ${response.status}）。`);
  return response;
}
