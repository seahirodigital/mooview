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
  Upload
} from 'lucide-react';

import { Timeframe, ChartPanel, SymbolIndicatorSettings, TickerInfo, Candle, IndicatorLineStyle } from './types';
import { DEFAULT_TICKERS, generateCandles, simulateTick } from './mockData';
import { InteractiveCustomChart } from './components/InteractiveCustomChart';
import { TradingViewWidget } from './components/TradingViewWidget';
import { IndicatorSettingsPanel } from './components/IndicatorSettingsPanel';
import { ValueChainMap } from './components/ValueChainMap';
import { MacroFlowMap } from './components/MacroFlowMap';
import {
  calculateExpressionQuote,
  combineExpressionCandles,
  formatSymbolExpression,
  parseSymbolExpression,
  SymbolExpression,
} from './symbolExpression';
import { getSeriesColor } from './chartSeriesColors';

const DEFAULT_PANEL_HEIGHT = 840;
const DEFAULT_SIDEBAR_WIDTH = 420;
const MIN_SIDEBAR_WIDTH = 164;
const SIDEBAR_NAV_WIDTH = 44;
const DEFAULT_WATCHLIST_TAB_ID = 'watchlist-default';
const DEFAULT_WATCHLIST_SECTION_ID = 'section-default';
const INDICATOR_LINE_STYLES: IndicatorLineStyle[] = ['solid', 'dashed', 'dotted', 'dashdot'];

type SidebarView = 'watchlist' | 'indicators' | 'settings';
type WatchlistColumnKey = 'symbol' | 'price' | 'change';
type SortDirection = 'asc' | 'desc';
type WatchlistImportMode = 'new-tab' | 'active-tab';
type AppView = 'charts' | 'value-chain' | 'macro-flow';

const APP_VIEW_ORDER: AppView[] = ['charts', 'value-chain', 'macro-flow'];
const WATCHLIST_IMPORT_CONCURRENCY = 8;
const CANDLES_CACHE_STORAGE_KEY = 'tv_dashboard_candles_cache_v1';
const CANDLES_CACHE_META_STORAGE_KEY = 'tv_dashboard_candles_cache_meta_v1';
const CANDLES_CACHE_INDEXED_DB_NAME = 'mooview_chart_candles_cache_v1';
const CANDLES_CACHE_INDEXED_DB_STORE = 'values';
const CANDLES_CACHE_INDEXED_DB_CACHE_KEY = 'candles';
const CANDLES_CACHE_INDEXED_DB_META_KEY = 'meta';
const CANDLES_CACHE_TTL_MS = 30_000;
const CANDLES_CACHE_MAX_LENGTH = 180;
const HEADER_TICKER_SYMBOLS_STORAGE_KEY = 'mooview_header_ticker_symbols_v1';
const VALUE_CHAIN_CHART_STATE_STORAGE_KEY = 'mooview_value_chain_chart_state_v1';
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

