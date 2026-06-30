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
  ArrowUpDown
} from 'lucide-react';

import { Timeframe, ChartDisplayRange, ChartPanel, SymbolIndicatorSettings, TickerInfo, Candle, IndicatorLineStyle, ComparisonLabelLayoutMode } from './types';
import { DEFAULT_TICKERS, generateCandles, simulateTick } from './mockData';
import { InteractiveCustomChart } from './components/InteractiveCustomChart';
import { TradingViewWidget } from './components/TradingViewWidget';
import { IndicatorSettingsPanel } from './components/IndicatorSettingsPanel';
import { ValueChainMap } from './components/ValueChainMap';
import { MacroFlowMap, getMacroFlowDefaultWatchlistChain } from './components/MacroFlowMap';
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

const DEFAULT_PANEL_HEIGHT = 840;
const DEFAULT_SIDEBAR_WIDTH = 420;
const MIN_SIDEBAR_WIDTH = 164;
const SIDEBAR_NAV_WIDTH = 44;
const DEFAULT_WATCHLIST_TAB_ID = 'watchlist-default';
const DEFAULT_WATCHLIST_SECTION_ID = 'section-default';
const WATCHLIST_TARGET_SEPARATOR = '::section::';
const INDICATOR_LINE_STYLES: IndicatorLineStyle[] = ['solid', 'dashed', 'dotted', 'dashdot'];

type SidebarView = 'watchlist' | 'indicators' | 'settings';
type WatchlistColumnKey = 'symbol' | 'price' | 'change';
type SortDirection = 'asc' | 'desc';
type WatchlistImportMode = 'new-tab' | 'active-tab';
type WatchlistTransferMenuLayer = 'root' | 'import' | 'export';
type WatchlistQuoteFetchMode = 'manual' | 'auto';
type WatchlistQuoteFetchSource = 'manual' | 'auto';
type WatchlistTabDropPosition = 'before' | 'after';
type AppView = 'charts' | 'value-chain' | 'macro-flow';

const APP_VIEW_ORDER: AppView[] = ['charts', 'value-chain', 'macro-flow'];
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
const KLINE_FETCH_BATCH_LIMIT = 60;
const KLINE_FETCH_BATCH_COOLDOWN_MS = 30_000;
const KLINE_RATE_LIMIT_RETRY_MS = 30_000;
const WATCHLIST_QUOTE_BATCH_LIMIT = 200;
const WATCHLIST_QUOTE_RATE_LIMIT_RETRY_MS = 10_000;
const WATCHLIST_AUTO_QUOTE_REFRESH_INTERVAL_MS = 30_000;
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
const DAY_RANGE_OVERVIEW_TIMEFRAME: Timeframe = '5m';
const WEEK_RANGE_OVERVIEW_TIMEFRAME: Timeframe = '30m';
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

