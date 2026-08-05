import fs from 'fs';
import path from 'path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import {
  DEFAULT_DISCLOSURE_GEMINI_PROMPT,
  DEFAULT_DISCLOSURE_SETTINGS,
  normalizeDisclosureSettings,
  type DisclosureCompany,
  type DisclosureListItem,
  type DisclosureListResponse,
  type DisclosureSettings,
  type DisclosureSource,
  type DisclosureSourceGroup,
  type DisclosureTag,
} from '../disclosureTypes';
import { classifyDisclosure } from './disclosureClassification';
import { resolveWorkspaceSettingsDirectory } from './workspaceSettingsStore';

const DATABASE_FILE_NAME = 'disclosures.sqlite';
export const NON_LARGE_CAP_RETENTION_DAYS = 2;

let database: DatabaseSync | null = null;

export interface CompanyUpsertInput {
  name: string;
  edinetCode?: string | null;
  secCode?: string | null;
  tickerCode?: string | null;
  irUrl?: string | null;
  topix100?: boolean;
  nikkei225?: boolean;
  largeCap?: boolean;
  notifyEnabled?: boolean;
  tdnetNotifyEnabled?: boolean;
  preserveNotificationSetting?: boolean;
}

export interface DisclosureUpsertInput {
  source: DisclosureSource;
  sourceDocumentId: string;
  companyName: string;
  edinetCode?: string | null;
  secCode?: string | null;
  tickerCode?: string | null;
  title: string;
  tag: DisclosureTag;
  publishedAt: string;
  sourceUrl?: string | null;
  irUrl?: string | null;
  pdfAvailable: boolean;
  metadata?: Record<string, unknown>;
  withdrawn?: boolean;
}

export interface DisclosureUpsertResult {
  id: number;
  isNew: boolean;
}

export interface DisclosureQuery {
  query?: string;
  largeCapOnly?: boolean;
  tag?: DisclosureTag | '';
  sort?: string;
  direction?: 'asc' | 'desc' | '';
  page?: number;
  pageSize?: number | 'all';
  sourceGroups?: DisclosureSourceGroup[];
  excludeNoise?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

export function normalizeHttpsUrl(value: unknown): string | null {
  const raw = textOrNull(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeSecuritiesCode(value: unknown): string | null {
  const raw = textOrNull(value)?.toUpperCase().replace(/^JP\./, '').replace(/\.JP$/, '') || '';
  if (!raw) return null;
  if (/^[0-9A-Z]{4}0$/.test(raw)) return raw.slice(0, 4);
  return /^[0-9A-Z]{4}$/.test(raw) ? raw : null;
}

function normalizeEdinetCode(value: unknown): string | null {
  const raw = textOrNull(value)?.toUpperCase() || '';
  return /^E\d{5}$/.test(raw) ? raw : null;
}

function companyNameLooksLikeCode(value: unknown): boolean {
  const name = textOrNull(value)?.toUpperCase() || '';
  return !name
    || name === '名称未取得'
    || /^E\d{5}$/.test(name)
    || /^[0-9A-Z]{4}(?:\.JP)?$/.test(name);
}

export function normalizeCompanySearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/株式会社|有限会社|合同会社|ホールディングス|ｈｄ|hd/gi, '')
    .replace(/[\s・･()（）\-ー_]/g, '');
}

export function buildBuffettCodeUrl(secCode: string | null | undefined): string | null {
  const normalized = normalizeSecuritiesCode(secCode);
  return normalized ? `https://www.buffett-code.com/company/${encodeURIComponent(normalized)}/` : null;
}

export function buildEdinetDbCompanyUrl(edinetCode: string | null | undefined): string | null {
  const normalized = normalizeEdinetCode(edinetCode);
  return normalized ? `https://edinetdb.jp/company/${encodeURIComponent(normalized)}` : null;
}

export function resolveDisclosureDatabasePath(): string {
  return path.join(resolveWorkspaceSettingsDirectory(), DATABASE_FILE_NAME);
}

function initializeDatabase(target: DatabaseSync): void {
  target.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      edinet_code TEXT,
      sec_code TEXT,
      ticker_code TEXT,
      ir_url TEXT,
      topix100 INTEGER NOT NULL DEFAULT 0,
      nikkei225 INTEGER NOT NULL DEFAULT 0,
      is_large_cap INTEGER NOT NULL DEFAULT 0,
      notify_enabled INTEGER NOT NULL DEFAULT 0,
      tdnet_notify_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS companies_edinet_code_unique
      ON companies(edinet_code) WHERE edinet_code IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS companies_sec_code_unique
      ON companies(sec_code) WHERE sec_code IS NOT NULL;
    CREATE INDEX IF NOT EXISTS companies_search_index ON companies(normalized_name);
    CREATE INDEX IF NOT EXISTS companies_large_cap_index ON companies(is_large_cap, notify_enabled);

    CREATE TABLE IF NOT EXISTS disclosures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      source_document_id TEXT NOT NULL,
      company_id INTEGER,
      company_name TEXT NOT NULL,
      edinet_code TEXT,
      sec_code TEXT,
      ticker_code TEXT,
      title TEXT NOT NULL,
      tag TEXT NOT NULL,
      published_at TEXT NOT NULL,
      source_url TEXT,
      ir_url TEXT,
      pdf_available INTEGER NOT NULL DEFAULT 0,
      withdrawn INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      summary_text TEXT,
      summary_model TEXT,
      summary_updated_at TEXT,
      discovered_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL,
      UNIQUE(source, source_document_id)
    );

