import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  Minus,
  Settings, 
  Trash2, 
  Database,
  LayoutGrid,
  Columns2,
  Rows2,
  Search,
  X,
  List,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Menu,
  Pencil,
  RotateCcw,
  Upload,
  Download,
  ArrowUpDown,
  Camera,
  Video,
  Square,
  Check,
  Copy,
  LoaderCircle,
  Bell,
  Clock3,
  BellRing
} from 'lucide-react';

import { Timeframe, ChartDisplayRange, ChartPanel, SymbolIndicatorSettings, TickerInfo, Candle, IndicatorLineStyle, ComparisonLabelLayoutMode } from './types';
import { DEFAULT_TICKERS, generateCandles, simulateTick } from './mockData';
import { InteractiveCustomChart } from './components/InteractiveCustomChart';
import { TradingViewWidget } from './components/TradingViewWidget';
import { IndicatorSettingsPanel } from './components/IndicatorSettingsPanel';
import { ValueChainMap } from './components/ValueChainMap';
import { MacroFlowMap, getMacroFlowDefaultWatchlistChain } from './components/MacroFlowMap';
import { DisclosureDatabase } from './components/DisclosureDatabase';
import { DisclosureSettingsPanel } from './components/DisclosureSettingsPanel';
import { WorkspaceMenuOverlay } from './components/WorkspaceMenuOverlay';
import { HighDividendApp } from './highDividend/App';
import { APP_VIEW_ORDER, type AppView } from './appView';
import {
  calculateExpressionQuote,
  combineExpressionCandles,
  formatSymbolExpression,
  parseSymbolExpression,
  SymbolExpression,
  combineBasketCandles,
  BasketComponent,
  calculateBasketQuote,
  BasketQuoteInput,
} from './symbolExpression';
import { getSeriesColor } from './chartSeriesColors';
import {
  CHART_EXPORT_FINAL_HOLD_SECONDS,
  CHART_EXPORT_RESOLUTIONS,
  ChartExportSelection,
  ChartImageExportSettings,
  ChartVideoExportSettings,
  DEFAULT_CHART_IMAGE_EXPORT_SETTINGS,
  DEFAULT_CHART_VIDEO_EXPORT_SETTINGS,
  downloadChartVideoFile,
  exportChartImage,
  exportChartVideo,
  normalizeChartImageExportSettings,
  normalizeChartVideoExportSettings,
  resolveChartExportPanelIds,
} from './chartExport';
import {
  ChartAiAnalysisResult,
  DEFAULT_CHART_AI_PROMPT,
  requestChartAiAnalysis,
} from './chartAi';
import {
  DEFAULT_GEMINI_CHART_MODEL,
  GEMINI_CHART_MODELS,
  GeminiChartModelId,
  normalizeGeminiChartModelId,
} from '../geminiModels';
import {
  createDefaultDiscordAutomationSettings,
  normalizeDiscordAutomationSettings,
  type DiscordAutomationJob,
  type DiscordAutomationArtifact,
  type DiscordAutomationPreparation,
  type DiscordAutomationRunRecord,
  type DiscordAutomationSelection,
  type DiscordAutomationSettings,
} from '../discordAutomation';
import './discordAutomationBridge';
import type {
  SharedWorkspaceEnvelope,
  SharedWorkspaceProfile,
  SharedWorkspaceSettings,
} from './workspaceSettings';

const DEFAULT_PANEL_HEIGHT = 840;
const DEFAULT_SIDEBAR_WIDTH = 420;
const MIN_SIDEBAR_WIDTH = 164;
const SIDEBAR_NAV_WIDTH = 44;
const DEFAULT_WATCHLIST_TAB_ID = 'watchlist-default';
const DEFAULT_WATCHLIST_SECTION_ID = 'section-default';
const WATCHLIST_TARGET_SEPARATOR = '::section::';
const INDICATOR_LINE_STYLES: IndicatorLineStyle[] = ['solid', 'dashed', 'dotted', 'dashdot'];

type SidebarView = 'watchlist' | 'indicators' | 'settings' | 'disclosures';
type MobileSheetView = SidebarView | 'image-export' | 'video-export';
type WatchlistColumnKey = 'symbol' | 'price' | 'change';
type SortDirection = 'asc' | 'desc';
type WatchlistImportMode = 'new-tab' | 'active-tab';
type WatchlistTransferMenuLayer = 'root' | 'import' | 'export';
type WatchlistQuoteFetchMode = 'manual' | 'auto';
type WatchlistQuoteFetchSource = 'manual' | 'auto';
type WatchlistTabDropPosition = 'before' | 'after';
type WorkspacePersistenceMode = 'checking' | 'local' | 'shared';
type DisplayTickerStat = TickerInfo & {
  currentPrice: number | null;
  computedChange: number | null;
  marketCap?: number;
};

const WATCHLIST_IMPORT_CONCURRENCY = 8;
const CANDLES_CACHE_STORAGE_KEY = 'tv_dashboard_candles_cache_v1';
const CANDLES_CACHE_META_STORAGE_KEY = 'tv_dashboard_candles_cache_meta_v1';
const CANDLES_CACHE_INDEXED_DB_NAME = 'mooview_chart_candles_cache_v1';
const CANDLES_CACHE_INDEXED_DB_STORE = 'values';
const CANDLES_CACHE_INDEXED_DB_CACHE_KEY = 'candles';
const CANDLES_CACHE_INDEXED_DB_META_KEY = 'meta';
const QUOTE_CACHE_INDEXED_DB_CACHE_KEY = 'quotes';
const CANDLES_CACHE_TTL_MS = 30_000;
const CANDLES_CACHE_MAX_LENGTH = 180;
const KLINE_FETCH_BATCH_LIMIT = 20;
const KLINE_FETCH_BATCH_COOLDOWN_MS = 30_000;
const DISCORD_AUTOMATION_KLINE_CONCURRENCY = 8;
const DISCORD_AUTOMATION_MIN_COMPARISON_READY_RATIO = 0.6;
// 定時通知は完全なローソク足を待ち続けない。更新開始から120秒で、画面に残る対象だけを送信する。
const DISCORD_AUTOMATION_CHART_READY_TIMEOUT_MS = 2 * 60_000;
const DISCORD_AUTOMATION_CHART_READY_POLL_MS = 1_000;
const KLINE_RATE_LIMIT_RETRY_MS = 30_000;
const WATCHLIST_QUOTE_BATCH_LIMIT = 80;
const WATCHLIST_QUOTE_RATE_LIMIT_RETRY_MS = 30_000;
const WATCHLIST_AUTO_QUOTE_REFRESH_INTERVAL_MS = 30_000;
const JAPAN_US_FETCH_PAUSE_START_MINUTES = 9 * 60;
const JAPAN_US_FETCH_PAUSE_END_MINUTES = 22 * 60 + 30;
const HEADER_TICKER_SYMBOLS_STORAGE_KEY = 'mooview_header_ticker_symbols_v1';
const VALUE_CHAIN_STORAGE_KEY = 'mooview_value_chain_map_v1';
const CHAIN_HISTORY_STORAGE_KEY = 'mooview_value_chain_history_v1';
const ACTIVE_CHAIN_HISTORY_ID_STORAGE_KEY = 'mooview_value_chain_active_history_id';
const VALUE_CHAIN_SYNC_EVENT = 'mooview:value-chain-map-updated';
const VALUE_CHAIN_CHART_STATE_STORAGE_KEY = 'mooview_value_chain_chart_state_v1';
const WATCHLIST_NAME_OVERRIDES_STORAGE_KEY = 'mooview_watchlist_name_overrides_v1';
const COMPARISON_LABEL_FONT_SIZE_STORAGE_KEY = 'mooview_comparison_label_font_size_v1';
const COMPARISON_LABEL_LAYOUT_MODE_STORAGE_KEY = 'mooview_comparison_label_layout_mode_v1';
const WATCHLIST_QUOTE_FETCH_MODES_STORAGE_KEY = 'mooview_watchlist_quote_fetch_modes_v1';
const CHART_VIDEO_EXPORT_SETTINGS_STORAGE_KEY = 'mooview_chart_video_export_settings_v1';
const CHART_IMAGE_EXPORT_SETTINGS_STORAGE_KEY = 'mooview_chart_image_export_settings_v1';
const CHART_AI_PROMPT_STORAGE_KEY = 'mooview_chart_ai_prompt_v1';
const CHART_AI_MODEL_STORAGE_KEY = 'mooview_chart_ai_model_v1';
const CHART_AI_SHARED_SETTING_KEYS = [
  CHART_AI_PROMPT_STORAGE_KEY,
  CHART_AI_MODEL_STORAGE_KEY,
] as const;
const DISCORD_AUTOMATION_SETTINGS_ENDPOINT = '/api/discord-automation/settings';
const DISCORD_AUTOMATION_RUNS_ENDPOINT = '/api/discord-automation/runs';
const SHARED_WORKSPACE_SETTINGS_ENDPOINT = '/api/workspace-settings';
const DEFAULT_OCI_SHARED_WORKSPACE_URL = 'https://mooview-oci.taild87712.ts.net';
const SHARED_WORKSPACE_SAVE_DELAY_MS = 800;
const SHARED_BROWSER_SETTING_KEYS = [
  'mooview_active_view',
  'mooview_header_ticker_symbols_v1',
  'mooview_value_chain_map_v1',
  'mooview_value_chain_history_v1',
  'mooview_value_chain_active_history_id',
  'mooview_value_chain_chart_state_v1',
  'mooview_value_chain_chart_panel_width',
  'mooview_value_chain_stock_font_size',
  'mooview_watchlist_name_overrides_v1',
  'mooview_comparison_label_font_size_v1',
  'mooview_comparison_label_layout_mode_v1',
  'mooview_watchlist_quote_fetch_modes_v1',
  'mooview_chart_video_export_settings_v1',
  'mooview_chart_image_export_settings_v1',
  ...CHART_AI_SHARED_SETTING_KEYS,
  'moomoo_active',
  'tv_dashboard_tickers',
  'tv_dashboard_watchlist_tabs',
  'tv_dashboard_active_watchlist_tab',
  'tv_dashboard_panels',
  'tv_dashboard_indicators',
  'tv_dashboard_focused_symbol',
  'tv_dashboard_panel_engines',
  'tv_dashboard_layout_style',
  'tv_dashboard_grid_rows',
  'tv_dashboard_grid_cols',
  'tv_dashboard_sidebar_open',
  'tv_dashboard_sidebar_view',
  'tv_dashboard_sidebar_width',
  'tv_dashboard_column_widths',
  'tv_dashboard_panel_heights',
  'tv_dashboard_watchlist_column_widths',
  'tv_dashboard_watchlist_show_name_column',
  'tv_dashboard_watchlist_sort',
] as const;
const DAY_RANGE_OVERVIEW_TIMEFRAME: Timeframe = '5m';
const WEEK_RANGE_OVERVIEW_TIMEFRAME: Timeframe = '30m';
const CHART_TIMEFRAME_OPTIONS: Timeframe[] = ['1m', '3m', '5m', '10m', '30m', '1h', '4h', '1d', '1w', '1mo'];
const JP_YAHOO_EFFECTIVE_TIMEFRAME_LABELS: Partial<Record<Timeframe, string>> = {
  '3m': '2m',
  '10m': '15m',
  '4h': '60m',
};
const DEFAULT_DISPLAY_RANGE: Exclude<ChartDisplayRange, null> = 'd';
const DAY_RANGE_ZOOM_FACTOR = 6.5;
const WEEK_RANGE_ZOOM_FACTOR = 6.5;
const DEFAULT_HEADER_TICKER_SYMBOLS = DEFAULT_TICKERS.slice(0, 6).map((ticker) => ticker.symbol);
const SYMBOL_NAME_ALIASES: Record<string, string> = {
  BRCM: 'AVGO',
  BROADCOM: 'AVGO',
  'BROADCOM INC': 'AVGO',
  'BROADCOM INC.': 'AVGO',
  QUALCOMM: 'QCOM',
  INTEL: 'INTC',
  ADEKA: 'JP.4401',
  MICRON: 'MU',
  NVIDIA: 'NVDA',
  'NVIDIA CORPORATION': 'NVDA',
  TSMC: 'TSM',
  'TAIWAN SEMICONDUCTOR': 'TSM',
  'TAIWAN SEMICONDUCTOR MANUFACTURING': 'TSM',
  'APPLIED MATERIALS': 'AMAT',
  'LAM RESEARCH': 'LRCX',
  'KLA': 'KLAC',
  US10Y: 'IEF',
  'US10Y.BD': 'IEF',
  USDJPY: 'YCS',
  'USD/JPY': 'YCS',
  XAUUSD: 'GLD',
  'GOLD/USD': 'GLD',
  GOLDUSD: 'GLD',
  DXY: 'UUP',
  WTI: 'USO',
  VIX: 'VIXY',
};
const DIRECT_SYMBOL_INPUTS = new Set(['USD/JPY', 'GOLD/USD']);

interface WatchlistSection {
  id: string;
  name: string;
  collapsed: boolean;
  symbols: string[];
  sourceSectorId?: string;
  sourceBasketId?: string;
}

interface WatchlistTab {
  id: string;
  name: string;
  sections: WatchlistSection[];
}

interface WatchlistColumnWidths {
  symbol: number;
  name: number;
  price: number;
  change: number;
}

interface WatchlistLayout {
  widths: WatchlistColumnWidths;
  showName: boolean;
  showPrice: boolean;
}

const WATCHLIST_COLUMN_MIN_WIDTHS: WatchlistColumnWidths = {
  symbol: 72,
  name: 90,
  price: 74,
  change: 66,
};
const WATCHLIST_COLUMN_MAX_WIDTHS: WatchlistColumnWidths = {
  symbol: 420,
  name: 420,
  price: 220,
  change: 180,
};
const WATCHLIST_REQUIRED_RESPONSIVE_MIN_WIDTHS = {
  symbol: 48,
  change: 52,
};
const WATCHLIST_ACTION_COLUMN_WIDTH = 24;
const WATCHLIST_GRID_HORIZONTAL_PADDING = 16;

interface WatchlistSortState {
  column: WatchlistColumnKey | null;
  direction: SortDirection | null;
}

interface SymbolSearchCandidate {
  symbol: string;
  code: string;
  name: string;
  nameEn: string;
  market: string;
  category: string;
}

interface WatchlistCsvCandidate {
  code: string;
  name: string;
  market: string;
  basket?: string;
}

interface WatchlistSyncStock {
  symbol?: string;
  name?: string;
  market?: string;
  marketCap?: number;
  baseChangePct?: number;
}

interface WatchlistSyncGroup {
  id?: string;
  name?: string;
  categoryId?: string;
  parentSectorId?: string;
  parentSectorNameJa?: string;
  parentSectorNameEn?: string;
  stocks?: WatchlistSyncStock[];
}

interface WatchlistSyncCategory {
  id?: string;
  name?: string;
}

interface WatchlistSyncChain {
  name?: string;
  categories?: WatchlistSyncCategory[];
  groups?: WatchlistSyncGroup[];
}

interface WatchlistSyncHistoryEntry {
  id?: string;
  importedAt?: string;
  chain?: WatchlistSyncChain | null;
}

interface WatchlistPanelTarget {
  tabId: string;
  sectionId?: string;
}

interface WatchlistQuoteFetchTarget {
  tabId: string;
  source: WatchlistQuoteFetchSource;
}

interface RegisterTickerResult {
  success: boolean;
  symbol?: string;
  error?: string;
  gatewayFailure?: boolean;
}

interface RegisterTickerOptions {
  reportError?: boolean;
  selectAfterAdd?: boolean;
  clearInput?: boolean;
  closeSearch?: boolean;
  allowCandidates?: boolean;
}

function readStoredValue<T>(key: string, fallback: T): T {
  const saved = localStorage.getItem(key);
  if (!saved) return fallback;
  try {
    return JSON.parse(saved) as T;
  } catch {
    return fallback;
  }
}

function toggleChartExportPanel(
  selection: ChartExportSelection,
  panelId: string,
  availablePanelIds: string[],
): ChartExportSelection {
  const selectedPanelIds = resolveChartExportPanelIds(selection, availablePanelIds);
  const panelIds = selectedPanelIds.includes(panelId)
    ? selectedPanelIds.filter((currentPanelId) => currentPanelId !== panelId)
    : [...selectedPanelIds, panelId];
  return {
    ...selection,
    mode: 'custom',
    panelIds: availablePanelIds.filter((currentPanelId) => panelIds.includes(currentPanelId)),
  };
}

function normalizeWatchlistQuoteFetchModes(raw: unknown): Record<string, WatchlistQuoteFetchMode> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(([tabId]) => Boolean(tabId))
      .map(([tabId, mode]) => [tabId, mode === 'auto' ? 'auto' : 'manual']),
  );
}

function getWatchlistQuoteFetchMode(
  modes: Record<string, WatchlistQuoteFetchMode>,
  tabId: string,
): WatchlistQuoteFetchMode {
  return modes[tabId] === 'auto' ? 'auto' : 'manual';
}

function areWatchlistQuoteFetchModesEqual(
  first: Record<string, WatchlistQuoteFetchMode>,
  second: Record<string, WatchlistQuoteFetchMode>,
): boolean {
  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);
  return firstKeys.length === secondKeys.length
    && firstKeys.every((key) => first[key] === second[key]);
}

function isStorageQuotaError(error: unknown): boolean {
  return error instanceof DOMException
    && (
      error.name === 'QuotaExceededError'
      || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || error.code === 22
      || error.code === 1014
    );
}

function clearVolatileStorageCache(): void {
  localStorage.removeItem(CANDLES_CACHE_STORAGE_KEY);
  localStorage.removeItem(CANDLES_CACHE_META_STORAGE_KEY);
}

function writeStoredValue(key: string, value: string, retryAfterCacheClear = true): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isStorageQuotaError(error)) {
      console.warn(`localStorageへの保存に失敗しました: ${key}`, error);
      return false;
    }

    clearVolatileStorageCache();
    if (!retryAfterCacheClear) {
      console.warn(`localStorage容量不足のためキャッシュ保存をスキップしました: ${key}`);
      return false;
    }

    try {
      localStorage.setItem(key, value);
      console.warn(`localStorage容量不足を検出したため、ローソク足キャッシュを削除して保存しました: ${key}`);
      return true;
    } catch (retryError) {
      console.warn(`localStorage容量不足のため保存できませんでした: ${key}`, retryError);
      return false;
    }
  }
}

function writeStoredJson(key: string, value: unknown, retryAfterCacheClear = true): boolean {
  try {
    return writeStoredValue(key, JSON.stringify(value), retryAfterCacheClear);
  } catch (error) {
    console.warn(`localStorage保存用JSONの作成に失敗しました: ${key}`, error);
    return false;
  }
}

function compactTickersForStorage(tickers: TickerInfo[]): TickerInfo[] {
  const seen = new Set<string>();
  return tickers.flatMap((ticker) => {
    const normalizedTicker = normalizeTickerInfo(ticker);
    if (!normalizedTicker || seen.has(normalizedTicker.symbol)) return [];
    seen.add(normalizedTicker.symbol);
    return [normalizedTicker];
  });
}

let candlesCacheDbPromise: Promise<IDBDatabase> | null = null;

function openCandlesCacheDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDBを利用できません。'));
  }
  if (candlesCacheDbPromise) return candlesCacheDbPromise;

  candlesCacheDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(CANDLES_CACHE_INDEXED_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CANDLES_CACHE_INDEXED_DB_STORE)) {
        db.createObjectStore(CANDLES_CACHE_INDEXED_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDBを開けませんでした。'));
    request.onblocked = () => reject(new Error('IndexedDBの更新がブロックされました。'));
  });

  return candlesCacheDbPromise;
}

async function readCandlesCacheIndexedDb<T>(key: string): Promise<T | null> {
  const db = await openCandlesCacheDb();
  return new Promise<T | null>((resolve, reject) => {
    const transaction = db.transaction(CANDLES_CACHE_INDEXED_DB_STORE, 'readonly');
    const store = transaction.objectStore(CANDLES_CACHE_INDEXED_DB_STORE);
    const request = store.get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error || new Error('IndexedDBから読み込めませんでした。'));
  });
}

async function writeCandlesCacheIndexedDb(key: string, value: unknown): Promise<void> {
  const db = await openCandlesCacheDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(CANDLES_CACHE_INDEXED_DB_STORE, 'readwrite');
    const store = transaction.objectStore(CANDLES_CACHE_INDEXED_DB_STORE);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('IndexedDBへ保存できませんでした。'));
  });
}

function normalizeStoredCandlesCache(raw: unknown): Record<string, Candle[]> {
  if (!raw || typeof raw !== 'object') return {};
  const next: Record<string, Candle[]> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (!Array.isArray(value)) return;
    const dashIndex = key.indexOf('-');
    const symbolPart = dashIndex >= 0 ? key.slice(0, dashIndex) : key;
    const timeframePart = dashIndex >= 0 ? key.slice(dashIndex) : '';
    const normalizedKey = `${normalizeStoredSymbolValue(symbolPart)}${timeframePart}`;
    const candles = value.filter((item): item is Candle => {
      if (!item || typeof item !== 'object') return false;
      const candle = item as Partial<Candle>;
      return Number.isFinite(Number(candle.time))
        && Number.isFinite(Number(candle.open))
        && Number.isFinite(Number(candle.high))
        && Number.isFinite(Number(candle.low))
        && Number.isFinite(Number(candle.close))
        && Number.isFinite(Number(candle.volume));
    });
    if (candles.length > 0) {
      const nextCandles = candles.slice(-CANDLES_CACHE_MAX_LENGTH);
      const existing = next[normalizedKey];
      next[normalizedKey] = existing && existing.length > nextCandles.length
        ? existing
        : nextCandles;
    }
  });
  return next;
}

function normalizeTimestampMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const next: Record<string, number> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const timestamp = Number(value);
    if (Number.isFinite(timestamp) && timestamp > 0) {
      next[key] = timestamp;
    }
  });
  return next;
}

function compactCandlesCache(cache: Record<string, Candle[]>): Record<string, Candle[]> {
  const next: Record<string, Candle[]> = {};
  Object.entries(cache).forEach(([key, candles]) => {
    const dashIndex = key.indexOf('-');
    const symbolPart = dashIndex >= 0 ? key.slice(0, dashIndex) : key;
    const timeframePart = dashIndex >= 0 ? key.slice(dashIndex) : '';
    const normalizedKey = `${normalizeStoredSymbolValue(symbolPart)}${timeframePart}`;
    const nextCandles = candles.slice(-CANDLES_CACHE_MAX_LENGTH);
    const existing = next[normalizedKey];
    next[normalizedKey] = existing && existing.length > nextCandles.length
      ? existing
      : nextCandles;
  });
  return next;
}

function normalizeStoredQuoteCache(raw: unknown): Record<string, MoomooTickerQuote | null> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const next: Record<string, MoomooTickerQuote | null> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([rawSymbol, value]) => {
    const symbol = normalizeStoredSymbolValue(rawSymbol);
    if (!symbol) return;
    if (value === null) {
      next[symbol] = null;
      return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const quote = value as Partial<MoomooTickerQuote>;
    const price = Number(quote.price);
    if (!Number.isFinite(price) || price <= 0) return;
    const changePct = Number(quote.changePct);
    const marketCap = Number(quote.marketCap);
    next[symbol] = {
      name: typeof quote.name === 'string' && quote.name.trim() ? quote.name.trim() : symbol,
      price,
      changePct: Number.isFinite(changePct) ? changePct : 0,
      marketCap: Number.isFinite(marketCap) && marketCap > 0 ? marketCap : undefined,
    };
  });
  return next;
}

function areQuoteCachesEqualForStorage(
  first: Record<string, MoomooTickerQuote | null>,
  second: Record<string, MoomooTickerQuote | null>,
): boolean {
  const firstKeys = Object.keys(first).sort();
  const secondKeys = Object.keys(second).sort();
  if (firstKeys.length !== secondKeys.length) return false;
  return firstKeys.every((key, index) => {
    if (key !== secondKeys[index]) return false;
    const firstQuote = first[key];
    const secondQuote = second[key];
    if (firstQuote === null || secondQuote === null) {
      return firstQuote === secondQuote;
    }
    return firstQuote.name === secondQuote.name
      && firstQuote.price === secondQuote.price
      && firstQuote.changePct === secondQuote.changePct
      && (firstQuote.marketCap ?? null) === (secondQuote.marketCap ?? null);
  });
}

async function writeAndVerifyQuoteCacheIndexedDb(
  cache: Record<string, MoomooTickerQuote | null>,
): Promise<void> {
  const normalizedCache = normalizeStoredQuoteCache(cache);
  await writeCandlesCacheIndexedDb(QUOTE_CACHE_INDEXED_DB_CACHE_KEY, normalizedCache);
  const storedCache = normalizeStoredQuoteCache(
    await readCandlesCacheIndexedDb<unknown>(QUOTE_CACHE_INDEXED_DB_CACHE_KEY),
  );
  if (!areQuoteCachesEqualForStorage(normalizedCache, storedCache)) {
    console.warn('価格キャッシュのIndexedDB保存後検証に失敗しました。');
  }
}

async function writeAndVerifyCandlesCacheIndexedDb(
  cache: Record<string, Candle[]>,
  timestamps: Record<string, number>,
): Promise<void> {
  const compactedCache = compactCandlesCache(cache);
  await Promise.all([
    writeCandlesCacheIndexedDb(CANDLES_CACHE_INDEXED_DB_CACHE_KEY, compactedCache),
    writeCandlesCacheIndexedDb(CANDLES_CACHE_INDEXED_DB_META_KEY, timestamps),
  ]);

  const [storedCacheRaw, storedMetaRaw] = await Promise.all([
    readCandlesCacheIndexedDb<unknown>(CANDLES_CACHE_INDEXED_DB_CACHE_KEY),
    readCandlesCacheIndexedDb<unknown>(CANDLES_CACHE_INDEXED_DB_META_KEY),
  ]);
  const storedCache = normalizeStoredCandlesCache(storedCacheRaw);
  const storedMeta = normalizeTimestampMap(storedMetaRaw);
  const mismatchedKeys = Object.entries(compactedCache)
    .filter(([key, candles]) => (storedCache[key]?.length ?? 0) !== candles.length)
    .map(([key]) => key)
    .slice(0, 10);
  const missingMetaKeys = Object.entries(timestamps)
    .filter(([key, timestamp]) => timestamp > 0 && storedMeta[key] !== timestamp)
    .map(([key]) => key)
    .slice(0, 10);

  if (mismatchedKeys.length > 0 || missingMetaKeys.length > 0) {
    console.warn('ローソク足キャッシュのIndexedDB保存後検証に失敗しました。', {
      mismatchedKeys,
      missingMetaKeys,
    });
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(limit, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }));
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isMoomooRateLimitMessage(message: string | null | undefined): boolean {
  return /high frequency|too frequent|too many|rate|limit|quota|frequency|429|制限|頻度|上限|過多|高頻度|リクエスト.*多/i.test(message || '');
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeChartDisplayRange(displayRange: ChartDisplayRange | undefined): Exclude<ChartDisplayRange, null> {
  return displayRange === 'w' ? 'w' : DEFAULT_DISPLAY_RANGE;
}

function getDisplayRangeZoomFactor(displayRange: ChartDisplayRange | undefined): number {
  return displayRange === 'w' ? WEEK_RANGE_ZOOM_FACTOR : DAY_RANGE_ZOOM_FACTOR;
}

function normalizePanel(panel: ChartPanel): ChartPanel {
  const normalizedComparisonSymbols = Array.from(new Set(
    (panel.comparisonSymbols || [])
      .map((symbol) => normalizeStoredSymbolValue(symbol))
      .filter(Boolean),
  ));
  const watchlistTabId = typeof panel.watchlistTabId === 'string' && panel.watchlistTabId.trim()
    ? panel.watchlistTabId.trim()
    : undefined;
  const watchlistSectionId = typeof panel.watchlistSectionId === 'string' && panel.watchlistSectionId.trim()
    ? panel.watchlistSectionId.trim()
    : undefined;
  const displayRange = normalizeChartDisplayRange(panel.displayRange);
  const displayTimeframe = getDisplayRangeSeedTimeframe(displayRange);
  return {
    ...panel,
    name: typeof panel.name === 'string' && panel.name.trim() ? panel.name.trim().slice(0, 48) : undefined,
    symbol: normalizeStoredSymbolValue(panel.symbol),
    watchlistTabId,
    watchlistSectionId,
    comparisonSymbols: normalizedComparisonSymbols.length > 0 ? normalizedComparisonSymbols : panel.comparisonSymbols,
    comparisonOnly: panel.comparisonOnly || undefined,
    showPrimaryCandles: panel.showPrimaryCandles === false ? false : undefined,
    comparisonLabelRankSpacingScale: clampStoredNumber(panel.comparisonLabelRankSpacingScale, 1, 0.5, 2),
    timeframe: displayTimeframe ?? ((panel.timeframe as string) === '15m' ? '10m' : panel.timeframe),
    displayRange,
    zoomFactor: getDisplayRangeZoomFactor(displayRange),
    scrollOffsetPct: 100,
    priceScale: panel.priceScale ?? 1,
    priceOffsetPct: panel.priceOffsetPct ?? 0,
    rsiHeightPct: panel.rsiHeightPct ?? 25,
    macdHeightPct: panel.macdHeightPct ?? 25,
  };
}

function formatClockTime(date = new Date()): string {
  return date.toLocaleTimeString('ja-JP', { hour12: false });
}

function formatDiscordAutomationJapanDateTime(value: string | null): string {
  if (!value) return '—';
  const source = value.startsWith('manual:') ? value.slice('manual:'.length) : value;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function formatTickerPrice(symbol: string, price: number | null | undefined): string {
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice)) return 'N/A';
  if (parseSymbolExpression(symbol)) {
    return numericPrice.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }
  if (symbol.startsWith('JP.')) {
    return `¥${numericPrice.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}`;
  }
  return `$${numericPrice.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatWatchlistSymbol(symbol: string | null | undefined): string {
  const normalizedSymbol = normalizeStoredSymbolValue(symbol || '');
  const expression = parseSymbolExpression(normalizedSymbol);
  if (expression) {
    return `${formatWatchlistSymbol(expression.left)}${expression.operator}${formatWatchlistSymbol(expression.right)}`;
  }
  return normalizedSymbol.startsWith('JP.') ? normalizedSymbol.slice(3) : normalizedSymbol;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeLineStyle(value: unknown): IndicatorLineStyle {
  return INDICATOR_LINE_STYLES.includes(value as IndicatorLineStyle)
    ? value as IndicatorLineStyle
    : 'solid';
}

function clampStoredNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.max(min, Math.min(max, numericValue))
    : fallback;
}

function normalizeNumberRecord(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(([key, value]) => Boolean(key) && Number.isFinite(Number(value)))
      .map(([key, value]) => [key, Number(value)]),
  );
}

function normalizeBooleanRecord(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(([key, value]) => Boolean(key) && typeof value === 'boolean'),
  ) as Record<string, boolean>;
}

function normalizeComparisonLabelLayoutMode(value: unknown): ComparisonLabelLayoutMode {
  return value === 'rank' || value === 'stack' ? value : 'changePct';
}

function isSharedWorkspaceEnvelope(value: unknown): value is SharedWorkspaceEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const source = value as Partial<SharedWorkspaceEnvelope>;
  return typeof source.enabled === 'boolean'
    && (source.profile === 'desktop' || source.profile === 'mobile')
    && typeof source.revision === 'number'
    && (source.updatedAt === null || typeof source.updatedAt === 'string')
    && (source.settings === null || typeof source.settings === 'object');
}

async function readWorkspaceEnvelope(response: Response): Promise<SharedWorkspaceEnvelope> {
  const payload = await response.json() as unknown;
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error?: unknown }).error)
      : `HTTP ${response.status}`;
    throw new Error(message);
  }
  if (!isSharedWorkspaceEnvelope(payload)) {
    throw new Error('共有設定APIの応答形式が正しくありません。');
  }
  return payload;
}

function detectSharedWorkspaceProfile(): SharedWorkspaceProfile {
  // チャート・ウォッチリストは端末種別で分離せず、全端末で同じクラウド設定を使用する。
  return 'desktop';
}

function isAppleMobileDevice(): boolean {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function getSharedWorkspaceEndpoint(
  profile: SharedWorkspaceProfile,
  baseUrl = '',
): string {
  const endpoint = `${SHARED_WORKSPACE_SETTINGS_ENDPOINT}?profile=${profile}`;
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}${endpoint}` : endpoint;
}

function readSharedBrowserSettings(): Record<string, string> {
  return Object.fromEntries(
    SHARED_BROWSER_SETTING_KEYS.flatMap((key) => {
      const value = localStorage.getItem(key);
      return value === null ? [] : [[key, value] as const];
    }),
  );
}

function areStringRecordsEqual(
  first: Record<string, string>,
  second: Record<string, string>,
): boolean {
  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);
  return firstKeys.length === secondKeys.length
    && firstKeys.every((key) => first[key] === second[key]);
}

function applySharedBrowserSettings(settings: Record<string, string>): boolean {
  let changed = false;
  SHARED_BROWSER_SETTING_KEYS.forEach((key) => {
    const nextValue = settings[key];
    const currentValue = localStorage.getItem(key);
    if (typeof nextValue === 'string') {
      if (currentValue !== nextValue) {
        localStorage.setItem(key, nextValue);
        changed = true;
      }
    } else if (currentValue !== null) {
      localStorage.removeItem(key);
      changed = true;
    }
  });
  return changed;
}

function normalizeWatchlistColumnWidths(raw: unknown): WatchlistColumnWidths {
  const source = raw && typeof raw === 'object' ? raw as Partial<WatchlistColumnWidths> : {};
  return {
    symbol: clampStoredNumber(source.symbol, 180, WATCHLIST_COLUMN_MIN_WIDTHS.symbol, WATCHLIST_COLUMN_MAX_WIDTHS.symbol),
    name: clampStoredNumber(source.name, 150, WATCHLIST_COLUMN_MIN_WIDTHS.name, WATCHLIST_COLUMN_MAX_WIDTHS.name),
    price: clampStoredNumber(source.price, 92, WATCHLIST_COLUMN_MIN_WIDTHS.price, WATCHLIST_COLUMN_MAX_WIDTHS.price),
    change: clampStoredNumber(source.change, 70, WATCHLIST_COLUMN_MIN_WIDTHS.change, WATCHLIST_COLUMN_MAX_WIDTHS.change),
  };
}

function calculateWatchlistLayoutColumnWidths(
  preferredWidths: WatchlistColumnWidths,
  availableWidth: number,
  showNameColumn: boolean,
): WatchlistLayout {
  const availableForColumns = Math.max(
    WATCHLIST_REQUIRED_RESPONSIVE_MIN_WIDTHS.symbol +
      WATCHLIST_REQUIRED_RESPONSIVE_MIN_WIDTHS.change,
    Math.floor(availableWidth - WATCHLIST_ACTION_COLUMN_WIDTH * 2),
  );
  const next: WatchlistColumnWidths = {
    symbol: clampStoredNumber(
      preferredWidths.symbol,
      180,
      WATCHLIST_COLUMN_MIN_WIDTHS.symbol,
      WATCHLIST_COLUMN_MAX_WIDTHS.symbol,
    ),
    name: clampStoredNumber(
      preferredWidths.name,
      150,
      WATCHLIST_COLUMN_MIN_WIDTHS.name,
      WATCHLIST_COLUMN_MAX_WIDTHS.name,
    ),
    price: clampStoredNumber(
      preferredWidths.price,
      92,
      WATCHLIST_COLUMN_MIN_WIDTHS.price,
      WATCHLIST_COLUMN_MAX_WIDTHS.price,
    ),
    change: clampStoredNumber(
      preferredWidths.change,
      70,
      WATCHLIST_COLUMN_MIN_WIDTHS.change,
      WATCHLIST_COLUMN_MAX_WIDTHS.change,
    ),
  };

  let showName = showNameColumn;
  let showPrice = true;

  const widthWithAllColumns =
    next.symbol +
    (showName ? next.name : 0) +
    next.change +
    next.price;
  if (widthWithAllColumns > availableForColumns) {
    showPrice = false;
  }

  if (showName && !showPrice) {
    const overflowWithoutPrice = next.symbol + next.name + next.change - availableForColumns;
    if (overflowWithoutPrice > 0) {
      next.name = Math.max(
        WATCHLIST_COLUMN_MIN_WIDTHS.name,
        next.name - overflowWithoutPrice,
      );
    }
    if (next.symbol + next.name + next.change > availableForColumns) {
      showName = false;
    }
  }

  const visibleOptionalWidth =
    (showName ? next.name : 0) +
    (showPrice ? next.price : 0);
  const availableForRequiredColumns = Math.max(
    WATCHLIST_REQUIRED_RESPONSIVE_MIN_WIDTHS.symbol +
      WATCHLIST_REQUIRED_RESPONSIVE_MIN_WIDTHS.change,
    availableForColumns - visibleOptionalWidth,
  );
  const requiredOverflow = next.symbol + next.change - availableForRequiredColumns;
  if (requiredOverflow > 0) {
    const symbolReduction = Math.min(
      next.symbol - WATCHLIST_REQUIRED_RESPONSIVE_MIN_WIDTHS.symbol,
      requiredOverflow,
    );
    next.symbol -= symbolReduction;
    const remainingOverflow = requiredOverflow - symbolReduction;
    if (remainingOverflow > 0) {
      next.change = Math.max(
        WATCHLIST_REQUIRED_RESPONSIVE_MIN_WIDTHS.change,
        next.change - remainingOverflow,
      );
    }
  }

  return {
    widths: next,
    showName,
    showPrice,
  };
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      row.push(value);
      if (row.some((cell) => cell.trim())) {
        rows.push(row);
      }
      row = [];
      value = '';
      continue;
    }

    value += char;
  }

  row.push(value);
  if (row.some((cell) => cell.trim())) {
    rows.push(row);
  }
  return rows;
}

function normalizeTickerSymbolForStorage(rawSymbol: unknown): string {
  const cleaned = String(rawSymbol ?? '').trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return '';
  const upper = cleaned.toUpperCase();
  const usStripped = upper.startsWith('US.')
    ? upper.slice(3)
    : upper.endsWith('.US')
      ? upper.slice(0, -3)
      : upper;
  const aliased = SYMBOL_NAME_ALIASES[usStripped] || SYMBOL_NAME_ALIASES[upper];
  if (aliased) return aliased;
  if (upper.startsWith('US.')) return cleaned.slice(3).toUpperCase();
  if (upper.endsWith('.US')) return cleaned.slice(0, -3).toUpperCase();
  if (upper.startsWith('JP.')) return `JP.${cleaned.slice(3).toUpperCase()}`;
  if (upper.endsWith('.JP')) return `JP.${cleaned.slice(0, -3).toUpperCase()}`;
  if (upper.endsWith('.T')) return `JP.${cleaned.slice(0, -2).toUpperCase()}`;
  if (upper.startsWith('HK.')) {
    const code = cleaned.slice(3).toUpperCase();
    return /^\d+$/.test(code) ? `HK.${code.padStart(5, '0')}` : `HK.${code}`;
  }
  if (upper.endsWith('.HK')) {
    const code = cleaned.slice(0, -3).toUpperCase();
    return /^\d+$/.test(code) ? `HK.${code.padStart(5, '0')}` : `HK.${code}`;
  }
  if (upper.endsWith('.FX') || upper.endsWith('.BD')) return upper;
  if (/^\d{3,5}[A-Z]?$/.test(upper)) return `JP.${upper}`;
  return upper;
}

function normalizeStoredSymbolValue(rawSymbol: unknown): string {
  const rawString = String(rawSymbol ?? '');
  if (rawString.startsWith('BASKET:')) return rawString;

  const expression = normalizeSymbolExpressionForStorage(rawSymbol);
  if (expression) {
    return formatSymbolExpression(expression);
  }
  return normalizeTickerSymbolForStorage(rawSymbol);
}

function normalizeSymbolExpressionForStorage(rawExpression: unknown): SymbolExpression | null {
  const rawValue = String(rawExpression ?? '');
  if (DIRECT_SYMBOL_INPUTS.has(rawValue.trim().toUpperCase())) return null;
  const expression = parseSymbolExpression(rawValue);
  if (!expression) return null;
  const left = normalizeTickerSymbolForStorage(expression.left);
  const right = normalizeTickerSymbolForStorage(expression.right);
  if (!left || !right) return null;
  return {
    left,
    operator: expression.operator,
    right,
  };
}

function getStoredSymbolOperands(symbol: string): string[] {
  const normalizedSymbol = normalizeStoredSymbolValue(symbol);
  if (!normalizedSymbol) return [];
  const expression = normalizeSymbolExpressionForStorage(symbol);
  return expression ? [expression.left, expression.right] : [normalizedSymbol];
}

function normalizeTickerInfo(rawTicker: unknown): TickerInfo | null {
  if (!rawTicker || typeof rawTicker !== 'object') return null;
  const source = rawTicker as Partial<TickerInfo>;
  const symbol = normalizeStoredSymbolValue(source.symbol || '');
  if (!symbol) return null;
  const basePrice = Number(source.basePrice);
  const dailyChangePct = Number(source.dailyChangePct);
  return {
    symbol,
    name: typeof source.name === 'string' && source.name.trim()
      ? source.name.trim()
      : formatWatchlistSymbol(symbol),
    basePrice: Number.isFinite(basePrice) ? basePrice : 0,
    dailyChangePct: Number.isFinite(dailyChangePct) ? dailyChangePct : 0,
  };
}

function getWatchlistTabSymbols(tab?: WatchlistTab | null): string[] {
  const symbols: string[] = [];
  const seen = new Set<string>();
  tab?.sections.forEach((section) => {
    section.symbols.forEach((rawSymbol) => {
      const symbol = normalizeStoredSymbolValue(rawSymbol);
      if (!symbol || seen.has(symbol)) return;
      seen.add(symbol);
      symbols.push(symbol);
    });
  });
  return symbols;
}

function getWatchlistSectionSymbols(tab: WatchlistTab | null | undefined, sectionId: string | null | undefined): string[] {
  if (!tab || !sectionId) return [];
  const section = tab.sections.find((item) => item.id === sectionId);
  if (!section) return [];
  const symbols: string[] = [];
  const seen = new Set<string>();
  section.symbols.forEach((rawSymbol) => {
    const symbol = normalizeStoredSymbolValue(rawSymbol);
    if (!symbol || seen.has(symbol)) return;
    seen.add(symbol);
    symbols.push(symbol);
  });
  return symbols;
}

function getQuoteOperandSymbolsForWatchlistSymbols(symbols: string[]): string[] {
  const normalizedSymbols: string[] = [];
  const seen = new Set<string>();
  symbols.forEach((symbol) => {
    getStoredSymbolOperands(symbol).forEach((operand) => {
      const normalizedOperand = normalizeStoredSymbolValue(operand);
      if (!normalizedOperand || seen.has(normalizedOperand)) return;
      seen.add(normalizedOperand);
      normalizedSymbols.push(normalizedOperand);
    });
  });
  return normalizedSymbols;
}

function getQuoteOperandSymbolsForWatchlistTabs(tabs: WatchlistTab[]): string[] {
  return getQuoteOperandSymbolsForWatchlistSymbols(
    tabs.flatMap((tab) => tab.sections.flatMap((section) => section.symbols)),
  );
}

function getJapanMinutesOfDay(date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return (hour % 24) * 60 + minute;
}

function shouldPauseUsFetchForJapanSession(date = new Date()): boolean {
  const minutes = getJapanMinutesOfDay(date);
  return minutes >= JAPAN_US_FETCH_PAUSE_START_MINUTES
    && minutes < JAPAN_US_FETCH_PAUSE_END_MINUTES;
}

function isUsMarketSymbol(symbol: string): boolean {
  const normalized = normalizeStoredSymbolValue(symbol);
  return normalized.startsWith('US.');
}

function isJapaneseMarketSymbol(symbol: string): boolean {
  return normalizeStoredSymbolValue(symbol).startsWith('JP.');
}

function isJapaneseMarketSymbolInput(symbol: string): boolean {
  return getStoredSymbolOperands(symbol).some(isJapaneseMarketSymbol);
}

function formatTimeframeLabel(timeframe: Timeframe): string {
  if (timeframe === '1mo') return '1M';
  if (timeframe === '1d') return 'day';
  if (timeframe === '1w') return 'Week';
  return timeframe;
}

function formatChartTimeframeLabel(timeframe: Timeframe, usesJapanYahooFallback: boolean): string {
  return usesJapanYahooFallback && JP_YAHOO_EFFECTIVE_TIMEFRAME_LABELS[timeframe]
    ? JP_YAHOO_EFFECTIVE_TIMEFRAME_LABELS[timeframe]
    : formatTimeframeLabel(timeframe);
}

function getChartTimeframeButtonTitle(
  timeframe: Timeframe,
  usesJapanYahooFallback: boolean,
  displayRangeLocked: boolean,
): string | undefined {
  if (displayRangeLocked) return 'D/W表示中は時間足を固定しています';
  const effectiveLabel = JP_YAHOO_EFFECTIVE_TIMEFRAME_LABELS[timeframe];
  if (!usesJapanYahooFallback || !effectiveLabel) return undefined;
  return `JP銘柄はYahooの実効足種で取得します: ${formatTimeframeLabel(timeframe)} → ${effectiveLabel}`;
}

function getMarketFetchRank(symbol: string): number {
  if (isJapaneseMarketSymbol(symbol)) return 0;
  if (isUsMarketSymbol(symbol)) return 2;
  return 1;
}

function orderMarketFetchSymbols(
  symbols: string[],
  options: { includePausedMarkets?: boolean } = {},
): string[] {
  const pauseUsFetch = !options.includePausedMarkets && shouldPauseUsFetchForJapanSession();
  const uniqueSymbols = Array.from(new Set(symbols.map(normalizeStoredSymbolValue).filter(Boolean)));
  return uniqueSymbols
    .filter((symbol) => !(pauseUsFetch && isUsMarketSymbol(symbol)))
    .sort((first, second) => {
      const firstRank = getMarketFetchRank(first);
      const secondRank = getMarketFetchRank(second);
      return firstRank - secondRank || first.localeCompare(second);
    });
}

function isPriorityJapaneseWatchlistTab(tab: WatchlistTab | null | undefined): boolean {
  const name = (tab?.name || '').toUpperCase();
  return name.includes('JPセクター') || name.includes('TPX') || name.includes('TOPIX');
}

function orderWatchlistTabsForQuoteFetch(tabs: WatchlistTab[], activeTabId: string): WatchlistTab[] {
  return [...tabs].sort((first, second) => {
    const firstRank = isPriorityJapaneseWatchlistTab(first) ? 0 : first.id === activeTabId ? 1 : 2;
    const secondRank = isPriorityJapaneseWatchlistTab(second) ? 0 : second.id === activeTabId ? 1 : 2;
    return firstRank - secondRank;
  });
}

function getAutoWatchlistQuoteRefreshSignature(
  tabs: WatchlistTab[],
  modes: Record<string, WatchlistQuoteFetchMode>,
): string {
  return tabs
    .flatMap((tab) => {
      if (getWatchlistQuoteFetchMode(modes, tab.id) !== 'auto') return [];
      const symbols = orderMarketFetchSymbols(
        getQuoteOperandSymbolsForWatchlistSymbols(getWatchlistTabSymbols(tab)),
      );
      return symbols.length > 0 ? [`${tab.id}:${symbols.join(',')}`] : [];
    })
    .join('|');
}

function encodeWatchlistTargetValue(tabId: string | null | undefined, sectionId?: string | null): string {
  if (!tabId) return '';
  return sectionId ? `${tabId}${WATCHLIST_TARGET_SEPARATOR}${sectionId}` : tabId;
}

function decodeWatchlistTargetValue(value: string): WatchlistPanelTarget | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const separatorIndex = trimmed.indexOf(WATCHLIST_TARGET_SEPARATOR);
  if (separatorIndex === -1) return { tabId: trimmed };
  const tabId = trimmed.slice(0, separatorIndex);
  const sectionId = trimmed.slice(separatorIndex + WATCHLIST_TARGET_SEPARATOR.length);
  return tabId ? { tabId, sectionId: sectionId || undefined } : null;
}

function areSymbolListsEqual(first: string[] = [], second: string[] = []): boolean {
  if (first.length !== second.length) return false;
  return first.every((symbol, index) => symbol === second[index]);
}

function syncPanelToWatchlistTarget(
  panel: ChartPanel,
  target: WatchlistPanelTarget,
  symbols: string[],
): ChartPanel {
  if (panel.comparisonOnly) {
    return {
      ...panel,
      symbol: '',
      watchlistTabId: target.tabId,
      watchlistSectionId: target.sectionId,
      comparisonSymbols: symbols,
      showRsi: false,
      showMacd: false,
      showVolume: false,
    };
  }

  if (symbols.length === 0) {
    return {
      ...panel,
      watchlistTabId: target.tabId,
      watchlistSectionId: target.sectionId,
      comparisonSymbols: [],
    };
  }

  const [primarySymbol, ...comparisonSymbols] = symbols;
  return {
    ...panel,
    symbol: primarySymbol,
    watchlistTabId: target.tabId,
    watchlistSectionId: target.sectionId,
    comparisonSymbols,
  };
}

function syncPanelToWatchlistTab(panel: ChartPanel, tabId: string, symbols: string[]): ChartPanel {
  return syncPanelToWatchlistTarget(panel, { tabId }, symbols);
}

function hasWatchlistPanelTargetChanged(current: ChartPanel, next: ChartPanel): boolean {
  return current.symbol !== next.symbol
    || current.watchlistTabId !== next.watchlistTabId
    || current.watchlistSectionId !== next.watchlistSectionId
    || !areSymbolListsEqual(current.comparisonSymbols || [], next.comparisonSymbols || []);
}

function getPositiveBasketWeight(value: unknown): number | null {
  const weight = Number(value);
  return Number.isFinite(weight) && weight > 0 ? weight : null;
}

function assignBasketWeights<T extends { marketCapWeight: number | null }>(
  candidates: T[],
): Array<T & { weight: number }> {
  if (candidates.length === 0) return [];
  const useMarketCapWeights = candidates.every((candidate) => candidate.marketCapWeight !== null);
  return candidates.map((candidate) => ({
    ...candidate,
    weight: useMarketCapWeights ? candidate.marketCapWeight! : 1,
  }));
}

function resolveCandlesForSymbol(
  symbol: string,
  timeframe: Timeframe,
  cache: Record<string, Candle[]>,
  options?: {
    tickerStatsBySymbol?: Map<string, any>;
    watchlistTabs?: any[]; // WatchlistTab is not imported at top level, use any or fetch from outer scope if needed. wait, it's defined inside App.tsx or types.ts? Let's check. Actually, WatchlistTab is defined in types? Let's use any for now to avoid import issues.
  }
): Candle[] {
  if (symbol.startsWith('BASKET:')) {
    const sectionId = symbol.slice(7);
    const section = options?.watchlistTabs?.flatMap((t: any) => t.sections).find((s: any) => s.id === sectionId);
    if (!section || !section.symbols || section.symbols.length === 0) return [];

    const candidates: Array<{ marketCapWeight: number | null; candles: Candle[] }> = [];
    for (const rawSym of section.symbols) {
      const componentCandles = resolveCandlesForSymbol(rawSym, timeframe, cache, options);
      if (componentCandles.length > 0) {
        const baseSym = parseSymbolExpression(rawSym)?.left || rawSym;
        const normalizedBase = normalizeStoredSymbolValue(baseSym);
        const ticker = options?.tickerStatsBySymbol?.get(normalizedBase);
        candidates.push({
          marketCapWeight: getPositiveBasketWeight(ticker?.marketCap),
          candles: componentCandles,
        });
      }
    }
    const components: BasketComponent[] = assignBasketWeights(candidates)
      .map(({ weight, candles }) => ({ weight, candles }));
    return combineBasketCandles(components, timeframe);
  }

  const expression = normalizeSymbolExpressionForStorage(symbol);
  if (!expression) {
    const canonicalSymbol = normalizeStoredSymbolValue(symbol);
    return cache[`${canonicalSymbol}-${timeframe}`] || cache[`${symbol}-${timeframe}`] || [];
  }
  return combineExpressionCandles(
    expression,
    resolveCandlesForSymbol(expression.left, timeframe, cache, options),
    resolveCandlesForSymbol(expression.right, timeframe, cache, options),
    timeframe,
  );
}

function isJapanMarketSymbol(symbol: string): boolean {
  const normalizedSymbol = normalizeStoredSymbolValue(symbol);
  return normalizedSymbol.startsWith('JP.') || /^\d{3,5}$/.test(normalizedSymbol);
}

function getDisplayRangeSeedTimeframe(displayRange?: ChartDisplayRange): Timeframe | null {
  if (displayRange === 'd') return DAY_RANGE_OVERVIEW_TIMEFRAME;
  if (displayRange === 'w') return WEEK_RANGE_OVERVIEW_TIMEFRAME;
  return null;
}

function getCandleDatePart(candle: Candle): string {
  if (candle.timeStr && /^\d{4}-\d{2}-\d{2}/.test(candle.timeStr)) {
    return candle.timeStr.slice(0, 10);
  }
  return new Date(candle.time * 1000).toISOString().slice(0, 10);
}

function getCandleClockPart(candle: Candle): string {
  if (candle.timeStr && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(candle.timeStr)) {
    return candle.timeStr.slice(11, 16);
  }
  const date = new Date(candle.time * 1000);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function dateStringToUtcMs(dateString: string): number {
  const [year, month, day] = dateString.split('-').map(Number);
  return Date.UTC(year, (month || 1) - 1, day || 1);
}

function formatUtcDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function getWeekDateRange(dateString: string): { start: string; end: string } {
  const dayMs = 24 * 60 * 60 * 1000;
  const dateMs = dateStringToUtcMs(dateString);
  const day = new Date(dateMs).getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const mondayMs = dateMs + mondayOffset * dayMs;
  return {
    start: formatUtcDateString(mondayMs),
    end: formatUtcDateString(mondayMs + 4 * dayMs),
  };
}

function filterCandlesForDisplayRange(
  candles: Candle[],
  displayRange: ChartDisplayRange | undefined,
  symbol: string,
): Candle[] {
  if (!displayRange || candles.length === 0) return candles;

  const latestDate = candles.reduce((latest, candle) => {
    const candleDate = getCandleDatePart(candle);
    return candleDate > latest ? candleDate : latest;
  }, getCandleDatePart(candles[candles.length - 1]));

  if (displayRange === 'd') {
    const session = isJapanMarketSymbol(symbol)
      ? { start: '09:00', end: '15:30' }
      : { start: '09:30', end: '16:00' };
    const sameDateCandles = candles.filter((candle) => getCandleDatePart(candle) === latestDate);
    const sessionCandles = sameDateCandles.filter((candle) => {
      const clock = getCandleClockPart(candle);
      return clock >= session.start && clock <= session.end;
    });
    return sessionCandles.length > 0 ? sessionCandles : sameDateCandles.length > 0 ? sameDateCandles : candles;
  }

  if (displayRange === 'w') {
    const { start, end } = getWeekDateRange(latestDate);
    const weekCandles = candles.filter((candle) => {
      const candleDate = getCandleDatePart(candle);
      return candleDate >= start && candleDate <= end;
    });
    return weekCandles.length > 0 ? weekCandles : candles;
  }

  return candles;
}

function canUseQuoteFallbackCandles(symbol: string): boolean {
  const normalizedSymbol = normalizeStoredSymbolValue(symbol);
  return Boolean(normalizedSymbol)
    && !normalizedSymbol.startsWith('BASKET:')
    && !normalizeSymbolExpressionForStorage(normalizedSymbol);
}

function selectLongestCandleSeriesSymbol(
  symbols: string[],
  candlesBySymbol: Record<string, Candle[]>,
): string {
  return symbols.reduce((bestSymbol, symbol) => {
    const bestLength = bestSymbol ? candlesBySymbol[bestSymbol]?.length ?? 0 : 0;
    const symbolLength = candlesBySymbol[symbol]?.length ?? 0;
    return symbolLength > bestLength ? symbol : bestSymbol;
  }, '');
}

function isIntradayTimeframe(timeframe: Timeframe): boolean {
  return timeframe !== '1d' && timeframe !== '1w' && timeframe !== '1mo';
}

function hasUsableChartCandles(candles: Candle[], timeframe: Timeframe): boolean {
  return candles.length >= (isIntradayTimeframe(timeframe) ? 3 : 1);
}

function getUsableChartCandles(candles: Candle[], timeframe: Timeframe): Candle[] {
  return hasUsableChartCandles(candles, timeframe) ? candles : [];
}

function splitTickerInputList(rawInput: string): string[] {
  const items = Array.from(
    new Set(
      rawInput
        .split(/[,\u3001\r\n\t]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
  return expandRelativeSymbolShorthandItems(items);
}

function normalizeRelativeSlash(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '').replace(/／/g, '/');
}

function isRelativeBaseShortcut(value: string): boolean {
  const normalized = normalizeRelativeSlash(value);
  return normalized.startsWith('/')
    && normalized.length > 1
    && !normalized.slice(1).includes('/');
}

function getRelativeBaseShortcut(value: string): string | null {
  if (!isRelativeBaseShortcut(value)) return null;
  const base = normalizeRelativeSlash(value).slice(1).trim();
  return base ? base : null;
}

function expandRelativeSymbolShorthandItems(items: string[]): string[] {
  const cleanedItems = items.map((item) => item.trim()).filter(Boolean);
  const base = cleanedItems
    .map(getRelativeBaseShortcut)
    .filter((item): item is string => Boolean(item))
    .at(-1);

  if (!base) return cleanedItems;

  return cleanedItems
    .filter((item) => !isRelativeBaseShortcut(item))
    .map((item) => {
      if (parseSymbolExpression(item) || DIRECT_SYMBOL_INPUTS.has(item.trim().toUpperCase())) {
        return item;
      }
      return `${item}/${base}`;
    });
}

function expandRelativeWatchlistCsvCandidates(
  candidates: WatchlistCsvCandidate[],
): WatchlistCsvCandidate[] {
  const base = candidates
    .map((candidate) => getRelativeBaseShortcut(candidate.code))
    .filter((item): item is string => Boolean(item))
    .at(-1);

  if (!base) return candidates;

  return candidates
    .filter((candidate) => !isRelativeBaseShortcut(candidate.code))
    .map((candidate) => {
      if (parseSymbolExpression(candidate.code) || DIRECT_SYMBOL_INPUTS.has(candidate.code.trim().toUpperCase())) {
        return candidate;
      }
      return {
        ...candidate,
        code: `${candidate.code}/${base}`,
      };
    });
}

function normalizeWatchlistCsvHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000_./・･\-()（）]/g, '');
}

function findWatchlistCsvHeaderIndex(headers: string[], names: string[]): number {
  const normalizedNames = names.map(normalizeWatchlistCsvHeader);
  return headers.findIndex((header) => {
    const normalizedHeader = normalizeWatchlistCsvHeader(header);
    return normalizedNames.some((name) => (
      normalizedHeader === name
      || (name.length > 2 && normalizedHeader.includes(name))
    ));
  });
}

function extractWatchlistCsvCandidates(text: string): WatchlistCsvCandidate[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, '').trim().normalize('NFC'));
  const codeIndex = findWatchlistCsvHeaderIndex(headers, ['コード', '銘柄コード', '証券コード', 'code', 'symbol', 'ticker']);
  const nameIndex = findWatchlistCsvHeaderIndex(headers, ['銘柄名', '銘柄', '名称', '会社名', 'name', 'companyname']);
  const marketIndex = findWatchlistCsvHeaderIndex(headers, ['市場', 'market', 'exchange']);
  const basketIndex = findWatchlistCsvHeaderIndex(headers, ['バスケット', 'basket', 'category', 'group']);
  // [DEBUG] basket列の検出確認
  console.log('[CSV-DEBUG] headers:', JSON.stringify(headers), '| basketIndex:', basketIndex);
  if (codeIndex === -1) return [];

  const result = expandRelativeWatchlistCsvCandidates(rows.slice(1)
    .map((row) => ({
      code: String(row[codeIndex] ?? '').trim(),
      name: String(nameIndex >= 0 ? row[nameIndex] ?? '' : '').trim(),
      market: String(marketIndex >= 0 ? row[marketIndex] ?? '' : '').trim(),
      basket: String(basketIndex >= 0 ? row[basketIndex] ?? '' : '').trim().normalize('NFC') || undefined,
    }))
    .filter((candidate) => candidate.code));
  // [DEBUG] 最初の3件のbasket値を確認
  console.log('[CSV-DEBUG] 先頭3候補:', JSON.stringify(result.slice(0, 3).map((c) => ({ code: c.code, basket: c.basket }))));
  return result;
}

function normalizeImportedSymbol(rawCode: string): string | null {
  const cleaned = rawCode.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return null;
  return normalizeStoredSymbolValue(cleaned) || null;
}

async function readWatchlistImportText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder('utf-8').decode(buffer);
  if (extractWatchlistCsvCandidates(utf8Text).length > 0) {
    return utf8Text;
  }

  try {
    const shiftJisText = new TextDecoder('shift_jis').decode(buffer);
    if (extractWatchlistCsvCandidates(shiftJisText).length > 0) {
      return shiftJisText;
    }
  } catch {
    // ブラウザがShift-JISデコードに未対応の場合はUTF-8結果を使う。
  }

  return utf8Text;
}

function escapeWatchlistCsvCell(value: string): string {
  const normalizedValue = String(value ?? '');
  return /[",\r\n]/.test(normalizedValue)
    ? `"${normalizedValue.replace(/"/g, '""')}"`
    : normalizedValue;
}

function inferWatchlistExportMarket(symbol: string): string {
  const normalizedSymbol = normalizeStoredSymbolValue(symbol);
  if (!normalizedSymbol || parseSymbolExpression(normalizedSymbol) || normalizedSymbol.startsWith('BASKET:')) {
    return '';
  }
  if (normalizedSymbol.startsWith('JP.')) return 'JP';
  if (normalizedSymbol.startsWith('HK.')) return 'HK';
  if (normalizedSymbol.endsWith('.FX')) return 'FX';
  if (normalizedSymbol.endsWith('.BD')) return 'BD';
  return 'US';
}

function createWatchlistExportCsv(
  tab: WatchlistTab,
  tickers: TickerInfo[],
  nameOverrides: Record<string, string>,
): string {
  const tickerBySymbol = new Map(
    tickers.map((ticker) => [normalizeStoredSymbolValue(ticker.symbol), ticker]),
  );
  const rows = tab.sections.flatMap((section) =>
    section.symbols.map((rawSymbol) => {
      const symbol = normalizeStoredSymbolValue(rawSymbol);
      const ticker = tickerBySymbol.get(symbol);
      const name = nameOverrides[symbol]
        || ticker?.name
        || formatWatchlistSymbol(symbol);
      return [
        symbol,
        name,
        inferWatchlistExportMarket(symbol),
        section.name,
      ].map(escapeWatchlistCsvCell).join(',');
    }),
  );
  return `\uFEFFコード,銘柄名,市場,バスケット\r\n${rows.join('\r\n')}${rows.length > 0 ? '\r\n' : ''}`;
}

function sanitizeWatchlistExportFileName(name: string): string {
  const sanitized = name
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
    .replace(/[.\s]+$/g, '')
    .trim()
    .slice(0, 80);
  return sanitized || 'ウォッチリスト';
}

function downloadWatchlistCsv(csv: string, fileName: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function isLikelyTickerInput(value: string): boolean {
  const trimmed = value.trim();
  return /^[A-Za-z]{1,6}$/.test(trimmed)
    || /^[A-Za-z0-9._-]+\.(US|JP|HK|FX|BD)$/i.test(trimmed)
    || /^\.[A-Za-z0-9._-]+\.(US|JP)$/i.test(trimmed)
    || /^\d{3,5}[A-Za-z]?(\.T|\.JP)?$/i.test(trimmed);
}

function isMoomooGatewayFailureMessage(message: string): boolean {
  return /Moomoo|ゲートウェイ|Unauthorized|認証|接続|aborted|abort|timeout/i.test(message);
}

function normalizeWatchlistSort(raw: unknown): WatchlistSortState {
  if (!raw || typeof raw !== 'object') {
    return { column: null, direction: null };
  }
  const source = raw as Partial<WatchlistSortState>;
  const validColumn = source.column === 'symbol' || source.column === 'price' || source.column === 'change';
  const validDirection = source.direction === 'asc' || source.direction === 'desc';
  return validColumn && validDirection
    ? { column: source.column, direction: source.direction }
    : { column: null, direction: null };
}

function normalizeWatchlistNameOverrides(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const next: Record<string, string> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([rawSymbol, rawName]) => {
    const symbol = normalizeStoredSymbolValue(rawSymbol);
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    if (symbol && name) {
      next[symbol] = name;
    }
  });
  return next;
}

function createDefaultWatchlistTabs(tickers: TickerInfo[]): WatchlistTab[] {
  const symbols = tickers.map((ticker) => ticker.symbol);
  const firstSectionSymbols = symbols.slice(0, Math.min(2, symbols.length));
  const secondSectionSymbols = symbols.slice(firstSectionSymbols.length);

  return [
    {
      id: DEFAULT_WATCHLIST_TAB_ID,
      name: '注目領域',
      sections: [
        {
          id: 'section-indexes',
          name: '主要指数',
          collapsed: false,
          symbols: firstSectionSymbols,
        },
        {
          id: 'section-stocks',
          name: '注目銘柄',
          collapsed: false,
          symbols: secondSectionSymbols,
        },
      ].filter((section) => section.symbols.length > 0),
    },
  ];
}

function normalizeWatchlistTabs(raw: unknown, tickers: TickerInfo[]): WatchlistTab[] {
  const knownSymbols = new Set(tickers.map((ticker) => ticker.symbol));
  if (!Array.isArray(raw)) {
    return createDefaultWatchlistTabs(tickers);
  }

  const tabs = raw
    .map((tab, tabIndex): WatchlistTab | null => {
      if (!tab || typeof tab !== 'object') return null;
      const sourceTab = tab as Partial<WatchlistTab>;
      const sectionsSource = Array.isArray(sourceTab.sections) ? sourceTab.sections : [];
      const sections = sectionsSource
        .map((section, sectionIndex): WatchlistSection | null => {
          if (!section || typeof section !== 'object') return null;
          const sourceSection = section as Partial<WatchlistSection>;
          const symbols = Array.isArray(sourceSection.symbols)
            ? sourceSection.symbols.filter((symbol): symbol is string => (
                typeof symbol === 'string' && knownSymbols.has(symbol)
              ))
            : [];
          return {
            id: typeof sourceSection.id === 'string' ? sourceSection.id : createId('section'),
            name: typeof sourceSection.name === 'string' && sourceSection.name.trim()
              ? sourceSection.name.trim()
              : `セクション${sectionIndex + 1}`,
            collapsed: Boolean(sourceSection.collapsed),
            symbols,
            sourceSectorId: typeof sourceSection.sourceSectorId === 'string' ? sourceSection.sourceSectorId : undefined,
            sourceBasketId: typeof sourceSection.sourceBasketId === 'string' ? sourceSection.sourceBasketId : undefined,
          };
        })
        .filter((section): section is WatchlistSection => Boolean(section));

      return {
        id: typeof sourceTab.id === 'string' ? sourceTab.id : createId('tab'),
        name: typeof sourceTab.name === 'string' && sourceTab.name.trim()
          ? sourceTab.name.trim()
          : `リスト${tabIndex + 1}`,
        sections: sections.length > 0
          ? sections
          : [{
              id: DEFAULT_WATCHLIST_SECTION_ID,
              name: '銘柄',
              collapsed: false,
              symbols: [],
            }],
      };
    })
    .filter((tab): tab is WatchlistTab => Boolean(tab));

  return tabs.length > 0 ? tabs : createDefaultWatchlistTabs(tickers);
}

function stableWatchlistHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function createStableWatchlistId(prefix: string, value: string): string {
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${prefix}-${clean || stableWatchlistHash(value || prefix)}`;
}

function normalizeWatchlistSyncChain(value: unknown): WatchlistSyncChain | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as WatchlistSyncChain;
  if (!Array.isArray(source.groups)) return null;
  return source;
}

function getWatchlistGroupSectorName(
  group: WatchlistSyncGroup,
  categoryNames: Map<string, string>,
): string {
  return (
    group.parentSectorNameJa?.trim()
    || group.parentSectorNameEn?.trim()
    || categoryNames.get(String(group.categoryId || ''))?.trim()
    || '未分類'
  );
}

function createWatchlistTabsFromSyncChain(
  chain: WatchlistSyncChain | null | undefined,
  sourcePrefix: string,
): WatchlistTab[] {
  if (!chain || !Array.isArray(chain.groups)) return [];
  const categoryNames = new Map<string, string>(
    (chain.categories || []).map((category) => [
      String(category.id || ''),
      String(category.name || ''),
    ]),
  );
  const tabsBySectorId = new Map<string, WatchlistTab>();

  chain.groups.forEach((group, groupIndex) => {
    if (!Array.isArray(group.stocks) || group.stocks.length === 0) return;
    const symbols = Array.from(new Set(
      group.stocks
        .map((stock) => normalizeStoredSymbolValue(stock.symbol || ''))
        .filter(Boolean),
    ));
    if (symbols.length === 0) return;

    const sectorName = getWatchlistGroupSectorName(group, categoryNames);
    const rawSectorId = group.parentSectorId?.trim() || sectorName;
    const sourceSectorId = `${sourcePrefix}:${rawSectorId}`;
    const sourceBasketId = `${sourcePrefix}:${group.id || `${sectorName}:${group.name || groupIndex}`}`;
    const tabId = createStableWatchlistId(`watchlist-${sourcePrefix}`, rawSectorId || sectorName);
    const sectionId = createStableWatchlistId(`section-${sourcePrefix}`, group.id || `${sectorName}-${group.name || groupIndex}`);
    const existingTab = tabsBySectorId.get(tabId);
    const tab = existingTab ?? {
      id: tabId,
      name: sectorName,
      sections: [],
    };

    tab.sections.push({
      id: sectionId,
      name: group.name?.trim() || `Basket ${groupIndex + 1}`,
      collapsed: false,
      symbols,
      sourceSectorId,
      sourceBasketId,
    });
    tabsBySectorId.set(tabId, tab);
  });

  return Array.from(tabsBySectorId.values());
}

function mergeSyncedWatchlistTabs(currentTabs: WatchlistTab[], syncedTabs: WatchlistTab[]): WatchlistTab[] {
  if (syncedTabs.length === 0) return currentTabs;
  let nextTabs = [...currentTabs];

  syncedTabs.forEach((syncedTab) => {
    const tabIndex = nextTabs.findIndex((tab) => tab.id === syncedTab.id);
    if (tabIndex === -1) {
      nextTabs.push(syncedTab);
      return;
    }

    const currentTab = nextTabs[tabIndex];
    const nextSections = [...currentTab.sections];
    syncedTab.sections.forEach((syncedSection) => {
      const sectionIndex = nextSections.findIndex((section) => (
        section.id === syncedSection.id
        || (
          syncedSection.sourceBasketId
          && section.sourceBasketId === syncedSection.sourceBasketId
        )
      ));
      if (sectionIndex === -1) {
        nextSections.push(syncedSection);
        return;
      }
      nextSections[sectionIndex] = {
        ...nextSections[sectionIndex],
        name: syncedSection.name,
        symbols: syncedSection.symbols,
        sourceSectorId: syncedSection.sourceSectorId,
        sourceBasketId: syncedSection.sourceBasketId,
      };
    });

    nextTabs[tabIndex] = {
      ...currentTab,
      name: syncedTab.name,
      sections: nextSections,
    };
  });

  return nextTabs;
}

function areWatchlistTabsEqual(first: WatchlistTab[], second: WatchlistTab[]): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function extractTickersFromSyncChain(chain: WatchlistSyncChain | null | undefined): TickerInfo[] {
  if (!chain || !Array.isArray(chain.groups)) return [];
  const tickersBySymbol = new Map<string, TickerInfo>();
  chain.groups.forEach((group) => {
    (group.stocks || []).forEach((stock) => {
      const symbol = normalizeStoredSymbolValue(stock.symbol || '');
      if (!symbol || tickersBySymbol.has(symbol)) return;
      tickersBySymbol.set(symbol, {
        symbol,
        name: stock.name?.trim() || symbol,
        basePrice: 0,
        dailyChangePct: Number.isFinite(Number(stock.baseChangePct)) ? Number(stock.baseChangePct) : 0,
      });
    });
  });
  return Array.from(tickersBySymbol.values());
}

function createWatchlistSyncSignature(chain: WatchlistSyncChain | null | undefined, sourcePrefix: string): string {
  if (!chain || !Array.isArray(chain.groups)) return `${sourcePrefix}:empty`;
  return JSON.stringify({
    sourcePrefix,
    groups: chain.groups.map((group) => ({
      id: group.id,
      name: group.name,
      parentSectorId: group.parentSectorId,
      parentSectorNameJa: group.parentSectorNameJa,
      parentSectorNameEn: group.parentSectorNameEn,
      symbols: (group.stocks || []).map((stock) => normalizeStoredSymbolValue(stock.symbol || '')).filter(Boolean),
    })),
  });
}

function readStoredWatchlistSyncChain(): WatchlistSyncChain | null {
  return normalizeWatchlistSyncChain(readStoredValue<unknown>(VALUE_CHAIN_STORAGE_KEY, null));
}

function readStoredWatchlistSyncHistory(): WatchlistSyncHistoryEntry[] {
  const value = readStoredValue<unknown>(CHAIN_HISTORY_STORAGE_KEY, []);
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, index): WatchlistSyncHistoryEntry | null => {
      if (!entry || typeof entry !== 'object') return null;
      const source = entry as Partial<WatchlistSyncHistoryEntry>;
      const chain = normalizeWatchlistSyncChain(source.chain);
      if (!chain) return null;
      return {
        id: typeof source.id === 'string' ? source.id : `history-${index}`,
        importedAt: typeof source.importedAt === 'string' ? source.importedAt : undefined,
        chain,
      };
    })
    .filter((entry): entry is WatchlistSyncHistoryEntry => Boolean(entry));
}

function readStoredActiveWatchlistSyncHistoryId(): string | null {
  const value = localStorage.getItem(ACTIVE_CHAIN_HISTORY_ID_STORAGE_KEY);
  return value && value.trim() ? value.trim() : null;
}

function readStoredWatchlistSyncChains(): WatchlistSyncChain[] {
  const chains: WatchlistSyncChain[] = [];
  const seen = new Set<string>();
  const addChain = (rawChain: unknown) => {
    const chain = normalizeWatchlistSyncChain(rawChain);
    if (!chain) return;
    const signature = createWatchlistSyncSignature(chain, 'value-chain');
    if (seen.has(signature)) return;
    seen.add(signature);
    chains.push(chain);
  };

  const history = readStoredWatchlistSyncHistory();
  const activeHistoryId = readStoredActiveWatchlistSyncHistoryId();
  const activeHistoryEntry = history.find((entry) => entry.id === activeHistoryId);

  addChain(activeHistoryEntry?.chain);
  addChain(readStoredWatchlistSyncChain());
  history.forEach((entry) => addChain(entry.chain));

  return chains;
}

// Local default indicator generator to keep things resilient
function createDefaultIndicatorSettings(symbol: string): SymbolIndicatorSettings {
  const norm = symbol.toUpperCase();
  const isExpression = parseSymbolExpression(symbol) !== null;
  return {
    symbol: norm,
    indicators: {
      ma: { 
        enabled: !isExpression && (norm === 'VOO' || norm === 'AAPL'),
        period1: 5, color1: '#e7c039', 
        period2: 12, color2: '#d1d5db',
        period3: 20, color3: '#e152f2',
        style1: 'solid',
        style2: 'solid',
        style3: 'solid',
      },
      ema: { 
        enabled: !isExpression && (norm === 'QQQ' || norm === 'NVDA'),
        period1: 9, color1: '#f85f73', 
        period2: 26, color2: '#00e575',
        style1: 'solid',
        style2: 'solid',
      },
      boll: { 
        enabled: !isExpression,
        period: 20, 
        levels: [1, 2, 3],
        color: '#9ca3af',
        colorFill: 'rgba(108, 93, 211, 0.04)',
        style: 'dashed',
      },
      rsi: { 
        enabled: !isExpression,
        period: 14, 
        color: '#f3a14b', 
        style: 'solid',
        overbought: 70, 
        oversold: 30 
      },
      macd: { 
        enabled: !isExpression,
        fast: 12, 
        slow: 26, 
        signal: 9, 
        colorMacd: '#d1d5db',
        styleMacd: 'solid',
        colorSignal: '#ff9900', 
        styleSignal: 'dashed',
        colorHistUp: '#009b87',
        colorHistDown: '#ff4057'
      },
      vrvp: {
        enabled: false,
        rows: 24,
        widthPct: 22,
        colorUp: '#009b87',
        colorDown: '#ff4057',
        colorPoc: '#f3a14b',
      }
    }
  };
}

function createValueChainDefaultIndicatorSettings(symbol: string): SymbolIndicatorSettings {
  const defaults = createDefaultIndicatorSettings(symbol);
  const isExpression = parseSymbolExpression(symbol) !== null;
  return {
    ...defaults,
    indicators: {
      ...defaults.indicators,
      ma: { ...defaults.indicators.ma, enabled: false },
      ema: { ...defaults.indicators.ema, enabled: false },
      boll: { ...defaults.indicators.boll, enabled: false },
      rsi: { ...defaults.indicators.rsi, enabled: !isExpression },
      macd: { ...defaults.indicators.macd, enabled: !isExpression },
      vrvp: { ...defaults.indicators.vrvp, enabled: !isExpression },
    },
  };
}

function normalizeIndicatorSettings(
  symbol: string,
  raw?: Partial<SymbolIndicatorSettings>,
): SymbolIndicatorSettings {
  const defaults = createDefaultIndicatorSettings(symbol);
  const stored = raw?.indicators as Partial<SymbolIndicatorSettings['indicators']> | undefined;
  const storedBoll = stored?.boll as
    | (Partial<SymbolIndicatorSettings['indicators']['boll']> & { stdDev?: number })
    | undefined;
  const levels = Array.isArray(storedBoll?.levels)
    ? storedBoll.levels
        .map(Number)
        .filter((level) => Number.isFinite(level) && level > 0 && level <= 6)
    : [1, 2, 3];

  return {
    symbol: symbol.toUpperCase(),
    indicators: {
      ma: {
        ...defaults.indicators.ma,
        ...stored?.ma,
        style1: normalizeLineStyle(stored?.ma?.style1),
        style2: normalizeLineStyle(stored?.ma?.style2),
        style3: normalizeLineStyle(stored?.ma?.style3),
      },
      ema: {
        ...defaults.indicators.ema,
        ...stored?.ema,
        style1: normalizeLineStyle(stored?.ema?.style1),
        style2: normalizeLineStyle(stored?.ema?.style2),
      },
      boll: {
        ...defaults.indicators.boll,
        ...storedBoll,
        levels: levels.length > 0 ? Array.from(new Set(levels)).sort((a, b) => a - b) : [1, 2, 3],
        style: normalizeLineStyle(storedBoll?.style),
      },
      rsi: {
        ...defaults.indicators.rsi,
        ...stored?.rsi,
        style: normalizeLineStyle(stored?.rsi?.style),
      },
      macd: {
        ...defaults.indicators.macd,
        ...stored?.macd,
        styleMacd: normalizeLineStyle(stored?.macd?.styleMacd),
        styleSignal: normalizeLineStyle(stored?.macd?.styleSignal),
      },
      vrvp: { ...defaults.indicators.vrvp, ...stored?.vrvp },
    },
  };
}

interface MoomooTickerQuote {
  name: string;
  price: number;
  changePct: number;
  marketCap?: number;
}

interface MoomooBatchQuoteResult {
  success?: boolean;
  symbol?: string;
  name?: string;
  price?: number;
  changePct?: number;
  marketCap?: number;
  error?: string;
}

async function fetchJsonWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 15_000,
): Promise<{ response: Response; data: any }> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    const data = await response.json();
    return { response, data };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`通信が${Math.ceil(timeoutMs / 1000)}秒でタイムアウトしました。`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function searchMoomooSymbolCandidate(query: string): Promise<SymbolSearchCandidate | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  try {
    const { data } = await fetchJsonWithTimeout('/api/moomoo/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: trimmed, limit: 1 }),
    }, 15_000);
    const candidates = Array.isArray(data.candidates)
      ? data.candidates as SymbolSearchCandidate[]
      : [];
    return data.success && candidates.length > 0 ? candidates[0] : null;
  } catch {
    return null;
  }
}

function formatCandleLookupError(symbol: string): string {
  return `${symbol}のチャートデータを取得できません。会社名で再検索しても候補が確定できなかったため、ティッカーコードが違う可能性があります。銘柄名またはコードを確認してください。`;
}

export default function App() {
  // --- STATE ---
  const isDiscordAutomationPage = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('discordAutomation');
  const csvImportInputRef = useRef<HTMLInputElement | null>(null);
  const watchlistImportModeRef = useRef<WatchlistImportMode>('new-tab');
  const candleFetchInFlightRef = useRef(false);
  const candleFetchPendingRef = useRef(false);
  const candleFetchGenerationRef = useRef(0);
  const candleRetryTimerRef = useRef<number | null>(null);
  const forceCandleRefreshRef = useRef(false);
  const manualCandleRefreshSequenceRef = useRef(0);
  const manualCandleRefreshSymbolsRef = useRef<Set<string>>(new Set());
  const manualCandleRefreshBypassMarketPauseRef = useRef(false);
  const initialVisibleChartRefreshRef = useRef(true);
  const quoteFetchInFlightRef = useRef(false);
  const quoteFetchPendingRef = useRef(false);
  const quoteFetchManualTabQueueRef = useRef<Array<{
    tabId: string;
    includePausedMarkets: boolean;
  }>>([]);
  const quoteFetchAutoSweepRequestedRef = useRef(false);
  const quoteFetchAutoAttemptedTabIdsRef = useRef<Set<string>>(new Set());
  const quoteFetchLastAutoSweepAtRef = useRef(0);
  const watchlistAutoQuoteSignatureRef = useRef<string | null>(null);
  const watchlistTabSuppressClickRef = useRef(false);
  const moomooRealTimeActiveRef = useRef(true);
  const candlesCacheIndexedDbHydratedRef = useRef(false);
  const quoteCacheIndexedDbHydratedRef = useRef(false);
  const watchlistSyncSignatureRef = useRef<string | null>(null);
  const sharedWorkspaceHydratedRef = useRef(false);
  const sharedWorkspaceRevisionRef = useRef(0);
  const sharedWorkspaceSkipNextSaveRef = useRef(false);
  const sharedWorkspaceSaveInFlightRef = useRef(false);
  const sharedWorkspaceAutoMigrationAttemptedRef = useRef(false);
  const [appView, setAppView] = useState<AppView>(() =>
    readStoredValue('mooview_active_view', 'charts')
  );
  const [discordAutomationTargetPanelIds, setDiscordAutomationTargetPanelIds] = useState<string[]>([]);
  const [discordAutomationUnavailableQuoteOperands, setDiscordAutomationUnavailableQuoteOperands] = useState<string[]>([]);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [videoExportMenu, setVideoExportMenu] = useState<{ x: number; y: number } | null>(null);
  const [imageExportMenu, setImageExportMenu] = useState<{ x: number; y: number } | null>(null);
  const [chartAiPromptMenu, setChartAiPromptMenu] = useState<{ x: number; y: number } | null>(null);
  const [chartVideoExportSettings, setChartVideoExportSettings] = useState<ChartVideoExportSettings>(
    () => normalizeChartVideoExportSettings(
      readStoredValue(CHART_VIDEO_EXPORT_SETTINGS_STORAGE_KEY, DEFAULT_CHART_VIDEO_EXPORT_SETTINGS),
    ),
  );
  const [chartImageExportSettings, setChartImageExportSettings] = useState<ChartImageExportSettings>(
    () => normalizeChartImageExportSettings(
      readStoredValue(CHART_IMAGE_EXPORT_SETTINGS_STORAGE_KEY, DEFAULT_CHART_IMAGE_EXPORT_SETTINGS),
    ),
  );
  const [chartAiPrompt, setChartAiPrompt] = useState<string>(
    () => readStoredValue(CHART_AI_PROMPT_STORAGE_KEY, DEFAULT_CHART_AI_PROMPT),
  );
  const [chartAiModel, setChartAiModel] = useState<GeminiChartModelId>(
    () => normalizeGeminiChartModelId(
      readStoredValue(CHART_AI_MODEL_STORAGE_KEY, DEFAULT_GEMINI_CHART_MODEL),
    ),
  );
  const [chartAiStatus, setChartAiStatus] = useState<{
    stage: 'capturing' | 'requesting';
    progress: number;
  } | null>(null);
  const [chartAiResult, setChartAiResult] = useState<ChartAiAnalysisResult | null>(null);
  const [chartAiCopied, setChartAiCopied] = useState(false);
  const [discordAutomationSettingsOpen, setDiscordAutomationSettingsOpen] = useState(false);
  const [discordAutomationSettings, setDiscordAutomationSettings] = useState<DiscordAutomationSettings>(
    () => createDefaultDiscordAutomationSettings(),
  );
  const [discordAutomationRuns, setDiscordAutomationRuns] = useState<DiscordAutomationRunRecord[]>([]);
  const [discordAutomationActiveTab, setDiscordAutomationActiveTab] = useState<'settings' | 'history'>('settings');
  const [discordAutomationLoading, setDiscordAutomationLoading] = useState(false);
  const [discordAutomationSaving, setDiscordAutomationSaving] = useState(false);
  const [discordAutomationMessage, setDiscordAutomationMessage] = useState<string | null>(null);
  const [discordAutomationSaveFeedback, setDiscordAutomationSaveFeedback] = useState<
    'success' | 'error' | null
  >(null);
  const discordAutomationSaveFeedbackTimerRef = useRef<number | null>(null);
  const [chartExportStatus, setChartExportStatus] = useState<{
    kind: 'video' | 'image';
    progress: number;
  } | null>(null);
  const chartVideoExportAbortControllerRef = useRef<AbortController | null>(null);
  const [chartExportError, setChartExportError] = useState<string | null>(null);
  const [pendingIosVideoFiles, setPendingIosVideoFiles] = useState<File[]>([]);
  const [iosVideoShareInFlight, setIosVideoShareInFlight] = useState(false);
  const [chartExportPlayback, setChartExportPlayback] = useState<{
    panelIds: string[];
    progress: number;
  } | null>(null);
  const [workspacePersistenceMode, setWorkspacePersistenceMode] =
    useState<WorkspacePersistenceMode>('checking');
  const sharedWorkspaceProfile = useMemo(detectSharedWorkspaceProfile, []);
  const [sharedBrowserSettings, setSharedBrowserSettings] =
    useState<Record<string, string>>(() => readSharedBrowserSettings());
  const [sharedWorkspaceUpdatedAt, setSharedWorkspaceUpdatedAt] = useState<string | null>(null);
  const [sharedWorkspaceError, setSharedWorkspaceError] = useState<string | null>(null);
  const [workspaceMigrationMessage, setWorkspaceMigrationMessage] = useState<string | null>(null);
  const [workspaceSeededFromLocal, setWorkspaceSeededFromLocal] = useState(false);
  const candleFetchTimestampsRef = useRef<Record<string, number>>(
    normalizeTimestampMap(readStoredValue<unknown>(CANDLES_CACHE_META_STORAGE_KEY, {}))
  );
  // Tickers list management
  const [tickers, setTickers] = useState<TickerInfo[]>(() => {
    const saved = localStorage.getItem('tv_dashboard_tickers');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as unknown;
        if (Array.isArray(parsed)) {
          const normalizedTickers = parsed
            .map(normalizeTickerInfo)
            .filter((ticker): ticker is TickerInfo => Boolean(ticker));
          if (normalizedTickers.length > 0) {
            return normalizedTickers;
          }
        }
      } catch (e) {
        console.error("Failed to parse tickers, resetting", e);
      }
    }
    return DEFAULT_TICKERS;
  });
  const [headerTickerSymbols, setHeaderTickerSymbols] = useState<string[]>(() => {
    const savedSymbols = readStoredValue<string[]>(HEADER_TICKER_SYMBOLS_STORAGE_KEY, DEFAULT_HEADER_TICKER_SYMBOLS);
    const normalized = Array.from(new Set(
      savedSymbols.map((symbol) => normalizeTickerSymbolForStorage(symbol)).filter(Boolean),
    ));
    return normalized.length > 0 ? normalized : DEFAULT_HEADER_TICKER_SYMBOLS;
  });
  const [headerTickerMenu, setHeaderTickerMenu] = useState<'add' | 'remove' | null>(null);
  const headerTickerViewportRef = useRef<HTMLDivElement | null>(null);
  const headerTickerTrackRef = useRef<HTMLDivElement | null>(null);
  const [headerTickerOverflow, setHeaderTickerOverflow] = useState(false);
  const previousHeaderTickerValuesRef = useRef<Record<string, number | null>>({});
  const headerTickerFlashTimeoutRef = useRef<number | null>(null);
  const [headerTickerFlash, setHeaderTickerFlash] = useState<Record<string, 'up' | 'down'>>({});

  const [newSymbolInput, setNewSymbolInput] = useState('');
  const [tickerSearchOpen, setTickerSearchOpen] = useState(false);
  const [tickerSearchLoading, setTickerSearchLoading] = useState(false);
  const [tickerSearchError, setTickerSearchError] = useState<string | null>(null);
  const [tickerSearchCandidates, setTickerSearchCandidates] = useState<SymbolSearchCandidate[]>([]);
  const [watchlistTabs, setWatchlistTabs] = useState<WatchlistTab[]>(() =>
    normalizeWatchlistTabs(readStoredValue<unknown>('tv_dashboard_watchlist_tabs', null), tickers)
  );
  const [activeWatchlistTabId, setActiveWatchlistTabId] = useState<string>(() =>
    readStoredValue('tv_dashboard_active_watchlist_tab', DEFAULT_WATCHLIST_TAB_ID)
  );
  const [watchlistQuoteFetchModes, setWatchlistQuoteFetchModes] = useState<Record<string, WatchlistQuoteFetchMode>>(() =>
    normalizeWatchlistQuoteFetchModes(readStoredValue<unknown>(WATCHLIST_QUOTE_FETCH_MODES_STORAGE_KEY, {}))
  );
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionNameDraft, setSectionNameDraft] = useState('');
  const [watchlistColumnWidths, setWatchlistColumnWidths] = useState<WatchlistColumnWidths>(() =>
    normalizeWatchlistColumnWidths(readStoredValue<unknown>('tv_dashboard_watchlist_column_widths', null))
  );
  const [showWatchlistNameColumn, setShowWatchlistNameColumn] = useState<boolean>(() =>
    readStoredValue('tv_dashboard_watchlist_show_name_column', true)
  );
  const [watchlistSort, setWatchlistSort] = useState<WatchlistSortState>(() =>
    normalizeWatchlistSort(readStoredValue<unknown>('tv_dashboard_watchlist_sort', null))
  );
  const [watchlistNameOverrides, setWatchlistNameOverrides] = useState<Record<string, string>>(() =>
    normalizeWatchlistNameOverrides(readStoredValue<unknown>(WATCHLIST_NAME_OVERRIDES_STORAGE_KEY, {}))
  );
  const [draggedTicker, setDraggedTicker] = useState<{
    symbol: string;
    symbols: string[];
    sectionId: string;
  } | null>(null);
  const [draggedBasket, setDraggedBasket] = useState<{
    sectionId: string;
    symbols: string[];
  } | null>(null);
  const draggedBasketRef = useRef<{ sectionId: string; symbols: string[] } | null>(null);
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [draggedWatchlistTabId, setDraggedWatchlistTabId] = useState<string | null>(null);
  const [sectionMenu, setSectionMenu] = useState<{
    sectionId: string;
    x: number;
    y: number;
  } | null>(null);
  const [watchlistHeaderMenu, setWatchlistHeaderMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [watchlistTabMenu, setWatchlistTabMenu] = useState<{
    tabId: string;
    x: number;
    y: number;
  } | null>(null);
  const [watchlistImporting, setWatchlistImporting] = useState(false);
  const [watchlistImportMessage, setWatchlistImportMessage] = useState<string | null>(null);
  const [watchlistImportMenuOpen, setWatchlistImportMenuOpen] = useState(false);
  const [watchlistImportMode, setWatchlistImportMode] = useState<WatchlistImportMode>('new-tab');
  const [watchlistTransferMenuLayer, setWatchlistTransferMenuLayer] = useState<WatchlistTransferMenuLayer>('root');
  const [selectedWatchlistExportTabIds, setSelectedWatchlistExportTabIds] = useState<string[]>([]);

  // Watchlist multiple selection and right-click delete state
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [lastClickedSymbol, setLastClickedSymbol] = useState<string | null>(null);
  const [watchlistContextMenu, setWatchlistContextMenu] = useState<{
    x: number;
    y: number;
    symbols: string[];
    sectionId: string;
  } | null>(null);
  const [watchlistEmptyMenu, setWatchlistEmptyMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [watchlistNameEditModal, setWatchlistNameEditModal] = useState<{
    symbol: string;
    sectionId: string;
    draftName: string;
    defaultName: string;
  } | null>(null);
  const [chartNameEditModal, setChartNameEditModal] = useState<{
    mode: 'rename' | 'create-comparison';
    panelId?: string;
    draftName: string;
    defaultName: string;
  } | null>(null);

  // Custom Grid Layout dimensions (max 9x9)
  const [gridRows, setGridRows] = useState<number>(() => readStoredValue('tv_dashboard_grid_rows', 2));
  const [gridCols, setGridCols] = useState<number>(() => readStoredValue('tv_dashboard_grid_cols', 2));
  const [gridPickerOpen, setGridPickerOpen] = useState<boolean>(false);
  const [tabsDropdownAnchor, setTabsDropdownAnchor] = useState<{
    x: number;
    y: number;
    width: number;
  } | null>(null);
  const [watchlistTargetMenu, setWatchlistTargetMenu] = useState<{
    panelId: string;
    x: number;
    y: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [displayRangeMenu, setDisplayRangeMenu] = useState<{
    panelId: string;
    x: number;
    y: number;
  } | null>(null);
  // Watchlist tabs overflow dropdown open state
  const [tabsDropdownOpen, setTabsDropdownOpen] = useState<boolean>(false);
  const watchlistTabsViewportRef = useRef<HTMLDivElement | null>(null);
  const watchlistTabRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const draggedPanelIdRef = useRef<string | null>(null);
  const chartMissingDataRefreshRef = useRef<{ signature: string; requestedAt: number }>({
    signature: '',
    requestedAt: 0,
  });

  // Chart Panels state
  const [panels, setPanels] = useState<ChartPanel[]>(() => {
    const saved = localStorage.getItem('tv_dashboard_panels');
    if (saved) {
      try {
        return (JSON.parse(saved) as ChartPanel[]).map(normalizePanel);
      } catch (e) {
        console.error("Failed to parse panels, resetting", e);
      }
    }
    // Default structure: 2 side by side charts (VOO and QQQ)
    return [
      {
        id: 'panel-1',
        symbol: 'VOO',
        timeframe: DAY_RANGE_OVERVIEW_TIMEFRAME,
        displayRange: DEFAULT_DISPLAY_RANGE,
        zoomFactor: DAY_RANGE_ZOOM_FACTOR,
        scrollOffsetPct: 100,
        showRsi: true,
        showMacd: false,
        showVolume: true,
        priceScale: 1,
        priceOffsetPct: 0,
        rsiHeightPct: 25,
        macdHeightPct: 25,
      },
      {
        id: 'panel-2',
        symbol: 'QQQ',
        timeframe: DAY_RANGE_OVERVIEW_TIMEFRAME,
        displayRange: DEFAULT_DISPLAY_RANGE,
        zoomFactor: DAY_RANGE_ZOOM_FACTOR,
        scrollOffsetPct: 100,
        showRsi: false,
        showMacd: true,
        showVolume: true,
        priceScale: 1,
        priceOffsetPct: 0,
        rsiHeightPct: 25,
        macdHeightPct: 25,
      }
    ];
  });
  const [valueChainChartState, setValueChainChartState] = useState<ChartPanel>(() => {
    const defaults: ChartPanel = {
      id: 'value-chain-side-chart',
      symbol: 'NVDA',
      timeframe: DAY_RANGE_OVERVIEW_TIMEFRAME,
      displayRange: DEFAULT_DISPLAY_RANGE,
      zoomFactor: DAY_RANGE_ZOOM_FACTOR,
      scrollOffsetPct: 100,
      showRsi: true,
      showMacd: true,
      showVolume: true,
      priceScale: 1,
      priceOffsetPct: 0,
      rsiHeightPct: 25,
      macdHeightPct: 25,
    };
    const saved = readStoredValue<Partial<ChartPanel> | null>(VALUE_CHAIN_CHART_STATE_STORAGE_KEY, null);
    return normalizePanel({
      ...defaults,
      ...(saved || {}),
      id: defaults.id,
    });
  });
  const [valueChainChartSymbols, setValueChainChartSymbols] = useState<string[]>(['NVDA']);
  const [comparisonLabelFontSize, setComparisonLabelFontSize] = useState<number>(() =>
    Math.round(clampStoredNumber(readStoredValue<unknown>(COMPARISON_LABEL_FONT_SIZE_STORAGE_KEY, 10), 10, 8, 18))
  );
  const [comparisonLabelLayoutMode, setComparisonLabelLayoutMode] = useState<ComparisonLabelLayoutMode>(() =>
    normalizeComparisonLabelLayoutMode(readStoredValue<unknown>(COMPARISON_LABEL_LAYOUT_MODE_STORAGE_KEY, 'changePct'))
  );
  const updateComparisonLabelFontSize = (fontSize: number) => {
    setComparisonLabelFontSize(Math.round(clampStoredNumber(fontSize, 10, 8, 18)));
  };
  const updateComparisonLabelLayoutMode = (mode: ComparisonLabelLayoutMode) => {
    setComparisonLabelLayoutMode(normalizeComparisonLabelLayoutMode(mode));
  };

  // Symbol specific indicator settings
  const [indicatorDatabase, setIndicatorDatabase] = useState<Record<string, SymbolIndicatorSettings>>(() => {
    const saved = localStorage.getItem('tv_dashboard_indicators');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Record<string, Partial<SymbolIndicatorSettings>>;
        return Object.fromEntries(
          Object.entries(parsed).map(([symbol, settings]) => [
            symbol.toUpperCase(),
            normalizeIndicatorSettings(symbol, settings),
          ])
        );
      } catch (e) {
        console.error("Failed to parse indicator settings, resetting", e);
      }
    }
    // Seed default indicator records for VOO, QQQ, and others
    const initialRecords: Record<string, SymbolIndicatorSettings> = {};
    DEFAULT_TICKERS.forEach((t) => {
      initialRecords[t.symbol.toUpperCase()] = createDefaultIndicatorSettings(t.symbol);
    });
    return initialRecords;
  });

  // Active Symbol indicators currently editing (shows configuration controls)
  const [focusedSymbolIndex, setFocusedSymbolIndex] = useState<string>(() =>
    readStoredValue('tv_dashboard_focused_symbol', 'VOO')
  );

  // Toggle for Official TradingView widget embed instead of local custom interactive canvas
  // Key represents panel ID, value represents isTradingViewWidgetActive
  const [panelEngineToggle, setPanelEngineToggle] = useState<Record<string, boolean>>(() =>
    readStoredValue('tv_dashboard_panel_engines', {
      'panel-1': false,
      'panel-2': false,
    })
  );

  // Tickers historical candles cache
  const [candlesCache, setCandlesCache] = useState<Record<string, Candle[]>>(() =>
    normalizeStoredCandlesCache(readStoredValue<unknown>(CANDLES_CACHE_STORAGE_KEY, {}))
  );
  const [candleFetchErrors, setCandleFetchErrors] = useState<Record<string, string>>({});
  const [quoteCache, setQuoteCache] = useState<Record<string, MoomooTickerQuote | null>>({});
  const [quoteFetchFailures, setQuoteFetchFailures] = useState<Record<string, string>>({});
  const [quoteFetchInFlight, setQuoteFetchInFlight] = useState(false);
  const [quoteFetchTarget, setQuoteFetchTarget] = useState<WatchlistQuoteFetchTarget | null>(null);
  const [manualChartRefreshInFlight, setManualChartRefreshInFlight] = useState(false);

  // Layout presentation selection: 'grid' (automatic grid wrapping) | 'columns' (side-by-side flex) | 'rows' (stacked flex)
  const [layoutStyle, setLayoutStyle] = useState<'grid' | 'columns' | 'rows'>(() =>
    readStoredValue('tv_dashboard_layout_style', 'grid')
  );

  // Sidebar visibility on the right - default closed
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    readStoredValue('tv_dashboard_sidebar_open', true)
  );
  const [sidebarView, setSidebarView] = useState<SidebarView>(() =>
    readStoredValue('tv_dashboard_sidebar_view', 'watchlist')
  );
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    clampStoredNumber(
      readStoredValue<unknown>('tv_dashboard_sidebar_width', DEFAULT_SIDEBAR_WIDTH),
      DEFAULT_SIDEBAR_WIDTH,
      MIN_SIDEBAR_WIDTH,
      860,
    )
  );
  const [isMobileViewport, setIsMobileViewport] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  ));
  const [mobileSheetView, setMobileSheetView] = useState<MobileSheetView | null>(null);
  const [mobileActivePanelIndex, setMobileActivePanelIndex] = useState(0);
  const mobileChartSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

  // Active panel ID currently displaying comparison symbol overlay selector
  const [activeComparisonPopoverPanelId, setActiveComparisonPopoverPanelId] = useState<string | null>(null);

  // Resize weights for resizable bento grid layout
  const [colWeights, setColWeights] = useState<Record<string, number>>(() =>
    readStoredValue('tv_dashboard_column_widths', {})
  );
  const [panelHeights, setPanelHeights] = useState<Record<string, number>>(() =>
    readStoredValue('tv_dashboard_panel_heights', {})
  );

  const sharedWorkspaceSettings = useMemo<SharedWorkspaceSettings>(() => ({
    schemaVersion: 1,
    seededFromLocal: workspaceSeededFromLocal,
    panels,
    tickers: compactTickersForStorage(tickers),
    watchlistTabs,
    activeWatchlistTabId,
    watchlistQuoteFetchModes,
    watchlistNameOverrides,
    indicatorDatabase,
    focusedSymbolIndex,
    panelEngineToggle,
    layoutStyle,
    gridRows,
    gridCols,
    colWeights,
    panelHeights,
    comparisonLabelFontSize,
    comparisonLabelLayoutMode,
    browserSettings: sharedBrowserSettings,
  }), [
    activeWatchlistTabId,
    colWeights,
    comparisonLabelFontSize,
    comparisonLabelLayoutMode,
    focusedSymbolIndex,
    gridCols,
    gridRows,
    indicatorDatabase,
    layoutStyle,
    panelEngineToggle,
    panelHeights,
    panels,
    sharedBrowserSettings,
    tickers,
    watchlistNameOverrides,
    watchlistQuoteFetchModes,
    watchlistTabs,
    workspaceSeededFromLocal,
  ]);

  const applySharedWorkspaceSettings = (settings: SharedWorkspaceSettings): boolean => {
    const normalizedTickers = compactTickersForStorage(
      Array.isArray(settings.tickers)
        ? settings.tickers
          .map(normalizeTickerInfo)
          .filter((ticker): ticker is TickerInfo => Boolean(ticker))
        : [],
    );
    const effectiveTickers = normalizedTickers.length > 0 ? normalizedTickers : DEFAULT_TICKERS;
    const normalizedPanels = Array.isArray(settings.panels)
      ? settings.panels.slice(0, 12).map(normalizePanel)
      : [];
    if (normalizedPanels.length === 0) {
      throw new Error('共有設定に有効なチャートがありません。');
    }
    const normalizedWatchlistTabs = normalizeWatchlistTabs(settings.watchlistTabs, effectiveTickers);
    const normalizedIndicatorDatabase = Object.fromEntries(
      Object.entries(
        settings.indicatorDatabase && typeof settings.indicatorDatabase === 'object'
          ? settings.indicatorDatabase
          : {},
      ).map(([symbol, indicatorSettings]) => [
        symbol.toUpperCase(),
        normalizeIndicatorSettings(symbol, indicatorSettings),
      ]),
    );
    const cloudBrowserSettings = Object.fromEntries(
      Object.entries(
        settings.browserSettings && typeof settings.browserSettings === 'object'
          ? settings.browserSettings
          : {},
      ).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
    const missingChartAiBrowserSettings = Object.fromEntries(
      CHART_AI_SHARED_SETTING_KEYS.flatMap((key) => {
        if (typeof cloudBrowserSettings[key] === 'string') return [];
        const localValue = localStorage.getItem(key);
        return localValue === null ? [] : [[key, localValue] as const];
      }),
    );
    const shouldSeedChartAiBrowserSettings =
      Object.keys(missingChartAiBrowserSettings).length > 0;
    const normalizedBrowserSettings = {
      ...missingChartAiBrowserSettings,
      ...cloudBrowserSettings,
    };
    const browserSettingsChanged = applySharedBrowserSettings(normalizedBrowserSettings);

    // AI設定がクラウド未登録なら、ローカル値を削除せず次の保存でOCIへ初期登録する。
    sharedWorkspaceSkipNextSaveRef.current = !shouldSeedChartAiBrowserSettings;
    setTickers(effectiveTickers);
    setPanels(normalizedPanels);
    setWatchlistTabs(normalizedWatchlistTabs);
    setActiveWatchlistTabId(
      normalizedWatchlistTabs.some((tab) => tab.id === settings.activeWatchlistTabId)
        ? settings.activeWatchlistTabId
        : normalizedWatchlistTabs[0]?.id ?? DEFAULT_WATCHLIST_TAB_ID,
    );
    setWatchlistQuoteFetchModes(normalizeWatchlistQuoteFetchModes(settings.watchlistQuoteFetchModes));
    setWatchlistNameOverrides(normalizeWatchlistNameOverrides(settings.watchlistNameOverrides));
    setIndicatorDatabase(normalizedIndicatorDatabase);
    setFocusedSymbolIndex(
      typeof settings.focusedSymbolIndex === 'string' && settings.focusedSymbolIndex
        ? settings.focusedSymbolIndex
        : normalizedPanels[0]?.symbol || 'VOO',
    );
    setPanelEngineToggle(normalizeBooleanRecord(settings.panelEngineToggle));
    setLayoutStyle(
      settings.layoutStyle === 'columns' || settings.layoutStyle === 'rows'
        ? settings.layoutStyle
        : 'grid',
    );
    setGridRows(Math.round(clampStoredNumber(settings.gridRows, 2, 1, 9)));
    setGridCols(Math.round(clampStoredNumber(settings.gridCols, 2, 1, 9)));
    setColWeights(normalizeNumberRecord(settings.colWeights));
    setPanelHeights(normalizeNumberRecord(settings.panelHeights));
    setComparisonLabelFontSize(
      Math.round(clampStoredNumber(settings.comparisonLabelFontSize, 10, 8, 18)),
    );
    setComparisonLabelLayoutMode(
      normalizeComparisonLabelLayoutMode(settings.comparisonLabelLayoutMode),
    );
    setSharedBrowserSettings(normalizedBrowserSettings);
    setWorkspaceSeededFromLocal(settings.seededFromLocal === true);
    return browserSettingsChanged;
  };

  const fetchSharedWorkspaceSettings = async (
    endpoint = getSharedWorkspaceEndpoint(sharedWorkspaceProfile),
  ): Promise<SharedWorkspaceEnvelope> => {
    const response = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    return readWorkspaceEnvelope(response);
  };

  const reloadForSharedBrowserSettings = (revision: number): boolean => {
    const markerKey = `mooview_shared_workspace_applied_${sharedWorkspaceProfile}`;
    const revisionValue = String(revision);
    if (sessionStorage.getItem(markerKey) === revisionValue) {
      return false;
    }
    sessionStorage.setItem(markerKey, revisionValue);
    window.location.reload();
    return true;
  };

  const refreshSharedWorkspaceSettings = async () => {
    if (workspacePersistenceMode !== 'shared' || sharedWorkspaceSaveInFlightRef.current) {
      return;
    }
    try {
      const envelope = await fetchSharedWorkspaceSettings();
      if (
        envelope.enabled
        && envelope.settings
        && envelope.revision > sharedWorkspaceRevisionRef.current
      ) {
        const browserSettingsChanged = applySharedWorkspaceSettings(envelope.settings);
        sharedWorkspaceRevisionRef.current = envelope.revision;
        setSharedWorkspaceUpdatedAt(envelope.updatedAt);
        if (
          browserSettingsChanged
          && !isDiscordAutomationPage
          && reloadForSharedBrowserSettings(envelope.revision)
        ) {
          return;
        }
      }
      setSharedWorkspaceError(null);
    } catch (error) {
      setSharedWorkspaceError(error instanceof Error ? error.message : '共有設定を再取得できませんでした。');
    }
  };

  const handleCopyWorkspaceToOci = async () => {
    if (!window.confirm(
      '現在のローカルチャート・ウォッチリスト・インジケーター設定で、OCIの共有設定を上書きします。続行しますか？',
    )) {
      return;
    }
    setWorkspaceMigrationMessage('OCIへ設定をコピーしています…');
    setSharedWorkspaceError(null);
    try {
      const response = await fetch(
        getSharedWorkspaceEndpoint('desktop', DEFAULT_OCI_SHARED_WORKSPACE_URL),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            settings: {
              ...sharedWorkspaceSettings,
              seededFromLocal: true,
            },
            force: true,
          }),
        },
      );
      const saved = await readWorkspaceEnvelope(response);
      setWorkspaceMigrationMessage(
        `OCIへ保存しました（チャート${saved.settings?.panels.length ?? panels.length}件）。`,
      );
    } catch (error) {
      setWorkspaceMigrationMessage(null);
      setSharedWorkspaceError(
        error instanceof Error ? error.message : 'OCIへの設定コピーに失敗しました。',
      );
    }
  };

  // Real-time ticker price update counter/trigger
  const [tickTrigger, setTickTrigger] = useState(0);

  const scheduleCandleFetchRetry = (delayMs: number) => {
    if (candleRetryTimerRef.current !== null) return;
    candleRetryTimerRef.current = window.setTimeout(() => {
      candleRetryTimerRef.current = null;
      if (!moomooRealTimeActiveRef.current) return;
      setTickTrigger((current) => current + 1);
    }, Math.max(1_000, delayMs));
  };

  useEffect(() => {
    return () => {
      if (candleRetryTimerRef.current !== null) {
        window.clearTimeout(candleRetryTimerRef.current);
        candleRetryTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (appView !== 'macro-flow') return;
    forceCandleRefreshRef.current = true;
    setValueChainChartState((current) => (
      current.displayRange === DEFAULT_DISPLAY_RANGE
      && current.timeframe === DAY_RANGE_OVERVIEW_TIMEFRAME
      && current.scrollOffsetPct === 100
      && current.zoomFactor === DAY_RANGE_ZOOM_FACTOR
        ? current
        : {
            ...current,
            displayRange: DEFAULT_DISPLAY_RANGE,
            timeframe: DAY_RANGE_OVERVIEW_TIMEFRAME,
            zoomFactor: DAY_RANGE_ZOOM_FACTOR,
            scrollOffsetPct: 100,
          }
    ));
    setTickTrigger((current) => current + 1);
  }, [appView]);

  // Status message tracker for simulated API state
  const [networkLatency, setNetworkLatency] = useState(24);
  const [currentClockTime, setCurrentClockTime] = useState(() => formatClockTime());
  const [lastApiSyncTime, setLastApiSyncTime] = useState(() => formatClockTime());

  // --- MOOMOO API (OPEND) CONFIG AND STATE ---

  // --- MOOMOO API (OPEND) CONFIG AND STATE ---
  const [moomooStatus, setMoomooStatus] = useState<'disconnected' | 'connected' | 'connecting' | 'error'>('disconnected');
  const [moomooError, setMoomooError] = useState<string | null>(null);
  const [moomooRealTimeActive, setMoomooRealTimeActive] = useState<boolean>(() => {
    const saved = localStorage.getItem('moomoo_active');
    return saved === null ? true : saved === 'true';
  });

  useEffect(() => {
    const handleGlobalStockDelete = (event: Event) => {
      const customEvent = event as CustomEvent<{ symbol: string }>;
      const deleteTargetSymbol = normalizeStoredSymbolValue(customEvent.detail.symbol);
      const normalizedTarget = normalizeTickerSymbolForStorage(deleteTargetSymbol);
      if (!normalizedTarget) return;

      // 1. tickers から削除
      setTickers((current) =>
        current.filter((t) => normalizeTickerSymbolForStorage(t.symbol) !== normalizedTarget)
      );

      // 2. headerTickerSymbols から削除
      setHeaderTickerSymbols((current) =>
        current.filter((s) => normalizeTickerSymbolForStorage(s) !== normalizedTarget)
      );

      // 3. watchlistTabs から削除
      setWatchlistTabs((current) =>
        current.map((tab) => ({
          ...tab,
          sections: tab.sections.map((section) => ({
            ...section,
            symbols: (section.symbols || []).filter((s) => normalizeTickerSymbolForStorage(s) !== normalizedTarget),
          })),
        }))
      );
    };

    window.addEventListener('mooview:delete-global-stock', handleGlobalStockDelete);
    return () => {
      window.removeEventListener('mooview:delete-global-stock', handleGlobalStockDelete);
    };
  }, []);

  // --- PERSISTENCE EFFECT WRITERS ---
  useEffect(() => {
    const captureBrowserSettings = () => {
      const nextSettings = readSharedBrowserSettings();
      setSharedBrowserSettings((current) => (
        areStringRecordsEqual(current, nextSettings) ? current : nextSettings
      ));
    };
    captureBrowserSettings();
    const interval = window.setInterval(captureBrowserSettings, 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!videoExportMenu && !imageExportMenu && !chartAiPromptMenu) return;
    const closeExportMenus = () => {
      setVideoExportMenu(null);
      setImageExportMenu(null);
      setChartAiPromptMenu(null);
    };
    window.addEventListener('click', closeExportMenus);
    return () => window.removeEventListener('click', closeExportMenus);
  }, [chartAiPromptMenu, imageExportMenu, videoExportMenu]);

  useEffect(() => {
    let cancelled = false;

    const hydrateSharedWorkspace = async () => {
      try {
        const envelope = await fetchSharedWorkspaceSettings();
        if (cancelled) return;
        if (!envelope.enabled) {
          setWorkspacePersistenceMode('local');
          sharedWorkspaceHydratedRef.current = true;
          return;
        }

        const browserSettingsChanged = envelope.settings
          ? applySharedWorkspaceSettings(envelope.settings)
          : false;
        sharedWorkspaceRevisionRef.current = envelope.revision;
        sharedWorkspaceHydratedRef.current = true;
        setSharedWorkspaceUpdatedAt(envelope.updatedAt);
        setSharedWorkspaceError(null);
        setWorkspacePersistenceMode('shared');
        if (
          browserSettingsChanged
          && !isDiscordAutomationPage
          && reloadForSharedBrowserSettings(envelope.revision)
        ) {
          return;
        }
      } catch (error) {
        if (cancelled) return;
        sharedWorkspaceHydratedRef.current = true;
        setWorkspacePersistenceMode('local');
        setSharedWorkspaceError(
          error instanceof Error ? error.message : '共有設定の確認に失敗しました。',
        );
      }
    };

    void hydrateSharedWorkspace();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      workspacePersistenceMode !== 'shared'
      || !sharedWorkspaceHydratedRef.current
    ) {
      return;
    }
    if (sharedWorkspaceSkipNextSaveRef.current) {
      sharedWorkspaceSkipNextSaveRef.current = false;
      return;
    }

    const saveTimer = window.setTimeout(() => {
      const saveSharedWorkspace = async () => {
        sharedWorkspaceSaveInFlightRef.current = true;
        try {
          const response = await fetch(getSharedWorkspaceEndpoint(sharedWorkspaceProfile), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              settings: sharedWorkspaceSettings,
              expectedRevision: sharedWorkspaceRevisionRef.current,
            }),
          });
          if (response.status === 409) {
            sharedWorkspaceSaveInFlightRef.current = false;
            await refreshSharedWorkspaceSettings();
            return;
          }
          const saved = await readWorkspaceEnvelope(response);
          sharedWorkspaceRevisionRef.current = saved.revision;
          sessionStorage.setItem(
            `mooview_shared_workspace_applied_${sharedWorkspaceProfile}`,
            String(saved.revision),
          );
          setSharedWorkspaceUpdatedAt(saved.updatedAt);
          setSharedWorkspaceError(null);
        } catch (error) {
          setSharedWorkspaceError(
            error instanceof Error ? error.message : '共有設定を保存できませんでした。',
          );
        } finally {
          sharedWorkspaceSaveInFlightRef.current = false;
        }
      };
      void saveSharedWorkspace();
    }, SHARED_WORKSPACE_SAVE_DELAY_MS);

    return () => window.clearTimeout(saveTimer);
  }, [sharedWorkspaceSettings, workspacePersistenceMode]);

  useEffect(() => {
    if (workspacePersistenceMode !== 'shared') return;
    const handleWindowFocus = () => {
      void refreshSharedWorkspaceSettings();
    };
    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [workspacePersistenceMode]);

  useEffect(() => {
    if (
      workspacePersistenceMode !== 'local'
      || sharedWorkspaceProfile !== 'desktop'
      || sharedWorkspaceAutoMigrationAttemptedRef.current
    ) {
      return;
    }
    sharedWorkspaceAutoMigrationAttemptedRef.current = true;

    const migrateIfOciIsEmpty = async () => {
      try {
        const endpoint = getSharedWorkspaceEndpoint('desktop', DEFAULT_OCI_SHARED_WORKSPACE_URL);
        const existing = await fetchSharedWorkspaceSettings(endpoint);
        if (existing.settings?.seededFromLocal === true) {
          return;
        }
        setWorkspaceMigrationMessage('OCIの初期設定を作成しています…');
        const response = await fetch(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            settings: {
              ...sharedWorkspaceSettings,
              seededFromLocal: true,
            },
            force: true,
          }),
        });
        const saved = await readWorkspaceEnvelope(response);
        setWorkspaceMigrationMessage(
          `現在の設定をOCIへ自動保存しました（チャート${saved.settings?.panels.length ?? panels.length}件）。`,
        );
      } catch (error) {
        setSharedWorkspaceError(
          error instanceof Error ? error.message : 'OCIへの初期設定コピーに失敗しました。',
        );
      }
    };

    void migrateIfOciIsEmpty();
  }, [workspacePersistenceMode]);

  useEffect(() => {
    let cancelled = false;

    const hydrateMarketCaches = async () => {
      try {
        const [indexedDbCache, indexedDbMeta, indexedDbQuotes] = await Promise.all([
          readCandlesCacheIndexedDb<unknown>(CANDLES_CACHE_INDEXED_DB_CACHE_KEY),
          readCandlesCacheIndexedDb<unknown>(CANDLES_CACHE_INDEXED_DB_META_KEY),
          readCandlesCacheIndexedDb<unknown>(QUOTE_CACHE_INDEXED_DB_CACHE_KEY),
        ]);
        if (cancelled) return;

        const normalizedIndexedDbCache = normalizeStoredCandlesCache(indexedDbCache);
        if (Object.keys(normalizedIndexedDbCache).length > 0) {
          setCandlesCache((currentCache) => compactCandlesCache({
            ...currentCache,
            ...normalizedIndexedDbCache,
          }));
        }

        const normalizedIndexedDbMeta = normalizeTimestampMap(indexedDbMeta);
        if (Object.keys(normalizedIndexedDbMeta).length > 0) {
          candleFetchTimestampsRef.current = {
            ...candleFetchTimestampsRef.current,
            ...normalizedIndexedDbMeta,
          };
        }

        const normalizedIndexedDbQuotes = normalizeStoredQuoteCache(indexedDbQuotes);
        if (Object.keys(normalizedIndexedDbQuotes).length > 0) {
          setQuoteCache((currentQuotes) => ({
            ...normalizedIndexedDbQuotes,
            ...currentQuotes,
          }));
        }

        const legacyCache = normalizeStoredCandlesCache(
          readStoredValue<unknown>(CANDLES_CACHE_STORAGE_KEY, {}),
        );
        const legacyMeta = normalizeTimestampMap(
          readStoredValue<unknown>(CANDLES_CACHE_META_STORAGE_KEY, {}),
        );
        if (Object.keys(legacyCache).length > 0) {
          await writeCandlesCacheIndexedDb(
            CANDLES_CACHE_INDEXED_DB_CACHE_KEY,
            compactCandlesCache({
              ...normalizedIndexedDbCache,
              ...legacyCache,
            }),
          );
        }
        if (Object.keys(legacyMeta).length > 0) {
          await writeCandlesCacheIndexedDb(
            CANDLES_CACHE_INDEXED_DB_META_KEY,
            {
              ...normalizedIndexedDbMeta,
              ...legacyMeta,
            },
          );
        }
      } catch (error) {
        console.warn('市場データキャッシュのIndexedDB読み込みに失敗しました。', error);
      } finally {
        clearVolatileStorageCache();
        candlesCacheIndexedDbHydratedRef.current = true;
        quoteCacheIndexedDbHydratedRef.current = true;
      }
    };

    void hydrateMarketCaches();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    writeStoredJson('tv_dashboard_tickers', compactTickersForStorage(tickers));
  }, [tickers]);

  useEffect(() => {
    setHeaderTickerSymbols((current) => {
      const knownSymbols = new Set(tickers.map((ticker) => ticker.symbol));
      const filtered = current.filter((symbol) => knownSymbols.has(symbol));
      const fallback = tickers.slice(0, 6).map((ticker) => ticker.symbol);
      const next = filtered.length > 0 ? filtered : fallback;
      return next.join('|') === current.join('|') ? current : next;
    });
  }, [tickers]);

  useEffect(() => {
    writeStoredJson(HEADER_TICKER_SYMBOLS_STORAGE_KEY, headerTickerSymbols);
  }, [headerTickerSymbols]);

  useEffect(() => {
    if (!headerTickerMenu) return;
    const closeMenu = () => setHeaderTickerMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [headerTickerMenu]);

  useEffect(() => {
    writeStoredJson('mooview_active_view', appView);
  }, [appView]);

  useEffect(() => {
    const handleWorkspaceShortcut = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      const target = event.target as HTMLElement | null;
      if (target && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
        || target.isContentEditable
      )) {
        return;
      }
      const platform = navigator.platform.toLowerCase();
      const isMac = platform.includes('mac');
      const hasModifier = isMac ? event.metaKey : event.ctrlKey;
      if (!hasModifier || !event.shiftKey) return;
      event.preventDefault();
      setWorkspaceMenuOpen(false);
      setAppView((current) => {
        const currentIndex = APP_VIEW_ORDER.indexOf(current);
        const safeIndex = currentIndex >= 0 ? currentIndex : 0;
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        return APP_VIEW_ORDER[(safeIndex + delta + APP_VIEW_ORDER.length) % APP_VIEW_ORDER.length];
      });
    };

    window.addEventListener('keydown', handleWorkspaceShortcut);
    return () => window.removeEventListener('keydown', handleWorkspaceShortcut);
  }, []);

  useEffect(() => {
    writeStoredJson('tv_dashboard_watchlist_tabs', watchlistTabs);
  }, [watchlistTabs]);

  useEffect(() => {
    setWatchlistQuoteFetchModes((currentModes) => {
      const nextModes: Record<string, WatchlistQuoteFetchMode> = {};
      watchlistTabs.forEach((tab) => {
        nextModes[tab.id] = getWatchlistQuoteFetchMode(currentModes, tab.id);
      });
      return areWatchlistQuoteFetchModesEqual(currentModes, nextModes) ? currentModes : nextModes;
    });
  }, [watchlistTabs]);

  useEffect(() => {
    writeStoredJson(WATCHLIST_QUOTE_FETCH_MODES_STORAGE_KEY, watchlistQuoteFetchModes);
  }, [watchlistQuoteFetchModes]);

  useEffect(() => {
    writeStoredJson('tv_dashboard_active_watchlist_tab', activeWatchlistTabId);
  }, [activeWatchlistTabId]);

  useEffect(() => {
    writeStoredJson('tv_dashboard_panels', panels);
  }, [panels]);

  useEffect(() => {
    writeStoredJson(VALUE_CHAIN_CHART_STATE_STORAGE_KEY, valueChainChartState);
  }, [valueChainChartState]);

  useEffect(() => {
    writeStoredJson(COMPARISON_LABEL_FONT_SIZE_STORAGE_KEY, comparisonLabelFontSize);
  }, [comparisonLabelFontSize]);

  useEffect(() => {
    writeStoredJson(COMPARISON_LABEL_LAYOUT_MODE_STORAGE_KEY, comparisonLabelLayoutMode);
  }, [comparisonLabelLayoutMode]);

  useEffect(() => {
    writeStoredJson(CHART_VIDEO_EXPORT_SETTINGS_STORAGE_KEY, chartVideoExportSettings);
  }, [chartVideoExportSettings]);

  useEffect(() => {
    writeStoredJson(CHART_IMAGE_EXPORT_SETTINGS_STORAGE_KEY, chartImageExportSettings);
  }, [chartImageExportSettings]);

  useEffect(() => {
    writeStoredJson(CHART_AI_PROMPT_STORAGE_KEY, chartAiPrompt);
  }, [chartAiPrompt]);

  useEffect(() => {
    writeStoredJson(CHART_AI_MODEL_STORAGE_KEY, chartAiModel);
  }, [chartAiModel]);

  useEffect(() => {
    const saveTimer = window.setTimeout(() => {
      if (!candlesCacheIndexedDbHydratedRef.current) return;
      void writeAndVerifyCandlesCacheIndexedDb(candlesCache, candleFetchTimestampsRef.current)
        .then(() => clearVolatileStorageCache())
        .catch((error) => console.warn('ローソク足キャッシュのIndexedDB保存に失敗しました。', error));
    }, 600);
    return () => window.clearTimeout(saveTimer);
  }, [candlesCache]);

  useEffect(() => {
    const saveTimer = window.setTimeout(() => {
      if (!quoteCacheIndexedDbHydratedRef.current) return;
      void writeAndVerifyQuoteCacheIndexedDb(quoteCache)
        .catch((error) => console.warn('価格キャッシュのIndexedDB保存に失敗しました。', error));
    }, 250);
    return () => window.clearTimeout(saveTimer);
  }, [quoteCache]);

  useEffect(() => {
    writeStoredJson('tv_dashboard_indicators', indicatorDatabase);
  }, [indicatorDatabase]);

  useEffect(() => {
    setIndicatorDatabase((current) => {
      let changed = false;
      const next = { ...current };
      valueChainChartSymbols.forEach((symbol) => {
        const symbolKey = symbol.toUpperCase();
        const currentSettings = current[symbolKey];
        const genericDefault = createDefaultIndicatorSettings(symbolKey);
        if (
          !currentSettings
          || JSON.stringify(currentSettings) === JSON.stringify(genericDefault)
        ) {
          next[symbolKey] = createValueChainDefaultIndicatorSettings(symbolKey);
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [valueChainChartSymbols]);

  useEffect(() => {
    writeStoredValue('moomoo_active', String(moomooRealTimeActive));
    moomooRealTimeActiveRef.current = moomooRealTimeActive;
  }, [moomooRealTimeActive]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentClockTime(formatClockTime());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    writeStoredJson('tv_dashboard_focused_symbol', focusedSymbolIndex);
  }, [focusedSymbolIndex]);

  useEffect(() => {
    writeStoredJson('tv_dashboard_panel_engines', panelEngineToggle);
  }, [panelEngineToggle]);

  useEffect(() => {
    writeStoredJson('tv_dashboard_layout_style', layoutStyle);
  }, [layoutStyle]);

  useEffect(() => {
    writeStoredJson('tv_dashboard_grid_rows', gridRows);
  }, [gridRows]);

  useEffect(() => {
    writeStoredJson('tv_dashboard_grid_cols', gridCols);
  }, [gridCols]);

  useEffect(() => {
    writeStoredJson('tv_dashboard_sidebar_open', sidebarOpen);
  }, [sidebarOpen]);

  useEffect(() => {
    writeStoredJson('tv_dashboard_sidebar_view', sidebarView);
  }, [sidebarView]);

  useEffect(() => {
    writeStoredJson('tv_dashboard_sidebar_width', sidebarWidth);
  }, [sidebarWidth]);

  useEffect(() => {
    writeStoredJson('tv_dashboard_column_widths', colWeights);
  }, [colWeights]);

  useEffect(() => {
    writeStoredJson('tv_dashboard_panel_heights', panelHeights);
  }, [panelHeights]);

  useEffect(() => {
    const mobileViewportQuery = window.matchMedia('(max-width: 767px)');
    const syncMobileViewport = () => {
      setIsMobileViewport(mobileViewportQuery.matches);
      if (!mobileViewportQuery.matches) {
        setMobileSheetView(null);
      }
    };

    syncMobileViewport();
    mobileViewportQuery.addEventListener('change', syncMobileViewport);
    return () => mobileViewportQuery.removeEventListener('change', syncMobileViewport);
  }, []);

  useEffect(() => {
    setMobileActivePanelIndex((currentIndex) => (
      Math.max(0, Math.min(currentIndex, panels.length - 1))
    ));
  }, [panels.length]);

  useEffect(() => {
    writeStoredJson('tv_dashboard_watchlist_column_widths', watchlistColumnWidths);
  }, [watchlistColumnWidths]);

  useEffect(() => {
    writeStoredJson('tv_dashboard_watchlist_show_name_column', showWatchlistNameColumn);
  }, [showWatchlistNameColumn]);

  useEffect(() => {
    writeStoredJson('tv_dashboard_watchlist_sort', watchlistSort);
  }, [watchlistSort]);

  useEffect(() => {
    writeStoredJson(WATCHLIST_NAME_OVERRIDES_STORAGE_KEY, watchlistNameOverrides);
  }, [watchlistNameOverrides]);

  useEffect(() => {
    if (!watchlistTabs.some((tab) => tab.id === activeWatchlistTabId)) {
      setActiveWatchlistTabId(watchlistTabs[0]?.id ?? DEFAULT_WATCHLIST_TAB_ID);
    }
  }, [activeWatchlistTabId, watchlistTabs]);

  useEffect(() => {
    if (!sectionMenu) return;
    const closeMenu = () => setSectionMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [sectionMenu]);

  useEffect(() => {
    if (!watchlistHeaderMenu) return;
    const closeMenu = () => setWatchlistHeaderMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [watchlistHeaderMenu]);

  useEffect(() => {
    if (!watchlistTabMenu) return;
    const closeMenu = () => setWatchlistTabMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [watchlistTabMenu]);

  useEffect(() => {
    if (!watchlistContextMenu) return;
    const closeMenu = () => setWatchlistContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [watchlistContextMenu]);

  useEffect(() => {
    if (!watchlistEmptyMenu) return;
    const closeMenu = () => setWatchlistEmptyMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [watchlistEmptyMenu]);

  useEffect(() => {
    if (!watchlistNameEditModal) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setWatchlistNameEditModal(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [watchlistNameEditModal]);

  useEffect(() => {
    if (!chartNameEditModal) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setChartNameEditModal(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [chartNameEditModal]);

  useEffect(() => {
    if (!displayRangeMenu && !gridPickerOpen && !tabsDropdownOpen && !watchlistImportMenuOpen && !watchlistTargetMenu) return;
    const handleOutsideClick = () => {
      setGridPickerOpen(false);
      setTabsDropdownOpen(false);
      setTabsDropdownAnchor(null);
      setWatchlistImportMenuOpen(false);
      setWatchlistTargetMenu(null);
      setDisplayRangeMenu(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [displayRangeMenu, gridPickerOpen, tabsDropdownOpen, watchlistImportMenuOpen, watchlistTargetMenu]);

  useEffect(() => {
    const tabsViewport = watchlistTabsViewportRef.current;
    const activeTabElement = watchlistTabRefs.current[activeWatchlistTabId];
    if (!tabsViewport || !activeTabElement) return;

    const targetLeft = activeTabElement.offsetLeft - (tabsViewport.clientWidth - activeTabElement.offsetWidth) / 2;
    tabsViewport.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: 'smooth',
    });
  }, [activeWatchlistTabId, sidebarWidth, watchlistTabs]);

  const handleMoomooModeToggle = () => {
    if (!moomooRealTimeActive) {
      setCandlesCache({});
      setQuoteCache({});
      setMoomooStatus('connecting');
      setMoomooError(null);
      initialVisibleChartRefreshRef.current = true;
    }
    setMoomooRealTimeActive((active) => !active);
  };

  const getWatchlistTabQuoteOperands = (
    tab: WatchlistTab | null | undefined,
    includePausedMarkets = false,
  ): string[] => {
    return orderMarketFetchSymbols(Array.from(new Set(
      getQuoteOperandSymbolsForWatchlistSymbols(getWatchlistTabSymbols(tab))
        .map((symbol) => normalizeStoredSymbolValue(symbol))
        .filter(Boolean),
    )), { includePausedMarkets });
  };

  const requestAutoWatchlistQuoteRefresh = (force = false): boolean => {
    const signature = getAutoWatchlistQuoteRefreshSignature(watchlistTabs, watchlistQuoteFetchModes);
    if (!signature) return false;
    const now = Date.now();
    if (!force && now - quoteFetchLastAutoSweepAtRef.current < WATCHLIST_AUTO_QUOTE_REFRESH_INTERVAL_MS) {
      return false;
    }
    quoteFetchLastAutoSweepAtRef.current = now;
    quoteFetchAutoSweepRequestedRef.current = true;
    quoteFetchAutoAttemptedTabIdsRef.current.clear();
    if (quoteFetchInFlightRef.current) {
      quoteFetchPendingRef.current = true;
    }
    if (!moomooRealTimeActiveRef.current) {
      setMoomooRealTimeActive(true);
    }
    setTickTrigger((current) => current + 1);
    return true;
  };

  const isQuoteOperandResolved = (symbol: string): boolean => {
    const normalizedSymbol = normalizeStoredSymbolValue(symbol);
    const quote = quoteCache[normalizedSymbol];
    const price = Number(quote?.price);
    const changePct = Number(quote?.changePct);
    return Number.isFinite(price)
      && price > 0
      && Number.isFinite(changePct);
  };

  const queueWatchlistQuoteRefreshes = (
    tabIds: Array<string | null | undefined>,
    options: { includePausedMarkets?: boolean } = {},
  ) => {
    const refreshTabs: WatchlistTab[] = [];
    const seenTabIds = new Set<string>();
    tabIds.forEach((tabId) => {
      if (!tabId || seenTabIds.has(tabId)) return;
      const tab = watchlistTabs.find((item) => item.id === tabId);
      if (!tab) return;
      seenTabIds.add(tab.id);
      refreshTabs.push(tab);
    });
    if (refreshTabs.length === 0) return;
    const includePausedMarkets = options.includePausedMarkets === true;
    const retrySymbols = Array.from(new Set(
      refreshTabs.flatMap((tab) => getWatchlistTabQuoteOperands(tab, includePausedMarkets)),
    ));
    const queuedTabRequests = new Map<string, {
      tabId: string;
      includePausedMarkets: boolean;
    }>(
      quoteFetchManualTabQueueRef.current.map((request) => [request.tabId, request] as const),
    );
    quoteFetchManualTabQueueRef.current = [
      ...refreshTabs.map((tab) => ({
        tabId: tab.id,
        includePausedMarkets: includePausedMarkets
          || queuedTabRequests.get(tab.id)?.includePausedMarkets === true,
      })),
      ...quoteFetchManualTabQueueRef.current.filter((request) => !seenTabIds.has(request.tabId)),
    ];
    quoteFetchAutoSweepRequestedRef.current = true;
    quoteFetchAutoAttemptedTabIdsRef.current.clear();
    forceCandleRefreshRef.current = true;
    setQuoteFetchFailures((current) => {
      const next = { ...current };
      retrySymbols.forEach((symbol) => {
        delete next[symbol];
      });
      return next;
    });
    setMoomooStatus('connecting');
    setMoomooError(null);
    if (quoteFetchInFlightRef.current) {
      quoteFetchPendingRef.current = true;
    }
    if (!moomooRealTimeActiveRef.current) {
      setMoomooRealTimeActive(true);
    }
    setTickTrigger((current) => current + 1);
  };

  const queueWatchlistQuoteRefresh = (tabId: string | null | undefined) => {
    queueWatchlistQuoteRefreshes([tabId]);
  };

  const requestManualChartRefresh = (symbols: string[] = []) => {
    manualCandleRefreshSequenceRef.current += 1;
    symbols.forEach((rawSymbol) => {
      const normalizedSymbol = normalizeStoredSymbolValue(rawSymbol);
      if (normalizedSymbol) manualCandleRefreshSymbolsRef.current.add(normalizedSymbol);
    });
    // 手動操作は画面を空白にしないことを最優先し、米国市場の停止時間帯も取得対象にする。
    manualCandleRefreshBypassMarketPauseRef.current = true;
    forceCandleRefreshRef.current = true;
    chartMissingDataRefreshRef.current = { signature: '', requestedAt: 0 };
    setManualChartRefreshInFlight(true);
    setMoomooStatus('connecting');
    setMoomooError(null);
    if (candleFetchInFlightRef.current) {
      candleFetchPendingRef.current = true;
    }
    if (!moomooRealTimeActiveRef.current) {
      setMoomooRealTimeActive(true);
    }
    setTickTrigger((current) => current + 1);
  };

  const getWatchlistTabIdsForChartSymbols = (symbols: string[]): string[] => {
    const tabIds: string[] = [];
    const seenTabIds = new Set<string>();
    symbols.forEach((symbol) => {
      if (!symbol.startsWith('BASKET:')) return;
      const sectionId = symbol.slice(7);
      const ownerTab = watchlistTabs.find((tab) =>
        tab.sections.some((section) => section.id === sectionId),
      );
      if (!ownerTab || seenTabIds.has(ownerTab.id)) return;
      seenTabIds.add(ownerTab.id);
      tabIds.push(ownerTab.id);
    });
    return tabIds;
  };

  const queuePriorityQuoteRefreshForChartSymbols = (symbols: string[]) => {
    const activeTabId = watchlistTabs.some((tab) => tab.id === activeWatchlistTabId)
      ? activeWatchlistTabId
      : watchlistTabs[0]?.id;
    const relatedTabIds = getWatchlistTabIdsForChartSymbols(symbols);
    queueWatchlistQuoteRefreshes([activeTabId, ...relatedTabIds]);
  };

  const handleRefreshWatchlistQuotes = () => {
    const refreshTabId = watchlistTabs.some((tab) => tab.id === activeWatchlistTabId)
      ? activeWatchlistTabId
      : watchlistTabs[0]?.id;
    queueWatchlistQuoteRefresh(refreshTabId);
    requestManualChartRefresh();
  };

  const handleRefreshWatchlistTabData = (tabId: string) => {
    const tab = watchlistTabs.find((candidate) => candidate.id === tabId);
    if (!tab) return;
    // タブ内の全銘柄を価格・KLineともに強制取得する。
    queueWatchlistQuoteRefreshes([tab.id], { includePausedMarkets: true });
    requestManualChartRefresh(getWatchlistTabSymbols(tab));
    setWatchlistTabMenu(null);
  };

  useEffect(() => {
    if (isDiscordAutomationPage) return;
    const signature = getAutoWatchlistQuoteRefreshSignature(watchlistTabs, watchlistQuoteFetchModes);
    if (watchlistAutoQuoteSignatureRef.current === signature) return;
    watchlistAutoQuoteSignatureRef.current = signature;
    if (!signature) return;
    requestAutoWatchlistQuoteRefresh(true);
  }, [isDiscordAutomationPage, watchlistTabs, watchlistQuoteFetchModes]);

  // OpenDへの接続状態はサーバー側ゲートウェイを通して確認する
  const checkMoomooStatus = async () => {
    if (!moomooRealTimeActive) {
      setMoomooStatus('disconnected');
      return;
    }
    setMoomooStatus('connecting');
    try {
      const { data } = await fetchJsonWithTimeout('/api/moomoo/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (data.connected) {
        setMoomooStatus('connected');
        setMoomooError(null);
      } else {
        setMoomooStatus('error');
        setMoomooError(data.error || 'Moomoo OpenDへ接続できません。');
      }
    } catch {
      setMoomooStatus('error');
      setMoomooError('Moomoo中継APIへ接続できません。');
    }
  };

  // --- REAL MOOMOO DATA FETCH MECHANISM ---
  // 有効時はサーバー側ゲートウェイから実際のローソク足を取得する
  useEffect(() => {
    if (!moomooRealTimeActive) return;
    // Discord自動通知用のヘッドレス画面では、実行ジョブが対象パネルを指定するまで
    // 全画面のKLine取得を開始しない。選択チャートを60秒待機内に確定させるため。
    if (isDiscordAutomationPage && discordAutomationTargetPanelIds.length === 0) return;
    // 通常の30秒更新や価格取得完了で進行中のKLine取得を中断すると、
    // 銘柄数の多いタブが毎回先頭からやり直しになってしまう。
    // 現在の逐次取得を完走させ、後続要求はpendingとして1回だけ続けて実行する。
    if (candleFetchInFlightRef.current) {
      candleFetchPendingRef.current = true;
      return;
    }
    const fetchGeneration = candleFetchGenerationRef.current + 1;
    candleFetchGenerationRef.current = fetchGeneration;

    const fetchMoomooCandles = async () => {
      const now = Date.now();
      const manualRefreshSequence = manualCandleRefreshSequenceRef.current;
      const manualRefreshSymbols = Array.from<string>(manualCandleRefreshSymbolsRef.current);
      const bypassMarketPauseForManualRefresh = manualCandleRefreshBypassMarketPauseRef.current;
      const finishManualRefresh = () => {
        if (
          manualRefreshSequence > 0
          && manualCandleRefreshSequenceRef.current === manualRefreshSequence
        ) {
          manualCandleRefreshSymbolsRef.current.clear();
          manualCandleRefreshBypassMarketPauseRef.current = false;
          setManualChartRefreshInFlight(false);
        }
      };
      const forceRefresh = forceCandleRefreshRef.current || initialVisibleChartRefreshRef.current;
      const requests = new Map<string, { symbol: string; timeframe: Timeframe; lookupQueries: string[]; priority: number }>();
      const activeWatchlistSymbolSet = new Set(
        getWatchlistTabSymbols(watchlistTabs.find((tab) => tab.id === activeWatchlistTabId)),
      );
      const addCandleRequest = (rawSymbol: string, timeframe: Timeframe, requestPriority: number) => {
        if (rawSymbol.startsWith('BASKET:')) {
          const sectionId = rawSymbol.slice(7);
          const ownerTab = watchlistTabs.find((tab) =>
            tab.sections.some((section) => section.id === sectionId),
          );
          const section = ownerTab?.sections.find((item) => item.id === sectionId);
          if (section) {
            const basketPriority = ownerTab?.id === activeWatchlistTabId
              ? requestPriority - 1_000
              : requestPriority;
            section.symbols.forEach(symbol => {
              addCandleRequest(symbol, timeframe, basketPriority);
            });
          }
          return;
        }

        getStoredSymbolOperands(rawSymbol).forEach((symbol) => {
          const normalizedSymbol = normalizeStoredSymbolValue(symbol);
          if (
            !bypassMarketPauseForManualRefresh
            && shouldPauseUsFetchForJapanSession()
            && isUsMarketSymbol(normalizedSymbol)
          ) return;
          const key = `${normalizedSymbol}-${timeframe}`;
          const existing = requests.get(key);
          const activePriority = activeWatchlistSymbolSet.has(normalizedSymbol)
            ? requestPriority - 1_000
            : requestPriority;
          const lookupQueries = Array.from(new Set([
            ...(existing?.lookupQueries || []),
            rawSymbol,
            symbol,
          ].map((query) => query.trim()).filter(Boolean)));
          requests.set(key, {
            symbol: normalizedSymbol,
            timeframe,
            lookupQueries,
            priority: Math.min(existing?.priority ?? activePriority, activePriority),
          });
        });
      };

      const panelPriorityOffset = appView === 'charts' ? 0 : 5_000;
      const valueChainPriorityOffset = appView === 'charts' ? 10_000 : 0;

      const mobilePanelIndex = Math.max(0, Math.min(mobileActivePanelIndex, panels.length - 1));
      const panelsToFetch = isDiscordAutomationPage
        ? panels.filter((panel) => discordAutomationTargetPanelIds.includes(panel.id))
        : isMobileViewport
        ? appView === 'charts' && panels[mobilePanelIndex]
          ? [panels[mobilePanelIndex]]
          : []
        : panels;

      panelsToFetch.forEach((panel, panelIndex) => {
        // Discord実行でも、通知対象パネルの比較銘柄を含めて取得する。
        // 主系列だけでは比較チャートが枠・グリッドのみになり、通知画像が実画面と一致しない。
        const chartSymbols = panel.comparisonOnly
          ? [...(panel.comparisonSymbols || [])]
          : [panel.symbol, ...(panel.comparisonSymbols || [])];
        const panelPriorityBase = panelPriorityOffset + panelIndex * 10;
        chartSymbols.forEach((symbol, symbolIndex) => {
          // スマホは主銘柄を比較銘柄より先に描画できるよう、最優先で取得する。
          const symbolPriority = panelPriorityBase
            + (isMobileViewport && symbolIndex === 0 ? -2_000 : symbolIndex);
          addCandleRequest(symbol, DAY_RANGE_OVERVIEW_TIMEFRAME, symbolPriority);
          if (isDiscordAutomationPage) return;
          const displayRangeTimeframe = getDisplayRangeSeedTimeframe(panel.displayRange);
          if (displayRangeTimeframe && displayRangeTimeframe !== DAY_RANGE_OVERVIEW_TIMEFRAME) {
            addCandleRequest(symbol, displayRangeTimeframe, symbolPriority + 1);
          }
          addCandleRequest(symbol, panel.timeframe, symbolPriority + 2);
        });
      });
      // タブ右クリックから要求された全銘柄は、現在の表示パネルの取得後に順番にKLineを取得する。
      manualRefreshSymbols.forEach((symbol, symbolIndex) => {
        addCandleRequest(symbol, DAY_RANGE_OVERVIEW_TIMEFRAME, 20_000 + symbolIndex);
      });
      if (!isDiscordAutomationPage && (!isMobileViewport || appView !== 'charts')) {
        valueChainChartSymbols.forEach((chartSymbol, symbolIndex) => {
          const symbolPriorityBase = valueChainPriorityOffset + symbolIndex * 10;
          addCandleRequest(chartSymbol, DAY_RANGE_OVERVIEW_TIMEFRAME, symbolPriorityBase);
          const displayRangeTimeframe = getDisplayRangeSeedTimeframe(valueChainChartState.displayRange);
          if (displayRangeTimeframe && displayRangeTimeframe !== DAY_RANGE_OVERVIEW_TIMEFRAME) {
            addCandleRequest(chartSymbol, displayRangeTimeframe, symbolPriorityBase + 1);
          }
          addCandleRequest(chartSymbol, valueChainChartState.timeframe, symbolPriorityBase + 2);
        });
      }

      const requestsToFetch = Array.from(requests.entries()).filter(([key]) => {
        const cachedCandles = candlesCache[key];
        const lastFetchedAt = candleFetchTimestampsRef.current[key] ?? 0;
        if (forceRefresh) return true;
        if (!cachedCandles?.length) {
          return now - lastFetchedAt > CANDLES_CACHE_TTL_MS;
        }
        return now - lastFetchedAt > CANDLES_CACHE_TTL_MS;
      }).sort((first, second) =>
        first[1].priority - second[1].priority
        || getMarketFetchRank(first[1].symbol) - getMarketFetchRank(second[1].symbol)
        || first[1].symbol.localeCompare(second[1].symbol),
      );

      if (requestsToFetch.length === 0) {
        if (manualCandleRefreshSequenceRef.current === manualRefreshSequence) {
          forceCandleRefreshRef.current = false;
          initialVisibleChartRefreshRef.current = false;
          finishManualRefresh();
        }
        setMoomooStatus('connected');
        setMoomooError(null);
        return;
      }

      candleFetchInFlightRef.current = true;
      const updatedCache: Record<string, Candle[]> = {};
      const successfulKeys = new Set<string>();
      const failedErrors: Record<string, string> = {};
      const retryableFailedKeys = new Set<string>();
      let firstError: string | null = null;
      let klineRequestCount = 0;
      const commitFetchedCandles = (entries: Record<string, Candle[]>) => {
        const fetchedAt = Date.now();
        Object.keys(entries).forEach((key) => {
          candleFetchTimestampsRef.current[key] = fetchedAt;
        });
        Object.assign(updatedCache, entries);
        setCandlesCache((currentCache) => compactCandlesCache({
          ...currentCache,
          ...entries,
        }));
        // 接続確認APIが一時的に失敗しても、実データ取得成功を接続済みの根拠とする。
        setMoomooStatus('connected');
        setMoomooError(null);
      };
      const waitForKlineSlot = async () => {
        if (klineRequestCount > 0 && klineRequestCount % KLINE_FETCH_BATCH_LIMIT === 0) {
          setMoomooStatus('connecting');
          setMoomooError(`KLine制限待機中: ${Math.ceil(KLINE_FETCH_BATCH_COOLDOWN_MS / 1000)}秒後に次の${KLINE_FETCH_BATCH_LIMIT}件を取得します。`);
          await sleep(KLINE_FETCH_BATCH_COOLDOWN_MS);
        }
        klineRequestCount += 1;
      };
      const fetchCandlesForSymbol = async (
        symbol: string,
        timeframe: Timeframe,
        skipBatchSlotWait = false,
      ) => {
        const requestCandles = async () => {
          if (!skipBatchSlotWait) {
            await waitForKlineSlot();
          }
          const { response, data } = await fetchJsonWithTimeout('/api/moomoo/kline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbol,
              timeframe,
              reqNum: 150
            })
          }, 90_000);
          const candles = Array.isArray(data.candles) ? data.candles as Candle[] : [];
          const source = typeof data.source === 'string' ? data.source : '';
          const fallbackSourceError = source === 'quote-fallback'
            ? 'quote fallbackはチャート用KLineとして保存しません'
            : null;
          const usableCandles = getUsableChartCandles(candles, timeframe);
          const errorMessage = data.error
            ? String(data.error)
            : fallbackSourceError
            ?? (response.ok
              ? usableCandles.length > 0 ? null : '有効なKLineが不足しています'
              : `HTTP ${response.status}`);
          return {
            candles: response.ok && data.success && !fallbackSourceError && usableCandles.length > 0 ? usableCandles : [],
            error: errorMessage,
            retryable: response.status === 429 || isMoomooRateLimitMessage(errorMessage),
          };
        };

        const firstResult = await requestCandles();
        if (firstResult.candles.length > 0 || !firstResult.retryable) return firstResult;

        setMoomooStatus('connecting');
        setMoomooError(`KLine制限待機中: ${Math.ceil(KLINE_RATE_LIMIT_RETRY_MS / 1000)}秒後に再試行します。`);
        await sleep(KLINE_RATE_LIMIT_RETRY_MS);
        return requestCandles();
      };

      const findFallbackSymbol = async (request: { symbol: string; lookupQueries: string[] }) => {
        const tried = new Set<string>();
        for (const query of request.lookupQueries) {
          const normalizedQuery = normalizeTickerSymbolForStorage(query);
          if (normalizedQuery && normalizedQuery !== request.symbol && !tried.has(normalizedQuery)) {
            tried.add(normalizedQuery);
            return normalizedQuery;
          }
          if (tried.has(query)) continue;
          tried.add(query);
          const candidate = await searchMoomooSymbolCandidate(query);
          const candidateSymbol = normalizeTickerSymbolForStorage(candidate?.symbol || candidate?.code || '');
          if (candidateSymbol && candidateSymbol !== request.symbol) {
            return candidateSymbol;
          }
        }
        return null;
      };

      const processCandleRequest = async (
        [key, request]: [string, { symbol: string; timeframe: Timeframe; lookupQueries: string[]; priority: number }],
        skipBatchSlotWait = false,
      ) => {
        if (
          !moomooRealTimeActiveRef.current
          || candleFetchGenerationRef.current !== fetchGeneration
        ) return;
        try {
          const directResult = await fetchCandlesForSymbol(
            request.symbol,
            request.timeframe,
            skipBatchSlotWait,
          );
          if (directResult.candles.length > 0) {
            successfulKeys.add(key);
            commitFetchedCandles({ [key]: directResult.candles });
            return;
          }

          let shouldRetryKey = directResult.retryable;
          const fallbackSymbol = await findFallbackSymbol(request);
          if (fallbackSymbol) {
            const fallbackResult = await fetchCandlesForSymbol(
              fallbackSymbol,
              request.timeframe,
              skipBatchSlotWait,
            );
            if (fallbackResult.candles.length > 0) {
              const fallbackKey = `${fallbackSymbol}-${request.timeframe}`;
              successfulKeys.add(key);
              successfulKeys.add(fallbackKey);
              commitFetchedCandles({
                [key]: fallbackResult.candles,
                [fallbackKey]: fallbackResult.candles,
              });
              return;
            }
            shouldRetryKey = shouldRetryKey || fallbackResult.retryable;
          }

          const message = formatCandleLookupError(request.lookupQueries[0] || request.symbol);
          failedErrors[key] = directResult.error ? `${message}（${directResult.error}）` : message;
          if (shouldRetryKey) retryableFailedKeys.add(key);
          firstError ||= failedErrors[key];
        } catch (error) {
          const message = formatCandleLookupError(request.lookupQueries[0] || request.symbol);
          failedErrors[key] = `${message}（${error instanceof Error ? error.message : String(error)}）`;
          firstError ||= failedErrors[key];
        }
      };

      try {
        if (isDiscordAutomationPage) {
          // 選択した比較チャートだけを、20件ごとのAPI上限を守りつつ4並列で取得する。
          // 通常画面は従来どおり逐次取得のままにして、利用中の表示挙動を変えない。
          for (let offset = 0; offset < requestsToFetch.length; offset += KLINE_FETCH_BATCH_LIMIT) {
            const batch = requestsToFetch.slice(offset, offset + KLINE_FETCH_BATCH_LIMIT);
            let nextIndex = 0;
            await Promise.all(Array.from(
              { length: Math.min(DISCORD_AUTOMATION_KLINE_CONCURRENCY, batch.length) },
              async () => {
                while (nextIndex < batch.length) {
                  const request = batch[nextIndex];
                  nextIndex += 1;
                  await processCandleRequest(request, true);
                }
              },
            ));
            if (offset + KLINE_FETCH_BATCH_LIMIT < requestsToFetch.length) {
              setMoomooStatus('connecting');
              setMoomooError(`KLine制限待機中: ${Math.ceil(KLINE_FETCH_BATCH_COOLDOWN_MS / 1000)}秒後に次の${KLINE_FETCH_BATCH_LIMIT}件を取得します。`);
              await sleep(KLINE_FETCH_BATCH_COOLDOWN_MS);
            }
          }
        } else {
          for (const request of requestsToFetch) {
            await processCandleRequest(request);
          }
        }

        if (
          !moomooRealTimeActiveRef.current
          || candleFetchGenerationRef.current !== fetchGeneration
        ) return;

        const attemptedAt = Date.now();
        Object.keys(failedErrors).forEach((key) => {
          candleFetchTimestampsRef.current[key] = attemptedAt;
        });
        if (Object.keys(failedErrors).length > 0) {
          const retryDelayMs = retryableFailedKeys.size > 0
            ? KLINE_RATE_LIMIT_RETRY_MS + 500
            : CANDLES_CACHE_TTL_MS + 500;
          scheduleCandleFetchRetry(retryDelayMs);
        }

        if (Object.keys(updatedCache).length > 0) {
          setMoomooStatus('connected');
          setMoomooError(null);
        } else if (firstError) {
          setMoomooStatus('error');
          setMoomooError(firstError);
        }
        setCandleFetchErrors((current) => {
          const next = { ...current };
          successfulKeys.forEach((key) => {
            delete next[key];
          });
          Object.assign(next, failedErrors);
          return next;
        });
      } finally {
        candleFetchInFlightRef.current = false;
        const shouldRefetch = candleFetchPendingRef.current
          || candleFetchGenerationRef.current !== fetchGeneration;
        candleFetchPendingRef.current = false;
        if (shouldRefetch) {
          setTickTrigger((current) => current + 1);
        } else if (manualCandleRefreshSequenceRef.current === manualRefreshSequence) {
          // 取得途中の再クリックで入った新しい強制更新要求を消さない。
          forceCandleRefreshRef.current = false;
          initialVisibleChartRefreshRef.current = false;
          finishManualRefresh();
        }
      }
    };

    fetchMoomooCandles();
  }, [activeWatchlistTabId, appView, discordAutomationTargetPanelIds, isDiscordAutomationPage, isMobileViewport, mobileActivePanelIndex, panels, valueChainChartState.displayRange, valueChainChartState.timeframe, valueChainChartSymbols, moomooRealTimeActive, tickTrigger]);

  useEffect(() => {
    if (isDiscordAutomationPage) return;
    if (!moomooRealTimeActive) {
      quoteFetchManualTabQueueRef.current = [];
      quoteFetchAutoSweepRequestedRef.current = false;
      quoteFetchAutoAttemptedTabIdsRef.current.clear();
      quoteFetchPendingRef.current = false;
      setQuoteFetchInFlight(false);
      setQuoteFetchTarget(null);
      setQuoteFetchFailures({});
      return;
    }

    if (quoteFetchInFlightRef.current) {
      quoteFetchPendingRef.current = true;
      return;
    }

    const dequeueManualQuoteFetchTarget = (): {
      tab: WatchlistTab;
      symbols: string[];
      source: WatchlistQuoteFetchSource;
    } | null => {
      while (quoteFetchManualTabQueueRef.current.length > 0) {
        const queuedRequest = quoteFetchManualTabQueueRef.current.shift();
        if (!queuedRequest) continue;
        const tab = watchlistTabs.find((item) => item.id === queuedRequest.tabId);
        if (!tab) continue;
        const symbols = getWatchlistTabQuoteOperands(tab, queuedRequest.includePausedMarkets);
        if (symbols.length === 0) continue;
        return { tab, symbols, source: 'manual' };
      }
      return null;
    };

    const findNextAutoQuoteFetchTarget = (): {
      tab: WatchlistTab;
      symbols: string[];
      source: WatchlistQuoteFetchSource;
    } | null => {
      if (!quoteFetchAutoSweepRequestedRef.current) return null;
      const orderedTabs = orderWatchlistTabsForQuoteFetch(watchlistTabs, activeWatchlistTabId);
      for (const tab of orderedTabs) {
        if (getWatchlistQuoteFetchMode(watchlistQuoteFetchModes, tab.id) !== 'auto') continue;
        if (quoteFetchAutoAttemptedTabIdsRef.current.has(tab.id)) continue;
        const symbols = getWatchlistTabQuoteOperands(tab);
        if (symbols.length > 0) {
          return { tab, symbols, source: 'auto' };
        }
      }
      quoteFetchAutoSweepRequestedRef.current = false;
      quoteFetchAutoAttemptedTabIdsRef.current.clear();
      return null;
    };

    const quoteFetchTargetRequest = dequeueManualQuoteFetchTarget() ?? findNextAutoQuoteFetchTarget();
    if (!quoteFetchTargetRequest) {
      setQuoteFetchInFlight(false);
      setQuoteFetchTarget(null);
      quoteFetchPendingRef.current = false;
      return;
    }

    const fetchMoomooQuotes = async () => {
      const quoteSymbols = quoteFetchTargetRequest.symbols;
      if (quoteSymbols.length === 0) return;

      quoteFetchInFlightRef.current = true;
      setQuoteFetchInFlight(true);
      setQuoteFetchTarget({
        tabId: quoteFetchTargetRequest.tab.id,
        source: quoteFetchTargetRequest.source,
      });
      quoteFetchAutoAttemptedTabIdsRef.current.add(quoteFetchTargetRequest.tab.id);
      try {
        if (quoteSymbols.length >= 0) {
          const updatedQuotes: Record<string, MoomooTickerQuote | null> = {};
          const failedQuotes: Record<string, string> = {};
          const successfulQuoteSymbols = new Set<string>();
          let firstBatchError: string | null = null;

          const requestQuoteBatch = async (
            symbols: string[],
            retryAllowed = true,
          ): Promise<Record<string, MoomooBatchQuoteResult>> => {
            const { response, data } = await fetchJsonWithTimeout('/api/moomoo/quotes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbols }),
            }, 90_000);
            const errorMessage = data.error ? String(data.error) : response.ok ? '' : `HTTP ${response.status}`;
            if (!response.ok || !data.success || !data.quotes) {
              if (retryAllowed && (response.status === 429 || isMoomooRateLimitMessage(errorMessage))) {
                setMoomooStatus('connecting');
                setMoomooError(`1D制限待機中: ${Math.ceil(WATCHLIST_QUOTE_RATE_LIMIT_RETRY_MS / 1000)}秒後に再試行します。`);
                await sleep(WATCHLIST_QUOTE_RATE_LIMIT_RETRY_MS);
                return requestQuoteBatch(symbols, false);
              }
              throw new Error(errorMessage || 'Moomoo価格一覧を取得できませんでした。');
            }
            return data.quotes as Record<string, MoomooBatchQuoteResult>;
          };

          for (const quoteBatch of chunkArray(quoteSymbols, WATCHLIST_QUOTE_BATCH_LIMIT)) {
            try {
              const batchQuotes = await requestQuoteBatch(quoteBatch);
              const returnedSymbols = new Set<string>();
              Object.entries(batchQuotes).forEach(([quoteKey, quote]) => {
                const storedSymbol = normalizeTickerSymbolForStorage(String(quote.symbol || quoteKey || ''));
                if (!storedSymbol) return;
                returnedSymbols.add(storedSymbol);
                const price = Number(quote.price);
                if (quote.success && Number.isFinite(price) && price > 0) {
                  updatedQuotes[storedSymbol] = {
                    name: quote.name || storedSymbol,
                    price,
                    changePct: Number(quote.changePct || 0),
                    marketCap: Number.isFinite(Number(quote.marketCap)) && Number(quote.marketCap) > 0
                      ? Number(quote.marketCap)
                      : undefined,
                  };
                  successfulQuoteSymbols.add(storedSymbol);
                  return;
                }
                updatedQuotes[storedSymbol] = null;
                failedQuotes[storedSymbol] = quote.error || 'Moomoo価格を取得できませんでした。';
              });
              quoteBatch.forEach((symbol) => {
                if (returnedSymbols.has(symbol)) return;
                updatedQuotes[symbol] = null;
                failedQuotes[symbol] = 'Moomoo価格の応答に含まれませんでした。';
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              firstBatchError ||= errorMessage;
              quoteBatch.forEach((symbol) => {
                updatedQuotes[symbol] = null;
                failedQuotes[symbol] = errorMessage;
              });
            }
          }

          if (!moomooRealTimeActiveRef.current) return;
          setQuoteCache((currentQuotes) => ({
            ...currentQuotes,
            ...updatedQuotes,
          }));
          setQuoteFetchFailures((currentFailures) => {
            const next = { ...currentFailures, ...failedQuotes };
            successfulQuoteSymbols.forEach((symbol) => {
              delete next[symbol];
            });
            return next;
          });
          if (Object.keys(failedQuotes).length > 0) {
            const failedCount = Object.keys(failedQuotes).length;
            const successCount = successfulQuoteSymbols.size;
            setMoomooStatus(successCount > 0 ? 'connected' : 'error');
            setMoomooError(firstBatchError || `${failedCount}件の1D価格を取得できませんでした。`);
          } else {
            setMoomooStatus('connected');
            setMoomooError(null);
          }
          return;
        }
        const { response, data } = await fetchJsonWithTimeout('/api/moomoo/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: quoteSymbols }),
        }, 90_000);
        if (!response.ok || !data.success || !data.quotes) {
          throw new Error(data.error || 'Moomoo価格一覧を取得できません。');
        }

        const updatedQuotes: Record<string, MoomooTickerQuote | null> = {};
        Object.values(data.quotes as Record<string, MoomooBatchQuoteResult>).forEach((quote) => {
          const storedSymbol = normalizeTickerSymbolForStorage(String(quote.symbol || ''));
          if (!storedSymbol) return;
          const price = Number(quote.price);
          updatedQuotes[storedSymbol] = quote.success && Number.isFinite(price) && price > 0
            ? {
                name: quote.name || storedSymbol,
                price,
                changePct: Number(quote.changePct || 0),
                marketCap: Number.isFinite(Number(quote.marketCap)) && Number(quote.marketCap) > 0
                  ? Number(quote.marketCap)
                  : undefined,
              }
            : null;
        });

        if (!moomooRealTimeActiveRef.current) return;
        setQuoteCache((currentQuotes) => ({
          ...currentQuotes,
          ...updatedQuotes,
        }));
      } catch (error) {
        if (!moomooRealTimeActiveRef.current) return;
        setMoomooStatus('error');
        setMoomooError(error instanceof Error ? error.message : String(error));
      } finally {
        quoteFetchInFlightRef.current = false;
        setQuoteFetchInFlight(false);
        setQuoteFetchTarget(null);
        const shouldRefetch = quoteFetchPendingRef.current;
        const shouldContinueQueue = quoteFetchManualTabQueueRef.current.length > 0
          || quoteFetchAutoSweepRequestedRef.current;
        quoteFetchPendingRef.current = false;
        if (shouldRefetch || shouldContinueQueue) {
          setTickTrigger((current) => current + 1);
        }
      }
    };

    fetchMoomooQuotes();
  }, [activeWatchlistTabId, watchlistTabs, watchlistQuoteFetchModes, quoteCache, moomooRealTimeActive, tickTrigger, isDiscordAutomationPage]);

  // --- REAL-TIME DATA SIMULATOR IN BACKGROUND ---
  // Periodically triggers updates. Mutates simulated candles only when moomoo API is disabled
  useEffect(() => {
    if (isDiscordAutomationPage) return;
    const interval = setInterval(() => {
      setTickTrigger(prev => prev + 1);
      setNetworkLatency(moomooRealTimeActive ? 12 : Math.floor(15 + Math.random() * 20));
      setLastApiSyncTime(formatClockTime());
      
      if (moomooRealTimeActive) {
        requestAutoWatchlistQuoteRefresh();
        return;
      }

      // Simulated ticks fallback when moomoo connection is disabled/offline
      if (panels.length === 0) return;
      const rIdx = Math.floor(Math.random() * panels.length);
      const targetPanel = panels[rIdx];
      
      setCandlesCache(prevCache => {
        const updated = { ...prevCache };
        let changed = false;

        getStoredSymbolOperands(targetPanel.symbol).forEach((symbol) => {
          const key = `${symbol}-${targetPanel.timeframe}`;
          if (!updated[key]?.length) return;
          const candles = [...updated[key]];
          const lastIndex = candles.length - 1;
          candles[lastIndex] = simulateTick(candles[lastIndex]);
          updated[key] = candles;
          changed = true;
        });
        
        // Tick overlay/comparison symbols if present
        if (targetPanel.comparisonSymbols) {
          targetPanel.comparisonSymbols.forEach(compSym => {
            getStoredSymbolOperands(compSym).forEach((symbol) => {
              const compKey = `${symbol}-${targetPanel.timeframe}`;
              if (!updated[compKey]?.length) return;
              const compCandles = [...updated[compKey]];
              const compLastIdx = compCandles.length - 1;
              compCandles[compLastIdx] = simulateTick(compCandles[compLastIdx]);
              updated[compKey] = compCandles;
              changed = true;
            });
          });
        }
        
        return changed ? updated : prevCache;
      });
    }, 3500);

    return () => clearInterval(interval);
  }, [panels, moomooRealTimeActive, watchlistTabs, watchlistQuoteFetchModes, isDiscordAutomationPage]);

  // --- HISTORICAL CANDLE GENERATOR RESOLVER ---
  // デモモードでのみ疑似ローソク足を生成する
  useEffect(() => {
    if (moomooRealTimeActive) return;

    setCandlesCache(prev => {
      const updated = { ...prev };
      let changed = false;
      
      panels.forEach(p => {
        getStoredSymbolOperands(p.symbol).forEach((symbol) => {
          const key = `${symbol}-${p.timeframe}`;
          if (!updated[key]) {
            updated[key] = generateCandles(symbol, p.timeframe, 220);
            changed = true;
          }
        });

        // Comparison symbols overlay candles key
        if (p.comparisonSymbols) {
          p.comparisonSymbols.forEach(compSym => {
            getStoredSymbolOperands(compSym).forEach((symbol) => {
              const compKey = `${symbol}-${p.timeframe}`;
              if (!updated[compKey]) {
                updated[compKey] = generateCandles(symbol, p.timeframe, 220);
                changed = true;
              }
            });
          });
        }
      });
      valueChainChartSymbols.forEach((chartSymbol) => {
        getStoredSymbolOperands(chartSymbol).forEach((symbol) => {
          const key = `${symbol}-${valueChainChartState.timeframe}`;
          if (!updated[key]) {
            updated[key] = generateCandles(symbol, valueChainChartState.timeframe, 220);
            changed = true;
          }
        });
      });
      
      return changed ? updated : prev;
    });
  }, [panels, valueChainChartState.timeframe, valueChainChartSymbols, moomooRealTimeActive]);

  // --- HANDLERS ---
  // Grouping configuration for unified resizable grid layout calculation
  const colGroups = useMemo(() => {
    if (layoutStyle === 'columns') {
      return panels.map(p => [p]);
    }
    if (layoutStyle === 'rows') {
      return [panels];
    }
    // grid layout grouping (allocate panels into dynamic gridCols)
    const cols: ChartPanel[][] = [];
    for (let c = 0; c < gridCols; c++) {
      cols.push([]);
    }
    panels.forEach((panel, index) => {
      const colIdx = index % gridCols;
      if (cols[colIdx]) {
        cols[colIdx].push(panel);
      }
    });
    return cols.filter(col => col.length > 0);
  }, [panels, layoutStyle, gridCols]);

  const activeMobilePanelIndex = Math.max(
    0,
    Math.min(mobileActivePanelIndex, panels.length - 1),
  );
  const visibleColGroups = useMemo(() => {
    if (!isMobileViewport) return colGroups;
    const activePanel = panels[activeMobilePanelIndex];
    return activePanel ? [[activePanel]] : [];
  }, [activeMobilePanelIndex, colGroups, isMobileViewport, panels]);

  const handleMobileChartHeaderTouchStart = (event: React.TouchEvent) => {
    if (!isMobileViewport || event.touches.length !== 1) return;
    mobileChartSwipeStartRef.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
    };
  };

  const handleMobileChartHeaderTouchEnd = (event: React.TouchEvent) => {
    const swipeStart = mobileChartSwipeStartRef.current;
    mobileChartSwipeStartRef.current = null;
    if (!isMobileViewport || !swipeStart || event.changedTouches.length !== 1) return;

    const deltaX = event.changedTouches[0].clientX - swipeStart.x;
    const deltaY = event.changedTouches[0].clientY - swipeStart.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) return;

    setMobileActivePanelIndex((currentIndex) => {
      const lastPanelIndex = Math.max(0, panels.length - 1);
      return deltaX < 0
        ? Math.min(lastPanelIndex, currentIndex + 1)
        : Math.max(0, currentIndex - 1);
    });
  };

  // Handle column width dragging
  const handleColResizeMouseDown = (
    e: React.MouseEvent,
    firstColIdx: number,
    secondColIdx: number
  ) => {
    e.preventDefault();
    const startX = e.clientX;
    
    const firstEl = document.getElementById(`col-group-${firstColIdx}`);
    const secondEl = document.getElementById(`col-group-${secondColIdx}`);
    if (!firstEl || !secondEl) return;
    
    const firstRect = firstEl.getBoundingClientRect();
    const secondRect = secondEl.getBoundingClientRect();
    
    const initialWidthFirst = firstRect.width;
    const initialWidthSecond = secondRect.width;
    
    const currentWeightFirst = colWeights[`col-${firstColIdx}`] ?? 100;
    const currentWeightSecond = colWeights[`col-${secondColIdx}`] ?? 100;
    const totalWeight = currentWeightFirst + currentWeightSecond;
    const totalPixels = initialWidthFirst + initialWidthSecond;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      
      const nextWidthFirst = Math.max(120, initialWidthFirst + delta);
      const nextWidthSecond = Math.max(120, initialWidthSecond - delta);
      
      const firstRatio = nextWidthFirst / totalPixels;
      const secondRatio = nextWidthSecond / totalPixels;
      
      setColWeights(prev => ({
        ...prev,
        [`col-${firstColIdx}`]: parseFloat((firstRatio * totalWeight).toFixed(3)),
        [`col-${secondColIdx}`]: parseFloat((secondRatio * totalWeight).toFixed(3))
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle absolute panel height resize dragging
  const handlePanelHeightResizeMouseDown = (
    e: React.MouseEvent,
    panelId: string
  ) => {
    e.preventDefault();
    const startY = e.clientY;
    const initialHeight = panelHeights[panelId] ?? DEFAULT_PANEL_HEIGHT;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      setPanelHeights(prev => ({
        ...prev,
        [panelId]: Math.max(100, initialHeight + deltaY)
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleSidebarNavClick = (view: SidebarView) => {
    if (sidebarOpen && sidebarView === view) {
      setSidebarOpen(false);
      return;
    }
    setSidebarView(view);
    setSidebarOpen(true);
  };

  const handleSidebarResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const initialWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const maxWidth = Math.max(300, window.innerWidth - 360);
      setSidebarWidth(Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxWidth, initialWidth + delta)));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleWatchlistColumnResizeMouseDown = (
    e: React.MouseEvent,
    leftKey: keyof WatchlistColumnWidths,
    rightKey: keyof WatchlistColumnWidths,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const initialLeft = watchlistLayout.widths[leftKey];
    const initialRight = watchlistLayout.widths[rightKey];
    const leftMin = WATCHLIST_COLUMN_MIN_WIDTHS[leftKey];
    const rightMin = WATCHLIST_COLUMN_MIN_WIDTHS[rightKey];
    const pairTotal = initialLeft + initialRight;
    const leftMax = pairTotal - rightMin;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextLeft = Math.max(leftMin, Math.min(leftMax, initialLeft + delta));
      const nextRight = pairTotal - nextLeft;
      setWatchlistColumnWidths((prev) => ({
        ...prev,
        symbol: watchlistLayout.widths.symbol,
        name: watchlistLayout.widths.name,
        price: watchlistLayout.widths.price,
        change: watchlistLayout.widths.change,
        [leftKey]: nextLeft,
        [rightKey]: nextRight,
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const updateActiveWatchlistTab = (updater: (tab: WatchlistTab) => WatchlistTab) => {
    setWatchlistTabs((currentTabs) =>
      currentTabs.map((tab) => tab.id === activeWatchlistTabId ? updater(tab) : tab)
    );
  };

  const syncChainToWatchlist = (
    rawChain: unknown,
    sourcePrefix: string,
    options: { selectFirstTab?: boolean } = {},
  ) => {
    const chain = normalizeWatchlistSyncChain(rawChain);
    if (!chain) return;
    const signature = createWatchlistSyncSignature(chain, sourcePrefix);
    const syncedTabs = createWatchlistTabsFromSyncChain(chain, sourcePrefix);
    if (syncedTabs.length === 0) return;
    const syncedTickers = extractTickersFromSyncChain(chain);

    watchlistSyncSignatureRef.current = signature;
    setTickers((currentTickers) => {
      const currentSymbols = new Set(currentTickers.map((ticker) => ticker.symbol));
      const additions = syncedTickers.filter((ticker) => !currentSymbols.has(ticker.symbol));
      return additions.length > 0 ? [...currentTickers, ...additions] : currentTickers;
    });
    setWatchlistTabs((currentTabs) => {
      const nextTabs = mergeSyncedWatchlistTabs(currentTabs, syncedTabs);
      return areWatchlistTabsEqual(currentTabs, nextTabs) ? currentTabs : nextTabs;
    });
    if (options.selectFirstTab) {
      setActiveWatchlistTabId(syncedTabs[0].id);
      setSidebarView('watchlist');
      setSidebarOpen(true);
    }
  };

  const syncStoredMacroFlowToWatchlist = () => {
    const storedChains = readStoredWatchlistSyncChains();
    if (storedChains.length > 0) {
      storedChains.forEach((storedChain) => syncChainToWatchlist(storedChain, 'value-chain'));
      return;
    }
    syncChainToWatchlist(getMacroFlowDefaultWatchlistChain(), 'macro-flow');
  };

  useEffect(() => {
    syncStoredMacroFlowToWatchlist();
    window.addEventListener(VALUE_CHAIN_SYNC_EVENT, syncStoredMacroFlowToWatchlist);
    return () => window.removeEventListener(VALUE_CHAIN_SYNC_EVENT, syncStoredMacroFlowToWatchlist);
  }, []);

  const handleAddWatchlistTab = () => {
    const newTabId = createId('tab');
    const newSectionId = createId('section');
    const newTab: WatchlistTab = {
      id: newTabId,
      name: '新規リスト',
      sections: [{
        id: newSectionId,
        name: '銘柄',
        collapsed: false,
        symbols: [],
      }],
    };
    setWatchlistTabs((currentTabs) => [...currentTabs, newTab]);
    setActiveWatchlistTabId(newTabId);
    setEditingTabId(newTabId);
    setSidebarView('watchlist');
    setSidebarOpen(true);
  };

  const handleRenameWatchlistTab = (tabId: string, name: string) => {
    setWatchlistTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === tabId
          ? { ...tab, name: name.trim() || tab.name }
          : tab
      )
    );
  };

  const handleDeleteWatchlistTab = (tabId: string) => {
    if (watchlistTabs.length <= 1) return;
    const deleteIndex = watchlistTabs.findIndex((tab) => tab.id === tabId);
    const remainingTabs = watchlistTabs.filter((tab) => tab.id !== tabId);
    setWatchlistTabs(remainingTabs);
    if (activeWatchlistTabId === tabId) {
      const stayTab = remainingTabs[Math.min(Math.max(deleteIndex, 0), remainingTabs.length - 1)];
      setActiveWatchlistTabId(stayTab?.id ?? DEFAULT_WATCHLIST_TAB_ID);
    }
    setDraggedWatchlistTabId((current) => current === tabId ? null : current);
  };

  const selectWatchlistTab = (tabId: string) => {
    setActiveWatchlistTabId(tabId);
  };

  const moveWatchlistTab = (
    sourceTabId: string | null | undefined,
    targetTabId: string | null | undefined,
    position: WatchlistTabDropPosition,
  ) => {
    if (!sourceTabId || !targetTabId || sourceTabId === targetTabId) return;
    setWatchlistTabs((currentTabs) => {
      const sourceTab = currentTabs.find((tab) => tab.id === sourceTabId);
      if (!sourceTab || !currentTabs.some((tab) => tab.id === targetTabId)) return currentTabs;

      const tabsWithoutSource = currentTabs.filter((tab) => tab.id !== sourceTabId);
      const targetIndex = tabsWithoutSource.findIndex((tab) => tab.id === targetTabId);
      if (targetIndex === -1) return currentTabs;

      const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
      const nextTabs = [...tabsWithoutSource];
      nextTabs.splice(insertIndex, 0, sourceTab);
      return nextTabs;
    });
  };

  const handleWatchlistTabDragStart = (
    event: React.DragEvent<HTMLElement>,
    tab: WatchlistTab,
  ) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-mooview-watchlist-tab', tab.id);
    event.dataTransfer.setData('text/plain', tab.name);
    setDraggedWatchlistTabId(tab.id);
  };

  const handleWatchlistTabDragOver = (
    event: React.DragEvent<HTMLElement>,
    targetTabId: string,
  ) => {
    const sourceTabId = draggedWatchlistTabId
      || event.dataTransfer.getData('application/x-mooview-watchlist-tab');
    if (!sourceTabId || sourceTabId === targetTabId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleWatchlistTabDrop = (
    event: React.DragEvent<HTMLElement>,
    targetTabId: string,
    axis: 'x' | 'y',
  ) => {
    const sourceTabId = draggedWatchlistTabId
      || event.dataTransfer.getData('application/x-mooview-watchlist-tab');
    if (!sourceTabId || sourceTabId === targetTabId) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const midpoint = axis === 'x'
      ? rect.left + rect.width / 2
      : rect.top + rect.height / 2;
    const pointer = axis === 'x' ? event.clientX : event.clientY;
    moveWatchlistTab(sourceTabId, targetTabId, pointer >= midpoint ? 'after' : 'before');
    setDraggedWatchlistTabId(null);
  };

  const handleWatchlistTabMouseDown = (
    event: React.MouseEvent<HTMLElement>,
    sourceTabId: string,
  ) => {
    if (event.button !== 0 || editingTabId === sourceTabId) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let isDragging = false;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (distance < 5) return;
      isDragging = true;
      setDraggedWatchlistTabId(sourceTabId);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      const endDistance = Math.hypot(upEvent.clientX - startX, upEvent.clientY - startY);
      const completedDrag = isDragging || endDistance >= 5;
      if (!completedDrag) return;

      const targetElement = document
        .elementFromPoint(upEvent.clientX, upEvent.clientY)
        ?.closest('[data-watchlist-tab-id]') as HTMLElement | null;
      const targetTabId = targetElement?.dataset.watchlistTabId;
      if (targetTabId && targetTabId !== sourceTabId) {
        const rect = targetElement.getBoundingClientRect();
        moveWatchlistTab(
          sourceTabId,
          targetTabId,
          upEvent.clientX >= rect.left + rect.width / 2 ? 'after' : 'before',
        );
      }
      setDraggedWatchlistTabId(null);
      watchlistTabSuppressClickRef.current = true;
      window.setTimeout(() => {
        watchlistTabSuppressClickRef.current = false;
      }, 0);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleWatchlistTabPointerDown = (
    event: React.PointerEvent<HTMLElement>,
    sourceTabId: string,
  ) => {
    if (event.button !== 0 || editingTabId === sourceTabId) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    let isDragging = false;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (distance < 5) return;
      isDragging = true;
      setDraggedWatchlistTabId(sourceTabId);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      const endDistance = Math.hypot(upEvent.clientX - startX, upEvent.clientY - startY);
      const completedDrag = isDragging || endDistance >= 5;
      if (!completedDrag) return;

      const targetElement = document
        .elementFromPoint(upEvent.clientX, upEvent.clientY)
        ?.closest('[data-watchlist-tab-id]') as HTMLElement | null;
      const targetTabId = targetElement?.dataset.watchlistTabId;
      if (targetTabId && targetTabId !== sourceTabId) {
        const rect = targetElement.getBoundingClientRect();
        moveWatchlistTab(
          sourceTabId,
          targetTabId,
          upEvent.clientX >= rect.left + rect.width / 2 ? 'after' : 'before',
        );
      }
      setDraggedWatchlistTabId(null);
      watchlistTabSuppressClickRef.current = true;
      window.setTimeout(() => {
        watchlistTabSuppressClickRef.current = false;
      }, 0);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const openWatchlistEmptyMenu = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-watchlist-menu-target],button,input,select,textarea,a')) return;
    event.preventDefault();
    event.stopPropagation();
    setWatchlistContextMenu(null);
    setSectionMenu(null);
    setWatchlistHeaderMenu(null);
    setWatchlistTabMenu(null);
    setWatchlistEmptyMenu({ x: event.clientX, y: event.clientY });
  };

  const handleWatchlistTabContextMenu = (event: React.MouseEvent, tabId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setTabsDropdownOpen(false);
    setTabsDropdownAnchor(null);
    setWatchlistTabMenu({
      tabId,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const toggleTabsDropdown = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const dropdownWidth = 192;
    setTabsDropdownAnchor({
      x: Math.max(8, Math.min(window.innerWidth - dropdownWidth - 8, rect.right - dropdownWidth)),
      y: Math.min(window.innerHeight - 8, rect.bottom + 2),
      width: dropdownWidth,
    });
    setTabsDropdownOpen((open) => !open);
  };

  const toggleWatchlistTabQuoteFetchMode = (tabId: string) => {
    const nextMode = getWatchlistQuoteFetchMode(watchlistQuoteFetchModes, tabId) === 'auto'
      ? 'manual'
      : 'auto';
    setWatchlistQuoteFetchModes((currentModes) => ({
      ...currentModes,
      [tabId]: nextMode,
    }));
    setWatchlistTabMenu(null);
  };

  const handleJumpToFirstWatchlistTab = () => {
    const firstTab = watchlistTabs[0];
    if (!firstTab) return;
    selectWatchlistTab(firstTab.id);
  };

  const handleJumpToLastWatchlistTab = () => {
    const lastTab = watchlistTabs[watchlistTabs.length - 1];
    if (!lastTab) return;
    selectWatchlistTab(lastTab.id);
  };

  const handleAddWatchlistSection = (afterSectionId?: string) => {
    const newSectionId = createId('section');
    const newSection: WatchlistSection = {
      id: newSectionId,
      name: '新規セクション',
      collapsed: false,
      symbols: [],
    };
    updateActiveWatchlistTab((tab) => {
      if (!afterSectionId) {
        return { ...tab, sections: [...tab.sections, newSection] };
      }
      const insertIndex = tab.sections.findIndex((section) => section.id === afterSectionId);
      if (insertIndex === -1) {
        return { ...tab, sections: [...tab.sections, newSection] };
      }
      return {
        ...tab,
        sections: [
          ...tab.sections.slice(0, insertIndex + 1),
          newSection,
          ...tab.sections.slice(insertIndex + 1),
        ],
      };
    });
    setEditingSectionId(newSectionId);
    setSectionNameDraft(newSection.name);
    setSectionMenu(null);
  };

  const handleRenameWatchlistSection = (sectionId: string, name: string) => {
    updateActiveWatchlistTab((tab) => ({
      ...tab,
      sections: tab.sections.map((section) =>
        section.id === sectionId
          ? { ...section, name: name.trim() || section.name }
          : section
      ),
    }));
  };

  const beginRenameWatchlistSection = (sectionId: string, currentName: string) => {
    setEditingSectionId(sectionId);
    setSectionNameDraft(currentName);
  };

  const commitWatchlistSectionRename = () => {
    if (!editingSectionId) return;
    const nextName = sectionNameDraft.trim();
    if (nextName) {
      handleRenameWatchlistSection(editingSectionId, nextName);
    }
    setEditingSectionId(null);
    setSectionNameDraft('');
  };

  const cancelWatchlistSectionRename = () => {
    setEditingSectionId(null);
    setSectionNameDraft('');
  };

  const handleToggleWatchlistSection = (sectionId: string) => {
    updateActiveWatchlistTab((tab) => ({
      ...tab,
      sections: tab.sections.map((section) =>
        section.id === sectionId
          ? { ...section, collapsed: !section.collapsed }
          : section
      ),
    }));
  };

  const handleDeleteWatchlistSection = (sectionId: string) => {
    updateActiveWatchlistTab((tab) => {
      const remainingSections = tab.sections.filter((section) => section.id !== sectionId);
      if (remainingSections.length === 0) {
        return {
          ...tab,
          sections: [{
            id: createId('section'),
            name: '銘柄',
            collapsed: false,
            symbols: [],
          }],
        };
      }
      return { ...tab, sections: remainingSections };
    });
    setSectionMenu(null);
  };

  const handleDeleteWatchlistSectionFromTab = (tabId: string, sectionId: string) => {
    setWatchlistTabs((currentTabs) =>
      currentTabs.map((tab) => {
        if (tab.id !== tabId) return tab;
        const remainingSections = tab.sections.filter((section) => section.id !== sectionId);
        return {
          ...tab,
          sections: remainingSections.length > 0
            ? remainingSections
            : [{
                id: createId('section'),
                name: 'バスケット',
                collapsed: false,
                symbols: [],
              }],
        };
      })
    );
    setSectionMenu(null);
    setWatchlistTargetMenu(null);
  };

  const handleDeleteWatchlistTargetFromMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    tabId: string,
    sectionId?: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (sectionId) {
      handleDeleteWatchlistSectionFromTab(tabId, sectionId);
      return;
    }
    handleDeleteWatchlistTab(tabId);
    setWatchlistTargetMenu(null);
  };

  const handleDropWatchlistSection = (
    event: React.DragEvent<HTMLDivElement>,
    targetSectionId: string,
  ) => {
    if (!draggedSectionId || draggedSectionId === targetSectionId) return;
    event.preventDefault();
    event.stopPropagation();
    const placeAfterTarget =
      event.clientY > event.currentTarget.getBoundingClientRect().top + event.currentTarget.offsetHeight / 2;
    updateActiveWatchlistTab((tab) => {
      const draggedSection = tab.sections.find((section) => section.id === draggedSectionId);
      if (!draggedSection) return tab;
      const sectionsWithoutDragged = tab.sections.filter((section) => section.id !== draggedSectionId);
      const targetIndex = sectionsWithoutDragged.findIndex((section) => section.id === targetSectionId);
      if (targetIndex === -1) return tab;
      const insertIndex = targetIndex + (placeAfterTarget ? 1 : 0);
      const reorderedSections = [...sectionsWithoutDragged];
      reorderedSections.splice(insertIndex, 0, draggedSection);
      return { ...tab, sections: reorderedSections };
    });
    setDraggedSectionId(null);
    setDraggedBasket(null);
  };

  const addSymbolsToActiveWatchlist = (
    symbols: string[],
    importedBaskets?: Array<{ symbol: string; basket?: string }>
  ) => {
    const uniqueSymbols = Array.from(new Set(symbols.filter(Boolean)));
    if (uniqueSymbols.length === 0) return;

    updateActiveWatchlistTab((tab) => {
      const existingSymbols = new Set(tab.sections.flatMap((section) => section.symbols));
      const symbolsToAdd = uniqueSymbols.filter((symbol) => !existingSymbols.has(symbol));
      if (symbolsToAdd.length === 0) {
        return tab;
      }

      if (importedBaskets && importedBaskets.some((b) => b.basket)) {
        const nextSections = [...tab.sections];
        const seen = new Set<string>();

        importedBaskets.forEach((item) => {
          if (!item.symbol || seen.has(item.symbol) || !symbolsToAdd.includes(item.symbol)) return;
          seen.add(item.symbol);

          const targetSectionName = item.basket || 'その他';
          let targetSection = nextSections.find((s) => s.name === targetSectionName);

          if (!targetSection) {
            targetSection = {
              id: createId('section-import'),
              name: targetSectionName,
              collapsed: false,
              symbols: [],
            };
            nextSections.push(targetSection);
          }

          const idx = nextSections.findIndex((s) => s.id === targetSection!.id);
          nextSections[idx] = {
            ...nextSections[idx],
            symbols: [...nextSections[idx].symbols, item.symbol],
          };
        });

        return {
          ...tab,
          sections: nextSections,
        };
      }

      const firstOpenSection = tab.sections.find((section) => !section.collapsed) ?? tab.sections[0];
      return {
        ...tab,
        sections: tab.sections.map((section) =>
          section.id === firstOpenSection.id
            ? { ...section, symbols: [...section.symbols, ...symbolsToAdd] }
            : section
        ),
      };
    });
  };

  const addSymbolsToNewWatchlistTab = (
    symbols: string[],
    fileName: string,
    importedBaskets?: Array<{ symbol: string; basket?: string }>
  ) => {
    const uniqueSymbols = Array.from(new Set(symbols.filter(Boolean)));
    if (uniqueSymbols.length === 0) return;

    // [DEBUG] basket情報の確認
    console.log('[TAB-DEBUG] importedBaskets先頭5件:', importedBaskets?.slice(0, 5));
    console.log('[TAB-DEBUG] basket有り件数:', importedBaskets?.filter((b) => b.basket).length, '/ 全', importedBaskets?.length);

    const tabId = createId('watchlist-import');
    const baseName = fileName.replace(/\.[^.]+$/, '').trim();
    const tabName = (baseName || 'インポート').slice(0, 24);

    let sections: WatchlistSection[] = [];
    if (importedBaskets && importedBaskets.some((b) => b.basket)) {
      const basketMap = new Map<string, string[]>();
      const defaultSymbols: string[] = [];
      const seen = new Set<string>();

      importedBaskets.forEach((item) => {
        if (!item.symbol || seen.has(item.symbol)) return;
        seen.add(item.symbol);

        if (item.basket) {
          if (!basketMap.has(item.basket)) {
            basketMap.set(item.basket, []);
          }
          basketMap.get(item.basket)!.push(item.symbol);
        } else {
          defaultSymbols.push(item.symbol);
        }
      });

      basketMap.forEach((symbolsInBasket, basketName) => {
        sections.push({
          id: createId('section-import'),
          name: basketName,
          collapsed: false,
          symbols: symbolsInBasket,
        });
      });

      if (defaultSymbols.length > 0) {
        sections.push({
          id: createId('section-import'),
          name: 'その他',
          collapsed: false,
          symbols: defaultSymbols,
        });
      }
    } else {
      const sectionId = createId('section-import');
      sections = [{
        id: sectionId,
        name: 'インポート',
        collapsed: false,
        symbols: uniqueSymbols,
      }];
    }

    setWatchlistTabs((currentTabs) => [
      ...currentTabs,
      {
        id: tabId,
        name: tabName,
        sections,
      },
    ]);
    setActiveWatchlistTabId(tabId);
    setSidebarView('watchlist');
    setSidebarOpen(true);
  };

  const handleMobileSheetNavClick = (view: MobileSheetView) => {
    setAppView(view === 'disclosures' ? 'disclosures' : 'charts');
    if (view === 'watchlist' || view === 'indicators' || view === 'settings' || view === 'disclosures') {
      setSidebarView(view);
    }
    const activePanel = panels[activeMobilePanelIndex];
    if (activePanel && view === 'image-export') {
      setChartImageExportSettings((current) => ({
        ...current,
        selection: { ...current.selection, mode: 'custom', panelIds: [activePanel.id] },
      }));
    }
    if (activePanel && view === 'video-export') {
      setChartVideoExportSettings((current) => ({
        ...current,
        selection: { ...current.selection, mode: 'custom', panelIds: [activePanel.id] },
      }));
    }
    setMobileSheetView((currentView) => currentView === view ? null : view);
  };

  const addSymbolToActiveWatchlist = (symbol: string) => {
    addSymbolsToActiveWatchlist([symbol]);
  };

  const handleRemoveTickerFromSection = (sectionId: string, symbol: string) => {
    updateActiveWatchlistTab((tab) => ({
      ...tab,
      sections: tab.sections.map((section) =>
        section.id === sectionId
          ? { ...section, symbols: section.symbols.filter((currentSymbol) => currentSymbol !== symbol) }
          : section
      ),
    }));
  };

  const handleRemoveTickersFromSection = (sectionId: string, symbolsToRemove: string[]) => {
    updateActiveWatchlistTab((tab) => ({
      ...tab,
      sections: tab.sections.map((section) =>
        section.id === sectionId
          ? { ...section, symbols: section.symbols.filter((currentSymbol) => !symbolsToRemove.includes(currentSymbol)) }
          : section
      ),
    }));
    setSelectedSymbols((prev) => prev.filter((s) => !symbolsToRemove.includes(s)));
  };

  const handleDropTicker = (targetSectionId: string, targetSymbol?: string) => {
    if (!draggedTicker) return;
    setWatchlistSort({ column: null, direction: null });
    updateActiveWatchlistTab((tab) => {
      const withoutDragged = tab.sections.map((section) => ({
        ...section,
        symbols: section.symbols.filter((symbol) => symbol !== draggedTicker.symbol),
      }));
      return {
        ...tab,
        sections: withoutDragged.map((section) => {
          if (section.id !== targetSectionId) return section;
          const targetIndex = targetSymbol
            ? section.symbols.findIndex((symbol) => symbol === targetSymbol)
            : -1;
          const nextSymbols = [...section.symbols];
          if (targetIndex >= 0) {
            nextSymbols.splice(targetIndex, 0, draggedTicker.symbol);
          } else {
            nextSymbols.push(draggedTicker.symbol);
          }
          return { ...section, symbols: nextSymbols };
        }),
      };
    });
    setDraggedTicker(null);
    setDraggedBasket(null);
  };

  const cycleWatchlistSort = (column: WatchlistColumnKey) => {
    setWatchlistSort((currentSort) => {
      if (currentSort.column !== column) {
        return { column, direction: 'asc' };
      }
      if (currentSort.direction === 'asc') {
        return { column, direction: 'desc' };
      }
      return { column: null, direction: null };
    });
  };

  const getSortIndicator = (column: WatchlistColumnKey) => {
    if (watchlistSort.column !== column) return '';
    return watchlistSort.direction === 'asc' ? '▲' : '▼';
  };

  const openIndicatorSettingsForSymbol = (symbol: string) => {
    const symbolKey = symbol.toUpperCase();
    setIndicatorDatabase((current) => (
      current[symbolKey]
        ? current
        : { ...current, [symbolKey]: createDefaultIndicatorSettings(symbolKey) }
    ));
    setFocusedSymbolIndex(symbolKey);
    setSidebarView('indicators');
    if (isMobileViewport) {
      setMobileSheetView('indicators');
    } else {
      setSidebarOpen(true);
    }
  };

  const selectTickerForPrimaryChart = (symbol: string) => {
    const chartSymbol = normalizeStoredSymbolValue(symbol) || symbol;
    setFocusedSymbolIndex(chartSymbol);
    chartMissingDataRefreshRef.current = { signature: '', requestedAt: 0 };
    forceCandleRefreshRef.current = true;
    if (!moomooRealTimeActiveRef.current) {
      setMoomooRealTimeActive(true);
    }
    queuePriorityQuoteRefreshForChartSymbols([chartSymbol]);
    setMobileActivePanelIndex(0);
    setPanels((currentPanels) =>
      currentPanels.map((panel, index) =>
        index === 0
          ? {
              ...panel,
              symbol: chartSymbol,
              comparisonOnly: undefined,
              showVolume: true,
              watchlistTabId: undefined,
              watchlistSectionId: undefined,
              comparisonSymbols: (panel.comparisonSymbols || []).filter(
                (comparisonSymbol) => comparisonSymbol !== chartSymbol
              ),
            }
          : panel
      )
    );
    setTickTrigger((current) => current + 1);
  };

  const registerTickerExpression = async (
    rawExpression: string,
    options: RegisterTickerOptions = {},
  ): Promise<RegisterTickerResult> => {
    const {
      reportError = true,
      selectAfterAdd = true,
      clearInput = true,
      closeSearch = true,
    } = options;
    const requestedExpression = normalizeSymbolExpressionForStorage(rawExpression);
    if (!requestedExpression) {
      return {
        success: false,
        error: '式は「ティッカー/ティッカー」または「ティッカー-ティッカー」で入力してください。',
      };
    }

    const requestedSymbol = formatSymbolExpression(requestedExpression);
    if (tickers.some((ticker) => ticker.symbol === requestedSymbol)) {
      addSymbolToActiveWatchlist(requestedSymbol);
      if (selectAfterAdd) selectTickerForPrimaryChart(requestedSymbol);
      if (closeSearch) setTickerSearchOpen(false);
      return { success: true, symbol: requestedSymbol };
    }

    setTickerSearchLoading(true);
    if (reportError) {
      setTickerSearchError(null);
    }

    try {
      const fetchOperandQuote = async (symbol: string) => {
        const { data } = await fetchJsonWithTimeout('/api/moomoo/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol }),
        });
        const price = Number(data.price);
        if (!data.success || !Number.isFinite(price)) {
          throw new Error(data.error || `${symbol}の価格を取得できません。`);
        }
        return {
          symbol: normalizeTickerSymbolForStorage(String(data.symbol || symbol)),
          name: String(data.name || symbol).replace(/^US\./i, ''),
          price,
          changePct: Number.isFinite(Number(data.changePct)) ? Number(data.changePct) : 0,
          marketCap: Number.isFinite(Number(data.marketCap)) && Number(data.marketCap) > 0
            ? Number(data.marketCap)
            : undefined,
        };
      };

      const [leftQuote, rightQuote] = await Promise.all([
        fetchOperandQuote(requestedExpression.left),
        fetchOperandQuote(requestedExpression.right),
      ]);
      const expression: SymbolExpression = {
        left: leftQuote.symbol,
        operator: requestedExpression.operator,
        right: rightQuote.symbol,
      };
      const storedSymbol = formatSymbolExpression(expression);
      const calculatedQuote = calculateExpressionQuote(expression, leftQuote, rightQuote);
      if (!calculatedQuote) {
        throw new Error(
          expression.operator === '/'
            ? '右辺の値が0のため、割り算の式を計算できません。'
            : '式の現在値を計算できません。',
        );
      }

      const newTicker: TickerInfo = {
        symbol: storedSymbol,
        name: `${leftQuote.name} ${expression.operator} ${rightQuote.name}`,
        basePrice: calculatedQuote.price,
        dailyChangePct: calculatedQuote.changePct ?? 0,
      };

      setTickers((currentTickers) => {
        if (currentTickers.some((ticker) => ticker.symbol === storedSymbol)) {
          return currentTickers;
        }
        return [...currentTickers, newTicker];
      });
      setQuoteCache((currentQuotes) => ({
        ...currentQuotes,
        [leftQuote.symbol]: {
          name: leftQuote.name,
          price: leftQuote.price,
          changePct: leftQuote.changePct,
          marketCap: leftQuote.marketCap,
        },
        [rightQuote.symbol]: {
          name: rightQuote.name,
          price: rightQuote.price,
          changePct: rightQuote.changePct,
          marketCap: rightQuote.marketCap,
        },
      }));
      setIndicatorDatabase((currentDatabase) => ({
        ...currentDatabase,
        [storedSymbol]: currentDatabase[storedSymbol]
          || createDefaultIndicatorSettings(storedSymbol),
      }));
      addSymbolToActiveWatchlist(storedSymbol);
      if (selectAfterAdd) selectTickerForPrimaryChart(storedSymbol);
      if (clearInput) setNewSymbolInput('');
      setTickerSearchCandidates([]);
      if (closeSearch) setTickerSearchOpen(false);
      return { success: true, symbol: storedSymbol };
    } catch (error) {
      const message = error instanceof Error ? error.message : '演算式を登録できませんでした。';
      if (reportError) {
        setTickerSearchError(message);
      }
      return {
        success: false,
        error: message,
        gatewayFailure: isMoomooGatewayFailureMessage(message),
      };
    } finally {
      setTickerSearchLoading(false);
    }
  };

  const registerTickerCandidate = async (
    candidate: SymbolSearchCandidate,
    options: RegisterTickerOptions = {},
  ): Promise<RegisterTickerResult> => {
    const {
      reportError = true,
      selectAfterAdd = true,
      clearInput = true,
      closeSearch = true,
    } = options;
    const requestedSymbol = normalizeTickerSymbolForStorage(candidate.symbol);
    const cleanName = candidate.name.replace(/^US\./i, '');

    if (tickers.some((ticker) => ticker.symbol === requestedSymbol)) {
      addSymbolToActiveWatchlist(requestedSymbol);
      if (selectAfterAdd) selectTickerForPrimaryChart(requestedSymbol);
      if (closeSearch) setTickerSearchOpen(false);
      return { success: true, symbol: requestedSymbol };
    }

    setTickerSearchLoading(true);
    if (reportError) {
      setTickerSearchError(null);
    }
    try {
      const { data } = await fetchJsonWithTimeout('/api/moomoo/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: requestedSymbol }),
      });
      const price = Number(data.price);
      if (!data.success || !Number.isFinite(price) || price <= 0) {
        throw new Error(data.error || 'Moomooから銘柄情報を取得できません。');
      }

      const storedSymbol = normalizeTickerSymbolForStorage(String(data.symbol || requestedSymbol));
      if (tickers.some((ticker) => ticker.symbol === storedSymbol)) {
        addSymbolToActiveWatchlist(storedSymbol);
        if (selectAfterAdd) selectTickerForPrimaryChart(storedSymbol);
        if (closeSearch) setTickerSearchOpen(false);
        return { success: true, symbol: storedSymbol };
      }

      const changePct = Number(data.changePct || 0);
      const newTicker: TickerInfo = {
        symbol: storedSymbol,
        name: cleanName || data.name || storedSymbol,
        basePrice: price,
        dailyChangePct: Number.isFinite(changePct) ? changePct : 0,
      };

      setTickers((currentTickers) => {
        if (currentTickers.some((ticker) => ticker.symbol === newTicker.symbol)) {
          return currentTickers;
        }
        return [...currentTickers, newTicker];
      });
      setQuoteCache((currentQuotes) => ({
        ...currentQuotes,
        [storedSymbol]: {
          name: newTicker.name,
          price: newTicker.basePrice,
          changePct: newTicker.dailyChangePct,
          marketCap: Number.isFinite(Number(data.marketCap)) && Number(data.marketCap) > 0
            ? Number(data.marketCap)
            : undefined,
        },
      }));
      setIndicatorDatabase((currentDatabase) => ({
        ...currentDatabase,
        [storedSymbol]: currentDatabase[storedSymbol]
          || createDefaultIndicatorSettings(storedSymbol),
      }));
      addSymbolToActiveWatchlist(storedSymbol);
      if (selectAfterAdd) selectTickerForPrimaryChart(storedSymbol);
      if (clearInput) setNewSymbolInput('');
      setTickerSearchCandidates([]);
      if (closeSearch) setTickerSearchOpen(false);
      return { success: true, symbol: storedSymbol };
    } catch (error) {
      const message = error instanceof Error ? error.message : '銘柄を登録できませんでした。';
      if (reportError) {
        setTickerSearchError(message);
      }
      return {
        success: false,
        error: message,
        gatewayFailure: isMoomooGatewayFailureMessage(message),
      };
    } finally {
      setTickerSearchLoading(false);
    }
  };

  const registerTickerInput = async (
    queryInput: string,
    options: RegisterTickerOptions = {},
  ): Promise<RegisterTickerResult> => {
    const {
      reportError = true,
      selectAfterAdd = true,
      clearInput = true,
      closeSearch = true,
      allowCandidates = true,
    } = options;
    const expressionInput = parseSymbolExpression(queryInput);
    let expressionError: string | undefined;

    if (expressionInput) {
      const expressionResult = await registerTickerExpression(queryInput, {
        reportError: false,
        selectAfterAdd,
        clearInput,
        closeSearch,
      });
      if (expressionResult.success) {
        return expressionResult;
      }
      expressionError = expressionResult.error;
      if (expressionInput.operator === '/') {
        if (reportError) {
          setTickerSearchError(expressionError || '割り算の式を登録できませんでした。');
        }
        return {
          success: false,
          error: expressionError || '割り算の式を登録できませんでした。',
          gatewayFailure: expressionResult.gatewayFailure,
        };
      }
    }

    if (isLikelyTickerInput(queryInput)) {
      const directCandidate: SymbolSearchCandidate = {
        symbol: queryInput,
        code: queryInput,
        name: queryInput.toUpperCase(),
        nameEn: queryInput.toUpperCase(),
        market: 'US',
        category: 'DIRECT',
      };
      const directResult = await registerTickerCandidate(directCandidate, {
        reportError: false,
        selectAfterAdd,
        clearInput,
        closeSearch,
      });
      if (directResult.success) {
        return directResult;
      }
      if (expressionInput) {
        const message = expressionError || directResult.error || '引き算の式を登録できませんでした。';
        if (reportError) setTickerSearchError(message);
        return {
          success: false,
          error: message,
          gatewayFailure: directResult.gatewayFailure,
        };
      }
      if (directResult.gatewayFailure) {
        const message = directResult.error || 'Moomooゲートウェイへ接続できません。';
        if (reportError) setTickerSearchError(message);
        return { success: false, error: message, gatewayFailure: true };
      }
    }

    setTickerSearchLoading(true);
    try {
      const { data } = await fetchJsonWithTimeout('/api/moomoo/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryInput, limit: 10 }),
      }, 25_000);
      const candidates = Array.isArray(data.candidates)
        ? data.candidates as SymbolSearchCandidate[]
        : [];
      if (!data.success || candidates.length === 0) {
        throw new Error(data.error || '該当する銘柄が見つかりません。');
      }

      const processedCandidates = candidates.map(c => {
        const symbol = normalizeTickerSymbolForStorage(c.symbol);
        return { ...c, symbol };
      });

      if (processedCandidates.length === 1) {
        return registerTickerCandidate(processedCandidates[0], {
          reportError,
          selectAfterAdd,
          clearInput,
          closeSearch,
        });
      }

      if (!allowCandidates) {
        throw new Error('候補選択が必要です。単独で入力して候補から選んでください。');
      }

      setTickerSearchCandidates(processedCandidates);
      return { success: false, error: '候補から銘柄を選択してください。' };
    } catch (error) {
      const message = error instanceof Error ? error.message : '銘柄検索に失敗しました。';
      if (reportError) setTickerSearchError(message);
      return { success: false, error: message };
    } finally {
      setTickerSearchLoading(false);
    }
  };

  const submitTickerInput = async () => {
    const queryInput = newSymbolInput.trim();
    if (!queryInput || tickerSearchLoading) return;

    setTickerSearchError(null);
    setTickerSearchCandidates([]);
    const inputItems = splitTickerInputList(queryInput);

    if (inputItems.length > 1) {
      setTickerSearchLoading(true);
      const successes: string[] = [];
      const failures: string[] = [];
      try {
        for (const item of inputItems) {
          const result = await registerTickerInput(item, {
            reportError: false,
            selectAfterAdd: false,
            clearInput: false,
            closeSearch: false,
            allowCandidates: false,
          });
          if (result.success && result.symbol) {
            successes.push(result.symbol);
          } else {
            failures.push(`${item}: ${result.error || '登録できませんでした。'}`);
          }
        }
      } finally {
        setTickerSearchLoading(false);
      }

      if (successes.length > 0) {
        selectTickerForPrimaryChart(successes[0]);
        setTickerSearchCandidates([]);
      }
      if (failures.length > 0) {
        setNewSymbolInput(failures.map((failure) => failure.split(':', 1)[0]).join(', '));
        setTickerSearchError(
          `${successes.length}件を追加しました。失敗: ${failures.join(' / ')}`
        );
      } else {
        setNewSymbolInput('');
        setTickerSearchOpen(false);
      }
      return;
    }

    await registerTickerInput(inputItems[0] || queryInput);
  };

  // 銘柄名・証券コード・ティッカーから候補を検索する
  const handleAddTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitTickerInput();
  };

  const beginWatchlistImport = (mode: WatchlistImportMode) => {
    watchlistImportModeRef.current = mode;
    setWatchlistImportMode(mode);
    setWatchlistTransferMenuLayer('root');
    setWatchlistImportMenuOpen(false);
    window.setTimeout(() => csvImportInputRef.current?.click(), 0);
  };

  const beginWatchlistExport = () => {
    const initialTabId = watchlistTabs.some((tab) => tab.id === activeWatchlistTabId)
      ? activeWatchlistTabId
      : watchlistTabs[0]?.id;
    setSelectedWatchlistExportTabIds(initialTabId ? [initialTabId] : []);
    setWatchlistTransferMenuLayer('export');
  };

  const toggleWatchlistExportTab = (tabId: string) => {
    setSelectedWatchlistExportTabIds((current) =>
      current.includes(tabId)
        ? current.filter((id) => id !== tabId)
        : [...current, tabId]
    );
  };

  const handleExportSelectedWatchlistTabs = () => {
    const selectedTabIds = new Set(selectedWatchlistExportTabIds);
    const tabsToExport = watchlistTabs.filter((tab) => selectedTabIds.has(tab.id));
    if (tabsToExport.length === 0) {
      setWatchlistImportMessage('エクスポートするタブを1つ以上選択してください。');
      return;
    }

    const fileNameCounts = new Map<string, number>();
    tabsToExport.forEach((tab) => {
      const baseFileName = sanitizeWatchlistExportFileName(tab.name);
      const duplicateIndex = fileNameCounts.get(baseFileName) || 0;
      fileNameCounts.set(baseFileName, duplicateIndex + 1);
      const uniqueFileName = duplicateIndex === 0
        ? `${baseFileName}.csv`
        : `${baseFileName}-${duplicateIndex + 1}.csv`;
      const csv = createWatchlistExportCsv(tab, tickers, watchlistNameOverrides);
      downloadWatchlistCsv(csv, uniqueFileName);
    });

    setWatchlistImportMessage(
      `${tabsToExport.length}個のウォッチリストをタブ別CSVでエクスポートしました。`
    );
    setWatchlistTransferMenuLayer('root');
    setWatchlistImportMenuOpen(false);
  };

  const handleImportWatchlistCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.currentTarget.files;
    const files: File[] = selectedFiles ? Array.from(selectedFiles) : [];
    event.currentTarget.value = '';
    if (files.length === 0) return;

    const importMode = watchlistImportModeRef.current;
    setWatchlistImporting(true);
    setWatchlistImportMessage(null);
    setTickerSearchError(null);

    try {
      const tickerBySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));
      const allNewTickers: TickerInfo[] = [];
      const allNewQuotes: Record<string, MoomooTickerQuote> = {};
      const allImportedNameOverrides: Record<string, string> = {};
      const importedFileResults: Array<{ symbols: string[] }> = [];
      let totalInvalidOrDuplicateCount = 0;
      let totalUnverifiedQuoteCount = 0;
      let filesWithoutCodeColumn = 0;
      let filesWithoutValidSymbols = 0;

      const fetchImportQuote = async (symbol: string) => {
        try {
          const { response, data } = await fetchJsonWithTimeout('/api/moomoo/quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol }),
          }, 12_000);
          const price = Number(data.price);
          if (!response.ok || !data.success || !Number.isFinite(price) || price <= 0) {
            return null;
          }

          const storedSymbol = normalizeTickerSymbolForStorage(String(data.symbol || symbol));
          const changePct = Number(data.changePct || 0);
          const quote: MoomooTickerQuote = {
            name: String(data.name || storedSymbol),
            price,
            changePct: Number.isFinite(changePct) ? changePct : 0,
            marketCap: Number.isFinite(Number(data.marketCap)) && Number(data.marketCap) > 0
              ? Number(data.marketCap)
              : undefined,
          };
          return { symbol: storedSymbol, quote };
        } catch {
          return null;
        }
      };

      const createUnverifiedImportResult = (candidate: WatchlistCsvCandidate & { symbol: string }) => {
        const importedTicker: TickerInfo = {
          symbol: candidate.symbol,
          name: candidate.name || candidate.symbol,
          basePrice: 0,
          dailyChangePct: 0,
        };
        return {
          kind: 'success' as const,
          ticker: importedTicker,
          basket: candidate.basket,
          quotes: {} satisfies Record<string, MoomooTickerQuote>,
          quoteVerified: false,
        };
      };

      const resolveImportCandidate = async (candidate: WatchlistCsvCandidate & { symbol: string }) => {
        try {
          const expression = normalizeSymbolExpressionForStorage(candidate.symbol);
          if (expression) {
            const [leftQuoteResult, rightQuoteResult] = await Promise.all([
              fetchImportQuote(expression.left),
              fetchImportQuote(expression.right),
            ]);
            if (!leftQuoteResult || !rightQuoteResult) {
              return createUnverifiedImportResult(candidate);
            }

            const storedExpression: SymbolExpression = {
              left: leftQuoteResult.symbol,
              operator: expression.operator,
              right: rightQuoteResult.symbol,
            };
            const calculatedQuote = calculateExpressionQuote(
              storedExpression,
              leftQuoteResult.quote,
              rightQuoteResult.quote,
            );
            if (!calculatedQuote) {
              return createUnverifiedImportResult(candidate);
            }

            const storedSymbol = formatSymbolExpression(storedExpression);
            const importedTicker: TickerInfo = {
              symbol: storedSymbol,
              name: candidate.name || `${leftQuoteResult.quote.name} ${storedExpression.operator} ${rightQuoteResult.quote.name}`,
              basePrice: calculatedQuote.price,
              dailyChangePct: calculatedQuote.changePct ?? 0,
            };

            return {
              kind: 'success' as const,
              ticker: importedTicker,
              basket: candidate.basket,
              quotes: {
                [leftQuoteResult.symbol]: leftQuoteResult.quote,
                [rightQuoteResult.symbol]: rightQuoteResult.quote,
              } satisfies Record<string, MoomooTickerQuote>,
              quoteVerified: true,
            };
          }

          const quoteResult = await fetchImportQuote(candidate.symbol);
          if (!quoteResult) {
            return createUnverifiedImportResult(candidate);
          }

          const importedTicker: TickerInfo = {
            symbol: quoteResult.symbol,
            name: candidate.name || quoteResult.quote.name || candidate.symbol,
            basePrice: quoteResult.quote.price,
            dailyChangePct: quoteResult.quote.changePct,
          };

          return {
            kind: 'success' as const,
            ticker: importedTicker,
            basket: candidate.basket,
            quotes: {
              [quoteResult.symbol]: quoteResult.quote,
            } satisfies Record<string, MoomooTickerQuote>,
            quoteVerified: true,
          };
        } catch (error) {
          return createUnverifiedImportResult(candidate);
        }
      };

      for (const file of files) {
        const text = await readWatchlistImportText(file);
        const candidates = extractWatchlistCsvCandidates(text);
        if (candidates.length === 0) {
          filesWithoutCodeColumn += 1;
          continue;
        }

        const queuedSymbols = new Set<string>();
        const normalizedCandidates: Array<WatchlistCsvCandidate & { symbol: string }> = [];
        let invalidOrDuplicateCount = 0;
        let unverifiedQuoteCount = 0;

        candidates.forEach((candidate) => {
          const symbol = normalizeImportedSymbol(candidate.code);
          if (!symbol || queuedSymbols.has(symbol)) {
            invalidOrDuplicateCount += 1;
            return;
          }
          queuedSymbols.add(symbol);
          normalizedCandidates.push({
            ...candidate,
            symbol,
            name: candidate.name || symbol,
          });
        });

        totalInvalidOrDuplicateCount += invalidOrDuplicateCount;
        if (normalizedCandidates.length === 0) {
          filesWithoutValidSymbols += 1;
          continue;
        }

        const importedSymbols: string[] = [];
        const importedBaskets: Array<{ symbol: string; basket?: string }> = [];
        const quoteResults = await mapWithConcurrency(
          normalizedCandidates,
          WATCHLIST_IMPORT_CONCURRENCY,
          resolveImportCandidate,
        );

        quoteResults.forEach((result) => {
          if (!result.quoteVerified) {
            unverifiedQuoteCount += 1;
          }
          if (!tickerBySymbol.has(result.ticker.symbol)) {
            tickerBySymbol.set(result.ticker.symbol, result.ticker);
            allNewTickers.push(result.ticker);
          }
          Object.assign(allNewQuotes, result.quotes);
          const displayName = result.ticker.name.trim();
          if (displayName && displayName !== result.ticker.symbol) {
            allImportedNameOverrides[result.ticker.symbol] = displayName;
          }
          importedSymbols.push(result.ticker.symbol);
          importedBaskets.push({ symbol: result.ticker.symbol, basket: result.basket });
        });

        totalUnverifiedQuoteCount += unverifiedQuoteCount;

        const finalImportedSymbols = Array.from(new Set(importedSymbols));
        if (finalImportedSymbols.length === 0) {
          continue;
        }

        if (importMode === 'new-tab') {
          addSymbolsToNewWatchlistTab(finalImportedSymbols, file.name, importedBaskets);
        } else {
          addSymbolsToActiveWatchlist(finalImportedSymbols, importedBaskets);
        }

        importedFileResults.push({
          symbols: finalImportedSymbols,
        });
      }

      if (importedFileResults.length === 0) {
        const skippedMessage = `${totalInvalidOrDuplicateCount > 0 ? `${totalInvalidOrDuplicateCount}件は無効または重複のためスキップしました。` : ''}${filesWithoutCodeColumn > 0 ? `${filesWithoutCodeColumn}ファイルはコード列を読み取れませんでした。` : ''}${filesWithoutValidSymbols > 0 ? `${filesWithoutValidSymbols}ファイルは有効な銘柄を読み取れませんでした。` : ''}`;
        setWatchlistImportMessage(`インポートできる銘柄がありませんでした。${skippedMessage}`);
        return;
      }

      if (allNewTickers.length > 0) {
        setTickers((currentTickers) => {
          const currentSymbols = new Set(currentTickers.map((ticker) => ticker.symbol));
          return [
            ...currentTickers,
            ...allNewTickers.filter((ticker) => !currentSymbols.has(ticker.symbol)),
          ];
        });
        setQuoteCache((currentQuotes) => ({
          ...currentQuotes,
          ...allNewQuotes,
        }));
        setIndicatorDatabase((currentDatabase) => {
          const nextDatabase = { ...currentDatabase };
          allNewTickers.forEach((ticker) => {
            nextDatabase[ticker.symbol] = nextDatabase[ticker.symbol]
              || createDefaultIndicatorSettings(ticker.symbol);
          });
          return nextDatabase;
        });
      } else if (Object.keys(allNewQuotes).length > 0) {
        setQuoteCache((currentQuotes) => ({
          ...currentQuotes,
          ...allNewQuotes,
        }));
      }
      if (Object.keys(allImportedNameOverrides).length > 0) {
        setWatchlistNameOverrides((current) => ({
          ...current,
          ...allImportedNameOverrides,
        }));
      }

      const lastImportedSymbols = importedFileResults.at(-1)?.symbols || [];
      setSelectedSymbols(lastImportedSymbols);
      setLastClickedSymbol(lastImportedSymbols.at(-1) ?? null);
      const totalImportedCount = importedFileResults.reduce((sum, result) => sum + result.symbols.length, 0);
      const destinationLabel = importMode === 'new-tab'
        ? `${importedFileResults.length}個の新規タブ`
        : 'アクティブなウォッチリスト';
      const skippedMessage = `${totalUnverifiedQuoteCount > 0 ? `${totalUnverifiedQuoteCount}件は価格未確認のまま銘柄のみ登録しました。` : ''}${totalInvalidOrDuplicateCount > 0 ? `${totalInvalidOrDuplicateCount}件は無効または重複のためスキップしました。` : ''}${filesWithoutCodeColumn > 0 ? `${filesWithoutCodeColumn}ファイルはコード列を読み取れませんでした。` : ''}${filesWithoutValidSymbols > 0 ? `${filesWithoutValidSymbols}ファイルは有効な銘柄を読み取れませんでした。` : ''}`;
      setWatchlistImportMessage(
        `${totalImportedCount}件を${destinationLabel}へインポートしました。${skippedMessage}`
      );
    } catch (error) {
      setWatchlistImportMessage(
        error instanceof Error ? error.message : 'CSVのインポートに失敗しました。'
      );
    } finally {
      watchlistImportModeRef.current = 'new-tab';
      setWatchlistImportMode('new-tab');
      setWatchlistImporting(false);
    }
  };

  // Switch a panel engine style
  const togglePanelEngine = (panelId: string) => {
    setPanelEngineToggle(prev => ({
      ...prev,
      [panelId]: !prev[panelId]
    }));
  };

  // グリッドレイアウトを選択し、パネル数を調整する
  const handleSelectCustomGrid = (rows: number, cols: number) => {
    const maxPanels = rows * cols;
    setGridRows(rows);
    setGridCols(cols);
    setLayoutStyle('grid');
    setPanels((prev) => prev.slice(0, maxPanels));
    setGridPickerOpen(false);
  };

  // Create a new chart segment panel (plus indicator button)
  const handleAddChartPanel = () => {
    if (panels.length >= 6) {
      alert("表示できるチャートパネルは最大6つまでです。");
      return;
    }
    
    const activeTab = watchlistTabs.find((tab) => tab.id === activeWatchlistTabId) ?? watchlistTabs[0];
    const activeTabSymbols = getWatchlistTabSymbols(activeTab);
    const currentSymbols = panels.map(p => p.symbol);
    const fallbackTicker = tickers.find(t => !currentSymbols.includes(t.symbol)) || tickers[0];
    const fallbackSymbol = activeTabSymbols[0] || fallbackTicker?.symbol || 'VOO';
    const fallbackIsExpression = Boolean(parseSymbolExpression(fallbackSymbol));
    
    const newId = `panel-${Date.now()}`;
    const basePanel: ChartPanel = {
      id: newId,
      symbol: fallbackSymbol,
      watchlistTabId: activeTab?.id,
      timeframe: DAY_RANGE_OVERVIEW_TIMEFRAME,
      displayRange: DEFAULT_DISPLAY_RANGE,
      zoomFactor: DAY_RANGE_ZOOM_FACTOR,
      scrollOffsetPct: 100,
      showRsi: !fallbackIsExpression,
      showMacd: false,
      showVolume: !fallbackIsExpression,
      comparisonLabelRankSpacingScale: 1,
      priceScale: 1,
      priceOffsetPct: 0,
      rsiHeightPct: 25,
      macdHeightPct: 25,
    };
    const newPanel = activeTab
      ? syncPanelToWatchlistTab(basePanel, activeTab.id, activeTabSymbols)
      : basePanel;

    setPanels(prev => [...prev, newPanel]);
    if (isMobileViewport) {
      setMobileActivePanelIndex(panels.length);
    }
    setPanelEngineToggle(prev => ({ ...prev, [newId]: false }));
  };

  const handleCreateEmptyChartPanel = (comparisonOnly = false, panelName?: string) => {
    if (panels.length >= 6) {
      alert("表示できるチャートパネルは最大6つまでです。");
      return;
    }

    const newId = comparisonOnly ? `panel-comparison-${Date.now()}` : `panel-empty-${Date.now()}`;
    const emptyPanel: ChartPanel = {
      id: newId,
      name: panelName?.trim() || undefined,
      symbol: '',
      timeframe: DAY_RANGE_OVERVIEW_TIMEFRAME,
      displayRange: DEFAULT_DISPLAY_RANGE,
      zoomFactor: DAY_RANGE_ZOOM_FACTOR,
      scrollOffsetPct: 100,
      showRsi: false,
      showMacd: false,
      showVolume: !comparisonOnly,
      comparisonSymbols: [],
      comparisonOnly: comparisonOnly || undefined,
      comparisonLabelRankSpacingScale: 1,
      priceScale: 1,
      priceOffsetPct: 0,
      rsiHeightPct: 25,
      macdHeightPct: 25,
    };

    setPanels((currentPanels) => [...currentPanels, emptyPanel]);
    if (isMobileViewport) {
      setMobileActivePanelIndex(panels.length);
    }
    setPanelEngineToggle((current) => ({ ...current, [newId]: false }));
    setWatchlistTargetMenu(null);
  };

  const getDefaultChartName = (comparisonOnly = false) => (
    comparisonOnly ? '指数比較チャート' : '空チャート'
  );

  const openChartNameEditor = (panel: ChartPanel) => {
    setWatchlistTargetMenu(null);
    setChartNameEditModal({
      mode: 'rename',
      panelId: panel.id,
      draftName: panel.name || getAutoWatchlistTargetLabelForPanel(panel),
      defaultName: getAutoWatchlistTargetLabelForPanel(panel),
    });
  };

  const openCreateComparisonChartNameEditor = () => {
    setWatchlistTargetMenu(null);
    setChartNameEditModal({
      mode: 'create-comparison',
      draftName: getDefaultChartName(true),
      defaultName: getDefaultChartName(true),
    });
  };

  const saveChartNameEditModal = () => {
    if (!chartNameEditModal) return;
    const nextName = (chartNameEditModal.draftName.trim() || chartNameEditModal.defaultName).slice(0, 48);
    if (chartNameEditModal.mode === 'create-comparison') {
      handleCreateEmptyChartPanel(true, nextName);
    } else if (chartNameEditModal.panelId) {
      handleUpdatePanel(chartNameEditModal.panelId, { name: nextName });
    }
    setChartNameEditModal(null);
  };

  const resetChartName = () => {
    if (!chartNameEditModal?.panelId) return;
    handleUpdatePanel(chartNameEditModal.panelId, { name: undefined });
    setChartNameEditModal(null);
  };

  // Remove a specific chart segment panel (minus indicator button)
  const handleRemoveChartPanel = (idToRemove: string) => {
    if (panels.length <= 1) {
      alert("少なくとも1つのチャートを表示する必要があります。");
      return;
    }
    setPanels(prev => prev.filter(p => p.id !== idToRemove));
  };

  // Modify individual chart properties
  const handleUpdatePanel = (id: string, updates: Partial<ChartPanel>) => {
    setPanels(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const handlePanelOrderDragStart = (event: React.DragEvent, panelId: string) => {
    if (layoutStyle !== 'grid') return;
    draggedPanelIdRef.current = panelId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-mooview-panel', panelId);
  };

  const handlePanelOrderDragOver = (event: React.DragEvent, targetPanelId: string) => {
    const draggedPanelId = draggedPanelIdRef.current
      || event.dataTransfer.getData('application/x-mooview-panel');
    if (layoutStyle !== 'grid' || !draggedPanelId || draggedPanelId === targetPanelId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handlePanelOrderDrop = (event: React.DragEvent, targetPanelId: string) => {
    const draggedPanelId = draggedPanelIdRef.current
      || event.dataTransfer.getData('application/x-mooview-panel');
    if (layoutStyle !== 'grid' || !draggedPanelId || draggedPanelId === targetPanelId) return false;
    event.preventDefault();
    event.stopPropagation();
    setPanels((currentPanels) => {
      const fromIndex = currentPanels.findIndex((panel) => panel.id === draggedPanelId);
      const toIndex = currentPanels.findIndex((panel) => panel.id === targetPanelId);
      if (fromIndex === -1 || toIndex === -1) return currentPanels;
      const nextPanels = [...currentPanels];
      const [movedPanel] = nextPanels.splice(fromIndex, 1);
      nextPanels.splice(toIndex, 0, movedPanel);
      return nextPanels;
    });
    draggedPanelIdRef.current = null;
    return true;
  };

  const handlePanelOrderDragEnd = () => {
    draggedPanelIdRef.current = null;
  };

  const handleUpdatePanelTimeframe = (id: string, timeframe: Timeframe) => {
    setPanels((currentPanels) =>
      currentPanels.map((panel) => {
        if (panel.id !== id || panel.displayRange) return panel;
        const updates: Partial<ChartPanel> = {
          timeframe,
          scrollOffsetPct: 100,
        };
        if (timeframe === '1d' || timeframe === '1w' || timeframe === '1mo') {
          updates.displayRange = null;
        }
        return { ...panel, ...updates };
      })
    );
  };

  const handleApplyPanelDisplayRange = (id: string, displayRange: Exclude<ChartDisplayRange, null>) => {
    forceCandleRefreshRef.current = true;
    setPanels((currentPanels) =>
      currentPanels.map((panel) => {
        if (panel.id !== id) return panel;
        return {
          ...panel,
          displayRange,
          timeframe: displayRange === 'd' ? DAY_RANGE_OVERVIEW_TIMEFRAME : WEEK_RANGE_OVERVIEW_TIMEFRAME,
          zoomFactor: getDisplayRangeZoomFactor(displayRange),
          scrollOffsetPct: 100,
        };
      })
    );
    setDisplayRangeMenu(null);
  };

  const handleClearPanelDisplayRange = (id: string) => {
    setPanels((currentPanels) =>
      currentPanels.map((panel) =>
        panel.id === id
          ? { ...panel, displayRange: null, scrollOffsetPct: 100 }
          : panel
      )
    );
    setDisplayRangeMenu(null);
  };

  const handleSelectWatchlistTargetForPanel = (panelId: string, targetValue: string) => {
    const target = decodeWatchlistTargetValue(targetValue);
    if (!target) return;
    const tab = watchlistTabs.find((item) => item.id === target.tabId);
    if (!tab) return;
    const symbols = target.sectionId
      ? getWatchlistSectionSymbols(tab, target.sectionId)
      : getWatchlistTabSymbols(tab);
    forceCandleRefreshRef.current = true;
    setPanels((currentPanels) =>
      currentPanels.map((panel) =>
        panel.id === panelId
          ? syncPanelToWatchlistTarget(panel, target, symbols)
          : panel
      )
    );
    setWatchlistTargetMenu(null);
  };

  const getAutoWatchlistTargetLabelForPanel = (panel: ChartPanel): string => {
    if (panel.comparisonOnly && !panel.watchlistTabId) return '指数比較チャート';
    if (!normalizeStoredSymbolValue(panel.symbol) && !panel.watchlistTabId) return '空チャート';
    const tab = watchlistTabs.find((item) => item.id === panel.watchlistTabId);
    if (!tab) return 'Sector / Basket';
    if (!panel.watchlistSectionId) return tab.name;
    const section = tab.sections.find((item) => item.id === panel.watchlistSectionId);
    return section ? `${tab.name} / ${section.name}` : tab.name;
  };

  const getWatchlistTargetLabelForPanel = (panel: ChartPanel): string => {
    return panel.name?.trim() || getAutoWatchlistTargetLabelForPanel(panel);
  };

  // Write custom indicator updates specifically for matching target symbol
  const handleUpdateIndicators = (updatedSettings: SymbolIndicatorSettings) => {
    const sym = updatedSettings.symbol.toUpperCase();
    setIndicatorDatabase(prev => ({
      ...prev,
      [sym]: updatedSettings
    }));
  };

  // Reset indicator parameters to defaults for a ticker symbol
  const handleResetIndicators = (sym: string) => {
    setIndicatorDatabase(prev => ({
      ...prev,
      [sym.toUpperCase()]: createDefaultIndicatorSettings(sym)
    }));
  };

  // --- VOLATILITY METRIC CALCULATION DISPLAY ---
  // Evaluates live visual statistics of active cached charts
  const liveTickerStats = useMemo<DisplayTickerStat[]>(() => {
    return tickers.map(t => {
      const normalizedTicker = normalizeTickerInfo(t) || {
        symbol: normalizeStoredSymbolValue(t.symbol || ''),
        name: String(t.name || t.symbol || ''),
        basePrice: 0,
        dailyChangePct: 0,
      };
      const displayTicker = {
        ...normalizedTicker,
        name: watchlistNameOverrides[normalizedTicker.symbol] || normalizedTicker.name,
      };
      if (moomooRealTimeActive) {
        const expression = normalizeSymbolExpressionForStorage(normalizedTicker.symbol);
        if (expression) {
          const leftQuote = quoteCache[expression.left];
          const rightQuote = quoteCache[expression.right];
          const expressionQuote = leftQuote && rightQuote
            ? calculateExpressionQuote(expression, leftQuote, rightQuote)
            : null;
          const expressionPrice = Number(expressionQuote?.price);
          const expressionChange = Number(expressionQuote?.changePct);
          return {
            ...displayTicker,
            currentPrice: Number.isFinite(expressionPrice) ? expressionPrice : null,
            computedChange: Number.isFinite(expressionChange) ? expressionChange : null,
          };
        }
        const quote = quoteCache[normalizedTicker.symbol];
        const quotePrice = Number(quote?.price);
        const quoteChange = Number(quote?.changePct);
        return {
          ...displayTicker,
          currentPrice: Number.isFinite(quotePrice) ? quotePrice : null,
          computedChange: Number.isFinite(quoteChange) ? quoteChange : null,
          marketCap: quote?.marketCap,
        };
      }

      const cached = resolveCandlesForSymbol(normalizedTicker.symbol, '5m', candlesCache, { watchlistTabs });
      const curPrice = cached && cached.length > 0 ? Number(cached[cached.length - 1].close) : normalizedTicker.basePrice;
      const initialPrice = cached && cached.length > 0 ? Number(cached[0].close) : normalizedTicker.basePrice;
      const changePct = cached.length > 1 && initialPrice !== 0
        ? ((curPrice - initialPrice) / Math.abs(initialPrice)) * 100
        : normalizedTicker.dailyChangePct;
      return {
        ...displayTicker,
        currentPrice: Number.isFinite(curPrice) ? curPrice : null,
        computedChange: Number.isFinite(changePct) ? changePct : null,
      };
    });
  }, [tickers, candlesCache, quoteCache, moomooRealTimeActive, watchlistNameOverrides]);

  const tickerStatsBySymbol = useMemo<Map<string, DisplayTickerStat>>(() => {
    return new Map(liveTickerStats.map((ticker) => [ticker.symbol, ticker]));
  }, [liveTickerStats]);

  const resolveDisplayTickerStat = (rawSymbol: string): DisplayTickerStat | null => {
    const normalizedSymbol = normalizeStoredSymbolValue(rawSymbol);
    if (!normalizedSymbol) return null;

    const registeredTicker = tickerStatsBySymbol.get(normalizedSymbol);
    if (registeredTicker) return registeredTicker;

    const expression = normalizeSymbolExpressionForStorage(normalizedSymbol);
    if (expression) {
      const leftQuote = quoteCache[expression.left];
      const rightQuote = quoteCache[expression.right];
      const expressionQuote = leftQuote && rightQuote
        ? calculateExpressionQuote(expression, leftQuote, rightQuote)
        : null;
      const expressionPrice = Number(expressionQuote?.price);
      const expressionChange = Number(expressionQuote?.changePct);
      return {
        symbol: normalizedSymbol,
        name: watchlistNameOverrides[normalizedSymbol]
          || `${leftQuote?.name || formatWatchlistSymbol(expression.left)} ${expression.operator} ${rightQuote?.name || formatWatchlistSymbol(expression.right)}`,
        basePrice: Number.isFinite(expressionPrice) ? expressionPrice : 0,
        dailyChangePct: Number.isFinite(expressionChange) ? expressionChange : 0,
        currentPrice: Number.isFinite(expressionPrice) ? expressionPrice : null,
        computedChange: Number.isFinite(expressionChange) ? expressionChange : null,
      };
    }

    const quote = quoteCache[normalizedSymbol];
    const quotePrice = Number(quote?.price);
    const quoteChange = Number(quote?.changePct);
    if (Number.isFinite(quotePrice) && quotePrice > 0) {
      return {
        symbol: normalizedSymbol,
        name: watchlistNameOverrides[normalizedSymbol] || quote?.name || formatWatchlistSymbol(normalizedSymbol),
        basePrice: quotePrice,
        dailyChangePct: Number.isFinite(quoteChange) ? quoteChange : 0,
        currentPrice: quotePrice,
        computedChange: Number.isFinite(quoteChange) ? quoteChange : null,
        marketCap: quote?.marketCap,
      };
    }

    return null;
  };

  const getDefaultWatchlistName = (symbol: string): string => {
    const normalizedSymbol = normalizeStoredSymbolValue(symbol);
    return tickers.find((ticker) => ticker.symbol === normalizedSymbol)?.name
      || quoteCache[normalizedSymbol]?.name
      || formatWatchlistSymbol(normalizedSymbol);
  };

  const getWatchlistDisplayName = (symbol: string): string => {
    if (symbol.startsWith('BASKET:')) {
      const sectionId = symbol.slice(7);
      const section = watchlistTabs.flatMap(t => t.sections).find(s => s.id === sectionId);
      return section ? section.name : 'バスケット';
    }
    const normalizedSymbol = normalizeStoredSymbolValue(symbol);
    return watchlistNameOverrides[normalizedSymbol]
      || resolveDisplayTickerStat(normalizedSymbol)?.name
      || tickerStatsBySymbol.get(normalizedSymbol)?.name
      || getDefaultWatchlistName(normalizedSymbol);
  };

  const openWatchlistNameEditor = (symbol: string, sectionId: string) => {
    const normalizedSymbol = normalizeStoredSymbolValue(symbol);
    const defaultName = getDefaultWatchlistName(normalizedSymbol);
    setWatchlistNameEditModal({
      symbol: normalizedSymbol,
      sectionId,
      draftName: watchlistNameOverrides[normalizedSymbol] || defaultName,
      defaultName,
    });
    setWatchlistContextMenu(null);
  };

  const saveWatchlistDisplayName = () => {
    if (!watchlistNameEditModal) return;
    const symbol = normalizeStoredSymbolValue(watchlistNameEditModal.symbol);
    const nextName = watchlistNameEditModal.draftName.trim();
    setWatchlistNameOverrides((current) => {
      const next = { ...current };
      if (!nextName || nextName === watchlistNameEditModal.defaultName) {
        delete next[symbol];
      } else {
        next[symbol] = nextName;
      }
      return next;
    });
    setWatchlistNameEditModal(null);
  };

  const resetWatchlistDisplayName = (symbol: string) => {
    const normalizedSymbol = normalizeStoredSymbolValue(symbol);
    setWatchlistNameOverrides((current) => {
      if (!current[normalizedSymbol]) return current;
      const next = { ...current };
      delete next[normalizedSymbol];
      return next;
    });
    setWatchlistNameEditModal(null);
    setWatchlistContextMenu(null);
  };

  const createChartSymbolDisplayNames = (symbols: string[]): Record<string, string> => {
    const names: Record<string, string> = {};
    symbols.forEach((rawSymbol) => {
      const symbol = normalizeStoredSymbolValue(rawSymbol);
      if (symbol) names[symbol] = getWatchlistDisplayName(symbol);
    });
    return names;
  };

  const getQuoteSnapshotForChartSymbol = (rawSymbol: string): { price: number; changePct: number | null } | null => {
    if (!normalizeStoredSymbolValue(rawSymbol)) return null;

    if (rawSymbol.startsWith('BASKET:')) {
      const sectionId = rawSymbol.slice(7);
      const section = watchlistTabs.flatMap(t => t.sections).find(s => s.id === sectionId);
      if (!section || !section.symbols || section.symbols.length === 0) return null;

      const candidates: Array<{ marketCapWeight: number | null; price: number; changePct: number }> = [];
      for (const sym of section.symbols) {
        const baseSym = parseSymbolExpression(sym)?.left || sym;
        const normalizedBase = normalizeStoredSymbolValue(baseSym);
        const ticker = tickerStatsBySymbol.get(normalizedBase);
        const snapshot = getQuoteSnapshotForChartSymbol(sym); // recursively get quote for component
        if (snapshot && Number.isFinite(snapshot.price) && snapshot.price > 0) {
          candidates.push({
            marketCapWeight: getPositiveBasketWeight(ticker?.marketCap),
            price: snapshot.price,
            changePct: snapshot.changePct ?? 0,
          });
        }
      }
      const components: BasketQuoteInput[] = assignBasketWeights(candidates)
        .map(({ weight, price, changePct }) => ({ weight, price, changePct }));
      return calculateBasketQuote(components);
    }

    const expression = normalizeSymbolExpressionForStorage(rawSymbol);
    if (expression) {
      const leftQuote = quoteCache[expression.left];
      const rightQuote = quoteCache[expression.right];
      return leftQuote && rightQuote
        ? calculateExpressionQuote(expression, leftQuote, rightQuote)
        : null;
    }

    const symbol = normalizeStoredSymbolValue(rawSymbol);
    const quote = quoteCache[symbol];
    const quotePrice = Number(quote?.price);
    const quoteChangePct = Number(quote?.changePct);
    if (Number.isFinite(quotePrice) && quotePrice > 0) {
      return {
        price: quotePrice,
        changePct: Number.isFinite(quoteChangePct) ? quoteChangePct : null,
      };
    }

    if (isDiscordAutomationPage && discordAutomationUnavailableQuoteOperands.includes(symbol)) {
      return null;
    }

    const ticker = tickerStatsBySymbol.get(symbol);
    const tickerPrice = Number(ticker?.currentPrice);
    const tickerChangePct = Number(ticker?.computedChange);
    if (Number.isFinite(tickerPrice) && tickerPrice > 0) {
      return {
        price: tickerPrice,
        changePct: Number.isFinite(tickerChangePct) ? tickerChangePct : null,
      };
    }

    return null;
  };

  const createChartChangePctOverrides = (
    symbols: string[],
    displayRange?: ChartDisplayRange,
  ): Record<string, number> => {
    if (displayRange !== 'd') return {};

    const overrides: Record<string, number> = {};
    symbols.forEach((rawSymbol) => {
      const snapshot = getQuoteSnapshotForChartSymbol(rawSymbol);
      const changePct = Number(snapshot?.changePct);
      if (!Number.isFinite(changePct)) return;

      const normalizedSymbol = normalizeStoredSymbolValue(rawSymbol);
      if (rawSymbol) overrides[rawSymbol] = changePct;
      if (normalizedSymbol) overrides[normalizedSymbol] = changePct;
    });
    return overrides;
  };

  const createQuoteFallbackCandlesForSymbol = (rawSymbol: string): Candle[] => {
    const snapshot = getQuoteSnapshotForChartSymbol(rawSymbol);
    if (!snapshot || !Number.isFinite(snapshot.price) || snapshot.price <= 0) return [];

    const changePct = Number(snapshot.changePct);
    const previousClose = Number.isFinite(changePct) && Math.abs(1 + changePct / 100) > 0.000001
      ? snapshot.price / (1 + changePct / 100)
      : snapshot.price;
    const high = Math.max(snapshot.price, previousClose);
    const low = Math.min(snapshot.price, previousClose);
    const now = new Date();
    const dateString = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    const session = isJapanMarketSymbol(rawSymbol)
      ? { start: '09:00', end: '15:30' }
      : { start: '09:30', end: '16:00' };
    const toTimestamp = (clock: string) => Math.floor(new Date(`${dateString}T${clock}:00`).getTime() / 1000);
    const startTimestamp = toTimestamp(session.start);
    const endTimestamp = toTimestamp(session.end);
    const nowTimestamp = Math.floor(now.getTime() / 1000);
    const latestTimestamp = Math.max(startTimestamp + 60, Math.min(nowTimestamp, endTimestamp));
    const latestDate = new Date(latestTimestamp * 1000);
    const latestTimeStr = [
      latestDate.getFullYear(),
      String(latestDate.getMonth() + 1).padStart(2, '0'),
      String(latestDate.getDate()).padStart(2, '0'),
    ].join('-') + ` ${String(latestDate.getHours()).padStart(2, '0')}:${String(latestDate.getMinutes()).padStart(2, '0')}`;

    return [
      {
        time: startTimestamp,
        timeStr: `${dateString} ${session.start}`,
        open: previousClose,
        high,
        low,
        close: previousClose,
        volume: 0,
      },
      {
        time: latestTimestamp,
        timeStr: latestTimeStr,
        open: previousClose,
        high,
        low,
        close: snapshot.price,
        volume: 0,
      },
    ];
  };

  const resolveChartCandlesForSymbol = (
    rawSymbol: string,
    timeframe: Timeframe,
    displayRange: ChartDisplayRange | undefined,
    useDemoFallback = false,
    allowQuoteFallback = true,
  ): Candle[] => {
    const normalizedChartSymbol = normalizeStoredSymbolValue(rawSymbol);
    if (!normalizedChartSymbol) return [];

    const seedTimeframes = Array.from(new Set([
      getDisplayRangeSeedTimeframe(displayRange),
      DAY_RANGE_OVERVIEW_TIMEFRAME,
    ].filter((seedTimeframe): seedTimeframe is Timeframe => Boolean(seedTimeframe))));

    const options = { tickerStatsBySymbol, watchlistTabs };
    let chartCandles = getUsableChartCandles(
      resolveCandlesForSymbol(normalizedChartSymbol, timeframe, candlesCache, options),
      timeframe,
    );
    for (const seedTimeframe of seedTimeframes) {
      if (chartCandles.length > 0 || seedTimeframe === timeframe) continue;
      chartCandles = getUsableChartCandles(
        resolveCandlesForSymbol(normalizedChartSymbol, seedTimeframe, candlesCache, options),
        seedTimeframe,
      );
    }

    if (
      chartCandles.length === 0
      && allowQuoteFallback
      && !isIntradayTimeframe(timeframe)
      && canUseQuoteFallbackCandles(normalizedChartSymbol)
    ) {
      chartCandles = createQuoteFallbackCandlesForSymbol(normalizedChartSymbol);
    }

    if (chartCandles.length === 0 && useDemoFallback) {
      chartCandles = generateCandles(normalizedChartSymbol, timeframe, 220);
    }

    return filterCandlesForDisplayRange(chartCandles, displayRange, normalizedChartSymbol);
  };

  useEffect(() => {
    if (!moomooRealTimeActive) return;
    // Discord自動通知は選択パネルだけを一度の取得世代で完走させる。
    // 通常画面用の全パネル不足データ補完が並行すると、tickTriggerが更新されて
    // 比較式・バスケットのKLine取得が途中でキャンセルされてしまう。
    if (isDiscordAutomationPage) return;

    const missingRequests: string[] = [];
    const missingSymbols = new Set<string>();
    panels.forEach((panel) => {
      const chartSymbols = Array.from(new Set([
        ...(panel.comparisonOnly ? [] : [panel.symbol]),
        ...(panel.comparisonSymbols || []),
      ].map((symbol) => normalizeStoredSymbolValue(symbol)).filter(Boolean)));
      chartSymbols.forEach((symbol) => {
        const candles = resolveChartCandlesForSymbol(symbol, panel.timeframe, panel.displayRange, false, false);
        if (candles.length > 0) return;
        missingSymbols.add(symbol);
        missingRequests.push(`${symbol}-${panel.timeframe}-${panel.displayRange || 'normal'}`);
      });
    });

    valueChainChartSymbols.forEach((symbol) => {
      const normalizedSymbol = normalizeStoredSymbolValue(symbol);
      if (!normalizedSymbol) return;
      const candles = resolveChartCandlesForSymbol(
        normalizedSymbol,
        valueChainChartState.timeframe,
        valueChainChartState.displayRange,
        false,
        false,
      );
      if (candles.length > 0) return;
      missingSymbols.add(normalizedSymbol);
      missingRequests.push(`${normalizedSymbol}-${valueChainChartState.timeframe}-${valueChainChartState.displayRange || 'normal'}`);
    });

    if (missingRequests.length === 0) return;

    const signature = Array.from(new Set(missingRequests)).sort().join('|');
    const now = Date.now();
    if (
      chartMissingDataRefreshRef.current.signature === signature
      && now - chartMissingDataRefreshRef.current.requestedAt < KLINE_RATE_LIMIT_RETRY_MS
    ) {
      return;
    }

    chartMissingDataRefreshRef.current = { signature, requestedAt: now };
    queuePriorityQuoteRefreshForChartSymbols(Array.from(missingSymbols));
    requestChartDropDataRefresh();
  }, [
    panels,
    valueChainChartSymbols,
    valueChainChartState.timeframe,
    valueChainChartState.displayRange,
    candlesCache,
    quoteCache,
    moomooRealTimeActive,
    isDiscordAutomationPage,
    watchlistTabs,
    activeWatchlistTabId,
  ]);

  const headerTickerStats = useMemo(() => (
    headerTickerSymbols
      .map((symbol) => tickerStatsBySymbol.get(symbol))
      .filter((ticker): ticker is TickerInfo & { currentPrice: number | null; computedChange: number | null } => Boolean(ticker))
  ), [headerTickerSymbols, tickerStatsBySymbol]);

  const headerTickerAddOptions = useMemo(() => {
    const shownSymbols = new Set(headerTickerSymbols);
    return tickers.filter((ticker) => !shownSymbols.has(ticker.symbol));
  }, [headerTickerSymbols, tickers]);

  useEffect(() => {
    const viewport = headerTickerViewportRef.current;
    const track = headerTickerTrackRef.current;
    if (!viewport || !track) return;

    const measure = () => {
      const contentWidth = headerTickerOverflow ? track.scrollWidth / 2 : track.scrollWidth;
      setHeaderTickerOverflow(contentWidth > viewport.clientWidth + 2);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(track);
    return () => observer.disconnect();
  }, [headerTickerOverflow, headerTickerStats.length, headerTickerSymbols.join('|')]);

  useEffect(() => {
    if (!moomooRealTimeActive) {
      previousHeaderTickerValuesRef.current = {};
      setHeaderTickerFlash({});
      return;
    }

    const nextFlash: Record<string, 'up' | 'down'> = {};
    const nextValues: Record<string, number | null> = {};
    headerTickerStats.forEach((ticker) => {
      nextValues[ticker.symbol] = ticker.currentPrice;
      const previousPrice = previousHeaderTickerValuesRef.current[ticker.symbol];
      if (
        previousPrice !== undefined
        && previousPrice !== null
        && ticker.currentPrice !== null
        && ticker.currentPrice !== previousPrice
      ) {
        nextFlash[ticker.symbol] = ticker.currentPrice > previousPrice ? 'up' : 'down';
      }
    });
    previousHeaderTickerValuesRef.current = nextValues;

    if (Object.keys(nextFlash).length === 0) return;
    setHeaderTickerFlash((current) => ({ ...current, ...nextFlash }));
    if (headerTickerFlashTimeoutRef.current !== null) {
      window.clearTimeout(headerTickerFlashTimeoutRef.current);
    }
    headerTickerFlashTimeoutRef.current = window.setTimeout(() => {
      setHeaderTickerFlash({});
      headerTickerFlashTimeoutRef.current = null;
    }, 900);
  }, [headerTickerStats, moomooRealTimeActive]);

  const activeWatchlistTab = useMemo(() => {
    return watchlistTabs.find((tab) => tab.id === activeWatchlistTabId) ?? watchlistTabs[0];
  }, [activeWatchlistTabId, watchlistTabs]);
  const watchlistTabSymbolsById = useMemo(() => {
    const next = new Map<string, string[]>();
    watchlistTabs.forEach((tab) => {
      next.set(tab.id, getWatchlistTabSymbols(tab));
    });
    return next;
  }, [watchlistTabs]);
  const activeWatchlistQuoteProgress = useMemo(() => {
    const progressWatchlistTab = quoteFetchInFlight && quoteFetchTarget
      ? watchlistTabs.find((tab) => tab.id === quoteFetchTarget.tabId) ?? activeWatchlistTab
      : activeWatchlistTab;
    const isQuoteResolved = (symbol: string) => {
      const ticker = resolveDisplayTickerStat(symbol);
      const quote = quoteCache[symbol];
      const currentPrice = Number(ticker?.currentPrice ?? quote?.price);
      const computedChange = Number(ticker?.computedChange ?? quote?.changePct);
      return Number.isFinite(currentPrice)
        && currentPrice > 0
        && Number.isFinite(computedChange);
    };
    const isQuoteFailed = (symbol: string) => Boolean(quoteFetchFailures[symbol]);
    const tabName = progressWatchlistTab?.name ?? 'ウォッチリスト';
    const sectionProgresses = (progressWatchlistTab?.sections ?? []).map((section) => {
      const symbols = getQuoteOperandSymbolsForWatchlistSymbols(section.symbols);
      const total = symbols.length;
      const fetched = symbols.filter(isQuoteResolved).length;
      const failed = symbols.filter((symbol) => !isQuoteResolved(symbol) && isQuoteFailed(symbol)).length;
      return {
        id: section.id,
        name: section.name,
        symbols,
        total,
        fetched,
        failed,
        remaining: Math.max(0, total - fetched - failed),
      };
    });
    const tabSymbols = Array.from(new Set<string>(sectionProgresses.flatMap((section) => section.symbols)));
    const total = tabSymbols.length;
    const fetched = tabSymbols.filter(isQuoteResolved).length;
    const failed = tabSymbols.filter((symbol) => !isQuoteResolved(symbol) && isQuoteFailed(symbol)).length;
    const remaining = Math.max(0, total - fetched - failed);
    const currentSection = sectionProgresses.find((section) => section.remaining > 0)
      ?? sectionProgresses.find((section) => section.failed > 0)
      ?? sectionProgresses[0]
      ?? null;
    const scopeTotal = currentSection?.total ?? total;
    const scopeFetched = currentSection?.fetched ?? fetched;
    const scopeFailed = currentSection?.failed ?? failed;
    const scopeRemaining = currentSection?.remaining ?? remaining;
    const status = total === 0
      ? 'idle'
      : quoteFetchInFlight
        ? 'loading'
        : remaining === 0
          ? failed > 0 ? 'error' : 'done'
          : failed > 0 ? 'partial' : 'stale';
    const scopePhase = scopeTotal === 0
      ? '1D対象'
      : quoteFetchInFlight
        ? '1D取得中'
        : scopeRemaining === 0
          ? '1D完了'
          : '1D未取得';
    const tabPhase = total === 0
      ? '1D対象'
      : quoteFetchInFlight
        ? '1D取得中'
        : remaining === 0
          ? '1D完了'
          : '1D未取得';
    const scopeLabel = currentSection ? `${tabName} / ${currentSection.name}` : tabName;
    const displayScopePhase = scopeTotal === 0
      ? '1D対象'
      : quoteFetchInFlight
        ? '1D取得中'
        : scopeRemaining === 0
          ? scopeFailed > 0 ? '1D失敗' : '1D完了'
          : scopeFailed > 0 ? '1D一部失敗' : '1D未取得';
    const displayTabPhase = total === 0
      ? '1D対象'
      : quoteFetchInFlight
        ? '1D取得中'
        : remaining === 0
          ? failed > 0 ? '1D失敗' : '1D完了'
          : failed > 0 ? '1D一部失敗' : '1D未取得';
    const scopeFailedText = scopeFailed > 0 ? ` 失敗${scopeFailed}` : '';
    const failedText = failed > 0 ? ` 失敗${failed}` : '';
    return {
      total,
      fetched,
      failed,
      remaining,
      scopeLabel,
      scopeTotal,
      scopeFetched,
      scopeFailed,
      scopeRemaining,
      status,
      text: `${displayScopePhase} ${scopeFetched}/${scopeTotal} 残${scopeRemaining}${scopeFailedText}`,
      title: `${tabName} タブ合計 ${displayTabPhase} ${fetched}/${total} 残${remaining}${failedText}${
        currentSection ? ` / 現在 ${currentSection.name} ${scopeFetched}/${scopeTotal} 残${scopeRemaining}${scopeFailedText}` : ''
      }`,
    };
  }, [activeWatchlistTab, quoteCache, quoteFetchFailures, quoteFetchInFlight, quoteFetchTarget, tickerStatsBySymbol, watchlistTabs]);
  const activeWatchlistTabIndex = watchlistTabs.findIndex((tab) => tab.id === activeWatchlistTabId);
  const canJumpToFirstWatchlistTab = watchlistTabs.length > 1 && activeWatchlistTabIndex > 0;
  const canJumpToLastWatchlistTab =
    watchlistTabs.length > 1 &&
    activeWatchlistTabIndex >= 0 &&
    activeWatchlistTabIndex < watchlistTabs.length - 1;
  const watchlistTabMenuFetchMode = watchlistTabMenu
    ? getWatchlistQuoteFetchMode(watchlistQuoteFetchModes, watchlistTabMenu.tabId)
    : 'manual';

  useEffect(() => {
    setPanels((currentPanels) => {
      let changed = false;
      const nextPanels = currentPanels.map((panel) => {
        if (!panel.watchlistTabId) return panel;

        const tab = watchlistTabs.find((item) => item.id === panel.watchlistTabId);
        if (!tab) {
          changed = true;
          return { ...panel, watchlistTabId: undefined, watchlistSectionId: undefined };
        }

        const validSectionId = panel.watchlistSectionId
          && tab.sections.some((section) => section.id === panel.watchlistSectionId)
          ? panel.watchlistSectionId
          : undefined;
        if (validSectionId === panel.watchlistSectionId) return panel;
        changed = true;
        return { ...panel, watchlistSectionId: validSectionId };
      });
      return changed ? nextPanels : currentPanels;
    });
  }, [watchlistTabs]);

  const watchlistLayout = useMemo(
    () => calculateWatchlistLayoutColumnWidths(
      watchlistColumnWidths,
      Math.max(0, sidebarWidth - WATCHLIST_GRID_HORIZONTAL_PADDING),
      showWatchlistNameColumn,
    ),
    [showWatchlistNameColumn, sidebarWidth, watchlistColumnWidths],
  );

  const watchlistGridTemplate = [
    `${watchlistLayout.widths.symbol}px`,
    `${WATCHLIST_ACTION_COLUMN_WIDTH}px`,
    watchlistLayout.showName ? `${watchlistLayout.widths.name}px` : null,
    `${watchlistLayout.widths.change}px`,
    watchlistLayout.showPrice ? `${watchlistLayout.widths.price}px` : null,
    `${WATCHLIST_ACTION_COLUMN_WIDTH}px`,
  ].filter(Boolean).join(' ');

  const visibleWatchlistSections = useMemo(() => {
    const compareRows = (
      first: TickerInfo & { currentPrice: number | null; computedChange: number | null },
      second: TickerInfo & { currentPrice: number | null; computedChange: number | null },
    ) => {
      if (!watchlistSort.column || !watchlistSort.direction) return 0;
      const direction = watchlistSort.direction === 'asc' ? 1 : -1;
      if (watchlistSort.column === 'symbol') {
        return formatWatchlistSymbol(first.symbol).localeCompare(formatWatchlistSymbol(second.symbol)) * direction;
      }
      const firstValue = watchlistSort.column === 'price' ? first.currentPrice : first.computedChange;
      const secondValue = watchlistSort.column === 'price' ? second.currentPrice : second.computedChange;
      if (firstValue === null && secondValue === null) return 0;
      if (firstValue === null) return 1;
      if (secondValue === null) return -1;
      return (firstValue - secondValue) * direction;
    };

    return (activeWatchlistTab?.sections ?? []).map((section) => {
      const rows = section.symbols
        .map((symbol) => {
          const normalizedSymbol = normalizeStoredSymbolValue(symbol);
          if (!normalizedSymbol) return null;
          return resolveDisplayTickerStat(normalizedSymbol) || {
            symbol: normalizedSymbol,
            name: watchlistNameOverrides[normalizedSymbol] || formatWatchlistSymbol(normalizedSymbol),
            basePrice: 0,
            dailyChangePct: 0,
            currentPrice: null,
            computedChange: null,
          };
        })
        .filter((ticker): ticker is TickerInfo & { currentPrice: number | null; computedChange: number | null } => Boolean(ticker));
      return {
        ...section,
        rows: watchlistSort.column ? [...rows].sort(compareRows) : rows,
      };
    });
  }, [activeWatchlistTab, quoteCache, tickerStatsBySymbol, watchlistNameOverrides, watchlistSort]);

  const getComparableSymbolsForPanel = (
    panel: ChartPanel,
    symbols: string[],
    options: { allowMissingData?: boolean } = {},
  ): string[] => {
    const currentComparisons = new Set(panel.comparisonSymbols || []);
    return Array.from(new Set(symbols)).filter((symbol) => {
      if (!symbol || symbol === panel.symbol || currentComparisons.has(symbol)) return false;
      // BASKET:xxxx シンボルは特別扱い（tickerStats不要）
      if (symbol.startsWith('BASKET:')) return true;
      if (options.allowMissingData) return true;
      const ticker = resolveDisplayTickerStat(symbol);
      const currentPrice = Number(ticker?.currentPrice);
      return !moomooRealTimeActive
        || (ticker?.currentPrice !== null && Number.isFinite(currentPrice) && currentPrice > 0);
    });
  };

  const requestChartDropDataRefresh = () => {
    forceCandleRefreshRef.current = true;
    if (candleFetchInFlightRef.current) {
      candleFetchPendingRef.current = true;
    }
    setTickTrigger((current) => current + 1);
  };

  const addComparisonSymbolsToPanel = (
    panel: ChartPanel,
    symbols: string[],
    options: { allowMissingData?: boolean } = {},
  ) => {
    const symbolsToAdd = getComparableSymbolsForPanel(panel, symbols, options);
    if (symbolsToAdd.length === 0) {
      return false;
    }
    handleUpdatePanel(panel.id, {
      comparisonSymbols: [
        ...(panel.comparisonSymbols || []),
        ...symbolsToAdd,
      ],
    });
    setActiveComparisonPopoverPanelId(null);
    return true;
  };

  const addSymbolsToPanelFromDrop = (panel: ChartPanel, symbols: string[]) => {
    const normalizedSymbols = Array.from(new Set(
      symbols.map((symbol) => normalizeStoredSymbolValue(symbol)).filter(Boolean),
    ));
    if (normalizedSymbols.length === 0) return false;

    if (panel.comparisonOnly) {
      const added = addComparisonSymbolsToPanel(panel, normalizedSymbols, { allowMissingData: true });
      if (added) {
        queuePriorityQuoteRefreshForChartSymbols(normalizedSymbols);
        requestChartDropDataRefresh();
      }
      return added;
    }

    if (!panel.symbol) {
      const [primarySymbol, ...comparisonSymbols] = normalizedSymbols;
      const primaryIsExpression = Boolean(parseSymbolExpression(primarySymbol));
      requestChartDropDataRefresh();
      handleUpdatePanel(panel.id, {
        symbol: primarySymbol,
        watchlistTabId: undefined,
        watchlistSectionId: undefined,
        comparisonSymbols: comparisonSymbols.filter((symbol) => symbol !== primarySymbol),
        showRsi: !primaryIsExpression,
        showMacd: false,
        showVolume: !primaryIsExpression,
        scrollOffsetPct: 100,
      });
      queuePriorityQuoteRefreshForChartSymbols(normalizedSymbols);
      setActiveComparisonPopoverPanelId(null);
      return true;
    }

    const added = addComparisonSymbolsToPanel(panel, normalizedSymbols, { allowMissingData: true });
    if (added) {
      queuePriorityQuoteRefreshForChartSymbols(normalizedSymbols);
      requestChartDropDataRefresh();
    }
    return added;
  };

  const getDraggedTickerSymbols = () => {
    if (draggedBasket?.symbols.length) return [`BASKET:${draggedBasket.sectionId}`];
    if (!draggedTicker) return [];
    return draggedTicker.symbols.length > 0 ? draggedTicker.symbols : [draggedTicker.symbol];
  };

  const openValueChainTickerInChart = (symbol: string) => {
    selectTickerForPrimaryChart(symbol);
    setAppView('charts');
  };

  const getCandleFetchError = (symbol: string, timeframe: Timeframe) => {
    const canonicalSymbol = normalizeStoredSymbolValue(symbol);
    return candleFetchErrors[`${canonicalSymbol}-${timeframe}`]
      || candleFetchErrors[`${symbol}-${timeframe}`]
      || null;
  };

  const getSelectedChartExportPanelIds = (selection: ChartExportSelection): string[] => {
    return resolveChartExportPanelIds(
      selection,
      panels.map((panel) => panel.id),
    );
  };

  const handleChartVideoExport = async () => {
    if (chartVideoExportAbortControllerRef.current) {
      chartVideoExportAbortControllerRef.current.abort();
      return;
    }
    if (chartExportStatus || chartAiStatus) return;
    setVideoExportMenu(null);
    setImageExportMenu(null);
    setChartAiPromptMenu(null);
    setChartExportError(null);
    const resolution = CHART_EXPORT_RESOLUTIONS.find(
      (candidate) => candidate.id === chartVideoExportSettings.resolutionId,
    ) ?? CHART_EXPORT_RESOLUTIONS[0];
    const panelIds = getSelectedChartExportPanelIds(chartVideoExportSettings.selection);
    if (panelIds.length === 0) {
      setChartExportError('ダウンロードするチャートを1つ以上選択してください。');
      return;
    }
    const abortController = new AbortController();
    chartVideoExportAbortControllerRef.current = abortController;
    setChartExportStatus({ kind: 'video', progress: 0 });
    const iosPhotoSaveEnabled = isAppleMobileDevice();
    const exportedIosVideoFiles: File[] = [];

    try {
      for (let index = 0; index < panelIds.length; index += 1) {
        const panelId = panelIds[index];
        const panelNumber = panels.findIndex((panel) => panel.id === panelId) + 1;
        const exportedVideoFile = await exportChartVideo({
          width: resolution.width,
          height: resolution.height,
          panelIds: [panelId],
          durationSeconds: chartVideoExportSettings.durationSeconds,
          frameRate: chartVideoExportSettings.frameRate,
          signal: abortController.signal,
          fileNumber: panelNumber > 0 ? panelNumber : index + 1,
          beforeFrame: async (progress) => {
            setChartExportPlayback({ panelIds: [panelId], progress });
            await new Promise<void>((resolve) => {
              window.requestAnimationFrame(() => resolve());
            });
          },
          onProgress: (progress) => {
            setChartExportStatus({
              kind: 'video',
              progress: (index + progress) / panelIds.length,
            });
          },
          ...(iosPhotoSaveEnabled ? {
            download: false,
            iosCompatible: true,
          } : {}),
        });
        if (iosPhotoSaveEnabled) {
          exportedIosVideoFiles.push(exportedVideoFile);
        }
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        setChartExportError(
          error instanceof Error ? error.message : 'MP4動画の作成に失敗しました。',
        );
      }
    } finally {
      if (iosPhotoSaveEnabled && exportedIosVideoFiles.length > 0) {
        setPendingIosVideoFiles(exportedIosVideoFiles);
      }
      if (chartVideoExportAbortControllerRef.current === abortController) {
        chartVideoExportAbortControllerRef.current = null;
      }
      setChartExportPlayback(null);
      setChartExportStatus(null);
    }
  };

  const handleShareIosVideoFiles = () => {
    const files = [...pendingIosVideoFiles];
    if (files.length === 0 || iosVideoShareInFlight) return;
    if (
      typeof navigator.share !== 'function'
      || typeof navigator.canShare !== 'function'
      || !navigator.canShare({ files })
    ) {
      setChartExportError('このiOSでは動画共有を利用できません。「ファイルへ保存」を使用してください。');
      return;
    }

    let sharePromise: Promise<void>;
    try {
      // ファイル以外を渡すとiOSで添付が外れる場合があるため、MP4だけを共有する。
      sharePromise = navigator.share({ files });
    } catch (error) {
      setChartExportError(
        error instanceof Error ? error.message : 'iOSの共有シートを開けませんでした。',
      );
      return;
    }

    setIosVideoShareInFlight(true);
    void sharePromise
      .then(() => {
        setPendingIosVideoFiles([]);
        setChartExportError(null);
      })
      .catch((error) => {
        if (!(error instanceof Error && error.name === 'AbortError')) {
          setChartExportError(
            error instanceof Error ? error.message : 'iOSの共有シートを開けませんでした。',
          );
        }
      })
      .finally(() => setIosVideoShareInFlight(false));
  };

  const handleDownloadIosVideoFiles = () => {
    pendingIosVideoFiles.forEach((file) => downloadChartVideoFile(file));
    setPendingIosVideoFiles([]);
  };

  const handleChartImageExport = async () => {
    if (chartExportStatus || chartAiStatus) return;
    setVideoExportMenu(null);
    setImageExportMenu(null);
    setChartAiPromptMenu(null);
    setChartExportError(null);
    setChartExportStatus({ kind: 'image', progress: 0.25 });

    try {
      const panelIds = getSelectedChartExportPanelIds(chartImageExportSettings.selection);
      if (panelIds.length === 0) {
        throw new Error('ダウンロードするチャートを1つ以上選択してください。');
      }
      await exportChartImage(panelIds, (progress) => {
        setChartExportStatus({ kind: 'image', progress });
      });
    } catch (error) {
      setChartExportError(
        error instanceof Error ? error.message : 'PNG画像の作成に失敗しました。',
      );
    } finally {
      setChartExportStatus(null);
    }
  };

  const handleChartAiAnalysis = async () => {
    if (chartExportStatus || chartAiStatus) return;
    setVideoExportMenu(null);
    setImageExportMenu(null);
    setChartAiPromptMenu(null);
    setChartExportError(null);
    setChartAiResult(null);
    setChartAiCopied(false);

    try {
      const prompt = chartAiPrompt.trim();
      if (!prompt) {
        throw new Error('AIプロンプトを入力してください。');
      }
      const panelIds = getSelectedChartExportPanelIds(chartImageExportSettings.selection);
      if (panelIds.length === 0) {
        throw new Error('AIで分析するチャートを1つ以上選択してください。');
      }

      setChartAiStatus({ stage: 'capturing', progress: 0 });
      const imageFiles = await exportChartImage(panelIds, (progress) => {
        setChartAiStatus({ stage: 'capturing', progress });
      });
      setChartAiStatus({ stage: 'requesting', progress: 1 });
      const result = await requestChartAiAnalysis(prompt, imageFiles, chartAiModel);
      setChartAiResult(result);
    } catch (error) {
      setChartExportError(
        error instanceof Error ? error.message : 'AIによるチャート分析に失敗しました。',
      );
    } finally {
      setChartAiStatus(null);
    }
  };

  const refreshChartsForDiscordAutomation = async (targetPanelIds: string[]) => {
    // 状態更新だけに任せると、ヘッドレス実行では対象確定前のuseEffectが空振りすることがある。
    // 画面の更新と同じ強制KLineキューへ対象銘柄を直接積み、取得開始を確認してから待機へ進む。
    const normalizedPanelIds = Array.from(new Set(targetPanelIds));
    const fetchGenerationBeforeRefresh = candleFetchGenerationRef.current;
    setDiscordAutomationTargetPanelIds(normalizedPanelIds);
    requestManualChartRefresh(getDiscordAutomationDailyQuoteOperands(normalizedPanelIds));

    const deadline = Date.now() + 15_000;
    while (
      candleFetchGenerationRef.current <= fetchGenerationBeforeRefresh
      && !candleFetchInFlightRef.current
      && Date.now() < deadline
    ) {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await sleep(50);
    }
    if (
      candleFetchGenerationRef.current <= fetchGenerationBeforeRefresh
      && !candleFetchInFlightRef.current
    ) {
      // データ元が一時的に応答しなくても、画面に残る数値ラベルを使って定時通知を続ける。
      console.warn('Discord自動通知のローソク足取得開始を確認できませんでした。120秒後に表示済み対象だけを送信します。');
    }
  };

  const getDiscordAutomationDailyQuoteOperands = (panelIds: string[]): string[] => {
    const selectedPanelIds = new Set(panelIds);
    const operands = new Set<string>();
    const visitedBasketIds = new Set<string>();

    const addQuoteOperands = (rawSymbol: string) => {
      const symbol = normalizeStoredSymbolValue(rawSymbol);
      if (!symbol) return;
      if (symbol.startsWith('BASKET:')) {
        const sectionId = symbol.slice(7);
        if (visitedBasketIds.has(sectionId)) return;
        visitedBasketIds.add(sectionId);
        const section = watchlistTabs
          .flatMap((tab) => tab.sections)
          .find((candidate) => candidate.id === sectionId);
        if (!section) {
          console.warn(`Discord自動通知では存在しないバスケット「${sectionId}」を除外します。`);
          return;
        }
        section.symbols.forEach(addQuoteOperands);
        return;
      }
      getStoredSymbolOperands(symbol).forEach((operand) => {
        const normalizedOperand = normalizeTickerSymbolForStorage(operand);
        if (normalizedOperand) operands.add(normalizedOperand);
      });
    };

    panels
      .filter((panel) => selectedPanelIds.has(panel.id) && panel.displayRange === 'd')
      .forEach((panel) => {
        if (!panel.comparisonOnly) addQuoteOperands(panel.symbol);
        (panel.comparisonSymbols || []).forEach(addQuoteOperands);
      });

    return orderMarketFetchSymbols(Array.from(operands));
  };

  const refreshDiscordAutomationDailyQuotes = async (symbols: string[]): Promise<Set<string>> => {
    if (symbols.length === 0) {
      setDiscordAutomationUnavailableQuoteOperands([]);
      return new Set<string>();
    }
    const updatedQuotes: Record<string, MoomooTickerQuote | null> = {};
    const failedQuotes: string[] = [];
    const failedQuoteOperands = new Set<string>();

    const requestQuoteBatch = async (
      quoteSymbols: string[],
      retryAllowed = true,
    ): Promise<Record<string, MoomooBatchQuoteResult>> => {
      const { response, data } = await fetchJsonWithTimeout('/api/moomoo/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: quoteSymbols }),
      }, 90_000);
      const errorMessage = data.error ? String(data.error) : response.ok ? '' : `HTTP ${response.status}`;
      if (!response.ok || !data.success || !data.quotes) {
        if (retryAllowed && (response.status === 429 || isMoomooRateLimitMessage(errorMessage))) {
          await sleep(WATCHLIST_QUOTE_RATE_LIMIT_RETRY_MS);
          return requestQuoteBatch(quoteSymbols, false);
        }
        throw new Error(errorMessage || 'Discord自動通知に必要な1D価格を取得できませんでした。');
      }
      return data.quotes as Record<string, MoomooBatchQuoteResult>;
    };

    for (const quoteBatch of chunkArray(symbols, WATCHLIST_QUOTE_BATCH_LIMIT)) {
      const batchQuotes = await requestQuoteBatch(quoteBatch);
      const returnedSymbols = new Set<string>();
      Object.entries(batchQuotes).forEach(([quoteKey, quote]) => {
        const symbol = normalizeTickerSymbolForStorage(String(quote.symbol || quoteKey || ''));
        if (!symbol) return;
        returnedSymbols.add(symbol);
        const price = Number(quote.price);
        const changePct = Number(quote.changePct);
        if (quote.success && Number.isFinite(price) && price > 0 && Number.isFinite(changePct)) {
          updatedQuotes[symbol] = {
            name: quote.name || symbol,
            price,
            changePct,
            marketCap: Number.isFinite(Number(quote.marketCap)) && Number(quote.marketCap) > 0
              ? Number(quote.marketCap)
              : undefined,
          };
          return;
        }
        updatedQuotes[symbol] = null;
        failedQuoteOperands.add(symbol);
        failedQuotes.push(`${symbol}: ${quote.error || '現在値または日次騰落率が不正です。'}`);
      });
      quoteBatch.forEach((symbol) => {
        if (returnedSymbols.has(symbol)) return;
        updatedQuotes[symbol] = null;
        failedQuoteOperands.add(symbol);
        failedQuotes.push(`${symbol}: 価格応答に含まれていません。`);
      });
    }

    setQuoteCache((currentQuotes) => ({ ...currentQuotes, ...updatedQuotes }));
    setDiscordAutomationUnavailableQuoteOperands(Array.from(failedQuoteOperands));
    if (failedQuotes.length > 0) {
      console.warn(
        `Discord自動通知では取得不能な比較銘柄を除外します。${failedQuotes.slice(0, 8).join(' / ')}`,
      );
    }
    return failedQuoteOperands;
  };

  const assertDiscordAutomationPrimaryQuotesAvailable = (
    panelIds: string[],
    failedQuoteOperands: Set<string>,
  ) => {
    const selectedPanelIds = new Set(panelIds);
    const failedPrimarySymbols = panels
      .filter((panel) => selectedPanelIds.has(panel.id) && !panel.comparisonOnly && panel.displayRange === 'd')
      .map((panel) => normalizeStoredSymbolValue(panel.symbol))
      .filter((symbol) => symbol && !symbol.startsWith('BASKET:'))
      .filter((symbol) => getStoredSymbolOperands(symbol).some((operand) => (
        failedQuoteOperands.has(normalizeTickerSymbolForStorage(operand))
      )));
    if (failedPrimarySymbols.length > 0) {
      // 一部銘柄の当日株価が取れなくても、表示済みの数値・チャートを通知に使う。
      // ここで例外にすると、ほかの取得済みチャートまでDiscord通知されなくなる。
      console.warn(
        `Discord自動通知では主要系列の未取得分を除外して続行します。${failedPrimarySymbols.join(' / ')}`,
      );
    }
  };

  const waitForDiscordAutomationCharts = async (
    panelIds: string[],
    deadline = Date.now() + DISCORD_AUTOMATION_CHART_READY_TIMEOUT_MS,
  ): Promise<string[]> => {
    let pendingDetails: string[] = [];
    while (Date.now() < deadline) {
      const panelElements = Array.from(
        document.querySelectorAll<HTMLElement>('[data-chart-export-panel-id]'),
      );
      pendingDetails = panelIds.flatMap((panelId) => {
        const panelElement = panelElements.find(
          (element) => element.dataset.chartExportPanelId === panelId,
        );
        if (!panelElement) return [`${panelId}: パネルなし`];
        const reasons: string[] = [];
        if (panelElement.dataset.chartCandleDataReady !== 'true') reasons.push('ローソク足未取得');
        if (panelElement.dataset.chartDailyChangeReady !== 'true') reasons.push('日次騰落率未取得');
        return reasons.length > 0 ? [`${panelId}: ${reasons.join('・')}`] : [];
      });
      if (pendingDetails.length === 0) {
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        return panelIds;
      }
      await sleep(DISCORD_AUTOMATION_CHART_READY_POLL_MS);
    }
    const panelElements = Array.from(
      document.querySelectorAll<HTMLElement>('[data-chart-export-panel-id]'),
    );
    // 120秒時点でローソク足が未完でも、画面上にカードと見出しがあればキャプチャ対象にする。
    // 個別株は価格ラベルだけでもGeminiとDiscordに渡せるため、完全描画を通知の必須条件にしない。
    const availablePanelIds = panelIds.filter((panelId) => {
      const panelElement = panelElements.find(
        (element) => element.dataset.chartExportPanelId === panelId,
      );
      const header = panelElement?.querySelector<HTMLElement>('[data-chart-export-panel-header="true"]');
      if (!panelElement || !header) return false;
      const panelRect = panelElement.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      return panelRect.width > 0 && panelRect.height > 0 && headerRect.width > 0 && headerRect.height > 0;
    });
    if (availablePanelIds.length > 0) {
      console.warn(
        `Discord自動通知は更新開始から120秒で待機を終了し、表示済み${availablePanelIds.length}件だけで続行します。${pendingDetails.join(' / ')}`,
      );
      return availablePanelIds;
    }
    throw new Error(
      `Discord自動通知のチャートデータを取得できませんでした。${pendingDetails.join(' / ')}`,
    );
  };

  const fileToDiscordAutomationArtifact = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return {
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      base64: window.btoa(binary),
    };
  };

  const resolveDiscordAutomationPanelIds = (job: DiscordAutomationJob) => {
    const resolveSelection = (selection: DiscordAutomationSelection) => {
      const panelMatchesJobMarket = (panelId: string) => {
        const panel = panels.find((candidate) => candidate.id === panelId);
        if (!panel) return false;
        const explicitSymbols = [panel.symbol, ...(panel.comparisonSymbols ?? [])]
          .flatMap((symbol) => getStoredSymbolOperands(symbol))
          .filter((symbol) => symbol && !symbol.startsWith('BASKET:'));
        if (job.id.startsWith('japan-market-flow-')) {
          return explicitSymbols.length === 0 || explicitSymbols.every(isJapaneseMarketSymbol);
        }
        if (job.id === 'us-market-sector') {
          return explicitSymbols.length === 0 || explicitSymbols.every((symbol) => (
            !isJapaneseMarketSymbol(symbol)
          ));
        }
        return true;
      };

      if (selection.mode === 'all') {
        return panels.map((panel) => panel.id).filter(panelMatchesJobMarket);
      }

      const availablePanelIds = new Set(panels.map((panel) => panel.id));
      const resolvedPanelIds: string[] = [];
      const addPanelId = (panelId: string | undefined) => {
        if (panelId && availablePanelIds.has(panelId) && !resolvedPanelIds.includes(panelId)) {
          resolvedPanelIds.push(panelId);
        }
      };

      // まず従来どおりIDで解決する。IDが変わった場合は、保存時の銘柄・名前・表示順で復元する。
      selection.panelIds.forEach((panelId, selectionIndex) => {
        addPanelId(panelId);
        if (availablePanelIds.has(panelId)) return;
        // 旧サーバーが保存した設定にはpanelRefsが存在しない。IDだけの設定でも例外にせず、
        // 下の表示順フォールバックで通知を継続する。
        const panelRefs = selection.panelRefs ?? [];
        const reference = panelRefs.find((candidate) => candidate.panelId === panelId)
          ?? panelRefs[selectionIndex];
        if (!reference) return;
        const symbol = normalizeStoredSymbolValue(reference.symbol);
        const matchedPanel = panels.find((panel) => (
          !resolvedPanelIds.includes(panel.id)
          && ((symbol && normalizeStoredSymbolValue(panel.symbol) === symbol)
            || (reference.name && panel.name === reference.name))
        ));
        addPanelId(matchedPanel?.id);
      });

      // 消えたパネルを表示順で補うと別市場の画像が混入するため、解決できた同一市場だけを使う。
      return resolvedPanelIds.filter(panelMatchesJobMarket);
    };
    const imagePanelIds = resolveSelection(job.imageSelection);
    const videoPanelIds = resolveSelection(job.videoSelection);
    if (imagePanelIds.length === 0 && videoPanelIds.length === 0) {
      throw new Error('Discord自動通知の画像または動画の対象チャートを1つ以上選択してください。');
    }
    return {
      imagePanelIds,
      videoPanelIds,
      targetPanelIds: Array.from(new Set([...imagePanelIds, ...videoPanelIds])),
    };
  };

  const refreshDiscordAutomationChartsInBrowser = async (job: DiscordAutomationJob) => {
    if (chartExportStatus || chartAiStatus) {
      throw new Error('別のチャート出力またはAI分析が実行中です。');
    }
    const { targetPanelIds } = resolveDiscordAutomationPanelIds(job);
    setChartAiStatus({ stage: 'capturing', progress: 0 });
    setChartExportError(null);
    try {
      const chartDeadline = Date.now() + DISCORD_AUTOMATION_CHART_READY_TIMEOUT_MS;
      // 更新開始から120秒を上限にする。日次株価の通信は通知の待機時間を延長させない。
      await refreshChartsForDiscordAutomation(targetPanelIds);
      void refreshDiscordAutomationDailyQuotes(
        getDiscordAutomationDailyQuoteOperands(targetPanelIds),
      ).then((failedQuoteOperands) => {
        assertDiscordAutomationPrimaryQuotesAvailable(targetPanelIds, failedQuoteOperands);
      }).catch((error) => {
        console.warn('Discord自動通知の日次株価更新に失敗しました。表示済み対象だけで続行します。', error);
      });
      await waitForDiscordAutomationCharts(targetPanelIds, chartDeadline);
    } finally {
      setChartAiStatus(null);
      setChartExportStatus(null);
      setChartExportPlayback(null);
    }
  };

  const prepareDiscordAutomationInBrowser = async (
    job: DiscordAutomationJob,
  ): Promise<DiscordAutomationPreparation> => {
    if (chartExportStatus || chartAiStatus) {
      throw new Error('別のチャート出力またはAI分析が実行中です。');
    }
    const {
      imagePanelIds: requestedImagePanelIds,
      videoPanelIds: requestedVideoPanelIds,
      targetPanelIds,
    } = resolveDiscordAutomationPanelIds(job);
    // プロンプトと実行時刻は、Discord自動通知の設定に保存されたジョブ固有値を使う。
    const prompt = job.prompt;
    // Discord用ブラウザはクラウド設定をLocalStorageへ復元してから実行されるため、
    // ON時は初期stateではなく復元済みの「AI分析の設定」モデルを読み直す。
    const model = job.useCurrentChartAiSettings
      ? normalizeGeminiChartModelId(
          readStoredValue(CHART_AI_MODEL_STORAGE_KEY, DEFAULT_GEMINI_CHART_MODEL),
        )
      : job.model;
    if (!prompt.trim()) {
      throw new Error('Discord自動通知のGeminiプロンプトを入力してください。');
    }

    setChartAiStatus({ stage: 'capturing', progress: 0 });
    setChartExportError(null);
    try {
      const chartDeadline = Date.now() + DISCORD_AUTOMATION_CHART_READY_TIMEOUT_MS;
      // 日次株価の取得失敗や遅延では止めず、更新開始から120秒で表示済み対象を確定する。
      await refreshChartsForDiscordAutomation(targetPanelIds);
      void refreshDiscordAutomationDailyQuotes(
        getDiscordAutomationDailyQuoteOperands(targetPanelIds),
      ).then((failedQuoteOperands) => {
        assertDiscordAutomationPrimaryQuotesAvailable(targetPanelIds, failedQuoteOperands);
      }).catch((error) => {
        console.warn('Discord自動通知の日次株価更新に失敗しました。表示済み対象だけで続行します。', error);
      });
      const readyPanelIds = new Set(await waitForDiscordAutomationCharts(targetPanelIds, chartDeadline));
      const readyImagePanelIds = requestedImagePanelIds.filter((panelId) => readyPanelIds.has(panelId));
      const readyVideoPanelIds = requestedVideoPanelIds.filter((panelId) => readyPanelIds.has(panelId));
      if (readyImagePanelIds.length === 0 && readyVideoPanelIds.length === 0) {
        throw new Error('Discord自動通知に使用できるチャートがありません。');
      }

      const collectFullyRenderedPanelIds = (requestedPanelIds: string[]) => {
        const panelsById = new Map(
          Array.from(document.querySelectorAll<HTMLElement>('[data-chart-export-panel-id]'))
            .map((element) => [element.dataset.chartExportPanelId, element] as const),
        );
        return requestedPanelIds.filter((panelId) => {
          const panelElement = panelsById.get(panelId);
          const header = panelElement?.querySelector<HTMLElement>('[data-chart-export-panel-header="true"]');
          if (!panelElement || !header) return false;
          const panelRect = panelElement.getBoundingClientRect();
          const headerRect = header.getBoundingClientRect();
          // 数値ラベルが見えている段階でも通知を止めない。スクリーンショットはカード全体を取得する。
          return panelRect.width > 0 && panelRect.height > 0 && headerRect.width > 0 && headerRect.height > 0;
        });
      };
      const waitForFullyRenderedPanelIds = async (requestedPanelIds: string[]) => {
        // 比較銘柄が多いチャートでは、データ準備完了後にも描画が続く場合がある。
        // 枠だけの画像を送るより、全選択パネルで比較線が十分に描画されるまで待つ。
        // 定時通知は完全描画を待ち続けず、30秒で取得済みのチャートだけを送る。
        const deadline = Date.now() + 30_000;
        let renderedPanelIds = collectFullyRenderedPanelIds(requestedPanelIds);
        while (renderedPanelIds.length < requestedPanelIds.length && Date.now() < deadline) {
          await sleep(1_000);
          renderedPanelIds = collectFullyRenderedPanelIds(requestedPanelIds);
        }
        return renderedPanelIds;
      };
      const [imagePanelIds, videoPanelIds] = await Promise.all([
        waitForFullyRenderedPanelIds(readyImagePanelIds),
        waitForFullyRenderedPanelIds(readyVideoPanelIds),
      ]);
      if (imagePanelIds.length === 0 && videoPanelIds.length === 0) {
        throw new Error('Discord自動通知に使用できる描画済みチャートがありません。');
      }
      return {
        prompt,
        model,
        imagePanelIds,
        videoPanelIds,
        sendImagesToGemini: job.sendImagesToGemini,
        sendVideosToGemini: job.sendVideosToGemini,
        videoDurationSeconds: job.videoDurationSeconds,
        videoFrameRate: job.videoFrameRate,
        videoResolutionId: job.videoResolutionId,
      };
    } catch (error) {
      setChartAiStatus(null);
      setChartExportStatus(null);
      setChartExportPlayback(null);
      throw error;
    }
  };

  const completeDiscordAutomationInBrowser = async (
    preparation: DiscordAutomationPreparation,
    screenshots: DiscordAutomationArtifact[],
  ) => {
    if (screenshots.length !== preparation.imagePanelIds.length) {
      throw new Error('Discord添付用のチャート画像を取得できませんでした。');
    }
    const imageFiles = screenshots.map((artifact) => {
      const binary = window.atob(artifact.base64);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new File([bytes], artifact.name, {
        type: artifact.mimeType || 'image/png',
        lastModified: Date.now(),
      });
    });

    try {
      const resolution = CHART_EXPORT_RESOLUTIONS.find(
        (candidate) => candidate.id === preparation.videoResolutionId,
      ) ?? CHART_EXPORT_RESOLUTIONS[0];
      const videoFiles: File[] = [];
      setChartExportStatus({ kind: 'video', progress: 0 });
      for (let index = 0; index < preparation.videoPanelIds.length; index += 1) {
        const panelId = preparation.videoPanelIds[index];
        const panelNumber = panels.findIndex((panel) => panel.id === panelId) + 1;
        const videoFile = await exportChartVideo({
          width: resolution.width,
          height: resolution.height,
          panelIds: [panelId],
          durationSeconds: preparation.videoDurationSeconds,
          frameRate: preparation.videoFrameRate,
          fileNumber: panelNumber > 0 ? panelNumber : index + 1,
          download: false,
          beforeFrame: async (progress) => {
            setChartExportPlayback({ panelIds: [panelId], progress });
            await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
          },
          onProgress: (progress) => setChartExportStatus({
            kind: 'video',
            progress: (index + progress) / preparation.videoPanelIds.length,
          }),
        });
        videoFiles.push(videoFile);
      }
      const geminiMediaFiles = [
        ...(preparation.sendImagesToGemini ? imageFiles : []),
        ...(preparation.sendVideosToGemini ? videoFiles : []),
      ];
      if (geminiMediaFiles.length === 0) {
        throw new Error('Geminiへ送付する画像または動画をONにしてください。');
      }
      // ONにした添付種別だけをGeminiへ渡し、Discordには常に選択済み動画→画像を添付する。
      setChartExportStatus(null);
      setChartAiStatus({ stage: 'requesting', progress: 1 });
      const aiResult = await requestChartAiAnalysis(
        preparation.prompt,
        geminiMediaFiles,
        preparation.model,
      );
      return {
        text: aiResult.text,
        model: aiResult.model,
        videos: await Promise.all(videoFiles.map(fileToDiscordAutomationArtifact)),
        images: screenshots,
      };
    } finally {
      setChartAiStatus(null);
      setChartExportStatus(null);
      setChartExportPlayback(null);
    }
  };

  useEffect(() => {
    const renderedPanelCount = document.querySelectorAll('[data-chart-export-panel-id]').length;
    const automationPanelsReady = !isDiscordAutomationPage || renderedPanelCount > 0;
    // 共有ワークスペースの復元中にブリッジを公開すると、古いパネルIDで実行が始まり
    // 直後のDOM差し替えで画像・ローソク足の対象を失う。実チャートの初回描画後だけ受け付ける。
    if (workspacePersistenceMode === 'checking' || !automationPanelsReady) {
      delete window.mooviewDiscordAutomation;
      return;
    }
    window.mooviewDiscordAutomation = {
      prepare: prepareDiscordAutomationInBrowser,
      refresh: refreshDiscordAutomationChartsInBrowser,
      complete: completeDiscordAutomationInBrowser,
    };
    return () => {
      delete window.mooviewDiscordAutomation;
    };
  }, [
    chartAiStatus,
    chartExportStatus,
    panels,
    requestAutoWatchlistQuoteRefresh,
    completeDiscordAutomationInBrowser,
    prepareDiscordAutomationInBrowser,
    refreshDiscordAutomationChartsInBrowser,
    isDiscordAutomationPage,
    workspacePersistenceMode,
  ]);

  const loadDiscordAutomationSettings = async () => {
    setDiscordAutomationLoading(true);
    try {
      const [settingsResponse, runsResponse] = await Promise.all([
        fetch(DISCORD_AUTOMATION_SETTINGS_ENDPOINT),
        fetch(DISCORD_AUTOMATION_RUNS_ENDPOINT),
      ]);
      const settingsPayload = await settingsResponse.json().catch(() => null) as unknown;
      const runsPayload = await runsResponse.json().catch(() => null) as unknown;
      if (!settingsResponse.ok) {
        throw new Error(
          (settingsPayload as { error?: string } | null)?.error
          || 'Discord自動通知設定を読み込めませんでした。',
        );
      }
      const loadedSettings = normalizeDiscordAutomationSettings(settingsPayload);
      setDiscordAutomationSettings(loadedSettings);
      if (runsResponse.ok && Array.isArray(runsPayload)) {
        setDiscordAutomationRuns(runsPayload as DiscordAutomationRunRecord[]);
      }
      setDiscordAutomationMessage(null);
    } catch (error) {
      setDiscordAutomationMessage(
        error instanceof Error ? error.message : 'Discord自動通知設定を読み込めませんでした。',
      );
    } finally {
      setDiscordAutomationLoading(false);
    }
  };

  const openDiscordAutomationSettings = () => {
    setDiscordAutomationSettingsOpen(true);
    void loadDiscordAutomationSettings();
  };

  const updateDiscordAutomationJob = (
    jobId: string,
    updater: (job: DiscordAutomationJob) => DiscordAutomationJob,
  ) => {
    setDiscordAutomationSettings((current) => ({
      ...current,
      jobs: current.jobs.map((job) => job.id === jobId ? updater(job) : job),
    }));
  };

  const setDiscordAutomationSelection = (
    jobId: string,
    field: 'imageSelection' | 'videoSelection',
    selection: DiscordAutomationSelection,
  ) => {
    updateDiscordAutomationJob(jobId, (job) => ({ ...job, [field]: selection }));
  };

  const saveDiscordAutomationSettings = async (): Promise<DiscordAutomationSettings> => {
    const settingsToSave: DiscordAutomationSettings = discordAutomationSettings;
    const response = await fetch(DISCORD_AUTOMATION_SETTINGS_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: settingsToSave }),
    });
    const payload = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      throw new Error(
        (payload as { error?: string } | null)?.error
        || 'Discord自動通知設定を保存できませんでした。',
      );
    }
    const saved = normalizeDiscordAutomationSettings(payload);
    setDiscordAutomationSettings(saved);
    return saved;
  };

  const handleSaveDiscordAutomationSettings = async () => {
    if (discordAutomationSaveFeedbackTimerRef.current !== null) {
      window.clearTimeout(discordAutomationSaveFeedbackTimerRef.current);
      discordAutomationSaveFeedbackTimerRef.current = null;
    }
    setDiscordAutomationSaveFeedback(null);
    setDiscordAutomationSaving(true);
    try {
      await saveDiscordAutomationSettings();
      setDiscordAutomationMessage('Discord自動通知設定をサーバーへ保存しました。');
      setDiscordAutomationSaveFeedback('success');
      discordAutomationSaveFeedbackTimerRef.current = window.setTimeout(() => {
        setDiscordAutomationSaveFeedback(null);
        discordAutomationSaveFeedbackTimerRef.current = null;
      }, 5_000);
    } catch (error) {
      setDiscordAutomationMessage(
        error instanceof Error ? error.message : 'Discord自動通知設定を保存できませんでした。',
      );
      setDiscordAutomationSaveFeedback('error');
    } finally {
      setDiscordAutomationSaving(false);
    }
  };

  const handleRunDiscordAutomationNow = async (job: DiscordAutomationJob) => {
    setDiscordAutomationSaving(true);
    try {
      const saved = await saveDiscordAutomationSettings();
      const target = saved.jobs.find((candidate) => candidate.id === job.id) || job;
      const response = await fetch(`/api/discord-automation/jobs/${encodeURIComponent(target.id)}/run`, {
        method: 'POST',
      });
      const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || 'Discord自動通知を開始できませんでした。');
      }
      setDiscordAutomationMessage(payload?.message || 'Discord自動通知を開始しました。');
      window.setTimeout(() => void loadDiscordAutomationSettings(), 1_000);
    } catch (error) {
      setDiscordAutomationMessage(
        error instanceof Error ? error.message : 'Discord自動通知を開始できませんでした。',
      );
    } finally {
      setDiscordAutomationSaving(false);
    }
  };

  const addDiscordAutomationJob = () => {
    const id = `custom-${Date.now().toString(36)}`;
    setDiscordAutomationSettings((current) => ({
      ...current,
      jobs: [...current.jobs, {
        id,
        name: '新しいDiscord通知',
        enabled: true,
        days: { mode: 'weekdays', customDays: [] },
        times: ['12:00'],
        prompt: chartAiPrompt || DEFAULT_CHART_AI_PROMPT,
        model: chartAiModel,
        useCurrentChartAiSettings: true,
        imageSelection: { mode: 'all', panelIds: [], panelRefs: [] },
        videoSelection: { mode: 'all', panelIds: [], panelRefs: [] },
        videoDurationSeconds: 5,
        videoFrameRate: 30,
        videoResolutionId: 'square-720',
      }],
    }));
  };

  const handleCopyChartAiResult = async () => {
    if (!chartAiResult?.text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(chartAiResult.text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = chartAiResult.text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) {
          throw new Error('コピーできませんでした。');
        }
      }
      setChartAiCopied(true);
      window.setTimeout(() => setChartAiCopied(false), 2_000);
    } catch {
      setChartExportError('クリップボードへコピーできませんでした。');
    }
  };

  const renderValueChainTickerChart = ({
    symbol,
    comparisonSymbols = [],
    onOpenIndicatorSettings,
    onRemoveComparisonSymbol,
    focusDate,
    focusDateActive,
  }: {
    symbol: string;
    comparisonSymbols?: string[];
    onOpenIndicatorSettings?: () => void;
    onRemoveComparisonSymbol?: (symbol: string) => void;
    focusDate?: string;
    focusDateActive?: boolean;
  }) => {
    const panelExpression = normalizeSymbolExpressionForStorage(symbol);
    const resolvedChartCandles = resolveChartCandlesForSymbol(
      symbol,
      valueChainChartState.timeframe,
      valueChainChartState.displayRange,
      !moomooRealTimeActive,
    );
    const chartFetchError = getCandleFetchError(symbol, valueChainChartState.timeframe);
    const chartCandles = moomooRealTimeActive
      ? resolvedChartCandles
      : resolvedChartCandles.length > 0
      ? resolvedChartCandles
      : generateCandles(symbol, valueChainChartState.timeframe, 220);
    const chartSettings = panelExpression
      ? createDefaultIndicatorSettings(symbol)
      : indicatorDatabase[symbol.toUpperCase()] || createValueChainDefaultIndicatorSettings(symbol);
    const comparableSymbols = Array.from(new Set(comparisonSymbols))
      .filter((comparisonSymbol) => comparisonSymbol && comparisonSymbol !== symbol);

    return (
      <InteractiveCustomChart
        symbol={symbol}
        candles={chartCandles}
        timeframe={valueChainChartState.timeframe}
        indicatorSettings={chartSettings}
        zoomFactor={valueChainChartState.zoomFactor}
        setZoomFactor={(zoomFactor) =>
          setValueChainChartState((current) => ({ ...current, zoomFactor }))
        }
        scrollOffsetPct={valueChainChartState.scrollOffsetPct}
        setScrollOffsetPct={(scrollOffsetPct) =>
          setValueChainChartState((current) => ({ ...current, scrollOffsetPct }))
        }
        showVolume={!panelExpression && valueChainChartState.showVolume}
        showRsi={!panelExpression && valueChainChartState.showRsi}
        showMacd={!panelExpression && valueChainChartState.showMacd}
        comparisonSymbols={comparableSymbols}
        comparisonLabelFontSize={comparisonLabelFontSize}
        onComparisonLabelFontSizeChange={updateComparisonLabelFontSize}
        comparisonLabelLayoutMode={comparisonLabelLayoutMode}
        onComparisonLabelLayoutModeChange={updateComparisonLabelLayoutMode}
        comparisonLabelRankSpacingScale={valueChainChartState.comparisonLabelRankSpacingScale ?? 1}
        onComparisonLabelRankSpacingScaleChange={(comparisonLabelRankSpacingScale) =>
          setValueChainChartState((current) => ({ ...current, comparisonLabelRankSpacingScale }))
        }
        symbolDisplayNames={createChartSymbolDisplayNames([symbol, ...comparableSymbols])}
        changePctOverrides={createChartChangePctOverrides(
          [symbol, ...comparableSymbols],
          valueChainChartState.displayRange,
        )}
        comparisonCandles={
          comparableSymbols.reduce((acc, comparisonSymbol) => {
            const candles = resolveChartCandlesForSymbol(
              comparisonSymbol,
              valueChainChartState.timeframe,
              valueChainChartState.displayRange,
              !moomooRealTimeActive,
              false,
            );
            if (moomooRealTimeActive) {
              if (candles.length > 0) acc[comparisonSymbol] = candles;
            } else {
              acc[comparisonSymbol] = candles.length > 0
                ? candles
                : generateCandles(comparisonSymbol, valueChainChartState.timeframe, 220);
            }
            return acc;
          }, {} as Record<string, Candle[]>)
        }
        emptyMessage={chartFetchError ?? (moomooRealTimeActive ? 'Moomoo実データを取得中...' : 'デモデータを生成中...')}
        priceScale={valueChainChartState.priceScale ?? 1}
        setPriceScale={(priceScale) =>
          setValueChainChartState((current) => ({ ...current, priceScale }))
        }
        priceOffsetPct={valueChainChartState.priceOffsetPct ?? 0}
        setPriceOffsetPct={(priceOffsetPct) =>
          setValueChainChartState((current) => ({ ...current, priceOffsetPct }))
        }
        rsiHeightPct={valueChainChartState.rsiHeightPct ?? 25}
        setRsiHeightPct={(rsiHeightPct) =>
          setValueChainChartState((current) => ({ ...current, rsiHeightPct }))
        }
        macdHeightPct={valueChainChartState.macdHeightPct ?? 25}
        setMacdHeightPct={(macdHeightPct) =>
          setValueChainChartState((current) => ({ ...current, macdHeightPct }))
        }
        onOpenIndicatorSettings={onOpenIndicatorSettings}
        onRemoveComparisonSymbol={onRemoveComparisonSymbol}
        onToggleVolume={!panelExpression
          ? () => setValueChainChartState((current) => ({ ...current, showVolume: !current.showVolume }))
          : undefined}
        onToggleRsi={!panelExpression
          ? () => setValueChainChartState((current) => ({ ...current, showRsi: !current.showRsi }))
          : undefined}
        onToggleMacd={!panelExpression
          ? () => setValueChainChartState((current) => ({ ...current, showMacd: !current.showMacd }))
          : undefined}
        focusDate={focusDate}
        focusDateActive={focusDateActive}
        allowNegativeValues={Boolean(panelExpression)}
        valuePrecision={panelExpression ? 4 : 2}
      />
    );
  };

  const renderValueChainIndicatorSettings = (symbol: string) => {
    const symbolKey = symbol.toUpperCase();
    const settings = indicatorDatabase[symbolKey] || createValueChainDefaultIndicatorSettings(symbolKey);
    return (
      <IndicatorSettingsPanel
        settings={settings}
        onChange={handleUpdateIndicators}
        onReset={() => setIndicatorDatabase((current) => ({
          ...current,
          [symbolKey]: createValueChainDefaultIndicatorSettings(symbolKey),
        }))}
      />
    );
  };

  const addHeaderTickerSymbol = (symbol: string) => {
    setHeaderTickerSymbols((current) => (
      current.includes(symbol) ? current : [...current, symbol]
    ));
    setHeaderTickerMenu(null);
  };

  const removeHeaderTickerSymbol = (symbol: string) => {
    setHeaderTickerSymbols((current) => {
      if (current.length <= 1) return current;
      return current.filter((item) => item !== symbol);
    });
    setHeaderTickerMenu(null);
  };

  const selectWorkspaceView = (view: AppView) => {
    setAppView(view);
    setWorkspaceMenuOpen(false);
  };

  if (appView === 'high-dividend') {
    return (
      <>
        <HighDividendApp onOpenWorkspaceMenu={() => setWorkspaceMenuOpen(true)} />
        <WorkspaceMenuOverlay
          isOpen={workspaceMenuOpen}
          currentView={appView}
          onClose={() => setWorkspaceMenuOpen(false)}
          onSelect={selectWorkspaceView}
        />
      </>
    );
  }

  return (
    <div
      className="h-[100dvh] min-h-0 overflow-hidden bg-[#050505] text-[#d1d4dc] font-sans flex flex-col antialiased selection:bg-emerald-500/25 md:h-auto md:min-h-screen md:overflow-visible"
      style={{ fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif' }}
    >
      <style>
        {`
          @keyframes mooview-header-marquee {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
        `}
      </style>
      
      {/* Dynamic Upper Banner with real-time quote ticks */}
      <div className="bg-[#080808] border-b border-[#202020] py-1.5 px-2 shrink-0 overflow-hidden whitespace-nowrap flex items-center gap-2 text-xs md:py-2 md:px-4 md:gap-4">
        <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={() => setWorkspaceMenuOpen((open) => !open)}
              className="w-7 h-7 flex items-center justify-center border border-[#242424] bg-[#101010] text-gray-300 hover:text-white hover:bg-[#181818] transition"
              title="画面切替メニュー"
              aria-label="画面切替メニューを開く"
            >
              <Menu className="w-4 h-4" />
            </button>
            <span className="font-bold tracking-tight text-white uppercase text-xs">MooView</span>
          </div>
        <div className="h-4 w-px bg-[#2a2a2a] shrink-0" />
        <div className="min-w-0 flex-1 flex items-center gap-1">
          <div ref={headerTickerViewportRef} className="min-w-0 flex-1 overflow-hidden">
            <div
              ref={headerTickerTrackRef}
              className="flex items-center gap-3 min-w-max"
              style={{
                animation: headerTickerOverflow && headerTickerStats.length > 1
                  ? 'mooview-header-marquee 42s linear infinite'
                  : 'none',
              }}
            >
              {(headerTickerOverflow ? [...headerTickerStats, ...headerTickerStats] : headerTickerStats).map((ticker, index) => {
                const hasRealQuote = ticker.currentPrice !== null && ticker.computedChange !== null;
                const pos = hasRealQuote && ticker.computedChange >= 0;
                const flash = headerTickerFlash[ticker.symbol];
                return (
                  <button
                    type="button"
                    key={`${ticker.symbol}-${index}`}
                    className="inline-flex flex-col cursor-pointer hover:bg-[#181818] px-2 py-0.5 rounded transition-colors border border-transparent"
                    onClick={() => selectTickerForPrimaryChart(ticker.symbol)}
                    title="左側のチャートに表示する"
                    style={{
                      backgroundColor: flash === 'up'
                        ? 'rgba(16, 185, 129, 0.18)'
                        : flash === 'down'
                          ? 'rgba(239, 83, 80, 0.18)'
                          : undefined,
                      boxShadow: flash ? `inset 0 0 0 1px ${flash === 'up' ? 'rgba(16, 185, 129, 0.30)' : 'rgba(239, 83, 80, 0.30)'}` : undefined,
                    }}
                  >
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-gray-200 text-xs">{ticker.symbol}</span>
                      <span className={`text-[10px] font-mono font-bold ${
                        !hasRealQuote ? 'text-gray-500' : pos ? 'text-[#009b87]' : 'text-[#ff4057]'
                      }`}>
                        {hasRealQuote
                          ? `${pos ? '▲' : '▼'} ${Math.abs(ticker.computedChange).toFixed(2)}%`
                          : 'N/A'}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono mt-0.5 text-left">
                      {formatTickerPrice(ticker.symbol, ticker.currentPrice)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="relative flex flex-col gap-0.5 shrink-0" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setHeaderTickerMenu((menu) => menu === 'add' ? null : 'add')}
              className="w-5 h-4 border border-[#2a2a2a] bg-[#101010] text-gray-300 hover:text-white hover:bg-[#181818] flex items-center justify-center"
              aria-label="ヘッダー表示銘柄を追加"
              title="ヘッダー表示銘柄を追加"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setHeaderTickerMenu((menu) => menu === 'remove' ? null : 'remove')}
              className="w-5 h-4 border border-[#2a2a2a] bg-[#101010] text-gray-300 hover:text-white hover:bg-[#181818] flex items-center justify-center"
              aria-label="ヘッダー表示銘柄を削除"
              title="ヘッダー表示銘柄を削除"
            >
              <Minus className="w-3 h-3" />
            </button>
            {headerTickerMenu && (
              <div className="absolute right-6 top-0 z-50 w-48 max-h-72 overflow-y-auto bg-[#080808] border border-[#303030] shadow-2xl py-1 text-[10px]">
                {(headerTickerMenu === 'add' ? headerTickerAddOptions : headerTickerStats).length === 0 ? (
                  <div className="px-2.5 py-2 text-gray-500">対象なし</div>
                ) : (
                  (headerTickerMenu === 'add' ? headerTickerAddOptions : headerTickerStats).map((ticker) => (
                    <button
                      key={ticker.symbol}
                      type="button"
                      onClick={() => headerTickerMenu === 'add'
                        ? addHeaderTickerSymbol(ticker.symbol)
                        : removeHeaderTickerSymbol(ticker.symbol)}
                      className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left hover:bg-[#171717]"
                    >
                      <span className="font-mono font-bold text-gray-100">{ticker.symbol}</span>
                      <span className="min-w-0 truncate text-gray-500">{ticker.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Right header actions */}
        <div className="hidden sm:flex items-center space-x-4 shrink-0 text-xs text-[#848e9c] select-none">
          <div className="flex flex-col items-end leading-tight font-mono">
            <span className="text-[#d1d4dc]">{currentClockTime}</span>
            <span className="text-[9px] text-[#848e9c]">更新 {lastApiSyncTime}</span>
          </div>
        </div>
      </div>

      <WorkspaceMenuOverlay
        isOpen={workspaceMenuOpen}
        currentView={appView}
        onClose={() => setWorkspaceMenuOpen(false)}
        onSelect={selectWorkspaceView}
      />

      {/* Main Multi-Chart Workspace Container and Indicator Sidebar Controls split */}
      {appView === 'value-chain' ? (
        <ValueChainMap
          tickers={liveTickerStats}
          chartState={valueChainChartState}
          onChartStateChange={setValueChainChartState}
          renderTickerChart={renderValueChainTickerChart}
          renderIndicatorSettings={renderValueChainIndicatorSettings}
          onOpenTickerInChart={openValueChainTickerInChart}
          onAddSymbolsToWatchlist={addSymbolsToActiveWatchlist}
          onSyncValueChainToWatchlist={(chain) => syncChainToWatchlist(chain, 'value-chain', { selectFirstTab: true })}
          onChartSymbolsChange={setValueChainChartSymbols}
        />
      ) : appView === 'macro-flow' ? (
        <MacroFlowMap
          tickers={liveTickerStats}
          chartState={valueChainChartState}
          onChartStateChange={setValueChainChartState}
          chartTimeframe={valueChainChartState.timeframe}
          onChartTimeframeChange={(timeframe) => {
            forceCandleRefreshRef.current = true;
            setValueChainChartState((current) => ({
              ...current,
              timeframe,
              zoomFactor: timeframe === '1d' ? Math.max(current.zoomFactor, 8) : current.zoomFactor,
            }));
            setTickTrigger((current) => current + 1);
          }}
          renderTickerChart={renderValueChainTickerChart}
          renderIndicatorSettings={renderValueChainIndicatorSettings}
          onSyncBasketsToWatchlist={(chain) => syncChainToWatchlist(chain, 'value-chain', { selectFirstTab: true })}
          onChartSymbolsChange={setValueChainChartSymbols}
        />
      ) : (
      <div className="relative flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">

        {/* Workspace Panels container */}
        {appView === 'disclosures' ? (
          <DisclosureDatabase />
        ) : (
        <div className="flex-1 flex flex-col min-h-0 p-1 bg-[#050505] overflow-hidden md:p-3 md:overflow-y-auto">
          
          <div className="flex-1 min-h-0 w-full flex flex-row select-none overflow-hidden">
            {visibleColGroups.map((col, colIdx) => (
              <React.Fragment key={colIdx}>
                <div
                  id={`col-group-${colIdx}`}
                  style={{
                    flexGrow: colWeights[`col-${colIdx}`] ?? 100,
                    flexShrink: 1,
                    flexBasis: 0,
                  }}
                  className="flex flex-col min-h-0 min-w-[120px] h-full"
                >
                  {col.map((panel, pIdx) => {
                    const panelSymbol = normalizeStoredSymbolValue(panel.symbol);
                    const panelComparisonSymbols = (panel.comparisonSymbols || []).filter((symbol) => {
                      if (!isDiscordAutomationPage) return true;
                      if (symbol.startsWith('BASKET:')) {
                        const sectionId = symbol.slice(7);
                        return watchlistTabs.some((tab) => (
                          tab.sections.some((section) => section.id === sectionId)
                        ));
                      }
                      return getStoredSymbolOperands(symbol).every((operand) => (
                        !discordAutomationUnavailableQuoteOperands.includes(
                          normalizeTickerSymbolForStorage(operand),
                        )
                      ));
                    });
                    const panelComparisonOnly = Boolean(panel.comparisonOnly);
                    const panelShowPrimaryCandles = panel.showPrimaryCandles !== false;
                    const panelComparisonCandles = panelComparisonSymbols.reduce((acc, compSym) => {
                      const candles = resolveChartCandlesForSymbol(
                        compSym,
                        panel.timeframe,
                        panel.displayRange,
                        !moomooRealTimeActive,
                        false,
                      );
                      if (candles.length > 0) {
                        acc[compSym] = candles;
                      }
                      return acc;
                    }, {} as Record<string, Candle[]>);
                    const comparisonAnchorSymbol = panelComparisonOnly
                      ? selectLongestCandleSeriesSymbol(panelComparisonSymbols, panelComparisonCandles)
                        || panelComparisonSymbols[0]
                        || ''
                      : '';
                    const chartAnchorSymbol = panelComparisonOnly ? comparisonAnchorSymbol : panelSymbol;
                    const panelIsEmpty = panelComparisonOnly ? panelComparisonSymbols.length === 0 : !panelSymbol;
                    const panelExpression = panelComparisonOnly || !panelSymbol ? null : normalizeSymbolExpressionForStorage(panelSymbol);
                    const pCandles = panelComparisonOnly
                      ? comparisonAnchorSymbol
                        ? panelComparisonCandles[comparisonAnchorSymbol] || []
                        : []
                      : chartAnchorSymbol
                        ? resolveChartCandlesForSymbol(
                          chartAnchorSymbol,
                          panel.timeframe,
                          panel.displayRange,
                          !moomooRealTimeActive,
                        )
                        : [];
                    const pCandleError = chartAnchorSymbol ? getCandleFetchError(chartAnchorSymbol, panel.timeframe) : null;
                    const pSettings = !chartAnchorSymbol || panelComparisonOnly
                      ? createDefaultIndicatorSettings('EMPTY')
                      : panelExpression
                        ? createDefaultIndicatorSettings(panelSymbol)
                        : indicatorDatabase[panelSymbol.toUpperCase()] || createDefaultIndicatorSettings(panelSymbol);
                    const isTvEmbed = Boolean(panelEngineToggle[panel.id]) && !panelExpression && !panelIsEmpty && !panelComparisonOnly;
                    const selectedComparisonCandidates = getComparableSymbolsForPanel(panel, selectedSymbols);
                    const chartDisplaySymbols = Array.from(new Set(
                      [
                        ...(panelComparisonOnly ? [] : [chartAnchorSymbol]),
                        ...panelComparisonSymbols,
                      ].filter(Boolean),
                    ));
                    const panelUsesJapanYahooFallback = chartDisplaySymbols.some(isJapaneseMarketSymbolInput);
                    const chartDailyChangeOverrides = createChartChangePctOverrides(
                      chartDisplaySymbols,
                      panel.displayRange,
                    );
                    const chartDailyChangeReady = panel.displayRange !== 'd'
                      || chartDisplaySymbols.every((symbol) => Number.isFinite(chartDailyChangeOverrides[symbol]));
                    const chartCandleDataReady = chartDisplaySymbols.length > 0
                      && chartDisplaySymbols.every((symbol) => resolveChartCandlesForSymbol(
                        symbol,
                        panel.timeframe,
                        panel.displayRange,
                        false,
                        false,
                      ).length > 0);

                    return (
                      <React.Fragment key={panel.id}>
                        <div
                          id={`chart-panel-container-${panel.id}`}
                          data-chart-export-panel-id={panel.id}
                          data-chart-candle-data-ready={isTvEmbed || chartCandleDataReady ? 'true' : 'false'}
                          data-chart-daily-change-ready={isTvEmbed || chartDailyChangeReady ? 'true' : 'false'}
                          style={{
                            height: isMobileViewport
                              ? '100%'
                              : `${panelHeights[panel.id] ?? DEFAULT_PANEL_HEIGHT}px`,
                          }}
                          onDragOver={(event) => {
                            if (event.dataTransfer.types.includes('application/x-mooview-panel')) {
                              handlePanelOrderDragOver(event, panel.id);
                              return;
                            }
                            const isBasketDrag = event.dataTransfer.types.includes('application/x-mooview-basket');
                            if ((draggedTicker || draggedBasketRef.current || isBasketDrag) && !isTvEmbed) {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = 'copy';
                            }
                          }}
                          onDrop={(event) => {
                            if (handlePanelOrderDrop(event, panel.id)) {
                              return;
                            }
                            const isBasketDrag = event.dataTransfer.types.includes('application/x-mooview-basket');
                            const currentBasket = draggedBasketRef.current;
                            if ((!draggedTicker && !currentBasket && !isBasketDrag) || isTvEmbed) return;
                            event.preventDefault();
                            event.stopPropagation();

                            if (currentBasket || isBasketDrag) {
                              const sectionId = currentBasket?.sectionId
                                ?? event.dataTransfer.getData('application/x-mooview-basket');
                              if (sectionId) {
                                addSymbolsToPanelFromDrop(panel, [`BASKET:${sectionId}`]);
                              }
                            } else {
                              addSymbolsToPanelFromDrop(panel, getDraggedTickerSymbols());
                            }
                            setDraggedTicker(null);
                            draggedBasketRef.current = null;
                            setDraggedBasket(null);
                            setDraggedSectionId(null);
                          }}
                          className="w-full flex flex-col shrink-0 min-h-0"
                        >
                          <div className="flex-1 flex flex-col min-h-0 bg-[#0d0d0d] border border-[#242424] rounded-lg overflow-hidden relative focus-within:border-emerald-500 transition-colors shadow-lg">
                            {/* Active Comparison (Add Overlaid Symbol) Custom Popover */}
                            {activeComparisonPopoverPanelId === panel.id && (
                              <div className="absolute top-10 right-3 z-30 bg-[#0b0b0b] border border-[#242424] p-3 rounded-lg shadow-xl w-60 text-xs flex flex-col space-y-2">
                                <div className="flex items-center justify-between border-b border-[#242424]/60 pb-2">
                                  <span className="font-bold text-gray-200">株価を重ねて比較追加</span>
                                  <button
                                    onClick={() => setActiveComparisonPopoverPanelId(null)}
                                    className="text-gray-400 hover:text-white font-bold p-1 hover:bg-[#1a1d2e] rounded leading-none transition cursor-pointer"
                                  >
                                    ✕
                                  </button>
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 text-gray-300">
                                  {liveTickerStats
                                    .filter(t => t.symbol !== panel.symbol)
                                    .map(t => {
                                      const isAdded = (panel.comparisonSymbols || []).includes(t.symbol);
                                      const currentPrice = Number(t.currentPrice);
                                      const canCompare = !moomooRealTimeActive
                                        || (t.currentPrice !== null && Number.isFinite(currentPrice) && currentPrice > 0);
                                      return (
                                        <label
                                          key={t.symbol}
                                          className={`flex items-center justify-between p-1.5 px-2 rounded transition select-none ${
                                            canCompare
                                              ? 'hover:bg-[#111111]/80 cursor-pointer'
                                              : 'opacity-45 cursor-not-allowed'
                                          }`}
                                        >
                                          <div className="flex items-center space-x-2">
                                            <input
                                              type="checkbox"
                                              checked={isAdded}
                                              disabled={!canCompare}
                                              onChange={() => {
                                                if (!panel.symbol && !isAdded) {
                                                  addSymbolsToPanelFromDrop(panel, [t.symbol]);
                                                  return;
                                                }
                                                const prevList = panel.comparisonSymbols || [];
                                                const updatedList = isAdded
                                                  ? prevList.filter(s => s !== t.symbol)
                                                  : [...prevList, t.symbol];
                                                handleUpdatePanel(panel.id, { comparisonSymbols: updatedList });
                                              }}
                                              className="rounded border-[#2a2a2a] bg-[#171717] text-emerald-500 focus:ring-emerald-500/20 w-3.5 h-3.5 cursor-pointer"
                                            />
                                            <span className="font-bold font-mono text-xs">{t.symbol}</span>
                                            <span className="text-[10px] text-gray-500 truncate max-w-[90px]">{t.name}</span>
                                          </div>
                                          <span className="text-[10px] text-gray-400 font-mono">
                                            {formatTickerPrice(t.symbol, t.currentPrice)}
                                          </span>
                                        </label>
                                      );
                                    })}
                                </div>
                                <div className="text-[9px] text-gray-500 text-center border-t border-[#202020]/60 pt-1.5 leading-tight">
                                  始点からの変動比率(％)を算出し、チャート上にラインを重ねてリアルタイム描画します。
                                </div>
                              </div>
                            )}

                            {/* Panel Toolbar Header */}
                            <div
                              className="h-10 border-b border-[#242424] bg-[#111111] px-2 flex items-center justify-between shrink-0 select-none md:px-3"
                              data-chart-export-panel-header="true"
                              onTouchStart={handleMobileChartHeaderTouchStart}
                              onTouchEnd={handleMobileChartHeaderTouchEnd}
                            >
                              <div className="flex items-center space-x-2 overflow-x-auto whitespace-nowrap scrollbar-none scroll-smooth pr-2">
                                
                                {/* タブ選択で、そのリスト内の銘柄を比較表示に展開する */}
                                <div className="relative shrink-0">
                                  <button
                                    id={`select-watchlist-tab-${panel.id}`}
                                    type="button"
                                    draggable={layoutStyle === 'grid'}
                                    onDragStart={(event) => handlePanelOrderDragStart(event, panel.id)}
                                    onDragEnd={handlePanelOrderDragEnd}
                                    onContextMenu={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      openChartNameEditor(panel);
                                    }}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      const rect = event.currentTarget.getBoundingClientRect();
                                      const menuWidth = 320;
                                      const x = Math.min(
                                        Math.max(8, rect.left),
                                        Math.max(8, window.innerWidth - menuWidth - 8),
                                      );
                                      const y = Math.min(
                                        rect.bottom + 4,
                                        Math.max(8, window.innerHeight - 260),
                                      );
                                      setWatchlistTargetMenu((current) => (
                                        current?.panelId === panel.id
                                          ? null
                                          : {
                                              panelId: panel.id,
                                              x,
                                              y,
                                              width: menuWidth,
                                              maxHeight: Math.max(180, window.innerHeight - y - 12),
                                            }
                                      ));
                                      }}
                                    className="h-7 w-[150px] bg-[#171717] border border-[#2a2a2a] text-white rounded text-xs px-2 font-bold outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 cursor-pointer flex items-center justify-between gap-2"
                                    title="クリックで選択、右クリックで名称変更、ドラッグでチャート順序変更"
                                  >
                                    <span className="min-w-0 truncate">{getWatchlistTargetLabelForPanel(panel)}</span>
                                    <ChevronDown className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                                  </button>
                                  {watchlistTargetMenu?.panelId === panel.id && (
                                    <div
                                      className="fixed z-[120] overflow-y-auto border border-[#343434] bg-[#080808] py-1 text-[10px] text-gray-200 shadow-2xl"
                                      style={{
                                        left: watchlistTargetMenu.x,
                                        top: watchlistTargetMenu.y,
                                        width: watchlistTargetMenu.width,
                                        maxHeight: watchlistTargetMenu.maxHeight,
                                      }}
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => handleCreateEmptyChartPanel(false)}
                                        disabled={panels.length >= 6}
                                        className="group flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-emerald-950/45 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                                        title="空のチャートを追加"
                                      >
                                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-emerald-700 bg-emerald-950/80 text-emerald-200">
                                          <Plus className="h-3 w-3" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                          <span className="block truncate text-[11px] font-bold text-emerald-100">新規作成チャート</span>
                                          <span className="block truncate text-[9px] text-emerald-300/70">空のチャートへ銘柄・バスケットを投げ込む</span>
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={openCreateComparisonChartNameEditor}
                                        disabled={panels.length >= 6}
                                        className="group flex w-full items-center gap-2 border-b border-[#242424] px-2 py-2 text-left hover:bg-cyan-950/45 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                                        title="ローソク足を出さず、指数比較線だけの空チャートを追加"
                                      >
                                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-cyan-700 bg-cyan-950/80 text-cyan-200">
                                          <Plus className="h-3 w-3" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                          <span className="block truncate text-[11px] font-bold text-cyan-100">新規作成チャート（指数比較）</span>
                                          <span className="block truncate text-[9px] text-cyan-300/70">初回ドロップから比較線として描画</span>
                                        </span>
                                      </button>
                                      {watchlistTabs.map((tab) => {
                                        const tabSymbols = watchlistTabSymbolsById.get(tab.id) ?? [];
                                        const tabSelected = panel.watchlistTabId === tab.id && !panel.watchlistSectionId;
                                        return (
                                          <div key={tab.id} className="border-b border-[#1e1e1e] last:border-b-0">
                                            <div
                                              className={`group flex items-center gap-1 px-1.5 py-1 ${
                                                tabSelected ? 'bg-emerald-950/60 text-emerald-200' : 'hover:bg-[#171717]'
                                              }`}
                                            >
                                              <button
                                                type="button"
                                                onClick={() => handleSelectWatchlistTargetForPanel(
                                                  panel.id,
                                                  encodeWatchlistTargetValue(tab.id),
                                                )}
                                                className="min-w-0 flex-1 text-left"
                                                title={tab.name}
                                              >
                                                <div className="truncate text-[11px] font-bold text-white">{tab.name}</div>
                                                <div className="truncate text-[9px] text-gray-500">Sector全体</div>
                                              </button>
                                              <span className="w-9 shrink-0 text-right font-mono text-[9px] text-emerald-300">
                                                {tabSymbols.length}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={(event) => handleDeleteWatchlistTargetFromMenu(event, tab.id)}
                                                disabled={watchlistTabs.length <= 1}
                                                className="h-5 w-5 shrink-0 flex items-center justify-center rounded text-gray-600 opacity-0 transition group-hover:opacity-100 hover:bg-red-950/70 hover:text-red-200 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-gray-600"
                                                title="Sectorを削除"
                                                aria-label={`${tab.name}を削除`}
                                              >
                                                <X className="w-3 h-3" />
                                              </button>
                                            </div>
                                            {tab.sections.map((section) => {
                                              const sectionSelected =
                                                panel.watchlistTabId === tab.id
                                                && panel.watchlistSectionId === section.id;
                                              return (
                                                <div
                                                  key={section.id}
                                                  className={`group flex items-center gap-1 px-1.5 py-1 pl-5 ${
                                                    sectionSelected ? 'bg-emerald-950/45 text-emerald-200' : 'hover:bg-[#141414]'
                                                  }`}
                                                >
                                                  <button
                                                    type="button"
                                                    onClick={() => handleSelectWatchlistTargetForPanel(
                                                      panel.id,
                                                      encodeWatchlistTargetValue(tab.id, section.id),
                                                    )}
                                                    className="min-w-0 flex-1 text-left"
                                                    title={`${tab.name} / ${section.name}`}
                                                  >
                                                    <div className="truncate text-[10px] font-bold text-gray-100">{section.name}</div>
                                                    <div className="truncate text-[9px] text-gray-600">{tab.name}</div>
                                                  </button>
                                                  <span className="w-9 shrink-0 text-right font-mono text-[9px] text-gray-400">
                                                    {section.symbols.length}
                                                  </span>
                                                  <button
                                                    type="button"
                                                    onClick={(event) => handleDeleteWatchlistTargetFromMenu(event, tab.id, section.id)}
                                                    className="h-5 w-5 shrink-0 flex items-center justify-center rounded text-gray-600 opacity-0 transition group-hover:opacity-100 hover:bg-red-950/70 hover:text-red-200"
                                                    title="Basketを削除"
                                                    aria-label={`${section.name}を削除`}
                                                  >
                                                    <X className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>

                                {/* ACTIVE OVERLAYS BADGES */}
                                {false && panel.comparisonSymbols && panel.comparisonSymbols.length > 0 && (
                                  <div className="flex items-center space-x-1 pl-1.5 border-l border-[#242424] shrink-0">
                                    {panel.comparisonSymbols.map((compSym, idx) => {
                                      const color = getSeriesColor(compSym, idx);
                                      return (
                                        <span 
                                          key={compSym}
                                          className="inline-flex items-center bg-[#171717]/70 border text-[9px] px-1.5 py-0.5 rounded font-bold font-mono space-x-1 transition shrink-0"
                                          style={{ color, borderColor: `${color}33` }}
                                        >
                                          <span>{compSym}</span>
                                          <button
                                            onClick={() => {
                                              const updatedList = (panel.comparisonSymbols || []).filter(s => s !== compSym);
                                              handleUpdatePanel(panel.id, { comparisonSymbols: updatedList });
                                            }}
                                            className="hover:text-red-400 transition ml-0.5 cursor-pointer font-bold shrink-0 text-[8px]"
                                            title="この重ね比較を削除"
                                          >
                                            ✕
                                          </button>
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
 
                                {/* TIMEFRAME INTERVAL PICKER */}
                                <div className="flex items-center p-0.5 space-x-0.5">
                                  <div className="relative flex items-center shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleApplyPanelDisplayRange(panel.id, panel.displayRange === 'w' ? 'w' : 'd')}
                                      className={`h-5 min-w-6 px-1.5 text-[10px] rounded-l font-bold transition-colors ${
                                        panel.displayRange === 'd'
                                          ? 'bg-emerald-500 text-black'
                                          : panel.displayRange === 'w'
                                            ? 'bg-[#202020] text-emerald-300'
                                            : 'text-gray-300 hover:text-white hover:bg-[#111111]'
                                      }`}
                                      title="今日の取引時間を表示"
                                    >
                                      {panel.displayRange === 'w' ? 'W' : 'D'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        const rect = event.currentTarget.getBoundingClientRect();
                                        setDisplayRangeMenu((current) => (
                                          current?.panelId === panel.id
                                            ? null
                                            : {
                                                panelId: panel.id,
                                                x: Math.min(rect.left, Math.max(8, window.innerWidth - 116)),
                                                y: rect.bottom + 4,
                                              }
                                        ));
                                      }}
                                      className={`h-5 w-5 rounded-r border-l border-black/30 flex items-center justify-center transition-colors ${
                                        panel.displayRange
                                          ? 'bg-emerald-500 text-black'
                                          : 'text-gray-400 hover:text-white hover:bg-[#111111]'
                                      }`}
                                      title="D/W表示を選択"
                                    >
                                      <ChevronDown className="w-3 h-3" />
                                    </button>
                                    {displayRangeMenu?.panelId === panel.id && (
                                      <div
                                        className="fixed z-[125] w-28 border border-[#343434] bg-[#080808] py-1 text-[10px] text-gray-200 shadow-2xl"
                                        style={{ left: displayRangeMenu.x, top: displayRangeMenu.y }}
                                        onClick={(event) => event.stopPropagation()}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => handleApplyPanelDisplayRange(panel.id, 'd')}
                                          className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left hover:bg-[#171717] ${
                                            panel.displayRange === 'd' ? 'text-emerald-300' : ''
                                          }`}
                                        >
                                          <span className="font-bold">D</span>
                                          <span className="text-[9px] text-gray-500">今日</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleApplyPanelDisplayRange(panel.id, 'w')}
                                          className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left hover:bg-[#171717] ${
                                            panel.displayRange === 'w' ? 'text-emerald-300' : ''
                                          }`}
                                        >
                                          <span className="font-bold">W</span>
                                          <span className="text-[9px] text-gray-500">今週</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleClearPanelDisplayRange(panel.id)}
                                          className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left hover:bg-[#171717] ${
                                            !panel.displayRange ? 'text-emerald-300' : ''
                                          }`}
                                        >
                                          <span className="font-bold">通常</span>
                                          <span className="text-[9px] text-gray-500">時間足</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  {CHART_TIMEFRAME_OPTIONS.map((tf) => (
                                    <button
                                      key={tf}
                                      disabled={Boolean(panel.displayRange)}
                                      onClick={() => handleUpdatePanelTimeframe(panel.id, tf)}
                                      className={`px-1.5 py-0.5 text-[10px] rounded font-bold transition-colors ${
                                        panel.displayRange
                                          ? 'text-gray-600 cursor-not-allowed opacity-45'
                                          : panel.timeframe === tf
                                          ? 'bg-emerald-500 text-black'
                                          : 'text-gray-400 hover:text-white hover:bg-[#111111]'
                                      }`}
                                      title={getChartTimeframeButtonTitle(tf, panelUsesJapanYahooFallback, Boolean(panel.displayRange))}
                                    >
                                      {formatChartTimeframeLabel(tf, panelUsesJapanYahooFallback)}
                                    </button>
                                  ))}
                                </div>

                                {/* ENGINE SELECT SWITCH */}
                                <button
                                  onClick={() => {
                                    if (!panelExpression && !panelComparisonOnly) togglePanelEngine(panel.id);
                                  }}
                                  disabled={Boolean(panelExpression) || panelComparisonOnly}
                                  className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase transition-colors ${
                                    panelExpression || panelComparisonOnly
                                      ? 'bg-[#171717] text-gray-500 border border-[#2a2a2a] cursor-not-allowed'
                                    : isTvEmbed
                                      ? 'bg-purple-950/80 text-purple-300 border border-purple-800' 
                                      : 'bg-emerald-950/80 text-emerald-300 border border-emerald-900'
                                  }`}
                                  title={panelComparisonOnly
                                    ? '指数比較チャートはカスタム線チャートで描画します'
                                    : panelExpression
                                    ? '演算式はカスタムチャートで描画します'
                                    : 'TradingView公式ライブウィジェットとカスタムチャートを切り替えます'}
                                >
                                  {panelComparisonOnly ? '指数比較' : panelExpression ? '演算式' : isTvEmbed ? 'TradingView公式' : 'カスタム' }
                                </button>

                              </div>

                              {/* ACTIONS AND PANEL REMOVAL (MINUS BUTTON) */}
                              <div className="flex items-center space-x-2 shrink-0">
                                {isMobileViewport && panels.length > 1 && (
                                  <span
                                    className="rounded border border-[#303030] bg-[#171717] px-1.5 py-0.5 text-[9px] font-bold text-gray-300"
                                    title="ヘッダーを左右にスワイプしてチャートを切り替え"
                                  >
                                    {activeMobilePanelIndex + 1}/{panels.length}
                                  </span>
                                )}
                                
                                {/* Quick setting indicators toggles */}
                                {false && !isTvEmbed && (
                                  <div className="hidden sm:flex items-center space-x-1.5 bg-[#171717]/70 px-2 py-0.5 rounded text-[10px]">
                                    <button
                                      onClick={() => {
                                        if (!panelExpression) handleUpdatePanel(panel.id, { showVolume: !panel.showVolume });
                                      }}
                                      disabled={Boolean(panelExpression)}
                                      className={`px-1 rounded ${!panelExpression && panel.showVolume ? 'text-[#009b87] font-bold bg-[#142d2a]' : 'text-gray-500'} ${panelExpression ? 'cursor-not-allowed opacity-50' : ''}`}
                                      title="出来高を表示"
                                    >
                                      出来高
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (!panelExpression) handleUpdatePanel(panel.id, { showRsi: !panel.showRsi });
                                      }}
                                      disabled={Boolean(panelExpression)}
                                      className={`px-1 rounded ${!panelExpression && panel.showRsi ? 'text-[#f3a14b] font-bold bg-[#342416]' : 'text-gray-500'} ${panelExpression ? 'cursor-not-allowed opacity-50' : ''}`}
                                      title="RSIサブ画面を表示"
                                    >
                                      RSI
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (!panelExpression) handleUpdatePanel(panel.id, { showMacd: !panel.showMacd });
                                      }}
                                      disabled={Boolean(panelExpression)}
                                      className={`px-1 rounded ${!panelExpression && panel.showMacd ? 'text-emerald-400 font-bold bg-[#0f2a22]' : 'text-gray-500'} ${panelExpression ? 'cursor-not-allowed opacity-50' : ''}`}
                                      title="MACDサブ画面を表示"
                                    >
                                      MACD
                                    </button>
                                  </div>
                                )}

                                {/* PLUS BUTTON - OVERLAY MULTIPLE COMPARISONS */}
                                {!isTvEmbed && (
                                  <button
                                    onClick={() => {
                                      if (selectedComparisonCandidates.length > 0) {
                                        addSymbolsToPanelFromDrop(panel, selectedSymbols);
                                        return;
                                      }
                                      setActiveComparisonPopoverPanelId(activeComparisonPopoverPanelId === panel.id ? null : panel.id);
                                    }}
                                    className={`p-1.5 hover:bg-[#202020] rounded text-gray-400 hover:text-white transition cursor-pointer flex items-center justify-center ${activeComparisonPopoverPanelId === panel.id ? 'text-emerald-400 bg-[#171717] border border-emerald-500/30' : ''}`}
                                    title={selectedComparisonCandidates.length > 0
                                      ? `選択中の${selectedComparisonCandidates.length}銘柄を比較追加`
                                      : 'このチャート内に他銘柄を比較追加する (+)'}
                                  >
                                    <Plus className="w-3.5 h-3.5 stroke-[2.8]" />
                                  </button>
                                )}

                                {/* MINUS BUTTON - REMOVE PANEL */}
                                <button
                                  onClick={() => handleRemoveChartPanel(panel.id)}
                                  disabled={panels.length <= 1}
                                  id={`btn-remove-panel-${panel.id}`}
                                  className="w-5 h-5 bg-red-950 hover:bg-red-900 text-red-200 border border-red-800 disabled:opacity-20 disabled:cursor-not-allowed rounded flex items-center justify-center font-bold font-mono transition-colors"
                                  title="このチャートをグリッドから削除します (-)"
                                >
                                  ー
                                </button>

                              </div>
                            </div>

                            {/* Rendering workspace */}
                            <div
                              className="flex-1 flex flex-col min-h-0 bg-[#090909]"
                            >
                              {isTvEmbed ? (
                                <TradingViewWidget 
                                  symbol={panelSymbol}
                                  timeframe={panel.timeframe} 
                                  containerId={panel.id} 
                                  height={panelHeights[panel.id] ?? DEFAULT_PANEL_HEIGHT}
                                />
                              ) : (
                                <InteractiveCustomChart 
                                  symbol={chartAnchorSymbol}
                                  candles={pCandles}
                                  timeframe={panel.timeframe}
                                  indicatorSettings={pSettings}
                                  zoomFactor={panel.zoomFactor}
                                  setZoomFactor={(zf) => handleUpdatePanel(panel.id, { zoomFactor: zf })}
                                  scrollOffsetPct={panel.scrollOffsetPct}
                                  setScrollOffsetPct={(offset) => handleUpdatePanel(panel.id, { scrollOffsetPct: offset })}
                                  showVolume={!panelExpression && !panelComparisonOnly && panel.showVolume}
                                  showRsi={!panelExpression && !panelComparisonOnly && panel.showRsi}
                                  showMacd={!panelExpression && !panelComparisonOnly && panel.showMacd}
                                  showPrimaryCandles={panelShowPrimaryCandles}
                                  comparisonSymbols={panelComparisonSymbols}
                                  comparisonOnly={panelComparisonOnly}
                                  comparisonLabelFontSize={comparisonLabelFontSize}
                                  onComparisonLabelFontSizeChange={updateComparisonLabelFontSize}
                                  comparisonLabelLayoutMode={comparisonLabelLayoutMode}
                                  onComparisonLabelLayoutModeChange={updateComparisonLabelLayoutMode}
                                  comparisonLabelRankSpacingScale={panel.comparisonLabelRankSpacingScale ?? 1}
                                  onComparisonLabelRankSpacingScaleChange={(comparisonLabelRankSpacingScale) =>
                                    handleUpdatePanel(panel.id, { comparisonLabelRankSpacingScale })
                                  }
                                  symbolDisplayNames={createChartSymbolDisplayNames(chartDisplaySymbols)}
                                  changePctOverrides={chartDailyChangeOverrides}
                                  comparisonCandles={panelComparisonCandles}
                                  emptyMessage={panelIsEmpty
                                    ? panelComparisonOnly
                                      ? '指数・バスケットをここへドロップ'
                                      : '銘柄・バスケットをここへドロップ'
                                    : panelComparisonOnly
                                      ? pCandleError ?? '比較用データを取得中...'
                                      : pCandleError ?? (moomooRealTimeActive ? 'Moomoo実データを取得中...' : 'デモデータを生成中...')}
                                  priceScale={panel.priceScale ?? 1}
                                  setPriceScale={(scale) => handleUpdatePanel(panel.id, { priceScale: scale })}
                                  priceOffsetPct={panel.priceOffsetPct ?? 0}
                                  setPriceOffsetPct={(offset) => handleUpdatePanel(panel.id, { priceOffsetPct: offset })}
                                  rsiHeightPct={panel.rsiHeightPct ?? 25}
                                  setRsiHeightPct={(pct) => handleUpdatePanel(panel.id, { rsiHeightPct: pct })}
                                  macdHeightPct={panel.macdHeightPct ?? 25}
                                  setMacdHeightPct={(pct) => handleUpdatePanel(panel.id, { macdHeightPct: pct })}
                                  onOpenIndicatorSettings={panelIsEmpty || panelComparisonOnly ? undefined : () => openIndicatorSettingsForSymbol(panelSymbol)}
                                  onRemoveComparisonSymbol={(symbol) => {
                                    handleUpdatePanel(panel.id, {
                                      comparisonSymbols: panelComparisonSymbols.filter((item) => item !== symbol),
                                    });
                                  }}
                                  onToggleVolume={!panelExpression && !panelComparisonOnly ? () => handleUpdatePanel(panel.id, { showVolume: !panel.showVolume }) : undefined}
                                  onToggleRsi={!panelExpression && !panelComparisonOnly ? () => handleUpdatePanel(panel.id, { showRsi: !panel.showRsi }) : undefined}
                                  onToggleMacd={!panelExpression && !panelComparisonOnly ? () => handleUpdatePanel(panel.id, { showMacd: !panel.showMacd }) : undefined}
                                  onTogglePrimaryCandles={!panelComparisonOnly ? () => handleUpdatePanel(panel.id, { showPrimaryCandles: panelShowPrimaryCandles ? false : undefined }) : undefined}
                                  allowNegativeValues={Boolean(panelExpression)}
                                  valuePrecision={panelExpression ? 4 : 2}
                                  exportPlaybackProgress={
                                    chartExportPlayback?.panelIds.includes(panel.id)
                                      ? chartExportPlayback.progress
                                      : null
                                  }
                                />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Drag splitter to change absolute height for every panel */}
                        <div
                          className="hidden h-1.5 bg-[#191919]/80 hover:bg-emerald-500 active:bg-emerald-600 cursor-row-resize transition-colors shrink-0 self-stretch mt-1 mb-2.5 rounded md:block"
                          onMouseDown={(e) => handlePanelHeightResizeMouseDown(e, panel.id)}
                          title="上下にドラッグして高さを変更"
                        />
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Drag splitter between adjacent column groups */}
                {!isMobileViewport && colIdx < visibleColGroups.length - 1 && (
                  <div
                    className="w-1.5 bg-[#191919]/80 hover:bg-emerald-500 active:bg-emerald-600 cursor-col-resize transition-colors shrink-0 self-stretch mx-1 rounded"
                    onMouseDown={(e) => handleColResizeMouseDown(e, colIdx, colIdx + 1)}
                    title="左右にドラッグしてサイズ変更"
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
        )}

        {sidebarOpen && !isMobileViewport && (
          <div
            className="w-1.5 bg-[#191919]/80 hover:bg-emerald-500 active:bg-emerald-600 cursor-col-resize transition-colors shrink-0 self-stretch"
            onMouseDown={handleSidebarResizeMouseDown}
            title="左右にドラッグしてサイドパネル幅を変更"
          />
        )}

        {isMobileViewport && mobileSheetView && (
          <button
            type="button"
            className="fixed inset-x-0 top-0 z-[80] bg-black/55 md:hidden"
            style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
            onClick={() => setMobileSheetView(null)}
            aria-label="下部パネルを閉じる"
          />
        )}

        {/* PC右サイドバー／スマホ下部ボトムシート */}
        <div
          data-mobile-bottom-sheet={isMobileViewport ? mobileSheetView ?? 'closed' : undefined}
          className={`bg-[#080808] flex overflow-hidden ease-out ${
            isMobileViewport
              ? `fixed inset-x-0 z-[90] rounded-t-2xl border-t border-[#343434] shadow-[0_-18px_50px_rgba(0,0,0,0.65)] transition-transform duration-300 ${
                  mobileSheetView ? 'translate-y-0' : 'translate-y-full pointer-events-none'
                }`
              : 'shrink-0 border-l border-[#202020] transition-[width] duration-150'
          }`}
          style={isMobileViewport
            ? {
                bottom: 'calc(4rem + env(safe-area-inset-bottom))',
                height: 'min(76dvh, 720px)',
                width: '100%',
              }
            : { width: sidebarOpen ? `${sidebarWidth + SIDEBAR_NAV_WIDTH}px` : `${SIDEBAR_NAV_WIDTH}px` }}
          aria-hidden={isMobileViewport ? !mobileSheetView : undefined}
        >
          <div
            className={`min-w-0 flex flex-col overflow-hidden ease-out ${
              isMobileViewport
                ? 'w-full'
                : `transition-[width] duration-150 ${sidebarOpen ? '' : 'pointer-events-none'}`
            }`}
            style={isMobileViewport
              ? { width: '100%' }
              : { width: sidebarOpen ? `${sidebarWidth}px` : '0px' }}
          >

          {isMobileViewport && (
            <div className="relative flex h-11 shrink-0 items-center justify-center border-b border-[#242424] bg-[#0b0b0b] px-12">
              <span className="absolute top-1.5 h-1 w-10 rounded-full bg-gray-600" />
              <span className="mt-1 truncate text-xs font-bold text-gray-100">
                {mobileSheetView === 'watchlist'
                  ? 'ウォッチリスト'
                  : mobileSheetView === 'indicators'
                    ? 'インジケーター設定'
                    : mobileSheetView === 'settings'
                      ? '接続・保存設定'
                      : mobileSheetView === 'disclosures'
                        ? '企業開示DB・通知設定'
                        : mobileSheetView === 'image-export'
                          ? 'チャート画像'
                          : 'チャート動画'}
              </span>
              <button
                type="button"
                onClick={() => setMobileSheetView(null)}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-[#202020] hover:text-white"
                aria-label="下部パネルを閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* 1. LAYOUT SCREEN SUBDIVISION CONFIG */}
          <div className={`shrink-0 p-2 border-b border-[#242424] relative ${isMobileViewport ? 'hidden' : ''}`}>
            <div className="mb-1 flex items-center justify-between gap-2 px-1 text-[10px] font-bold">
              <span
                className={`min-w-0 truncate ${
                  quoteFetchInFlight || manualChartRefreshInFlight ? 'text-cyan-300' : 'text-gray-500'
                }`}
                title={activeWatchlistQuoteProgress.title}
              >
                {manualChartRefreshInFlight
                  ? '表示チャートと価格を更新中'
                  : quoteFetchInFlight
                  ? `${activeWatchlistQuoteProgress.scopeLabel} を更新中`
                  : ''}
              </span>
              <div className="shrink-0 flex items-center gap-1">
                <span
                  className={`font-mono ${
                    activeWatchlistQuoteProgress.status === 'done'
                      ? 'text-emerald-400'
                      : activeWatchlistQuoteProgress.status === 'loading'
                        ? 'text-cyan-300'
                        : activeWatchlistQuoteProgress.status === 'stale'
                          ? 'text-amber-300'
                          : activeWatchlistQuoteProgress.status === 'partial'
                            ? 'text-orange-300'
                            : activeWatchlistQuoteProgress.status === 'error'
                              ? 'text-red-300'
                          : 'text-gray-600'
                  }`}
                  title={activeWatchlistQuoteProgress.title}
                >
                  {activeWatchlistQuoteProgress.text}
                </span>
                <button
                  type="button"
                  onClick={handleRefreshWatchlistQuotes}
                  className={`h-4 px-1.5 border text-[10px] leading-none font-bold transition ${
                    quoteFetchInFlight || manualChartRefreshInFlight
                      ? 'border-cyan-700 bg-cyan-950/50 text-cyan-200'
                      : 'border-[#303030] bg-[#101010] text-gray-300 hover:text-white hover:border-emerald-500 hover:bg-emerald-950/40'
                  }`}
                  title="表示中チャートのKLineと選択中ウォッチリストの価格を強制再取得"
                >
                  {manualChartRefreshInFlight ? 'チャート更新中' : quoteFetchInFlight ? '更新中' : '更新'}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 bg-[#080808] p-1 border border-[#242424]">
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setGridPickerOpen((v) => !v); }}
                  className={`w-full h-9 flex items-center justify-center transition-all cursor-pointer ${
                    layoutStyle === 'grid' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white hover:bg-[#171717]'
                  }`}
                  title={`グリッド選択 (${gridRows}×${gridCols})`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                {gridPickerOpen && (
                  <div
                    className="absolute left-0 top-10 z-50 bg-[#0b0b0b] border border-[#343434] p-3 rounded-lg shadow-2xl w-56"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-[10px] text-gray-400 font-bold mb-2 flex justify-between items-center">
                      <span>グリッドレイアウト選択</span>
                      <span className="text-emerald-400 font-mono text-xs">{gridRows} × {gridCols}</span>
                    </div>
                    {/* Interactive 9x9 grid selector */}
                    <div className="grid grid-cols-9 gap-0.5 bg-[#050505] p-1.5 border border-[#242424] rounded">
                      {Array.from({ length: 9 }).map((_, rIdx) => {
                        const r = rIdx + 1;
                        return Array.from({ length: 9 }).map((__, cIdx) => {
                          const c = cIdx + 1;
                          const isHighlighted = r <= gridRows && c <= gridCols;
                          return (
                            <div
                              key={`${r}-${c}`}
                              onMouseEnter={() => {
                                setGridRows(r);
                                setGridCols(c);
                              }}
                              onClick={(e) => { e.stopPropagation(); handleSelectCustomGrid(r, c); }}
                              className={`w-5 h-5 aspect-square border transition-all cursor-pointer rounded-sm ${
                                isHighlighted
                                  ? 'bg-emerald-600 border-emerald-400'
                                  : 'bg-[#151515] border-[#2a2a2a] hover:bg-gray-700'
                              }`}
                              title={`${r}行 × ${c}列`}
                            />
                          );
                        });
                      })}
                    </div>
                    <div className="text-[9px] text-gray-500 mt-2 text-center leading-tight">
                      ホバーでサイズ確認 → クリックで適用 (最大 9×9)
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => setLayoutStyle('columns')}
                className={`h-9 flex items-center justify-center transition-all cursor-pointer ${layoutStyle === 'columns' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white hover:bg-[#171717]'}`}
                title="左右並列"
              >
                <Columns2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setLayoutStyle('rows')}
                className={`h-9 flex items-center justify-center transition-all cursor-pointer ${layoutStyle === 'rows' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white hover:bg-[#171717]'}`}
                title="上下分割"
              >
                <Rows2 className="w-4 h-4" />
              </button>
              <button
                onClick={handleAddChartPanel}
                disabled={panels.length >= gridRows * gridCols}
                id="btn-add-chart-panel"
                className="h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#171717] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                title="チャートを追加"
                aria-label="チャートを追加"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 2. TRADINGVIEW-LIKE WATCHLIST */}
          {(!isMobileViewport || mobileSheetView === 'watchlist') && sidebarView === 'watchlist' && (
          <div
            className="flex-1 min-h-0 bg-[#0b0b0b] overflow-hidden flex flex-col relative"
            onContextMenu={openWatchlistEmptyMenu}
          >
            <div className="h-8 shrink-0 border-b border-[#242424] bg-[#080808] flex items-center gap-1 px-1 overflow-visible relative">
              <button
                type="button"
                onClick={handleJumpToFirstWatchlistTab}
                disabled={!canJumpToFirstWatchlistTab}
                className={`w-6 h-7 border border-b-0 border-[#202020] flex items-center justify-center transition-colors ${
                  canJumpToFirstWatchlistTab
                    ? 'text-gray-400 hover:text-white hover:bg-[#171717] cursor-pointer'
                    : 'text-gray-700 opacity-50 cursor-not-allowed'
                }`}
                aria-label="最初のウォッチリストタブへ移動"
                title="最初のタブへ"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>

              <div
                ref={watchlistTabsViewportRef}
                className="flex-1 min-w-0 h-full overflow-x-auto overflow-y-hidden scroll-smooth scrollbar-none"
                style={{ scrollbarWidth: 'none' }}
              >
              <div className="flex items-end gap-0.5 h-full min-w-max pr-1.5">
                {watchlistTabs.map((tab) => {
                  const active = tab.id === activeWatchlistTabId;
                  const tabFetchMode = getWatchlistQuoteFetchMode(watchlistQuoteFetchModes, tab.id);
                  const isAutoFetchTab = tabFetchMode === 'auto';
                  const tabToneClass = active
                    ? isAutoFetchTab
                      ? 'bg-emerald-800/90 border-emerald-400 text-white font-bold shadow-[inset_0_2px_0_rgba(16,185,129,0.85)]'
                      : 'bg-[#0b0b0b] border-[#343434] text-white font-bold'
                    : isAutoFetchTab
                      ? 'bg-emerald-950/70 border-emerald-700 text-emerald-100 hover:bg-emerald-900/80 hover:text-white'
                      : 'bg-[#070707] border-[#202020] text-gray-500 hover:text-gray-200';
                  return (
                    <div
                      key={tab.id}
                      data-watchlist-menu-target="tab"
                      data-watchlist-tab-id={tab.id}
                      ref={(element) => {
                        watchlistTabRefs.current[tab.id] = element;
                      }}
                      draggable={false}
                      className={`h-7 shrink-0 min-w-[44px] max-w-28 px-2 border border-b-0 flex items-center transition-all cursor-grab active:cursor-grabbing ${tabToneClass} ${
                        draggedWatchlistTabId === tab.id ? 'opacity-45' : ''
                      }`}
                      style={{ width: 'auto' }}
                      onDoubleClick={() => setEditingTabId(tab.id)}
                      onContextMenu={(event) => handleWatchlistTabContextMenu(event, tab.id)}
                      onPointerDown={(event) => handleWatchlistTabPointerDown(event, tab.id)}
                      onDragStart={(event) => handleWatchlistTabDragStart(event, tab)}
                      onDragEnd={() => setDraggedWatchlistTabId(null)}
                      onDragOver={(event) => handleWatchlistTabDragOver(event, tab.id)}
                      onDrop={(event) => handleWatchlistTabDrop(event, tab.id, 'x')}
                    >
                      {editingTabId === tab.id ? (
                        <input
                          value={tab.name}
                          onChange={(event) => handleRenameWatchlistTab(tab.id, event.target.value)}
                          onBlur={() => setEditingTabId(null)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                          }}
                          className="w-16 bg-[#121212] border border-emerald-500 text-[10px] px-1 outline-none text-white"
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          draggable={false}
                          onDragStart={(event) => {
                            event.stopPropagation();
                            handleWatchlistTabDragStart(event, tab);
                          }}
                          onDragEnd={() => setDraggedWatchlistTabId(null)}
                          onDragOver={(event) => handleWatchlistTabDragOver(event, tab.id)}
                          onDrop={(event) => handleWatchlistTabDrop(event, tab.id, 'x')}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            handleWatchlistTabPointerDown(event, tab.id);
                          }}
                          onClick={(event) => {
                            if (watchlistTabSuppressClickRef.current) {
                              event.preventDefault();
                              return;
                            }
                            selectWatchlistTab(tab.id);
                          }}
                          className="w-full min-w-0 text-[10px] text-left truncate cursor-pointer"
                          title={`${tab.name} / ${tabFetchMode === 'auto' ? '自動取得' : '手動取得'}`}
                        >
                          {tab.name}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>

              <button
                type="button"
                onClick={handleJumpToLastWatchlistTab}
                disabled={!canJumpToLastWatchlistTab}
                className={`w-6 h-7 border border-b-0 border-[#1e2232] flex items-center justify-center transition-colors ${
                  canJumpToLastWatchlistTab
                    ? 'text-gray-400 hover:text-white hover:bg-[#171717] cursor-pointer'
                    : 'text-gray-700 opacity-50 cursor-not-allowed'
                }`}
                aria-label="最後のウォッチリストタブへ移動"
                title="最後のタブへ"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-1 z-20 shrink-0">
                {/* Watchlist Tabs Dropdown Trigger - stateトグル式 */}
                {watchlistTabs.length > 2 && (
                  <div className="relative">
                    <button
                      type="button"
                      onMouseDown={toggleTabsDropdown}
                      onClick={(event) => event.stopPropagation()}
                      className={`w-7 h-7 border border-b-0 border-[#1e2232] flex items-center justify-center cursor-pointer transition-colors ${
                        tabsDropdownOpen ? 'text-white bg-[#171717]' : 'text-gray-400 hover:text-white hover:bg-[#171717]'
                      }`}
                      title="ウォッチリスト一覧"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${tabsDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {tabsDropdownOpen && (
                      <div
                        className="fixed bg-[#080808] border border-[#343434] py-1 shadow-2xl z-50 max-h-[62vh] overflow-y-auto"
                        style={{
                          left: tabsDropdownAnchor?.x ?? 8,
                          top: tabsDropdownAnchor?.y ?? 48,
                          width: tabsDropdownAnchor?.width ?? 192,
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onContextMenu={(event) => event.stopPropagation()}
                      >
                        {watchlistTabs.map((t) => {
                          const active = t.id === activeWatchlistTabId;
                          const tabFetchMode = getWatchlistQuoteFetchMode(watchlistQuoteFetchModes, t.id);
                          const isAutoFetchTab = tabFetchMode === 'auto';
                          const dropdownToneClass = active
                            ? isAutoFetchTab
                              ? 'text-white font-bold bg-emerald-800/80'
                              : 'text-emerald-400 font-bold bg-[#10251f]'
                            : isAutoFetchTab
                              ? 'text-emerald-100 bg-emerald-950/60 hover:bg-emerald-900/70'
                              : 'text-gray-300 hover:bg-[#171717]';
                          return (
                            <button
                              key={t.id}
                              type="button"
                              draggable
                              onDragStart={(event) => handleWatchlistTabDragStart(event, t)}
                              onDragEnd={() => setDraggedWatchlistTabId(null)}
                              onDragOver={(event) => handleWatchlistTabDragOver(event, t.id)}
                              onDrop={(event) => handleWatchlistTabDrop(event, t.id, 'y')}
                              onContextMenu={(event) => handleWatchlistTabContextMenu(event, t.id)}
                              onClick={() => {
                                selectWatchlistTab(t.id);
                                setTabsDropdownOpen(false);
                                setTabsDropdownAnchor(null);
                              }}
                              className={`w-full text-left px-2.5 py-1.5 text-[10px] truncate cursor-grab active:cursor-grabbing block ${dropdownToneClass} ${
                                draggedWatchlistTabId === t.id ? 'opacity-45' : ''
                              }`}
                              title={`${t.name} / ${tabFetchMode === 'auto' ? '自動取得' : '手動取得'}`}
                            >
                              {t.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                
                <button
                  type="button"
                  onClick={handleAddWatchlistTab}
                  className="w-7 h-7 border border-b-0 border-[#202020] text-gray-400 hover:text-white hover:bg-[#171717] flex items-center justify-center cursor-pointer"
                  aria-label="ウォッチリストタブを追加"
                  title="タブを追加"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      watchlistImportModeRef.current = 'new-tab';
                      setWatchlistImportMode('new-tab');
                      setWatchlistTransferMenuLayer('root');
                      setWatchlistImportMenuOpen((open) => !open);
                    }}
                    disabled={watchlistImporting}
                    className="w-7 h-7 border border-b-0 border-[#202020] text-gray-400 hover:text-white hover:bg-[#171717] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer"
                    aria-label="ウォッチリストのインポートとエクスポート"
                    title={watchlistImporting ? 'CSVをインポート中' : 'インポート／エクスポート'}
                  >
                    <ArrowUpDown className={`w-3.5 h-3.5 ${watchlistImporting ? 'animate-spin text-emerald-300' : ''}`} />
                  </button>
                  {watchlistImportMenuOpen && !watchlistImporting && (
                    <div
                      className="absolute right-0 top-full z-50 w-64 bg-[#080808] border border-[#343434] py-1 shadow-2xl text-[10px] text-gray-200"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {watchlistTransferMenuLayer === 'root' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setWatchlistTransferMenuLayer('import')}
                            className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717]"
                          >
                            <Upload className="w-3.5 h-3.5 text-emerald-300" />
                            <span className="flex-1 text-left">インポート</span>
                            <ChevronRight className="w-3 h-3 text-gray-500" />
                          </button>
                          <button
                            type="button"
                            onClick={beginWatchlistExport}
                            className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717]"
                          >
                            <Download className="w-3.5 h-3.5 text-cyan-300" />
                            <span className="flex-1 text-left">エクスポート</span>
                            <ChevronRight className="w-3 h-3 text-gray-500" />
                          </button>
                        </>
                      )}

                      {watchlistTransferMenuLayer === 'import' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setWatchlistTransferMenuLayer('root')}
                            className="w-full px-2.5 py-1.5 flex items-center gap-1.5 text-gray-400 hover:text-white hover:bg-[#171717] border-b border-[#242424]"
                          >
                            <ChevronRight className="w-3 h-3 rotate-180" />
                            <span>インポート方法</span>
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              beginWatchlistImport('new-tab');
                            }}
                            className={`w-full px-2.5 py-1.5 text-left hover:bg-[#171717] ${watchlistImportMode === 'new-tab' ? 'text-emerald-300 bg-[#10251f]' : ''}`}
                          >
                            新規タブへ追加
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              beginWatchlistImport('active-tab');
                            }}
                            className={`w-full px-2.5 py-1.5 text-left hover:bg-[#171717] ${watchlistImportMode === 'active-tab' ? 'text-emerald-300 bg-[#10251f]' : ''}`}
                          >
                            アクティブなウォッチリストへ追加
                          </button>
                        </>
                      )}

                      {watchlistTransferMenuLayer === 'export' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setWatchlistTransferMenuLayer('root')}
                            className="w-full px-2.5 py-1.5 flex items-center gap-1.5 text-gray-400 hover:text-white hover:bg-[#171717] border-b border-[#242424]"
                          >
                            <ChevronRight className="w-3 h-3 rotate-180" />
                            <span className="flex-1 text-left">エクスポートするタブ</span>
                            <span className="text-[9px] text-cyan-300">
                              {selectedWatchlistExportTabIds.length}件
                            </span>
                          </button>
                          <div className="flex items-center gap-1 px-2 py-1 border-b border-[#242424]">
                            <button
                              type="button"
                              onClick={() => setSelectedWatchlistExportTabIds(watchlistTabs.map((tab) => tab.id))}
                              className="px-1.5 py-0.5 text-[9px] text-gray-300 border border-[#303030] hover:bg-[#171717]"
                            >
                              すべて選択
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedWatchlistExportTabIds([])}
                              className="px-1.5 py-0.5 text-[9px] text-gray-500 border border-[#303030] hover:text-gray-200 hover:bg-[#171717]"
                            >
                              選択解除
                            </button>
                          </div>
                          <div className="max-h-52 overflow-y-auto py-1">
                            {watchlistTabs.map((tab) => {
                              const selected = selectedWatchlistExportTabIds.includes(tab.id);
                              const symbolCount = getWatchlistTabSymbols(tab).length;
                              return (
                                <button
                                  key={tab.id}
                                  type="button"
                                  onClick={() => toggleWatchlistExportTab(tab.id)}
                                  className={`w-full px-2.5 py-1.5 flex items-center gap-2 text-left hover:bg-[#171717] ${
                                    selected ? 'text-cyan-200 bg-cyan-950/25' : 'text-gray-300'
                                  }`}
                                >
                                  <span
                                    className={`w-3.5 h-3.5 shrink-0 border flex items-center justify-center text-[9px] ${
                                      selected
                                        ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                                        : 'border-[#4a4a4a] text-transparent'
                                    }`}
                                    aria-hidden="true"
                                  >
                                    ✓
                                  </span>
                                  <span className="flex-1 truncate">{tab.name}</span>
                                  <span className="text-[9px] text-gray-500">{symbolCount}銘柄</span>
                                </button>
                              );
                            })}
                          </div>
                          <div className="px-2 pt-1.5 pb-1 border-t border-[#242424]">
                            <button
                              type="button"
                              onClick={handleExportSelectedWatchlistTabs}
                              disabled={selectedWatchlistExportTabIds.length === 0}
                              className="w-full px-2 py-1.5 flex items-center justify-center gap-1.5 bg-cyan-900/40 text-cyan-100 border border-cyan-800/60 hover:bg-cyan-800/50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Download className="w-3.5 h-3.5" />
                              選択したタブをCSV出力
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <input
                  ref={csvImportInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  className="hidden"
                  onChange={handleImportWatchlistCsv}
                />
              </div>
            </div>

            {watchlistTabMenu && (
              <div
                className="fixed z-50 w-56 bg-[#080808] border border-[#343434] shadow-2xl py-1 text-[10px] text-gray-200"
                style={{ left: watchlistTabMenu.x, top: watchlistTabMenu.y }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => handleRefreshWatchlistTabData(watchlistTabMenu.tabId)}
                  className="w-full px-2.5 py-1.5 text-left text-emerald-200 hover:bg-emerald-950/40"
                >
                  このタブの価格・チャートを強制更新
                </button>
                <div className="my-1 h-px bg-[#242424]" />
                <button
                  type="button"
                  onClick={() => toggleWatchlistTabQuoteFetchMode(watchlistTabMenu.tabId)}
                  className="w-full px-2.5 py-1.5 text-left hover:bg-[#171717] text-cyan-200"
                >
                  {watchlistTabMenuFetchMode === 'auto' ? '手動取得に切り替え' : '自動取得に切り替え'}
                </button>
                <div className="my-1 h-px bg-[#242424]" />
                <button
                  type="button"
                  onClick={() => {
                    selectWatchlistTab(watchlistTabMenu.tabId);
                    setEditingTabId(watchlistTabMenu.tabId);
                    setWatchlistTabMenu(null);
                  }}
                  className="w-full px-2.5 py-1.5 text-left hover:bg-[#171717]"
                >
                  名称変更
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDeleteWatchlistTab(watchlistTabMenu.tabId);
                    setWatchlistTabMenu(null);
                  }}
                  disabled={watchlistTabs.length <= 1}
                  className="w-full px-2.5 py-1.5 text-left text-red-300 hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  タブ削除
                </button>
              </div>
            )}

            {watchlistImportMessage && (
              <div className="shrink-0 px-2 py-1 border-b border-[#242424] bg-[#0d0d0d] text-[10px] text-gray-400 truncate">
                {watchlistImportMessage}
              </div>
            )}

            <div className="w-full min-w-0">
              <div
                className="grid w-full items-center h-8 px-2 border-b border-[#242424] text-[10px] text-gray-500"
                style={{ gridTemplateColumns: watchlistGridTemplate }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setWatchlistHeaderMenu({ x: event.clientX, y: event.clientY });
                }}
              >
                <span className="relative h-full flex items-center">
                  <button
                    type="button"
                    onClick={() => cycleWatchlistSort('symbol')}
                    className="w-full text-left hover:text-gray-200"
                  >
                    コード <span className="text-[8px] text-emerald-300">{getSortIndicator('symbol')}</span>
                  </button>
                  <span
                    className="absolute right-[-4px] top-0 w-2 h-full cursor-col-resize hover:bg-emerald-500/50"
                    onMouseDown={(event) => handleWatchlistColumnResizeMouseDown(
                      event,
                      'symbol',
                      watchlistLayout.showName ? 'name' : 'change',
                    )}
                  />
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTickerSearchOpen((open) => !open);
                    setTickerSearchError(null);
                    setTickerSearchCandidates([]);
                  }}
                  className="w-6 h-6 hover:bg-emerald-950/40 text-emerald-400 hover:text-emerald-300 flex items-center justify-center transition"
                  aria-label="銘柄を追加"
                  title="銘柄を追加"
                >
                  {tickerSearchOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-4 h-4" />}
                </button>
                {watchlistLayout.showName && (
                  <span className="relative h-full flex items-center">
                    <span className="w-full truncate">銘柄名</span>
                    <span
                      className="absolute right-[-4px] top-0 w-2 h-full cursor-col-resize hover:bg-emerald-500/50"
                      onMouseDown={(event) => handleWatchlistColumnResizeMouseDown(event, 'name', 'change')}
                    />
                  </span>
                )}
                <span className="relative h-full flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => cycleWatchlistSort('change')}
                    className="w-full h-full text-right hover:text-gray-200"
                  >
                    変動率 <span className="text-[8px] text-emerald-300">{getSortIndicator('change')}</span>
                  </button>
                  {watchlistLayout.showPrice && (
                    <span
                      className="absolute right-[-4px] top-0 w-2 h-full cursor-col-resize hover:bg-emerald-500/50"
                      onMouseDown={(event) => handleWatchlistColumnResizeMouseDown(event, 'change', 'price')}
                    />
                  )}
                </span>
                {watchlistLayout.showPrice && (
                  <button
                    type="button"
                    onClick={() => cycleWatchlistSort('price')}
                    className="h-full text-right hover:text-gray-200"
                  >
                    現在値 <span className="text-[8px] text-emerald-300">{getSortIndicator('price')}</span>
                  </button>
                )}
                <span aria-hidden="true" />
              </div>
            </div>

            {watchlistHeaderMenu && (
              <div
                className="fixed z-50 w-40 bg-[#080808] border border-[#343434] shadow-2xl py-1 text-[10px] text-gray-200"
                style={{ left: watchlistHeaderMenu.x, top: watchlistHeaderMenu.y }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowWatchlistNameColumn((visible) => !visible);
                    setWatchlistHeaderMenu(null);
                  }}
                  className="w-full px-2.5 py-1.5 text-left hover:bg-[#171717]"
                >
                  {showWatchlistNameColumn ? '銘柄名を非表示' : '銘柄名を表示'}
                </button>
              </div>
            )}

            {tickerSearchOpen && (
              <div className="p-2 border-b border-[#242424] bg-[#080808]">
                <form onSubmit={handleAddTicker} className="flex gap-1.5">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-2 w-3 h-3 text-gray-500" />
                    <input
                      type="text"
                      placeholder="AAPL,MSFT,CRM/SPY"
                      value={newSymbolInput}
                      onChange={(e) => setNewSymbolInput(e.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                        event.preventDefault();
                        void submitTickerInput();
                      }}
                      className="h-7 bg-[#121212] border border-[#303030] text-white text-[10px] pl-7 pr-2 w-full outline-none focus:border-emerald-500 placeholder-gray-600"
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    id="btn-add-ticker"
                    disabled={tickerSearchLoading || !newSymbolInput.trim()}
                    className="h-7 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[10px] px-2 font-bold transition"
                  >
                    {tickerSearchLoading ? '検索中' : '検索'}
                  </button>
                </form>
                <div className="mt-1 text-[9px] text-gray-600">
                  カンマ区切りで複数追加できます。割り算は「CRM/SPY」、引き算は「左辺-右辺」。
                </div>

                {tickerSearchError && (
                  <div className="mt-2 text-[10px] text-red-300 bg-red-950/30 border border-red-900/50 rounded p-2">
                    {tickerSearchError}
                  </div>
                )}

                {tickerSearchCandidates.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto border border-[#2b2b2b]">
                    {tickerSearchCandidates.map((candidate) => (
                      <button
                        type="button"
                        key={candidate.symbol}
                        onClick={() => registerTickerCandidate(candidate)}
                        className="w-full px-2.5 py-2 flex items-center justify-between text-left border-b last:border-b-0 border-[#242424] hover:bg-[#171717] transition"
                      >
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-white truncate">{candidate.name}</span>
                          <span className="block text-[9px] text-gray-500 truncate">{candidate.nameEn || candidate.category}</span>
                        </span>
                        <span className="font-mono text-[11px] text-emerald-300 ml-3">{candidate.symbol}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
              onContextMenu={openWatchlistEmptyMenu}
            >
              <div className="w-full min-w-0">
                {visibleWatchlistSections.map((section) => (
                  <div
                    key={section.id}
                    onDragOver={(event) => {
                      if (draggedTicker || draggedSectionId) event.preventDefault();
                    }}
                    onDrop={() => {
                      if (!draggedSectionId) handleDropTicker(section.id);
                    }}
                  >
                    <div
                      data-watchlist-menu-target="section"
                      draggable={editingSectionId !== section.id}
                      onDragStart={(event) => {
                        const basketSymbols = section.symbols.map((symbol) => normalizeStoredSymbolValue(symbol)).filter(Boolean);
                        const basket = { sectionId: section.id, symbols: basketSymbols };
                        event.dataTransfer.effectAllowed = 'copy';
                        event.dataTransfer.setData('text/plain', `BASKET:${section.id}`);
                        event.dataTransfer.setData('application/x-mooview-basket', section.id);
                        setDraggedTicker(null);
                        // draggedSectionIdはセットしない（ウォッチリスト内の並び替えDnDと区別）
                        draggedBasketRef.current = basket;
                        setDraggedBasket(basket);
                      }}
                      onDragEnd={() => {
                        setDraggedSectionId(null);
                        draggedBasketRef.current = null;
                        setDraggedBasket(null);
                      }}
                      onDragOver={(event) => {
                        // バスケットドラッグ中はチャートへのドロップを許可（preventDefault不要=バブリング継続）
                        if (draggedSectionId && !draggedBasketRef.current) {
                          event.preventDefault();
                          event.stopPropagation();
                        }
                      }}
                      onDrop={(event) => handleDropWatchlistSection(event, section.id)}
                      className={`h-6 px-2 border-b border-[#242424] bg-[#0d0d0d] flex items-center text-[10px] text-gray-400 select-none cursor-grab active:cursor-grabbing ${
                        draggedSectionId === section.id ? 'opacity-45' : ''
                      }`}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setSectionMenu({ sectionId: section.id, x: event.clientX, y: event.clientY });
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleWatchlistSection(section.id)}
                        className="shrink-0 flex items-center hover:text-white"
                        aria-label={`${section.name}を${section.collapsed ? '展開' : '折りたたみ'}`}
                      >
                        {section.collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {editingSectionId === section.id ? (
                        <input
                          value={sectionNameDraft}
                          onChange={(event) => setSectionNameDraft(event.target.value)}
                          onBlur={commitWatchlistSectionRename}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              cancelWatchlistSectionRename();
                            }
                          }}
                          onClick={(event) => event.stopPropagation()}
                          className="ml-1.5 w-28 bg-[#121212] border border-emerald-500 text-[10px] text-gray-100 px-1 outline-none"
                          autoFocus
                          onFocus={(event) => event.currentTarget.select()}
                        />
                      ) : (
                        <span
                          className="ml-1.5 min-w-0 flex-1 truncate"
                          onDoubleClick={() => beginRenameWatchlistSection(section.id, section.name)}
                        >
                          {section.name}
                        </span>
                      )}
                    </div>

                    {!section.collapsed && section.rows.map((ticker) => {
                      const currentPrice = Number(ticker.currentPrice);
                      const computedChange = Number(ticker.computedChange);
                      const hasQuote = ticker.currentPrice !== null
                        && ticker.computedChange !== null
                        && Number.isFinite(currentPrice)
                        && currentPrice > 0
                        && Number.isFinite(computedChange);
                      const isPositive = hasQuote && computedChange >= 0;
                      const isSelectedPrimary = panels[0]?.symbol === ticker.symbol;
                      const isMultiSelected = selectedSymbols.includes(ticker.symbol);

                      const handleTickerClick = (event: React.MouseEvent) => {
                        // Shift + Click: 表示順(rows)に基づく範囲選択
                        if (event.shiftKey && lastClickedSymbol) {
                          const displayedSymbols = section.rows.map((r) => r.symbol);
                          const startIdx = displayedSymbols.indexOf(lastClickedSymbol);
                          const endIdx = displayedSymbols.indexOf(ticker.symbol);
                          if (startIdx !== -1 && endIdx !== -1) {
                            const minIdx = Math.min(startIdx, endIdx);
                            const maxIdx = Math.max(startIdx, endIdx);
                            const range = displayedSymbols.slice(minIdx, maxIdx + 1);
                            setSelectedSymbols(Array.from(new Set([...selectedSymbols, ...range])));
                          } else {
                            setSelectedSymbols((prev) =>
                              prev.includes(ticker.symbol) ? prev.filter((s) => s !== ticker.symbol) : [...prev, ticker.symbol]
                            );
                          }
                          setLastClickedSymbol(ticker.symbol);
                        } else if (event.ctrlKey || event.metaKey) {
                          // Ctrl/Meta + Click: 1つずつトグル選択
                          setSelectedSymbols((prev) =>
                            prev.includes(ticker.symbol)
                              ? prev.filter((s) => s !== ticker.symbol)
                              : [...prev, ticker.symbol]
                          );
                          setLastClickedSymbol(ticker.symbol);
                        } else {
                          // 通常クリック: プライマリチャートに表示
                          selectTickerForPrimaryChart(ticker.symbol);
                          setSelectedSymbols([ticker.symbol]);
                          setLastClickedSymbol(ticker.symbol);
                        }
                      };

                      const handleTickerContextMenu = (event: React.MouseEvent) => {
                        event.preventDefault();
                        event.stopPropagation();
                        // If current clicked symbol is not in the selection, select only it
                        let currentSelection = selectedSymbols;
                        if (!selectedSymbols.includes(ticker.symbol)) {
                          currentSelection = [ticker.symbol];
                          setSelectedSymbols([ticker.symbol]);
                        }
                        setWatchlistContextMenu({
                          x: event.clientX,
                          y: event.clientY,
                          symbols: currentSelection,
                          sectionId: section.id,
                        });
                      };

                      return (
                        <div
                          data-watchlist-menu-target="ticker"
                          key={`${section.id}-${ticker.symbol}`}
                          draggable
                          onDragStart={(event) => {
                            const dragSymbols =
                              selectedSymbols.includes(ticker.symbol) && selectedSymbols.length > 1
                                ? selectedSymbols
                                : [ticker.symbol];
                            event.dataTransfer.effectAllowed = 'copyMove';
                            event.dataTransfer.setData('text/plain', dragSymbols.join(','));
                            setWatchlistSort({ column: null, direction: null });
                            setDraggedSectionId(null);
                            setDraggedTicker({ symbol: ticker.symbol, symbols: dragSymbols, sectionId: section.id });
                          }}
                          onDragEnd={() => setDraggedTicker(null)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.stopPropagation();
                            handleDropTicker(section.id, ticker.symbol);
                          }}
                          onClick={handleTickerClick}
                          onContextMenu={handleTickerContextMenu}
                          className={`grid w-full items-center h-5 px-2 border-b border-[#242424] last:border-b-0 transition select-none cursor-grab active:cursor-grabbing ${
                            isMultiSelected
                              ? 'bg-emerald-900/35 ring-1 ring-inset ring-emerald-500'
                              : isSelectedPrimary
                              ? 'bg-emerald-950/20 ring-1 ring-inset ring-gray-700'
                              : 'hover:bg-[#171717]'
                          } ${draggedTicker?.symbols.includes(ticker.symbol) ? 'opacity-45' : ''}`}
                          style={{ gridTemplateColumns: watchlistGridTemplate }}
                        >
                          <div
                            className="min-w-0 flex items-center text-left h-full"
                            title={`${ticker.name}を左側チャートに表示 (Shift+クリックで複数選択, 右クリックで削除)`}
                          >
                            <span className="text-[10px] font-bold font-mono text-gray-100 truncate">
                              {formatWatchlistSymbol(ticker.symbol)}
                            </span>
                          </div>
                          <span aria-hidden="true" />
                          {watchlistLayout.showName && (
                            <span className="text-left text-[10px] text-gray-400 truncate" title={ticker.name}>
                              {ticker.name}
                            </span>
                          )}
                          <span className={`text-right font-mono text-[10px] truncate ${
                              !hasQuote ? 'text-gray-600' : isPositive ? 'text-[#20c7b0]' : 'text-[#ff4961]'
                            }`}
                          >
                            {hasQuote ? `${computedChange >= 0 ? '+' : ''}${computedChange.toFixed(2)}%` : 'N/A'}
                          </span>
                          {watchlistLayout.showPrice && (
                            <span className="text-right font-mono text-[10px] text-gray-200 truncate">
                              {hasQuote ? formatTickerPrice(ticker.symbol, currentPrice) : 'N/A'}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRemoveTickerFromSection(section.id, ticker.symbol);
                            }}
                            className="w-5 h-5 text-gray-700 opacity-0 hover:opacity-100 focus-visible:opacity-100 hover:text-red-400 flex items-center justify-end transition-opacity"
                            aria-label={`${ticker.name}をウォッチリストから削除`}
                            title="ウォッチリストから削除"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {watchlistContextMenu && (
              <div
                className="fixed z-50 w-48 bg-[#080808] border border-[#343434] shadow-2xl py-1 text-[10px] text-gray-200"
                style={{ left: watchlistContextMenu.x, top: watchlistContextMenu.y }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (watchlistContextMenu.symbols.length === 1) {
                      openWatchlistNameEditor(watchlistContextMenu.symbols[0], watchlistContextMenu.sectionId);
                    }
                  }}
                  disabled={watchlistContextMenu.symbols.length !== 1}
                  className="w-full px-2.5 py-1.5 text-left hover:bg-[#171717] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  表示名を変更
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (watchlistContextMenu.symbols.length === 1) {
                      resetWatchlistDisplayName(watchlistContextMenu.symbols[0]);
                    }
                  }}
                  disabled={watchlistContextMenu.symbols.length !== 1}
                  className="w-full px-2.5 py-1.5 text-left hover:bg-[#171717] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  デフォルト名に戻す
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleRemoveTickersFromSection(watchlistContextMenu.sectionId, watchlistContextMenu.symbols);
                    setWatchlistContextMenu(null);
                  }}
                  className="w-full px-2.5 py-1.5 text-left text-red-300 hover:bg-red-950/30 flex items-center justify-between"
                >
                  <span>選択した銘柄を削除</span>
                  <span className="bg-red-950/60 px-1 rounded text-[8px] font-mono text-red-200">
                    {watchlistContextMenu.symbols.length}
                  </span>
                </button>
              </div>
            )}

            {watchlistEmptyMenu && (
              <div
                className="fixed z-50 w-44 bg-[#080808] border border-[#343434] shadow-2xl py-1 text-[10px] text-gray-200"
                style={{ left: watchlistEmptyMenu.x, top: watchlistEmptyMenu.y }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    handleAddWatchlistSection();
                    setWatchlistEmptyMenu(null);
                  }}
                  className="w-full px-2.5 py-1.5 text-left hover:bg-[#171717] flex items-center gap-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  バスケット追加
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTickerSearchOpen(true);
                    setTickerSearchError(null);
                    setTickerSearchCandidates([]);
                    setWatchlistEmptyMenu(null);
                  }}
                  className="w-full px-2.5 py-1.5 text-left hover:bg-[#171717] flex items-center gap-2"
                >
                  <Search className="w-3.5 h-3.5" />
                  個別銘柄追加
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateActiveWatchlistTab((tab) => ({
                      ...tab,
                      sections: tab.sections.map((section) => ({
                        ...section,
                        symbols: section.symbols.filter((symbol) => !selectedSymbols.includes(symbol)),
                      })),
                    }));
                    setSelectedSymbols([]);
                    setWatchlistEmptyMenu(null);
                  }}
                  disabled={selectedSymbols.length === 0}
                  className="w-full px-2.5 py-1.5 text-left text-red-300 hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Trash2 className="w-3.5 h-3.5" />
                    個別銘柄削除
                  </span>
                  <span className="bg-red-950/60 px-1 rounded text-[8px] font-mono text-red-200">
                    {selectedSymbols.length}
                  </span>
                </button>
              </div>
            )}

            {sectionMenu && (
              <div
                className="fixed z-50 w-36 bg-[#080808] border border-[#343434] shadow-2xl py-1 text-[10px] text-gray-200"
                style={{ left: sectionMenu.x, top: sectionMenu.y }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    const section = activeWatchlistTab?.sections.find(
                      (currentSection) => currentSection.id === sectionMenu.sectionId
                    );
                    if (section) {
                      beginRenameWatchlistSection(section.id, section.name);
                    }
                    setSectionMenu(null);
                  }}
                  className="w-full px-2.5 py-1.5 text-left hover:bg-[#171717]"
                >
                  名称変更
                </button>
                <button
                  type="button"
                  onClick={() => handleAddWatchlistSection(sectionMenu.sectionId)}
                  className="w-full px-2.5 py-1.5 text-left hover:bg-[#171717]"
                >
                  セクション追加
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteWatchlistSection(sectionMenu.sectionId)}
                  className="w-full px-2.5 py-1.5 text-left text-red-300 hover:bg-red-950/30"
                >
                  セクション削除
                </button>
              </div>
            )}

            {watchlistNameEditModal && (
              <div
                className="fixed inset-0 z-[80] bg-black/55 flex items-center justify-center px-4"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setWatchlistNameEditModal(null);
                }}
              >
                <div
                  className="w-full max-w-sm border border-[#343434] bg-[#080808] shadow-2xl p-4 text-xs text-gray-200"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-3 border-b border-[#242424] pb-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white">銘柄表示名を変更</div>
                      <div className="mt-1 font-mono text-[10px] text-gray-500 truncate">
                        {formatWatchlistSymbol(watchlistNameEditModal.symbol)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWatchlistNameEditModal(null)}
                      className="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-white hover:bg-[#171717]"
                      aria-label="閉じる"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <label className="mt-3 block text-[10px] text-gray-500">
                    表示名
                    <input
                      value={watchlistNameEditModal.draftName}
                      onChange={(event) => setWatchlistNameEditModal((current) => (
                        current ? { ...current, draftName: event.target.value } : current
                      ))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') saveWatchlistDisplayName();
                      }}
                      className="mt-1 h-9 w-full bg-[#121212] border border-[#303030] text-white text-xs px-2 outline-none focus:border-emerald-500"
                      autoFocus
                    />
                  </label>
                  <div className="mt-2 text-[10px] text-gray-500">
                    Moomoo登録名: <span className="text-gray-300">{watchlistNameEditModal.defaultName}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => resetWatchlistDisplayName(watchlistNameEditModal.symbol)}
                      className="h-8 px-2.5 border border-[#303030] text-gray-300 hover:text-white hover:bg-[#171717] flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      デフォルトに戻す
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setWatchlistNameEditModal(null)}
                        className="h-8 px-3 border border-[#303030] text-gray-400 hover:text-white hover:bg-[#171717]"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={saveWatchlistDisplayName}
                        className="h-8 px-3 bg-emerald-600 text-white font-bold hover:bg-emerald-500"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {chartNameEditModal && (
              <div
                className="fixed inset-0 z-[82] bg-black/55 flex items-center justify-center px-4"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setChartNameEditModal(null);
                }}
              >
                <div
                  className="w-full max-w-sm border border-[#343434] bg-[#080808] shadow-2xl p-4 text-xs text-gray-200"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-3 border-b border-[#242424] pb-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white">
                        {chartNameEditModal.mode === 'create-comparison' ? '指数比較チャート名' : 'チャート名を変更'}
                      </div>
                      <div className="mt-1 text-[10px] text-gray-500 truncate">
                        {chartNameEditModal.defaultName}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setChartNameEditModal(null)}
                      className="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-white hover:bg-[#171717]"
                      aria-label="閉じる"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <label className="mt-3 block text-[10px] text-gray-500">
                    表示名
                    <input
                      value={chartNameEditModal.draftName}
                      onChange={(event) => setChartNameEditModal((current) => (
                        current ? { ...current, draftName: event.target.value } : current
                      ))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') saveChartNameEditModal();
                      }}
                      className="mt-1 h-9 w-full bg-[#121212] border border-[#303030] text-white text-xs px-2 outline-none focus:border-emerald-500"
                      autoFocus
                    />
                  </label>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    {chartNameEditModal.mode === 'rename' ? (
                      <button
                        type="button"
                        onClick={resetChartName}
                        className="h-8 px-2.5 border border-[#303030] text-gray-300 hover:text-white hover:bg-[#171717] flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        自動名に戻す
                      </button>
                    ) : (
                      <span />
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setChartNameEditModal(null)}
                        className="h-8 px-3 border border-[#303030] text-gray-400 hover:text-white hover:bg-[#171717]"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={saveChartNameEditModal}
                        className="h-8 px-3 bg-emerald-600 text-white font-bold hover:bg-emerald-500"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
          )}

          {/* 3. INDICATOR PARAMETERS */}
          {(!isMobileViewport || mobileSheetView === 'indicators') && sidebarView === 'indicators' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2">
            {focusedSymbolIndex && indicatorDatabase[focusedSymbolIndex] ? (
              <div className="flex flex-col min-h-full">
                <IndicatorSettingsPanel
                  settings={indicatorDatabase[focusedSymbolIndex]}
                  onChange={handleUpdateIndicators}
                  onReset={() => handleResetIndicators(focusedSymbolIndex)}
                />
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 border border-dashed border-gray-800">
                <Settings className="w-8 h-8 mx-auto opacity-30 mb-2" />
                <p>銘柄を選択してください</p>
              </div>
            )}
          </div>
          )}

          {(!isMobileViewport || mobileSheetView === 'disclosures') && sidebarView === 'disclosures' && (
            <DisclosureSettingsPanel />
          )}

          {/* 5. CONNECTION STATUS & PERFORMANCE (Moved to sidebar bottom) */}
          {(!isMobileViewport || mobileSheetView === 'settings') && sidebarView === 'settings' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
          <button
            type="button"
            onClick={() => {
              setSidebarView('disclosures');
              if (isMobileViewport) setMobileSheetView('disclosures');
            }}
            className="flex w-full items-center justify-between gap-3 border border-violet-900/70 bg-violet-950/30 p-3 text-left hover:bg-violet-900/40"
          >
            <span className="flex items-center gap-2 text-xs font-bold text-violet-100">
              <BellRing className="h-4 w-4 text-violet-300" />
              企業開示DB・Gemini・Discord設定
            </span>
            <ChevronRight className="h-4 w-4 text-violet-400" />
          </button>
          <div className="bg-[#101010] p-3 border border-[#242424] text-xs leading-relaxed shrink-0 flex flex-col space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                ワークスペース保存先
              </span>
              <span className={`px-1.5 py-0.5 border text-[9px] font-bold ${
                workspacePersistenceMode === 'shared'
                  ? 'border-emerald-800 bg-emerald-950/70 text-emerald-300'
                  : workspacePersistenceMode === 'local'
                    ? 'border-amber-800 bg-amber-950/60 text-amber-300'
                    : 'border-gray-700 bg-gray-900 text-gray-400'
              }`}>
                {workspacePersistenceMode === 'shared'
                  ? 'OCIクラウド・全端末共通'
                  : workspacePersistenceMode === 'local'
                    ? 'このブラウザ'
                    : '確認中'}
              </span>
            </div>
            <div className="text-[10px] text-gray-400">
              {workspacePersistenceMode === 'shared'
                ? '変更はOCIへ保存され、PC・Mac・スマホで共通表示されます。'
                : '現在の設定はこのブラウザに保存されています。'}
            </div>
            {workspacePersistenceMode === 'shared' && sharedWorkspaceUpdatedAt && (
              <div className="text-[9px] font-mono text-gray-500">
                最終保存: {new Date(sharedWorkspaceUpdatedAt).toLocaleString('ja-JP')}
              </div>
            )}
            {workspacePersistenceMode === 'local' && (
              <button
                type="button"
                onClick={() => void handleCopyWorkspaceToOci()}
                className="bg-cyan-700 hover:bg-cyan-600 text-white px-3 py-2 font-bold text-[11px] transition"
              >
                現在の設定をOCIへコピー
              </button>
            )}
            {workspaceMigrationMessage && (
              <div className="border border-emerald-900/70 bg-emerald-950/35 p-2 text-[10px] text-emerald-300">
                {workspaceMigrationMessage}
              </div>
            )}
            {sharedWorkspaceError && (
              <div className="border border-red-900/70 bg-red-950/35 p-2 text-[10px] text-red-300">
                {sharedWorkspaceError}
              </div>
            )}
          </div>
          <div className="bg-[#101010] p-3 border border-[#242424] text-xs leading-relaxed shrink-0 flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">接続ステータス</span>
              <span className="inline-flex w-2 h-2 rounded-full bg-[#009b87] animate-pulse" />
            </div>
            <div className="h-px bg-gray-800/60" />
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="flex items-center space-x-1.5 text-gray-400">
                <Database className="w-3.5 h-3.5 text-[#009b87]" />
                <span>Moomoo OpenAPI:</span>
              </span>
              <span className="text-gray-200 font-bold">
                {moomooStatus === 'connected' ? '接続中' : moomooStatus === 'error' ? '接続エラー' : '確認中'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-gray-400">応答速度:</span>
              <span className="text-[#009b87] font-bold">{networkLatency}ms</span>
            </div>
          </div>

          {/* 5. MOOMOO OPENAPI SETTINGS */}
          <div className="bg-[#101010] p-3 border border-[#242424] flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-200 text-xs tracking-wider uppercase flex items-center space-x-1.5">
                <Database className="w-4 h-4 text-orange-400" />
                <span>moomoo API 接続設定</span>
              </span>
              <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wide ${
                moomooStatus === 'connected' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-900' :
                moomooStatus === 'connecting' ? 'bg-amber-950/80 text-amber-300 border border-amber-900 animate-pulse' :
                moomooStatus === 'error' ? 'bg-red-950/80 text-red-300 border border-red-900' :
                'bg-gray-900 text-gray-400 border border-gray-800'
              }`}>
                {moomooStatus === 'connected' && '接続完了（実データ）'}
                {moomooStatus === 'connecting' && '接続確認中'}
                {moomooStatus === 'error' && '接続エラー'}
                {moomooStatus === 'disconnected' && 'デモデータ'}
              </span>
            </div>

            <div className="flex items-center justify-between bg-[#080808] p-2 rounded border border-[#202020]">
              <span className="text-[11px] text-gray-300 font-medium">Moomoo実データを使用</span>
              <button
                type="button"
                aria-label="Moomoo実データの使用を切り替える"
                onClick={handleMoomooModeToggle}
                className={`w-10 h-6 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${moomooRealTimeActive ? 'bg-emerald-500' : 'bg-gray-700'}`}
              >
                <div className={`bg-white w-5 h-5 rounded-full shadow-md transform duration-200 ease-in-out ${moomooRealTimeActive ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>

            {moomooRealTimeActive && (
              <div className="flex flex-col space-y-2 text-xs">
                <button
                  type="button"
                  onClick={() => checkMoomooStatus()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white rounded px-3 py-1.5 font-bold text-xs transition cursor-pointer"
                >
                  OpenD接続を確認
                </button>
                {moomooStatus === 'error' && moomooError && (
                  <div className="bg-red-950/40 border border-red-900/60 p-2.5 rounded text-[10px] text-red-300 leading-normal font-mono">
                    <strong>エラー詳細:</strong> {moomooError}
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
          )}

          {isMobileViewport && mobileSheetView === 'image-export' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-3 text-xs">
              <div className="mb-3 border border-[#2d2d2d] bg-[#101010] p-3 text-gray-300">
                スマホ画面に現在表示している1つのチャートをPNG画像として保存します。
              </div>
              <div className="mb-3">
                <div className="mb-1.5 font-bold text-gray-300">対象チャートを切り替える</div>
                <div className="mt-2 border border-[#242424]">
                  {panels.map((panel, index) => {
                    const selected = index === activeMobilePanelIndex;
                    return (
                      <button
                        key={panel.id}
                        type="button"
                        onClick={() => {
                          setMobileActivePanelIndex(index);
                          setChartImageExportSettings((current) => ({
                            ...current,
                            selection: { ...current.selection, mode: 'custom', panelIds: [panel.id] },
                          }));
                        }}
                        className={`flex h-10 w-full items-center gap-2 border-b border-[#202020] px-3 text-left last:border-b-0 ${
                          selected ? 'bg-emerald-950/30 text-emerald-100' : 'text-gray-400'
                        }`}
                      >
                        <span className={`flex h-4 w-4 items-center justify-center border ${
                          selected ? 'border-emerald-500 bg-emerald-800 text-white' : 'border-gray-600'
                        }`}>
                          {selected && <Check className="h-3 w-3" />}
                        </span>
                        <span className="truncate">
                          {index + 1}番目: {panel.name || normalizeStoredSymbolValue(panel.symbol) || '空のチャート'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleChartImageExport()}
                disabled={Boolean(chartExportStatus)
                  || (chartImageExportSettings.selection.mode === 'custom'
                    && chartImageExportSettings.selection.panelIds.length === 0)}
                className="flex h-11 w-full items-center justify-center gap-2 border border-emerald-700 bg-emerald-950/60 font-bold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {chartExportStatus?.kind === 'image' ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                PNG画像を作成
              </button>
            </div>
          )}

          {isMobileViewport && mobileSheetView === 'video-export' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-3 text-xs">
              <div className="mb-3">
                <div className="mb-1.5 font-bold text-gray-300">チャート移動時間</div>
                <div className="grid grid-cols-5 gap-1">
                  {[3, 5, 8, 10, 15].map((seconds) => (
                    <button
                      key={seconds}
                      type="button"
                      onClick={() => setChartVideoExportSettings((current) => ({
                        ...current,
                        durationSeconds: seconds,
                      }))}
                      className={`h-9 border font-mono ${
                        chartVideoExportSettings.durationSeconds === seconds
                          ? 'border-cyan-600 bg-cyan-950/60 text-cyan-200'
                          : 'border-[#303030] text-gray-400'
                      }`}
                    >
                      {seconds}秒
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 text-[10px] text-gray-500">
                  最終画面の静止 {CHART_EXPORT_FINAL_HOLD_SECONDS}秒を追加します。
                </div>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1.5 font-bold text-gray-300">フレームレート</div>
                  <div className="grid grid-cols-2 gap-1">
                    {([30, 60] as const).map((frameRate) => (
                      <button
                        key={frameRate}
                        type="button"
                        onClick={() => setChartVideoExportSettings((current) => ({
                          ...current,
                          frameRate,
                        }))}
                        className={`h-9 border ${
                          chartVideoExportSettings.frameRate === frameRate
                            ? 'border-cyan-600 bg-cyan-950/60 text-cyan-200'
                            : 'border-[#303030] text-gray-400'
                        }`}
                      >
                        {frameRate} fps
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 font-bold text-gray-300">解像度</div>
                  <select
                    value={chartVideoExportSettings.resolutionId}
                    onChange={(event) => setChartVideoExportSettings((current) => ({
                      ...current,
                      resolutionId: event.target.value,
                    }))}
                    className="h-9 w-full border border-[#303030] bg-[#101010] px-2 text-gray-200 outline-none"
                  >
                    {CHART_EXPORT_RESOLUTIONS.map((resolution) => (
                      <option key={resolution.id} value={resolution.id}>
                        {resolution.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mb-3">
                <div className="mb-1.5 font-bold text-gray-300">対象チャート</div>
                <div className="border border-[#303030] bg-[#101010] px-3 py-2 text-cyan-100">
                  {activeMobilePanelIndex + 1}番目: {' '}
                  {panels[activeMobilePanelIndex]?.name
                    || normalizeStoredSymbolValue(panels[activeMobilePanelIndex]?.symbol || '')
                    || '空のチャート'}
                </div>
                <div className="mt-1.5 text-[10px] text-gray-500">
                  対象を変更する場合は、チャート画面へ戻ってヘッダーを左右にスワイプしてください。
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleChartVideoExport()}
                disabled={chartExportStatus?.kind === 'image'
                  || (chartVideoExportSettings.selection.mode === 'custom'
                    && chartVideoExportSettings.selection.panelIds.length === 0)}
                className={`flex h-11 w-full items-center justify-center gap-2 border font-bold disabled:cursor-not-allowed disabled:opacity-40 ${
                  chartExportStatus?.kind === 'video'
                    ? 'border-red-700 bg-red-950/60 text-red-100'
                    : 'border-cyan-700 bg-cyan-950/60 text-cyan-100'
                }`}
              >
                {chartExportStatus?.kind === 'video' ? (
                  <Square className="h-3.5 w-3.5 fill-current" />
                ) : (
                  <Video className="h-4 w-4" />
                )}
                {chartExportStatus?.kind === 'video'
                  ? `動画作成を停止（${Math.round(chartExportStatus.progress * 100)}%）`
                  : 'MP4動画を作成'}
              </button>
            </div>
          )}

          </div>

          <nav className="hidden w-11 shrink-0 border-l border-[#242424] bg-[#070707] flex-col items-center py-2 gap-1 md:flex">
            <button
              type="button"
              onClick={() => handleSidebarNavClick('watchlist')}
              className={`w-9 h-10 flex items-center justify-center border transition ${
                sidebarOpen && sidebarView === 'watchlist'
                  ? 'bg-[#202020] border-[#4a4a4a] text-white'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-[#161616]'
              }`}
              title="ウォッチリスト"
              aria-label="ウォッチリストを表示"
            >
              <List className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => handleSidebarNavClick('indicators')}
              className={`w-9 h-10 flex items-center justify-center border transition ${
                sidebarOpen && sidebarView === 'indicators'
                  ? 'bg-[#202020] border-[#4a4a4a] text-white'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-[#161616]'
              }`}
              title="インジケーター"
              aria-label="インジケーター設定を表示"
            >
              <ChartNoAxesCombined className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => handleSidebarNavClick('settings')}
              className={`w-9 h-10 flex items-center justify-center border transition ${
                sidebarOpen && sidebarView === 'settings'
                  ? 'bg-[#202020] border-[#4a4a4a] text-white'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-[#161616]'
              }`}
              title="接続設定"
              aria-label="接続設定を表示"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => handleSidebarNavClick('disclosures')}
              className={`w-9 h-10 flex items-center justify-center border transition ${
                sidebarOpen && sidebarView === 'disclosures'
                  ? 'bg-violet-950/70 border-violet-700 text-violet-200'
                  : 'border-transparent text-gray-400 hover:text-violet-200 hover:bg-[#161616]'
              }`}
              title="企業開示DB・Discord通知設定"
              aria-label="企業開示DB・Discord通知設定を表示"
            >
              <BellRing className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => void handleChartImageExport()}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setVideoExportMenu(null);
                setChartAiPromptMenu(null);
                setImageExportMenu({ x: event.clientX, y: event.clientY });
              }}
              disabled={Boolean(chartExportStatus || chartAiStatus)}
              className="w-9 h-10 flex items-center justify-center border border-transparent text-gray-400 hover:text-emerald-200 hover:bg-[#161616] disabled:cursor-wait disabled:opacity-70 transition"
              title="チャート画像をPNGでダウンロード（右クリックで対象を設定）"
              aria-label="チャート画像をダウンロード"
            >
              {chartExportStatus?.kind === 'image' ? (
                <LoaderCircle className="w-5 h-5 animate-spin text-emerald-300" />
              ) : (
                <Camera className="w-5 h-5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleChartVideoExport()}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setImageExportMenu(null);
                setChartAiPromptMenu(null);
                setVideoExportMenu({ x: event.clientX, y: event.clientY });
              }}
              disabled={chartExportStatus?.kind === 'image' || Boolean(chartAiStatus)}
              className={`relative w-9 h-10 flex items-center justify-center border border-transparent transition disabled:cursor-wait disabled:opacity-70 ${
                chartExportStatus?.kind === 'video'
                  ? 'bg-red-950/70 text-red-300 hover:bg-red-900/80 hover:text-white'
                  : 'text-gray-400 hover:text-cyan-200 hover:bg-[#161616]'
              }`}
              title={chartExportStatus?.kind === 'video'
                ? '動画作成を停止'
                : 'チャート動画をMP4でダウンロード（右クリックで時間・fps・解像度・対象を設定）'}
              aria-label={chartExportStatus?.kind === 'video'
                ? '動画作成を停止'
                : 'チャート動画をダウンロード'}
            >
              {chartExportStatus?.kind === 'video' ? (
                <Square className="w-4 h-4 fill-current" />
              ) : (
                <Video className="w-5 h-5" />
              )}
              {chartExportStatus?.kind === 'video' && (
                <span className="absolute bottom-0.5 right-0.5 text-[7px] font-mono text-cyan-200">
                  {Math.round(chartExportStatus.progress * 100)}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleChartAiAnalysis()}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setVideoExportMenu(null);
                setImageExportMenu(null);
                setChartAiPromptMenu({ x: event.clientX, y: event.clientY });
              }}
              disabled={Boolean(chartExportStatus || chartAiStatus)}
              className="relative w-9 h-10 flex items-center justify-center border border-transparent text-gray-400 hover:text-violet-200 hover:bg-[#161616] disabled:cursor-wait disabled:opacity-70 transition"
              title={`チャート画像をダウンロードしてAI分析（${GEMINI_CHART_MODELS.find((model) => model.id === chartAiModel)?.label || chartAiModel}、右クリックで設定）`}
              aria-label="チャート画像をダウンロードしてAI分析"
            >
              {chartAiStatus ? (
                <LoaderCircle className="h-5 w-5 animate-spin text-violet-300" />
              ) : (
                <span className="text-[11px] font-black tracking-tight">AI</span>
              )}
              {chartAiStatus?.stage === 'capturing' && (
                <span className="absolute bottom-0.5 right-0.5 text-[7px] font-mono text-violet-200">
                  {Math.round(chartAiStatus.progress * 100)}
                </span>
              )}
            </button>

            {videoExportMenu && (
              <div
                className="fixed z-[110] w-72 max-h-[calc(100vh-16px)] overflow-y-auto border border-[#3a3a3a] bg-[#080808] text-[10px] text-gray-200 shadow-2xl"
                style={{
                  left: Math.max(8, Math.min(videoExportMenu.x - 288, window.innerWidth - 296)),
                  top: Math.max(8, Math.min(videoExportMenu.y, window.innerHeight - 608)),
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="border-b border-[#242424] px-3 py-2">
                  <div className="font-bold text-cyan-200">チャート動画の設定</div>
                  <div className="mt-0.5 text-[9px] text-gray-500">左クリック時もこの設定を使用します</div>
                </div>

                <div className="border-b border-[#242424] p-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-bold text-gray-300">チャート移動時間</span>
                    <label className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={30}
                        step={1}
                        value={chartVideoExportSettings.durationSeconds}
                        onChange={(event) => {
                          const durationSeconds = Math.max(
                            1,
                            Math.min(30, Number(event.target.value) || 5),
                          );
                          setChartVideoExportSettings((current) => ({
                            ...current,
                            durationSeconds,
                          }));
                        }}
                        className="h-6 w-14 border border-[#343434] bg-[#111111] px-1.5 text-right font-mono text-white outline-none focus:border-cyan-600"
                        aria-label="チャート移動時間"
                      />
                      <span className="text-gray-500">秒</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {[3, 5, 8, 10, 15].map((seconds) => (
                      <button
                        key={seconds}
                        type="button"
                        onClick={() => setChartVideoExportSettings((current) => ({
                          ...current,
                          durationSeconds: seconds,
                        }))}
                        className={`h-6 border font-mono transition ${
                          chartVideoExportSettings.durationSeconds === seconds
                            ? 'border-cyan-600 bg-cyan-950/60 text-cyan-200'
                            : 'border-[#303030] text-gray-400 hover:bg-[#171717] hover:text-white'
                        }`}
                      >
                        {seconds}秒
                      </button>
                    ))}
                  </div>
                  <div className="mt-1.5 border border-[#2d2d2d] bg-[#101010] px-2 py-1 text-[9px] text-gray-400">
                    移動 {chartVideoExportSettings.durationSeconds}秒
                    {' + '}
                    最終画面 {CHART_EXPORT_FINAL_HOLD_SECONDS}秒
                    {' = '}
                    <span className="font-bold text-cyan-200">
                      合計 {chartVideoExportSettings.durationSeconds + CHART_EXPORT_FINAL_HOLD_SECONDS}秒
                    </span>
                  </div>
                </div>

                <div className="border-b border-[#242424] p-2.5">
                  <div className="mb-1.5 font-bold text-gray-300">フレームレート</div>
                  <div className="grid grid-cols-2 gap-1">
                    {([30, 60] as const).map((frameRate) => {
                      const selected = chartVideoExportSettings.frameRate === frameRate;
                      return (
                        <button
                          key={frameRate}
                          type="button"
                          onClick={() => setChartVideoExportSettings((current) => ({
                            ...current,
                            frameRate,
                          }))}
                          className={`flex h-7 items-center justify-center gap-1.5 border font-mono transition ${
                            selected
                              ? 'border-cyan-600 bg-cyan-950/60 text-cyan-200'
                              : 'border-[#303030] text-gray-400 hover:bg-[#171717] hover:text-white'
                          }`}
                        >
                          {selected && <Check className="h-3 w-3" />}
                          {frameRate}fps
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-1 text-[9px] text-gray-500">
                    30fpsは書き出しが速く、60fpsはより滑らかな動画になります
                  </div>
                </div>

                <div className="border-b border-[#242424] p-2.5">
                  <div className="mb-1.5 font-bold text-gray-300">解像度</div>
                  <div className="space-y-1">
                    {CHART_EXPORT_RESOLUTIONS.map((resolution) => {
                      const selected = chartVideoExportSettings.resolutionId === resolution.id;
                      return (
                        <button
                          key={resolution.id}
                          type="button"
                          onClick={() => setChartVideoExportSettings((current) => ({
                            ...current,
                            resolutionId: resolution.id,
                          }))}
                          className={`flex h-7 w-full items-center gap-2 border px-2 text-left transition ${
                            selected
                              ? 'border-cyan-700 bg-cyan-950/50 text-cyan-100'
                              : 'border-[#303030] text-gray-400 hover:bg-[#171717] hover:text-white'
                          }`}
                        >
                          <span className={`flex h-3.5 w-3.5 items-center justify-center border ${
                            selected ? 'border-cyan-400 text-cyan-200' : 'border-gray-600'
                          }`}>
                            {selected && <Check className="h-3 w-3" />}
                          </span>
                          {resolution.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-b border-[#242424] p-2.5">
                  <div className="mb-1.5 font-bold text-gray-300">対象チャート</div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setChartVideoExportSettings((current) => ({
                        ...current,
                        selection: { ...current.selection, mode: 'all' },
                      }))}
                      className={`h-7 border ${
                        chartVideoExportSettings.selection.mode === 'all'
                          ? 'border-cyan-600 bg-cyan-950/60 text-cyan-200'
                          : 'border-[#303030] text-gray-400 hover:bg-[#171717]'
                      }`}
                    >
                      全て選択
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartVideoExportSettings((current) => ({
                        ...current,
                        selection: {
                          ...current.selection,
                          mode: 'custom',
                          panelIds: [],
                        },
                      }))}
                      className={`h-7 border ${
                        chartVideoExportSettings.selection.mode === 'custom'
                        && chartVideoExportSettings.selection.panelIds.length === 0
                          ? 'border-cyan-600 bg-cyan-950/60 text-cyan-200'
                          : 'border-[#303030] text-gray-400 hover:bg-[#171717]'
                      }`}
                    >
                      選択解除
                    </button>
                  </div>
                  <div className="mt-2 max-h-36 overflow-y-auto border border-[#242424]">
                    {panels.map((panel, index) => {
                      const selected = getSelectedChartExportPanelIds(
                        chartVideoExportSettings.selection,
                      ).includes(panel.id);
                      return (
                        <button
                          key={panel.id}
                          type="button"
                          onClick={() => setChartVideoExportSettings((current) => ({
                            ...current,
                            selection: toggleChartExportPanel(
                              current.selection,
                              panel.id,
                              panels.map((currentPanel) => currentPanel.id),
                            ),
                          }))}
                          className={`flex h-7 w-full items-center gap-2 border-b border-[#202020] px-2 text-left last:border-b-0 hover:bg-[#171717] ${
                            selected ? 'bg-cyan-950/30 text-cyan-100' : 'text-gray-400'
                          }`}
                        >
                          <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border ${
                            selected ? 'border-cyan-400 text-cyan-200' : 'border-gray-600'
                          }`}>
                            {selected && <Check className="h-3 w-3" />}
                          </span>
                          <span className="truncate">
                            {index + 1}番目: {panel.name || normalizeStoredSymbolValue(panel.symbol) || '空のチャート'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-2.5">
                  <button
                    type="button"
                    onClick={() => void handleChartVideoExport()}
                    disabled={
                      chartVideoExportSettings.selection.mode === 'custom'
                      && chartVideoExportSettings.selection.panelIds.length === 0
                    }
                    className="flex h-8 w-full items-center justify-center gap-2 border border-cyan-700 bg-cyan-950/50 font-bold text-cyan-100 hover:bg-cyan-900/50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Download className="h-4 w-4" />
                    選択したチャートを個別MP4で作成
                  </button>
                </div>
              </div>
            )}

            {imageExportMenu && (
              <div
                className="fixed z-[110] w-64 max-h-[calc(100vh-16px)] overflow-y-auto border border-[#3a3a3a] bg-[#080808] text-[10px] text-gray-200 shadow-2xl"
                style={{
                  left: Math.max(8, Math.min(imageExportMenu.x - 256, window.innerWidth - 264)),
                  top: Math.max(8, Math.min(imageExportMenu.y, window.innerHeight - 416)),
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="border-b border-[#242424] px-3 py-2">
                  <div className="font-bold text-emerald-200">チャート画像の設定</div>
                  <div className="mt-0.5 text-[9px] text-gray-500">左クリック時もこの設定を使用します</div>
                </div>
                <div className="border-b border-[#242424] p-2.5">
                  <div className="mb-1.5 font-bold text-gray-300">対象チャート</div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setChartImageExportSettings((current) => ({
                        ...current,
                        selection: { ...current.selection, mode: 'all' },
                      }))}
                      className={`h-7 border ${
                        chartImageExportSettings.selection.mode === 'all'
                          ? 'border-emerald-600 bg-emerald-950/60 text-emerald-200'
                          : 'border-[#303030] text-gray-400 hover:bg-[#171717]'
                      }`}
                    >
                      全て選択
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartImageExportSettings((current) => ({
                        ...current,
                        selection: {
                          ...current.selection,
                          mode: 'custom',
                          panelIds: [],
                        },
                      }))}
                      className={`h-7 border ${
                        chartImageExportSettings.selection.mode === 'custom'
                        && chartImageExportSettings.selection.panelIds.length === 0
                          ? 'border-emerald-600 bg-emerald-950/60 text-emerald-200'
                          : 'border-[#303030] text-gray-400 hover:bg-[#171717]'
                      }`}
                    >
                      選択解除
                    </button>
                  </div>
                  <div className="mt-2 max-h-40 overflow-y-auto border border-[#242424]">
                    {panels.map((panel, index) => {
                      const selected = getSelectedChartExportPanelIds(
                        chartImageExportSettings.selection,
                      ).includes(panel.id);
                      return (
                        <button
                          key={panel.id}
                          type="button"
                          onClick={() => setChartImageExportSettings((current) => ({
                            ...current,
                            selection: toggleChartExportPanel(
                              current.selection,
                              panel.id,
                              panels.map((currentPanel) => currentPanel.id),
                            ),
                          }))}
                          className={`flex h-7 w-full items-center gap-2 border-b border-[#202020] px-2 text-left last:border-b-0 hover:bg-[#171717] ${
                            selected ? 'bg-emerald-950/30 text-emerald-100' : 'text-gray-400'
                          }`}
                        >
                          <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border ${
                            selected ? 'border-emerald-400 text-emerald-200' : 'border-gray-600'
                          }`}>
                            {selected && <Check className="h-3 w-3" />}
                          </span>
                          <span className="truncate">
                            {index + 1}番目: {panel.name || normalizeStoredSymbolValue(panel.symbol) || '空のチャート'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="p-2.5">
                  <button
                    type="button"
                    onClick={() => void handleChartImageExport()}
                    disabled={
                      chartImageExportSettings.selection.mode === 'custom'
                      && chartImageExportSettings.selection.panelIds.length === 0
                    }
                    className="flex h-8 w-full items-center justify-center gap-2 border border-emerald-700 bg-emerald-950/50 font-bold text-emerald-100 hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Download className="h-4 w-4" />
                    選択したチャートを個別PNGで作成
                  </button>
                </div>
              </div>
            )}

            {chartAiPromptMenu && (
              <div
                className="fixed z-[110] flex w-[min(36rem,calc(100vw-16px))] max-h-[calc(100vh-16px)] flex-col border border-[#493b66] bg-[#080808] text-[10px] text-gray-200 shadow-2xl"
                style={{
                  left: Math.max(8, Math.min(chartAiPromptMenu.x - 576, window.innerWidth - 584)),
                  top: Math.max(8, Math.min(chartAiPromptMenu.y, window.innerHeight - 584)),
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="border-b border-[#2d2540] px-3 py-2">
                  <div className="font-bold text-violet-200">AI分析の設定</div>
                  <div className="mt-0.5 text-[9px] text-gray-500">
                    左クリック時はカメラと同じ対象チャートをダウンロードし、この文章と画像をGeminiへ送ります
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setChartAiPromptMenu(null);
                      openDiscordAutomationSettings();
                    }}
                    className="mt-2 flex h-8 w-full items-center justify-center gap-2 border border-violet-700 bg-violet-950/40 text-[10px] font-bold text-violet-100 hover:bg-violet-900/50"
                  >
                    <Bell className="h-3.5 w-3.5" />
                    Discord自動通知の設定
                  </button>
                </div>
                <div className="min-h-0 flex-1 p-2.5">
                  <label className="mb-2.5 block">
                    <span className="mb-1 block font-bold text-gray-300">使用モデル</span>
                    <select
                      value={chartAiModel}
                      onChange={(event) => setChartAiModel(
                        normalizeGeminiChartModelId(event.target.value),
                      )}
                      className="h-9 w-full border border-[#493b66] bg-[#101010] px-2 text-[11px] font-bold text-violet-100 outline-none focus:border-violet-500"
                      aria-label="Geminiモデル"
                    >
                      {GEMINI_CHART_MODELS.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}{model.id === 'gemini-3.6-flash' ? '（推奨）' : ''}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-[9px] text-gray-500">
                      {GEMINI_CHART_MODELS.find((model) => model.id === chartAiModel)?.description}
                    </span>
                  </label>
                  <textarea
                    value={chartAiPrompt}
                    onChange={(event) => setChartAiPrompt(event.target.value)}
                    maxLength={30_000}
                    spellCheck={false}
                    className="h-[min(23rem,calc(100vh-242px))] min-h-40 w-full resize-none border border-[#34303d] bg-[#101010] p-2 font-mono text-[11px] leading-relaxed text-gray-100 outline-none focus:border-violet-600"
                    aria-label="AI分析プロンプト"
                  />
                  <div className="mt-1 flex items-center justify-between text-[9px] text-gray-500">
                    <span>変更内容は自動保存されます</span>
                    <span>{chartAiPrompt.length.toLocaleString('ja-JP')} / 30,000</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-[#2d2540] p-2.5">
                  <button
                    type="button"
                    onClick={() => setChartAiPrompt(DEFAULT_CHART_AI_PROMPT)}
                    className="flex h-8 items-center justify-center gap-1.5 border border-[#3a3a3a] text-gray-300 hover:bg-[#171717] hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    初期プロンプトへ戻す
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleChartAiAnalysis()}
                    disabled={!chartAiPrompt.trim()}
                    className="flex h-8 items-center justify-center gap-2 border border-violet-700 bg-violet-950/50 font-bold text-violet-100 hover:bg-violet-900/50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="text-[10px] font-black">AI</span>
                    画像を保存して分析
                  </button>
                </div>
              </div>
            )}
          </nav>
        </div>

      </div>
      )}

      {discordAutomationSettingsOpen && (
        <div
          className="fixed inset-0 z-[135] flex items-center justify-center bg-black/80 p-2 md:p-6"
          onClick={() => setDiscordAutomationSettingsOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="discord-automation-title"
            className="flex max-h-[calc(100dvh-16px)] w-full max-w-6xl flex-col border border-violet-700/70 bg-[#080808] shadow-2xl md:max-h-[calc(100vh-40px)]"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center gap-3 border-b border-[#322645] px-3 py-3 md:px-4">
              <Bell className="h-5 w-5 shrink-0 text-violet-300" />
              <div className="min-w-0 flex-1">
                <h2 id="discord-automation-title" className="font-bold text-violet-100">
                  Discord自動通知の設定
                </h2>
                <p className="mt-0.5 text-[10px] leading-relaxed text-gray-500">
                  更新開始から最大120秒待機し、未取得チャートは除外してGemini本文 → 動画 → 画像の順でサーバーから通知します。Webhookはこの画面に保存・表示しません。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDiscordAutomationSettingsOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center text-gray-400 hover:bg-[#171717] hover:text-white"
                aria-label="Discord自動通知設定を閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <nav className="flex border-b border-[#322645] bg-[#09070d] px-3 pt-2 md:px-4" aria-label="Discord自動通知の表示切替">
              <button
                type="button"
                onClick={() => setDiscordAutomationActiveTab('settings')}
                className={`relative -mb-px h-9 border border-b-0 px-4 text-[10px] font-bold ${
                  discordAutomationActiveTab === 'settings'
                    ? 'border-violet-600 bg-[#080808] text-violet-100'
                    : 'border-transparent text-gray-500 hover:bg-[#15121a] hover:text-gray-300'
                }`}
              >
                通知設定
              </button>
              <button
                type="button"
                onClick={() => setDiscordAutomationActiveTab('history')}
                className={`relative -mb-px h-9 border border-b-0 px-4 text-[10px] font-bold ${
                  discordAutomationActiveTab === 'history'
                    ? 'border-violet-600 bg-[#080808] text-violet-100'
                    : 'border-transparent text-gray-500 hover:bg-[#15121a] hover:text-gray-300'
                }`}
              >
                実行履歴{discordAutomationRuns.length > 0 ? `（${discordAutomationRuns.length}）` : ''}
              </button>
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
              {discordAutomationActiveTab === 'settings' ? (
                <>
              <div className="mb-4 flex flex-col gap-3 border border-violet-800/70 bg-violet-950/25 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-violet-100">Discord通知</div>
                  <div className="mt-0.5 text-[10px] text-gray-400">
                    OFFにすると、全ての時刻設定をサーバー側で停止します。既定値はONです。
                  </div>
                </div>
                <button
                  type="button"
                  aria-pressed={discordAutomationSettings.discordEnabled}
                  onClick={() => setDiscordAutomationSettings((current) => ({
                    ...current,
                    discordEnabled: !current.discordEnabled,
                  }))}
                  className={`flex h-10 min-w-28 items-center justify-center gap-2 border px-4 text-xs font-bold transition ${
                    discordAutomationSettings.discordEnabled
                      ? 'border-emerald-500 bg-emerald-950/70 text-emerald-100'
                      : 'border-gray-600 bg-[#171717] text-gray-400'
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${
                    discordAutomationSettings.discordEnabled ? 'bg-emerald-400' : 'bg-gray-600'
                  }`} />
                  {discordAutomationSettings.discordEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                  <Clock3 className="h-3.5 w-3.5" />
                  サーバー時刻: 日本時間（Asia/Tokyo）
                </div>
                <button
                  type="button"
                  onClick={() => void loadDiscordAutomationSettings()}
                  disabled={discordAutomationLoading || discordAutomationSaving}
                  className="h-7 border border-[#3d3d3d] px-2.5 text-[10px] text-gray-300 hover:bg-[#171717] disabled:opacity-40"
                >
                  {discordAutomationLoading ? '再読込中…' : '設定を再読込'}
                </button>
              </div>

              {discordAutomationMessage && (
                <div className="mb-3 border border-violet-800/60 bg-violet-950/30 px-3 py-2 text-[11px] text-violet-100">
                  {discordAutomationMessage}
                </div>
              )}

              <div className="space-y-4">
                {discordAutomationSettings.jobs.map((job, jobIndex) => {
                  const updateTime = (timeIndex: number, value: string) => {
                    updateDiscordAutomationJob(job.id, (current) => ({
                      ...current,
                      times: current.times.map((time, index) => index === timeIndex ? value : time),
                    }));
                  };
                  const toggleSelectionPanel = (
                    field: 'imageSelection' | 'videoSelection',
                    panelId: string,
                  ) => {
                    const selection = job[field];
                    const selectedIds = selection.mode === 'custom'
                      ? selection.panelIds
                      : panels.map((panel) => panel.id);
                    const nextIds = selectedIds.includes(panelId)
                      ? selectedIds.filter((id) => id !== panelId)
                      : [...selectedIds, panelId];
                    setDiscordAutomationSelection(job.id, field, {
                      mode: 'custom',
                      panelIds: nextIds,
                      panelRefs: panels
                        .map((panel, index) => ({
                          panelId: panel.id,
                          index,
                          symbol: normalizeStoredSymbolValue(panel.symbol),
                          name: panel.name || '',
                        }))
                        .filter((reference) => nextIds.includes(reference.panelId)),
                    });
                  };
                  const selectionControls = (
                    field: 'imageSelection' | 'videoSelection',
                    label: string,
                    color: 'emerald' | 'cyan',
                  ) => {
                    const selection = job[field];
                    const geminiField = field === 'imageSelection'
                      ? 'sendImagesToGemini'
                      : 'sendVideosToGemini';
                    const sendToGemini = job[geminiField];
                    const selectedIds = selection.mode === 'all'
                      ? panels.map((panel) => panel.id)
                      : selection.panelIds;
                    return (
                      <div className="border border-[#303030] bg-[#0d0d0d] p-2.5">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="font-bold text-gray-200">{label}</span>
                          <button
                            type="button"
                            aria-pressed={sendToGemini}
                            onClick={() => updateDiscordAutomationJob(job.id, (current) => ({
                              ...current,
                              [geminiField]: !current[geminiField],
                            }))}
                            className={`flex h-7 items-center gap-1.5 border px-2 text-[9px] font-bold ${
                              sendToGemini
                                ? color === 'emerald'
                                  ? 'border-emerald-600 bg-emerald-950/60 text-emerald-100'
                                  : 'border-cyan-600 bg-cyan-950/60 text-cyan-100'
                                : 'border-[#3a3a3a] bg-[#111] text-gray-500'
                            }`}
                          >
                            <span className={`h-2 w-2 rounded-full ${
                              sendToGemini ? (color === 'emerald' ? 'bg-emerald-400' : 'bg-cyan-400') : 'bg-gray-600'
                            }`} />
                            Geminiへ送付: {sendToGemini ? 'ON' : 'OFF'}
                          </button>
                        </div>
                        <div className="mb-1 text-[9px] text-gray-500">チェックしたチャートだけをDiscordへ添付します。</div>
                        <div className="max-h-32 overflow-y-auto border border-[#252525]">
                          {panels.map((panel, index) => {
                            const selected = selectedIds.includes(panel.id);
                            return (
                              <button
                                key={panel.id}
                                type="button"
                                onClick={() => toggleSelectionPanel(field, panel.id)}
                                className={`flex h-7 w-full items-center gap-2 border-b border-[#202020] px-2 text-left text-[9px] last:border-b-0 ${
                                  selected ? 'bg-white/5 text-gray-100' : 'text-gray-500'
                                }`}
                              >
                                <span className={`flex h-3.5 w-3.5 items-center justify-center border ${
                                  selected ? 'border-violet-400 text-violet-200' : 'border-gray-600'
                                }`}>
                                  {selected && <Check className="h-3 w-3" />}
                                </span>
                                <span className="truncate">
                                  {index + 1}番目: {panel.name || normalizeStoredSymbolValue(panel.symbol) || '空のチャート'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  };
                  return (
                    <article key={job.id} className="border border-[#3a3347] bg-[#0b0b0b] p-3 md:p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[#29242f] pb-3">
                        <input
                          value={job.name}
                          onChange={(event) => updateDiscordAutomationJob(job.id, (current) => ({
                            ...current,
                            name: event.target.value,
                          }))}
                          className="h-8 min-w-44 flex-1 border border-[#3f3a49] bg-[#121212] px-2 text-xs font-bold text-gray-100 outline-none focus:border-violet-500"
                          aria-label="通知設定名"
                        />
                        <button
                          type="button"
                          aria-pressed={job.enabled}
                          onClick={() => updateDiscordAutomationJob(job.id, (current) => ({
                            ...current,
                            enabled: !current.enabled,
                          }))}
                          className={`h-8 border px-3 text-[10px] font-bold ${
                            job.enabled
                              ? 'border-emerald-700 bg-emerald-950/50 text-emerald-100'
                              : 'border-gray-600 text-gray-500'
                          }`}
                        >
                          {job.enabled ? 'この設定はON' : 'この設定はOFF'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRunDiscordAutomationNow(job)}
                          disabled={!discordAutomationSettings.discordEnabled || !job.enabled || discordAutomationSaving}
                          className="h-8 border border-violet-700 bg-violet-950/50 px-3 text-[10px] font-bold text-violet-100 hover:bg-violet-900/50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          今すぐ実行
                        </button>
                        {discordAutomationSettings.jobs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setDiscordAutomationSettings((current) => ({
                              ...current,
                              jobs: current.jobs.filter((candidate) => candidate.id !== job.id),
                            }))}
                            className="h-8 border border-red-900/70 px-2 text-[10px] text-red-300 hover:bg-red-950/40"
                            aria-label={`${job.name}を削除`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)]">
                        <div className="space-y-3">
                          <label className="block text-[10px]">
                            <span className="mb-1 block font-bold text-gray-300">実行日</span>
                            <select
                              value={job.days.mode}
                              onChange={(event) => updateDiscordAutomationJob(job.id, (current) => ({
                                ...current,
                                days: {
                                  ...current.days,
                                  mode: event.target.value as DiscordAutomationJob['days']['mode'],
                                },
                              }))}
                              className="h-8 w-full border border-[#3a3a3a] bg-[#111] px-2 text-gray-200 outline-none"
                            >
                              <option value="weekdays">平日のみ（月〜金）</option>
                              <option value="weekends">休日のみ（土・日）</option>
                              <option value="everyday">毎日</option>
                              <option value="custom">曜日を指定</option>
                            </select>
                          </label>
                          {job.days.mode === 'custom' && (
                            <div className="grid grid-cols-7 gap-1">
                              {['日', '月', '火', '水', '木', '金', '土'].map((label, day) => {
                                const selected = job.days.customDays.includes(day);
                                return (
                                  <button
                                    key={label}
                                    type="button"
                                    onClick={() => updateDiscordAutomationJob(job.id, (current) => ({
                                      ...current,
                                      days: {
                                        ...current.days,
                                        customDays: selected
                                          ? current.days.customDays.filter((candidate) => candidate !== day)
                                          : [...current.days.customDays, day].sort(),
                                      },
                                    }))}
                                    className={`h-7 border text-[9px] ${
                                      selected
                                        ? 'border-violet-600 bg-violet-950/70 text-violet-100'
                                        : 'border-[#3a3a3a] text-gray-500'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <div>
                            <div className="mb-1 flex items-center justify-between text-[10px]">
                              <span className="font-bold text-gray-300">実行時刻</span>
                              <button
                                type="button"
                                onClick={() => updateDiscordAutomationJob(job.id, (current) => ({
                                  ...current,
                                  times: [...current.times, '12:00'],
                                }))}
                                className="text-violet-300 hover:text-violet-100"
                              >
                                + 時刻を追加
                              </button>
                            </div>
                            <div className="space-y-1">
                              {job.times.map((time, timeIndex) => (
                                <div key={`${time}-${timeIndex}`} className="flex gap-1">
                                  <input
                                    type="time"
                                    value={time}
                                    onChange={(event) => updateTime(timeIndex, event.target.value)}
                                    className="h-8 min-w-0 flex-1 border border-[#3a3a3a] bg-[#111] px-2 text-[11px] text-gray-200 outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateDiscordAutomationJob(job.id, (current) => ({
                                      ...current,
                                      times: current.times.filter((_, index) => index !== timeIndex),
                                    }))}
                                    className="h-8 w-8 border border-[#3a3a3a] text-gray-500 hover:text-red-300"
                                    aria-label={`${time}を削除`}
                                  >
                                    <X className="mx-auto h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>

                          <label className="block text-[10px]">
                            <span className="mb-1 block font-bold text-gray-300">Geminiモデル</span>
                            <select
                              value={job.useCurrentChartAiSettings ? chartAiModel : job.model}
                              onChange={(event) => {
                                const model = normalizeGeminiChartModelId(event.target.value);
                                if (job.useCurrentChartAiSettings) {
                                  // ON時は右クリックAI設定を直接更新し、通知実行時も同じモデルを使用する。
                                  setChartAiModel(model);
                                  return;
                                }
                                updateDiscordAutomationJob(job.id, (current) => ({
                                  ...current,
                                  model,
                                }));
                              }}
                              className="h-8 w-full border border-[#493b66] bg-[#111] px-2 text-[10px] text-violet-100 outline-none focus:border-violet-500"
                            >
                              {GEMINI_CHART_MODELS.map((model) => (
                                <option key={model.id} value={model.id}>{model.label}</option>
                              ))}
                            </select>
                            <span className="mt-1 block text-[9px] leading-relaxed text-gray-500">
                              選択モデルで失敗した場合はGemini 2.5 Flashへ自動切替します。
                            </span>
                          </label>
                          <button
                            type="button"
                            aria-pressed={job.useCurrentChartAiSettings}
                            onClick={() => updateDiscordAutomationJob(job.id, (current) => ({
                              ...current,
                              useCurrentChartAiSettings: !current.useCurrentChartAiSettings,
                            }))}
                            className={`w-full border px-2 py-2 text-left text-[10px] leading-relaxed ${
                              job.useCurrentChartAiSettings
                                ? 'border-emerald-700 bg-emerald-950/45 text-emerald-100'
                                : 'border-[#3a3a3a] bg-[#111] text-gray-400'
                            }`}
                          >
                            <span className="block font-bold">
                              右クリックAI分析のモデルを使用: {job.useCurrentChartAiSettings ? 'ON' : 'OFF'}
                            </span>
                            <span className="mt-0.5 block text-[9px] opacity-80">
                              ONでは「AI分析の設定」のGeminiモデルだけを使用します。プロンプトは通知ごとに独立しています。
                            </span>
                          </button>
                        </div>

                        <div className="space-y-3">
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-bold text-gray-300">Geminiへの指示</span>
                            <textarea
                              value={job.prompt}
                              onChange={(event) => updateDiscordAutomationJob(job.id, (current) => ({
                                ...current,
                                prompt: event.target.value,
                              }))}
                              maxLength={30_000}
                              spellCheck={false}
                              className="h-32 w-full resize-y border border-[#3f3a49] bg-[#111] p-2 font-mono text-[10px] leading-relaxed text-gray-100 outline-none focus:border-violet-600"
                            />
                            <span className="mt-1 block text-[9px] leading-relaxed text-gray-500">
                              この通知設定だけに使用します。右クリックAI分析のプロンプトには反映しません。
                            </span>
                          </label>
                          <div className="grid gap-3 xl:grid-cols-2">
                            {selectionControls('imageSelection', 'Discordへ添付する画像', 'emerald')}
                            <div className="space-y-3">
                              {selectionControls('videoSelection', 'Discordへ添付する動画', 'cyan')}
                              <div className="grid grid-cols-3 gap-2 border border-[#303030] bg-[#0d0d0d] p-2.5 text-[9px]">
                                <label>
                                  <span className="mb-1 block text-gray-400">動画時間</span>
                                  <select
                                    value={job.videoDurationSeconds}
                                    onChange={(event) => updateDiscordAutomationJob(job.id, (current) => ({
                                      ...current,
                                      videoDurationSeconds: Number(event.target.value),
                                    }))}
                                    className="h-7 w-full border border-[#3a3a3a] bg-[#111] px-1 text-gray-200"
                                  >
                                    {[3, 5, 8, 10, 15].map((seconds) => (
                                      <option key={seconds} value={seconds}>{seconds}秒</option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  <span className="mb-1 block text-gray-400">FPS</span>
                                  <select
                                    value={job.videoFrameRate}
                                    onChange={(event) => updateDiscordAutomationJob(job.id, (current) => ({
                                      ...current,
                                      videoFrameRate: Number(event.target.value) === 60 ? 60 : 30,
                                    }))}
                                    className="h-7 w-full border border-[#3a3a3a] bg-[#111] px-1 text-gray-200"
                                  >
                                    <option value={30}>30</option>
                                    <option value={60}>60</option>
                                  </select>
                                </label>
                                <label>
                                  <span className="mb-1 block text-gray-400">解像度</span>
                                  <select
                                    value={job.videoResolutionId}
                                    onChange={(event) => updateDiscordAutomationJob(job.id, (current) => ({
                                      ...current,
                                      videoResolutionId: event.target.value as DiscordAutomationJob['videoResolutionId'],
                                    }))}
                                    className="h-7 w-full border border-[#3a3a3a] bg-[#111] px-1 text-gray-200"
                                  >
                                    {CHART_EXPORT_RESOLUTIONS.map((resolution) => (
                                      <option key={resolution.id} value={resolution.id}>{resolution.label}</option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={addDiscordAutomationJob}
                className="mt-3 flex h-8 items-center gap-1.5 border border-[#4b3f60] px-3 text-[10px] text-violet-200 hover:bg-violet-950/40"
              >
                <Plus className="h-3.5 w-3.5" />
                通知設定を追加
              </button>

                </>
              ) : (
                <section className="border border-[#302b35] bg-[#0d0d0d]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#302b35] px-3 py-2.5">
                    <div>
                      <div className="text-[11px] font-bold text-gray-200">直近のサーバー実行履歴</div>
                      <div className="mt-0.5 text-[9px] text-gray-500">完了・失敗時刻は日本時間（Asia/Tokyo）で表示します。</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadDiscordAutomationSettings()}
                      disabled={discordAutomationLoading || discordAutomationSaving}
                      className="h-7 border border-[#3d3d3d] px-2.5 text-[10px] text-gray-300 hover:bg-[#171717] disabled:opacity-40"
                    >
                      {discordAutomationLoading ? '更新中…' : '実行履歴を更新'}
                    </button>
                  </div>
                  {discordAutomationRuns.length === 0 ? (
                    <div className="px-3 py-8 text-center text-[10px] text-gray-500">実行履歴はまだありません。</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <div className="min-w-[52rem]">
                        <div className="grid grid-cols-[5rem_11rem_11rem_8rem_minmax(18rem,1fr)] gap-2 border-b border-[#302b35] bg-[#121212] px-3 py-2 text-[9px] font-bold text-gray-400">
                          <span>状態</span>
                          <span>完了・失敗（日本時間）</span>
                          <span>実行予定（日本時間）</span>
                          <span>Geminiモデル</span>
                          <span>詳細・エラー</span>
                        </div>
                        <div className="max-h-[min(52vh,34rem)] overflow-y-auto">
                          {discordAutomationRuns.slice(0, 50).map((run) => (
                            <div key={run.id} className="grid grid-cols-[5rem_11rem_11rem_8rem_minmax(18rem,1fr)] gap-2 border-b border-[#242424] px-3 py-2 text-[10px] last:border-b-0">
                              <span className={
                                run.status === 'succeeded' ? 'font-bold text-emerald-300'
                                  : run.status === 'failed' ? 'font-bold text-red-300'
                                    : 'font-bold text-amber-300'
                              }>
                                {run.status === 'succeeded' ? '完了' : run.status === 'failed' ? '失敗' : '実行中'}
                              </span>
                              <span className="font-mono text-[9px] text-gray-300">
                                {formatDiscordAutomationJapanDateTime(run.completedAt)}
                              </span>
                              <span className="font-mono text-[9px] text-gray-400">
                                {formatDiscordAutomationJapanDateTime(run.scheduledFor)}
                              </span>
                              <span className="break-words text-[9px] text-violet-200">{run.model || '—'}</span>
                              <span className="min-w-0 whitespace-pre-wrap break-words text-[9px] leading-relaxed text-gray-400">{run.message}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>

            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[#322645] p-3">
              <button
                type="button"
                onClick={() => setDiscordAutomationSettingsOpen(false)}
                className="h-9 border border-[#3a3a3a] px-4 text-[11px] text-gray-300 hover:bg-[#171717]"
              >
                閉じる
              </button>
              <button
                type="button"
                onClick={() => void handleSaveDiscordAutomationSettings()}
                disabled={discordAutomationSaving || discordAutomationLoading}
                className={`h-9 border px-4 text-[11px] font-bold disabled:cursor-wait disabled:opacity-50 ${
                  discordAutomationSaveFeedback === 'success'
                    ? 'border-emerald-600 bg-emerald-950/70 text-emerald-100'
                    : discordAutomationSaveFeedback === 'error'
                      ? 'border-red-700 bg-red-950/60 text-red-100'
                      : 'border-violet-700 bg-violet-950/60 text-violet-100 hover:bg-violet-900/60'
                }`}
              >
                {discordAutomationSaving
                  ? '保存中…'
                  : discordAutomationSaveFeedback === 'success'
                    ? '保存済み ✓'
                    : discordAutomationSaveFeedback === 'error'
                      ? '保存に失敗'
                      : 'サーバーへ保存'}
              </button>
            </footer>
          </section>
        </div>
      )}

      {chartAiResult && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-3 md:p-8"
          onClick={() => setChartAiResult(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="chart-ai-result-title"
            className="flex max-h-[calc(100dvh-24px)] w-full max-w-3xl flex-col border border-[#493b66] bg-[#080808] shadow-2xl md:max-h-[calc(100vh-64px)]"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center gap-3 border-b border-[#2d2540] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <h2 id="chart-ai-result-title" className="font-bold text-violet-100">
                  AIチャート分析
                </h2>
                <div className="mt-0.5 text-[10px] text-gray-500">
                  分析対象のPNG画像はダウンロード済みです
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyChartAiResult()}
                className="flex h-8 shrink-0 items-center gap-1.5 border border-violet-700 bg-violet-950/50 px-3 text-[11px] font-bold text-violet-100 hover:bg-violet-900/60"
              >
                <Copy className="h-3.5 w-3.5" />
                {chartAiCopied ? 'コピー済み' : 'コピー'}
              </button>
              <button
                type="button"
                onClick={() => setChartAiResult(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center text-gray-400 hover:bg-[#171717] hover:text-white"
                aria-label="AI分析結果を閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-7 text-gray-100">
                {chartAiResult.text}
              </pre>
            </div>
            <footer className="border-t border-[#242424] px-4 py-2 text-[9px] text-gray-500">
              使用モデル: {chartAiResult.model}
            </footer>
          </section>
        </div>
      )}

      {discordAutomationSaveFeedback && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-2 z-[140] flex max-w-sm items-start gap-2 border px-3 py-2 text-[11px] shadow-2xl md:bottom-12 md:right-14 ${
            discordAutomationSaveFeedback === 'success'
              ? 'border-emerald-700 bg-emerald-950/95 text-emerald-100'
              : 'border-red-800 bg-red-950/95 text-red-100'
          }`}
        >
          {discordAutomationSaveFeedback === 'success'
            ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            : <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span className="min-w-0 leading-relaxed">
            {discordAutomationSaveFeedback === 'success'
              ? 'Discord自動通知設定をサーバーへ保存しました。'
              : discordAutomationMessage || 'Discord自動通知設定を保存できませんでした。'}
          </span>
        </div>
      )}

      {chartExportError && (
        <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-2 z-[140] flex max-w-sm items-start gap-3 border border-red-800 bg-red-950/95 px-3 py-2 text-[11px] text-red-100 shadow-2xl md:bottom-12 md:right-14">
          <span className="min-w-0 flex-1 leading-relaxed">{chartExportError}</span>
          <button
            type="button"
            onClick={() => setChartExportError(null)}
            className="shrink-0 text-red-300 hover:text-white"
            aria-label="エラーを閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {pendingIosVideoFiles.length > 0 && (
        <div
          className="fixed inset-0 z-[140] flex items-end justify-center bg-black/70 px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-8 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="iOS写真への動画保存"
          data-ios-video-save-dialog="true"
        >
          <div className="w-full max-w-md border border-cyan-700 bg-[#090909] p-4 text-gray-100 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-cyan-200">動画の作成が完了しました</div>
                <div className="mt-1 text-[11px] leading-relaxed text-gray-400">
                  下のボタンをタップし、iOS共有シートで「ビデオを保存」を選ぶと「写真」へ追加できます。
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingIosVideoFiles([])}
                disabled={iosVideoShareInFlight}
                className="shrink-0 text-gray-400 hover:text-white disabled:opacity-40"
                aria-label="動画保存画面を閉じる"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-3 border border-[#303030] bg-black/40 px-3 py-2 text-[10px] text-gray-400">
              {pendingIosVideoFiles.length}本・
              {(pendingIosVideoFiles.reduce((total, file) => total + file.size, 0) / 1024 / 1024).toFixed(1)}MB
              ・iOS互換MP4
            </div>
            <button
              type="button"
              onClick={handleShareIosVideoFiles}
              disabled={iosVideoShareInFlight}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 bg-cyan-700 text-sm font-bold text-white transition hover:bg-cyan-600 disabled:cursor-wait disabled:opacity-60"
            >
              {iosVideoShareInFlight ? (
                <LoaderCircle className="h-5 w-5 animate-spin" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
              iOS「写真」へ保存
            </button>
            <button
              type="button"
              onClick={handleDownloadIosVideoFiles}
              disabled={iosVideoShareInFlight}
              className="mt-2 flex h-9 w-full items-center justify-center gap-2 border border-gray-700 text-[11px] font-bold text-gray-300 hover:bg-gray-900 disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              従来どおり「ファイル」へ保存
            </button>
          </div>
        </div>
      )}

      {/* Footer information panel */}
      <footer className="h-8 border-t border-[#202020] bg-[#080808] shrink-0 hidden items-center justify-between px-4 text-[10px] text-[#848e9c] md:flex">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#009b87]"></span>
            <span>WebSocket Quotations Client: Online</span>
          </span>
          <span className="text-gray-800">|</span>
          <span>データソース: moomoo OpenAPI quotes gateway stream</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className="uppercase text-gray-400 font-bold bg-[#1a1a1a] px-2 py-0.5 rounded">AUTO-SAVE: ENABLED</span>
          <span>© {new Date().getFullYear()} trading multi dashboard workspace</span>
        </div>
      </footer>

      <div
        className="shrink-0 md:hidden"
        style={{ height: 'calc(4rem + env(safe-area-inset-bottom))' }}
        aria-hidden="true"
      />

      <nav
        data-mobile-bottom-navigation="true"
        className="fixed inset-x-0 bottom-0 z-[100] grid grid-cols-7 border-t border-[#303030] bg-[#080808]/98 shadow-[0_-8px_28px_rgba(0,0,0,0.55)] backdrop-blur md:hidden"
        style={{
          height: 'calc(4rem + env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        aria-label="スマホ用メインナビゲーション"
      >
        <button
          type="button"
          onClick={() => {
            setAppView('charts');
            setMobileSheetView(null);
          }}
          className={`flex min-w-0 flex-col items-center justify-center gap-0.5 text-[9px] transition ${
            appView === 'charts' && !mobileSheetView
              ? 'bg-emerald-950/70 text-emerald-300'
              : 'text-gray-400'
          }`}
          aria-label="チャートを表示"
        >
          <LayoutGrid className="h-5 w-5" />
          <span>チャート</span>
        </button>
        <button
          type="button"
          onClick={() => handleMobileSheetNavClick('watchlist')}
          className={`flex min-w-0 flex-col items-center justify-center gap-0.5 text-[9px] transition ${
            mobileSheetView === 'watchlist'
              ? 'bg-emerald-950/70 text-emerald-300'
              : 'text-gray-400'
          }`}
          aria-label="ウォッチリストを表示"
        >
          <List className="h-5 w-5" />
          <span>リスト</span>
        </button>
        <button
          type="button"
          onClick={() => handleMobileSheetNavClick('indicators')}
          className={`flex min-w-0 flex-col items-center justify-center gap-0.5 text-[9px] transition ${
            mobileSheetView === 'indicators'
              ? 'bg-emerald-950/70 text-emerald-300'
              : 'text-gray-400'
          }`}
          aria-label="インジケーター設定を表示"
        >
          <ChartNoAxesCombined className="h-5 w-5" />
          <span>指標</span>
        </button>
        <button
          type="button"
          onClick={() => handleMobileSheetNavClick('settings')}
          className={`flex min-w-0 flex-col items-center justify-center gap-0.5 text-[9px] transition ${
            mobileSheetView === 'settings'
              ? 'bg-emerald-950/70 text-emerald-300'
              : 'text-gray-400'
          }`}
          aria-label="接続・保存設定を表示"
        >
          <Settings className="h-5 w-5" />
          <span>設定</span>
        </button>
        <button
          type="button"
          onClick={() => handleMobileSheetNavClick('disclosures')}
          className={`flex min-w-0 flex-col items-center justify-center gap-0.5 text-[9px] transition ${
            mobileSheetView === 'disclosures'
              ? 'bg-violet-950/70 text-violet-200'
              : 'text-gray-400'
          }`}
          aria-label="企業開示DB・通知設定を表示"
        >
          <BellRing className="h-5 w-5" />
          <span>開示</span>
        </button>
        <button
          type="button"
          onClick={() => handleMobileSheetNavClick('image-export')}
          className={`flex min-w-0 flex-col items-center justify-center gap-0.5 text-[9px] transition ${
            mobileSheetView === 'image-export'
              ? 'bg-emerald-950/70 text-emerald-300'
              : 'text-gray-400'
          }`}
          aria-label="チャート画像の設定を表示"
        >
          {chartExportStatus?.kind === 'image' ? (
            <LoaderCircle className="h-5 w-5 animate-spin" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
          <span>画像</span>
        </button>
        <button
          type="button"
          onClick={() => handleMobileSheetNavClick('video-export')}
          className={`flex min-w-0 flex-col items-center justify-center gap-0.5 text-[9px] transition ${
            mobileSheetView === 'video-export'
              ? 'bg-cyan-950/70 text-cyan-300'
              : chartExportStatus?.kind === 'video'
                ? 'bg-red-950/70 text-red-300'
                : 'text-gray-400'
          }`}
          aria-label="チャート動画の設定を表示"
        >
          {chartExportStatus?.kind === 'video' ? (
            <Square className="h-4 w-4 fill-current" />
          ) : (
            <Video className="h-5 w-5" />
          )}
          <span>動画</span>
        </button>
      </nav>

    </div>
  );
}
