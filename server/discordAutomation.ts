import { chromium, type Page } from 'playwright';

import {
  isDiscordAutomationDaySelected,
  type DiscordAutomationArtifact,
  type DiscordAutomationArtifacts,
  type DiscordAutomationJob,
  type DiscordAutomationPreparation,
  type DiscordAutomationRunRecord,
} from '../discordAutomation';
import { notifyDiscordWithAutomationArtifacts } from './discordNotifier';
import {
  readDiscordAutomationRuns,
  readDiscordAutomationSettings,
  writeDiscordAutomationRuns,
} from './discordAutomationStore';

const JAPAN_TIME_ZONE = 'Asia/Tokyo';
const SCHEDULER_INTERVAL_MS = 15_000;
const AUTOMATION_BROWSER_TIMEOUT_MS = 12 * 60_000;
const SCHEDULED_RETRY_DELAY_MS = 10 * 60_000;
const SCHEDULED_RETRY_WINDOW_MS = 45 * 60_000;
const STALE_RUN_AFTER_MS = AUTOMATION_BROWSER_TIMEOUT_MS + 60_000;

interface JapanClock {
  scheduledFor: string;
  day: number;
  time: string;
}

interface AutomationSchedulerOptions {
  port: number;
}

let schedulerTimer: NodeJS.Timeout | null = null;
let schedulerTickInFlight = false;
let activeRun = false;
let retryPreparationInFlight = false;

function createRunId(): string {
  return `discord-run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
  const weekday = value('weekday');
  const day = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[weekday] ?? 0;
  const year = value('year');
  const month = value('month');
  const date = value('day');
  const hour = value('hour');
  const minute = value('minute');
  return {
    scheduledFor: `${year}-${month}-${date}T${hour}:${minute}:00+09:00`,
    day,
    time: `${hour}:${minute}`,
  };
}

function getAutomationBaseUrl(port: number): string {
  const configured = process.env.MOOVIEW_AUTOMATION_BASE_URL?.trim();
  if (configured) {
    const url = new URL(configured);
    if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
      throw new Error('MOOVIEW_AUTOMATION_BASE_URLはローカルURLだけを指定できます。');
    }
    return url.origin;
  }
  return `http://127.0.0.1:${port}`;
}

function validateArtifacts(value: unknown): DiscordAutomationArtifacts {
  if (!value || typeof value !== 'object') {
    throw new Error('チャート出力結果を取得できませんでした。');
  }
  const source = value as Partial<DiscordAutomationArtifacts>;
  const validFiles = (files: unknown): DiscordAutomationArtifacts['videos'] => (
    Array.isArray(files)
      ? files.filter((file): file is DiscordAutomationArtifacts['videos'][number] => (
        Boolean(file)
        && typeof file === 'object'
        && typeof (file as DiscordAutomationArtifacts['videos'][number]).name === 'string'
        && typeof (file as DiscordAutomationArtifacts['videos'][number]).mimeType === 'string'
        && typeof (file as DiscordAutomationArtifacts['videos'][number]).base64 === 'string'
      ))
      : []
  );
  const text = typeof source.text === 'string' ? source.text : '';
  const model = typeof source.model === 'string' ? source.model.trim() : '';
  const videos = validFiles(source.videos);
  const images = validFiles(source.images);
  if (!text.trim() || !model || videos.length === 0 || images.length === 0) {
    throw new Error('チャート出力結果が不足しています。');
  }
  return { text, model, videos, images };
}

function validatePreparation(value: unknown): DiscordAutomationPreparation {
  if (!value || typeof value !== 'object') {
    throw new Error('Discord自動通知のチャート準備結果を取得できませんでした。');
  }
  const source = value as Partial<DiscordAutomationPreparation>;
  const validPanelIds = (panelIds: unknown): string[] => (
    Array.isArray(panelIds)
      ? panelIds.filter((panelId): panelId is string => (
        typeof panelId === 'string' && panelId.length > 0 && panelId.length <= 160
      ))
      : []
  );
  const prompt = typeof source.prompt === 'string' ? source.prompt.trim() : '';
  const model = typeof source.model === 'string' ? source.model.trim() : '';
  const imagePanelIds = validPanelIds(source.imagePanelIds);
  const videoPanelIds = validPanelIds(source.videoPanelIds);
  if (!prompt || !model || imagePanelIds.length === 0 || videoPanelIds.length === 0) {
    throw new Error('Discord自動通知のチャート準備結果が不足しています。');
  }
  return {
    prompt,
    model: model as DiscordAutomationPreparation['model'],
    imagePanelIds,
    videoPanelIds,
    videoDurationSeconds: Number(source.videoDurationSeconds),
    videoFrameRate: source.videoFrameRate === 60 ? 60 : 30,
    videoResolutionId: source.videoResolutionId === 'landscape-720'
      || source.videoResolutionId === 'landscape-1080'
      ? source.videoResolutionId
      : 'square-720',
  };
}

