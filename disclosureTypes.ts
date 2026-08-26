import {
  DEFAULT_GEMINI_CHART_MODEL,
  normalizeGeminiChartModelId,
  type GeminiChartModelId,
} from './geminiModels';

export const DISCLOSURE_TAGS = [
  '短信',
  '決算説明',
  '適時開示',
  '上方修正',
  '下方修正',
  '業績修正',
  '増配',
  '自己株買い',
  '有報',
  'NOISE',
  'その他',
] as const;

export const DEFAULT_DISCLOSURE_NOISE_KEYWORDS = [
  '収益分配金見込額',
  'ETFの収益分配金',
  '譲渡制限付株式報酬',
  '株式報酬としての自己株式',
  '株式報酬としての新株式',
] as const;

export type DisclosureTag = typeof DISCLOSURE_TAGS[number];
export type DisclosureSource = 'edinet' | 'edinet-db' | 'tdnet' | 'tdnet-scrape';
export type DisclosureSourceGroup = 'edinet' | 'tdnet';

export const DEFAULT_DISCLOSURE_GEMINI_PROMPT = `あなたは日本株の企業開示を読むアナリストです。
添付されたPDFを読み、投資家が短時間で重要点を把握できる日本語要約を作成してください。

次の順序で出力してください。
1. 開示の結論
2. 重要な数値・変更点
3. 業績・財務・株主への影響
4. 今後確認すべき点

推測と事実を明確に分け、資料にない数値を作らないでください。
訂正資料の場合は、訂正前後の差を優先して説明してください。`;

export const DEFAULT_TDNET_GEMINI_PROMPT = `あなたは日本株の適時開示を読むアナリストです。
添付されたTDNET資料を読み、株価への影響を短時間で判断できる日本語要約を作成してください。

次の順序で出力してください。
1. 開示の結論
2. ポジティブ・ネガティブ・中立の判定と理由
3. 重要な数値・業績予想・配当・自己株式の変更点
4. 株価と株主への想定影響
5. 今後確認すべき点

推測と事実を明確に分け、資料にない数値を作らないでください。
訂正資料の場合は、訂正前後の差を優先して説明してください。`;

export interface DisclosureSettings {
  newDisclosureNotificationsEnabled: boolean;
  tdnetDisclosureNotificationsEnabled: boolean;
  summaryNotificationsEnabled: boolean;
  geminiPrompt: string;
  tdnetGeminiPrompt: string;
  geminiModel: GeminiChartModelId;
  edinetPollMinutes: number;
  edinetDbPollMinutes: number;
  tdnetPollMinutes: number;
  tdnetScrapePollMinutes: number;
  backfillDays: number;
  noiseFilterKeywords: string[];
}

export interface DisclosureApiSettings extends DisclosureSettings {
  apiConfigured: {
    edinet: boolean;
    edinetDb: boolean;
    tdnet: boolean;
    gemini: boolean;
    discord: boolean;
  };
}

export interface DisclosureListItem {
  id: number;
  source: DisclosureSource;
  sourceDocumentId: string;
  companyId: number | null;
  companyName: string;
  edinetCode: string | null;
  secCode: string | null;
  tickerCode: string | null;
  title: string;
  tag: DisclosureTag;
  publishedAt: string;
  discoveredAt: string;
  documentUrl: string | null;
  downloadUrl: string | null;
  sourceUrl: string | null;
  irUrl: string | null;
  edinetDbCompanyUrl: string | null;
  buffettCodeUrl: string | null;
  pdfAvailable: boolean;
  isLargeCap: boolean;
  companyNotifyEnabled: boolean;
  edinetCompanyNotifyEnabled: boolean;
  tdnetCompanyNotifyEnabled: boolean;
  summaryText: string | null;
  summaryModel: string | null;
  summaryUpdatedAt: string | null;
}

