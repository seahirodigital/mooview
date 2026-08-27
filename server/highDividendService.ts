import type { Express } from 'express';
import fs from 'fs/promises';
import iconv from 'iconv-lite';
import path from 'path';

import {
  DEFAULT_HIGH_DIVIDEND_AUTOMATION_SETTINGS,
  DEFAULT_HIGH_DIVIDEND_AUTOMATION_STATE,
  normalizeHighDividendAutomationSettings,
  type HighDividendAutomationPayload,
  type HighDividendAutomationSettings,
  type HighDividendAutomationState,
} from '../highDividend';
import type { ETFDataRow } from '../src/highDividend/types';
import { notifyDiscordTextAndFilesToWebhook } from './discordNotifier';
import { renderHighDividendDiscordCharts } from './highDividendChartRenderer';
import { resolveWorkspaceSettingsDirectory } from './workspaceSettingsStore';

const CSV_URL = 'https://www.daiwa-am.co.jp/gxj/management_result_csv.php?code=1165&lang=ja';
const FUND_URL = 'https://globalxetfs.co.jp/funds/563A/index.html';
const MOOVIEW_URL = 'https://mooview-oci.taild87712.ts.net/';
const JAPAN_TIME_ZONE = 'Asia/Tokyo';
const SETTINGS_FILE_NAME = 'high-dividend-automation-settings.json';
const STATE_FILE_NAME = 'high-dividend-automation-state.json';
const DATA_FILE_NAME = 'high-dividend-data.json';
const SCHEDULER_INTERVAL_MS = 15_000;

interface HighDividendSnapshot {
  source: string;
  fetchedAt: string;
  data: ETFDataRow[];
}

interface JapanClock {
  day: number;
  date: string;
  time: string;
  scheduledFor: string;
}

let schedulerTimer: NodeJS.Timeout | null = null;
let schedulerTickInFlight = false;
let writeQueue: Promise<unknown> = Promise.resolve();

function settingsPath(): string {
  return path.join(resolveWorkspaceSettingsDirectory(), SETTINGS_FILE_NAME);
}

function statePath(): string {
  return path.join(resolveWorkspaceSettingsDirectory(), STATE_FILE_NAME);
}

function dataPath(): string {
  return path.join(resolveWorkspaceSettingsDirectory(), DATA_FILE_NAME);
}

async function writeJsonAtomically(targetPath: string, value: unknown): Promise<void> {
  const directory = path.dirname(targetPath);
  await fs.mkdir(directory, { recursive: true, mode: 0o750 });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o640,
  });
  await fs.rename(temporaryPath, targetPath);
}

function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const queued = writeQueue.then(operation, operation);
  writeQueue = queued.catch(() => undefined);
  return queued;
}

