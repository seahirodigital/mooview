import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
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
  Upload
} from 'lucide-react';

import { Timeframe, ChartPanel, SymbolIndicatorSettings, TickerInfo, Candle, IndicatorLineStyle } from './types';
import { DEFAULT_TICKERS, generateCandles, simulateTick } from './mockData';
import { InteractiveCustomChart } from './components/InteractiveCustomChart';
import { TradingViewWidget } from './components/TradingViewWidget';
import { IndicatorSettingsPanel } from './components/IndicatorSettingsPanel';
import {
  calculateExpressionQuote,
  combineExpressionCandles,
  formatSymbolExpression,
  parseSymbolExpression,
  SymbolExpression,
} from './symbolExpression';

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

const WATCHLIST_IMPORT_CONCURRENCY = 8;
const CANDLES_CACHE_STORAGE_KEY = 'tv_dashboard_candles_cache_v1';
const CANDLES_CACHE_META_STORAGE_KEY = 'tv_dashboard_candles_cache_meta_v1';
const CANDLES_CACHE_TTL_MS = 30_000;
const CANDLES_CACHE_MAX_LENGTH = 180;

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
  error?: string;
  gatewayFailure?: boolean;
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

function normalizeStoredCandlesCache(raw: unknown): Record<string, Candle[]> {
  if (!raw || typeof raw !== 'object') return {};
  const next: Record<string, Candle[]> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (!Array.isArray(value)) return;
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
      next[key] = candles.slice(-CANDLES_CACHE_MAX_LENGTH);
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
  return Object.fromEntries(
    Object.entries(cache).map(([key, candles]) => [
      key,
      candles.slice(-CANDLES_CACHE_MAX_LENGTH),
    ]),
  );
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
  return {
    ...panel,
    timeframe: (panel.timeframe as string) === '15m' ? '10m' : panel.timeframe,
    priceScale: panel.priceScale ?? 1,
    rsiHeightPct: panel.rsiHeightPct ?? 25,
    macdHeightPct: panel.macdHeightPct ?? 25,
  };
}

