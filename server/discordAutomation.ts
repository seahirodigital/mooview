import { chromium, type Page } from 'playwright';

import {
  DISCORD_AUTOMATION_FOOTER_HASHTAGS,
  isDiscordAutomationDaySelected,
  type DiscordAutomationArtifact,
  type DiscordAutomationArtifacts,
  type DiscordAutomationJob,
  type DiscordAutomationPreparation,
  type DiscordAutomationRunRecord,
} from '../discordAutomation';
import { generateGeminiContent } from './geminiHandler';
import { notifyDiscordWithAutomationArtifacts } from './discordNotifier';
import {
  readDiscordAutomationRuns,
  readDiscordAutomationSettings,
  writeDiscordAutomationRuns,
} from './discordAutomationStore';

const JAPAN_TIME_ZONE = 'Asia/Tokyo';
const SCHEDULER_INTERVAL_MS = 15_000;
const AUTOMATION_BROWSER_TIMEOUT_MS = 8 * 60_000;
const AUTOMATION_BRIDGE_TIMEOUT_MS = 45_000;
const AUTOMATION_CHART_PREPARATION_TIMEOUT_MS = 125_000;
// 動画生成やブラウザ側Gemini処理が停止しても、取得済み画像の通知を止めない。
const AUTOMATION_COMPLETION_TIMEOUT_MS = 60_000;

function normalizeAutomationDiscordText(text: string, job: DiscordAutomationJob): string {
  // Geminiの既存プロンプトに末尾タグが含まれていても、定時3通知の語尾は必ず同じタグ列へ揃える。
  let body = text.trim().replace(/(?:\s*#[\p{L}\p{N}_-]+)+\s*$/u, '').trim();
  if (job.id === 'us-market-sector') {
    // 朝7時はテンプレートの古い日本株見出しを残さず、米国株分析として明示する。
    body = body.replace(
      /^\s*#(?:日本株\s*フロー分析|米国市場\s*セクターフロー|米国株\s*フロー分析)\s*/u,
      '',
    ).trim();
    body = `#米国株 フロー分析\n${body}`;
  }
  return `${body}\n\n${DISCORD_AUTOMATION_FOOTER_HASHTAGS}`;
}

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
  if (!text.trim() || !model || (videos.length === 0 && images.length === 0)) {
    throw new Error('チャート出力結果が不足しています。');
  }
  return { text, model, videos, images };
}

function validatePreparation(value: unknown): DiscordAutomationPreparation {
  if (!value || typeof value !== 'object') {
    throw new Error('Discord自動通知のチャート準備結果を取得できませんでした。');
  }
  const source = value as Partial<DiscordAutomationPreparation>;
  const panelIds = (value: unknown): string[] => (
    Array.isArray(value)
      ? value.filter((panelId): panelId is string => typeof panelId === 'string' && panelId.length > 0)
      : []
  );
  const prompt = typeof source.prompt === 'string' ? source.prompt.trim() : '';
  const model = typeof source.model === 'string' ? source.model.trim() : '';
  const imagePanelIds = panelIds(source.imagePanelIds);
  const videoPanelIds = panelIds(source.videoPanelIds);
  if (!prompt || !model || (imagePanelIds.length === 0 && videoPanelIds.length === 0)) {
    throw new Error('Discord自動通知のチャート準備結果が不足しています。');
  }
  return {
    prompt,
    model: model as DiscordAutomationPreparation['model'],
    imagePanelIds,
    videoPanelIds,
    sendImagesToGemini: source.sendImagesToGemini !== false,
    sendVideosToGemini: source.sendVideosToGemini === true,
    videoDurationSeconds: Number(source.videoDurationSeconds),
    videoFrameRate: source.videoFrameRate === 60 ? 60 : 30,
    videoResolutionId: source.videoResolutionId === 'landscape-720'
      || source.videoResolutionId === 'landscape-1080'
      ? source.videoResolutionId
      : 'square-720',
  };
}

interface CapturedScreenshots {
  panelIds: string[];
  artifacts: DiscordAutomationArtifact[];
}

function withTimeout<T>(operation: Promise<T>, milliseconds: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      console.warn(`Discord自動通知: ${label}の上限${milliseconds}msに到達しました。`);
      reject(new Error(`${label}の上限時間を超過しました。`));
    }, milliseconds);
    void operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function createFallbackArtifacts(
  page: Page,
  job: DiscordAutomationJob,
): Promise<DiscordAutomationArtifacts> {
  const screenshot = await page.screenshot({
    type: 'png',
    timeout: 10_000,
    animations: 'disabled',
  });
  const image: DiscordAutomationArtifact = {
    name: `mooview-chart-fallback-${Date.now()}.png`,
    mimeType: 'image/png',
    base64: screenshot.toString('base64'),
  };
  const prompt = job.prompt.trim();
  if (!prompt) throw new Error('Discord自動通知のGeminiプロンプトが空です。');
  const result = await generateGeminiContent(
    prompt,
    [{ mimeType: image.mimeType, data: image.base64 }],
    job.model,
  );
  return { text: result.text, model: result.model, videos: [], images: [image] };
}

async function createArtifactsFromCapturedImages(
  images: DiscordAutomationArtifact[],
  preparation: DiscordAutomationPreparation,
): Promise<DiscordAutomationArtifacts> {
  if (images.length === 0) {
    throw new Error('フォールバックに使用できるチャート画像がありません。');
  }
  const result = await generateGeminiContent(
    preparation.prompt,
    images.map((image) => ({ mimeType: image.mimeType, data: image.base64 })),
    preparation.model,
  );
  return { text: result.text, model: result.model, videos: [], images };
}