function normalizeComparisonLabelLayoutMode(value: unknown): ComparisonLabelLayoutMode {
  return value === 'rank' || value === 'stack' ? value : 'changePct';
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

function getAutoWatchlistQuoteRefreshSignature(
  tabs: WatchlistTab[],
  modes: Record<string, WatchlistQuoteFetchMode>,
): string {
  return tabs
    .flatMap((tab) => {
      if (getWatchlistQuoteFetchMode(modes, tab.id) !== 'auto') return [];
      const symbols = getQuoteOperandSymbolsForWatchlistSymbols(getWatchlistTabSymbols(tab));
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
  const csvImportInputRef = useRef<HTMLInputElement | null>(null);
  const watchlistImportModeRef = useRef<WatchlistImportMode>('new-tab');
  const candleFetchInFlightRef = useRef(false);
  const candleFetchPendingRef = useRef(false);
  const candleRetryTimerRef = useRef<number | null>(null);
  const forceCandleRefreshRef = useRef(false);
  const initialVisibleChartRefreshRef = useRef(true);
  const quoteFetchInFlightRef = useRef(false);
  const quoteFetchPendingRef = useRef(false);
  const quoteFetchManualTabQueueRef = useRef<string[]>([]);
  const quoteFetchAutoSweepRequestedRef = useRef(false);
  const quoteFetchAutoAttemptedTabIdsRef = useRef<Set<string>>(new Set());
  const quoteFetchLastAutoSweepAtRef = useRef(0);
  const watchlistAutoQuoteSignatureRef = useRef<string | null>(null);
  const watchlistTabSuppressClickRef = useRef(false);
  const moomooRealTimeActiveRef = useRef(true);
  const candlesCacheIndexedDbHydratedRef = useRef(false);
  const quoteCacheIndexedDbHydratedRef = useRef(false);
  const watchlistSyncSignatureRef = useRef<string | null>(null);
  const [appView, setAppView] = useState<AppView>(() =>
    readStoredValue('mooview_active_view', 'charts')
  );
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
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

  // Active panel ID currently displaying comparison symbol overlay selector
  const [activeComparisonPopoverPanelId, setActiveComparisonPopoverPanelId] = useState<string | null>(null);

  // Resize weights for resizable bento grid layout
  const [colWeights, setColWeights] = useState<Record<string, number>>(() =>
    readStoredValue('tv_dashboard_column_widths', {})
  );
  const [panelHeights, setPanelHeights] = useState<Record<string, number>>(() =>
    readStoredValue('tv_dashboard_panel_heights', {})
  );

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

  const getWatchlistTabQuoteOperands = (tab: WatchlistTab | null | undefined): string[] => {
    return Array.from(new Set(
      getQuoteOperandSymbolsForWatchlistSymbols(getWatchlistTabSymbols(tab))
        .map((symbol) => normalizeStoredSymbolValue(symbol))
        .filter(Boolean),
    ));
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

  const queueWatchlistQuoteRefreshes = (tabIds: Array<string | null | undefined>) => {
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
    const retrySymbols = Array.from(new Set(
      refreshTabs.flatMap((tab) => getWatchlistTabQuoteOperands(tab)),
    ));
    quoteFetchManualTabQueueRef.current = [
      ...refreshTabs.map((tab) => tab.id),
      ...quoteFetchManualTabQueueRef.current.filter((queuedTabId) => !seenTabIds.has(queuedTabId)),
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
  };

  useEffect(() => {
    const signature = getAutoWatchlistQuoteRefreshSignature(watchlistTabs, watchlistQuoteFetchModes);
    if (watchlistAutoQuoteSignatureRef.current === signature) return;
    watchlistAutoQuoteSignatureRef.current = signature;
    if (!signature) return;
    requestAutoWatchlistQuoteRefresh(true);
  }, [watchlistTabs, watchlistQuoteFetchModes]);

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
    if (candleFetchInFlightRef.current) {
      candleFetchPendingRef.current = true;
      return;
    }

    const fetchMoomooCandles = async () => {
      const now = Date.now();
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
          const key = `${symbol}-${timeframe}`;
          const existing = requests.get(key);
          const normalizedSymbol = normalizeStoredSymbolValue(symbol);
          const activePriority = activeWatchlistSymbolSet.has(normalizedSymbol)
            ? requestPriority - 1_000
            : requestPriority;
          const lookupQueries = Array.from(new Set([
            ...(existing?.lookupQueries || []),
            rawSymbol,
            symbol,
          ].map((query) => query.trim()).filter(Boolean)));
          requests.set(key, {
            symbol,
            timeframe,
            lookupQueries,
            priority: Math.min(existing?.priority ?? activePriority, activePriority),
          });
        });
      };

      const panelPriorityOffset = appView === 'charts' ? 0 : 5_000;
      const valueChainPriorityOffset = appView === 'charts' ? 10_000 : 0;

      panels.forEach((panel, panelIndex) => {
        const chartSymbols = [panel.symbol, ...(panel.comparisonSymbols || [])];
        const panelPriorityBase = panelPriorityOffset + panelIndex * 10;
        chartSymbols.forEach((symbol) => {
          addCandleRequest(symbol, DAY_RANGE_OVERVIEW_TIMEFRAME, panelPriorityBase);
        });
        const displayRangeTimeframe = getDisplayRangeSeedTimeframe(panel.displayRange);
        if (displayRangeTimeframe && displayRangeTimeframe !== DAY_RANGE_OVERVIEW_TIMEFRAME) {
          chartSymbols.forEach((symbol) => {
            addCandleRequest(symbol, displayRangeTimeframe, panelPriorityBase + 1);
          });
        }
        chartSymbols.forEach((symbol) => {
          addCandleRequest(symbol, panel.timeframe, panelPriorityBase + 2);
        });
      });
      valueChainChartSymbols.forEach((chartSymbol, symbolIndex) => {
        const symbolPriorityBase = valueChainPriorityOffset + symbolIndex * 10;
        addCandleRequest(chartSymbol, DAY_RANGE_OVERVIEW_TIMEFRAME, symbolPriorityBase);
        const displayRangeTimeframe = getDisplayRangeSeedTimeframe(valueChainChartState.displayRange);
        if (displayRangeTimeframe && displayRangeTimeframe !== DAY_RANGE_OVERVIEW_TIMEFRAME) {
          addCandleRequest(chartSymbol, displayRangeTimeframe, symbolPriorityBase + 1);
        }
        addCandleRequest(chartSymbol, valueChainChartState.timeframe, symbolPriorityBase + 2);
      });

      const requestsToFetch = Array.from(requests.entries()).filter(([key]) => {
        const cachedCandles = candlesCache[key];
        const lastFetchedAt = candleFetchTimestampsRef.current[key] ?? 0;
        if (forceRefresh) return true;
        if (!cachedCandles?.length) {
          return now - lastFetchedAt > CANDLES_CACHE_TTL_MS;
        }
        return now - lastFetchedAt > CANDLES_CACHE_TTL_MS;
      }).sort((first, second) => first[1].priority - second[1].priority);

      if (requestsToFetch.length === 0) {
        forceCandleRefreshRef.current = false;
        initialVisibleChartRefreshRef.current = false;
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
      const waitForKlineSlot = async () => {
        if (klineRequestCount > 0 && klineRequestCount % KLINE_FETCH_BATCH_LIMIT === 0) {
          setMoomooStatus('connecting');
          setMoomooError(`KLine制限待機中: ${Math.ceil(KLINE_FETCH_BATCH_COOLDOWN_MS / 1000)}秒後に次の${KLINE_FETCH_BATCH_LIMIT}件を取得します。`);
          await sleep(KLINE_FETCH_BATCH_COOLDOWN_MS);
        }
        klineRequestCount += 1;
      };
      const fetchCandlesForSymbol = async (symbol: string, timeframe: Timeframe) => {
        const requestCandles = async () => {
          await waitForKlineSlot();
          const { response, data } = await fetchJsonWithTimeout('/api/moomoo/kline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbol,
              timeframe,
              reqNum: 150
            })
          }, 25_000);
          const candles = Array.isArray(data.candles) ? data.candles as Candle[] : [];
          const errorMessage = data.error ? String(data.error) : response.ok ? null : `HTTP ${response.status}`;
          return {
            candles: response.ok && data.success && candles.length > 0 ? candles : [],
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

      try {
        for (const [key, request] of requestsToFetch) {
          if (!moomooRealTimeActiveRef.current) break;
          try {
            const directResult = await fetchCandlesForSymbol(request.symbol, request.timeframe);
            if (directResult.candles.length > 0) {
              updatedCache[key] = directResult.candles;
              successfulKeys.add(key);
              continue;
            }

            let shouldRetryKey = directResult.retryable;
            const fallbackSymbol = await findFallbackSymbol(request);
            if (fallbackSymbol) {
              const fallbackResult = await fetchCandlesForSymbol(fallbackSymbol, request.timeframe);
              if (fallbackResult.candles.length > 0) {
                const fallbackKey = `${fallbackSymbol}-${request.timeframe}`;
                updatedCache[key] = fallbackResult.candles;
                updatedCache[fallbackKey] = fallbackResult.candles;
                successfulKeys.add(key);
                successfulKeys.add(fallbackKey);
                continue;
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
        }

        if (!moomooRealTimeActiveRef.current) return;

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
          Object.keys(updatedCache).forEach((key) => {
            candleFetchTimestampsRef.current[key] = attemptedAt;
          });
          setCandlesCache((currentCache) => compactCandlesCache({
            ...currentCache,
            ...updatedCache,
          }));
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
        const shouldRefetch = candleFetchPendingRef.current;
        candleFetchPendingRef.current = false;
        forceCandleRefreshRef.current = false;
        initialVisibleChartRefreshRef.current = false;
        if (shouldRefetch) {
          setTickTrigger((current) => current + 1);
        }
      }
    };

    fetchMoomooCandles();
  }, [activeWatchlistTabId, appView, panels, valueChainChartState.displayRange, valueChainChartState.timeframe, valueChainChartSymbols, moomooRealTimeActive, tickTrigger]);

  useEffect(() => {
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
        const tabId = quoteFetchManualTabQueueRef.current.shift();
        const tab = watchlistTabs.find((item) => item.id === tabId);
        if (!tab) continue;
        const symbols = getWatchlistTabQuoteOperands(tab);
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
      const orderedTabs = [
        ...watchlistTabs.filter((tab) => tab.id === activeWatchlistTabId),
        ...watchlistTabs.filter((tab) => tab.id !== activeWatchlistTabId),
      ];
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
            }, 35_000);
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
        }, 35_000);
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
  }, [activeWatchlistTabId, watchlistTabs, watchlistQuoteFetchModes, quoteCache, moomooRealTimeActive, tickTrigger]);

  // --- REAL-TIME DATA SIMULATOR IN BACKGROUND ---
  // Periodically triggers updates. Mutates simulated candles only when moomoo API is disabled
  useEffect(() => {
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
  }, [panels, moomooRealTimeActive, watchlistTabs, watchlistQuoteFetchModes]);

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
    setSidebarOpen(true);
  };

  const selectTickerForPrimaryChart = (symbol: string) => {
    setFocusedSymbolIndex(symbol);
    setPanels((currentPanels) =>
      currentPanels.map((panel, index) =>
        index === 0
          ? {
              ...panel,
              symbol,
              comparisonOnly: undefined,
              showVolume: true,
              watchlistTabId: undefined,
              watchlistSectionId: undefined,
              comparisonSymbols: (panel.comparisonSymbols || []).filter(
                (comparisonSymbol) => comparisonSymbol !== symbol
              ),
            }
          : panel
      )
    );
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
  const liveTickerStats = useMemo(() => {
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

  const tickerStatsBySymbol = useMemo(() => {
    return new Map(liveTickerStats.map((ticker) => [ticker.symbol, ticker]));
  }, [liveTickerStats]);

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
  ): Candle[] => {
    const normalizedChartSymbol = normalizeStoredSymbolValue(rawSymbol);
    if (!normalizedChartSymbol) return [];

    const seedTimeframes = Array.from(new Set([
      getDisplayRangeSeedTimeframe(displayRange),
      DAY_RANGE_OVERVIEW_TIMEFRAME,
    ].filter((seedTimeframe): seedTimeframe is Timeframe => Boolean(seedTimeframe))));

    const options = { tickerStatsBySymbol, watchlistTabs };
    let chartCandles = resolveCandlesForSymbol(normalizedChartSymbol, timeframe, candlesCache, options);
    for (const seedTimeframe of seedTimeframes) {
      if (chartCandles.length > 0 || seedTimeframe === timeframe) continue;
      chartCandles = resolveCandlesForSymbol(normalizedChartSymbol, seedTimeframe, candlesCache, options);
    }

    if (chartCandles.length === 0) {
      chartCandles = createQuoteFallbackCandlesForSymbol(normalizedChartSymbol);
    }

    if (chartCandles.length === 0 && useDemoFallback) {
      chartCandles = generateCandles(normalizedChartSymbol, timeframe, 220);
    }

    return filterCandlesForDisplayRange(chartCandles, displayRange, normalizedChartSymbol);
  };

  useEffect(() => {
    if (!moomooRealTimeActive) return;

    const missingRequests: string[] = [];
    const missingSymbols = new Set<string>();
    panels.forEach((panel) => {
      const chartSymbols = Array.from(new Set([
        ...(panel.comparisonOnly ? [] : [panel.symbol]),
        ...(panel.comparisonSymbols || []),
      ].map((symbol) => normalizeStoredSymbolValue(symbol)).filter(Boolean)));
      chartSymbols.forEach((symbol) => {
        const candles = resolveChartCandlesForSymbol(symbol, panel.timeframe, panel.displayRange, false);
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
      const ticker = tickerStatsBySymbol.get(symbol);
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
          return tickerStatsBySymbol.get(normalizedSymbol) || {
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
  }, [activeWatchlistTab, tickerStatsBySymbol, watchlistNameOverrides, watchlistSort]);

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
      const ticker = tickerStatsBySymbol.get(symbol);
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

  return (
    <div
      className="min-h-screen bg-[#050505] text-[#d1d4dc] font-sans flex flex-col antialiased selection:bg-emerald-500/25"
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
      <div className="bg-[#080808] border-b border-[#202020] py-2 px-4 shrink-0 overflow-hidden whitespace-nowrap flex items-center gap-4 text-xs">
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
        <div className="flex items-center space-x-4 shrink-0 text-xs text-[#848e9c] select-none">
          <div className="flex flex-col items-end leading-tight font-mono">
            <span className="text-[#d1d4dc]">{currentClockTime}</span>
            <span className="text-[9px] text-[#848e9c]">更新 {lastApiSyncTime}</span>
          </div>
        </div>
      </div>

      {workspaceMenuOpen && (
        <div className="fixed inset-0 z-50" onClick={() => setWorkspaceMenuOpen(false)}>
          <div
            className="absolute left-4 top-11 w-64 bg-[#080808] border border-[#303030] shadow-2xl py-2 text-xs"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-3 pb-2 border-b border-[#242424]">
              <div className="font-bold text-white">MooView メニュー</div>
              <div className="text-[10px] text-gray-500 mt-0.5">分析画面を切り替えます</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setAppView('charts');
                setWorkspaceMenuOpen(false);
              }}
              className={`w-full px-3 py-2.5 text-left flex items-center justify-between hover:bg-[#171717] ${appView === 'charts' ? 'text-emerald-300 bg-[#10251f]' : 'text-gray-200'}`}
            >
              <span>チャートビュー</span>
              {appView === 'charts' && <span className="text-[9px]">表示中</span>}
            </button>
            <button
              type="button"
              onClick={() => {
                setAppView('value-chain');
                setWorkspaceMenuOpen(false);
              }}
              className={`w-full px-3 py-2.5 text-left flex items-center justify-between hover:bg-[#171717] ${appView === 'value-chain' ? 'text-emerald-300 bg-[#10251f]' : 'text-gray-200'}`}
            >
              <span>バリューチェーンマップ</span>
              {appView === 'value-chain' && <span className="text-[9px]">表示中</span>}
            </button>
            <button
              type="button"
              onClick={() => {
                setAppView('macro-flow');
                setWorkspaceMenuOpen(false);
              }}
              className={`w-full px-3 py-2.5 text-left flex items-center justify-between hover:bg-[#171717] ${appView === 'macro-flow' ? 'text-emerald-300 bg-[#10251f]' : 'text-gray-200'}`}
            >
              <span>マクロ資金フロー</span>
              {appView === 'macro-flow' && <span className="text-[9px]">表示中</span>}
            </button>
          </div>
        </div>
      )}

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
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        
        {/* Workspace Panels container */}
        <div className="flex-1 flex flex-col min-h-0 p-3 bg-[#050505] overflow-y-auto">
          
          <div className="flex-1 min-h-0 w-full flex flex-row select-none">
            {colGroups.map((col, colIdx) => (
              <React.Fragment key={colIdx}>
                <div
                  id={`col-group-${colIdx}`}
                  style={{
                    flexGrow: colWeights[`col-${colIdx}`] ?? 100,
                    flexShrink: 1,
                    flexBasis: 0,
                  }}
                  className="flex flex-col min-h-0 min-w-[120px]"
                >
                  {col.map((panel, pIdx) => {
                    const panelSymbol = normalizeStoredSymbolValue(panel.symbol);
                    const panelComparisonSymbols = panel.comparisonSymbols || [];
                    const panelComparisonOnly = Boolean(panel.comparisonOnly);
                    const panelShowPrimaryCandles = panel.showPrimaryCandles !== false;
                    const panelComparisonCandles = panelComparisonSymbols.reduce((acc, compSym) => {
                      const candles = resolveChartCandlesForSymbol(
                        compSym,
                        panel.timeframe,
                        panel.displayRange,
                        !moomooRealTimeActive,
                      );
                      if (candles.length > 0) {
                        acc[compSym] = candles;
                      }
                      return acc;
                    }, {} as Record<string, Candle[]>);
                    const comparisonAnchorSymbol = panelComparisonOnly
                      ? panelComparisonSymbols.find((symbol) => (panelComparisonCandles[symbol]?.length ?? 0) > 0)
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

                    return (
                      <React.Fragment key={panel.id}>
                        <div
                          id={`chart-panel-container-${panel.id}`}
                          style={{
                            height: `${panelHeights[panel.id] ?? DEFAULT_PANEL_HEIGHT}px`,
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
                          className="w-full flex flex-col shrink-0"
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
                            <div className="h-10 border-b border-[#242424] bg-[#111111] px-3 flex items-center justify-between shrink-0 select-none">
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
                                  {(['1m', '3m', '5m', '10m', '30m', '1h', '4h', '1d', '1w', '1mo'] as Timeframe[]).map((tf) => (
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
                                      title={panel.displayRange ? 'D/W表示中は時間足を固定しています' : undefined}
                                    >
                                      {tf === '1mo' ? '1M' : tf === '1d' ? 'day' : tf === '1w' ? 'Week' : tf}
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
                            <div className="flex-1 flex flex-col min-h-0 bg-[#090909]">
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
                                  changePctOverrides={createChartChangePctOverrides(
                                    chartDisplaySymbols,
                                    panel.displayRange,
                                  )}
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
                                />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Drag splitter to change absolute height for every panel */}
                        <div
                          className="h-1.5 bg-[#191919]/80 hover:bg-emerald-500 active:bg-emerald-600 cursor-row-resize transition-colors shrink-0 self-stretch mt-1 mb-2.5 rounded"
                          onMouseDown={(e) => handlePanelHeightResizeMouseDown(e, panel.id)}
                          title="上下にドラッグして高さを変更"
                        />
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Drag splitter between adjacent column groups */}
                {colIdx < colGroups.length - 1 && (
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

        {sidebarOpen && (
          <div
            className="w-1.5 bg-[#191919]/80 hover:bg-emerald-500 active:bg-emerald-600 cursor-col-resize transition-colors shrink-0 self-stretch"
            onMouseDown={handleSidebarResizeMouseDown}
            title="左右にドラッグしてサイドパネル幅を変更"
          />
        )}

        {/* Right-hand Sidebar - 常設アイコンと開閉式パネル */}
        <div
          className="shrink-0 border-l border-[#202020] bg-[#080808] flex overflow-hidden transition-[width] duration-150 ease-out"
          style={{ width: sidebarOpen ? `${sidebarWidth + SIDEBAR_NAV_WIDTH}px` : `${SIDEBAR_NAV_WIDTH}px` }}
        >
          <div
            className={`min-w-0 flex flex-col overflow-hidden transition-[width] duration-150 ease-out ${sidebarOpen ? '' : 'pointer-events-none'}`}
            style={{ width: sidebarOpen ? `${sidebarWidth}px` : '0px' }}
          >

          {/* 1. LAYOUT SCREEN SUBDIVISION CONFIG */}
          <div className="shrink-0 p-2 border-b border-[#242424] relative">
            <div className="mb-1 flex items-center justify-between gap-2 px-1 text-[10px] font-bold">
              <span
                className={`min-w-0 truncate ${
                  quoteFetchInFlight ? 'text-cyan-300' : 'text-gray-500'
                }`}
                title={activeWatchlistQuoteProgress.title}
              >
                {quoteFetchInFlight
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
                    quoteFetchInFlight
                      ? 'border-cyan-700 bg-cyan-950/50 text-cyan-200'
                      : 'border-[#303030] bg-[#101010] text-gray-300 hover:text-white hover:border-emerald-500 hover:bg-emerald-950/40'
                  }`}
                  title="ウォッチリストの価格データを再取得"
                >
                  {quoteFetchInFlight ? '更新中' : '更新'}
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
          {sidebarView === 'watchlist' && (
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
                className="fixed z-50 w-44 bg-[#080808] border border-[#343434] shadow-2xl py-1 text-[10px] text-gray-200"
                style={{ left: watchlistTabMenu.x, top: watchlistTabMenu.y }}
                onClick={(event) => event.stopPropagation()}
              >
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
          {sidebarView === 'indicators' && (
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

          {/* 5. CONNECTION STATUS & PERFORMANCE (Moved to sidebar bottom) */}
          {sidebarView === 'settings' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
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

          </div>

          <nav className="w-11 shrink-0 border-l border-[#242424] bg-[#070707] flex flex-col items-center py-2 gap-1">
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
          </nav>
        </div>

      </div>
      )}

      {/* Footer information panel */}
      <footer className="h-8 border-t border-[#202020] bg-[#080808] shrink-0 flex items-center justify-between px-4 text-[10px] text-[#848e9c]">
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

    </div>
  );
}
