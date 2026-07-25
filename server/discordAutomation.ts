import { chromium } from 'playwright';

import {
  isDiscordAutomationDaySelected,
  type DiscordAutomationArtifacts,
  type DiscordAutomationJob,
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
const AUTOMATION_BROWSER_TIMEOUT_MS = 8 * 60_000;

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
      () => Boolean(window.mooviewDiscordAutomation?.run),
      undefined,
      { timeout: AUTOMATION_BROWSER_TIMEOUT_MS },
    );
    const artifacts = await page.evaluate(async (scheduledJob) => {
      const bridge = window.mooviewDiscordAutomation;
      if (!bridge) throw new Error('Discord自動通知のブラウザ実行機能を初期化できませんでした。');
      return bridge.run(scheduledJob);
    }, job);
    return validateArtifacts(artifacts);
  } finally {
    await browser.close();
  }
}

async function runJobWithHistory(
  port: number,
  job: DiscordAutomationJob,
  scheduledFor: string,
): Promise<void> {
  if (activeRun) {
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
    message: 'チャートを更新し、60秒待機しています。',
    model: null,
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
    record.message = 'Discordへの通知が完了しました。';
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

async function runSchedulerTick(port: number): Promise<void> {
  if (schedulerTickInFlight || activeRun) return;
  schedulerTickInFlight = true;
  try {
    const settings = await readDiscordAutomationSettings();
    if (!settings.discordEnabled) return;
    const clock = getJapanClock();
    const dueJobs = settings.jobs.filter((job) => (
      job.enabled
      && job.times.includes(clock.time)
      && isDiscordAutomationDaySelected(job.days, clock.day)
    ));
    if (dueJobs.length === 0) return;

    const previousRuns = await readDiscordAutomationRuns();
    for (const job of dueJobs) {
      const alreadyHandled = previousRuns.some((record) => (
        record.jobId === job.id
        && record.scheduledFor === clock.scheduledFor
        && ['running', 'succeeded', 'failed'].includes(record.status)
      ));
      if (alreadyHandled) continue;
      await runJobWithHistory(port, job, clock.scheduledFor);
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
