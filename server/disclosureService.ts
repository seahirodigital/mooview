import type {
  DisclosureSearchRefreshResult,
  DisclosureSource,
  DisclosureSourceGroup,
  DisclosureSyncRunResult,
  DisclosureSyncRunSourceResult,
} from '../disclosureTypes';
import { notifyDiscordText } from './discordNotifier';
import {
  countDisclosureRecords,
  findCompaniesForDisclosureSearch,
  getCompany,
  getDisclosure,
  markNotificationSent,
  notificationAlreadySent,
  pruneExpiredNonLargeCapDisclosures,
  readDisclosureSettings,
  readDisclosureSourceState,
  retagDisclosureRecords,
  resolveDisclosureDatabasePath,
} from './disclosureStore';
import {
  disclosureSourceConfigured,
  syncEdinet,
  syncEdinetDb,
  syncEdinetDbCompanies,
  syncTdnet,
  syncTdnetCompanies,
  syncTdnetScrape,
  type SourceSyncResult,
} from './disclosureSources';
import { seedLargeCapCompanies } from './largeCapImporter';

const SCHEDULER_TICK_MS = 60_000;

const running: Record<DisclosureSource, boolean> = {
  edinet: false,
  'edinet-db': false,
  tdnet: false,
  'tdnet-scrape': false,
};
const runningPromises: Record<DisclosureSource, Promise<SourceSyncResult> | null> = {
  edinet: null,
  'edinet-db': null,
  tdnet: null,
  'tdnet-scrape': null,
};
let scheduler: ReturnType<typeof setInterval> | null = null;

function minutesSince(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(value).getTime()) / 60_000;
}