export interface DisclosureListResponse {
  items: DisclosureListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DisclosureCompany {
  id: number;
  name: string;
  edinetCode: string | null;
  secCode: string | null;
  tickerCode: string | null;
  irUrl: string | null;
  buffettCodeUrl: string | null;
  topix100: boolean;
  nikkei225: boolean;
  isLargeCap: boolean;
  notifyEnabled: boolean;
  edinetNotifyEnabled: boolean;
  tdnetNotifyEnabled: boolean;
  updatedAt: string;
}

export interface DisclosureSyncSourceStatus {
  configured: boolean;
  running: boolean;
  baselineComplete: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}

export interface DisclosureSyncStatus {
  databasePath: string;
  largeCapCount: number;
  disclosureCount: number;
  sources: {
    edinet: DisclosureSyncSourceStatus;
    edinetDb: DisclosureSyncSourceStatus;
    tdnet: DisclosureSyncSourceStatus;
    tdnetScrape: DisclosureSyncSourceStatus;
  };
}

export interface DisclosureSyncRunSourceResult {
  source: DisclosureSource;
  configured: boolean;
  status: 'completed' | 'not-configured' | 'failed';
  processed: number;
  added: number;
  error: string | null;
}

export interface DisclosureSyncRunResult {
  message: string;
  processed: number;
  added: number;
  pruned: number;
  disclosureCount: number;
  backfillDays: number;
  startedAt: string;
  completedAt: string;
  sources: DisclosureSyncRunSourceResult[];
}

export interface DisclosureSearchRefreshResult {
  message: string;
  query: string;
  matchedCompanies: number;
  processed: number;
  added: number;
  pruned: number;
  disclosureCount: number;
}

export const DEFAULT_DISCLOSURE_SETTINGS: DisclosureSettings = {
  newDisclosureNotificationsEnabled: false,
  tdnetDisclosureNotificationsEnabled: false,
  summaryNotificationsEnabled: false,
  geminiPrompt: DEFAULT_DISCLOSURE_GEMINI_PROMPT,
  tdnetGeminiPrompt: DEFAULT_TDNET_GEMINI_PROMPT,
  geminiModel: DEFAULT_GEMINI_CHART_MODEL,
  edinetPollMinutes: 5,
  edinetDbPollMinutes: 30,
  tdnetPollMinutes: 5,
  tdnetScrapePollMinutes: 1,
  backfillDays: 100,
  noiseFilterKeywords: [...DEFAULT_DISCLOSURE_NOISE_KEYWORDS],
};

function clampInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(numeric)));
}

export function normalizeDisclosureSettings(value: unknown): DisclosureSettings {
  const source = value && typeof value === 'object'
    ? value as Partial<DisclosureSettings>
    : {};
  const prompt = typeof source.geminiPrompt === 'string'
    ? source.geminiPrompt.trim().slice(0, 30_000)
    : '';
  const tdnetPrompt = typeof source.tdnetGeminiPrompt === 'string'
    ? source.tdnetGeminiPrompt.trim().slice(0, 30_000)
    : '';
  const noiseFilterKeywords = Array.isArray(source.noiseFilterKeywords)
    ? Array.from(new Set(source.noiseFilterKeywords
        .filter((keyword): keyword is string => typeof keyword === 'string')
        .map((keyword) => keyword.trim().slice(0, 100))
        .filter(Boolean)))
        .slice(0, 100)
    : [...DEFAULT_DISCLOSURE_NOISE_KEYWORDS];
  return {
    newDisclosureNotificationsEnabled: source.newDisclosureNotificationsEnabled === true,
    tdnetDisclosureNotificationsEnabled: source.tdnetDisclosureNotificationsEnabled === true,
    summaryNotificationsEnabled: source.summaryNotificationsEnabled === true,
    geminiPrompt: prompt || DEFAULT_DISCLOSURE_GEMINI_PROMPT,
    tdnetGeminiPrompt: tdnetPrompt || DEFAULT_TDNET_GEMINI_PROMPT,
    geminiModel: normalizeGeminiChartModelId(source.geminiModel),
    edinetPollMinutes: clampInteger(source.edinetPollMinutes, 5, 1, 180),
    edinetDbPollMinutes: clampInteger(source.edinetDbPollMinutes, 30, 5, 720),
    tdnetPollMinutes: clampInteger(source.tdnetPollMinutes, 5, 1, 180),
    tdnetScrapePollMinutes: clampInteger(source.tdnetScrapePollMinutes, 1, 1, 60),
    backfillDays: clampInteger(source.backfillDays, 100, 1, 365),
    noiseFilterKeywords,
  };
}