function normalizePanel(panel: ChartPanel): ChartPanel {
  const normalizedComparisonSymbols = Array.from(new Set(
    (panel.comparisonSymbols || [])
      .map((symbol) => normalizeStoredSymbolValue(symbol))
      .filter(Boolean),
  ));
  const watchlistTabId = typeof panel.watchlistTabId === 'string' && panel.watchlistTabId.trim()
    ? panel.watchlistTabId.trim()
    : undefined;
  return {
    ...panel,
    symbol: normalizeStoredSymbolValue(panel.symbol),
    watchlistTabId,
    comparisonSymbols: normalizedComparisonSymbols.length > 0 ? normalizedComparisonSymbols : panel.comparisonSymbols,
    timeframe: (panel.timeframe as string) === '15m' ? '10m' : panel.timeframe,
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
  const expression = normalizeSymbolExpressionForStorage(symbol);
  return expression ? [expression.left, expression.right] : [normalizeStoredSymbolValue(symbol)];
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

function areSymbolListsEqual(first: string[] = [], second: string[] = []): boolean {
  if (first.length !== second.length) return false;
  return first.every((symbol, index) => symbol === second[index]);
}

function syncPanelToWatchlistTab(panel: ChartPanel, tabId: string, symbols: string[]): ChartPanel {
  if (symbols.length === 0) {
    return {
      ...panel,
      watchlistTabId: tabId,
      comparisonSymbols: [],
    };
  }

  const [primarySymbol, ...comparisonSymbols] = symbols;
  return {
    ...panel,
    symbol: primarySymbol,
    watchlistTabId: tabId,
    comparisonSymbols,
  };
}

function hasWatchlistPanelTargetChanged(current: ChartPanel, next: ChartPanel): boolean {
  return current.symbol !== next.symbol
    || current.watchlistTabId !== next.watchlistTabId
    || !areSymbolListsEqual(current.comparisonSymbols || [], next.comparisonSymbols || []);
}

function resolveCandlesForSymbol(
  symbol: string,
  timeframe: Timeframe,
  cache: Record<string, Candle[]>,
): Candle[] {
  const expression = normalizeSymbolExpressionForStorage(symbol);
  if (!expression) {
    const canonicalSymbol = normalizeStoredSymbolValue(symbol);
    return cache[`${canonicalSymbol}-${timeframe}`] || cache[`${symbol}-${timeframe}`] || [];
  }
  return combineExpressionCandles(
    expression,
    cache[`${expression.left}-${timeframe}`] || [],
    cache[`${expression.right}-${timeframe}`] || [],
    timeframe,
  );
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

function extractWatchlistCsvCandidates(text: string): WatchlistCsvCandidate[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, '').trim());
  const codeIndex = headers.findIndex((header) => header === 'コード' || header.toLowerCase() === 'code');
  const nameIndex = headers.findIndex((header) => header === '銘柄' || header.toLowerCase() === 'name');
  const marketIndex = headers.findIndex((header) => header === '市場' || header.toLowerCase() === 'market');
  if (codeIndex === -1) return [];

  return expandRelativeWatchlistCsvCandidates(rows.slice(1)
    .map((row) => ({
      code: String(row[codeIndex] ?? '').trim(),
      name: String(nameIndex >= 0 ? row[nameIndex] ?? '' : '').trim(),
      market: String(marketIndex >= 0 ? row[marketIndex] ?? '' : '').trim(),
    }))
    .filter((candidate) => candidate.code));
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
        colorHistUp: '#26a69a', 
        colorHistDown: '#ef5350' 
      },
      vrvp: {
        enabled: false,
        rows: 24,
        widthPct: 22,
        colorUp: '#26a69a',
        colorDown: '#ef5350',
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
  const forceCandleRefreshRef = useRef(false);
  const quoteFetchInFlightRef = useRef(false);
  const moomooRealTimeActiveRef = useRef(true);
  const candlesCacheIndexedDbHydratedRef = useRef(false);
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
  const [draggedTicker, setDraggedTicker] = useState<{
    symbol: string;
    symbols: string[];
    sectionId: string;
  } | null>(null);
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
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

  // Watchlist multiple selection and right-click delete state
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [lastClickedSymbol, setLastClickedSymbol] = useState<string | null>(null);
  const [watchlistContextMenu, setWatchlistContextMenu] = useState<{
    x: number;
    y: number;
    symbols: string[];
    sectionId: string;
  } | null>(null);

  // Custom Grid Layout dimensions (max 9x9)
  const [gridRows, setGridRows] = useState<number>(() => readStoredValue('tv_dashboard_grid_rows', 2));
  const [gridCols, setGridCols] = useState<number>(() => readStoredValue('tv_dashboard_grid_cols', 2));
  const [gridPickerOpen, setGridPickerOpen] = useState<boolean>(false);
  // Watchlist tabs overflow dropdown open state
  const [tabsDropdownOpen, setTabsDropdownOpen] = useState<boolean>(false);
  const watchlistTabsViewportRef = useRef<HTMLDivElement | null>(null);
  const watchlistTabRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
        timeframe: '5m',
        zoomFactor: 12,
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
        timeframe: '10m',
        zoomFactor: 12,
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
      timeframe: '1d',
      zoomFactor: 8,
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

  useEffect(() => {
    if (appView !== 'macro-flow') return;
    forceCandleRefreshRef.current = true;
    setValueChainChartState((current) => (
      current.timeframe === '1d'
        ? current
        : { ...current, timeframe: '1d', zoomFactor: Math.max(current.zoomFactor, 8) }
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

    const hydrateCandlesCache = async () => {
      try {
        const [indexedDbCache, indexedDbMeta] = await Promise.all([
          readCandlesCacheIndexedDb<unknown>(CANDLES_CACHE_INDEXED_DB_CACHE_KEY),
          readCandlesCacheIndexedDb<unknown>(CANDLES_CACHE_INDEXED_DB_META_KEY),
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
        console.warn('ローソク足キャッシュのIndexedDB読み込みに失敗しました。', error);
      } finally {
        clearVolatileStorageCache();
        candlesCacheIndexedDbHydratedRef.current = true;
      }
    };

    void hydrateCandlesCache();
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
    writeStoredJson('tv_dashboard_active_watchlist_tab', activeWatchlistTabId);
  }, [activeWatchlistTabId]);

  useEffect(() => {
    writeStoredJson('tv_dashboard_panels', panels);
  }, [panels]);

  useEffect(() => {
    writeStoredJson(VALUE_CHAIN_CHART_STATE_STORAGE_KEY, valueChainChartState);
  }, [valueChainChartState]);

  useEffect(() => {
    const saveTimer = window.setTimeout(() => {
      if (!candlesCacheIndexedDbHydratedRef.current) return;
      void Promise.all([
        writeCandlesCacheIndexedDb(
          CANDLES_CACHE_INDEXED_DB_CACHE_KEY,
          compactCandlesCache(candlesCache),
        ),
        writeCandlesCacheIndexedDb(
          CANDLES_CACHE_INDEXED_DB_META_KEY,
          candleFetchTimestampsRef.current,
        ),
      ])
        .then(() => clearVolatileStorageCache())
        .catch((error) => console.warn('ローソク足キャッシュのIndexedDB保存に失敗しました。', error));
    }, 600);
    return () => window.clearTimeout(saveTimer);
  }, [candlesCache]);

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
    if (!gridPickerOpen && !tabsDropdownOpen && !watchlistImportMenuOpen) return;
    const handleOutsideClick = () => {
      setGridPickerOpen(false);
      setTabsDropdownOpen(false);
      setWatchlistImportMenuOpen(false);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [gridPickerOpen, tabsDropdownOpen, watchlistImportMenuOpen]);

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
    }
    setMoomooRealTimeActive((active) => !active);
  };

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
      const forceRefresh = forceCandleRefreshRef.current;
      const requests = new Map<string, { symbol: string; timeframe: Timeframe; lookupQueries: string[] }>();
      const addCandleRequest = (rawSymbol: string, timeframe: Timeframe) => {
        getStoredSymbolOperands(rawSymbol).forEach((symbol) => {
          const key = `${symbol}-${timeframe}`;
          const existing = requests.get(key);
          const lookupQueries = Array.from(new Set([
            ...(existing?.lookupQueries || []),
            rawSymbol,
            symbol,
          ].map((query) => query.trim()).filter(Boolean)));
          requests.set(key, {
            symbol,
            timeframe,
            lookupQueries,
          });
        });
      };

      panels.forEach((panel) => {
        addCandleRequest(panel.symbol, panel.timeframe);
        panel.comparisonSymbols?.forEach((symbol) => {
          addCandleRequest(symbol, panel.timeframe);
        });
      });
      valueChainChartSymbols.forEach((chartSymbol) => {
        addCandleRequest(chartSymbol, valueChainChartState.timeframe);
      });

      const requestsToFetch = Array.from(requests.entries()).filter(([key]) => {
        const cachedCandles = candlesCache[key];
        const lastFetchedAt = candleFetchTimestampsRef.current[key] ?? 0;
        return forceRefresh || !cachedCandles?.length || now - lastFetchedAt > CANDLES_CACHE_TTL_MS;
      });

      if (requestsToFetch.length === 0) {
        forceCandleRefreshRef.current = false;
        setMoomooStatus('connected');
        setMoomooError(null);
        return;
      }

      candleFetchInFlightRef.current = true;
      const updatedCache: Record<string, Candle[]> = {};
      const successfulKeys = new Set<string>();
      const failedErrors: Record<string, string> = {};
      let firstError: string | null = null;
      const fetchCandlesForSymbol = async (symbol: string, timeframe: Timeframe) => {
        const { data } = await fetchJsonWithTimeout('/api/moomoo/kline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol,
            timeframe,
            reqNum: 150
          })
        }, 25_000);
        const candles = Array.isArray(data.candles) ? data.candles as Candle[] : [];
        return {
          candles: data.success && candles.length > 0 ? candles : [],
          error: data.error ? String(data.error) : null,
        };
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
        await Promise.all(requestsToFetch.map(async ([key, request]) => {
          try {
            const directResult = await fetchCandlesForSymbol(request.symbol, request.timeframe);
            if (directResult.candles.length > 0) {
              updatedCache[key] = directResult.candles;
              successfulKeys.add(key);
              return;
            }

            const fallbackSymbol = await findFallbackSymbol(request);
            if (fallbackSymbol) {
              const fallbackResult = await fetchCandlesForSymbol(fallbackSymbol, request.timeframe);
              if (fallbackResult.candles.length > 0) {
                const fallbackKey = `${fallbackSymbol}-${request.timeframe}`;
                updatedCache[key] = fallbackResult.candles;
                updatedCache[fallbackKey] = fallbackResult.candles;
                successfulKeys.add(key);
                successfulKeys.add(fallbackKey);
                return;
              }
            }

            const message = formatCandleLookupError(request.lookupQueries[0] || request.symbol);
            failedErrors[key] = directResult.error ? `${message}（${directResult.error}）` : message;
            firstError ||= failedErrors[key];
          } catch (error) {
            const message = formatCandleLookupError(request.lookupQueries[0] || request.symbol);
            failedErrors[key] = `${message}（${error instanceof Error ? error.message : String(error)}）`;
            firstError ||= failedErrors[key];
          }
        }));

        if (!moomooRealTimeActiveRef.current) return;

        if (Object.keys(updatedCache).length > 0) {
          const fetchedAt = Date.now();
          Object.keys(updatedCache).forEach((key) => {
            candleFetchTimestampsRef.current[key] = fetchedAt;
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
        if (shouldRefetch) {
          setTickTrigger((current) => current + 1);
        }
      }
    };

    fetchMoomooCandles();
  }, [panels, valueChainChartState.timeframe, valueChainChartSymbols, moomooRealTimeActive, tickTrigger]);

  useEffect(() => {
    if (!moomooRealTimeActive || quoteFetchInFlightRef.current || tickers.length === 0) return;

    const fetchMoomooQuotes = async () => {
      quoteFetchInFlightRef.current = true;
      try {
        const quoteSymbols = Array.from(new Set(
          tickers.flatMap((ticker) => getStoredSymbolOperands(ticker.symbol)),
        ));
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
      }
    };

    fetchMoomooQuotes();
  }, [tickers, moomooRealTimeActive, tickTrigger]);

  // --- REAL-TIME DATA SIMULATOR IN BACKGROUND ---
  // Periodically triggers updates. Mutates simulated candles only when moomoo API is disabled
  useEffect(() => {
    const interval = setInterval(() => {
      setTickTrigger(prev => prev + 1);
      setNetworkLatency(moomooRealTimeActive ? 12 : Math.floor(15 + Math.random() * 20));
      setLastApiSyncTime(formatClockTime());
      
      if (moomooRealTimeActive) {
        // If we connect to Moomoo, we already fetch real data in the fetcher effect.
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
  }, [panels, moomooRealTimeActive]);

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
    const remainingTabs = watchlistTabs.filter((tab) => tab.id !== tabId);
    setWatchlistTabs(remainingTabs);
    if (activeWatchlistTabId === tabId) {
      setActiveWatchlistTabId(remainingTabs[0]?.id ?? DEFAULT_WATCHLIST_TAB_ID);
    }
  };

  const selectWatchlistTab = (tabId: string) => {
    setActiveWatchlistTabId(tabId);
  };

  const handleWatchlistTabContextMenu = (event: React.MouseEvent, tabId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setTabsDropdownOpen(false);
    setWatchlistTabMenu({
      tabId,
      x: event.clientX,
      y: event.clientY,
    });
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
  };

  const addSymbolsToActiveWatchlist = (symbols: string[]) => {
    const uniqueSymbols = Array.from(new Set(symbols.filter(Boolean)));
    if (uniqueSymbols.length === 0) return;

    updateActiveWatchlistTab((tab) => {
      const existingSymbols = new Set(tab.sections.flatMap((section) => section.symbols));
      const symbolsToAdd = uniqueSymbols.filter((symbol) => !existingSymbols.has(symbol));
      if (symbolsToAdd.length === 0) {
        return tab;
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

  const addSymbolsToNewWatchlistTab = (symbols: string[], fileName: string) => {
    const uniqueSymbols = Array.from(new Set(symbols.filter(Boolean)));
    if (uniqueSymbols.length === 0) return;

    const tabId = createId('watchlist-import');
    const sectionId = createId('section-import');
    const baseName = fileName.replace(/\.[^.]+$/, '').trim();
    const tabName = (baseName || 'インポート').slice(0, 24);

    setWatchlistTabs((currentTabs) => [
      ...currentTabs,
      {
        id: tabId,
        name: tabName,
        sections: [{
          id: sectionId,
          name: 'インポート',
          collapsed: false,
          symbols: uniqueSymbols,
        }],
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
              watchlistTabId: undefined,
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
    setWatchlistImportMenuOpen(false);
    window.setTimeout(() => csvImportInputRef.current?.click(), 0);
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
          importedSymbols.push(result.ticker.symbol);
        });

        totalUnverifiedQuoteCount += unverifiedQuoteCount;

        const finalImportedSymbols = Array.from(new Set(importedSymbols));
        if (finalImportedSymbols.length === 0) {
          continue;
        }

        if (importMode === 'new-tab') {
          addSymbolsToNewWatchlistTab(finalImportedSymbols, file.name);
        } else {
          addSymbolsToActiveWatchlist(finalImportedSymbols);
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
      timeframe: '5m',
      zoomFactor: 12,
      scrollOffsetPct: 100,
      showRsi: !fallbackIsExpression,
      showMacd: false,
      showVolume: !fallbackIsExpression,
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

  const handleSelectWatchlistTabForPanel = (panelId: string, tabId: string) => {
    const tabSymbols = watchlistTabSymbolsById.get(tabId) || [];
    setPanels((currentPanels) =>
      currentPanels.map((panel) =>
        panel.id === panelId
          ? syncPanelToWatchlistTab(panel, tabId, tabSymbols)
          : panel
      )
    );
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
            ...normalizedTicker,
            currentPrice: Number.isFinite(expressionPrice) ? expressionPrice : null,
            computedChange: Number.isFinite(expressionChange) ? expressionChange : null,
          };
        }
        const quote = quoteCache[normalizedTicker.symbol];
        const quotePrice = Number(quote?.price);
        const quoteChange = Number(quote?.changePct);
        return {
          ...normalizedTicker,
          currentPrice: Number.isFinite(quotePrice) ? quotePrice : null,
          computedChange: Number.isFinite(quoteChange) ? quoteChange : null,
          marketCap: quote?.marketCap,
        };
      }

      const cached = resolveCandlesForSymbol(normalizedTicker.symbol, '5m', candlesCache);
      const curPrice = cached && cached.length > 0 ? Number(cached[cached.length - 1].close) : normalizedTicker.basePrice;
      const initialPrice = cached && cached.length > 0 ? Number(cached[0].close) : normalizedTicker.basePrice;
      const changePct = cached.length > 1 && initialPrice !== 0
        ? ((curPrice - initialPrice) / Math.abs(initialPrice)) * 100
        : normalizedTicker.dailyChangePct;
      return {
        ...normalizedTicker,
        currentPrice: Number.isFinite(curPrice) ? curPrice : null,
        computedChange: Number.isFinite(changePct) ? changePct : null,
      };
    });
  }, [tickers, candlesCache, quoteCache, moomooRealTimeActive]);

  const tickerStatsBySymbol = useMemo(() => {
    return new Map(liveTickerStats.map((ticker) => [ticker.symbol, ticker]));
  }, [liveTickerStats]);

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
  const activeWatchlistTabIndex = watchlistTabs.findIndex((tab) => tab.id === activeWatchlistTabId);
  const canJumpToFirstWatchlistTab = watchlistTabs.length > 1 && activeWatchlistTabIndex > 0;
  const canJumpToLastWatchlistTab =
    watchlistTabs.length > 1 &&
    activeWatchlistTabIndex >= 0 &&
    activeWatchlistTabIndex < watchlistTabs.length - 1;

  useEffect(() => {
    setPanels((currentPanels) => {
      let changed = false;
      const nextPanels = currentPanels.map((panel) => {
        if (!panel.watchlistTabId) return panel;

        if (!watchlistTabSymbolsById.has(panel.watchlistTabId)) {
          changed = true;
          return { ...panel, watchlistTabId: undefined };
        }

        const syncedPanel = syncPanelToWatchlistTab(
          panel,
          panel.watchlistTabId,
          watchlistTabSymbolsById.get(panel.watchlistTabId) || [],
        );
        if (!hasWatchlistPanelTargetChanged(panel, syncedPanel)) return panel;
        changed = true;
        return syncedPanel;
      });
      return changed ? nextPanels : currentPanels;
    });
  }, [watchlistTabSymbolsById]);

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
            name: formatWatchlistSymbol(normalizedSymbol),
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
  }, [activeWatchlistTab, tickerStatsBySymbol, watchlistSort]);

  const getComparableSymbolsForPanel = (
    panel: ChartPanel,
    symbols: string[],
  ): string[] => {
    const currentComparisons = new Set(panel.comparisonSymbols || []);
    return Array.from(new Set(symbols)).filter((symbol) => {
      if (!symbol || symbol === panel.symbol || currentComparisons.has(symbol)) return false;
      const ticker = tickerStatsBySymbol.get(symbol);
      return !moomooRealTimeActive || ticker?.currentPrice !== null;
    });
  };

  const addComparisonSymbolsToPanel = (panel: ChartPanel, symbols: string[]) => {
    const symbolsToAdd = getComparableSymbolsForPanel(panel, symbols);
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

  const getDraggedTickerSymbols = () => {
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
    const resolvedChartCandles = resolveCandlesForSymbol(symbol, valueChainChartState.timeframe, candlesCache);
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
        comparisonCandles={
          comparableSymbols.reduce((acc, comparisonSymbol) => {
            const candles = resolveCandlesForSymbol(
              comparisonSymbol,
              valueChainChartState.timeframe,
              candlesCache,
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
                        !hasRealQuote ? 'text-gray-500' : pos ? 'text-[#26a69a]' : 'text-[#ef5350]'
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
                    const panelExpression = normalizeSymbolExpressionForStorage(panel.symbol);
                    const pCandles = resolveCandlesForSymbol(panel.symbol, panel.timeframe, candlesCache);
                    const pCandleError = getCandleFetchError(panel.symbol, panel.timeframe);
                    const pSettings = panelExpression
                      ? createDefaultIndicatorSettings(panel.symbol)
                      : indicatorDatabase[panel.symbol.toUpperCase()] || createDefaultIndicatorSettings(panel.symbol);
                    const isTvEmbed = Boolean(panelEngineToggle[panel.id]) && !panelExpression;
                    const selectedComparisonCandidates = getComparableSymbolsForPanel(panel, selectedSymbols);

                    return (
                      <React.Fragment key={panel.id}>
                        <div
                          id={`chart-panel-container-${panel.id}`}
                          style={{
                            height: `${panelHeights[panel.id] ?? DEFAULT_PANEL_HEIGHT}px`,
                          }}
                          onDragOver={(event) => {
                            if (draggedTicker && !isTvEmbed) {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = 'copy';
                            }
                          }}
                          onDrop={(event) => {
                            if (!draggedTicker || isTvEmbed) return;
                            event.preventDefault();
                            event.stopPropagation();
                            addComparisonSymbolsToPanel(panel, getDraggedTickerSymbols());
                            setDraggedTicker(null);
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
                                      const canCompare = !moomooRealTimeActive || t.currentPrice !== null;
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
                                <select
                                  id={`select-watchlist-tab-${panel.id}`}
                                  value={panel.watchlistTabId || ''}
                                  onChange={(event) => handleSelectWatchlistTabForPanel(panel.id, event.target.value)}
                                  className="max-w-[190px] bg-[#171717] border border-[#2a2a2a] text-white rounded text-xs px-2 py-0.5 font-bold outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                                  title="比較表示するタブを選択"
                                >
                                  <option value="" disabled>リストを選択</option>
                                  {watchlistTabs.map((tab) => (
                                    <option key={tab.id} value={tab.id}>
                                      {tab.name} ({watchlistTabSymbolsById.get(tab.id)?.length ?? 0})
                                    </option>
                                  ))}
                                </select>

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
                                  {(['1m', '3m', '5m', '10m', '30m', '1h', '4h', '1d', '1w', '1mo'] as Timeframe[]).map((tf) => (
                                    <button
                                      key={tf}
                                      onClick={() => handleUpdatePanel(panel.id, { timeframe: tf })}
                                      className={`px-1.5 py-0.5 text-[10px] rounded font-bold transition-colors ${
                                        panel.timeframe === tf 
                                          ? 'bg-emerald-500 text-black'
                                          : 'text-gray-400 hover:text-white hover:bg-[#111111]'
                                      }`}
                                    >
                                      {tf === '1mo' ? '1M' : tf === '1d' ? 'day' : tf === '1w' ? 'Week' : tf}
                                    </button>
                                  ))}
                                </div>

                                {/* ENGINE SELECT SWITCH */}
                                <button
                                  onClick={() => {
                                    if (!panelExpression) togglePanelEngine(panel.id);
                                  }}
                                  disabled={Boolean(panelExpression)}
                                  className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase transition-colors ${
                                    panelExpression
                                      ? 'bg-[#171717] text-gray-500 border border-[#2a2a2a] cursor-not-allowed'
                                    : isTvEmbed
                                      ? 'bg-purple-950/80 text-purple-300 border border-purple-800' 
                                      : 'bg-emerald-950/80 text-emerald-300 border border-emerald-900'
                                  }`}
                                  title={panelExpression
                                    ? '演算式はカスタムチャートで描画します'
                                    : 'TradingView公式ライブウィジェットとカスタムチャートを切り替えます'}
                                >
                                  {panelExpression ? '演算式' : isTvEmbed ? 'TradingView公式' : 'カスタム' }
                                </button>

                              </div>

                              {/* ACTIONS AND PANEL REMOVAL (MINUS BUTTON) */}
                              <div className="flex items-center space-x-2 shrink-0">
                                
                                {/* Quick setting indicators toggles */}
                                {!isTvEmbed && (
                                  <div className="hidden sm:flex items-center space-x-1.5 bg-[#171717]/70 px-2 py-0.5 rounded text-[10px]">
                                    <button
                                      onClick={() => {
                                        if (!panelExpression) handleUpdatePanel(panel.id, { showVolume: !panel.showVolume });
                                      }}
                                      disabled={Boolean(panelExpression)}
                                      className={`px-1 rounded ${!panelExpression && panel.showVolume ? 'text-[#26a69a] font-bold bg-[#142d2a]' : 'text-gray-500'} ${panelExpression ? 'cursor-not-allowed opacity-50' : ''}`}
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
                                        addComparisonSymbolsToPanel(panel, selectedSymbols);
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
                                  symbol={panel.symbol} 
                                  timeframe={panel.timeframe} 
                                  containerId={panel.id} 
                                  height={panelHeights[panel.id] ?? DEFAULT_PANEL_HEIGHT}
                                />
                              ) : (
                                <InteractiveCustomChart 
                                  symbol={panel.symbol}
                                  candles={pCandles}
                                  timeframe={panel.timeframe}
                                  indicatorSettings={pSettings}
                                  zoomFactor={panel.zoomFactor}
                                  setZoomFactor={(zf) => handleUpdatePanel(panel.id, { zoomFactor: zf })}
                                  scrollOffsetPct={panel.scrollOffsetPct}
                                  setScrollOffsetPct={(offset) => handleUpdatePanel(panel.id, { scrollOffsetPct: offset })}
                                  showVolume={!panelExpression && panel.showVolume}
                                  showRsi={!panelExpression && panel.showRsi}
                                  showMacd={!panelExpression && panel.showMacd}
                                  comparisonSymbols={panel.comparisonSymbols || []}
                                  comparisonCandles={
                                    (panel.comparisonSymbols || []).reduce((acc, compSym) => {
                                      const candles = resolveCandlesForSymbol(
                                        compSym,
                                        panel.timeframe,
                                        candlesCache,
                                      );
                                      if (candles.length > 0) {
                                        acc[compSym] = candles;
                                      }
                                      return acc;
                                    }, {} as Record<string, Candle[]>)
                                  }
                                  emptyMessage={pCandleError ?? (moomooRealTimeActive ? 'Moomoo実データを取得中...' : 'デモデータを生成中...')}
                                  priceScale={panel.priceScale ?? 1}
                                  setPriceScale={(scale) => handleUpdatePanel(panel.id, { priceScale: scale })}
                                  priceOffsetPct={panel.priceOffsetPct ?? 0}
                                  setPriceOffsetPct={(offset) => handleUpdatePanel(panel.id, { priceOffsetPct: offset })}
                                  rsiHeightPct={panel.rsiHeightPct ?? 25}
                                  setRsiHeightPct={(pct) => handleUpdatePanel(panel.id, { rsiHeightPct: pct })}
                                  macdHeightPct={panel.macdHeightPct ?? 25}
                                  setMacdHeightPct={(pct) => handleUpdatePanel(panel.id, { macdHeightPct: pct })}
                                  onOpenIndicatorSettings={() => openIndicatorSettingsForSymbol(panel.symbol)}
                                  onRemoveComparisonSymbol={(symbol) => {
                                    handleUpdatePanel(panel.id, {
                                      comparisonSymbols: (panel.comparisonSymbols || []).filter((item) => item !== symbol),
                                    });
                                  }}
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
          <div className="flex-1 min-h-0 bg-[#0b0b0b] overflow-hidden flex flex-col relative">
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
                  return (
                    <div
                      key={tab.id}
                      ref={(element) => {
                        watchlistTabRefs.current[tab.id] = element;
                      }}
                      className={`h-7 shrink-0 min-w-[44px] max-w-28 px-2 border border-b-0 flex items-center transition-all ${
                        active
                          ? 'bg-[#0b0b0b] border-[#343434] text-white font-bold'
                          : 'bg-[#070707] border-[#202020] text-gray-500 hover:text-gray-200'
                      }`}
                      style={{ width: 'auto' }}
                      onDoubleClick={() => setEditingTabId(tab.id)}
                      onContextMenu={(event) => handleWatchlistTabContextMenu(event, tab.id)}
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
                          onClick={() => selectWatchlistTab(tab.id)}
                          className="w-full min-w-0 text-[10px] text-left truncate cursor-pointer"
                          title={tab.name}
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
                      onClick={(e) => { e.stopPropagation(); setTabsDropdownOpen((v) => !v); }}
                      className={`w-7 h-7 border border-b-0 border-[#1e2232] flex items-center justify-center cursor-pointer transition-colors ${
                        tabsDropdownOpen ? 'text-white bg-[#171717]' : 'text-gray-400 hover:text-white hover:bg-[#171717]'
                      }`}
                      title="ウォッチリスト一覧"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${tabsDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {tabsDropdownOpen && (
                      <div
                        className="absolute right-0 top-full w-40 bg-[#080808] border border-[#343434] py-1 shadow-2xl z-50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {watchlistTabs.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => { selectWatchlistTab(t.id); setTabsDropdownOpen(false); }}
                            className={`w-full text-left px-2.5 py-1.5 text-[10px] hover:bg-[#171717] truncate cursor-pointer block ${
                              t.id === activeWatchlistTabId ? 'text-emerald-400 font-bold bg-[#10251f]' : 'text-gray-300'
                            }`}
                          >
                            {t.name}
                          </button>
                        ))}
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
                      setWatchlistImportMenuOpen((open) => !open);
                    }}
                    disabled={watchlistImporting}
                    className="w-7 h-7 border border-b-0 border-[#202020] text-gray-400 hover:text-white hover:bg-[#171717] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer"
                    aria-label="CSVをインポート"
                    title={watchlistImporting ? 'CSVをインポート中' : 'CSVをインポート'}
                  >
                    <Upload className={`w-3.5 h-3.5 ${watchlistImporting ? 'animate-spin text-emerald-300' : ''}`} />
                  </button>
                  {watchlistImportMenuOpen && !watchlistImporting && (
                    <div
                      className="absolute right-0 top-full z-50 w-56 bg-[#080808] border border-[#343434] py-1 shadow-2xl text-[10px] text-gray-200"
                      onClick={(event) => event.stopPropagation()}
                    >
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
                className="fixed z-50 w-36 bg-[#080808] border border-[#343434] shadow-2xl py-1 text-[10px] text-gray-200"
                style={{ left: watchlistTabMenu.x, top: watchlistTabMenu.y }}
                onClick={(event) => event.stopPropagation()}
              >
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

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
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
                      draggable={editingSectionId !== section.id}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        setDraggedTicker(null);
                        setDraggedSectionId(section.id);
                      }}
                      onDragEnd={() => setDraggedSectionId(null)}
                      onDragOver={(event) => {
                        if (draggedSectionId) {
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
                      const hasQuote = Number.isFinite(currentPrice) && Number.isFinite(computedChange);
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
                              {formatTickerPrice(ticker.symbol, currentPrice)}
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
                className="fixed z-50 w-44 bg-[#080808] border border-[#343434] shadow-2xl py-1 text-[10px] text-gray-200"
                style={{ left: watchlistContextMenu.x, top: watchlistContextMenu.y }}
                onClick={(event) => event.stopPropagation()}
              >
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
              <span className="inline-flex w-2 h-2 rounded-full bg-[#26a69a] animate-pulse" />
            </div>
            <div className="h-px bg-gray-800/60" />
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="flex items-center space-x-1.5 text-gray-400">
                <Database className="w-3.5 h-3.5 text-[#26a69a]" />
                <span>Moomoo OpenAPI:</span>
              </span>
              <span className="text-gray-200 font-bold">
                {moomooStatus === 'connected' ? '接続中' : moomooStatus === 'error' ? '接続エラー' : '確認中'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-gray-400">応答速度:</span>
              <span className="text-[#26a69a] font-bold">{networkLatency}ms</span>
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
            <span className="w-1.5 h-1.5 rounded-full bg-[#26a69a]"></span>
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