function absoluteDisclosureUrl(relativeUrl: string | null): string | null {
  if (!relativeUrl) return null;
  if (/^https:\/\//i.test(relativeUrl)) return relativeUrl;
  const base = process.env.MOOVIEW_PUBLIC_URL?.trim();
  if (!base) return null;
  return new URL(relativeUrl, base.endsWith('/') ? base : `${base}/`).toString();
}

async function notifyNewDisclosures(ids: number[]): Promise<void> {
  const settings = readDisclosureSettings();
  for (const id of ids) {
    const disclosure = getDisclosure(id);
    if (!disclosure?.companyId || notificationAlreadySent(id, 'new-disclosure')) continue;
    if (disclosure.tag === 'NOISE') continue;
    const company = getCompany(disclosure.companyId);
    const tdnet = disclosure.source === 'tdnet' || disclosure.source === 'tdnet-scrape';
    const globallyEnabled = tdnet
      ? settings.tdnetDisclosureNotificationsEnabled
      : settings.newDisclosureNotificationsEnabled;
    const companyEnabled = tdnet
      ? company?.tdnetNotifyEnabled
      : company?.edinetNotifyEnabled;
    if (!globallyEnabled || !company?.isLargeCap || !companyEnabled) continue;
    const url = absoluteDisclosureUrl(disclosure.documentUrl)
      || disclosure.sourceUrl
      || 'https://disclosure2.edinet-fsa.go.jp/WEEK0010.aspx';
    const message = [
      `📣 **企業開示DB ${tdnet ? 'TDNET' : 'EDINET'}新着情報**`,
      `企業: ${disclosure.companyName}${disclosure.secCode ? `（${disclosure.secCode}）` : ''}`,
      `タグ: ${disclosure.tag}`,
      `日時: ${new Date(disclosure.publishedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
      `タイトル: ${disclosure.title}`,
      `URL: ${url}`,
    ].join('\n');
    await notifyDiscordText(message);
    markNotificationSent(id, 'new-disclosure');
  }
}

async function synchronizeSource(
  source: DisclosureSource,
  force = false,
): Promise<SourceSyncResult | null> {
  const active = runningPromises[source];
  if (active) return force ? active : null;
  if (!disclosureSourceConfigured(source)) return null;
  const settings = readDisclosureSettings();
  const state = readDisclosureSourceState(source);
  const interval = source === 'edinet'
      ? settings.edinetPollMinutes
      : source === 'edinet-db'
        ? settings.edinetDbPollMinutes
        : source === 'tdnet-scrape'
          ? settings.tdnetScrapePollMinutes
          : settings.tdnetPollMinutes;
  if (!force && minutesSince(state.lastAttemptAt) < interval) return null;
  running[source] = true;
  const task = (async () => {
    const result = source === 'edinet'
      ? await syncEdinet(settings)
      : source === 'edinet-db'
        ? await syncEdinetDb(settings)
        : source === 'tdnet-scrape'
          ? await syncTdnetScrape(settings)
          : await syncTdnet(settings);
    if (result.baselineWasComplete && result.newDisclosureIds.length > 0) {
      await notifyNewDisclosures(result.newDisclosureIds);
    }
    return result;
  })();
  runningPromises[source] = task;
  try {
    return await task;
  } finally {
    running[source] = false;
    runningPromises[source] = null;
  }
}

async function schedulerTick(): Promise<void> {
  await Promise.allSettled([
    synchronizeSource('tdnet-scrape'),
    synchronizeSource('edinet'),
    synchronizeSource('edinet-db'),
  ]);
  await synchronizeSource('tdnet');
  const pruned = pruneExpiredNonLargeCapDisclosures();
  if (pruned > 0) {
    console.log(`企業開示DB: 取得から2日を超えた大企業以外の開示${pruned}件を削除しました。`);
  }
}

export function initializeDisclosureService(): void {
  const seedResult = seedLargeCapCompanies();
  const retagged = retagDisclosureRecords(readDisclosureSettings().noiseFilterKeywords);
  const pruned = pruneExpiredNonLargeCapDisclosures();
  console.log(`企業開示DBを初期化しました。大企業リスト: ${seedResult.imported}銘柄、タグ更新: ${retagged}件、期限切れ削除: ${pruned}件`);
  if (scheduler) return;
  scheduler = setInterval(() => void schedulerTick(), SCHEDULER_TICK_MS);
  scheduler.unref?.();
  setTimeout(() => void schedulerTick(), 3_000).unref?.();
}

async function forceDisclosureSyncSources(sources: DisclosureSource[]): Promise<DisclosureSyncRunResult> {
  const startedAt = new Date().toISOString();
  const settings = readDisclosureSettings();
  const settled = await Promise.allSettled(sources.map((source) => synchronizeSource(source, true)));
  const sourceResults: DisclosureSyncRunSourceResult[] = settled.map((result, index) => {
    const source = sources[index];
    const configured = disclosureSourceConfigured(source);
    if (result.status === 'rejected') {
      return {
        source,
        configured,
        status: 'failed',
        processed: 0,
        added: 0,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    }
    if (!result.value) {
      return {
        source,
        configured,
        status: 'not-configured',
        processed: 0,
        added: 0,
        error: null,
      };
    }
    return {
      source,
      configured,
      status: 'completed',
      processed: result.value.processed,
      added: result.value.newDisclosureIds.length,
      error: null,
    };
  });
  const pruned = pruneExpiredNonLargeCapDisclosures();
  const after = countDisclosureRecords().disclosureCount;
  const added = sourceResults.reduce((total, result) => total + result.added, 0);
  const processed = sourceResults.reduce((total, result) => total + result.processed, 0);
  const failures = sourceResults.filter((result) => result.status === 'failed');
  const cleanupMessage = pruned > 0
    ? ` 大企業以外の期限切れ${pruned.toLocaleString('ja-JP')}件を削除しました。`
    : '';
  const sourceLabel = (source: DisclosureSource) => source === 'tdnet-scrape'
    ? 'TDスクレイピング'
    : source === 'tdnet'
      ? 'TDNET'
    : source === 'edinet-db'
      ? 'EDINET DB'
      : 'EDINET';
  const completedLabels = sources.map(sourceLabel).join('・');
  const message = failures.length > 0
    ? `同期は完了しましたが、${failures.map((result) => sourceLabel(result.source)).join('・')}でエラーが発生しました。新規${added.toLocaleString('ja-JP')}件、確認${processed.toLocaleString('ja-JP')}件です。`
    : added > 0
      ? `${added.toLocaleString('ja-JP')}件の更新情報を取得しました。確認${processed.toLocaleString('ja-JP')}件、登録総数${after.toLocaleString('ja-JP')}件です。${cleanupMessage}`.trim()
      : `更新情報はありませんでした。${completedLabels}で${processed.toLocaleString('ja-JP')}件を確認しました。${cleanupMessage}`.trim();
  return {
    message,
    processed,
    added,
    pruned,
    disclosureCount: after,
    backfillDays: settings.backfillDays,
    startedAt,
    completedAt: new Date().toISOString(),
    sources: sourceResults,
  };
}

export function forceEdinetDisclosureSync(): Promise<DisclosureSyncRunResult> {
  return forceDisclosureSyncSources(['edinet', 'edinet-db']);
}

export function forceTdnetDisclosureSync(): Promise<DisclosureSyncRunResult> {
  return forceDisclosureSyncSources(['tdnet']);
}

export function forceTdnetScrapeDisclosureSync(): Promise<DisclosureSyncRunResult> {
  return forceDisclosureSyncSources(['tdnet-scrape']);
}

export function forceDisclosureSync(): Promise<DisclosureSyncRunResult> {
  return forceDisclosureSyncSources(['tdnet-scrape', 'edinet', 'edinet-db', 'tdnet']);
}

export async function refreshDisclosuresForSearch(
  query: string,
  sourceGroups: DisclosureSourceGroup[] = ['edinet', 'tdnet'],
): Promise<DisclosureSearchRefreshResult> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) throw new Error('再取得する企業名またはコードを入力してください。');
  const companies = findCompaniesForDisclosureSearch(normalizedQuery);
  if (companies.length === 0) {
    throw new Error('企業マスターに一致する企業がありません。企業名・証券コード・ティッカーコード・EDINETコードを確認してください。');
  }
  const edinetCodes = companies
    .map((company) => company.edinetCode)
    .filter((code): code is string => Boolean(code));
  const secCodes = companies
    .map((company) => company.secCode)
    .filter((code): code is string => Boolean(code));
  const settings = readDisclosureSettings();
  const tasks: Array<Promise<SourceSyncResult>> = [];
  if (sourceGroups.includes('edinet') && edinetCodes.length > 0 && disclosureSourceConfigured('edinet-db')) {
    tasks.push(syncEdinetDbCompanies(settings, edinetCodes));
  }
  if (sourceGroups.includes('tdnet') && secCodes.length > 0) {
    tasks.push(syncTdnetCompanies(settings, secCodes));
  }
  if (tasks.length === 0) {
    throw new Error('選択中の配信元で再取得できる企業コードがありません。EDINETコード・証券コードとAPI設定を確認してください。');
  }
  const results = await Promise.all(tasks);
  const pruned = pruneExpiredNonLargeCapDisclosures();
  const disclosureCount = countDisclosureRecords().disclosureCount;
  const added = results.reduce((total, result) => total + result.newDisclosureIds.length, 0);
  const processed = results.reduce((total, result) => total + result.processed, 0);
  const message = added > 0
    ? `${companies.length.toLocaleString('ja-JP')}社を再取得し、${added.toLocaleString('ja-JP')}件を追加しました。確認${processed.toLocaleString('ja-JP')}件です。`
    : `${companies.length.toLocaleString('ja-JP')}社を再取得しました。新しい情報はありませんでした（確認${processed.toLocaleString('ja-JP')}件）。`;
  return {
    message: pruned > 0
      ? `${message} 大企業以外の期限切れ${pruned.toLocaleString('ja-JP')}件を削除しました。`
      : message,
    query: normalizedQuery,
    matchedCompanies: companies.length,
    processed,
    added,
    pruned,
    disclosureCount,
  };
}

export function getDisclosureServiceStatus() {
  const counts = countDisclosureRecords();
  const edinet = readDisclosureSourceState('edinet');
  const edinetDb = readDisclosureSourceState('edinet-db');
  const tdnet = readDisclosureSourceState('tdnet');
  const tdnetScrape = readDisclosureSourceState('tdnet-scrape');
  return {
    databasePath: resolveDisclosureDatabasePath(),
    ...counts,
    sources: {
      edinet: {
        configured: disclosureSourceConfigured('edinet'),
        running: running.edinet,
        ...edinet,
      },
      edinetDb: {
        configured: disclosureSourceConfigured('edinet-db'),
        running: running['edinet-db'],
        ...edinetDb,
      },
      tdnet: {
        configured: disclosureSourceConfigured('tdnet'),
        running: running.tdnet,
        ...tdnet,
      },
      tdnetScrape: {
        configured: disclosureSourceConfigured('tdnet-scrape'),
        running: running['tdnet-scrape'],
        ...tdnetScrape,
      },
    },
  };
}
