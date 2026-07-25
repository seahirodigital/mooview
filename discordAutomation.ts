import {
  DEFAULT_GEMINI_CHART_MODEL,
  isGeminiChartModelId,
  type GeminiChartModelId,
} from './geminiModels';

export type DiscordAutomationDayMode = 'weekdays' | 'weekends' | 'everyday' | 'custom';
export type DiscordAutomationVideoResolution = 'square-720' | 'landscape-720' | 'landscape-1080';
export type DiscordAutomationVideoFrameRate = 30 | 60;

export interface DiscordAutomationSelection {
  mode: 'all' | 'custom';
  panelIds: string[];
}

export interface DiscordAutomationDays {
  mode: DiscordAutomationDayMode;
  customDays: number[];
}

export interface DiscordAutomationJob {
  id: string;
  name: string;
  enabled: boolean;
  days: DiscordAutomationDays;
  times: string[];
  prompt: string;
  model: GeminiChartModelId;
  // 右クリックのAI設定を、通知実行時に共有ワークスペースから読み取って使う。
  // false を明示した通知だけ、ここに保存した個別設定を固定で使用する。
  useCurrentChartAiSettings: boolean;
  imageSelection: DiscordAutomationSelection;
  videoSelection: DiscordAutomationSelection;
  videoDurationSeconds: number;
  videoFrameRate: DiscordAutomationVideoFrameRate;
  videoResolutionId: DiscordAutomationVideoResolution;
}

export interface DiscordAutomationSettings {
  schemaVersion: 1;
  discordEnabled: boolean;
  timezone: 'Asia/Tokyo';
  jobs: DiscordAutomationJob[];
}

export interface DiscordAutomationRunRecord {
  id: string;
  jobId: string;
  scheduledFor: string;
  startedAt: string;
  completedAt: string | null;
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  message: string;
  model: string | null;
}

export interface DiscordAutomationArtifact {
  name: string;
  mimeType: string;
  base64: string;
}

export interface DiscordAutomationArtifacts {
  text: string;
  model: string;
  videos: DiscordAutomationArtifact[];
  images: DiscordAutomationArtifact[];
}

export interface DiscordAutomationPreparation {
  prompt: string;
  model: GeminiChartModelId;
  imagePanelIds: string[];
  videoPanelIds: string[];
  videoDurationSeconds: number;
  videoFrameRate: DiscordAutomationVideoFrameRate;
  videoResolutionId: DiscordAutomationVideoResolution;
}

export const DEFAULT_DISCORD_AUTOMATION_PROMPT = `#日本株 フロー分析

添付した最新チャートを読み取り、強いセクター・弱いセクター・注目個別銘柄を簡潔に分析してください。本文だけを出力し、前置きは不要です。`;

export const DEFAULT_US_SECTOR_AUTOMATION_PROMPT = `#米国市場 セクターフロー分析

添付した最新チャートを読み取り、米国市場の強いセクター・弱いセクター・主要ETFと注目個別銘柄を簡潔に分析してください。本文だけを出力し、前置きは不要です。`;

const DEFAULT_SELECTION: DiscordAutomationSelection = {
  mode: 'all',
  panelIds: [],
};

function cloneSelection(selection: DiscordAutomationSelection = DEFAULT_SELECTION): DiscordAutomationSelection {
  return {
    mode: selection.mode,
    panelIds: [...selection.panelIds],
  };
}

function createDefaultJob(
  id: string,
  name: string,
  times: string[],
  prompt: string,
): DiscordAutomationJob {
  return {
    id,
    name,
    enabled: true,
    days: { mode: 'weekdays', customDays: [] },
    times,
    prompt,
    model: DEFAULT_GEMINI_CHART_MODEL,
    useCurrentChartAiSettings: true,
    imageSelection: cloneSelection(),
    videoSelection: cloneSelection(),
    videoDurationSeconds: 5,
    videoFrameRate: 30,
    videoResolutionId: 'square-720',
  };
}