    CREATE INDEX IF NOT EXISTS disclosures_published_index ON disclosures(published_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS disclosures_discovered_index ON disclosures(discovered_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS disclosures_company_index ON disclosures(company_id, published_at DESC);
    CREATE INDEX IF NOT EXISTS disclosures_tag_index ON disclosures(tag, published_at DESC);

    CREATE TABLE IF NOT EXISTS disclosure_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      settings_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS disclosure_sync_state (
      source TEXT PRIMARY KEY,
      baseline_complete INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT,
      last_success_at TEXT,
      last_error TEXT,
      cursor TEXT
    );

    CREATE TABLE IF NOT EXISTS disclosure_notification_log (
      disclosure_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      PRIMARY KEY(disclosure_id, kind),
      FOREIGN KEY(disclosure_id) REFERENCES disclosures(id) ON DELETE CASCADE
    );
  `);

  const companyColumns = target.prepare('PRAGMA table_info(companies)').all() as Array<{ name: string }>;
  if (!companyColumns.some((column) => column.name === 'tdnet_notify_enabled')) {
    target.exec('ALTER TABLE companies ADD COLUMN tdnet_notify_enabled INTEGER NOT NULL DEFAULT 0');
    target.exec('UPDATE companies SET tdnet_notify_enabled = notify_enabled');
  }

  const existing = target.prepare('SELECT id FROM disclosure_settings WHERE id = 1').get();
  if (!existing) {
    target.prepare(`
      INSERT INTO disclosure_settings (id, settings_json, updated_at)
      VALUES (1, ?, ?)
    `).run(JSON.stringify(DEFAULT_DISCLOSURE_SETTINGS), nowIso());
  }

  for (const source of ['edinet', 'edinet-db', 'tdnet']) {
    target.prepare(`
      INSERT INTO disclosure_sync_state (source, baseline_complete)
      VALUES (?, 0)
      ON CONFLICT(source) DO NOTHING
    `).run(source);
  }

  const settingsRow = target.prepare('SELECT settings_json FROM disclosure_settings WHERE id = 1')
    .get() as { settings_json?: string } | undefined;
  try {
    const stored = JSON.parse(settingsRow?.settings_json || '{}') as {
      backfillDays?: unknown;
      geminiPrompt?: unknown;
    };
    const storedPrompt = typeof stored.geminiPrompt === 'string' ? stored.geminiPrompt : '';
    const compactPrompt = storedPrompt.replace(/\s/g, '');
    const brokenPrompt = compactPrompt.length >= 20
      && (compactPrompt.match(/\?/g)?.length || 0) / compactPrompt.length >= 0.5;
    const migrateBackfillDays = Number(stored.backfillDays) === 30;
    if (migrateBackfillDays || brokenPrompt) {
      const migrated = normalizeDisclosureSettings({
        ...stored,
        ...(migrateBackfillDays ? { backfillDays: 100 } : {}),
        ...(brokenPrompt ? { geminiPrompt: DEFAULT_DISCLOSURE_GEMINI_PROMPT } : {}),
      });
      target.prepare(`
        UPDATE disclosure_settings SET settings_json = ?, updated_at = ? WHERE id = 1
      `).run(JSON.stringify(migrated), nowIso());
      if (migrateBackfillDays) {
        target.prepare(`
          UPDATE disclosure_sync_state SET baseline_complete = 0, cursor = NULL
        `).run();
      }
    }
  } catch {
    // 壊れた設定は読み込み時の既定値フォールバックに委ねる。
  }

  const companyNameCandidates = target.prepare(`
    SELECT c.id, c.name AS current_name, d.company_name
    FROM companies c
    JOIN disclosures d ON d.company_id = c.id
    WHERE c.name = '名称未取得'
      OR c.name = c.edinet_code
      OR c.name = c.sec_code
      OR upper(c.name) = upper(c.ticker_code)
    ORDER BY d.published_at DESC, d.id DESC
  `).all() as Array<{ id: number | bigint; current_name: string; company_name: string }>;
  const repairedCompanyIds = new Set<number>();
  for (const candidate of companyNameCandidates) {
    const id = Number(candidate.id);
    if (repairedCompanyIds.has(id) || companyNameLooksLikeCode(candidate.company_name)) continue;
    target.prepare(`
      UPDATE companies SET name = ?, normalized_name = ?, updated_at = ? WHERE id = ?
    `).run(
      candidate.company_name.trim(),
      normalizeCompanySearchText(candidate.company_name),
      nowIso(),
      id,
    );
    repairedCompanyIds.add(id);
  }
}

export function getDisclosureDatabase(): DatabaseSync {
  if (database) return database;
  const databasePath = resolveDisclosureDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o750 });
  database = new DatabaseSync(databasePath);
  initializeDatabase(database);
  return database;
}

function findCompanyId(
  target: DatabaseSync,
  edinetCode: string | null,
  secCode: string | null,
): number | null {
  const row = secCode
    ? target.prepare('SELECT id FROM companies WHERE sec_code = ?').get(secCode)
    : edinetCode
      ? target.prepare('SELECT id FROM companies WHERE edinet_code = ?').get(edinetCode)
      : null;
  return row ? Number((row as { id: number | bigint }).id) : null;
}

function findCompanyIdByName(target: DatabaseSync, name: string): number | null {
  const normalizedName = normalizeCompanySearchText(name);
  if (!normalizedName || normalizedName === normalizeCompanySearchText('名称未取得')) return null;
  const rows = target.prepare(`
    SELECT id FROM companies WHERE normalized_name = ? ORDER BY id LIMIT 2
  `).all(normalizedName) as Array<{ id: number | bigint }>;
  return rows.length === 1 ? Number(rows[0].id) : null;
}

function mergeCompanyRows(target: DatabaseSync, keepId: number, removeId: number): void {
  if (keepId === removeId) return;
  target.exec('SAVEPOINT disclosure_company_merge');
  try {
    target.prepare('UPDATE disclosures SET company_id = ? WHERE company_id = ?').run(keepId, removeId);
    target.prepare(`
      UPDATE companies SET
        ir_url = COALESCE(ir_url, (SELECT ir_url FROM companies WHERE id = ?)),
        topix100 = MAX(topix100, (SELECT topix100 FROM companies WHERE id = ?)),
        nikkei225 = MAX(nikkei225, (SELECT nikkei225 FROM companies WHERE id = ?)),
        is_large_cap = MAX(is_large_cap, (SELECT is_large_cap FROM companies WHERE id = ?)),
        notify_enabled = MAX(notify_enabled, (SELECT notify_enabled FROM companies WHERE id = ?)),
        tdnet_notify_enabled = MAX(tdnet_notify_enabled, (SELECT tdnet_notify_enabled FROM companies WHERE id = ?))
      WHERE id = ?
    `).run(removeId, removeId, removeId, removeId, removeId, removeId, keepId);
    target.prepare('DELETE FROM companies WHERE id = ?').run(removeId);
    target.exec('RELEASE SAVEPOINT disclosure_company_merge');
  } catch (error) {
    target.exec('ROLLBACK TO SAVEPOINT disclosure_company_merge');
    target.exec('RELEASE SAVEPOINT disclosure_company_merge');
    throw error;
  }
}

export function upsertCompany(input: CompanyUpsertInput): number {
  const target = getDisclosureDatabase();
  const name = input.name.trim() || input.secCode?.trim() || input.edinetCode?.trim() || '名称未取得';
  const edinetCode = normalizeEdinetCode(input.edinetCode);
  const secCode = normalizeSecuritiesCode(input.secCode ?? input.tickerCode);
  const tickerCode = textOrNull(input.tickerCode) || (secCode ? `${secCode}.JP` : null);
  const irUrl = normalizeHttpsUrl(input.irUrl);
  const timestamp = nowIso();
  const edinetMatch = edinetCode ? findCompanyId(target, edinetCode, null) : null;
  const secMatch = secCode ? findCompanyId(target, null, secCode) : null;
  let companyId = secMatch ?? edinetMatch;

  if (secMatch !== null && edinetMatch !== null && secMatch !== edinetMatch) {
    mergeCompanyRows(target, secMatch, edinetMatch);
    companyId = secMatch;
  }

  companyId ??= findCompanyIdByName(target, name);

  if (companyId === null) {
    const result = target.prepare(`
      INSERT INTO companies (
        name, normalized_name, edinet_code, sec_code, ticker_code, ir_url,
        topix100, nikkei225, is_large_cap, notify_enabled, tdnet_notify_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      normalizeCompanySearchText(name),
      edinetCode,
      secCode,
      tickerCode,
      irUrl,
      input.topix100 ? 1 : 0,
      input.nikkei225 ? 1 : 0,
      input.largeCap ? 1 : 0,
      input.notifyEnabled ? 1 : 0,
      input.tdnetNotifyEnabled === undefined
        ? input.notifyEnabled ? 1 : 0
        : input.tdnetNotifyEnabled ? 1 : 0,
      timestamp,
      timestamp,
    );
    return Number(result.lastInsertRowid);
  }

  const current = target.prepare(`
    SELECT name, topix100, nikkei225, is_large_cap, notify_enabled, tdnet_notify_enabled
    FROM companies WHERE id = ?
  `).get(companyId) as {
    name: string;
    topix100: number;
    nikkei225: number;
    is_large_cap: number;
    notify_enabled: number;
    tdnet_notify_enabled: number;
  };
  const notifyEnabled = input.preserveNotificationSetting
    ? current.notify_enabled
    : input.notifyEnabled === undefined
      ? current.notify_enabled
      : input.notifyEnabled ? 1 : 0;
  const tdnetNotifyEnabled = input.preserveNotificationSetting
    ? current.tdnet_notify_enabled
    : input.tdnetNotifyEnabled === undefined
      ? current.tdnet_notify_enabled
      : input.tdnetNotifyEnabled ? 1 : 0;
  const companyName = companyNameLooksLikeCode(name) && !companyNameLooksLikeCode(current.name)
    ? current.name
    : name;
  target.prepare(`
    UPDATE companies SET
      name = ?, normalized_name = ?,
      edinet_code = COALESCE(?, edinet_code),
      sec_code = COALESCE(?, sec_code),
      ticker_code = COALESCE(?, ticker_code),
      ir_url = COALESCE(?, ir_url),
      topix100 = ?, nikkei225 = ?, is_large_cap = ?, notify_enabled = ?, tdnet_notify_enabled = ?, updated_at = ?
    WHERE id = ?
  `).run(
    companyName,
    normalizeCompanySearchText(companyName),
    edinetCode,
    secCode,
    tickerCode,
    irUrl,
    input.topix100 === undefined ? current.topix100 : input.topix100 ? 1 : 0,
    input.nikkei225 === undefined ? current.nikkei225 : input.nikkei225 ? 1 : 0,
    input.largeCap === undefined ? current.is_large_cap : input.largeCap ? 1 : 0,
    notifyEnabled,
    tdnetNotifyEnabled,
    timestamp,
    companyId,
  );
  return companyId;
}

export function upsertDisclosure(input: DisclosureUpsertInput): DisclosureUpsertResult {
  const target = getDisclosureDatabase();
  const existing = target.prepare(`
    SELECT id FROM disclosures WHERE source = ? AND source_document_id = ?
  `).get(input.source, input.sourceDocumentId) as { id: number | bigint } | undefined;
  const secCode = normalizeSecuritiesCode(input.secCode ?? input.tickerCode);
  const edinetCode = normalizeEdinetCode(input.edinetCode);
  const companyId = upsertCompany({
    name: input.companyName,
    edinetCode,
    secCode,
    tickerCode: input.tickerCode,
    irUrl: input.irUrl,
    preserveNotificationSetting: true,
  });
  const timestamp = nowIso();
  const values: SQLInputValue[] = [
    companyId,
    input.companyName.trim() || '名称未取得',
    edinetCode,
    secCode,
    textOrNull(input.tickerCode) || (secCode ? `${secCode}.JP` : null),
    input.title.trim() || 'タイトル未取得',
    input.tag,
    input.publishedAt,
    normalizeHttpsUrl(input.sourceUrl),
    normalizeHttpsUrl(input.irUrl),
    input.pdfAvailable ? 1 : 0,
    input.withdrawn ? 1 : 0,
    JSON.stringify(input.metadata || {}),
    timestamp,
  ];

  if (existing) {
    target.prepare(`
      UPDATE disclosures SET
        company_id = ?, company_name = ?, edinet_code = ?, sec_code = ?, ticker_code = ?,
        title = ?, tag = ?, published_at = ?, source_url = ?, ir_url = ?,
        pdf_available = ?, withdrawn = ?, metadata_json = ?, updated_at = ?
      WHERE id = ?
    `).run(...values, existing.id);
    return { id: Number(existing.id), isNew: false };
  }

  const result = target.prepare(`
    INSERT INTO disclosures (
      source, source_document_id, company_id, company_name, edinet_code, sec_code,
      ticker_code, title, tag, published_at, source_url, ir_url, pdf_available,
      withdrawn, metadata_json, discovered_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(input.source, input.sourceDocumentId, ...values.slice(0, -1), timestamp, timestamp);
  return { id: Number(result.lastInsertRowid), isNew: true };
}

function rowToDisclosure(row: Record<string, unknown>): DisclosureListItem {
  const id = Number(row.id);
  const pdfAvailable = Number(row.pdf_available) === 1 && Number(row.withdrawn) !== 1;
  const secCode = textOrNull(row.sec_code);
  const edinetCode = textOrNull(row.company_edinet_code) || textOrNull(row.edinet_code);
  return {
    id,
    source: row.source as DisclosureSource,
    sourceDocumentId: String(row.source_document_id),
    companyId: row.company_id === null ? null : Number(row.company_id),
    companyName: String(row.company_name),
    edinetCode,
    secCode,
    tickerCode: textOrNull(row.ticker_code),
    title: String(row.title),
    tag: row.tag as DisclosureTag,
    publishedAt: String(row.published_at),
    discoveredAt: String(row.discovered_at),
    documentUrl: pdfAvailable ? `/api/disclosures/${id}/pdf` : normalizeHttpsUrl(row.source_url),
    downloadUrl: pdfAvailable ? `/api/disclosures/${id}/pdf?download=1` : null,
    sourceUrl: normalizeHttpsUrl(row.source_url),
    irUrl: normalizeHttpsUrl(row.company_ir_url) || normalizeHttpsUrl(row.ir_url),
    edinetDbCompanyUrl: buildEdinetDbCompanyUrl(edinetCode),
    tdnetUrl: row.source === 'tdnet' && pdfAvailable ? `/api/disclosures/${id}/pdf` : null,
    buffettCodeUrl: buildBuffettCodeUrl(secCode),
    pdfAvailable,
    isLargeCap: Number(row.is_large_cap) === 1,
    companyNotifyEnabled: Number(row.company_notify_enabled) === 1,
    edinetCompanyNotifyEnabled: Number(row.company_notify_enabled) === 1,
    tdnetCompanyNotifyEnabled: Number(row.company_tdnet_notify_enabled) === 1,
    summaryText: textOrNull(row.summary_text),
    summaryModel: textOrNull(row.summary_model),
    summaryUpdatedAt: textOrNull(row.summary_updated_at),
  };
}

export function listDisclosures(query: DisclosureQuery): DisclosureListResponse {
  const target = getDisclosureDatabase();
  const conditions = ['d.withdrawn = 0'];
  const parameters: SQLInputValue[] = [];
  if (query.largeCapOnly) conditions.push('COALESCE(c.is_large_cap, 0) = 1');
  const sourceGroups = Array.from(new Set(query.sourceGroups || ['edinet', 'tdnet']));
  if (sourceGroups.length === 0) {
    conditions.push('1 = 0');
  } else if (!sourceGroups.includes('edinet')) {
    conditions.push("d.source = 'tdnet'");
  } else if (!sourceGroups.includes('tdnet')) {
    conditions.push("d.source IN ('edinet', 'edinet-db')");
  }
  if (query.excludeNoise) conditions.push("d.tag <> 'NOISE'");
  if (query.tag) {
    conditions.push('d.tag = ?');
    parameters.push(query.tag);
  }
  const rawQuery = textOrNull(query.query);
  if (rawQuery) {
    const normalized = normalizeCompanySearchText(rawQuery);
    const secCode = normalizeSecuritiesCode(rawQuery);
    conditions.push(`(
      c.normalized_name LIKE ? OR lower(d.company_name) LIKE ? OR lower(d.title) LIKE ?
      OR d.edinet_code = ? OR d.sec_code = ? OR upper(d.ticker_code) = ?
    )`);
    parameters.push(
      `%${normalized}%`,
      `%${rawQuery.toLowerCase()}%`,
      `%${rawQuery.toLowerCase()}%`,
      rawQuery.toUpperCase(),
      secCode,
      rawQuery.toUpperCase(),
    );
  }
  const where = conditions.join(' AND ');
  const sortColumns: Record<string, string> = {
    publishedAt: 'd.published_at',
    companyName: 'd.company_name',
    secCode: 'd.sec_code',
    title: 'd.title',
    tag: 'd.tag',
    source: 'd.source',
    summaryUpdatedAt: 'd.summary_updated_at',
    documentUrl: 'd.pdf_available',
    irUrl: 'COALESCE(c.ir_url, d.ir_url)',
    tdnetUrl: "CASE WHEN d.source = 'tdnet' THEN 1 ELSE 0 END",
    buffettCodeUrl: 'd.sec_code',
  };
  const sortColumn = query.direction ? sortColumns[query.sort || ''] : null;
  const order = sortColumn
    ? `${sortColumn} ${query.direction === 'asc' ? 'ASC' : 'DESC'}, d.id DESC`
    : 'd.discovered_at DESC, d.published_at DESC, d.id DESC';
  const join = 'FROM disclosures d LEFT JOIN companies c ON c.id = d.company_id';
  const totalRow = target.prepare(`SELECT COUNT(*) AS count ${join} WHERE ${where}`)
    .get(...parameters) as { count: number | bigint };
  const total = Number(totalRow.count);
  const showAll = query.pageSize === 'all';
  const pageSize = showAll
    ? Math.max(1, total)
    : Math.min(300, Math.max(10, Math.round(Number(query.pageSize) || 50)));
  const page = showAll ? 1 : Math.max(1, Math.round(query.page || 1));
  const offset = (page - 1) * pageSize;
  const rows = target.prepare(`
    SELECT d.*, c.is_large_cap, c.ir_url AS company_ir_url,
      c.edinet_code AS company_edinet_code, c.notify_enabled AS company_notify_enabled,
      c.tdnet_notify_enabled AS company_tdnet_notify_enabled
    ${join}
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `).all(...parameters, pageSize, offset) as Record<string, unknown>[];
  return {
    items: rows.map(rowToDisclosure),
    total,
    page,
    pageSize,
  };
}

export function getDisclosure(id: number): (DisclosureListItem & { metadata: Record<string, unknown> }) | null {
  const row = getDisclosureDatabase().prepare(`
    SELECT d.*, c.is_large_cap, c.ir_url AS company_ir_url,
      c.edinet_code AS company_edinet_code, c.notify_enabled AS company_notify_enabled,
      c.tdnet_notify_enabled AS company_tdnet_notify_enabled
    FROM disclosures d LEFT JOIN companies c ON c.id = d.company_id
    WHERE d.id = ?
  `).get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(String(row.metadata_json || '{}')) as Record<string, unknown>;
  } catch {
    metadata = {};
  }
  return { ...rowToDisclosure(row), metadata };
}

export function saveDisclosureSummary(id: number, text: string, model: string): void {
  const timestamp = nowIso();
  getDisclosureDatabase().prepare(`
    UPDATE disclosures
    SET summary_text = ?, summary_model = ?, summary_updated_at = ?, updated_at = ?
    WHERE id = ?
  `).run(text.trim(), model.trim(), timestamp, timestamp, id);
}

function rowToCompany(row: Record<string, unknown>): DisclosureCompany {
  const secCode = textOrNull(row.sec_code);
  return {
    id: Number(row.id),
    name: String(row.name),
    edinetCode: textOrNull(row.edinet_code),
    secCode,
    tickerCode: textOrNull(row.ticker_code),
    irUrl: textOrNull(row.ir_url),
    buffettCodeUrl: buildBuffettCodeUrl(secCode),
    topix100: Number(row.topix100) === 1,
    nikkei225: Number(row.nikkei225) === 1,
    isLargeCap: Number(row.is_large_cap) === 1,
    notifyEnabled: Number(row.notify_enabled) === 1,
    edinetNotifyEnabled: Number(row.notify_enabled) === 1,
    tdnetNotifyEnabled: Number(row.tdnet_notify_enabled) === 1,
    updatedAt: String(row.updated_at),
  };
}

export function listLargeCapCompanies(query = ''): DisclosureCompany[] {
  const normalized = normalizeCompanySearchText(query);
  const secCode = normalizeSecuritiesCode(query);
  const conditions = ['is_large_cap = 1'];
  const parameters: SQLInputValue[] = [];
  if (query.trim()) {
    conditions.push('(normalized_name LIKE ? OR sec_code = ? OR upper(ticker_code) = ?)');
    parameters.push(`%${normalized}%`, secCode, query.trim().toUpperCase());
  }
  const rows = getDisclosureDatabase().prepare(`
    SELECT * FROM companies
    WHERE ${conditions.join(' AND ')}
    ORDER BY notify_enabled DESC, topix100 DESC, nikkei225 DESC, sec_code ASC, name ASC
    LIMIT 1000
  `).all(...parameters) as Record<string, unknown>[];
  return rows.map(rowToCompany);
}

export function getCompany(id: number): DisclosureCompany | null {
  const row = getDisclosureDatabase().prepare('SELECT * FROM companies WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToCompany(row) : null;
}

export function findCompaniesForDisclosureSearch(query: string, limit = 20): DisclosureCompany[] {
  const rawQuery = query.trim();
  if (!rawQuery) return [];
  const normalized = normalizeCompanySearchText(rawQuery);
  const edinetCode = normalizeEdinetCode(rawQuery);
  const secCode = normalizeSecuritiesCode(rawQuery);
  const tickerCode = rawQuery.toUpperCase();
  const namePattern = normalized ? `%${normalized}%` : '__NO_COMPANY_NAME_MATCH__';
  const rows = getDisclosureDatabase().prepare(`
    SELECT * FROM companies
    WHERE edinet_code = ? OR sec_code = ? OR upper(ticker_code) = ? OR normalized_name LIKE ?
    ORDER BY
      CASE
        WHEN edinet_code = ? THEN 0
        WHEN sec_code = ? THEN 1
        WHEN upper(ticker_code) = ? THEN 2
        WHEN normalized_name = ? THEN 3
        ELSE 4
      END,
      is_large_cap DESC, name ASC
    LIMIT ?
  `).all(
    edinetCode,
    secCode,
    tickerCode,
    namePattern,
    edinetCode,
    secCode,
    tickerCode,
    normalized,
    Math.min(50, Math.max(1, Math.round(limit))),
  ) as Record<string, unknown>[];
  return rows.map(rowToCompany);
}

export function pruneExpiredNonLargeCapDisclosures(
  retentionDays = NON_LARGE_CAP_RETENTION_DAYS,
): number {
  const days = Math.max(1, Math.round(retentionDays));
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const result = getDisclosureDatabase().prepare(`
    DELETE FROM disclosures
    WHERE id IN (
      SELECT d.id
      FROM disclosures d
      LEFT JOIN companies c ON c.id = d.company_id
      WHERE COALESCE(c.is_large_cap, 0) = 0
        AND d.source IN ('edinet', 'edinet-db')
        AND d.discovered_at < ?
    )
  `).run(cutoff);
  return Number(result.changes);
}

export function updateAllLargeCapCompanyNotifications(
  source: DisclosureSourceGroup,
  enabled: boolean,
): number {
  const column = source === 'tdnet' ? 'tdnet_notify_enabled' : 'notify_enabled';
  const result = getDisclosureDatabase().prepare(`
    UPDATE companies SET ${column} = ?, updated_at = ? WHERE is_large_cap = 1
  `).run(enabled ? 1 : 0, nowIso());
  return Number(result.changes);
}

export function readDisclosureSettings(): DisclosureSettings {
  const row = getDisclosureDatabase().prepare('SELECT settings_json FROM disclosure_settings WHERE id = 1')
    .get() as { settings_json?: string } | undefined;
  try {
    return normalizeDisclosureSettings(JSON.parse(row?.settings_json || '{}'));
  } catch {
    return { ...DEFAULT_DISCLOSURE_SETTINGS };
  }
}

export function writeDisclosureSettings(value: unknown): DisclosureSettings {
  const previous = readDisclosureSettings();
  const settings = normalizeDisclosureSettings(value);
  getDisclosureDatabase().prepare(`
    INSERT INTO disclosure_settings (id, settings_json, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at
  `).run(JSON.stringify(settings), nowIso());
  if (settings.backfillDays !== previous.backfillDays) {
    resetDisclosureSourceBaselines();
  }
  if (settings.noiseFilterKeywords.join('\n') !== previous.noiseFilterKeywords.join('\n')) {
    retagDisclosureRecords(settings.noiseFilterKeywords);
  }
  return settings;
}

export function retagDisclosureRecords(noiseKeywords: string[]): number {
  const target = getDisclosureDatabase();
  const rows = target.prepare(`
    SELECT id, source, title, tag, metadata_json FROM disclosures
  `).all() as Array<Record<string, unknown>>;
  const update = target.prepare(`
    UPDATE disclosures SET tag = ?, updated_at = ? WHERE id = ?
  `);
  let updated = 0;
  target.exec('SAVEPOINT disclosure_retag');
  try {
    for (const row of rows) {
      let metadata: Record<string, unknown> = {};
      try {
        metadata = JSON.parse(String(row.metadata_json || '{}')) as Record<string, unknown>;
      } catch {
        metadata = {};
      }
      const nextTag = classifyDisclosure(
        String(row.title || ''),
        row.source as DisclosureSource,
        String(metadata.docTypeCode || metadata.docType || ''),
        noiseKeywords,
      );
      if (nextTag === row.tag) continue;
      update.run(nextTag, nowIso(), Number(row.id));
      updated += 1;
    }
    target.exec('RELEASE SAVEPOINT disclosure_retag');
  } catch (error) {
    target.exec('ROLLBACK TO SAVEPOINT disclosure_retag');
    target.exec('RELEASE SAVEPOINT disclosure_retag');
    throw error;
  }
  return updated;
}

export function resetDisclosureSourceBaselines(): void {
  getDisclosureDatabase().prepare(`
    UPDATE disclosure_sync_state SET baseline_complete = 0, cursor = NULL
  `).run();
}

export interface DisclosureSourceState {
  baselineComplete: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  cursor: string | null;
}

export function readDisclosureSourceState(source: DisclosureSource): DisclosureSourceState {
  const row = getDisclosureDatabase().prepare(`
    SELECT * FROM disclosure_sync_state WHERE source = ?
  `).get(source) as Record<string, unknown> | undefined;
  return {
    baselineComplete: Number(row?.baseline_complete) === 1,
    lastAttemptAt: textOrNull(row?.last_attempt_at),
    lastSuccessAt: textOrNull(row?.last_success_at),
    lastError: textOrNull(row?.last_error),
    cursor: textOrNull(row?.cursor),
  };
}

export function markDisclosureSourceAttempt(source: DisclosureSource): void {
  getDisclosureDatabase().prepare(`
    UPDATE disclosure_sync_state SET last_attempt_at = ? WHERE source = ?
  `).run(nowIso(), source);
}

export function markDisclosureSourceSuccess(
  source: DisclosureSource,
  options: { baselineComplete?: boolean; cursor?: string | null } = {},
): void {
  const current = readDisclosureSourceState(source);
  getDisclosureDatabase().prepare(`
    UPDATE disclosure_sync_state
    SET baseline_complete = ?, last_success_at = ?, last_error = NULL, cursor = ?
    WHERE source = ?
  `).run(
    options.baselineComplete === undefined
      ? current.baselineComplete ? 1 : 0
      : options.baselineComplete ? 1 : 0,
    nowIso(),
    options.cursor === undefined ? current.cursor : options.cursor,
    source,
  );
}

export function markDisclosureSourceError(source: DisclosureSource, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  getDisclosureDatabase().prepare(`
    UPDATE disclosure_sync_state SET last_error = ? WHERE source = ?
  `).run(message.slice(0, 1000), source);
}

export function notificationAlreadySent(disclosureId: number, kind: string): boolean {
  return Boolean(getDisclosureDatabase().prepare(`
    SELECT 1 FROM disclosure_notification_log WHERE disclosure_id = ? AND kind = ?
  `).get(disclosureId, kind));
}

export function markNotificationSent(disclosureId: number, kind: string): void {
  getDisclosureDatabase().prepare(`
    INSERT INTO disclosure_notification_log (disclosure_id, kind, sent_at)
    VALUES (?, ?, ?)
    ON CONFLICT(disclosure_id, kind) DO NOTHING
  `).run(disclosureId, kind, nowIso());
}

export function countDisclosureRecords(): { largeCapCount: number; disclosureCount: number } {
  const target = getDisclosureDatabase();
  const companyRow = target.prepare('SELECT COUNT(*) AS count FROM companies WHERE is_large_cap = 1')
    .get() as { count: number | bigint };
  const disclosureRow = target.prepare('SELECT COUNT(*) AS count FROM disclosures')
    .get() as { count: number | bigint };
  return {
    largeCapCount: Number(companyRow.count),
    disclosureCount: Number(disclosureRow.count),
  };
}