async function readJsonFile<T>(targetPath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(targetPath, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function readHighDividendAutomationSettings(): Promise<HighDividendAutomationSettings> {
  const value = await readJsonFile<unknown>(settingsPath(), DEFAULT_HIGH_DIVIDEND_AUTOMATION_SETTINGS);
  return normalizeHighDividendAutomationSettings(value);
}

export function writeHighDividendAutomationSettings(
  value: unknown,
): Promise<HighDividendAutomationSettings> {
  return enqueueWrite(async () => {
    const settings = normalizeHighDividendAutomationSettings(value);
    await writeJsonAtomically(settingsPath(), settings);
    return settings;
  });
}

async function readHighDividendAutomationState(): Promise<HighDividendAutomationState> {
  const value = await readJsonFile<Partial<HighDividendAutomationState>>(
    statePath(),
    DEFAULT_HIGH_DIVIDEND_AUTOMATION_STATE,
  );
  return { ...DEFAULT_HIGH_DIVIDEND_AUTOMATION_STATE, ...value };
}

function writeHighDividendAutomationState(
  state: HighDividendAutomationState,
): Promise<void> {
  return enqueueWrite(() => writeJsonAtomically(statePath(), state));
}

async function readHighDividendSnapshot(): Promise<HighDividendSnapshot | null> {
  const snapshot = await readJsonFile<HighDividendSnapshot | null>(dataPath(), null);
  return snapshot && Array.isArray(snapshot.data) ? snapshot : null;
}

function parseNumber(value: string | undefined): number {
  const number = Number.parseFloat((value || '').replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : 0;
}

function parseHighDividendCsv(text: string): ETFDataRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const rows: ETFDataRow[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const columns = lines[index].split(',').map((column) => column.replace(/^["']|["']$/g, '').trim());
    if (columns.length < 2) continue;
    const date = (columns[0] || '').replace(/[^\d]/g, '');
    const nav = parseNumber(columns[1]);
    if (!date || nav <= 0) continue;
    const netAssets = parseNumber(columns[3]);
    rows.push({
      date,
      nav,
      change: parseNumber(columns[2]),
      net_assets_mil: netAssets / 1_000_000,
      net_assets: netAssets,
      last_div_date: (columns[4] || '').replace(/[^\d]/g, ''),
      last_div: parseNumber(columns[5]),
      reinv_nav: parseNumber(columns[6]) || nav,
      total_units: netAssets > 0 ? netAssets / nav : 0,
    });
  }
  rows.sort((left, right) => left.date.localeCompare(right.date));
  if (rows.length === 0) {
    throw new Error('公式CSVから有効な563Aデータを取得できませんでした。');
  }
  return rows;
}

export async function fetchHighDividendData(): Promise<HighDividendSnapshot> {
  const response = await fetch(CSV_URL, {
    headers: {
      Accept: 'text/csv,text/plain,*/*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    },
  });
  if (!response.ok) {
    throw new Error(`公式CSVの取得に失敗しました（HTTP ${response.status}）。`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const data = parseHighDividendCsv(iconv.decode(buffer, 'Shift_JIS'));
  const snapshot: HighDividendSnapshot = {
    source: CSV_URL,
    fetchedAt: new Date().toISOString(),
    data,
  };
  await enqueueWrite(() => writeJsonAtomically(dataPath(), snapshot));
  return snapshot;
}

function getJapanClock(now = new Date()): JapanClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: JAPAN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((part) => part.type === type)?.value || ''
  );
  const day = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[value('weekday')] ?? 0;
  const date = `${value('year')}${value('month')}${value('day')}`;
  const time = `${value('hour')}:${value('minute')}`;
  return {
    day,
    date,
    time,
    scheduledFor: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time}:00+09:00`,
  };
}

function findPreviousDividendRow(data: ETFDataRow[], latest: ETFDataRow): ETFDataRow {
  const dividendDate = latest.last_div_date;
  return data.find((row) => row.date === dividendDate)
    || [...data].reverse().find((row) => row.date <= dividendDate)
    || data[0];
}

export function buildHighDividendDiscordMessage(
  data: ETFDataRow[],
  notificationDate: string,
): string {
  const latest = data[data.length - 1];
  if (!latest) throw new Error('Discord通知に使用する563Aデータがありません。');
  const previousDividend = findPreviousDividendRow(data, latest);
  const previousDay = data[data.length - 2];
  const latestUnits = latest.nav > 0 ? latest.net_assets / latest.nav : 0;
  const previousUnits = previousDividend.nav > 0
    ? previousDividend.net_assets / previousDividend.nav
    : 0;
  const unitsChangePercent = previousUnits > 0
    ? ((latestUnits / previousUnits) - 1) * 100
    : 0;
  const sign = unitsChangePercent >= 0 ? '+' : '';
  const previousDayUnits = previousDay && previousDay.nav > 0
    ? previousDay.net_assets / previousDay.nav
    : 0;
  const dailyUnitsChangePercent = previousDayUnits > 0
    ? ((latestUnits / previousDayUnits) - 1) * 100
    : 0;
  const dailySign = dailyUnitsChangePercent >= 0 ? '+' : '';
  const dividendDate = previousDividend.date.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1/$2/$3');
  return [
    `${notificationDate}の563A`,
    `基準価額：${Math.round(latest.nav).toLocaleString('ja-JP')} (/100円)`,
    `純資産：${(latest.net_assets / 100_000_000).toFixed(2)} (億円)`,
    `総発行口数：${Math.round(latestUnits).toLocaleString('ja-JP')}(口)（前日比：${dailySign}${dailyUnitsChangePercent.toFixed(2)}%）`,
    `前回配当(${dividendDate})比 口数増減: **${sign}${unitsChangePercent.toFixed(2)}%**`,
    `URL：${FUND_URL}`,
    `MooView：${MOOVIEW_URL}`,
  ].join('\n');
}

async function runScheduledExtraction(clock: JapanClock): Promise<void> {
  const before = await readHighDividendAutomationState();
  if (before.lastScheduledFor === clock.scheduledFor) return;
  const running: HighDividendAutomationState = {
    ...before,
    lastScheduledFor: clock.scheduledFor,
    lastRunAt: new Date().toISOString(),
    lastRunStatus: 'running',
    lastRunMessage: '563Aの公式CSVを取得しています。',
  };
  await writeHighDividendAutomationState(running);
  let failureBaseState = running;
  try {
    const snapshot = await fetchHighDividendData();
    const latest = snapshot.data[snapshot.data.length - 1];
    if (!latest) throw new Error('取得データが空です。');
    const nextState: HighDividendAutomationState = {
      ...running,
      lastFetchedDataDate: latest.date,
    };
    failureBaseState = nextState;
    if (before.lastNotifiedDataDate && latest.date <= before.lastNotifiedDataDate) {
      await writeHighDividendAutomationState({
        ...nextState,
        lastRunStatus: 'skipped',
        lastRunMessage: `新しい基準日のデータはありません（最新 ${latest.date}）。`,
      });
      return;
    }
    const webhookUrl = process.env.HIGH_DIVIDEND_DISCORD_WEBHOOK_URL?.trim() || '';
    if (!webhookUrl) {
      throw new Error('高配当シミュレーター用Discord Webhook URLが設定されていません。');
    }
    const charts = await renderHighDividendDiscordCharts(snapshot.data);
    await notifyDiscordTextAndFilesToWebhook(
      buildHighDividendDiscordMessage(snapshot.data, clock.date),
      charts,
      webhookUrl,
    );
    await writeHighDividendAutomationState({
      ...nextState,
      lastRunStatus: 'succeeded',
      lastRunMessage: `基準日${latest.date}の新規データをDiscordへ通知しました。`,
      lastNotifiedDataDate: latest.date,
    });
  } catch (error) {
    await writeHighDividendAutomationState({
      ...failureBaseState,
      lastRunStatus: 'failed',
      lastRunMessage: error instanceof Error ? error.message : '自動抽出に失敗しました。',
    });
    throw error;
  }
}

export async function triggerHighDividendAutomation(): Promise<HighDividendAutomationPayload> {
  const clock = getJapanClock();
  await runScheduledExtraction({
    ...clock,
    scheduledFor: `manual:${new Date().toISOString()}`,
  });
  return automationPayload();
}

async function runSchedulerTick(): Promise<void> {
  if (schedulerTickInFlight) return;
  schedulerTickInFlight = true;
  try {
    const settings = await readHighDividendAutomationSettings();
    if (!settings.enabled) return;
    const clock = getJapanClock();
    if (clock.time !== settings.time) return;
    if (settings.weekdaysOnly && (clock.day === 0 || clock.day === 6)) return;
    await runScheduledExtraction(clock);
  } catch (error) {
    console.error('高配当シミュレーターの自動抽出に失敗しました。', error instanceof Error ? error.message : error);
  } finally {
    schedulerTickInFlight = false;
  }
}

async function automationPayload(): Promise<HighDividendAutomationPayload> {
  return {
    settings: await readHighDividendAutomationSettings(),
    state: await readHighDividendAutomationState(),
    webhookConfigured: Boolean(process.env.HIGH_DIVIDEND_DISCORD_WEBHOOK_URL?.trim()),
  };
}

export function registerHighDividendRoutes(app: Express): void {
  app.get('/api/fetch-etf-data', async (_request, response) => {
    try {
      const snapshot = await fetchHighDividendData();
      response.json({
        success: true,
        source: snapshot.source,
        count: snapshot.data.length,
        data: snapshot.data,
        fetchedAt: snapshot.fetchedAt,
      });
    } catch (error) {
      const cached = await readHighDividendSnapshot().catch(() => null);
      response.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'データ取得に失敗しました。',
        cachedData: cached?.data || null,
        fetchedAt: cached?.fetchedAt || null,
      });
    }
  });

  app.get('/api/high-dividend/data', async (_request, response) => {
    try {
      const snapshot = await readHighDividendSnapshot();
      response.json(snapshot || { source: CSV_URL, fetchedAt: null, data: [] });
    } catch (error) {
      response.status(500).json({
        error: error instanceof Error ? error.message : '保存済み563Aデータを読み込めませんでした。',
      });
    }
  });

  app.get('/api/high-dividend/automation', async (_request, response) => {
    try {
      response.json(await automationPayload());
    } catch (error) {
      response.status(500).json({
        error: error instanceof Error ? error.message : '自動抽出設定を読み込めませんでした。',
      });
    }
  });

  app.put('/api/high-dividend/automation', async (request, response) => {
    try {
      await writeHighDividendAutomationSettings(request.body?.settings ?? request.body);
      response.json(await automationPayload());
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : '自動抽出設定を保存できませんでした。',
      });
    }
  });

  app.post('/api/high-dividend/automation/run', async (_request, response) => {
    try {
      response.json(await triggerHighDividendAutomation());
    } catch (error) {
      response.status(500).json({
        error: error instanceof Error ? error.message : '自動抽出を手動実行できませんでした。',
      });
    }
  });
}

export function startHighDividendScheduler(): void {
  if (process.env.MOOVIEW_HIGH_DIVIDEND_AUTOMATION_ENABLED === 'false' || schedulerTimer) return;
  const tick = () => void runSchedulerTick();
  schedulerTimer = setInterval(tick, SCHEDULER_INTERVAL_MS);
  tick();
  console.log(`高配当シミュレーター自動抽出を開始しました（${JAPAN_TIME_ZONE}）。`);
}