async function captureVisibleChartScreenshots(
  page: Page,
  panelIds: string[],
): Promise<CapturedScreenshots> {
  const allPanels = page.locator('[data-chart-export-panel-id]');
  const panelsById = new Map<string, ReturnType<typeof allPanels.nth>>();
  for (let index = 0; index < await allPanels.count(); index += 1) {
    const panel = allPanels.nth(index);
    const panelId = await panel.getAttribute('data-chart-export-panel-id');
    if (panelId) panelsById.set(panelId, panel);
  }

  const timestamp = Date.now();
  const capturedPanelIds: string[] = [];
  const artifacts: DiscordAutomationArtifact[] = [];
  for (const panelId of panelIds) {
    try {
      const panel = panelsById.get(panelId);
      if (!panel) throw new Error('パネルが見つかりません。');
      const box = await panel.boundingBox({ timeout: 5_000 });
      if (!box || box.width < 2 || box.height < 2) throw new Error('パネルが表示されていません。');
      // Locator.screenshotは描画の安定を待ち続けるため、現在の画面ピクセルをそのまま取得する。
      const screenshot = await page.screenshot({
        type: 'png',
        clip: { x: box.x, y: box.y, width: box.width, height: box.height },
        timeout: 8_000,
      });
      capturedPanelIds.push(panelId);
      artifacts.push({
        name: `mooview-chart-${String(capturedPanelIds.length).padStart(2, '0')}-${timestamp}.png`,
        mimeType: 'image/png',
        base64: screenshot.toString('base64'),
      });
    } catch (error) {
      console.warn(
        `Discord自動通知: ${panelId} の画像取得を除外します。`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return { panelIds: capturedPanelIds, artifacts };
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
    let capturedImages: DiscordAutomationArtifact[] = [];
    let capturedPreparation: DiscordAutomationPreparation | null = null;
    console.log('Discord自動通知: ブラウザを起動しました。');
    const page = await browser.newPage({
      viewport: { width: 1_920, height: 1_080 },
      deviceScaleFactor: 1,
    });
    page.setDefaultTimeout(AUTOMATION_BROWSER_TIMEOUT_MS);
    try {
      await page.goto(`${getAutomationBaseUrl(port)}/?discordAutomation=1`, {
        waitUntil: 'domcontentloaded',
        timeout: AUTOMATION_BRIDGE_TIMEOUT_MS,
      });
      console.log('Discord自動通知: 自動実行ページを読み込みました。');
      await page.waitForFunction(
        () => Boolean(
          window.mooviewDiscordAutomation?.prepare
          && window.mooviewDiscordAutomation?.complete,
        ),
        undefined,
        { timeout: AUTOMATION_BRIDGE_TIMEOUT_MS },
      );
      console.log('Discord自動通知: ブラウザ実行ブリッジを確認しました。');
      const preparationResult = await withTimeout(
        page.evaluate(async (scheduledJob) => {
          const bridge = window.mooviewDiscordAutomation;
          if (!bridge?.prepare) throw new Error('Discord自動通知のブラウザ実行機能を初期化できませんでした。');
          return bridge.prepare(scheduledJob);
        }, job),
        AUTOMATION_CHART_PREPARATION_TIMEOUT_MS,
        'チャート準備',
      );
      console.log('Discord自動通知: チャート準備が完了しました。');
      const preparation = validatePreparation(preparationResult);
      const captured = await captureVisibleChartScreenshots(page, preparation.imagePanelIds);
      console.log(`Discord自動通知: 画像${captured.artifacts.length}枚を取得しました。`);
      if (captured.artifacts.length === 0 && preparation.videoPanelIds.length === 0) {
        throw new Error('Discord自動通知に使用できる表示済みチャートがありません。');
      }
      const preparedRun: DiscordAutomationPreparation = {
        ...preparation,
        imagePanelIds: captured.panelIds,
        sendImagesToGemini: preparation.sendImagesToGemini && captured.artifacts.length > 0,
        // 画像が1枚も取れなかった場合でも、選択済み動画をGeminiへ渡して通知を止めない。
        sendVideosToGemini: preparation.sendVideosToGemini
          || (captured.artifacts.length === 0 && preparation.videoPanelIds.length > 0),
      };
      capturedImages = captured.artifacts;
      capturedPreparation = preparedRun;
      const artifacts = await withTimeout(
        page.evaluate(async ({ preparedRun, capturedImages }) => {
        const bridge = window.mooviewDiscordAutomation;
        if (!bridge?.complete) throw new Error('Discord自動通知のブラウザ実行機能を初期化できませんでした。');
        return bridge.complete(preparedRun, capturedImages);
        }, { preparedRun, capturedImages: captured.artifacts }),
        AUTOMATION_COMPLETION_TIMEOUT_MS,
        '動画生成またはGemini分析',
      );
      console.log('Discord自動通知: Gemini分析と動画作成が完了しました。');
      return validateArtifacts(artifacts);
    } catch (error) {
      console.warn(
        'Discord自動通知: 完全なチャート準備を中止し、現在表示中の画面だけで通知します。',
        error instanceof Error ? error.message : error,
      );
      if (capturedPreparation?.sendImagesToGemini && capturedImages.length > 0) {
        console.log(`Discord自動通知: 取得済み画像${capturedImages.length}枚をGeminiへ送信します。`);
        return createArtifactsFromCapturedImages(capturedImages, capturedPreparation);
      }
      console.log('Discord自動通知: フォールバックPNGをGeminiへ送信します。');
      return createFallbackArtifacts(page, job);
    }
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
    message: 'チャートを更新し、最大120秒待機しています。未取得分は除外して送信します。',
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
    await notifyDiscordWithAutomationArtifacts(
      normalizeAutomationDiscordText(artifacts.text, job),
      artifacts.videos,
      artifacts.images,
    );
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