export function createDefaultDiscordAutomationSettings(): DiscordAutomationSettings {
  return {
    schemaVersion: 1,
    // 利用者が最初に設定画面を開いた時点から、Discord通知は有効を既定にする。
    discordEnabled: true,
    timezone: 'Asia/Tokyo',
    jobs: [
      createDefaultJob(
        'japan-market-flow-1130',
        '日本市場フロー（11:30）',
        ['11:30'],
        DEFAULT_DISCORD_AUTOMATION_PROMPT,
      ),
      createDefaultJob(
        'japan-market-flow-1530',
        '日本市場フロー（15:30）',
        ['15:30'],
        DEFAULT_DISCORD_AUTOMATION_PROMPT,
      ),
      createDefaultJob(
        'us-market-sector',
        '米国市場セクター',
        ['07:00'],
        DEFAULT_US_SECTOR_AUTOMATION_PROMPT,
      ),
    ],
  };
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSelection(value: unknown): DiscordAutomationSelection {
  const source = isRecord(value) ? value : {};
  return {
    mode: source.mode === 'custom' ? 'custom' : 'all',
    panelIds: Array.isArray(source.panelIds)
      ? Array.from(new Set(source.panelIds.filter((panelId): panelId is string => (
        typeof panelId === 'string' && panelId.length > 0 && panelId.length <= 160
      )))).slice(0, 12)
      : [],
  };
}

function normalizeDays(value: unknown): DiscordAutomationDays {
  const source = isRecord(value) ? value : {};
  const mode: DiscordAutomationDayMode = (
    source.mode === 'weekends'
    || source.mode === 'everyday'
    || source.mode === 'custom'
  ) ? source.mode : 'weekdays';
  const customDays = Array.isArray(source.customDays)
    ? Array.from(new Set(source.customDays.filter((day): day is number => (
      typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6
    )))).sort((first, second) => first - second)
    : [];
  return { mode, customDays };
}

function normalizeJob(value: unknown, fallback: DiscordAutomationJob, index: number): DiscordAutomationJob {
  const source = isRecord(value) ? value : {};
  const times = Array.isArray(source.times)
    ? Array.from(new Set(source.times.filter((time): time is string => (
      typeof time === 'string' && TIME_PATTERN.test(time)
    )))).sort().slice(0, 12)
    : [...fallback.times];
  const model = isGeminiChartModelId(source.model) ? source.model : fallback.model;
  const prompt = typeof source.prompt === 'string' && source.prompt.trim()
    ? source.prompt.trim().slice(0, 30_000)
    : fallback.prompt;
  const name = typeof source.name === 'string' && source.name.trim()
    ? source.name.trim().slice(0, 80)
    : fallback.name;
  const id = typeof source.id === 'string' && /^[a-z0-9-]{2,80}$/i.test(source.id)
    ? source.id
    : `${fallback.id}-${index + 1}`;
  const duration = Number(source.videoDurationSeconds);
  return {
    id,
    name,
    enabled: source.enabled !== false,
    days: normalizeDays(source.days),
    times,
    prompt,
    model,
    useCurrentChartAiSettings: source.useCurrentChartAiSettings !== false,
    imageSelection: normalizeSelection(source.imageSelection),
    videoSelection: normalizeSelection(source.videoSelection),
    videoDurationSeconds: Number.isFinite(duration)
      ? Math.max(1, Math.min(30, Math.round(duration)))
      : fallback.videoDurationSeconds,
    videoFrameRate: source.videoFrameRate === 60 ? 60 : 30,
    videoResolutionId: source.videoResolutionId === 'landscape-720'
      || source.videoResolutionId === 'landscape-1080'
      ? source.videoResolutionId
      : 'square-720',
  };
}

export function normalizeDiscordAutomationSettings(value: unknown): DiscordAutomationSettings {
  const defaults = createDefaultDiscordAutomationSettings();
  const source = isRecord(value) ? value : {};
  const sourceJobs = Array.isArray(source.jobs) ? source.jobs : defaults.jobs;
  const jobs = sourceJobs
    .slice(0, 12)
    .map((job, index) => normalizeJob(job, defaults.jobs[index] || defaults.jobs[0], index));
  const uniqueJobIds = new Set<string>();
  const normalizedJobs = jobs.map((job, index) => {
    if (!uniqueJobIds.has(job.id)) {
      uniqueJobIds.add(job.id);
      return job;
    }
    const id = `${job.id}-${index + 1}`;
    uniqueJobIds.add(id);
    return { ...job, id };
  });
  return {
    schemaVersion: 1,
    discordEnabled: source.discordEnabled !== false,
    timezone: 'Asia/Tokyo',
    jobs: normalizedJobs.length > 0 ? normalizedJobs : defaults.jobs,
  };
}

export function isDiscordAutomationDaySelected(days: DiscordAutomationDays, day: number): boolean {
  if (days.mode === 'everyday') return true;
  if (days.mode === 'weekdays') return day >= 1 && day <= 5;
  if (days.mode === 'weekends') return day === 0 || day === 6;
  return days.customDays.includes(day);
}