function formatTickerPrice(symbol: string, price: number | null): string {
  if (price === null) return 'N/A';
  if (parseSymbolExpression(symbol)) {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }
  if (symbol.startsWith('JP.')) {
    return `¥${price.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}`;
  }
  return `$${price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatWatchlistSymbol(symbol: string): string {
  const expression = parseSymbolExpression(symbol);
  if (expression) {
    return `${formatWatchlistSymbol(expression.left)}${expression.operator}${formatWatchlistSymbol(expression.right)}`;
  }
  return symbol.startsWith('JP.') ? symbol.slice(3) : symbol;
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

function normalizeTickerSymbolForStorage(rawSymbol: string): string {
  const cleaned = rawSymbol.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return '';
  const upper = cleaned.toUpperCase();
  if (upper.startsWith('US.')) return cleaned.slice(3);
  if (upper.endsWith('.US')) return cleaned.slice(0, -3);
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
  if (/^\d{3}[A-Z0-9]?$/.test(upper)) return `JP.${upper}`;
  return upper;
}

function normalizeSymbolExpressionForStorage(rawExpression: string): SymbolExpression | null {
  const expression = parseSymbolExpression(rawExpression);
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
  return expression ? [expression.left, expression.right] : [symbol];
}

function resolveCandlesForSymbol(
  symbol: string,
  timeframe: Timeframe,
  cache: Record<string, Candle[]>,
): Candle[] {
  const expression = normalizeSymbolExpressionForStorage(symbol);
  if (!expression) {
    return cache[`${symbol}-${timeframe}`] || [];
  }
  return combineExpressionCandles(
    expression,
    cache[`${expression.left}-${timeframe}`] || [],
    cache[`${expression.right}-${timeframe}`] || [],
    timeframe,
  );
}

function extractWatchlistCsvCandidates(text: string): WatchlistCsvCandidate[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, '').trim());
  const codeIndex = headers.findIndex((header) => header === 'コード' || header.toLowerCase() === 'code');
  const nameIndex = headers.findIndex((header) => header === '銘柄' || header.toLowerCase() === 'name');
  const marketIndex = headers.findIndex((header) => header === '市場' || header.toLowerCase() === 'market');
  if (codeIndex === -1) return [];

  return rows.slice(1)
    .map((row) => ({
      code: String(row[codeIndex] ?? '').trim(),
      name: String(nameIndex >= 0 ? row[nameIndex] ?? '' : '').trim(),
      market: String(marketIndex >= 0 ? row[marketIndex] ?? '' : '').trim(),
    }))
    .filter((candidate) => candidate.code);
}

function normalizeImportedSymbol(rawCode: string): string | null {
  const cleaned = rawCode.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return null;
  return normalizeTickerSymbolForStorage(cleaned) || null;
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
  return {
    symbol: norm,
    indicators: {
      ma: { 
        enabled: norm === 'VOO' || norm === 'AAPL', 
        period1: 5, color1: '#e7c039', 
        period2: 12, color2: '#20aced', 
        period3: 20, color3: '#e152f2',
        style1: 'solid',
        style2: 'solid',
        style3: 'solid',
      },
      ema: { 
        enabled: norm === 'QQQ' || norm === 'NVDA', 
        period1: 9, color1: '#f85f73', 
        period2: 26, color2: '#00e575',
        style1: 'solid',
        style2: 'solid',
      },
      boll: { 
        enabled: true, 
        period: 20, 
        levels: [1, 2, 3],
        color: '#6c5dd3', 
        colorFill: 'rgba(108, 93, 211, 0.04)',
        style: 'dashed',
      },
      rsi: { 
        enabled: true, 
        period: 14, 
        color: '#f3a14b', 
        style: 'solid',
        overbought: 70, 
        oversold: 30 
      },
      macd: { 
        enabled: true, 
        fast: 12, 
        slow: 26, 
        signal: 9, 
        colorMacd: '#2d8cf0', 
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
}

interface MoomooBatchQuoteResult {
  success?: boolean;
  symbol?: string;
  name?: string;
  price?: number;
  changePct?: number;
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

export default function App() {
  // --- STATE ---
  const csvImportInputRef = useRef<HTMLInputElement | null>(null);
  const watchlistImportModeRef = useRef<WatchlistImportMode>('new-tab');
  const candleFetchInFlightRef = useRef(false);
  const quoteFetchInFlightRef = useRef(false);
  const moomooRealTimeActiveRef = useRef(true);
  const candleFetchTimestampsRef = useRef<Record<string, number>>(
    normalizeTimestampMap(readStoredValue<unknown>(CANDLES_CACHE_META_STORAGE_KEY, {}))
  );
  // Tickers list management
  const [tickers, setTickers] = useState<TickerInfo[]>(() => {
    const saved = localStorage.getItem('tv_dashboard_tickers');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse tickers, resetting", e);
      }
    }
    return DEFAULT_TICKERS;
  });

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
        rsiHeightPct: 25,
        macdHeightPct: 25,
      }
    ];
  });

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

  // Status message tracker for simulated API state
  const [networkLatency, setNetworkLatency] = useState(24);
  const [lastApiSyncTime, setLastApiSyncTime] = useState(new Date().toLocaleTimeString());

  // --- MOOMOO API (OPEND) CONFIG AND STATE ---
  const [moomooStatus, setMoomooStatus] = useState<'disconnected' | 'connected' | 'connecting' | 'error'>('disconnected');
  const [moomooError, setMoomooError] = useState<string | null>(null);
  const [moomooRealTimeActive, setMoomooRealTimeActive] = useState<boolean>(() => {
    const saved = localStorage.getItem('moomoo_active');
    return saved === null ? true : saved === 'true';
  });

  // --- PERSISTENCE EFFECT WRITERS ---
  useEffect(() => {
    localStorage.setItem('tv_dashboard_tickers', JSON.stringify(tickers));
  }, [tickers]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_watchlist_tabs', JSON.stringify(watchlistTabs));
  }, [watchlistTabs]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_active_watchlist_tab', JSON.stringify(activeWatchlistTabId));
  }, [activeWatchlistTabId]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_panels', JSON.stringify(panels));
  }, [panels]);

  useEffect(() => {
    const saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(CANDLES_CACHE_STORAGE_KEY, JSON.stringify(compactCandlesCache(candlesCache)));
        localStorage.setItem(CANDLES_CACHE_META_STORAGE_KEY, JSON.stringify(candleFetchTimestampsRef.current));
      } catch (error) {
        console.warn('ローソク足キャッシュの保存に失敗しました。', error);
      }
    }, 600);
    return () => window.clearTimeout(saveTimer);
  }, [candlesCache]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_indicators', JSON.stringify(indicatorDatabase));
  }, [indicatorDatabase]);

  useEffect(() => {
    localStorage.setItem('moomoo_active', String(moomooRealTimeActive));
    moomooRealTimeActiveRef.current = moomooRealTimeActive;
  }, [moomooRealTimeActive]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_focused_symbol', JSON.stringify(focusedSymbolIndex));
  }, [focusedSymbolIndex]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_panel_engines', JSON.stringify(panelEngineToggle));
  }, [panelEngineToggle]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_layout_style', JSON.stringify(layoutStyle));
  }, [layoutStyle]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_grid_rows', JSON.stringify(gridRows));
  }, [gridRows]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_grid_cols', JSON.stringify(gridCols));
  }, [gridCols]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_sidebar_open', JSON.stringify(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_sidebar_view', JSON.stringify(sidebarView));
  }, [sidebarView]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_sidebar_width', JSON.stringify(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_column_widths', JSON.stringify(colWeights));
  }, [colWeights]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_panel_heights', JSON.stringify(panelHeights));
  }, [panelHeights]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_watchlist_column_widths', JSON.stringify(watchlistColumnWidths));
  }, [watchlistColumnWidths]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_watchlist_show_name_column', JSON.stringify(showWatchlistNameColumn));
  }, [showWatchlistNameColumn]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_watchlist_sort', JSON.stringify(watchlistSort));
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
    if (!moomooRealTimeActive || candleFetchInFlightRef.current) return;

    const fetchMoomooCandles = async () => {
      const now = Date.now();
      const requests = new Map<string, { symbol: string; timeframe: Timeframe }>();
      panels.forEach((panel) => {
        getStoredSymbolOperands(panel.symbol).forEach((symbol) => {
          requests.set(`${symbol}-${panel.timeframe}`, {
            symbol,
            timeframe: panel.timeframe,
          });
        });
        panel.comparisonSymbols?.forEach((symbol) => {
          getStoredSymbolOperands(symbol).forEach((operand) => {
            requests.set(`${operand}-${panel.timeframe}`, {
              symbol: operand,
              timeframe: panel.timeframe,
            });
          });
        });
      });

      const requestsToFetch = Array.from(requests.entries()).filter(([key]) => {
        const cachedCandles = candlesCache[key];
        const lastFetchedAt = candleFetchTimestampsRef.current[key] ?? 0;
        return !cachedCandles?.length || now - lastFetchedAt > CANDLES_CACHE_TTL_MS;
      });

      if (requestsToFetch.length === 0) {
        setMoomooStatus('connected');
        setMoomooError(null);
        return;
      }

      candleFetchInFlightRef.current = true;
      const updatedCache: Record<string, Candle[]> = {};
      let firstError: string | null = null;
      try {
        await Promise.all(requestsToFetch.map(async ([key, request]) => {
          try {
            const { data } = await fetchJsonWithTimeout('/api/moomoo/kline', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                symbol: request.symbol,
                timeframe: request.timeframe,
                reqNum: 150
              })
            }, 25_000);
            if (data.success && data.candles && data.candles.length > 0) {
              updatedCache[key] = data.candles;
            } else {
              firstError ||= data.error || `${key}のローソク足を取得できません。`;
            }
          } catch (error) {
            firstError ||= error instanceof Error ? error.message : String(error);
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
      } finally {
        candleFetchInFlightRef.current = false;
      }
    };

    fetchMoomooCandles();
  }, [panels, moomooRealTimeActive, tickTrigger]);

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
      setLastApiSyncTime(new Date().toLocaleTimeString());
      
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
      
      return changed ? updated : prev;
    });
  }, [panels, moomooRealTimeActive]);

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
    setFocusedSymbolIndex(symbol);
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
    options: { reportError?: boolean } = {},
  ): Promise<RegisterTickerResult> => {
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
      selectTickerForPrimaryChart(requestedSymbol);
      setTickerSearchOpen(false);
      return { success: true };
    }

    setTickerSearchLoading(true);
    if (options.reportError !== false) {
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
        },
        [rightQuote.symbol]: {
          name: rightQuote.name,
          price: rightQuote.price,
          changePct: rightQuote.changePct,
        },
      }));
      setIndicatorDatabase((currentDatabase) => ({
        ...currentDatabase,
        [storedSymbol]: currentDatabase[storedSymbol]
          || createDefaultIndicatorSettings(storedSymbol),
      }));
      addSymbolToActiveWatchlist(storedSymbol);
      selectTickerForPrimaryChart(storedSymbol);
      setNewSymbolInput('');
      setTickerSearchCandidates([]);
      setTickerSearchOpen(false);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : '演算式を登録できませんでした。';
      if (options.reportError !== false) {
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
    options: { reportError?: boolean } = {},
  ): Promise<RegisterTickerResult> => {
    const requestedSymbol = normalizeTickerSymbolForStorage(candidate.symbol);
    const cleanName = candidate.name.replace(/^US\./i, '');

    if (tickers.some((ticker) => ticker.symbol === requestedSymbol)) {
      addSymbolToActiveWatchlist(requestedSymbol);
      selectTickerForPrimaryChart(requestedSymbol);
      setTickerSearchOpen(false);
      return { success: true };
    }

    setTickerSearchLoading(true);
    if (options.reportError !== false) {
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
        selectTickerForPrimaryChart(storedSymbol);
        setTickerSearchOpen(false);
        return { success: true };
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
        },
      }));
      setIndicatorDatabase((currentDatabase) => ({
        ...currentDatabase,
        [storedSymbol]: currentDatabase[storedSymbol]
          || createDefaultIndicatorSettings(storedSymbol),
      }));
      addSymbolToActiveWatchlist(storedSymbol);
      selectTickerForPrimaryChart(storedSymbol);
      setNewSymbolInput('');
      setTickerSearchCandidates([]);
      setTickerSearchOpen(false);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : '銘柄を登録できませんでした。';
      if (options.reportError !== false) {
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

  // 銘柄名・証券コード・ティッカーから候補を検索する
  const handleAddTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    const queryInput = newSymbolInput.trim();
    if (!queryInput) return;

    setTickerSearchError(null);
    setTickerSearchCandidates([]);
    const expressionInput = parseSymbolExpression(queryInput);
    let expressionError: string | undefined;

    if (expressionInput) {
      const expressionResult = await registerTickerExpression(queryInput, { reportError: false });
      if (expressionResult.success) {
        return;
      }
      expressionError = expressionResult.error;
      if (expressionInput.operator === '/') {
        setTickerSearchError(expressionError || '割り算の式を登録できませんでした。');
        return;
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
      const directResult = await registerTickerCandidate(directCandidate, { reportError: false });
      if (directResult.success) {
        return;
      }
      if (expressionInput) {
        setTickerSearchError(expressionError || directResult.error || '引き算の式を登録できませんでした。');
        return;
      }
      if (directResult.gatewayFailure) {
        setTickerSearchError(directResult.error || 'Moomooゲートウェイへ接続できません。');
        return;
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

      // 検索候補はアプリの保存形式にそろえてから表示する
      const processedCandidates = candidates.map(c => {
        const symbol = normalizeTickerSymbolForStorage(c.symbol);
        return { ...c, symbol };
      });

      if (processedCandidates.length === 1) {
        await registerTickerCandidate(processedCandidates[0]);
      } else {
        setTickerSearchCandidates(processedCandidates);
      }
    } catch (error) {
      setTickerSearchError(
        error instanceof Error ? error.message : '銘柄検索に失敗しました。'
      );
    } finally {
      setTickerSearchLoading(false);
    }
  };

  const beginWatchlistImport = (mode: WatchlistImportMode) => {
    watchlistImportModeRef.current = mode;
    setWatchlistImportMode(mode);
    setWatchlistImportMenuOpen(false);
    window.setTimeout(() => csvImportInputRef.current?.click(), 0);
  };

  const handleImportWatchlistCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    const importMode = watchlistImportModeRef.current;
    setWatchlistImporting(true);
    setWatchlistImportMessage(null);
    setTickerSearchError(null);

    try {
      const text = await file.text();
      const candidates = extractWatchlistCsvCandidates(text);
      if (candidates.length === 0) {
        setWatchlistImportMessage('CSVからコード列を読み取れませんでした。');
        return;
      }

      const tickerBySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));
      const queuedSymbols = new Set<string>();
      const normalizedCandidates: Array<WatchlistCsvCandidate & { symbol: string }> = [];
      const importedSymbols: string[] = [];
      const newTickers: TickerInfo[] = [];
      const newQuotes: Record<string, MoomooTickerQuote> = {};
      let invalidOrDuplicateCount = 0;
      let unavailableCount = 0;

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

      if (normalizedCandidates.length === 0) {
        setWatchlistImportMessage('有効な銘柄を読み取れませんでした。');
        return;
      }

      const statusResponse = await fetch('/api/moomoo/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const statusData = await statusResponse.json();
      if (!statusResponse.ok || !statusData.connected) {
        throw new Error(statusData.error || 'Moomooゲートウェイへ接続できないため、CSVを照合できません。');
      }

      const quoteResults = await mapWithConcurrency(
        normalizedCandidates,
        WATCHLIST_IMPORT_CONCURRENCY,
        async (candidate) => {
          try {
            const response = await fetch('/api/moomoo/quote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbol: candidate.symbol }),
            });
            const data = await response.json();
            const price = Number(data.price);
            if (!response.ok && isMoomooGatewayFailureMessage(String(data.error || ''))) {
              return {
                kind: 'gateway-error' as const,
                error: String(data.error || 'Moomooゲートウェイへ接続できません。'),
              };
            }
            if (!data.success || !Number.isFinite(price) || price <= 0) {
              return { kind: 'unavailable' as const };
            }

            const changePct = Number(data.changePct || 0);
            const storedSymbol = normalizeTickerSymbolForStorage(String(data.symbol || candidate.symbol));
            const importedTicker: TickerInfo = {
              symbol: storedSymbol,
              name: candidate.name || data.name || candidate.symbol,
              basePrice: price,
              dailyChangePct: Number.isFinite(changePct) ? changePct : 0,
            };

            return {
              kind: 'success' as const,
              ticker: importedTicker,
              quote: {
                name: importedTicker.name,
                price: importedTicker.basePrice,
                changePct: importedTicker.dailyChangePct,
              } satisfies MoomooTickerQuote,
            };
          } catch (error) {
            return {
              kind: 'gateway-error' as const,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        },
      );

      quoteResults.forEach((result) => {
        if (result.kind === 'gateway-error') {
          throw new Error(result.error);
        }
        if (result.kind === 'unavailable') {
          unavailableCount += 1;
          return;
        }
        if (!tickerBySymbol.has(result.ticker.symbol)) {
          tickerBySymbol.set(result.ticker.symbol, result.ticker);
          newTickers.push(result.ticker);
          newQuotes[result.ticker.symbol] = result.quote;
        }
        importedSymbols.push(result.ticker.symbol);
      });

      const finalImportedSymbols = Array.from(new Set(importedSymbols));
      const skippedMessage = `${unavailableCount > 0 ? `${unavailableCount}件はMoomooで確認できないためスキップしました。` : ''}${invalidOrDuplicateCount > 0 ? `${invalidOrDuplicateCount}件は無効または重複のためスキップしました。` : ''}`;

      if (finalImportedSymbols.length === 0) {
        setWatchlistImportMessage(`インポートできる銘柄がありませんでした。${skippedMessage}`);
        return;
      }

      if (newTickers.length > 0) {
        setTickers((currentTickers) => {
          const currentSymbols = new Set(currentTickers.map((ticker) => ticker.symbol));
          return [
            ...currentTickers,
            ...newTickers.filter((ticker) => !currentSymbols.has(ticker.symbol)),
          ];
        });
        setQuoteCache((currentQuotes) => ({
          ...currentQuotes,
          ...newQuotes,
        }));
        setIndicatorDatabase((currentDatabase) => {
          const nextDatabase = { ...currentDatabase };
          newTickers.forEach((ticker) => {
            nextDatabase[ticker.symbol] = nextDatabase[ticker.symbol]
              || createDefaultIndicatorSettings(ticker.symbol);
          });
          return nextDatabase;
        });
      }

      if (importMode === 'new-tab') {
        addSymbolsToNewWatchlistTab(finalImportedSymbols, file.name);
      } else {
        addSymbolsToActiveWatchlist(finalImportedSymbols);
      }

      setSelectedSymbols(finalImportedSymbols);
      setLastClickedSymbol(finalImportedSymbols.at(-1) ?? null);
      const destinationLabel = importMode === 'new-tab' ? '新規タブ' : 'アクティブなウォッチリスト';
      setWatchlistImportMessage(
        `${finalImportedSymbols.length}件を${destinationLabel}へインポートしました。${skippedMessage}`
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
    
    // Pick reference sym from available tickers list
    const currentSymbols = panels.map(p => p.symbol);
    const fallbackTicker = tickers.find(t => !currentSymbols.includes(t.symbol)) || tickers[0];
    
    const newId = `panel-${Date.now()}`;
    const newPanel: ChartPanel = {
      id: newId,
      symbol: fallbackTicker.symbol,
      timeframe: '5m',
      zoomFactor: 12,
      scrollOffsetPct: 100,
      showRsi: true,
      showMacd: false,
      showVolume: true,
      priceScale: 1,
      rsiHeightPct: 25,
      macdHeightPct: 25,
    };

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
      if (moomooRealTimeActive) {
        const expression = normalizeSymbolExpressionForStorage(t.symbol);
        if (expression) {
          const leftQuote = quoteCache[expression.left];
          const rightQuote = quoteCache[expression.right];
          const expressionQuote = leftQuote && rightQuote
            ? calculateExpressionQuote(expression, leftQuote, rightQuote)
            : null;
          return {
            ...t,
            currentPrice: expressionQuote?.price ?? null,
            computedChange: expressionQuote?.changePct ?? null,
          };
        }
        const quote = quoteCache[t.symbol];
        return {
          ...t,
          currentPrice: quote?.price ?? null,
          computedChange: quote?.changePct ?? null,
        };
      }

      const cached = resolveCandlesForSymbol(t.symbol, '5m', candlesCache);
      const curPrice = cached && cached.length > 0 ? cached[cached.length - 1].close : t.basePrice;
      const initialPrice = cached && cached.length > 0 ? cached[0].close : t.basePrice;
      const changePct = cached.length > 1 && initialPrice !== 0
        ? ((curPrice - initialPrice) / Math.abs(initialPrice)) * 100
        : t.dailyChangePct;
      return {
        ...t,
        currentPrice: curPrice,
        computedChange: changePct
      };
    });
  }, [tickers, candlesCache, quoteCache, moomooRealTimeActive]);

  const tickerStatsBySymbol = useMemo(() => {
    return new Map(liveTickerStats.map((ticker) => [ticker.symbol, ticker]));
  }, [liveTickerStats]);

  const activeWatchlistTab = useMemo(() => {
    return watchlistTabs.find((tab) => tab.id === activeWatchlistTabId) ?? watchlistTabs[0];
  }, [activeWatchlistTabId, watchlistTabs]);
  const activeWatchlistTabIndex = watchlistTabs.findIndex((tab) => tab.id === activeWatchlistTabId);
  const canJumpToFirstWatchlistTab = watchlistTabs.length > 1 && activeWatchlistTabIndex > 0;
  const canJumpToLastWatchlistTab =
    watchlistTabs.length > 1 &&
    activeWatchlistTabIndex >= 0 &&
    activeWatchlistTabIndex < watchlistTabs.length - 1;

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
        .map((symbol) => tickerStatsBySymbol.get(symbol))
        .filter((ticker): ticker is TickerInfo & { currentPrice: number | null; computedChange: number | null } => Boolean(ticker));
      return {
        ...section,
        rows: watchlistSort.column ? [...rows].sort(compareRows) : rows,
      };
    });
  }, [activeWatchlistTab, tickerStatsBySymbol, watchlistSort]);

  return (
    <div className="min-h-screen bg-[#050505] text-[#d1d4dc] font-sans flex flex-col antialiased selection:bg-emerald-500/25">
      
      {/* Dynamic Upper Banner with real-time quote ticks */}
      <div className="bg-[#080808] border-b border-[#202020] py-2 px-4 shrink-0 overflow-x-auto whitespace-nowrap scrollbar-none flex items-center justify-between text-xs">
        <div className="flex items-center space-x-6 min-w-0">
          <div className="flex items-center space-x-2 shrink-0">
            <span className="inline-flex w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold tracking-tight text-white uppercase text-xs">MooView</span>
          </div>
          <div className="h-4 w-px bg-[#2a2a2a]" />
          <div className="flex items-center space-x-5">
            {liveTickerStats.slice(0, 6).map((ticker) => {
              const hasRealQuote = ticker.currentPrice !== null && ticker.computedChange !== null;
              const pos = hasRealQuote && ticker.computedChange >= 0;
              return (
                <div 
                  key={ticker.symbol} 
                  className="inline-flex flex-col cursor-pointer hover:bg-[#181818] px-2 py-0.5 rounded transition-colors"
                  onClick={() => selectTickerForPrimaryChart(ticker.symbol)}
                  title="左側のチャートに表示する"
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
                  <span className="text-[10px] text-gray-400 font-mono mt-0.5">
                    {formatTickerPrice(ticker.symbol, ticker.currentPrice)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Right header actions */}
        <div className="flex items-center space-x-4 shrink-0 text-xs text-[#848e9c] select-none">
          <div className="flex items-center space-x-1 font-mono">
            <span>最新同期: <b className="text-[#d1d4dc]">{lastApiSyncTime}</b></span>
          </div>
        </div>
      </div>

      {/* Main Multi-Chart Workspace Container and Indicator Sidebar Controls split */}
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
                    const pSettings = indicatorDatabase[panel.symbol.toUpperCase()] || createDefaultIndicatorSettings(panel.symbol);
                    const isTvEmbed = Boolean(panelEngineToggle[panel.id]) && !panelExpression;

                    return (
                      <React.Fragment key={panel.id}>
                        <div
                          id={`chart-panel-container-${panel.id}`}
                          style={{
                            height: `${panelHeights[panel.id] ?? DEFAULT_PANEL_HEIGHT}px`,
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
                                
                                {/* SYMBOL SELECT DROPDOWN */}
                                <select
                                  id={`select-symbol-${panel.id}`}
                                  value={panel.symbol}
                                  onChange={(e) => handleUpdatePanel(panel.id, { symbol: e.target.value })}
                                  className="bg-[#171717] border border-[#2a2a2a] text-white rounded text-xs px-2 py-0.5 font-bold uppercase outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                                >
                                  {tickers.map(t => (
                                    <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
                                  ))}
                                </select>

                                {/* ACTIVE OVERLAYS BADGES */}
                                {panel.comparisonSymbols && panel.comparisonSymbols.length > 0 && (
                                  <div className="flex items-center space-x-1 pl-1.5 border-l border-[#242424] shrink-0">
                                    {panel.comparisonSymbols.map((compSym, idx) => {
                                      const lineColors = ['#f3a14b', '#a78bfa', '#22d3ee', '#f43f5e', '#eab308'];
                                      const color = lineColors[idx % lineColors.length];
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
                                <div className="flex items-center bg-[#171717] border border-[#2a2a2a] rounded p-0.5 space-x-0.5">
                                  {(['1m', '3m', '5m', '10m', '30m', '1h', '4h', '1d', '1w', '1mo'] as Timeframe[]).map((tf) => (
                                    <button
                                      key={tf}
                                      onClick={() => handleUpdatePanel(panel.id, { timeframe: tf })}
                                      className={`px-1.5 py-0.5 text-[10px] rounded font-bold transition-colors ${
                                        panel.timeframe === tf 
                                          ? 'bg-emerald-600 text-white'
                                          : 'text-gray-400 hover:text-white hover:bg-[#202020]'
                                      }`}
                                    >
                                      {tf === '1mo' ? '1月' : tf === '1d' ? '日' : tf === '1w' ? '週' : tf}
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
                                      onClick={() => handleUpdatePanel(panel.id, { showVolume: !panel.showVolume })}
                                      className={`px-1 rounded ${panel.showVolume ? 'text-[#26a69a] font-bold bg-[#142d2a]' : 'text-gray-500'}`}
                                      title="出来高を表示"
                                    >
                                      出来高
                                    </button>
                                    <button
                                      onClick={() => handleUpdatePanel(panel.id, { showRsi: !panel.showRsi })}
                                      className={`px-1 rounded ${panel.showRsi ? 'text-[#f3a14b] font-bold bg-[#342416]' : 'text-gray-500'}`}
                                      title="RSIサブ画面を表示"
                                    >
                                      RSI
                                    </button>
                                    <button
                                      onClick={() => handleUpdatePanel(panel.id, { showMacd: !panel.showMacd })}
                                      className={`px-1 rounded ${panel.showMacd ? 'text-emerald-400 font-bold bg-[#0f2a22]' : 'text-gray-500'}`}
                                      title="MACDサブ画面を表示"
                                    >
                                      MACD
                                    </button>
                                  </div>
                                )}

                                {/* PLUS BUTTON - OVERLAY MULTIPLE COMPARISONS */}
                                {!isTvEmbed && (
                                  <button
                                    onClick={() => setActiveComparisonPopoverPanelId(activeComparisonPopoverPanelId === panel.id ? null : panel.id)}
                                    className={`p-1.5 hover:bg-[#202020] rounded text-gray-400 hover:text-white transition cursor-pointer flex items-center justify-center ${activeComparisonPopoverPanelId === panel.id ? 'text-emerald-400 bg-[#171717] border border-emerald-500/30' : ''}`}
                                    title="このチャート内に他銘柄を比較追加する (+)"
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
                                  showVolume={panel.showVolume}
                                  showRsi={panel.showRsi}
                                  showMacd={panel.showMacd}
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
                                  emptyMessage={moomooRealTimeActive ? 'Moomoo実データを取得中...' : 'デモデータを生成中...'}
                                  priceScale={panel.priceScale ?? 1}
                                  setPriceScale={(scale) => handleUpdatePanel(panel.id, { priceScale: scale })}
                                  rsiHeightPct={panel.rsiHeightPct ?? 25}
                                  setRsiHeightPct={(pct) => handleUpdatePanel(panel.id, { rsiHeightPct: pct })}
                                  macdHeightPct={panel.macdHeightPct ?? 25}
                                  setMacdHeightPct={(pct) => handleUpdatePanel(panel.id, { macdHeightPct: pct })}
                                  onOpenIndicatorSettings={() => openIndicatorSettingsForSymbol(panel.symbol)}
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
                      placeholder="AAPL、CRM/SPY、US10Y.BD-JP10Y.BD"
                      value={newSymbolInput}
                      onChange={(e) => setNewSymbolInput(e.target.value)}
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
                  銘柄検索のほか、割り算は「CRM/SPY」、引き算は「左辺-右辺」で追加できます。
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
                      const hasQuote = ticker.currentPrice !== null && ticker.computedChange !== null;
                      const isPositive = hasQuote && ticker.computedChange >= 0;
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
                          onDragStart={() => {
                            setWatchlistSort({ column: null, direction: null });
                            setDraggedSectionId(null);
                            setDraggedTicker({ symbol: ticker.symbol, sectionId: section.id });
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
                          } ${draggedTicker?.symbol === ticker.symbol ? 'opacity-45' : ''}`}
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
                            {hasQuote ? `${ticker.computedChange >= 0 ? '+' : ''}${ticker.computedChange.toFixed(2)}%` : 'N/A'}
                          </span>
                          {watchlistLayout.showPrice && (
                            <span className="text-right font-mono text-[10px] text-gray-200 truncate">
                              {formatTickerPrice(ticker.symbol, ticker.currentPrice)}
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