async function captureRenderedChartScreenshots(
  page: Page,
  panelIds: string[],
): Promise<DiscordAutomationArtifact[]> {
  const allPanels = page.locator('[data-chart-export-panel-id]');
  const panelsById = new Map<string, ReturnType<typeof allPanels.nth>>();
  for (let index = 0; index < await allPanels.count(); index += 1) {
    const panel = allPanels.nth(index);
    const panelId = await panel.getAttribute('data-chart-export-panel-id');
    if (panelId) panelsById.set(panelId, panel);
  }

  const timestamp = Date.now();
  const artifacts: DiscordAutomationArtifact[] = [];
  for (let index = 0; index < panelIds.length; index += 1) {
    const panelId = panelIds[index];
    const panel = panelsById.get(panelId);
    if (!panel) {
      throw new Error('選択したDiscord添付チャートが見つかりません。');
    }
    const screenshot = await panel.screenshot({ type: 'png', animations: 'disabled' });
    artifacts.push({
      name: `mooview-chart-${String(index + 1).padStart(2, '0')}-${timestamp}.png`,
      mimeType: 'image/png',
      base64: screenshot.toString('base64'),
    });
  }
  return artifacts;
}

async function refreshChartsForScheduledRetryInBrowser(
  port: number,
  job: DiscordAutomationJob,
): Promise<void> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1_920, height: 1_080 },
      deviceScaleFactor: 1,
    });
    page.setDefaultTimeout(AUTOMATION_BROWSER_TIMEOUT_MS);
    await page.goto(`${getAutomationBaseUrl(port)}/?discordAutomation=1`, {
      waitUntil: 'domcontentloaded',
      timeout: AUTOMATION_BROWSER_TIMEOUT_MS,
    });
    await page.waitForFunction(
      () => Boolean(window.mooviewDiscordAutomation?.refresh),
      undefined,
      { timeout: AUTOMATION_BROWSER_TIMEOUT_MS },
    );
    await page.evaluate(async (scheduledJob) => {
      const bridge = window.mooviewDiscordAutomation;
      if (!bridge) throw new Error('Discord自動通知のブラウザ実行機能を初期化できませんでした。');
      await bridge.refresh(scheduledJob);
    }, job);
  } finally {
    await browser.close();
  }
}

async function createArtifactsInBrowser(
  port: number,
  job: DiscordAutomationJob,
): Promise<DiscordAutomationArtifacts> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1_920, height: 1_080 },
      deviceScaleFactor: 1,
    });
    page.setDefaultTimeout(AUTOMATION_BROWSER_TIMEOUT_MS);
    await page.goto(`${getAutomationBaseUrl(port)}/?discordAutomation=1`, {
      waitUntil: 'domcontentloaded',
      timeout: AUTOMATION_BROWSER_TIMEOUT_MS,
    });
    await page.waitForFunction(
      () => Boolean(
        window.mooviewDiscordAutomation?.prepare
        && window.mooviewDiscordAutomation?.complete,
      ),
      undefined,
      { timeout: AUTOMATION_BROWSER_TIMEOUT_MS },
    );
    const preparationResult = await page.evaluate(async (scheduledJob) => {
      const bridge = window.mooviewDiscordAutomation;
      if (!bridge) throw new Error('Discord自動通知のブラウザ実行機能を初期化できませんでした。');
      return bridge.prepare(scheduledJob);
    }, job);
    const preparation = validatePreparation(preparationResult);
    // SVGを再描画するのではなく、ブラウザ上の対象チャート要素を直接PNG化する。
    // Geminiにもこの同一PNGを渡すため、本文と添付チャートの内容が一致する。
    const screenshots = await captureRenderedChartScreenshots(page, preparation.imagePanelIds);
    const artifacts = await page.evaluate(async ({ preparedRun, capturedImages }) => {
      const bridge = window.mooviewDiscordAutomation;
      if (!bridge) throw new Error('Discord自動通知のブラウザ実行機能を初期化できませんでした。');
      return bridge.complete(preparedRun, capturedImages);
    }, { preparedRun: preparation, capturedImages: screenshots });
    return validateArtifacts(artifacts);
  } finally {
    await browser.close();
  }
}

async function runJobWithHistory(
  port: number,
  job: DiscordAutomationJob,
  scheduledFor: string,
  attempt = 0,
): Promise<void> {
  if (activeRun || retryPreparationInFlight) {
    throw new Error('別のDiscord自動通知を実行中です。');
  }
  activeRun = true;
  const startedAt = new Date().toISOString();
  const record: DiscordAutomationRunRecord = {
    id: createRunId(),
    jobId: job.id,
    scheduledFor,
    startedAt,
    completedAt: null,
    status: 'running',
    message: attempt > 0
      ? '再試行: チャートを更新し、60秒待機しています。'
      : 'チャートを更新し、60秒待機しています。',
    model: null,
    attempt,
  };
  try {
    let runs = await readDiscordAutomationRuns();
    runs = [record, ...runs];
    await writeDiscordAutomationRuns(runs);
    const artifacts = await createArtifactsInBrowser(port, job);
    record.message = 'DiscordへGemini本文、動画、画像の順で送信しています。';
    record.model = artifacts.model;
    runs = [record, ...(await readDiscordAutomationRuns()).filter((item) => item.id !== record.id)];
    await writeDiscordAutomationRuns(runs);
    await notifyDiscordWithAutomationArtifacts(artifacts.text, artifacts.videos, artifacts.images);
    record.status = 'succeeded';
    record.message = `Discordへの通知が完了しました（動画${artifacts.videos.length}本、画像${artifacts.images.length}枚）。`;
  } catch (error) {
    record.status = 'failed';
    record.message = error instanceof Error ? error.message.slice(0, 1_000) : 'Discord自動通知に失敗しました。';
    throw error;
  } finally {
    record.completedAt = new Date().toISOString();
    try {
      const runs = [record, ...(await readDiscordAutomationRuns()).filter((item) => item.id !== record.id)];
      await writeDiscordAutomationRuns(runs);
    } catch (historyError) {
      console.error(
        'Discord自動通知履歴の保存に失敗しました。',
        historyError instanceof Error ? historyError.message : historyError,
      );
    }
    activeRun = false;
  }
}

function getScheduledFor(clock: JapanClock, time: string): string {
  return `${clock.scheduledFor.slice(0, 10)}T${time}:00+09:00`;
}

function getScheduledTimestamp(scheduledFor: string): number {
  const value = Date.parse(scheduledFor);
  return Number.isFinite(value) ? value : Number.NaN;
}

function isWithinScheduledRetryWindow(scheduledFor: string, now: number): boolean {
  const scheduledAt = getScheduledTimestamp(scheduledFor);
  return Number.isFinite(scheduledAt)
    && now >= scheduledAt
    && now - scheduledAt <= SCHEDULED_RETRY_WINDOW_MS;
}

async function saveRunRecord(record: DiscordAutomationRunRecord): Promise<void> {
  const runs = [record, ...(await readDiscordAutomationRuns()).filter((item) => item.id !== record.id)];
  await writeDiscordAutomationRuns(runs);
}

async function prepareScheduledRetry(
  port: number,
  job: DiscordAutomationJob,
  failedRecord: DiscordAutomationRunRecord,
): Promise<void> {
  if (retryPreparationInFlight || failedRecord.retryScheduledAt) return;

  const preparedAt = new Date();
  failedRecord.retryPreparedAt = preparedAt.toISOString();
  failedRecord.retryScheduledAt = new Date(preparedAt.getTime() + SCHEDULED_RETRY_DELAY_MS).toISOString();
  failedRecord.message = '初回失敗。選択済みチャートを強制更新し、10分後に1回だけ自動再試行します。';
  await saveRunRecord(failedRecord);

  retryPreparationInFlight = true;
  try {
    await refreshChartsForScheduledRetryInBrowser(port, job);
    failedRecord.message = '初回失敗後のチャート強制更新が完了しました。10分後に1回だけ自動再試行します。';
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 700) : '不明なエラー';
    failedRecord.message = `初回失敗後のチャート強制更新にも失敗しました。予定どおり10分後に1回だけ再試行します: ${detail}`;
  } finally {
    retryPreparationInFlight = false;
    await saveRunRecord(failedRecord);
  }
}

async function markStaleRunAsFailed(
  record: DiscordAutomationRunRecord,
  now: number,
): Promise<void> {
  record.status = 'failed';
  record.completedAt = new Date(now).toISOString();
  record.message = '実行中のまま停止したため、失敗として再試行の対象にしました。';
  await saveRunRecord(record);
}

async function recoverStaleRunRecords(now: number): Promise<void> {
  const records = await readDiscordAutomationRuns();
  const staleRecords = records.filter((record) => {
    if (record.status !== 'running') return false;
    const startedAt = Date.parse(record.startedAt);
    return !Number.isFinite(startedAt) || now - startedAt >= STALE_RUN_AFTER_MS;
  });
  if (staleRecords.length === 0) return;

  const completedAt = new Date(now).toISOString();
  staleRecords.forEach((record) => {
    record.status = 'failed';
    record.completedAt = completedAt;
    record.message = 'サーバー再起動などで実行中のまま停止したため、失敗として確定しました。';
  });
  await writeDiscordAutomationRuns(records);
}

async function processScheduledJob(
  port: number,
  job: DiscordAutomationJob,
  scheduledFor: string,
  now: number,
): Promise<void> {
  let records = (await readDiscordAutomationRuns()).filter((record) => (
    record.jobId === job.id && record.scheduledFor === scheduledFor
  ));
  if (records.some((record) => record.status === 'succeeded')) return;

  const runningRecord = records.find((record) => record.status === 'running');
  if (runningRecord) {
    const startedAt = Date.parse(runningRecord.startedAt);
    if (!Number.isFinite(startedAt) || now - startedAt < STALE_RUN_AFTER_MS) return;
    await markStaleRunAsFailed(runningRecord, now);
    records = (await readDiscordAutomationRuns()).filter((record) => (
      record.jobId === job.id && record.scheduledFor === scheduledFor
    ));
  }

  const failedRecords = records.filter((record) => record.status === 'failed');
  if (failedRecords.length === 0) {
    await runJobWithHistory(port, job, scheduledFor);
    return;
  }
  // 再試行は一度だけに固定する。2回目も失敗した場合は履歴を残して停止する。
  if (failedRecords.length >= 2) return;

  const firstFailure = failedRecords.sort((left, right) => (
    Date.parse(left.startedAt) - Date.parse(right.startedAt)
  ))[0];
  if (!firstFailure.retryScheduledAt) {
    await prepareScheduledRetry(port, job, firstFailure);
    return;
  }

  const retryAt = Date.parse(firstFailure.retryScheduledAt);
  if (!Number.isFinite(retryAt) || now < retryAt) return;
  await runJobWithHistory(port, job, scheduledFor, 1);
}

async function runSchedulerTick(port: number): Promise<void> {
  if (schedulerTickInFlight || activeRun || retryPreparationInFlight) return;
  schedulerTickInFlight = true;
  try {
    const now = Date.now();
    await recoverStaleRunRecords(now);
    const settings = await readDiscordAutomationSettings();
    if (!settings.discordEnabled) return;
    const clock = getJapanClock();
    const dueJobs = settings.jobs.flatMap((job) => (
      job.enabled && isDiscordAutomationDaySelected(job.days, clock.day)
        ? job.times.map((time) => ({ job, scheduledFor: getScheduledFor(clock, time) }))
        : []
    )).filter(({ scheduledFor }) => isWithinScheduledRetryWindow(scheduledFor, now));
    for (const { job, scheduledFor } of dueJobs) {
      await processScheduledJob(port, job, scheduledFor, now);
    }
  } catch (error) {
    console.error('Discord自動通知のスケジュール実行に失敗しました。', error instanceof Error ? error.message : error);
  } finally {
    schedulerTickInFlight = false;
  }
}

export function startDiscordAutomationScheduler(options: AutomationSchedulerOptions): void {
  if (process.env.MOOVIEW_DISCORD_AUTOMATION_ENABLED === 'false' || schedulerTimer) return;
  const tick = () => {
    void runSchedulerTick(options.port);
  };
  schedulerTimer = setInterval(tick, SCHEDULER_INTERVAL_MS);
  tick();
  console.log(`Discord自動通知スケジューラを開始しました（${JAPAN_TIME_ZONE}）。`);
}

export function triggerDiscordAutomationJob(port: number, job: DiscordAutomationJob): Promise<void> {
  return runJobWithHistory(port, job, `manual:${new Date().toISOString()}`);
}
