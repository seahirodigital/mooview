import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  FileDown,
  FileJson,
  FileSpreadsheet,
  FileText,
  Layers3,
  PanelRightOpen,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { Candle, ChartPanel, TickerInfo, Timeframe } from '../types';

type SortDirection = 'asc' | 'desc' | null;
type SortColumnKey = 'sectors' | 'baskets' | 'stocks';
type FlowColumnKey = 'regional' | SortColumnKey;
type SidePanelMode = 'chart' | 'settings' | 'summary' | 'annotation' | 'sources' | 'basket-db';
type BasketDbExportMenuAnchor = 'panel' | 'nav';
type RangeHandle = 'start' | 'end';
type ColumnBoundary = 'regional-sector' | 'sector-basket' | 'basket-stock' | 'stock-right';
type MarketFilter = 'all' | 'jp' | 'us';

interface MacroTickerStat extends TickerInfo {
  currentPrice: number | null;
  computedChange: number | null;
  marketCap?: number;
}

interface MacroQuote {
  name: string;
  price: number;
  changePct: number;
  marketCap?: number;
  volume?: number;
  dataDate?: string;
  dataTime?: string;
  source?: 'snapshot' | 'kline' | 'ticker';
  finalized?: boolean;
}

interface MacroQuoteResult {
  success?: boolean;
  symbol?: string;
  name?: string;
  price?: number;
  open?: number;
  previousClose?: number;
  changePct?: number;
  marketCap?: number;
  volume?: number;
  dataDate?: string;
  dataTime?: string;
}

interface SymbolSearchCandidate {
  symbol: string;
  code: string;
  name: string;
  nameEn: string;
  market: string;
  category: string;
}

interface MacroStock {
  symbol: string;
  name: string;
  market: string;
  marketCap: number;
  baseChangePct: number;
}

interface MacroBasket {
  id: string;
  name: string;
  sector: string;
  parentSectorId?: string;
  parentSectorNameJa?: string;
  parentSectorNameEn?: string;
  market?: string;
  color: string;
  stocks: MacroStock[];
}

interface StockMetric extends MacroStock {
  basketId: string;
  basketName: string;
  sector: string;
  sectorName: string;
  hasLiveQuote: boolean;
  price: number | null;
  baseVolume: number;
  nodeVolume: number;
  alpha: number;
  momentum: number;
  volumeMultiplier: number;
  score: number;
  changePct: number;
  flowValue: number;
}

interface BasketMetric extends MacroBasket {
  dataCoverage: number;
  baseVolume: number;
  nodeVolume: number;
  relativeReturn: number;
  volumeExpansion: number;
  marketCapWeight: number;
  score: number;
  changePct: number;
  flowValue: number;
  stockMetrics: StockMetric[];
}

interface SectorMetric {
  id: string;
  name: string;
  symbol: string;
  displaySymbol: string;
  price: number | null;
  dataCoverage: number;
  baseVolume: number;
  nodeVolume: number;
  volumeExpansion: number;
  score: number;
  changePct: number;
  flowValue: number;
  baskets: BasketMetric[];
}

interface RegionalMarketMetric {
  id: string;
  label: string;
  displaySymbol: string;
  symbol: string;
  price: number | null;
  changePct: number;
  hasLiveQuote: boolean;
  nodeVolume: number;
}

interface SectorEtfMetric extends RegionalMarketMetric {}

interface MacroScopeOption {
  id: string;
  label: string;
  detail: string;
  historyId?: string;
  chain?: StoredValueChain | null;
}

interface RegionalMarketDefinition {
  id: string;
  label: string;
  displaySymbol: string;
  symbol: string;
  baseVolume: number;
}

interface ValueChainSegment {
  id: string;
  name: string;
  parentId: string;
}

interface ValueChainStage {
  id: string;
  name: string;
  segments: ValueChainSegment[];
}

interface ValueChainLane {
  id: string;
  name: string;
}

interface ValueChainCategory {
  id: string;
  name: string;
  lanes: ValueChainLane[];
}

interface ValueChainGroup {
  id: string;
  categoryId: string;
  laneId: string;
  segmentId: string;
  name: string;
  parentSectorId?: string;
  parentSectorNameJa?: string;
  parentSectorNameEn?: string;
  market?: string;
  stocks: MacroStock[];
}

interface StoredValueChain {
  name?: string;
  stages?: ValueChainStage[];
  categories?: ValueChainCategory[];
  groups?: ValueChainGroup[];
}

interface StoredValueChainHistoryEntry {
  id?: string;
  importedAt?: string;
  chain?: StoredValueChain;
}

interface FlowNode {
  id: string;
  label: string;
  column: FlowColumnKey;
  rank: number;
  score: number;
  flowValue: number;
  changePct: number;
  nodeVolume: number;
  top: number;
  height: number;
}

interface FlowSectionHeader {
  label: string;
  top: number;
}

interface BasketEditorState {
  id: string | null;
  name: string;
  sector: string;
  stocksText: string;
}

interface MacroImportDecisionState {
  chain: StoredValueChain;
  importedAt: string;
  sourceName: string;
}

interface StockEditModalState {
  mode: 'add' | 'edit';
  groupId: string;
  originalSymbol: string;
  symbol: string;
  name: string;
  market: string;
  loading: boolean;
  error: string | null;
}

interface StockContextMenuState {
  x: number;
  y: number;
  groupId: string;
  symbol: string;
  label: string;
}

interface BasketContextMenuState {
  x: number;
  y: number;
  groupId: string;
  label: string;
}

interface KlineFetchProgress {
  status: 'loading' | 'waiting' | 'done';
  currentBatch: number;
  totalBatches: number;
  fetchedSymbols: number;
  totalSymbols: number;
  cachedSymbols: number;
}

interface QuoteFetchProgress {
  status: 'loading' | 'done' | 'partial';
  currentBatch: number;
  totalBatches: number;
  fetchedSymbols: number;
  totalSymbols: number;
  cachedSymbols: number;
  targetSymbols: number;
  failedSymbols: string[];
}

interface HistoryBackfillProgress {
  status: 'loading' | 'waiting' | 'done' | 'partial';
  currentBatch: number;
  totalBatches: number;
  processedSymbols: number;
  totalSymbols: number;
  filledQuotes: number;
  totalMissing: number;
  currentDate: string;
  totalDates: number;
  failedSymbols: string[];
}

interface StoredKlineCacheRecord {
  key?: string;
  symbol?: string;
  timeframe?: string;
  reqNum?: number;
  candles?: Candle[];
  savedAt?: number;
}

interface StoredMacroQuoteCache {
  date?: string;
  savedAt?: number;
  quotes?: Record<string, MacroQuote | null>;
}

interface StoredMacroQuoteCacheRecord extends StoredMacroQuoteCache {
  key: string;
}

interface StoredMacroQuoteHistoryRecord {
  key: string;
  date: string;
  savedAt?: number;
  quotes?: Record<string, MacroQuote | null>;
}

interface MacroFlowCacheExportPayload {
  schema?: string;
  schemaVersion?: number;
  exportedAt?: string;
  flowEndDate?: string;
  quoteHistory?: Record<string, StoredMacroQuoteCache | Record<string, MacroQuote | null>>;
  latestQuotes?: StoredMacroQuoteCache;
  klineRecords?: StoredKlineCacheRecord[];
  valueChain?: {
    current?: StoredValueChain | null;
    history?: StoredValueChainHistoryEntry[];
    activeHistoryId?: string | null;
  };
}

interface FlowLink {
  id: string;
  sourceId: string;
  targetId: string;
  sourceColumn: FlowColumnKey;
  targetColumn: FlowColumnKey;
  flowValue: number;
  score: number;
  changePct: number;
  color: string;
  label: string;
}

interface ColorTarget {
  id: string;
  label: string;
  kind: 'sector' | 'basket' | 'stock' | 'flow';
}

interface ColumnResizeState {
  boundary: ColumnBoundary;
  startX: number;
  widths: Record<FlowColumnKey, number>;
}

interface MacroFlowMapProps {
  tickers: MacroTickerStat[];
  chartState: ChartPanel;
  onChartStateChange: React.Dispatch<React.SetStateAction<ChartPanel>>;
  chartTimeframe: Timeframe;
  onChartTimeframeChange: (timeframe: Timeframe) => void;
  renderTickerChart: (options: {
    symbol: string;
    comparisonSymbols?: string[];
    onOpenIndicatorSettings?: () => void;
    onRemoveComparisonSymbol?: (symbol: string) => void;
    focusDate?: string;
    focusDateActive?: boolean;
  }) => React.ReactNode;
  renderIndicatorSettings: (symbol: string) => React.ReactNode;
  onChartSymbolsChange: (symbols: string[]) => void;
  onSyncBasketsToWatchlist?: (chain: unknown) => void;
}

const FLOW_START_DATE = '2026-06-10';
const FLOW_END_DATE = getTodayDateValue();
const FLOW_MIN_DATE = getDateValueDaysAgo(365);
const DEFAULT_RANGE_DAYS = 5;
const FLOW_EVENT_DATE = '2026-06-10';
const CALENDAR_WEEK_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const VALUE_CHAIN_STORAGE_KEY = 'mooview_value_chain_map_v1';
const CHAIN_HISTORY_STORAGE_KEY = 'mooview_value_chain_history_v1';
const ACTIVE_CHAIN_HISTORY_ID_STORAGE_KEY = 'mooview_value_chain_active_history_id';
const VALUE_CHAIN_SYNC_EVENT = 'mooview:value-chain-map-updated';
const MACRO_QUOTE_CACHE_STORAGE_KEY = 'mooview_macro_flow_quote_cache_v1';
const MACRO_QUOTE_DB_NAME = 'mooview_macro_flow_quote_cache_v1';
const MACRO_QUOTE_DB_STORE = 'quotes';
const MACRO_QUOTE_HISTORY_DB_STORE = 'quote_history';
const MACRO_QUOTE_DB_VERSION = 2;
const MACRO_QUOTE_DB_RECORD_KEY = 'latest';
const MACRO_FLOW_CACHE_EXPORT_SCHEMA = 'mooview-macro-flow-cache';
const MACRO_FLOW_CACHE_EXPORT_VERSION = 1;
const MACRO_KLINE_DB_NAME = 'mooview_macro_flow_kline_cache_v1';
const MACRO_KLINE_DB_STORE = 'kline';
const MACRO_KLINE_DB_VERSION = 1;
const SNAPSHOT_BATCH_SIZE = 200;
const KLINE_BATCH_SIZE = 60;
const KLINE_BATCH_INTERVAL_MS = 30_000;
const MACRO_ALL_SCOPE_ID = 'macro-all';
const FLOW_ROW_GAP = 4;
const FLOW_PANEL_PADDING_Y = 34;
const FLOW_SECTION_LABEL_HEIGHT = 17;
const FLOW_SECTION_GAP = 10;
const FLOW_NODE_MIN_HEIGHT = 30;
const FLOW_NODE_MAX_HEIGHT = 54;
const FLOW_NODE_DEFAULT_WIDTH = {
  regional: 250,
  sectors: 280,
  baskets: 310,
  stocks: 280,
} as const;
const FLOW_CANVAS_PADDING_X = 3;
const FLOW_MACRO_COLUMN_GAP = 19;
const FLOW_LINK_COLUMN_GAP = 76;
const FLOW_STOCK_RIGHT_PADDING = 44;
const FLOW_COLUMN_MIN_WIDTH = 130;
const FLOW_COLUMN_MAX_WIDTH = 460;
const SIDE_PANEL_MIN_WIDTH = 340;
const SIDE_PANEL_MAX_WIDTH = 680;
const SIDE_PANEL_NAV_WIDTH = 44;
const CHART_TIMEFRAME_OPTIONS: Timeframe[] = ['1m', '3m', '5m', '10m', '30m', '1h', '4h', '1d', '1w', '1mo'];
const REGIONAL_MARKET_DEFS: RegionalMarketDefinition[] = [
  { id: 'us-market', label: 'US market', displaySymbol: 'VT', symbol: 'VT', baseVolume: 65_200_000 },
  { id: 'jp-market', label: 'JP', displaySymbol: 'EWJ', symbol: 'EWJ', baseVolume: 8_100_000 },
  { id: 'eu-market', label: 'EU', displaySymbol: 'VGK', symbol: 'VGK', baseVolume: 11_800_000 },
  { id: 'us10y', label: '米債', displaySymbol: 'US10Y', symbol: '__UNSUPPORTED_US10Y__', baseVolume: 42_000_000 },
  { id: 'usd-jpy', label: '為替', displaySymbol: 'USD/JPY', symbol: '__UNSUPPORTED_USDJPY__', baseVolume: 28_000_000 },
  { id: 'gold', label: '金', displaySymbol: 'GOLD/USD', symbol: '__UNSUPPORTED_XAUUSD__', baseVolume: 18_000_000 },
  { id: 'dxy', label: 'ドル指数', displaySymbol: 'DXY', symbol: '__UNSUPPORTED_DXY__', baseVolume: 16_000_000 },
  { id: 'wti', label: '原油', displaySymbol: 'WTI', symbol: 'USO', baseVolume: 15_000_000 },
  { id: 'vix', label: 'VIX', displaySymbol: 'VIX', symbol: 'VIXY', baseVolume: 12_000_000 },
];
const REGIONAL_LABELS: Record<string, string> = {
  'us-market': 'US market',
  'jp-market': 'JP',
  'eu-market': 'EU',
  us10y: '米債',
  'usd-jpy': '為替',
  gold: '金',
  dxy: 'ドル指数',
  wti: '原油',
  vix: 'VIX',
};
const MACRO_SECTOR_ETF_DEFS: RegionalMarketDefinition[] = [
  { id: 'spy', label: 'US Market', displaySymbol: 'SPY', symbol: 'SPY', baseVolume: 520_000_000 },
  { id: 'xlk', label: 'Technology', displaySymbol: 'XLK', symbol: 'XLK', baseVolume: 95_000_000 },
  { id: 'xlf', label: 'Financials', displaySymbol: 'XLF', symbol: 'XLF', baseVolume: 72_000_000 },
  { id: 'xly', label: 'Consumer Disc.', displaySymbol: 'XLY', symbol: 'XLY', baseVolume: 44_000_000 },
  { id: 'xlp', label: 'Consumer Staples', displaySymbol: 'XLP', symbol: 'XLP', baseVolume: 38_000_000 },
  { id: 'xle', label: 'Energy', displaySymbol: 'XLE', symbol: 'XLE', baseVolume: 58_000_000 },
  { id: 'xli', label: 'Industrials', displaySymbol: 'XLI', symbol: 'XLI', baseVolume: 51_000_000 },
  { id: 'xlb', label: 'Materials', displaySymbol: 'XLB', symbol: 'XLB', baseVolume: 27_000_000 },
  { id: 'xlv', label: 'Health Care', displaySymbol: 'XLV', symbol: 'XLV', baseVolume: 62_000_000 },
  { id: 'xlu', label: 'Utilities', displaySymbol: 'XLU', symbol: 'XLU', baseVolume: 32_000_000 },
  { id: 'xlre', label: 'Real Estate', displaySymbol: 'XLRE', symbol: 'XLRE', baseVolume: 18_000_000 },
  { id: 'xlc', label: 'Communication', displaySymbol: 'XLC', symbol: 'XLC', baseVolume: 34_000_000 },
];
const SEMICONDUCTOR_SECTOR_ETF_DEFS: RegionalMarketDefinition[] = [
  { id: 'sox', label: 'SOX', displaySymbol: 'SOX', symbol: 'SOXX', baseVolume: 80_000_000 },
  { id: 'jp-213a', label: '日経半導体', displaySymbol: '213A', symbol: 'JP.213A', baseVolume: 18_000_000 },
  { id: 'jp-200a', label: '日経半導体株', displaySymbol: '200A', symbol: 'JP.200A', baseVolume: 18_000_000 },
  { id: 'jp-2644', label: 'GX半導体', displaySymbol: '2644', symbol: 'JP.2644', baseVolume: 12_000_000 },
];
const SECTOR_SYMBOL_BY_NAME: Record<string, { symbol: string; displaySymbol: string }> = {
  'Information Technology': { symbol: 'XLK', displaySymbol: 'XLK' },
  Financials: { symbol: 'XLF', displaySymbol: 'XLF' },
  'Consumer Discretionary': { symbol: 'XLY', displaySymbol: 'XLY' },
  'Consumer Staples': { symbol: 'XLP', displaySymbol: 'XLP' },
  Energy: { symbol: 'XLE', displaySymbol: 'XLE' },
  Industrials: { symbol: 'XLI', displaySymbol: 'XLI' },
  Materials: { symbol: 'XLB', displaySymbol: 'XLB' },
  'Health Care': { symbol: 'XLV', displaySymbol: 'XLV' },
  Utilities: { symbol: 'XLU', displaySymbol: 'XLU' },
  'Real Estate': { symbol: 'XLRE', displaySymbol: 'XLRE' },
  'Communication Services': { symbol: 'XLC', displaySymbol: 'XLC' },
};
const FLOW_COLOR_PALETTE = [
  '#ffffff', '#d4d4d4', '#a3a3a3', '#737373', '#525252', '#404040', '#262626', '#0a0a0a',
  '#ef4444', '#f97316', '#facc15', '#4ade80', '#14b8a6', '#06b6d4', '#2563eb', '#6d28d9', '#a21caf', '#e11d48',
  '#fecdd3', '#fed7aa', '#fef3c7', '#bbf7d0', '#99f6e4', '#a5f3fc', '#bfdbfe', '#ddd6fe', '#f5d0fe', '#fbcfe8',
  '#fb7185', '#fdba74', '#fde68a', '#86efac', '#5eead4', '#67e8f9', '#60a5fa', '#c4b5fd', '#e879f9', '#f9a8d4',
  '#f43f5e', '#fb923c', '#fde047', '#22c55e', '#2dd4bf', '#22d3ee', '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899',
  '#dc2626', '#ea580c', '#eab308', '#16a34a', '#0d9488', '#0891b2', '#2563eb', '#7c3aed', '#c026d3', '#db2777',
  '#991b1b', '#c2410c', '#a16207', '#15803d', '#0f766e', '#0e7490', '#1d4ed8', '#6d28d9', '#a21caf', '#be185d',
] as const;
const FALLBACK_BASKETS: MacroBasket[] = [
  {
    id: 'ai-infrastructure',
    name: 'AI Infrastructure',
    sector: 'Information Technology',
    color: '#38bdf8',
    stocks: [
      { symbol: 'NVDA', name: 'NVIDIA', market: 'US', marketCap: 3_200_000, baseChangePct: 5.1 },
      { symbol: 'AVGO', name: 'Broadcom', market: 'US', marketCap: 690_000, baseChangePct: 2.8 },
      { symbol: 'MSFT', name: 'Microsoft', market: 'US', marketCap: 3_100_000, baseChangePct: 1.4 },
      { symbol: 'GOOGL', name: 'Alphabet', market: 'US', marketCap: 2_100_000, baseChangePct: 0.9 },
    ],
  },
  {
    id: 'semiconductors',
    name: 'Semiconductors',
    sector: 'Information Technology',
    color: '#22c55e',
    stocks: [
      { symbol: 'AMD', name: 'AMD', market: 'US', marketCap: 260_000, baseChangePct: 2.4 },
      { symbol: 'TSM', name: 'TSMC', market: 'US', marketCap: 820_000, baseChangePct: 1.7 },
      { symbol: 'ASML', name: 'ASML', market: 'US', marketCap: 410_000, baseChangePct: 0.6 },
      { symbol: 'JP.8035', name: '東京エレクトロン', market: 'JP', marketCap: 14_800, baseChangePct: 3.3 },
    ],
  },
  {
    id: 'memory-components',
    name: 'Memory / Components',
    sector: 'Information Technology',
    color: '#a78bfa',
    stocks: [
      { symbol: 'MU', name: 'Micron', market: 'US', marketCap: 155_000, baseChangePct: 1.9 },
      { symbol: 'JP.6762', name: 'TDK', market: 'JP', marketCap: 5_300, baseChangePct: 1.5 },
      { symbol: 'JP.6981', name: '村田製作所', market: 'JP', marketCap: 6_900, baseChangePct: 1.1 },
      { symbol: 'JP.6976', name: '太陽誘電', market: 'JP', marketCap: 420, baseChangePct: 0.8 },
    ],
  },
  {
    id: 'liquid-cooling',
    name: 'Liquid Cooling',
    sector: 'Industrials',
    color: '#14b8a6',
    stocks: [
      { symbol: 'VRT', name: 'Vertiv', market: 'US', marketCap: 42_000, baseChangePct: 4.6 },
      { symbol: 'MOD', name: 'Modine', market: 'US', marketCap: 5_400, baseChangePct: 3.7 },
      { symbol: 'ETN', name: 'Eaton', market: 'US', marketCap: 120_000, baseChangePct: 1.2 },
      { symbol: 'JP.6367', name: 'ダイキン工業', market: 'JP', marketCap: 6_200, baseChangePct: 0.9 },
    ],
  },
  {
    id: 'power-grid',
    name: 'Power Grid',
    sector: 'Utilities',
    color: '#f59e0b',
    stocks: [
      { symbol: 'GEV', name: 'GE Vernova', market: 'US', marketCap: 54_000, baseChangePct: 2.5 },
      { symbol: 'PWR', name: 'Quanta Services', market: 'US', marketCap: 41_000, baseChangePct: 1.9 },
      { symbol: 'NEE', name: 'NextEra Energy', market: 'US', marketCap: 145_000, baseChangePct: 0.4 },
      { symbol: 'JP.6501', name: '日立製作所', market: 'JP', marketCap: 9_800, baseChangePct: 1.1 },
    ],
  },
  {
    id: 'cyber-security',
    name: 'Cyber Security',
    sector: 'Communication Services',
    color: '#fb7185',
    stocks: [
      { symbol: 'CRWD', name: 'CrowdStrike', market: 'US', marketCap: 95_000, baseChangePct: 1.8 },
      { symbol: 'PANW', name: 'Palo Alto Networks', market: 'US', marketCap: 120_000, baseChangePct: 1.3 },
      { symbol: 'ZS', name: 'Zscaler', market: 'US', marketCap: 34_000, baseChangePct: 0.7 },
      { symbol: 'FTNT', name: 'Fortinet', market: 'US', marketCap: 58_000, baseChangePct: -0.4 },
    ],
  },
];

export function getMacroFlowDefaultWatchlistChain(): unknown {
  return createChainFromBaskets('Macro Flow', FALLBACK_BASKETS);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function dateFromValue(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function getTodayDateValue(): string {
  const date = new Date();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function getDateValueDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function getDateValueDaysBefore(baseDate: string, days: number): string {
  const date = dateFromValue(baseDate);
  date.setDate(date.getDate() - days);
  return formatDateValue(date);
}

function formatDateValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDateDays(value: string, days: number): string {
  const date = dateFromValue(value);
  date.setDate(date.getDate() + days);
  return formatDateValue(date);
}

function isBusinessDateValue(value: string): boolean {
  const day = dateFromValue(value).getDay();
  return day >= 1 && day <= 5;
}

function clampDateValue(value: string): string {
  if (value < FLOW_MIN_DATE) return FLOW_MIN_DATE;
  if (value > FLOW_END_DATE) return FLOW_END_DATE;
  return value;
}

function clampBusinessDateValue(value: string): string {
  const clamped = clampDateValue(value);
  if (isBusinessDateValue(clamped)) return clamped;

  let previous = clamped;
  for (let index = 0; index < 7; index += 1) {
    previous = addDateDays(previous, -1);
    if (previous >= FLOW_MIN_DATE && isBusinessDateValue(previous)) return previous;
  }

  let next = clamped;
  for (let index = 0; index < 7; index += 1) {
    next = addDateDays(next, 1);
    if (next <= FLOW_END_DATE && isBusinessDateValue(next)) return next;
  }

  return clamped;
}

function addBusinessDays(value: string, days: number): string {
  if (days === 0) return clampBusinessDateValue(value);
  const direction = days > 0 ? 1 : -1;
  let remaining = Math.abs(days);
  let cursor = clampBusinessDateValue(value);
  let guard = 0;
  while (remaining > 0 && guard < 1000) {
    cursor = addDateDays(cursor, direction);
    if (isBusinessDateValue(cursor)) remaining -= 1;
    guard += 1;
  }
  return clampBusinessDateValue(cursor);
}

function getBusinessDateValueDaysAgo(days: number, baseDate = FLOW_END_DATE): string {
  if (days <= 1) return clampBusinessDateValue(baseDate);
  return addBusinessDays(baseDate, -(days - 1));
}

function getBusinessWindowDays(startDate: string, endDate: string): number {
  const safeStart = clampBusinessDateValue(startDate);
  const safeEnd = clampBusinessDateValue(endDate);
  if (safeStart === safeEnd) return 0;
  const direction = safeStart < safeEnd ? 1 : -1;
  let cursor = safeStart;
  let count = isBusinessDateValue(cursor) ? direction : 0;
  let guard = 0;
  while (cursor !== safeEnd && guard < 1000) {
    cursor = addDateDays(cursor, direction);
    if (isBusinessDateValue(cursor)) count += direction;
    guard += 1;
  }
  return Math.abs(count);
}

function getBusinessDateValuesInWindow(startDate: string, endDate: string): string[] {
  const safeStart = clampBusinessDateValue(startDate);
  const safeEnd = clampBusinessDateValue(endDate);
  if (safeStart === safeEnd) return [safeStart];
  const direction = safeStart < safeEnd ? 1 : -1;
  const dates: string[] = [];
  let cursor = safeStart;
  let guard = 0;
  while (guard < 1000) {
    if (isBusinessDateValue(cursor)) dates.push(cursor);
    if (cursor === safeEnd) break;
    cursor = addDateDays(cursor, direction);
    guard += 1;
  }
  return direction > 0 ? dates : dates.reverse();
}

function getBusinessRangeDays(startDate: string, endDate: string): number {
  if (startDate === endDate) return 0;
  const direction = startDate < endDate ? 1 : -1;
  let cursor = clampBusinessDateValue(startDate);
  const target = clampBusinessDateValue(endDate);
  let count = 0;
  let guard = 0;
  while (cursor !== target && guard < 1000) {
    cursor = addDateDays(cursor, direction);
    if (isBusinessDateValue(cursor)) count += direction;
    guard += 1;
  }
  return count;
}

function shiftCalendarMonth(month: string, delta: number): string {
  const date = new Date(`${month}-01T12:00:00`);
  date.setMonth(date.getMonth() + delta);
  return date.toISOString().slice(0, 7);
}

function formatCalendarMonthLabel(month: string): string {
  const [year, monthValue] = month.split('-');
  return `${year}/${monthValue}`;
}

function buildCalendarDays(month: string): Array<{ date: string; inMonth: boolean }> {
  const firstDay = new Date(`${month}-01T12:00:00`);
  const start = new Date(firstDay);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  start.setDate(firstDay.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateValue = formatDateValue(date);
    return {
      date: dateValue,
      inMonth: dateValue.slice(0, 7) === month,
    };
  });
}

function isLikelyTickerInput(value: string): boolean {
  const trimmed = value.trim();
  return /^[A-Za-z]{1,6}$/.test(trimmed)
    || /^[A-Za-z0-9._-]+\.(US|JP|HK|FX|BD)$/i.test(trimmed)
    || /^\.[A-Za-z0-9._-]+\.(US|JP)$/i.test(trimmed)
    || /^\d{3,5}[A-Za-z]?(\.T|\.JP)?$/i.test(trimmed);
}

function normalizeSymbol(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  if (upper.startsWith('US.')) return upper.slice(3);
  if (upper.endsWith('.US')) return upper.slice(0, -3);
  if (upper.startsWith('JP.')) return `JP.${upper.slice(3)}`;
  if (upper.endsWith('.JP')) return `JP.${upper.slice(0, -3)}`;
  if (upper.endsWith('.T')) return `JP.${upper.slice(0, -2)}`;
  if (/^\d{3,5}[A-Z]?$/.test(upper)) return `JP.${upper}`;
  return upper;
}

function isUnsupportedDataSymbol(symbol: string): boolean {
  return normalizeSymbol(symbol).startsWith('__UNSUPPORTED_');
}

function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatPctMaybe(value: number, hasData: boolean): string {
  if (!hasData || !Number.isFinite(value)) return 'N/A';
  return formatPct(value);
}

function formatFlow(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'N/A';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}T`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}B`;
  if (value >= 10) return `${value.toFixed(0)}M`;
  return `${value.toFixed(1)}M`;
}

function formatStockPctMaybe(value: number, hasData: boolean): string {
  if (!hasData || !Number.isFinite(value)) return '取得不可';
  return formatPct(value);
}

function formatStockMarketCap(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '未取得';
  return formatFlow(value);
}

function formatStockMetric(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '取得不可';
  return formatFlow(value);
}

function formatTimeframeLabel(timeframe: Timeframe): string {
  if (timeframe === '1mo') return '1M';
  if (timeframe === '1d') return 'day';
  if (timeframe === '1w') return 'Week';
  return timeframe;
}

function isJapanStock(symbol: string): boolean {
  return normalizeSymbol(symbol).startsWith('JP.');
}

function isJapanMacroStock(stock: Pick<MacroStock, 'symbol' | 'market'>): boolean {
  const market = stock.market.trim().toUpperCase();
  return market === 'JP' || isJapanStock(stock.symbol);
}

function filterBasketsByMarket(baskets: MacroBasket[], marketFilter: MarketFilter): MacroBasket[] {
  if (marketFilter === 'all') return baskets;
  return baskets
    .map((basket) => ({
      ...basket,
      stocks: basket.stocks.filter((stock) => {
        const isJapan = isJapanMacroStock(stock);
        return marketFilter === 'jp' ? isJapan : !isJapan;
      }),
    }))
    .filter((basket) => basket.stocks.length > 0);
}

function formatStockCode(symbol: string): string {
  const normalized = normalizeSymbol(symbol);
  return normalized.startsWith('JP.') ? normalized.slice(3) : normalized;
}

function formatRegionalPrice(symbol: string, value: number | null): string {
  if (value === null) return '-';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '-';
  if (symbol === 'US10Y' || symbol === 'US10Y.BD') return `${numericValue.toFixed(2)}%`;
  if (symbol === 'USD/JPY' || symbol === 'USDJPY.FX') return numericValue.toFixed(2);
  if (symbol === 'GOLD/USD' || symbol === 'XAUUSD.FX') return numericValue.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (symbol === 'DXY' || symbol === 'DXmain' || symbol === 'WTI' || symbol === 'CLmain' || symbol === 'VIX') return numericValue.toFixed(2);
  return numericValue.toFixed(2);
}

function createTickerQuote(ticker: MacroTickerStat): MacroQuote | null {
  const price = Number(ticker.currentPrice);
  const changePct = Number(ticker.computedChange);
  const marketCap = Number(ticker.marketCap);
  const volume = Number((ticker as MacroTickerStat & { volume?: number }).volume);
  const hasPrice = Number.isFinite(price) && price > 0;
  const hasChange = Number.isFinite(changePct);
  const hasMarketCap = Number.isFinite(marketCap) && marketCap > 0;
  if (!hasPrice && !hasChange && !hasMarketCap) return null;
  return {
    name: ticker.name || ticker.symbol,
    price: hasPrice ? price : 0,
    changePct: hasChange ? changePct : 0,
    marketCap: hasMarketCap ? marketCap : undefined,
    volume: Number.isFinite(volume) && volume > 0 ? volume : undefined,
    dataDate: FLOW_END_DATE,
    source: 'ticker',
    finalized: false,
  };
}

function parseMacroQuoteResult(quote: MacroQuoteResult, fallbackSymbol: string): MacroQuote | null {
  const price = Number(quote.price);
  if (!quote.success || !Number.isFinite(price) || price <= 0) return null;
  const marketCap = Number(quote.marketCap);
  const volume = Number(quote.volume);
  const quotedChangePct = Number(quote.changePct);
  const previousClose = Number(quote.previousClose);
  const open = Number(quote.open);
  const changePct = Number.isFinite(quotedChangePct)
    ? quotedChangePct
    : Number.isFinite(previousClose) && previousClose > 0
      ? ((price / previousClose) - 1) * 100
      : Number.isFinite(open) && open > 0
        ? ((price / open) - 1) * 100
        : 0;
  return {
    name: quote.name || quote.symbol || fallbackSymbol,
    price,
    changePct,
    marketCap: Number.isFinite(marketCap) && marketCap > 0 ? marketCap : undefined,
    volume: Number.isFinite(volume) && volume > 0 ? volume : undefined,
    dataDate: typeof quote.dataDate === 'string' ? quote.dataDate : undefined,
    dataTime: typeof quote.dataTime === 'string' ? quote.dataTime : undefined,
    source: 'snapshot',
    finalized: false,
  };
}

function sanitizeStoredQuoteMap(quotes: unknown): Record<string, MacroQuote | null> {
  const result: Record<string, MacroQuote | null> = {};
  if (!quotes || typeof quotes !== 'object') return result;
  Object.entries(quotes as Record<string, unknown>).forEach(([symbol, rawQuote]) => {
    const normalizedSymbol = normalizeSymbol(symbol);
    if (!normalizedSymbol || isUnsupportedDataSymbol(normalizedSymbol)) return;
    if (!rawQuote || typeof rawQuote !== 'object') return;
    const quote = rawQuote as MacroQuote;
    const price = Number(quote.price);
    const changePct = Number(quote.changePct);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(changePct)) return;
    const marketCap = Number(quote.marketCap);
    const volume = Number(quote.volume);
    const source = quote.source === 'kline' || quote.source === 'snapshot' || quote.source === 'ticker'
      ? quote.source
      : undefined;
    result[normalizedSymbol] = {
      name: String(quote.name || normalizedSymbol),
      price,
      changePct,
      marketCap: Number.isFinite(marketCap) && marketCap > 0 ? marketCap : undefined,
      volume: Number.isFinite(volume) && volume > 0 ? volume : undefined,
      dataDate: typeof quote.dataDate === 'string' ? quote.dataDate : undefined,
      dataTime: typeof quote.dataTime === 'string' ? quote.dataTime : undefined,
      source,
      finalized: typeof quote.finalized === 'boolean' ? quote.finalized : false,
    };
  });
  return result;
}

function isDateValueText(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sanitizeStoredQuoteHistory(history: unknown): Record<string, Record<string, MacroQuote | null>> {
  const result: Record<string, Record<string, MacroQuote | null>> = {};
  if (!history || typeof history !== 'object') return result;
  Object.entries(history as Record<string, unknown>).forEach(([date, rawRecord]) => {
    if (!isDateValueText(date)) return;
    const rawQuotes = rawRecord && typeof rawRecord === 'object' && 'quotes' in rawRecord
      ? (rawRecord as StoredMacroQuoteCache).quotes
      : rawRecord;
    const quotes = sanitizeStoredQuoteMap(rawQuotes);
    if (Object.keys(quotes).length > 0) result[date] = quotes;
  });
  return result;
}

function readStoredMacroQuoteCache(): Record<string, MacroQuote | null> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(MACRO_QUOTE_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredMacroQuoteCache;
    if (parsed.date !== FLOW_END_DATE) return {};
    return sanitizeStoredQuoteMap(parsed.quotes);
  } catch {
    return {};
  }
}

function writeStoredMacroQuoteCache(quotes: Record<string, MacroQuote | null>): void {
  if (typeof window === 'undefined') return;
  const sanitized = sanitizeStoredQuoteMap(quotes);
  try {
    if (Object.keys(sanitized).length === 0) {
      window.localStorage.removeItem(MACRO_QUOTE_CACHE_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(MACRO_QUOTE_CACHE_STORAGE_KEY, JSON.stringify({
      date: FLOW_END_DATE,
      savedAt: Date.now(),
      quotes: sanitized,
    } satisfies StoredMacroQuoteCache));
  } catch {
  }
}

let macroQuoteDbPromise: Promise<IDBDatabase> | null = null;

function openMacroQuoteDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (macroQuoteDbPromise) return macroQuoteDbPromise;
  macroQuoteDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(MACRO_QUOTE_DB_NAME, MACRO_QUOTE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MACRO_QUOTE_DB_STORE)) {
        db.createObjectStore(MACRO_QUOTE_DB_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(MACRO_QUOTE_HISTORY_DB_STORE)) {
        db.createObjectStore(MACRO_QUOTE_HISTORY_DB_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB open blocked'));
  }).catch((error) => {
    macroQuoteDbPromise = null;
    throw error;
  });
  return macroQuoteDbPromise;
}

async function readStoredMacroQuoteIndexedDb(): Promise<Record<string, MacroQuote | null>> {
  try {
    const db = await openMacroQuoteDb();
    return await new Promise((resolve) => {
      const transaction = db.transaction(MACRO_QUOTE_DB_STORE, 'readonly');
      const request = transaction.objectStore(MACRO_QUOTE_DB_STORE).get(MACRO_QUOTE_DB_RECORD_KEY);
      request.onsuccess = () => {
        const record = request.result as StoredMacroQuoteCacheRecord | undefined;
        if (record?.date !== FLOW_END_DATE) {
          resolve({});
          return;
        }
        resolve(sanitizeStoredQuoteMap(record.quotes));
      };
      request.onerror = () => resolve({});
      transaction.onerror = () => resolve({});
    });
  } catch {
    return {};
  }
}

async function writeStoredMacroQuoteIndexedDb(quotes: Record<string, MacroQuote | null>): Promise<void> {
  if (typeof window === 'undefined') return;
  const sanitized = sanitizeStoredQuoteMap(quotes);
  try {
    const db = await openMacroQuoteDb();
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(MACRO_QUOTE_DB_STORE, 'readwrite');
      const store = transaction.objectStore(MACRO_QUOTE_DB_STORE);
      if (Object.keys(sanitized).length === 0) {
        store.delete(MACRO_QUOTE_DB_RECORD_KEY);
      } else {
        store.put({
          key: MACRO_QUOTE_DB_RECORD_KEY,
          date: FLOW_END_DATE,
          savedAt: Date.now(),
          quotes: sanitized,
        } satisfies StoredMacroQuoteCacheRecord);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  } catch {
  }
}

async function readStoredMacroQuoteHistoryIndexedDb(): Promise<Record<string, Record<string, MacroQuote | null>>> {
  try {
    const db = await openMacroQuoteDb();
    return await new Promise((resolve) => {
      const transaction = db.transaction(MACRO_QUOTE_HISTORY_DB_STORE, 'readonly');
      const request = transaction.objectStore(MACRO_QUOTE_HISTORY_DB_STORE).getAll();
      request.onsuccess = () => {
        const next: Record<string, Record<string, MacroQuote | null>> = {};
        const records = Array.isArray(request.result) ? request.result as StoredMacroQuoteHistoryRecord[] : [];
        records.forEach((record) => {
          const date = String(record.date || record.key || '');
          if (!isDateValueText(date)) return;
          const quotes = sanitizeStoredQuoteMap(record.quotes);
          if (Object.keys(quotes).length > 0) next[date] = quotes;
        });
        resolve(next);
      };
      request.onerror = () => resolve({});
      transaction.onerror = () => resolve({});
    });
  } catch {
    return {};
  }
}

async function writeStoredMacroQuoteHistoryDateIndexedDb(date: string, quotes: Record<string, MacroQuote | null>): Promise<void> {
  if (typeof window === 'undefined' || !isDateValueText(date)) return;
  const sanitized = sanitizeStoredQuoteMap(quotes);
  try {
    const db = await openMacroQuoteDb();
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(MACRO_QUOTE_HISTORY_DB_STORE, 'readwrite');
      const store = transaction.objectStore(MACRO_QUOTE_HISTORY_DB_STORE);
      if (Object.keys(sanitized).length === 0) {
        store.delete(date);
      } else {
        store.put({
          key: date,
          date,
          savedAt: Date.now(),
          quotes: sanitized,
        } satisfies StoredMacroQuoteHistoryRecord);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  } catch {
  }
}

async function writeStoredMacroQuoteHistoryIndexedDb(history: Record<string, Record<string, MacroQuote | null>>): Promise<number> {
  const sanitizedHistory = sanitizeStoredQuoteHistory(history);
  const entries = Object.entries(sanitizedHistory);
  if (entries.length === 0) return 0;
  try {
    const db = await openMacroQuoteDb();
    return await new Promise((resolve) => {
      const transaction = db.transaction(MACRO_QUOTE_HISTORY_DB_STORE, 'readwrite');
      const store = transaction.objectStore(MACRO_QUOTE_HISTORY_DB_STORE);
      entries.forEach(([date, quotes]) => {
        store.put({
          key: date,
          date,
          savedAt: Date.now(),
          quotes,
        } satisfies StoredMacroQuoteHistoryRecord);
      });
      transaction.oncomplete = () => resolve(entries.length);
      transaction.onerror = () => resolve(0);
      transaction.onabort = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

let macroKlineDbPromise: Promise<IDBDatabase> | null = null;

function getMacroKlineCacheKey(symbol: string, reqNum: number): string {
  return `${normalizeSymbol(symbol)}:1d:${reqNum}`;
}

function openMacroKlineDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (macroKlineDbPromise) return macroKlineDbPromise;
  macroKlineDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(MACRO_KLINE_DB_NAME, MACRO_KLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MACRO_KLINE_DB_STORE)) {
        db.createObjectStore(MACRO_KLINE_DB_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB open blocked'));
  }).catch((error) => {
    macroKlineDbPromise = null;
    throw error;
  });
  return macroKlineDbPromise;
}

function sanitizeStoredCandles(candles: unknown): Candle[] | null {
  if (!Array.isArray(candles)) return null;
  const sanitized = candles.filter((candle): candle is Candle => (
    candle
    && typeof candle === 'object'
    && Number.isFinite(Number((candle as Candle).time))
    && typeof (candle as Candle).timeStr === 'string'
    && Number.isFinite(Number((candle as Candle).open))
    && Number.isFinite(Number((candle as Candle).high))
    && Number.isFinite(Number((candle as Candle).low))
    && Number.isFinite(Number((candle as Candle).close))
    && Number.isFinite(Number((candle as Candle).volume))
    && Number((candle as Candle).close) > 0
  ));
  return sanitized.length > 0 ? sanitized : null;
}

async function readStoredKlineCandles(symbol: string, reqNum: number): Promise<Candle[] | null> {
  try {
    const db = await openMacroKlineDb();
    const key = getMacroKlineCacheKey(symbol, reqNum);
    return await new Promise((resolve) => {
      const transaction = db.transaction(MACRO_KLINE_DB_STORE, 'readonly');
      const request = transaction.objectStore(MACRO_KLINE_DB_STORE).get(key);
      request.onsuccess = () => {
        const record = request.result as StoredKlineCacheRecord | undefined;
        resolve(sanitizeStoredCandles(record?.candles));
      };
      request.onerror = () => resolve(null);
      transaction.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeStoredKlineCandles(symbol: string, reqNum: number, candles: Candle[]): Promise<void> {
  const sanitized = sanitizeStoredCandles(candles);
  if (!sanitized) return;
  try {
    const db = await openMacroKlineDb();
    const key = getMacroKlineCacheKey(symbol, reqNum);
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(MACRO_KLINE_DB_STORE, 'readwrite');
      transaction.objectStore(MACRO_KLINE_DB_STORE).put({
        key,
        symbol: normalizeSymbol(symbol),
        timeframe: '1d',
        reqNum,
        candles: sanitized,
        savedAt: Date.now(),
      } satisfies StoredKlineCacheRecord & { key: string });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  } catch {
  }
}

function sanitizeStoredKlineRecord(record: unknown): (StoredKlineCacheRecord & { key: string }) | null {
  if (!record || typeof record !== 'object') return null;
  const source = record as StoredKlineCacheRecord;
  const symbol = normalizeSymbol(String(source.symbol || ''));
  const reqNum = Number(source.reqNum);
  const candles = sanitizeStoredCandles(source.candles);
  if (!symbol || !Number.isFinite(reqNum) || reqNum <= 0 || !candles) return null;
  const key = String(source.key || getMacroKlineCacheKey(symbol, reqNum));
  return {
    key,
    symbol,
    timeframe: source.timeframe || '1d',
    reqNum,
    candles,
    savedAt: Number.isFinite(Number(source.savedAt)) ? Number(source.savedAt) : Date.now(),
  };
}

async function readStoredKlineCacheRecords(): Promise<Array<StoredKlineCacheRecord & { key: string }>> {
  try {
    const db = await openMacroKlineDb();
    return await new Promise((resolve) => {
      const transaction = db.transaction(MACRO_KLINE_DB_STORE, 'readonly');
      const request = transaction.objectStore(MACRO_KLINE_DB_STORE).getAll();
      request.onsuccess = () => {
        const records = Array.isArray(request.result) ? request.result : [];
        resolve(records.map(sanitizeStoredKlineRecord).filter((record): record is StoredKlineCacheRecord & { key: string } => Boolean(record)));
      };
      request.onerror = () => resolve([]);
      transaction.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function writeStoredKlineCacheRecords(records: StoredKlineCacheRecord[]): Promise<number> {
  const sanitizedRecords = records
    .map(sanitizeStoredKlineRecord)
    .filter((record): record is StoredKlineCacheRecord & { key: string } => Boolean(record));
  if (sanitizedRecords.length === 0) return 0;
  try {
    const db = await openMacroKlineDb();
    return await new Promise((resolve) => {
      const transaction = db.transaction(MACRO_KLINE_DB_STORE, 'readwrite');
      const store = transaction.objectStore(MACRO_KLINE_DB_STORE);
      sanitizedRecords.forEach((record) => store.put(record));
      transaction.oncomplete = () => resolve(sanitizedRecords.length);
      transaction.onerror = () => resolve(0);
      transaction.onabort = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

function waitForKlineBatchInterval(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, KLINE_BATCH_INTERVAL_MS));
}

function moveIdBefore(ids: string[], movingId: string, targetId: string): string[] {
  if (movingId === targetId) return ids;
  const movingIndex = ids.indexOf(movingId);
  const targetIndex = ids.indexOf(targetId);
  if (movingIndex < 0 || targetIndex < 0) return ids;
  const next = ids.filter((id) => id !== movingId);
  const nextTargetIndex = next.indexOf(targetId);
  next.splice(nextTargetIndex, 0, movingId);
  return next;
}

function formatSortIndicator(direction: SortDirection): string {
  if (direction === 'asc') return '▲';
  if (direction === 'desc') return '▼';
  return '';
}

function getFlowPaletteColor(index: number): string {
  const flowPaletteStart = 8;
  const flowPaletteLength = FLOW_COLOR_PALETTE.length - flowPaletteStart;
  return FLOW_COLOR_PALETTE[flowPaletteStart + (index % flowPaletteLength)];
}

function getSectorFromCategory(categoryName: string): string {
  if (/素材|材料|化学|ウェーハ|フォト/.test(categoryName)) return 'Materials';
  if (/装置|検査|製造|商社/.test(categoryName)) return 'Industrials';
  if (/半導体|メーカー|チップ/.test(categoryName)) return 'Information Technology';
  return categoryName || 'Information Technology';
}

function getParentSectorFromCategory(categoryName: string): string {
  return categoryName?.trim() || 'Custom Sector';
}

function createStableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36).toUpperCase();
}

function normalizeParentSectorName(value: string): string {
  return value.replace(/[\s\u3000]+/g, ' ').trim();
}

function createParentSectorId(name: string, fallback = 'CUSTOM'): string {
  const normalizedName = normalizeParentSectorName(name);
  const ascii = normalizedName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `GRP_${ascii || createStableHash(normalizedName || fallback)}`;
}

function getBasketParentSectorName(basket: Pick<MacroBasket, 'sector' | 'parentSectorNameJa' | 'parentSectorNameEn' | 'name'>): string {
  return normalizeParentSectorName(
    basket.parentSectorNameJa
    || basket.parentSectorNameEn
    || basket.sector
    || basket.name
    || 'Custom Sector'
  );
}

function getBasketParentSectorId(basket: Pick<MacroBasket, 'id' | 'sector' | 'parentSectorId' | 'parentSectorNameJa' | 'parentSectorNameEn' | 'name'>): string {
  const parentSectorName = getBasketParentSectorName(basket);
  return createParentSectorId(parentSectorName, basket.parentSectorId?.trim() || basket.id || 'CUSTOM');
}

function sanitizeStoredStock(value: unknown): MacroStock | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<MacroStock>;
  const symbol = typeof source.symbol === 'string' ? normalizeSymbol(source.symbol) : '';
  if (!symbol) return null;
  return {
    symbol,
    name: typeof source.name === 'string' && source.name.trim() ? source.name : symbol,
    market: typeof source.market === 'string' && source.market.trim() ? source.market : symbol.startsWith('JP.') ? 'JP' : 'US',
    marketCap: Number.isFinite(Number(source.marketCap)) ? Number(source.marketCap) : 0,
    baseChangePct: Number.isFinite(Number(source.baseChangePct)) ? Number(source.baseChangePct) : 0,
  };
}

function readStoredValueChain(): StoredValueChain | null {
  try {
    const saved = localStorage.getItem(VALUE_CHAIN_STORAGE_KEY);
    if (!saved) return null;
    const source = JSON.parse(saved) as StoredValueChain;
    return source && Array.isArray(source.groups) ? source : null;
  } catch {
    return null;
  }
}

function readValueChainHistory(): StoredValueChainHistoryEntry[] {
  try {
    const saved = localStorage.getItem(CHAIN_HISTORY_STORAGE_KEY);
    if (!saved) return [];
    const source = JSON.parse(saved);
    return Array.isArray(source) ? source.filter((entry) => entry && typeof entry === 'object') : [];
  } catch {
    return [];
  }
}

function writeValueChainHistory(entries: StoredValueChainHistoryEntry[]): void {
  localStorage.setItem(CHAIN_HISTORY_STORAGE_KEY, JSON.stringify(entries));
}

function dispatchValueChainSync(): void {
  window.dispatchEvent(new Event(VALUE_CHAIN_SYNC_EVENT));
}

function createValueChainId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeCsv(value: string | number): string {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);
  const headers = rows[0]?.map((header) => header.replace(/^\uFEFF/, '').trim()) ?? [];
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function normalizeChainStock(stock: MacroStock): MacroStock {
  const symbol = normalizeSymbol(stock.symbol);
  return {
    symbol,
    name: stock.name?.trim() || symbol,
    market: stock.market?.trim() || (symbol.startsWith('JP.') ? 'JP' : 'US'),
    marketCap: Number.isFinite(Number(stock.marketCap)) ? Number(stock.marketCap) : 0,
    baseChangePct: Number.isFinite(Number(stock.baseChangePct)) ? Number(stock.baseChangePct) : 0,
  };
}

function normalizeStoredChain(chain: StoredValueChain | null | undefined, fallbackName = 'Macro Flow Basket Database'): StoredValueChain {
  const stages = Array.isArray(chain?.stages) && chain.stages.length > 0
    ? chain.stages
    : [{ id: 'macro-stage', name: 'Macro', segments: [{ id: 'macro-segment', name: 'Macro Flow', parentId: 'macro-stage' }] }];
  const categories = Array.isArray(chain?.categories) && chain.categories.length > 0
    ? chain.categories.map((category) => ({
      id: category.id || createValueChainId('category'),
      name: category.name || 'Information Technology',
      lanes: Array.isArray(category.lanes) && category.lanes.length > 0
        ? category.lanes
        : [{ id: `${category.id || 'category'}-lane`, name: 'Default' }],
    }))
    : [{ id: 'macro-category', name: 'Information Technology', lanes: [{ id: 'macro-lane', name: 'Default' }] }];
  const groups = Array.isArray(chain?.groups)
    ? chain.groups.map((group, index) => {
      const groupRecord = group as unknown as ValueChainGroup & Record<string, unknown>;
      return {
        id: group.id || createValueChainId('group'),
        categoryId: group.categoryId || categories[0].id,
        laneId: group.laneId || categories[0].lanes[0].id,
        segmentId: group.segmentId || stages[0].segments[0].id,
        name: group.name || `Basket ${index + 1}`,
        parentSectorId: group.parentSectorId || String(groupRecord.parent_sector_id || ''),
        parentSectorNameJa: group.parentSectorNameJa || String(groupRecord.sector_name_ja || groupRecord.parentSectorName || ''),
        parentSectorNameEn: group.parentSectorNameEn || String(groupRecord.sector_name_en || ''),
        market: group.market,
        stocks: Array.isArray(group.stocks) ? group.stocks.map(normalizeChainStock).filter((stock) => stock.symbol) : [],
      };
    })
    : [];
  return {
    name: chain?.name?.trim() || fallbackName,
    stages,
    categories,
    groups,
  };
}

function createChainFromBaskets(name: string, sourceBaskets: MacroBasket[]): StoredValueChain {
  const stage: ValueChainStage = { id: 'macro-stage', name: 'Macro', segments: [{ id: 'macro-segment', name: 'Macro Flow', parentId: 'macro-stage' }] };
  const categories = Array.from(new Set(sourceBaskets.map((basket) => basket.sector || 'Information Technology'))).map((sector) => ({
    id: `macro-category-${sector.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'sector'}`,
    name: sector,
    lanes: [{ id: `macro-lane-${sector.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'sector'}`, name: 'Default' }],
  }));
  return normalizeStoredChain({
    name,
    stages: [stage],
    categories,
    groups: sourceBaskets.map((basket) => {
      const category = categories.find((item) => item.name === basket.sector) || categories[0];
      const parentSectorName = getBasketParentSectorName(basket);
      return {
        id: basket.id || createValueChainId('group'),
        categoryId: category.id,
        laneId: category.lanes[0].id,
        segmentId: stage.segments[0].id,
        name: basket.name,
        parentSectorId: getBasketParentSectorId(basket),
        parentSectorNameJa: parentSectorName,
        parentSectorNameEn: basket.parentSectorNameEn || parentSectorName,
        market: basket.market,
        stocks: basket.stocks.map(normalizeChainStock),
      };
    }),
  }, name);
}

function createValueChainCsv(chain: StoredValueChain): string {
  const normalized = normalizeStoredChain(chain);
  const headers = ['chainName', 'stageId', 'stageName', 'segmentId', 'segmentName', 'categoryId', 'categoryName', 'laneId', 'laneName', 'groupId', 'groupName', 'parentSectorId', 'parentSectorNameJa', 'parentSectorNameEn', 'marketScope', 'symbol', 'name', 'market', 'marketCap', 'baseChangePct'];
  const rows = normalized.groups?.flatMap((group) => {
    const category = normalized.categories?.find((item) => item.id === group.categoryId) || normalized.categories?.[0];
    const lane = category?.lanes.find((item) => item.id === group.laneId) || category?.lanes[0];
    const stage = normalized.stages?.find((item) => item.segments.some((segment) => segment.id === group.segmentId)) || normalized.stages?.[0];
    const segment = stage?.segments.find((item) => item.id === group.segmentId) || stage?.segments[0];
    const parentSectorName = group.parentSectorNameJa || category?.name || group.name;
    const parentSectorId = group.parentSectorId || createParentSectorId(parentSectorName, group.id);
    const stocks = group.stocks.length > 0 ? group.stocks : [{ symbol: '', name: '', market: '', marketCap: 0, baseChangePct: 0 }];
    return stocks.map((stock) => [
      normalized.name || '',
      stage?.id || '',
      stage?.name || '',
      segment?.id || '',
      (segment?.name || '').replace(/\n/g, ' / '),
      category?.id || '',
      category?.name || '',
      lane?.id || '',
      lane?.name || '',
      group.id,
      group.name,
      parentSectorId,
      parentSectorName,
      group.parentSectorNameEn || parentSectorName,
      group.market || '',
      stock.symbol,
      stock.name,
      stock.market,
      stock.marketCap,
      stock.baseChangePct,
    ]);
  }) || [];
  return [headers.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\r\n');
}

function downloadText(filename: string, mimeType: string, text: string): void {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function searchMoomooCandidate(query: string): Promise<SymbolSearchCandidate | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch('/api/moomoo/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: trimmed, limit: 1 }),
      signal: controller.signal,
    });
    const data = await response.json();
    const candidates = Array.isArray(data.candidates)
      ? data.candidates as SymbolSearchCandidate[]
      : [];
    return data.success && candidates.length > 0 ? candidates[0] : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

function parseValueChainJson(text: string): StoredValueChain | null {
  const trimmed = text.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return null;
  try {
    const parsed = JSON.parse(trimmed) as StoredValueChain;
    return Array.isArray(parsed.groups) ? normalizeStoredChain(parsed) : null;
  } catch {
    return null;
  }
}

function parseValueChainCsv(text: string, baseChain: StoredValueChain): StoredValueChain | null {
  const rows = parseCsv(text);
  if (rows.length === 0) return null;
  const base = normalizeStoredChain(baseChain, rows[0]?.chainName?.trim() || 'Imported Basket Database');
  const stages = new Map<string, ValueChainStage>();
  const categories = new Map<string, ValueChainCategory>();
  const groups = new Map<string, ValueChainGroup>();
  rows.forEach((row) => {
    const stageId = row.stageId?.trim() || base.stages?.[0]?.id || 'macro-stage';
    const segmentId = row.segmentId?.trim() || base.stages?.[0]?.segments[0]?.id || 'macro-segment';
    const stage = stages.get(stageId) || { id: stageId, name: row.stageName?.trim() || stageId, segments: [] };
    if (!stage.segments.some((segment) => segment.id === segmentId)) {
      stage.segments.push({ id: segmentId, name: (row.segmentName?.trim() || segmentId).replace(/ \/ /g, '\n'), parentId: stageId });
    }
    stages.set(stageId, stage);

    const categoryId = row.categoryId?.trim() || base.categories?.[0]?.id || 'macro-category';
    const laneId = row.laneId?.trim() || base.categories?.[0]?.lanes[0]?.id || 'macro-lane';
    const category = categories.get(categoryId) || { id: categoryId, name: row.categoryName?.trim() || categoryId, lanes: [] };
    if (!category.lanes.some((lane) => lane.id === laneId)) {
      category.lanes.push({ id: laneId, name: row.laneName?.trim() || 'Default' });
    }
    categories.set(categoryId, category);

    const groupId = row.groupId?.trim();
    if (!groupId) return;
    const group = groups.get(groupId) || {
      id: groupId,
      categoryId,
      laneId,
      segmentId,
      name: row.groupName?.trim() || groupId,
      parentSectorId: row.parentSectorId?.trim() || row.parent_sector_id?.trim() || '',
      parentSectorNameJa: row.parentSectorNameJa?.trim() || row.sector_name_ja?.trim() || row.parentSectorName?.trim() || '',
      parentSectorNameEn: row.parentSectorNameEn?.trim() || row.sector_name_en?.trim() || '',
      market: row.marketScope?.trim() || '',
      stocks: [],
    };
    const rawSymbol = row.symbol?.trim() || '';
    if (rawSymbol) {
      group.stocks.push(normalizeChainStock({
        symbol: rawSymbol,
        name: row.name?.trim() || rawSymbol,
        market: row.market?.trim() || (normalizeSymbol(rawSymbol).startsWith('JP.') ? 'JP' : 'US'),
        marketCap: Number(row.marketCap) || 0,
        baseChangePct: Number(row.baseChangePct) || 0,
      }));
    }
    groups.set(groupId, group);
  });
  return normalizeStoredChain({
    name: rows[0]?.chainName?.trim() || base.name,
    stages: stages.size > 0 ? Array.from(stages.values()) : base.stages,
    categories: categories.size > 0 ? Array.from(categories.values()) : base.categories,
    groups: Array.from(groups.values()),
  });
}

function createTemplateSpec(chain: StoredValueChain): string {
  const normalized = normalizeStoredChain(chain);
  return `# MooView バリューチェーンテンプレート仕様

## JSON
- ルートに name, stages, categories, groups を持つ。
- groups[].stocks[] は symbol, name, market, marketCap, baseChangePct を持つ。

## CSV
chainName,stageId,stageName,segmentId,segmentName,categoryId,categoryName,laneId,laneName,groupId,groupName,parentSectorId,parentSectorNameJa,parentSectorNameEn,marketScope,symbol,name,market,marketCap,baseChangePct

## 現在のDB
- name: ${normalized.name}
- baskets: ${(normalized.groups || []).map((group) => group.name).join(', ')}
`;
}

function parseMacroFlowCacheJson(text: string): MacroFlowCacheExportPayload | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed[0] !== '{') return null;
  try {
    const parsed = JSON.parse(trimmed) as MacroFlowCacheExportPayload;
    if (parsed.schema !== MACRO_FLOW_CACHE_EXPORT_SCHEMA) return null;
    const quoteHistory = sanitizeStoredQuoteHistory(parsed.quoteHistory);
    const latestQuoteMap = sanitizeStoredQuoteMap(parsed.latestQuotes?.quotes);
    const latestQuotes = Object.keys(latestQuoteMap).length > 0
      ? {
        date: parsed.latestQuotes?.date || parsed.flowEndDate || FLOW_END_DATE,
        savedAt: Number.isFinite(Number(parsed.latestQuotes?.savedAt)) ? Number(parsed.latestQuotes?.savedAt) : Date.now(),
        quotes: latestQuoteMap,
      } satisfies StoredMacroQuoteCache
      : undefined;
    const klineRecords = Array.isArray(parsed.klineRecords)
      ? parsed.klineRecords.map(sanitizeStoredKlineRecord).filter((record): record is StoredKlineCacheRecord & { key: string } => Boolean(record))
      : [];
    const currentChain = parsed.valueChain?.current ? normalizeStoredChain(parsed.valueChain.current) : null;
    const history = Array.isArray(parsed.valueChain?.history)
      ? parsed.valueChain.history.map((entry, index): StoredValueChainHistoryEntry | null => {
        if (!entry || typeof entry !== 'object' || !entry.chain) return null;
        return {
          id: String(entry.id || createValueChainId(`imported-chain-${index}`)),
          importedAt: typeof entry.importedAt === 'string' ? entry.importedAt : new Date().toISOString(),
          chain: normalizeStoredChain(entry.chain),
        };
      }).filter((entry): entry is StoredValueChainHistoryEntry => Boolean(entry))
      : [];
    return {
      schema: MACRO_FLOW_CACHE_EXPORT_SCHEMA,
      schemaVersion: MACRO_FLOW_CACHE_EXPORT_VERSION,
      exportedAt: parsed.exportedAt || new Date().toISOString(),
      flowEndDate: parsed.flowEndDate,
      quoteHistory,
      latestQuotes,
      klineRecords,
      valueChain: {
        current: currentChain,
        history,
        activeHistoryId: typeof parsed.valueChain?.activeHistoryId === 'string' ? parsed.valueChain.activeHistoryId : null,
      },
    };
  } catch {
    return null;
  }
}

function mergeValueChainHistoryEntries(
  importedEntries: StoredValueChainHistoryEntry[],
  existingEntries: StoredValueChainHistoryEntry[],
): StoredValueChainHistoryEntry[] {
  const merged = new Map<string, StoredValueChainHistoryEntry>();
  [...importedEntries, ...existingEntries].forEach((entry, index) => {
    if (!entry.chain) return;
    const id = String(entry.id || `chain-history-${index}`);
    const key = `${id}::${entry.chain.name || ''}::${entry.importedAt || ''}`;
    if (merged.has(key)) return;
    merged.set(key, {
      id,
      importedAt: entry.importedAt || new Date().toISOString(),
      chain: normalizeStoredChain(entry.chain),
    });
  });
  return Array.from(merged.values());
}

function stocksToText(stocks: MacroStock[]): string {
  return stocks.map((stock) => [stock.symbol, stock.name, stock.market, stock.marketCap || '', stock.baseChangePct || ''].join(',')).join('\n');
}

function parseStocksText(text: string): MacroStock[] {
  return text.split(/\r?\n/).map((line) => {
    const [rawSymbol, rawName, rawMarket, rawMarketCap, rawBaseChangePct] = line.split(',').map((value) => value?.trim() || '');
    if (!rawSymbol) return null;
    const symbol = normalizeSymbol(rawSymbol);
    return normalizeChainStock({
      symbol,
      name: rawName || symbol,
      market: rawMarket || (symbol.startsWith('JP.') ? 'JP' : 'US'),
      marketCap: Number(rawMarketCap) || 0,
      baseChangePct: Number(rawBaseChangePct) || 0,
    });
  }).filter((stock): stock is MacroStock => Boolean(stock));
}

function convertValueChainToBaskets(source: StoredValueChain | null | undefined): MacroBasket[] {
  if (!source || !Array.isArray(source.groups)) return [];
  try {
    const categoryNames = new Map(
      (source.categories || []).map((category) => [
        String(category.id || ''),
        String(category.name || ''),
      ]),
    );
    const baskets = (source.groups || [])
      .filter((group) => group.id !== 'g-index' && Array.isArray(group.stocks) && group.stocks.length > 0)
      .map((group, index): MacroBasket | null => {
        const stocks = (group.stocks || []).map(sanitizeStoredStock).filter((stock): stock is MacroStock => Boolean(stock));
        if (stocks.length === 0) return null;
        const categoryName = categoryNames.get(String(group.categoryId || '')) || '';
        const parentSectorName = group.parentSectorNameJa?.trim()
          || group.parentSectorNameEn?.trim()
          || getParentSectorFromCategory(categoryName);
        const parentSectorId = group.parentSectorId?.trim() || createParentSectorId(parentSectorName, String(group.id || `stored-basket-${index + 1}`));
        return {
          id: String(group.id || `stored-basket-${index + 1}`),
          name: String(group.name || `Basket ${index + 1}`),
          sector: parentSectorName,
          parentSectorId,
          parentSectorNameJa: parentSectorName,
          parentSectorNameEn: group.parentSectorNameEn || parentSectorName,
          market: group.market,
          color: getFlowPaletteColor(index),
          stocks,
        };
      })
      .filter((basket): basket is MacroBasket => Boolean(basket));
    return baskets;
  } catch {
    return [];
  }
}

function readMacroScopeOptions(): MacroScopeOption[] {
  const options: MacroScopeOption[] = [
    {
      id: MACRO_ALL_SCOPE_ID,
      label: 'マクロ全体',
      detail: '全セクターを横断する上位スコープ。詳細DBは後続ステップで拡張します。',
      chain: null,
    },
  ];
  const seenLabels = new Set<string>(['マクロ全体']);
  const addChainOption = (id: string, chain: StoredValueChain | null | undefined, detail: string) => {
    const label = chain?.name?.trim();
    if (!label || seenLabels.has(label)) return;
    seenLabels.add(label);
    options.push({ id, label, detail, chain });
  };

  addChainOption('value-chain-current', readStoredValueChain(), '現在のサプライチェーン構成');
  readValueChainHistory().forEach((entry, index) => {
    addChainOption(`value-chain-history-${entry.id || index}`, entry.chain, entry.importedAt || 'サプライチェーン履歴');
  });
  return options;
}

function readSyncedMacroScopeOptions(): MacroScopeOption[] {
  const options: MacroScopeOption[] = [
    {
      id: MACRO_ALL_SCOPE_ID,
      label: 'マクロ全体',
      detail: '主要セクターETFを起点に資金フローを確認します。詳細DBは後続ステップで拡張します。',
      chain: null,
    },
  ];
  const seenIds = new Set<string>();
  const seenLabels = new Set<string>(['マクロ全体']);
  readValueChainHistory().forEach((entry, index) => {
    const historyId = String(entry.id || `history-${index}`);
    if (seenIds.has(historyId)) return;
    seenIds.add(historyId);

    const baseLabel = entry.chain?.name?.trim() || `履歴 ${index + 1}`;
    let label = baseLabel;
    if (seenLabels.has(baseLabel)) {
      if (entry.importedAt) {
        try {
          const date = new Date(entry.importedAt);
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, '0');
          const d = String(date.getDate()).padStart(2, '0');
          const hh = String(date.getHours()).padStart(2, '0');
          const mm = String(date.getMinutes()).padStart(2, '0');
          label = `${baseLabel} (${y}/${m}/${d} ${hh}:${mm})`;
        } catch {
          label = `${baseLabel} (${historyId.slice(0, 4)})`;
        }
      } else {
        label = `${baseLabel} (${historyId.slice(0, 4)})`;
      }
    }
    seenLabels.add(label);
    options.push({
      id: `value-chain-history-${historyId}`,
      label,
      detail: entry.importedAt || 'バリューチェーン履歴',
      historyId,
      chain: entry.chain,
    });
  });
  return options;
}

function readValueChainBaskets(scopeId: string, scopeOptions: MacroScopeOption[]): MacroBasket[] {
  const selectedScope = scopeOptions.find((option) => option.id === scopeId);
  if (selectedScope?.chain) {
    const selectedBaskets = convertValueChainToBaskets(selectedScope.chain);
    return selectedBaskets.length > 0 ? selectedBaskets : FALLBACK_BASKETS;
  }

  const currentBaskets = convertValueChainToBaskets(readStoredValueChain());
  return currentBaskets.length > 0 ? currentBaskets : FALLBACK_BASKETS;
}

function isSemiconductorScope(scopeId: string, scopeOptions: MacroScopeOption[], baskets: MacroBasket[]): boolean {
  const selectedScope = scopeOptions.find((option) => option.id === scopeId);
  const label = `${selectedScope?.label ?? ''} ${baskets.map((basket) => basket.name).join(' ')}`.toLowerCase();
  return /semi|semiconductor|chip|sox|半導体|213a|200a|2644/.test(label);
}

function formatImportTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function cycleDirection(direction: SortDirection): SortDirection {
  if (direction === null) return 'asc';
  if (direction === 'asc') return 'desc';
  return null;
}

function applyMetricSort<T>(
  rows: T[],
  direction: SortDirection,
  getValue: (row: T) => number,
): T[] {
  const baseline = [...rows].sort((first, second) => getValue(second) - getValue(first));
  if (!direction) return baseline;
  return baseline.sort((first, second) => {
    const value = getValue(first) - getValue(second);
    return direction === 'asc' ? value : -value;
  });
}

function dedupeStockMetrics(stocks: StockMetric[]): StockMetric[] {
  const merged = new Map<string, StockMetric>();
  stocks.forEach((stock) => {
    const key = normalizeSymbol(stock.symbol);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, stock);
      return;
    }
    const currentWeight = Math.max(1, current.nodeVolume);
    const stockWeight = Math.max(1, stock.nodeVolume);
    const totalWeight = currentWeight + stockWeight;
    merged.set(key, {
      ...current,
      basketName: current.basketName === stock.basketName ? current.basketName : `${current.basketName} / ${stock.basketName}`,
      baseVolume: current.baseVolume + stock.baseVolume,
      nodeVolume: current.nodeVolume + stock.nodeVolume,
      flowValue: current.flowValue + stock.flowValue,
      score: current.score + stock.score,
      marketCap: current.marketCap + stock.marketCap,
      hasLiveQuote: current.hasLiveQuote || stock.hasLiveQuote,
      price: current.price ?? stock.price,
      changePct: ((current.changePct * currentWeight) + (stock.changePct * stockWeight)) / totalWeight,
      alpha: ((current.alpha * currentWeight) + (stock.alpha * stockWeight)) / totalWeight,
      momentum: Math.max(current.momentum, stock.momentum),
      volumeMultiplier: Math.max(current.volumeMultiplier, stock.volumeMultiplier),
    });
  });
  return Array.from(merged.values());
}

function normalizeBasketName(value: string): string {
  return value.replace(/[\s\u3000]+/g, ' ').trim().toLowerCase();
}

function mergeDuplicateBasketMetrics(baskets: BasketMetric[]): BasketMetric[] {
  const merged = new Map<string, BasketMetric>();
  baskets.forEach((basket) => {
    const parentSectorId = getBasketParentSectorId(basket);
    const parentSectorName = getBasketParentSectorName(basket);
    const key = `${parentSectorId}::${normalizeBasketName(basket.name)}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, {
        ...basket,
        parentSectorId,
        parentSectorNameJa: parentSectorName,
        parentSectorNameEn: basket.parentSectorNameEn || parentSectorName,
        sector: parentSectorName,
        stockMetrics: basket.stockMetrics.map((stock) => ({
          ...stock,
          basketId: basket.id,
          basketName: basket.name,
          sector: parentSectorId,
          sectorName: parentSectorName,
        })),
      });
      return;
    }

    const stockMetrics = dedupeStockMetrics([
      ...current.stockMetrics,
      ...basket.stockMetrics,
    ].map((stock) => ({
      ...stock,
      basketId: current.id,
      basketName: current.name,
      sector: parentSectorId,
      sectorName: parentSectorName,
    })));
    const baseVolume = stockMetrics.reduce((sum, stock) => sum + stock.baseVolume, 0);
    const nodeVolume = stockMetrics.reduce((sum, stock) => sum + stock.nodeVolume, 0);
    const liveVolume = stockMetrics.reduce((sum, stock) => sum + (stock.hasLiveQuote ? stock.nodeVolume : 0), 0);
    const changePct = liveVolume > 0
      ? stockMetrics.reduce((sum, stock) => sum + (stock.hasLiveQuote ? stock.changePct * (stock.nodeVolume / liveVolume) : 0), 0)
      : 0;
    const adjustedStockMetrics = stockMetrics.map((stock) => ({
      ...stock,
      alpha: stock.hasLiveQuote ? stock.changePct - changePct : 0,
    }));
    merged.set(key, {
      ...current,
      sector: parentSectorName,
      parentSectorId,
      parentSectorNameJa: parentSectorName,
      parentSectorNameEn: current.parentSectorNameEn || parentSectorName,
      market: current.market === basket.market ? current.market : 'Mixed',
      stocks: adjustedStockMetrics.map((stock) => ({
        symbol: stock.symbol,
        name: stock.name,
        market: stock.market,
        marketCap: stock.marketCap,
        baseChangePct: stock.baseChangePct,
      })),
      stockMetrics: adjustedStockMetrics,
      dataCoverage: adjustedStockMetrics.length > 0
        ? adjustedStockMetrics.filter((stock) => stock.hasLiveQuote).length / adjustedStockMetrics.length
        : 0,
      baseVolume,
      nodeVolume,
      volumeExpansion: (nodeVolume / Math.max(1, baseVolume)) - 1,
      changePct,
      relativeReturn: 0,
      marketCapWeight: 0,
      score: current.score + basket.score,
      flowValue: current.flowValue + basket.flowValue,
    });
  });
  return Array.from(merged.values());
}

function getDateOffset(value: string): number {
  return Math.round((dateFromValue(value).getTime() - dateFromValue(FLOW_START_DATE).getTime()) / 86_400_000);
}

function getTimelineDateOffset(value: string, startDate = FLOW_MIN_DATE): number {
  return Math.round((dateFromValue(value).getTime() - dateFromValue(startDate).getTime()) / 86_400_000);
}

function getBusinessTimelineDateOffset(value: string, startDate = FLOW_MIN_DATE): number {
  return getBusinessRangeDays(startDate, value);
}

function getTotalRangeDays(startDate = FLOW_MIN_DATE, endDate = FLOW_END_DATE): number {
  return Math.max(1, getTimelineDateOffset(endDate, startDate));
}

function getTotalBusinessRangeDays(startDate = FLOW_MIN_DATE, endDate = FLOW_END_DATE): number {
  return Math.max(1, getBusinessTimelineDateOffset(endDate, startDate));
}

function dateFromOffset(offset: number, startDate = FLOW_MIN_DATE, endDate = FLOW_END_DATE): string {
  const date = dateFromValue(startDate);
  date.setDate(date.getDate() + Math.round(clamp(offset, 0, getTotalRangeDays(startDate, endDate))));
  return formatDateValue(date);
}

function businessDateFromOffset(offset: number, startDate = FLOW_MIN_DATE, endDate = FLOW_END_DATE): string {
  const totalDays = getTotalBusinessRangeDays(startDate, endDate);
  return addBusinessDays(startDate, Math.round(clamp(offset, 0, totalDays)));
}

function getRangeProgressPct(value: string, startDate = FLOW_MIN_DATE, endDate = FLOW_END_DATE): number {
  const totalDays = getTotalRangeDays(startDate, endDate);
  return (clamp(getTimelineDateOffset(value, startDate), 0, totalDays) / totalDays) * 100;
}

function getBusinessRangeProgressPct(value: string, startDate = FLOW_MIN_DATE, endDate = FLOW_END_DATE): number {
  const totalDays = getTotalBusinessRangeDays(startDate, endDate);
  return (clamp(getBusinessTimelineDateOffset(value, startDate), 0, totalDays) / totalDays) * 100;
}

function getRangeWindowDays(startDate: string, endDate: string): number {
  return Math.max(1, getBusinessWindowDays(startDate, endDate));
}

function getSliderStartDate(rangeStartDate: string): string {
  const defaultSliderStart = getBusinessDateValueDaysAgo(DEFAULT_RANGE_DAYS * 2, FLOW_END_DATE);
  const startDate = rangeStartDate < defaultSliderStart ? rangeStartDate : defaultSliderStart;
  return clampBusinessDateValue(startDate < FLOW_MIN_DATE ? FLOW_MIN_DATE : startDate);
}

function getHeatTone(value: number, selected = false): { fill: string; border: string; text: string; stroke: string } {
  const intensity = clamp(Math.abs(value) / 8, 0.08, 1);
  const fillAlpha = selected ? 0.04 + intensity * 0.12 : 0.025 + intensity * 0.06;
  const borderAlpha = selected ? 0.26 + intensity * 0.42 : 0.14 + intensity * 0.18;
  const strokeAlpha = selected ? 0.5 + intensity * 0.42 : 0.18;
  if (value < 0) {
    return {
      fill: selected ? '#221111' : `rgba(220, 38, 38, ${fillAlpha})`,
      border: `rgba(248, 113, 113, ${borderAlpha})`,
      text: '#fca5a5',
      stroke: `rgba(220, 38, 38, ${strokeAlpha})`,
    };
  }
  return {
    fill: selected ? '#0b1d13' : `rgba(22, 163, 74, ${fillAlpha})`,
    border: `rgba(74, 222, 128, ${borderAlpha})`,
    text: '#86efac',
    stroke: `rgba(22, 163, 74, ${strokeAlpha})`,
  };
}

function getFlowStrokeColor(changePct: number, ratio: number, active: boolean, hasSelection: boolean): string {
  const strength = clamp(ratio, 0, 1);
  if (!active) {
    return `rgba(148, 163, 184, ${hasSelection ? 0.02 + strength * 0.03 : 0.05 + strength * 0.05})`;
  }
  const alpha = 0.52 + strength * 0.34;
  if (changePct < 0) return `rgba(220, 38, 38, ${alpha})`;
  return `rgba(22, 163, 74, ${alpha})`;
}

function getFlowStrokeOpacity(ratio: number, active: boolean, muted: boolean): number {
  if (muted) return 0.025;
  if (active) return clamp(0.82 + ratio * 0.12, 0.82, 0.96);
  return clamp(0.04 + ratio * 0.05, 0.04, 0.11);
}

function createFlowRate(changePct: number): number {
  return clamp(changePct / 100, -0.95, 10);
}

function createNodeVolume(baseVolume: number, flowRate: number): number {
  return Math.max(0, baseVolume * (1 + flowRate));
}

function createMomentum(changePct: number): number {
  return Math.max(0.01, Math.abs(changePct) / 100);
}

function createNodeHeight(nodeVolume: number, maxNodeVolume: number): number {
  const ratio = Math.sqrt(nodeVolume / Math.max(1, maxNodeVolume));
  return clamp(FLOW_NODE_MIN_HEIGHT + ratio * (FLOW_NODE_MAX_HEIGHT - FLOW_NODE_MIN_HEIGHT), FLOW_NODE_MIN_HEIGHT, FLOW_NODE_MAX_HEIGHT);
}

function layoutFlowColumn(nodes: Omit<FlowNode, 'top'>[]): FlowNode[] {
  let cursor = FLOW_PANEL_PADDING_Y;
  return nodes.map((node) => {
    const top = cursor;
    cursor += node.height + FLOW_ROW_GAP;
    return { ...node, top };
  });
}

function layoutFlowSections(sections: Array<{ label: string; nodes: Omit<FlowNode, 'top'>[] }>): { nodes: FlowNode[]; headers: FlowSectionHeader[] } {
  let cursor = FLOW_PANEL_PADDING_Y;
  const headers: FlowSectionHeader[] = [];
  const nodes: FlowNode[] = [];
  sections.forEach((section) => {
    if (section.nodes.length === 0) return;
    headers.push({ label: section.label, top: cursor });
    cursor += FLOW_SECTION_LABEL_HEIGHT;
    section.nodes.forEach((node) => {
      nodes.push({ ...node, top: cursor });
      cursor += node.height + FLOW_ROW_GAP;
    });
    cursor += FLOW_SECTION_GAP;
  });
  return { nodes, headers };
}

function getFlowNodeY(node: FlowNode): number {
  return node.top + node.height / 2;
}

function createFlowPath(sourceX: number, sourceY: number, targetX: number, targetY: number): string {
  const distance = Math.max(1, targetX - sourceX);
  const controlDistance = clamp(distance * 0.42, 12, Math.max(12, distance * 0.48));
  return `M ${sourceX} ${sourceY} C ${sourceX + controlDistance} ${sourceY}, ${targetX - controlDistance} ${targetY}, ${targetX} ${targetY}`;
}

function getCandleDateValue(candle: Candle): string {
  if (candle.timeStr) return candle.timeStr.slice(0, 10);
  return new Date(candle.time * 1000).toISOString().slice(0, 10);
}

function getCandleDateTime(candle: Candle): number {
  return dateFromValue(getCandleDateValue(candle)).getTime();
}

function getCandlesWithLatestQuote(candles: Candle[] | undefined, quote: MacroQuote | undefined, endDate: string): Candle[] | undefined {
  if (!quote || endDate !== FLOW_END_DATE || !Number.isFinite(quote.price) || quote.price <= 0) return candles;
  const quoteDate = quote.dataDate && quote.dataDate <= endDate ? quote.dataDate : endDate;
  const liveCandle: Candle = {
    time: Math.floor(dateFromValue(quoteDate).getTime() / 1000),
    timeStr: `${quoteDate} 00:00:00`,
    open: quote.price,
    high: quote.price,
    low: quote.price,
    close: quote.price,
    volume: quote.volume ?? 0,
  };
  return [
    ...(candles || []).filter((candle) => getCandleDateValue(candle) !== quoteDate),
    liveCandle,
  ].sort((first, second) => getCandleDateValue(first).localeCompare(getCandleDateValue(second)));
}

function getCandlesForRange(candles: Candle[] | undefined, startDate: string, endDate: string): Candle[] {
  if (!candles || candles.length === 0) return [];
  const ranged = candles.filter((candle) => {
    const dateValue = getCandleDateValue(candle);
    return dateValue >= startDate && dateValue <= endDate;
  });
  if (ranged.length >= 2) return ranged;
  return candles.slice(-Math.min(24, candles.length));
}

function getRangeCandleEndpoints(candles: Candle[] | undefined, startDate: string, endDate: string): { start: Candle; end: Candle } | null {
  if (!candles || candles.length < 2) return null;
  const sortedCandles = [...candles]
    .filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
    .sort((first, second) => getCandleDateValue(first).localeCompare(getCandleDateValue(second)));
  if (sortedCandles.length < 2) return null;
  const endCandle = [...sortedCandles].reverse().find((candle) => getCandleDateValue(candle) <= endDate)
    || sortedCandles.find((candle) => getCandleDateValue(candle) >= endDate)
    || sortedCandles[sortedCandles.length - 1];
  if (!endCandle) return null;
  const endTime = getCandleDateTime(endCandle);
  const startCandle = startDate === endDate
    ? [...sortedCandles].reverse().find((candle) => getCandleDateTime(candle) < endTime)
    : sortedCandles.find((candle) => getCandleDateValue(candle) >= startDate)
      || [...sortedCandles].reverse().find((candle) => getCandleDateValue(candle) <= startDate)
      || sortedCandles[0];
  if (!startCandle || startCandle === endCandle) return null;
  return { start: startCandle, end: endCandle };
}

function getDailyChangePctFromCandle(candle: Candle, previousCandle?: Candle): number | null {
  const previousClose = previousCandle?.close;
  if (Number.isFinite(previousClose) && previousClose && previousClose > 0) {
    return ((candle.close - previousClose) / previousClose) * 100;
  }
  if (Number.isFinite(candle.open) && candle.open > 0) {
    return ((candle.close - candle.open) / candle.open) * 100;
  }
  return null;
}

function getRangeChangePctFromCandles(candles: Candle[] | undefined, startDate: string, endDate: string): number | null {
  if (!candles || candles.length === 0) return null;
  const sortedCandles = [...candles]
    .filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
    .sort((first, second) => getCandleDateValue(first).localeCompare(getCandleDateValue(second)));
  if (sortedCandles.length === 0) return null;

  const endIndex = (() => {
    let beforeOrSameIndex = -1;
    for (let index = sortedCandles.length - 1; index >= 0; index -= 1) {
      if (getCandleDateValue(sortedCandles[index]) <= endDate) {
        beforeOrSameIndex = index;
        break;
      }
    }
    if (beforeOrSameIndex >= 0) return beforeOrSameIndex;
    return sortedCandles.findIndex((candle) => getCandleDateValue(candle) >= endDate);
  })();
  if (endIndex < 0) return null;
  const endCandle = sortedCandles[endIndex];

  if (startDate === endDate) {
    return getDailyChangePctFromCandle(endCandle, sortedCandles[endIndex - 1]);
  }

  let baseIndex = -1;
  for (let index = endIndex - 1; index >= 0; index -= 1) {
    if (getCandleDateValue(sortedCandles[index]) < startDate) {
      baseIndex = index;
      break;
    }
  }
  const baseCandle = baseIndex >= 0
    ? sortedCandles[baseIndex]
    : sortedCandles.find((candle) => getCandleDateValue(candle) >= startDate);
  if (!baseCandle || baseCandle === endCandle || baseCandle.close <= 0) return null;
  return ((endCandle.close / baseCandle.close) - 1) * 100;
}

function getVolumeMultiplierFromCandles(candles: Candle[] | undefined, startDate: string, endDate: string): number {
  if (!candles || candles.length === 0) return 0;
  const sortedCandles = [...candles]
    .filter((candle) => Number.isFinite(Number(candle.volume)) && Number(candle.volume) > 0)
    .sort((first, second) => getCandleDateValue(first).localeCompare(getCandleDateValue(second)));
  if (sortedCandles.length === 0) return 0;

  const startIndex = Math.max(0, sortedCandles.findIndex((candle) => getCandleDateValue(candle) >= startDate));
  let endIndex = -1;
  for (let index = sortedCandles.length - 1; index >= 0; index -= 1) {
    if (getCandleDateValue(sortedCandles[index]) <= endDate) {
      endIndex = index;
      break;
    }
  }
  if (endIndex < startIndex) return 0;

  const rangeCandles = sortedCandles.slice(startIndex, endIndex + 1);
  const previousCandles = sortedCandles.slice(Math.max(0, startIndex - 25), startIndex);
  const rangeAverageVolume = rangeCandles.reduce((sum, candle) => sum + Number(candle.volume), 0) / Math.max(1, rangeCandles.length);
  if (previousCandles.length === 0) return 1;
  const previousAverageVolume = previousCandles.reduce((sum, candle) => sum + Number(candle.volume), 0) / previousCandles.length;
  if (!Number.isFinite(previousAverageVolume) || previousAverageVolume <= 0) return 1;
  return clamp(rangeAverageVolume / previousAverageVolume, 0.01, 50);
}

function getRangeEndPriceFromCandles(candles: Candle[] | undefined, startDate: string, endDate: string): number | null {
  const endpoints = getRangeCandleEndpoints(candles, startDate, endDate);
  if (endpoints) return endpoints.end.close;
  if (!candles || candles.length === 0) return null;
  const sortedCandles = [...candles]
    .filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
    .sort((first, second) => getCandleDateValue(first).localeCompare(getCandleDateValue(second)));
  const endCandle = [...sortedCandles].reverse().find((candle) => getCandleDateValue(candle) <= endDate)
    || sortedCandles.find((candle) => getCandleDateValue(candle) >= endDate)
    || sortedCandles[sortedCandles.length - 1];
  return endCandle?.close ?? null;
}

function getQuoteHistoryDates(history: Record<string, Record<string, MacroQuote | null>>): string[] {
  return Object.keys(history).filter(isDateValueText).sort((first, second) => first.localeCompare(second));
}

function findQuoteHistoryDate(dates: string[], targetDate: string, direction: 'forward' | 'backward'): string | null {
  if (dates.length === 0) return null;
  if (direction === 'forward') {
    return dates.find((date) => date >= targetDate) || null;
  }
  for (let index = dates.length - 1; index >= 0; index -= 1) {
    if (dates[index] <= targetDate) return dates[index];
  }
  return null;
}

function getQuoteFromHistory(
  symbol: string,
  history: Record<string, Record<string, MacroQuote | null>>,
  date: string,
): MacroQuote | null {
  return history[date]?.[normalizeSymbol(symbol)] || null;
}

function getStoredQuoteForDate(
  symbol: string,
  date: string,
  history: Record<string, Record<string, MacroQuote | null>>,
  latestQuotes?: Record<string, MacroQuote | null>,
): MacroQuote | null {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (date === FLOW_END_DATE && latestQuotes?.[normalizedSymbol]) {
    return latestQuotes[normalizedSymbol] || null;
  }
  return history[date]?.[normalizedSymbol] || null;
}

function shouldReplaceStoredQuoteWithKline(quote: MacroQuote | null, date: string): boolean {
  if (!quote) return true;
  if (date >= FLOW_END_DATE) return false;
  if (quote.source === 'kline' || quote.finalized === true) return false;
  return true;
}

function getBackfillReqNumForDateCount(dateCount: number): number {
  if (dateCount <= 1) return 2;
  return Math.min(1000, Math.max(260, dateCount + 20));
}

function createMacroQuoteFromDailyCandle(
  symbol: string,
  candle: Candle,
  previousCandle: Candle | undefined,
  fallbackQuote?: MacroQuote,
): MacroQuote | null {
  const price = Number(candle.close);
  if (!Number.isFinite(price) || price <= 0) return null;
  const previousClose = Number(previousCandle?.close);
  const open = Number(candle.open);
  const changePct = Number.isFinite(previousClose) && previousClose > 0
    ? ((price / previousClose) - 1) * 100
    : Number.isFinite(open) && open > 0
      ? ((price / open) - 1) * 100
      : 0;
  return {
    name: fallbackQuote?.name || symbol,
    price,
    changePct,
    marketCap: fallbackQuote?.marketCap,
    volume: Number.isFinite(Number(candle.volume)) && Number(candle.volume) > 0 ? Number(candle.volume) : fallbackQuote?.volume,
    dataDate: getCandleDateValue(candle),
    source: 'kline',
    finalized: getCandleDateValue(candle) < FLOW_END_DATE,
  };
}

function createQuoteHistoryUpdatesFromCandles(
  symbol: string,
  candles: Candle[],
  targetDates: Set<string>,
  existingHistory: Record<string, Record<string, MacroQuote | null>>,
  latestQuotes: Record<string, MacroQuote | null>,
): Record<string, Record<string, MacroQuote | null>> {
  const normalizedSymbol = normalizeSymbol(symbol);
  const sortedCandles = [...candles]
    .filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
    .sort((first, second) => getCandleDateValue(first).localeCompare(getCandleDateValue(second)));
  const updates: Record<string, Record<string, MacroQuote | null>> = {};
  sortedCandles.forEach((candle, index) => {
    const date = getCandleDateValue(candle);
    if (!targetDates.has(date)) return;
    const storedQuote = getStoredQuoteForDate(normalizedSymbol, date, existingHistory, latestQuotes);
    if (!shouldReplaceStoredQuoteWithKline(storedQuote, date)) return;
    const quote = createMacroQuoteFromDailyCandle(normalizedSymbol, candle, sortedCandles[index - 1], latestQuotes[normalizedSymbol] || undefined);
    if (!quote) return;
    updates[date] = {
      ...(updates[date] || {}),
      [normalizedSymbol]: quote,
    };
  });
  return updates;
}

function getQuoteHistoryEndPrice(
  symbol: string,
  history: Record<string, Record<string, MacroQuote | null>>,
  startDate: string,
  endDate: string,
  latestQuote?: MacroQuote,
): number | null {
  if (endDate === FLOW_END_DATE && latestQuote && Number.isFinite(latestQuote.price) && latestQuote.price > 0) {
    return latestQuote.price;
  }
  const dates = getQuoteHistoryDates(history);
  const endHistoryDate = findQuoteHistoryDate(dates, endDate, 'backward');
  if (!endHistoryDate || endHistoryDate < startDate) return null;
  const endQuote = getQuoteFromHistory(symbol, history, endHistoryDate);
  return endQuote && Number.isFinite(endQuote.price) && endQuote.price > 0 ? endQuote.price : null;
}

function getQuoteHistoryChangePct(
  symbol: string,
  history: Record<string, Record<string, MacroQuote | null>>,
  startDate: string,
  endDate: string,
  latestQuote?: MacroQuote,
): number | null {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (startDate === endDate && endDate === FLOW_END_DATE && latestQuote && Number.isFinite(latestQuote.changePct)) {
    return Number(latestQuote.changePct);
  }
  const dates = getQuoteHistoryDates(history);
  const endHistoryDate = endDate === FLOW_END_DATE && latestQuote ? FLOW_END_DATE : findQuoteHistoryDate(dates, endDate, 'backward');
  const endQuote = endDate === FLOW_END_DATE && latestQuote
    ? latestQuote
    : endHistoryDate ? getQuoteFromHistory(normalizedSymbol, history, endHistoryDate) : null;
  if (!endHistoryDate || !endQuote || !Number.isFinite(endQuote.price) || endQuote.price <= 0) return null;
  if (startDate === endDate) {
    return Number.isFinite(endQuote.changePct) ? Number(endQuote.changePct) : null;
  }
  const startHistoryDate = findQuoteHistoryDate(dates, startDate, 'forward');
  if (!startHistoryDate || startHistoryDate > endHistoryDate) return null;
  const startQuote = getQuoteFromHistory(normalizedSymbol, history, startHistoryDate);
  if (!startQuote || !Number.isFinite(startQuote.price) || startQuote.price <= 0) return null;
  return ((endQuote.price / startQuote.price) - 1) * 100;
}

function hasUsableRangeCandles(candles: Candle[] | undefined, startDate: string, endDate: string): boolean {
  if (!candles || candles.length === 0) return false;
  return getRangeChangePctFromCandles(candles, startDate, endDate) !== null;
}

function hasCandlesForRequestedRange(candles: Candle[] | undefined, startDate: string, endDate: string): boolean {
  if (!hasUsableRangeCandles(candles, startDate, endDate)) return false;
  if (startDate === endDate) return true;
  const validDates = (candles || [])
    .filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
    .map(getCandleDateValue);
  return validDates.some((dateValue) => dateValue <= startDate)
    && validDates.some((dateValue) => dateValue >= startDate && dateValue <= endDate);
}

function getSparklineReqNum(startDate: string, endDate: string): number {
  return startDate === endDate ? 2 : 260;
}

function getPeriodChangePct(
  candles: Candle[] | undefined,
  startDate: string,
  endDate: string,
  latestChangePct?: number,
): number | null {
  if (startDate === endDate && endDate === FLOW_END_DATE && Number.isFinite(latestChangePct)) {
    return Number(latestChangePct);
  }
  const rangeChangePct = getRangeChangePctFromCandles(candles, startDate, endDate);
  if (rangeChangePct !== null) return rangeChangePct;
  return null;
}

async function fetchMacroCandlesWithFallback(symbol: string): Promise<Candle[]> {
  const normalizedSymbol = normalizeSymbol(symbol);
  const candidates = new Set<string>([normalizedSymbol]);
  if (!normalizedSymbol.startsWith('JP.') && !normalizedSymbol.startsWith('HK.') && !normalizedSymbol.includes('.')) {
    candidates.add(`US.${normalizedSymbol}`);
  }
  for (const candidate of candidates) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const candles: Candle[] = [];
        if (candles.length > 0) return candles;
      } catch {
        // 次の候補またはリトライへ進む
      }
    }
  }
  return [];
}

function createRollupCandles(candleSets: Array<Candle[] | undefined>, startDate: string, endDate: string): Candle[] {
  const rangedSets = candleSets
    .map((candles) => getCandlesForRange(candles, startDate, endDate))
    .filter((candles) => candles.length >= 2);
  if (rangedSets.length === 0) return [];
  const size = Math.min(48, ...rangedSets.map((candles) => candles.length));
  if (size < 2) return [];
  const alignedSets = rangedSets.map((candles) => candles.slice(-size));
  return Array.from({ length: size }, (_, index) => {
    const values = alignedSets.map((candles) => {
      const base = Math.max(0.0001, candles[0].close);
      return (candles[index].close / base) * 100;
    });
    const close = values.reduce((sum, value) => sum + value, 0) / values.length;
    const volume = alignedSets.reduce((sum, candles) => sum + (Number(candles[index].volume) || 0), 0);
    const reference = alignedSets[0][index];
    return {
      time: reference.time,
      timeStr: reference.timeStr,
      open: close,
      high: close,
      low: close,
      close,
      volume,
    };
  });
}

function buildSparklinePath(candles: Candle[], width = 36, height = 18): string {
  if (candles.length < 2) return '';
  const values = candles.map((candle) => candle.close).filter((value) => Number.isFinite(value) && value > 0);
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.0001, max - min);
  return values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 3) - 1.5;
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function formatNodePrice(symbol: string, value: number | null): string {
  return formatRegionalPrice(symbol, value);
}

function getPriceTone(changePct: number, hasData: boolean, selected: boolean): string {
  if (selected) return '#ffffff';
  if (!hasData || !Number.isFinite(changePct)) return '#6b7280';
  return changePct >= 0 ? '#86efac' : '#fca5a5';
}

function MiniSparkline({
  candles,
  changePct,
  selected,
  startDate,
  endDate,
  width = 36,
}: {
  candles?: Candle[];
  changePct: number;
  selected: boolean;
  startDate: string;
  endDate: string;
  width?: number;
}) {
  const visibleCandles = useMemo(() => getCandlesForRange(candles, startDate, endDate), [candles, endDate, startDate]);
  const chartWidth = clamp(width, 18, 36);
  const path = useMemo(() => buildSparklinePath(visibleCandles, chartWidth), [chartWidth, visibleCandles]);
  const color = selected ? '#ffffff' : changePct >= 0 ? '#34d399' : '#fb7185';
  const fillColor = selected ? 'rgba(255,255,255,0.08)' : changePct >= 0 ? 'rgba(52,211,153,0.09)' : 'rgba(248,113,113,0.09)';
  return (
    <svg className="h-[18px] overflow-visible" style={{ width: chartWidth }} viewBox={`0 0 ${chartWidth} 18`} aria-hidden="true">
      {path ? (
        <>
          <path d={`${path} L ${chartWidth} 18 L 0 18 Z`} fill={fillColor} stroke="none" />
          <path d={path} fill="none" stroke={color} strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <path d={`M 0 9 L ${chartWidth} 9`} fill="none" stroke="#1f2937" strokeWidth="1" strokeDasharray="1.5 2.5" />
      )}
    </svg>
  );
}

function FlowCardBody({
  title,
  subtitle,
  changeText,
  changeTone,
  priceText,
  priceTone,
  candles,
  changePct,
  selected,
  monoTitle = false,
  startDate,
  endDate,
  columnWidth,
  showSparkline = true,
}: {
  title: string;
  subtitle: string;
  changeText: string;
  changeTone: string;
  priceText: string;
  priceTone: string;
  candles?: Candle[];
  changePct: number;
  selected: boolean;
  monoTitle?: boolean;
  startDate: string;
  endDate: string;
  columnWidth: number;
  showSparkline?: boolean;
}) {
  const sparklineWidth = showSparkline ? columnWidth < 150 ? 0 : columnWidth < 190 ? 20 : columnWidth < 230 ? 24 : 36 : 0;
  return (
    <div
      className="grid h-full min-h-0 items-center gap-1 overflow-hidden"
      style={{
        gridTemplateColumns: sparklineWidth > 0
          ? `minmax(0,1fr) ${sparklineWidth + 4}px minmax(48px,auto)`
          : 'minmax(0,1fr) minmax(48px,auto)',
      }}
    >
      <div className="min-w-0 overflow-hidden">
        <div className={`truncate text-[10px] font-bold leading-tight ${monoTitle ? 'font-mono' : ''} ${selected ? 'text-white' : ''}`}>{title}</div>
        {subtitle && <div className={`mt-0.5 truncate text-[9px] leading-tight ${selected ? 'text-white' : 'text-gray-500'}`}>{subtitle}</div>}
      </div>
      {sparklineWidth > 0 && (
        <div className="flex items-center justify-center overflow-hidden">
          <MiniSparkline candles={candles} changePct={changePct} selected={selected} startDate={startDate} endDate={endDate} width={sparklineWidth} />
        </div>
      )}
      <div className="min-w-[48px] overflow-hidden text-right">
        <div className="truncate font-mono text-[13px] font-bold leading-tight" style={{ color: changeTone }}>{changeText}</div>
        {priceText && <div className="mt-0.5 truncate font-mono text-[8px] font-normal leading-tight" style={{ color: priceTone }}>{priceText}</div>}
      </div>
    </div>
  );
}

function SidePanelButton({
  mode,
  activeMode,
  title,
  onClick,
  children,
}: {
  mode: SidePanelMode;
  activeMode: SidePanelMode;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-9 h-9 flex items-center justify-center border transition ${
        activeMode === mode
          ? 'bg-[#202020] border-[#4a4a4a] text-white'
          : 'border-transparent text-gray-400 hover:text-white hover:bg-[#161616]'
      }`}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

export function MacroFlowMap({
  tickers,
  chartState,
  onChartStateChange,
  chartTimeframe,
  onChartTimeframeChange,
  renderTickerChart,
  renderIndicatorSettings,
  onChartSymbolsChange,
  onSyncBasketsToWatchlist,
}: MacroFlowMapProps) {
  const rangeTrackRef = useRef<HTMLDivElement | null>(null);
  const macroQuoteFetchInFlightRef = useRef(false);
  const macroQuoteCacheRef = useRef<Record<string, MacroQuote | null>>({});
  const macroQuoteHistoryRef = useRef<Record<string, Record<string, MacroQuote | null>>>({});
  const quoteIndexedDbHydratedRef = useRef(false);
  const historyBackfillRunIdRef = useRef(0);
  const sparklineFetchKeysRef = useRef<Set<string>>(new Set());
  const sparklineFetchedKeysRef = useRef<Set<string>>(new Set());
  const klineQueueRunIdRef = useRef(0);
  const syncBasketsToWatchlistRef = useRef(onSyncBasketsToWatchlist);
  const [macroScopeOptions, setMacroScopeOptions] = useState<MacroScopeOption[]>(() => readSyncedMacroScopeOptions());
  const [rangeStartDate, setRangeStartDate] = useState(FLOW_END_DATE);
  const [rangeEndDate, setRangeEndDate] = useState(FLOW_END_DATE);
  const [calendarTarget, setCalendarTarget] = useState<RangeHandle>('end');
  const [dragRangeHandle, setDragRangeHandle] = useState<RangeHandle | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(FLOW_EVENT_DATE.slice(0, 7));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [macroScope, setMacroScope] = useState<string>(MACRO_ALL_SCOPE_ID);
  const [macroScopeMenuOpen, setMacroScopeMenuOpen] = useState(false);
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all');
  const [sortState, setSortState] = useState<Record<SortColumnKey, SortDirection>>({
    sectors: null,
    baskets: null,
    stocks: null,
  });
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode>('chart');
  const [activeSymbol, setActiveSymbol] = useState('NVDA');
  const [selectedStockKey, setSelectedStockKey] = useState<string | null>(null);
  const [symbolMenuOpen, setSymbolMenuOpen] = useState(false);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [selectedBasketId, setSelectedBasketId] = useState<string | null>(null);
  const [colorTarget, setColorTarget] = useState<ColorTarget>({
    id: 'global',
    label: '全体フロー',
    kind: 'flow',
  });
  const [regionalOrder, setRegionalOrder] = useState(() => REGIONAL_MARKET_DEFS.map((region) => region.id));
  const [draggingRegionalId, setDraggingRegionalId] = useState<string | null>(null);
  const [sectorEtfOrder, setSectorEtfOrder] = useState<string[]>([]);
  const [draggingSectorEtfId, setDraggingSectorEtfId] = useState<string | null>(null);
  const [draggingStockSymbol, setDraggingStockSymbol] = useState<string | null>(null);
  const [chartComparisonSymbols, setChartComparisonSymbols] = useState<string[]>([]);
  const [macroQuoteCache, setMacroQuoteCache] = useState<Record<string, MacroQuote | null>>(() => readStoredMacroQuoteCache());
  const [macroQuoteHistory, setMacroQuoteHistory] = useState<Record<string, Record<string, MacroQuote | null>>>({});
  const [quoteCacheHydrated, setQuoteCacheHydrated] = useState(false);
  const [sparklineCache, setSparklineCache] = useState<Record<string, Candle[]>>({});
  const [quoteFetchProgress, setQuoteFetchProgress] = useState<QuoteFetchProgress | null>(null);
  const [klineFetchProgress, setKlineFetchProgress] = useState<KlineFetchProgress | null>(null);
  const [historyBackfillProgress, setHistoryBackfillProgress] = useState<HistoryBackfillProgress | null>(null);
  const [quoteRefreshToken, setQuoteRefreshToken] = useState(0);
  const [cacheTransferStatus, setCacheTransferStatus] = useState<string | null>(null);
  const [stockContextMenu, setStockContextMenu] = useState<StockContextMenuState | null>(null);
  const [basketContextMenu, setBasketContextMenu] = useState<BasketContextMenuState | null>(null);
  const basketDbImportInputRef = useRef<HTMLInputElement | null>(null);
  const [basketEditor, setBasketEditor] = useState<BasketEditorState | null>(null);
  const [stockEditModal, setStockEditModal] = useState<StockEditModalState | null>(null);
  const [basketDbImportDecision, setBasketDbImportDecision] = useState<MacroImportDecisionState | null>(null);
  const [basketDbExportMenuAnchor, setBasketDbExportMenuAnchor] = useState<BasketDbExportMenuAnchor | null>(null);

  const selectedDate = rangeEndDate;
  const sliderStartDate = getSliderStartDate(rangeStartDate);
  const sliderTotalDays = getTotalBusinessRangeDays(sliderStartDate, FLOW_END_DATE);
  const timelineStartIndex = clamp(getBusinessTimelineDateOffset(rangeStartDate, sliderStartDate), 0, sliderTotalDays);
  const timelineEndIndex = clamp(getBusinessTimelineDateOffset(rangeEndDate, sliderStartDate), 0, sliderTotalDays);
  const activeWindowDays = getRangeWindowDays(rangeStartDate, rangeEndDate);
  const cumulativeDays = activeWindowDays;
  const rangeStartIndex = 0;
  const rangeEndIndex = Math.max(1, activeWindowDays);
  const rangeStartPct = getBusinessRangeProgressPct(rangeStartDate, sliderStartDate, FLOW_END_DATE);
  const rangeEndPct = getBusinessRangeProgressPct(rangeEndDate, sliderStartDate, FLOW_END_DATE);
  const [columnWidths, setColumnWidths] = useState<Record<FlowColumnKey, number>>({
    regional: FLOW_NODE_DEFAULT_WIDTH.regional,
    sectors: FLOW_NODE_DEFAULT_WIDTH.sectors,
    baskets: FLOW_NODE_DEFAULT_WIDTH.baskets,
    stocks: FLOW_NODE_DEFAULT_WIDTH.stocks,
  });
  const [columnResize, setColumnResize] = useState<ColumnResizeState | null>(null);
  const [sidePanelWidth, setSidePanelWidth] = useState(420);
  const [sidePanelResizing, setSidePanelResizing] = useState<null | { startX: number; startWidth: number }>(null);
  const flowLayout = useMemo(() => {
    const regionalLeft = FLOW_CANVAS_PADDING_X;
    const sectorsLeft = regionalLeft + columnWidths.regional + FLOW_MACRO_COLUMN_GAP;
    const basketsLeft = sectorsLeft + columnWidths.sectors + FLOW_LINK_COLUMN_GAP;
    const stocksLeft = basketsLeft + columnWidths.baskets + FLOW_LINK_COLUMN_GAP;
    const left = {
      regional: regionalLeft,
      sectors: sectorsLeft,
      baskets: basketsLeft,
      stocks: stocksLeft,
    };
    const center = {
      regional: regionalLeft + columnWidths.regional / 2,
      sectors: sectorsLeft + columnWidths.sectors / 2,
      baskets: basketsLeft + columnWidths.baskets / 2,
      stocks: stocksLeft + columnWidths.stocks / 2,
    };
    return {
      left,
      center,
      width: stocksLeft + columnWidths.stocks + FLOW_STOCK_RIGHT_PADDING,
    };
  }, [columnWidths]);
  const rawBaskets = useMemo(() => readValueChainBaskets(macroScope, macroScopeOptions), [macroScope, macroScopeOptions]);
  const baskets = useMemo(() => filterBasketsByMarket(rawBaskets, marketFilter), [marketFilter, rawBaskets]);
  const sectorEtfDefs = useMemo(
    () => (isSemiconductorScope(macroScope, macroScopeOptions, rawBaskets) ? SEMICONDUCTOR_SECTOR_ETF_DEFS : MACRO_SECTOR_ETF_DEFS),
    [macroScope, macroScopeOptions, rawBaskets],
  );
  const macroQuoteSymbols = useMemo(() => Array.from(new Set([
    ...REGIONAL_MARKET_DEFS.map((region) => normalizeSymbol(region.symbol)),
    ...sectorEtfDefs.map((item) => normalizeSymbol(item.symbol)),
    ...baskets.flatMap((basket) => basket.stocks.map((stock) => normalizeSymbol(stock.symbol))),
  ].filter((symbol) => Boolean(symbol) && !isUnsupportedDataSymbol(symbol)))), [baskets, sectorEtfDefs]);
  const macroQuoteSignature = macroQuoteSymbols.join('|');
  const tickerQuoteMap = useMemo(() => {
    const map = new Map<string, MacroQuote>();
    tickers.forEach((ticker) => {
      const quote = createTickerQuote(ticker);
      if (quote) map.set(normalizeSymbol(ticker.symbol), quote);
    });
    return map;
  }, [tickers]);
  const quoteMap = useMemo(() => {
    const map = new Map(tickerQuoteMap);
    Object.entries(macroQuoteCache).forEach(([symbol, quote]) => {
      if (quote) {
        map.set(normalizeSymbol(symbol), quote);
      } else {
        map.delete(normalizeSymbol(symbol));
      }
    });
    return map;
  }, [macroQuoteCache, tickerQuoteMap]);
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);
  const selectedMacroScopeOption = macroScopeOptions.find((option) => option.id === macroScope) || macroScopeOptions[0];
  const editableBasketChain = useMemo(
    () => normalizeStoredChain(
      selectedMacroScopeOption?.chain || createChainFromBaskets(selectedMacroScopeOption?.label || 'マクロ全体', baskets),
      selectedMacroScopeOption?.label || 'マクロ全体',
    ),
    [baskets, selectedMacroScopeOption],
  );
  const editableBasketGroups = editableBasketChain.groups || [];
  const editableCategoryById = useMemo(() => new Map(
    (editableBasketChain.categories || []).map((category) => [category.id, category]),
  ), [editableBasketChain.categories]);

  useEffect(() => {
    syncBasketsToWatchlistRef.current = onSyncBasketsToWatchlist;
  }, [onSyncBasketsToWatchlist]);

  useEffect(() => {
    syncBasketsToWatchlistRef.current?.(editableBasketChain);
  }, [editableBasketChain]);

  useEffect(() => {
    const refreshScopeOptions = () => setMacroScopeOptions(readSyncedMacroScopeOptions());
    window.addEventListener('focus', refreshScopeOptions);
    window.addEventListener('storage', refreshScopeOptions);
    window.addEventListener(VALUE_CHAIN_SYNC_EVENT, refreshScopeOptions);
    return () => {
      window.removeEventListener('focus', refreshScopeOptions);
      window.removeEventListener('storage', refreshScopeOptions);
      window.removeEventListener(VALUE_CHAIN_SYNC_EVENT, refreshScopeOptions);
    };
  }, []);

  useEffect(() => {
    if (macroScopeOptions.some((option) => option.id === macroScope)) return;
    setMacroScope(MACRO_ALL_SCOPE_ID);
  }, [macroScope, macroScopeOptions]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      readStoredMacroQuoteIndexedDb(),
      readStoredMacroQuoteHistoryIndexedDb(),
    ]).then(([storedQuotes, storedHistory]) => {
      if (cancelled) return;
      quoteIndexedDbHydratedRef.current = true;
      setQuoteCacheHydrated(true);
      if (Object.keys(storedHistory).length > 0) {
        setMacroQuoteHistory((current) => ({ ...storedHistory, ...current }));
      }
      if (Object.keys(storedQuotes).length === 0) {
        const todayQuotes = storedHistory[FLOW_END_DATE] || {};
        if (Object.keys(todayQuotes).length > 0) {
          setMacroQuoteCache((current) => ({ ...todayQuotes, ...current }));
        }
        void writeStoredMacroQuoteIndexedDb(macroQuoteCacheRef.current);
        return;
      }
      setMacroQuoteCache((current) => ({ ...storedQuotes, ...current }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    macroQuoteCacheRef.current = macroQuoteCache;
    writeStoredMacroQuoteCache(macroQuoteCache);
    if (quoteIndexedDbHydratedRef.current) {
      void writeStoredMacroQuoteIndexedDb(macroQuoteCache);
      const todayQuotes = sanitizeStoredQuoteMap(macroQuoteCache);
      const todaySnapshotQuotes = Object.fromEntries(
        Object.entries(todayQuotes).map(([symbol, quote]) => [
          symbol,
          quote ? { ...quote, source: quote.source || 'snapshot', finalized: false } : quote,
        ]),
      );
      void writeStoredMacroQuoteHistoryDateIndexedDb(FLOW_END_DATE, todaySnapshotQuotes);
      setMacroQuoteHistory((current) => {
        if (Object.keys(todaySnapshotQuotes).length === 0) return current;
        return { ...current, [FLOW_END_DATE]: todaySnapshotQuotes };
      });
    }
  }, [macroQuoteCache]);

  useEffect(() => {
    macroQuoteHistoryRef.current = macroQuoteHistory;
  }, [macroQuoteHistory]);

  useEffect(() => {
    if (!macroScopeMenuOpen) return undefined;
    const close = () => setMacroScopeMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [macroScopeMenuOpen]);

  useEffect(() => {
    if (!basketDbExportMenuAnchor) return undefined;
    const close = () => setBasketDbExportMenuAnchor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [basketDbExportMenuAnchor]);

  useEffect(() => {
    if (!stockContextMenu && !basketContextMenu) return undefined;
    const close = () => {
      setStockContextMenu(null);
      setBasketContextMenu(null);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [basketContextMenu, stockContextMenu]);

  useEffect(() => {
    if (!basketEditor && !basketDbImportDecision && !stockEditModal && !basketContextMenu && !stockContextMenu) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setBasketEditor(null);
      setBasketDbImportDecision(null);
      setBasketContextMenu(null);
      setStockContextMenu(null);
      if (!stockEditModal?.loading) setStockEditModal(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [basketContextMenu, basketDbImportDecision, basketEditor, stockContextMenu, stockEditModal]);

  useEffect(() => {
    if (!macroQuoteSignature || !quoteCacheHydrated) return undefined;
    let cancelled = false;

    const loadQuotes = async () => {
      if (macroQuoteFetchInFlightRef.current) return;
      macroQuoteFetchInFlightRef.current = true;
      const totalSymbols = macroQuoteSymbols.length;
      const historyAtStart = macroQuoteHistoryRef.current;
      const cacheAtStart = macroQuoteCacheRef.current;
      const targetSymbols = macroQuoteSymbols.filter((symbol) => (
        !getStoredQuoteForDate(symbol, FLOW_END_DATE, historyAtStart, cacheAtStart)
      ));
      const pendingSymbols = new Set(targetSymbols);
      const totalBatches = Math.max(1, Math.ceil(targetSymbols.length / SNAPSHOT_BATCH_SIZE));
      const cachedSymbols = totalSymbols - pendingSymbols.size;
      const getFetchedSymbols = () => totalSymbols - pendingSymbols.size;
      const setProgress = (status: QuoteFetchProgress['status'], currentBatch: number) => {
        setQuoteFetchProgress({
          status,
          currentBatch,
          totalBatches,
          fetchedSymbols: getFetchedSymbols(),
          totalSymbols,
          cachedSymbols,
          targetSymbols: targetSymbols.length,
          failedSymbols: Array.from(pendingSymbols),
        });
      };
      setQuoteFetchProgress({
        status: targetSymbols.length === 0 ? 'done' : 'loading',
        currentBatch: 0,
        totalBatches,
        fetchedSymbols: getFetchedSymbols(),
        totalSymbols,
        cachedSymbols,
        targetSymbols: targetSymbols.length,
        failedSymbols: Array.from(pendingSymbols),
      });
      if (targetSymbols.length === 0) {
        macroQuoteFetchInFlightRef.current = false;
        return;
      }
      const commitQuotes = (quotes: Record<string, MacroQuote | null>) => {
        if (cancelled || Object.keys(quotes).length === 0) return;
        Object.entries(quotes).forEach(([symbol, quote]) => {
          if (quote) pendingSymbols.delete(normalizeSymbol(symbol));
        });
        setMacroQuoteCache((current) => ({ ...current, ...quotes }));
      };
      const fetchSingleQuotes = async (symbols: string[]): Promise<Record<string, MacroQuote | null>> => {
        const singleBatchSize = 8;
        const resolvedQuotes: Record<string, MacroQuote | null> = {};
        for (let index = 0; index < symbols.length; index += singleBatchSize) {
          const singleBatch = symbols.slice(index, index + singleBatchSize);
          const singleResults = await Promise.all(singleBatch.map(async (symbol) => {
            try {
              const response = await fetch('/api/moomoo/quote', {
                method: 'POST',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol }),
              });
              const data = await response.json();
              if (!response.ok || !data.success) return null;
              return [symbol, parseMacroQuoteResult(data as MacroQuoteResult, symbol)] as const;
            } catch {
              return null;
            }
          }));
          const singleQuotes: Record<string, MacroQuote | null> = {};
          singleResults.forEach((result) => {
            if (!result) return;
            const [symbol, quote] = result;
            if (quote) singleQuotes[symbol] = quote;
          });
          Object.assign(resolvedQuotes, singleQuotes);
          commitQuotes(singleQuotes);
          if (cancelled) return resolvedQuotes;
        }
        return resolvedQuotes;
      };

      try {
        for (let index = 0; index < targetSymbols.length; index += SNAPSHOT_BATCH_SIZE) {
          const currentBatch = Math.floor(index / SNAPSHOT_BATCH_SIZE) + 1;
          const batch = targetSymbols.slice(index, index + SNAPSHOT_BATCH_SIZE);
          setProgress('loading', currentBatch);
          try {
            const response = await fetch('/api/moomoo/quotes', {
              method: 'POST',
              cache: 'no-store',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbols: batch }),
            });
            const data = await response.json();
            if (!response.ok || !data.success || !data.quotes) {
              throw new Error(data.error || 'quotes fetch failed');
            }
            const resolvedSymbols = new Set<string>();
            const batchQuotes: Record<string, MacroQuote | null> = {};
            Object.entries(data.quotes as Record<string, MacroQuoteResult>).forEach(([key, quote]) => {
              const requestKey = normalizeSymbol(String(key));
              const quoteKey = normalizeSymbol(String(quote.symbol || ''));
              const normalized = batch.includes(quoteKey) ? quoteKey : requestKey || quoteKey;
              if (!normalized) return;
              const parsed = parseMacroQuoteResult(quote, normalized);
              if (parsed) {
                batchQuotes[normalized] = parsed;
                resolvedSymbols.add(normalized);
              }
            });
            commitQuotes(batchQuotes);
            const missingSymbols = batch.filter((symbol) => !resolvedSymbols.has(symbol));
            await fetchSingleQuotes(missingSymbols);
          } catch {
            await fetchSingleQuotes(batch);
          }
          setProgress(currentBatch === totalBatches
            ? pendingSymbols.size === 0 ? 'done' : 'partial'
            : 'loading', currentBatch);
          if (cancelled) return;
        }
      } catch {
        if (!cancelled) {
          setMacroQuoteCache((current) => current);
        }
      } finally {
        if (!cancelled) {
          setQuoteFetchProgress((current) => {
            if (!current) return current;
            return {
              ...current,
              status: pendingSymbols.size === 0 ? 'done' : 'partial',
              currentBatch: Math.max(current.currentBatch, current.totalBatches),
              fetchedSymbols: getFetchedSymbols(),
              failedSymbols: Array.from(pendingSymbols),
            };
          });
        }
        macroQuoteFetchInFlightRef.current = false;
      }
    };

    void loadQuotes();
    const interval = window.setInterval(loadQuotes, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [macroQuoteSignature, macroQuoteSymbols, quoteCacheHydrated, quoteRefreshToken]);

  useEffect(() => {
    setRegionalOrder((current) => {
      const knownIds = new Set(REGIONAL_MARKET_DEFS.map((region) => region.id));
      const preserved = current.filter((id) => knownIds.has(id));
      const additions = REGIONAL_MARKET_DEFS.map((region) => region.id).filter((id) => !preserved.includes(id));
      return [...preserved, ...additions];
    });
  }, []);

  useEffect(() => {
    setSectorEtfOrder((current) => {
      const ids = sectorEtfDefs.map((item) => item.id);
      const knownIds = new Set(ids);
      const preserved = current.filter((id) => knownIds.has(id));
      const additions = ids.filter((id) => !preserved.includes(id));
      if (preserved.length === current.length && additions.length === 0) return current;
      return [...preserved, ...additions];
    });
  }, [sectorEtfDefs]);

  const metrics = useMemo<{
    baskets: BasketMetric[];
    sectors: SectorMetric[];
    stocks: StockMetric[];
  }>(() => {
    const initialBasketMetrics = baskets.map((basket, basketIndex): BasketMetric => {
      const parentSectorName = getBasketParentSectorName(basket);
      const parentSectorId = getBasketParentSectorId(basket);
      const stockInputs = basket.stocks.map((stock) => {
        const normalizedSymbol = normalizeSymbol(stock.symbol);
        const live = quoteMap.get(normalizedSymbol);
        const rangeCandles = getCandlesWithLatestQuote(sparklineCache[normalizedSymbol], live, rangeEndDate);
        const historyEndPrice = getQuoteHistoryEndPrice(normalizedSymbol, macroQuoteHistory, rangeStartDate, rangeEndDate, live);
        const historyChangePct = getQuoteHistoryChangePct(normalizedSymbol, macroQuoteHistory, rangeStartDate, rangeEndDate, live);
        const rangeEndPrice = getRangeEndPriceFromCandles(rangeCandles, rangeStartDate, rangeEndDate);
        const changePct = historyChangePct ?? getPeriodChangePct(
          rangeCandles,
          rangeStartDate,
          rangeEndDate,
          live?.changePct,
        );
        const hasLiveQuote = changePct !== null;
        const marketCap = live?.marketCap ?? stock.marketCap;
        const apiChangePct = changePct ?? 0;
        const flowRate = hasLiveQuote ? createFlowRate(apiChangePct) : 0;
        const nodeVolume = hasLiveQuote ? createNodeVolume(marketCap, flowRate) : 0;
        const volumeMultiplier = hasLiveQuote ? getVolumeMultiplierFromCandles(rangeCandles, rangeStartDate, rangeEndDate) : 0;
        const momentum = hasLiveQuote ? createMomentum(apiChangePct) : 0;
        return {
          stock,
          hasLiveQuote,
          price: historyEndPrice ?? rangeEndPrice ?? live?.price ?? null,
          marketCap,
          changePct: apiChangePct,
          nodeVolume,
          volumeMultiplier,
          momentum,
        };
      });
      const baseVolume = stockInputs.reduce((sum, input) => sum + input.marketCap, 0);
      const liveVolume = stockInputs.reduce((sum, input) => sum + (input.hasLiveQuote ? input.marketCap : 0), 0);
      const weightedStockChange = liveVolume > 0
        ? stockInputs.reduce((sum, input) => (
          sum + (input.hasLiveQuote ? input.changePct * (input.marketCap / Math.max(1, liveVolume)) : 0)
        ), 0)
        : 0;
      const dataCoverage = stockInputs.length > 0
        ? stockInputs.filter((input) => input.hasLiveQuote).length / stockInputs.length
        : 0;
      const basketChangePct = dataCoverage > 0 ? weightedStockChange : 0;
      const basketFlowRate = dataCoverage > 0 ? createFlowRate(basketChangePct) : 0;
      const nodeVolume = createNodeVolume(baseVolume, basketFlowRate);
      const stockMetrics = stockInputs.map(({ stock, hasLiveQuote, price, marketCap, changePct, nodeVolume: stockNodeVolume, volumeMultiplier, momentum }): StockMetric => {
        const alpha = hasLiveQuote ? changePct - basketChangePct : 0;
        const rawScore = hasLiveQuote
          ? Math.max(0.01, Math.abs(alpha)) * Math.sqrt(Math.max(1, stockNodeVolume)) * Math.max(0.01, volumeMultiplier) * Math.max(0.01, momentum)
          : 0;
        return {
          ...stock,
          hasLiveQuote,
          price,
          marketCap,
          basketId: basket.id,
          basketName: basket.name,
          sector: parentSectorId,
          sectorName: parentSectorName,
          baseVolume: marketCap,
          nodeVolume: stockNodeVolume,
          alpha,
          momentum,
          volumeMultiplier,
          score: rawScore,
          changePct,
          flowValue: 0,
        };
      });
      return {
        ...basket,
        sector: parentSectorName,
        parentSectorId,
        parentSectorNameJa: parentSectorName,
        parentSectorNameEn: basket.parentSectorNameEn || parentSectorName,
        color: getFlowPaletteColor(basketIndex),
        dataCoverage,
        baseVolume,
        nodeVolume,
        relativeReturn: 0,
        volumeExpansion: basketFlowRate,
        marketCapWeight: 0,
        score: 0,
        flowValue: 0,
        changePct: basketChangePct,
        stockMetrics,
      };
    });

    const mergedInitialBasketMetrics = mergeDuplicateBasketMetrics(initialBasketMetrics);

    const sectorsByName = new Map<string, SectorMetric>();
    mergedInitialBasketMetrics.forEach((basket) => {
      const parentSectorId = getBasketParentSectorId(basket);
      const parentSectorName = getBasketParentSectorName(basket);
      const current: SectorMetric = sectorsByName.get(parentSectorId) || {
        id: parentSectorId,
        name: parentSectorName,
        symbol: parentSectorId,
        displaySymbol: 'Rollup',
        price: null,
        dataCoverage: 0,
        baseVolume: 0,
        nodeVolume: 0,
        volumeExpansion: 0,
        score: 0,
        flowValue: 0,
        changePct: 0,
        baskets: [],
      };
      current.baseVolume += basket.baseVolume;
      current.nodeVolume += basket.nodeVolume;
      current.baskets = [...current.baskets, basket];
      current.dataCoverage = current.baskets.length > 0
        ? current.baskets.reduce((sum, item) => sum + item.dataCoverage, 0) / current.baskets.length
        : 0;
      const sectorReturnWeight = Math.max(1, current.baskets.reduce((sum, item) => sum + item.nodeVolume, 0));
      current.changePct = current.baskets.reduce((sum, item) => (
        sum + item.changePct * (item.nodeVolume / sectorReturnWeight)
      ), 0);
      current.volumeExpansion = (current.nodeVolume / Math.max(1, current.baseVolume)) - 1;
      sectorsByName.set(parentSectorId, current);
    });

    const sectorDrafts = Array.from(sectorsByName.values());
    const basketMetrics = mergedInitialBasketMetrics.map((basket): BasketMetric => {
      const sector = sectorsByName.get(getBasketParentSectorId(basket));
      const relativeReturn = basket.changePct - (sector?.changePct ?? 0);
      const marketCapWeight = basket.baseVolume / Math.max(1, sector?.baseVolume ?? basket.baseVolume);
      const score = basket.dataCoverage > 0
        ? Math.max(0.01, Math.abs(relativeReturn))
          * Math.max(0.02, Math.abs(basket.volumeExpansion) + 0.02)
          * Math.max(0.02, marketCapWeight)
          * 1000
        : 0;
      return {
        ...basket,
        relativeReturn,
        marketCapWeight,
        score,
      };
    });

    const basketsBySector = new Map<string, BasketMetric[]>();
    basketMetrics.forEach((basket) => {
      const parentSectorId = getBasketParentSectorId(basket);
      const rows = basketsBySector.get(parentSectorId) || [];
      rows.push(basket);
      basketsBySector.set(parentSectorId, rows);
    });

    const allocatedBasketMetrics = basketMetrics.map((basket): BasketMetric => {
      const parentSectorId = getBasketParentSectorId(basket);
      const sector = sectorsByName.get(parentSectorId);
      const siblings = basketsBySector.get(parentSectorId) || [basket];
      const siblingScoreTotal = siblings.reduce((sum, item) => sum + item.score, 0);
      const sectorExpansionVolume = Math.max(1, (sector?.nodeVolume ?? basket.nodeVolume) * Math.max(0.025, (sector?.volumeExpansion ?? 0) + 0.045));
      const allocatedFlow = sectorExpansionVolume * (basket.score / Math.max(1, siblingScoreTotal));
      const stockScoreTotal = basket.stockMetrics.reduce((sum, stock) => sum + stock.score, 0);
      const stockMetrics = basket.stockMetrics.map((stock) => ({
        ...stock,
        flowValue: allocatedFlow * (stock.score / Math.max(1, stockScoreTotal)),
      }));
      return {
        ...basket,
        flowValue: allocatedFlow,
        stockMetrics,
      };
    });

    const sectors = sectorDrafts.map((sector): SectorMetric => {
      const sectorBaskets = allocatedBasketMetrics.filter((basket) => getBasketParentSectorId(basket) === sector.id);
      const flowValue = sectorBaskets.reduce((sum, basket) => sum + basket.flowValue, 0);
      const score = sectorBaskets.reduce((sum, basket) => sum + basket.score, 0);
      return {
        ...sector,
        score,
        flowValue,
        baskets: sectorBaskets,
      };
    });

    return {
      baskets: allocatedBasketMetrics,
      sectors,
      stocks: allocatedBasketMetrics.flatMap((basket) => basket.stockMetrics),
    };
  }, [baskets, macroQuoteHistory, quoteMap, rangeEndDate, rangeEndIndex, rangeStartDate, rangeStartIndex, sparklineCache]);

  const filteredMetrics = useMemo<{
    baskets: BasketMetric[];
    sectors: SectorMetric[];
    stocks: StockMetric[];
  }>(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return metrics;
    const baskets = metrics.baskets
      .map((basket) => ({
        ...basket,
        stockMetrics: basket.stockMetrics.filter((stock) => (
          stock.symbol.toLowerCase().includes(query)
          || stock.name.toLowerCase().includes(query)
          || basket.name.toLowerCase().includes(query)
          || basket.sector.toLowerCase().includes(query)
        )),
      }))
      .filter((basket) => basket.stockMetrics.length > 0 || basket.name.toLowerCase().includes(query) || basket.sector.toLowerCase().includes(query));
    const stocks = baskets.flatMap((basket) => basket.stockMetrics);
    const sectors = metrics.sectors.filter((sector) => (
      sector.name.toLowerCase().includes(query)
      || baskets.some((basket) => getBasketParentSectorId(basket) === sector.id || basket.sector === sector.name)
    ));
    return { sectors, baskets, stocks };
  }, [metrics, searchQuery]);

  useEffect(() => {
    if (selectedSectorId && !metrics.sectors.some((sector) => sector.id === selectedSectorId)) {
      setSelectedSectorId(null);
      setSelectedBasketId(null);
      setSelectedStockKey(null);
    }
    if (selectedBasketId && !metrics.baskets.some((basket) => basket.id === selectedBasketId)) {
      setSelectedBasketId(null);
      setSelectedStockKey(null);
    }
    if (selectedStockKey) {
      const [basketId, symbol] = selectedStockKey.split(':');
      const hasStock = metrics.stocks.some((stock) => stock.basketId === basketId && normalizeSymbol(stock.symbol) === normalizeSymbol(symbol));
      if (!hasStock) setSelectedStockKey(null);
    }
  }, [metrics.baskets, metrics.sectors, metrics.stocks, selectedBasketId, selectedSectorId, selectedStockKey]);

  const orderedBaskets = useMemo(() => (
    sortState.baskets
      ? applyMetricSort<BasketMetric>(filteredMetrics.baskets, sortState.baskets, (basket) => basket.changePct)
      : applyMetricSort<BasketMetric>(filteredMetrics.baskets, null, (basket) => basket.score)
  ), [filteredMetrics.baskets, sortState.baskets]);

  const basketRank = useMemo(() => {
    return new Map(orderedBaskets.map((basket, index) => [basket.id, index]));
  }, [orderedBaskets]);

  const orderedSectors = useMemo(() => {
    if (sortState.sectors) {
      return applyMetricSort<SectorMetric>(filteredMetrics.sectors, sortState.sectors, (sector) => sector.changePct);
    }
    if (sortState.baskets) {
      return [...filteredMetrics.sectors].sort((first, second) => {
        const firstRank = Math.min(...first.baskets.map((basket) => basketRank.get(basket.id) ?? Number.MAX_SAFE_INTEGER));
        const secondRank = Math.min(...second.baskets.map((basket) => basketRank.get(basket.id) ?? Number.MAX_SAFE_INTEGER));
        return firstRank - secondRank;
      });
    }
    return applyMetricSort<SectorMetric>(filteredMetrics.sectors, null, (sector) => sector.score);
  }, [basketRank, filteredMetrics.sectors, sortState.baskets, sortState.sectors]);

  const orderedStocks = useMemo(() => {
    if (sortState.stocks) {
      return applyMetricSort<StockMetric>(filteredMetrics.stocks, sortState.stocks, (stock) => stock.changePct);
    }
    if (sortState.baskets) {
      return [...filteredMetrics.stocks].sort((first, second) => {
        const firstRank = basketRank.get(first.basketId) ?? Number.MAX_SAFE_INTEGER;
        const secondRank = basketRank.get(second.basketId) ?? Number.MAX_SAFE_INTEGER;
        if (firstRank !== secondRank) return firstRank - secondRank;
        return second.score - first.score;
      });
    }
    return applyMetricSort<StockMetric>(filteredMetrics.stocks, null, (stock) => stock.score);
  }, [basketRank, filteredMetrics.stocks, sortState.baskets, sortState.stocks]);

  const visibleStocks = useMemo(() => {
    const rawScopedStocks = selectedBasketId
      ? filteredMetrics.stocks.filter((stock) => stock.basketId === selectedBasketId)
      : selectedSectorId
        ? filteredMetrics.stocks.filter((stock) => stock.sector === selectedSectorId)
        : filteredMetrics.stocks;
    const scopedStocks = dedupeStockMetrics(rawScopedStocks);

    if (sortState.stocks) {
      return applyMetricSort<StockMetric>(scopedStocks, sortState.stocks, (stock) => stock.changePct);
    }
    if (selectedBasketId || selectedSectorId) {
      return applyMetricSort<StockMetric>(scopedStocks, null, (stock) => stock.score);
    }
    if (sortState.baskets) {
      return [...scopedStocks].sort((first, second) => {
        const firstRank = basketRank.get(first.basketId) ?? Number.MAX_SAFE_INTEGER;
        const secondRank = basketRank.get(second.basketId) ?? Number.MAX_SAFE_INTEGER;
        if (firstRank !== secondRank) return firstRank - secondRank;
        return second.score - first.score;
      });
    }
    return applyMetricSort<StockMetric>(scopedStocks, null, (stock) => stock.score);
  }, [basketRank, filteredMetrics.stocks, selectedBasketId, selectedSectorId, sortState.baskets, sortState.stocks]);

  const stockOptions = useMemo(() => {
    const seen = new Set<string>();
    return visibleStocks.filter((stock) => {
      const symbol = normalizeSymbol(stock.symbol);
      if (seen.has(symbol)) return false;
      seen.add(symbol);
      return true;
    });
  }, [visibleStocks]);

  useEffect(() => {
    if (stockOptions.length === 0) return;
    const activeSymbolNormalized = normalizeSymbol(activeSymbol);
    const activeIsRegional = [...REGIONAL_MARKET_DEFS, ...sectorEtfDefs].some((region) => normalizeSymbol(region.symbol) === activeSymbolNormalized);
    if (!activeIsRegional && !stockOptions.some((stock) => normalizeSymbol(stock.symbol) === activeSymbolNormalized)) {
      setActiveSymbol(stockOptions[0].symbol);
    }
  }, [activeSymbol, sectorEtfDefs, stockOptions]);

  useEffect(() => {
    const activeNormalized = normalizeSymbol(activeSymbol);
    setChartComparisonSymbols((current) => current.filter((symbol) => normalizeSymbol(symbol) !== activeNormalized));
  }, [activeSymbol]);

  useEffect(() => {
    const symbols = Array.from(new Set([
      activeSymbol,
      ...chartComparisonSymbols,
      ...visibleStocks.slice(0, 6).map((stock) => stock.symbol),
    ].map(normalizeSymbol).filter(Boolean)));
    onChartSymbolsChange(symbols);
  }, [activeSymbol, chartComparisonSymbols, onChartSymbolsChange, visibleStocks]);

  const topBasket = orderedBaskets[0];
  const topSector = orderedSectors[0];
  const topStock = visibleStocks[0] ?? orderedStocks[0];
  const flowBaskets = useMemo(() => {
    const scoped = selectedSectorId
      ? orderedBaskets.filter((basket) => getBasketParentSectorId(basket) === selectedSectorId)
      : orderedBaskets;
    return scoped.slice(0, selectedSectorId ? 18 : 14);
  }, [orderedBaskets, selectedSectorId]);
  const flowStocks = useMemo(() => visibleStocks.slice(0, selectedBasketId ? 24 : 18), [selectedBasketId, visibleStocks]);
  const visibleStockKeys = useMemo(() => new Set(flowStocks.map((stock) => `${stock.basketId}:${stock.symbol}`)), [flowStocks]);
  const sectorEtfRows = useMemo<SectorEtfMetric[]>(() => {
    const definitionMap = new Map(sectorEtfDefs.map((item) => [item.id, item]));
    const orderedDefinitions = (sectorEtfOrder.length > 0 ? sectorEtfOrder : sectorEtfDefs.map((item) => item.id))
      .map((id) => definitionMap.get(id))
      .filter((item): item is typeof sectorEtfDefs[number] => Boolean(item));
    return orderedDefinitions.map((item) => {
      const normalizedSymbol = normalizeSymbol(item.symbol);
      const live = quoteMap.get(normalizedSymbol);
      const rangeCandles = getCandlesWithLatestQuote(sparklineCache[normalizedSymbol], live, rangeEndDate);
      const historyEndPrice = getQuoteHistoryEndPrice(normalizedSymbol, macroQuoteHistory, rangeStartDate, rangeEndDate, live);
      const historyChangePct = getQuoteHistoryChangePct(normalizedSymbol, macroQuoteHistory, rangeStartDate, rangeEndDate, live);
      const rangeEndPrice = getRangeEndPriceFromCandles(rangeCandles, rangeStartDate, rangeEndDate);
      const periodChangePct = historyChangePct ?? getPeriodChangePct(rangeCandles, rangeStartDate, rangeEndDate, live?.changePct);
      const hasLiveQuote = periodChangePct !== null;
      const changePct = periodChangePct ?? 0;
      return {
        id: item.id,
        label: item.label,
        displaySymbol: item.displaySymbol,
        symbol: item.symbol,
        price: historyEndPrice ?? rangeEndPrice ?? live?.price ?? null,
        changePct,
        hasLiveQuote,
        nodeVolume: hasLiveQuote
          ? createNodeVolume(item.baseVolume, createFlowRate(changePct))
          : 0,
      };
    });
  }, [macroQuoteHistory, quoteMap, rangeEndDate, rangeStartDate, sectorEtfDefs, sectorEtfOrder, sparklineCache]);
  const regionalRows = useMemo<RegionalMarketMetric[]>(() => {
    const definitionMap = new Map(REGIONAL_MARKET_DEFS.map((region) => [region.id, region]));
    return regionalOrder
      .map((id) => definitionMap.get(id))
      .filter((region): region is typeof REGIONAL_MARKET_DEFS[number] => Boolean(region))
      .map((region) => {
        const normalizedSymbol = normalizeSymbol(region.symbol);
        const live = quoteMap.get(normalizedSymbol);
        const rangeCandles = getCandlesWithLatestQuote(sparklineCache[normalizedSymbol], live, rangeEndDate);
        const historyEndPrice = getQuoteHistoryEndPrice(normalizedSymbol, macroQuoteHistory, rangeStartDate, rangeEndDate, live);
        const historyChangePct = getQuoteHistoryChangePct(normalizedSymbol, macroQuoteHistory, rangeStartDate, rangeEndDate, live);
        const rangeEndPrice = getRangeEndPriceFromCandles(rangeCandles, rangeStartDate, rangeEndDate);
        const periodChangePct = historyChangePct ?? getPeriodChangePct(rangeCandles, rangeStartDate, rangeEndDate, live?.changePct);
        const hasLiveQuote = periodChangePct !== null;
        const changePct = periodChangePct ?? 0;
        return {
          id: region.id,
          label: REGIONAL_LABELS[region.id] || region.label,
          displaySymbol: region.displaySymbol,
          symbol: region.symbol,
          price: historyEndPrice ?? rangeEndPrice ?? live?.price ?? null,
          changePct,
          hasLiveQuote,
          nodeVolume: hasLiveQuote
            ? createNodeVolume(region.baseVolume, createFlowRate(changePct))
            : 0,
        };
      });
  }, [macroQuoteHistory, quoteMap, rangeEndDate, rangeStartDate, regionalOrder, sparklineCache]);
  const flowLayoutData = useMemo<{ nodes: FlowNode[]; sectionHeaders: FlowSectionHeader[] }>(() => {
    const maxRegionalVolume = Math.max(
      1,
      ...sectorEtfRows.map((item) => item.nodeVolume),
      ...regionalRows.map((region) => region.nodeVolume),
    );
    const maxSectorVolume = Math.max(1, ...orderedSectors.map((sector) => sector.nodeVolume));
    const maxBasketVolume = Math.max(1, ...flowBaskets.map((basket) => basket.nodeVolume));
    const maxStockVolume = Math.max(1, ...flowStocks.map((stock) => stock.nodeVolume));
    const sectorEtfNodes = sectorEtfRows.map((item, index): Omit<FlowNode, 'top'> => ({
      id: `sector-etf:${item.id}`,
      label: item.label,
      column: 'regional',
      rank: index,
      score: Math.abs(item.changePct),
      flowValue: 0,
      changePct: item.changePct,
      nodeVolume: item.nodeVolume,
      height: createNodeHeight(item.nodeVolume, maxRegionalVolume),
    }));
    const regionalNodes = regionalRows.map((region, index): Omit<FlowNode, 'top'> => ({
      id: `regional:${region.id}`,
      label: region.label,
      column: 'regional',
      rank: index,
      score: Math.abs(region.changePct),
      flowValue: 0,
      changePct: region.changePct,
      nodeVolume: region.nodeVolume,
      height: createNodeHeight(region.nodeVolume, maxRegionalVolume),
    }));
    const sectorNodes = orderedSectors.map((sector, index): Omit<FlowNode, 'top'> => ({
      id: `sector:${sector.id}`,
      label: sector.name,
      column: 'sectors',
      rank: index,
      score: sector.score,
      flowValue: sector.flowValue,
      changePct: sector.changePct,
      nodeVolume: sector.nodeVolume,
      height: createNodeHeight(sector.nodeVolume, maxSectorVolume),
    }));
    const basketNodes = flowBaskets.map((basket, index): Omit<FlowNode, 'top'> => ({
      id: `basket:${basket.id}`,
      label: basket.name,
      column: 'baskets',
      rank: index,
      score: basket.score,
      flowValue: basket.flowValue,
      changePct: basket.changePct,
      nodeVolume: basket.nodeVolume,
      height: createNodeHeight(basket.nodeVolume, maxBasketVolume),
    }));
    const stockNodes = flowStocks.map((stock, index): Omit<FlowNode, 'top'> => ({
      id: `stock:${stock.basketId}:${stock.symbol}`,
      label: stock.symbol,
      column: 'stocks',
      rank: index,
      score: stock.score,
      flowValue: stock.flowValue,
      changePct: stock.changePct,
      nodeVolume: stock.nodeVolume,
      height: createNodeHeight(stock.nodeVolume, maxStockVolume),
    }));
    const leftLayout = layoutFlowSections([
      { label: 'SECTORS ETF', nodes: sectorEtfNodes },
      { label: 'REGIONAL MARKETS', nodes: regionalNodes },
    ]);
    return {
      nodes: [
        ...leftLayout.nodes,
        ...layoutFlowColumn(sectorNodes),
        ...layoutFlowColumn(basketNodes),
        ...layoutFlowColumn(stockNodes),
      ],
      sectionHeaders: leftLayout.headers,
    };
  }, [flowBaskets, flowStocks, orderedSectors, regionalRows, sectorEtfRows]);
  const flowNodes = flowLayoutData.nodes;
  const flowSectionHeaders = flowLayoutData.sectionHeaders;
  const flowNodeMap = useMemo(() => {
    return new Map(flowNodes.map((node) => [node.id, node]));
  }, [flowNodes]);
  const flowLinks = useMemo<FlowLink[]>(() => {
    const links: FlowLink[] = [];
    flowBaskets.forEach((basket) => {
      const parentSectorId = getBasketParentSectorId(basket);
      if (selectedSectorId && parentSectorId !== selectedSectorId) return;
      const sectorId = `sector:${parentSectorId}`;
      const basketId = `basket:${basket.id}`;
      links.push({
        id: `sector-basket:${parentSectorId}:${basket.id}`,
        sourceId: sectorId,
        targetId: basketId,
        sourceColumn: 'sectors',
        targetColumn: 'baskets',
        flowValue: basket.flowValue,
        score: basket.score,
        changePct: basket.changePct,
        color: getHeatTone(basket.changePct, true).stroke,
        label: `Relative Return ${formatPctMaybe(basket.relativeReturn, basket.dataCoverage > 0)} x Volume Expansion ${(basket.volumeExpansion * 100).toFixed(1)}% x Market Cap Weight ${(basket.marketCapWeight * 100).toFixed(1)}%`,
      });
      basket.stockMetrics.forEach((stock) => {
        if (selectedBasketId && stock.basketId !== selectedBasketId) return;
        if (!visibleStockKeys.has(`${stock.basketId}:${stock.symbol}`)) return;
        links.push({
          id: `basket-stock:${stock.basketId}:${stock.symbol}`,
          sourceId: basketId,
          targetId: `stock:${stock.basketId}:${stock.symbol}`,
          sourceColumn: 'baskets',
          targetColumn: 'stocks',
          flowValue: stock.flowValue,
          score: stock.score,
          changePct: stock.changePct,
          color: getHeatTone(stock.changePct, true).stroke,
          label: `Alpha ${formatStockPctMaybe(stock.alpha, stock.hasLiveQuote)} x Volume ${formatStockMetric(stock.nodeVolume)} x Momentum ${stock.momentum.toFixed(2)}`,
        });
      });
    });
    return links;
  }, [flowBaskets, selectedBasketId, selectedSectorId, visibleStockKeys]);
  const stockKlineSymbols = useMemo(() => {
    const bySymbol = new Map<string, number>();
    baskets.forEach((basket) => {
      basket.stocks.forEach((stock) => {
        const symbol = normalizeSymbol(stock.symbol);
        if (!symbol || isUnsupportedDataSymbol(symbol)) return;
        const marketCap = Number(stock.marketCap);
        bySymbol.set(symbol, Math.max(bySymbol.get(symbol) || 0, Number.isFinite(marketCap) ? marketCap : 0));
      });
    });
    return Array.from(bySymbol.entries())
      .sort(([firstSymbol, firstMarketCap], [secondSymbol, secondMarketCap]) => (
        secondMarketCap - firstMarketCap || firstSymbol.localeCompare(secondSymbol)
      ))
      .map(([symbol]) => symbol);
  }, [baskets]);
  const sparklineSymbols = useMemo(() => Array.from(new Set([
    ...stockKlineSymbols,
    ...sectorEtfDefs.map((item) => normalizeSymbol(item.symbol)),
    ...REGIONAL_MARKET_DEFS.map((region) => normalizeSymbol(region.symbol)),
  ].filter((symbol) => Boolean(symbol) && !isUnsupportedDataSymbol(symbol)))), [sectorEtfDefs, stockKlineSymbols]);
  const sparklineSymbolSignature = sparklineSymbols.join('|');
  const sparklineReqNum = getSparklineReqNum(rangeStartDate, rangeEndDate);
  const sectorRollupCandles = useMemo(() => {
    const next: Record<string, Candle[]> = {};
    orderedSectors.forEach((sector) => {
      const candleSets = sector.baskets.flatMap((basket) => basket.stockMetrics.map((stock) => sparklineCache[normalizeSymbol(stock.symbol)]));
      next[sector.id] = createRollupCandles(candleSets, rangeStartDate, rangeEndDate);
    });
    return next;
  }, [orderedSectors, rangeEndDate, rangeStartDate, sparklineCache]);
  const maxLinkFlow = Math.max(1, ...flowLinks.map((link) => link.flowValue));

  useEffect(() => {
    const runId = klineQueueRunIdRef.current + 1;
    klineQueueRunIdRef.current = runId;
    sparklineFetchKeysRef.current.clear();

    if (rangeStartDate === rangeEndDate) {
      setKlineFetchProgress(null);
      return undefined;
    }

    let cancelled = false;
    const cacheAtStart = sparklineCache;

    const fetchKline = async (symbol: string): Promise<readonly [string, Candle[], string] | null> => {
      const fetchKey = getMacroKlineCacheKey(symbol, sparklineReqNum);
      if (sparklineFetchKeysRef.current.has(fetchKey)) return null;
      sparklineFetchKeysRef.current.add(fetchKey);
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const response = await fetch('/api/moomoo/kline', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbol, timeframe: '1d', reqNum: sparklineReqNum }),
            });
            const data = await response.json();
            const candles = Array.isArray(data.candles)
              ? (data.candles as Candle[]).filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
              : [];
            if (response.ok && data.success && candles.length > 0) {
              return [symbol, candles, fetchKey] as const;
            }
          } catch {
          }
        }
        return null;
      } finally {
        sparklineFetchKeysRef.current.delete(fetchKey);
      }
    };

    const loadSparklines = async () => {
      const missingAtStart = sparklineSymbols.filter((symbol) => (
        !hasCandlesForRequestedRange(cacheAtStart[symbol], rangeStartDate, rangeEndDate)
      ));
      if (missingAtStart.length === 0) {
        setKlineFetchProgress(null);
        return;
      }

      const storedResults = await Promise.all(missingAtStart.map(async (symbol) => {
        const candles = await readStoredKlineCandles(symbol, sparklineReqNum);
        if (!candles || !hasCandlesForRequestedRange(candles, rangeStartDate, rangeEndDate)) return null;
        return [symbol, candles] as const;
      }));
      if (cancelled || klineQueueRunIdRef.current !== runId) return;

      const cachedCandles: Record<string, Candle[]> = {};
      storedResults.forEach((result) => {
        if (!result) return;
        const [symbol, candles] = result;
        cachedCandles[symbol] = candles;
        sparklineFetchedKeysRef.current.add(getMacroKlineCacheKey(symbol, sparklineReqNum));
      });

      const cacheWithStored = { ...cacheAtStart, ...cachedCandles };
      const cachedCount = Object.keys(cachedCandles).length;
      if (cachedCount > 0) {
        setSparklineCache((current) => ({ ...current, ...cachedCandles }));
      }

      const remainingSymbols = sparklineSymbols.filter((symbol) => (
        !hasCandlesForRequestedRange(cacheWithStored[symbol], rangeStartDate, rangeEndDate)
      ));
      if (remainingSymbols.length === 0) {
        setKlineFetchProgress({
          status: 'done',
          currentBatch: 0,
          totalBatches: 0,
          fetchedSymbols: 0,
          totalSymbols: 0,
          cachedSymbols: missingAtStart.length,
        });
        return;
      }

      const totalBatches = Math.ceil(remainingSymbols.length / KLINE_BATCH_SIZE);
      let fetchedSymbols = 0;
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
        const currentBatch = batchIndex + 1;
        if (batchIndex > 0) {
          setKlineFetchProgress({
            status: 'waiting',
            currentBatch,
            totalBatches,
            fetchedSymbols,
            totalSymbols: remainingSymbols.length,
            cachedSymbols: cachedCount,
          });
          await waitForKlineBatchInterval();
          if (cancelled || klineQueueRunIdRef.current !== runId) return;
        }

        setKlineFetchProgress({
          status: 'loading',
          currentBatch,
          totalBatches,
          fetchedSymbols,
          totalSymbols: remainingSymbols.length,
          cachedSymbols: cachedCount,
        });

        const batch = remainingSymbols.slice(batchIndex * KLINE_BATCH_SIZE, (batchIndex + 1) * KLINE_BATCH_SIZE);
        const results = await Promise.all(batch.map(fetchKline));
        if (cancelled || klineQueueRunIdRef.current !== runId) return;

        const next: Record<string, Candle[]> = {};
        const writeTasks: Promise<void>[] = [];
        results.forEach((result) => {
          if (!result) return;
          const [symbol, candles, fetchKey] = result;
          next[symbol] = candles;
          sparklineFetchedKeysRef.current.add(fetchKey);
          writeTasks.push(writeStoredKlineCandles(symbol, sparklineReqNum, candles));
        });

        const fetchedThisBatch = Object.keys(next).length;
        fetchedSymbols += fetchedThisBatch;
        if (fetchedThisBatch > 0) {
          setSparklineCache((current) => ({ ...current, ...next }));
        }
        void Promise.all(writeTasks);

        setKlineFetchProgress({
          status: batchIndex === totalBatches - 1 ? 'done' : 'waiting',
          currentBatch,
          totalBatches,
          fetchedSymbols,
          totalSymbols: remainingSymbols.length,
          cachedSymbols: cachedCount,
        });
      }
    };

    void loadSparklines();
    return () => {
      cancelled = true;
    };
  }, [quoteRefreshToken, rangeEndDate, rangeStartDate, sparklineReqNum, sparklineSymbolSignature]);

  const flowSvgHeight = Math.max(
    460,
    FLOW_PANEL_PADDING_Y
      + Math.max(
        ...(['regional', 'sectors', 'baskets', 'stocks'] as FlowColumnKey[]).map((column) => {
          const columnNodes = flowNodes.filter((node) => node.column === column);
          if (columnNodes.length === 0) return FLOW_PANEL_PADDING_Y;
          const lastNode = columnNodes[columnNodes.length - 1];
          return lastNode.top + lastNode.height;
        }),
      )
      + FLOW_PANEL_PADDING_Y,
  );
  const flowColumnBoundaries = useMemo<Array<{ boundary: ColumnBoundary; left: number; label: string }>>(() => ([
    {
      boundary: 'regional-sector',
      left: flowLayout.left.regional + columnWidths.regional + FLOW_MACRO_COLUMN_GAP / 2,
      label: 'Regional Markets と Sectors の境界',
    },
    {
      boundary: 'sector-basket',
      left: flowLayout.left.sectors + columnWidths.sectors + FLOW_LINK_COLUMN_GAP / 2,
      label: 'Sectors と Themes の境界',
    },
    {
      boundary: 'basket-stock',
      left: flowLayout.left.baskets + columnWidths.baskets + FLOW_LINK_COLUMN_GAP / 2,
      label: 'Themes と Stocks の境界',
    },
    {
      boundary: 'stock-right',
      left: flowLayout.left.stocks + columnWidths.stocks + FLOW_STOCK_RIGHT_PADDING,
      label: 'Stocks right boundary',
    },
  ]), [columnWidths, flowLayout.left]);

  const cycleSort = (column: SortColumnKey) => {
    setSortState((current) => ({
      ...current,
      [column]: cycleDirection(current[column]),
    }));
  };

  const removeMacroScopeOption = (option: MacroScopeOption) => {
    if (!option.historyId) return;
    const nextHistory = readValueChainHistory().filter((entry, index) => String(entry.id || `history-${index}`) !== option.historyId);
    writeValueChainHistory(nextHistory);
    if (localStorage.getItem(ACTIVE_CHAIN_HISTORY_ID_STORAGE_KEY) === option.historyId) {
      localStorage.removeItem(ACTIVE_CHAIN_HISTORY_ID_STORAGE_KEY);
    }
    if (macroScope === option.id) {
      setMacroScope(MACRO_ALL_SCOPE_ID);
    }
    setMacroScopeOptions(readSyncedMacroScopeOptions());
    setMacroScopeMenuOpen(false);
    dispatchValueChainSync();
  };

  const refreshBasketScopeOptions = (nextScopeId: string) => {
    const nextOptions = readSyncedMacroScopeOptions();
    setMacroScopeOptions(nextOptions);
    setMacroScope(nextOptions.some((option) => option.id === nextScopeId) ? nextScopeId : MACRO_ALL_SCOPE_ID);
    dispatchValueChainSync();
  };

  const persistBasketDbChain = (chain: StoredValueChain, mode: 'replace-current' | 'new-history' = 'replace-current') => {
    const normalized = normalizeStoredChain(chain, chain.name || selectedMacroScopeOption?.label || 'マクロ全体');
    localStorage.setItem(VALUE_CHAIN_STORAGE_KEY, JSON.stringify(normalized));

    if (mode === 'new-history' || !selectedMacroScopeOption?.historyId) {
      const entry: StoredValueChainHistoryEntry = {
        id: createValueChainId('chain-history'),
        importedAt: new Date().toISOString(),
        chain: normalized,
      };
      const nextHistory = [entry, ...readValueChainHistory()];
      writeValueChainHistory(nextHistory);
      localStorage.setItem(ACTIVE_CHAIN_HISTORY_ID_STORAGE_KEY, entry.id || '');
      refreshBasketScopeOptions(`value-chain-history-${entry.id}`);
      return;
    }

    const historyId = selectedMacroScopeOption.historyId;
    const history = readValueChainHistory();
    const exists = history.some((entry, index) => String(entry.id || `history-${index}`) === historyId);
    const nextHistory = exists
      ? history.map((entry, index) => (
        String(entry.id || `history-${index}`) === historyId
          ? { ...entry, id: historyId, chain: normalized, importedAt: entry.importedAt || new Date().toISOString() }
          : entry
      ))
      : [{ id: historyId, importedAt: new Date().toISOString(), chain: normalized }, ...history];
    writeValueChainHistory(nextHistory);
    localStorage.setItem(ACTIVE_CHAIN_HISTORY_ID_STORAGE_KEY, historyId);
    refreshBasketScopeOptions(`value-chain-history-${historyId}`);
  };

  const getBasketGroupSector = (group: ValueChainGroup) => (
    group.parentSectorNameJa
      || group.parentSectorNameEn
      || editableCategoryById.get(group.categoryId)?.name
      || 'Custom Sector'
  );

  const findEditableBasketGroup = (groupId: string): ValueChainGroup | null => (
    editableBasketChain.groups?.find((item) => item.id === groupId) ?? null
  );

  const openBasketEditor = (group?: ValueChainGroup) => {
    const selectedSectorName = orderedSectors.find((sector) => sector.id === selectedSectorId)?.name;
    setSidePanelOpen(true);
    setSidePanelMode('basket-db');
    setBasketEditor({
      id: group?.id || null,
      name: group?.name || '',
      sector: group ? getBasketGroupSector(group) : (selectedSectorName || editableBasketChain.categories?.[0]?.name || 'Custom Sector'),
      stocksText: group ? stocksToText(group.stocks) : '',
    });
    setBasketDbImportDecision(null);
  };

  const saveBasketEditor = () => {
    if (!basketEditor) return;
    const name = basketEditor.name.trim();
    if (!name) return;
    const base = normalizeStoredChain(editableBasketChain, editableBasketChain.name || 'マクロ全体');
    const stage = base.stages?.[0] || { id: 'macro-stage', name: 'Macro', segments: [{ id: 'macro-segment', name: 'Macro Flow', parentId: 'macro-stage' }] };
    const segment = stage.segments[0] || { id: 'macro-segment', name: 'Macro Flow', parentId: stage.id };
    const sectorName = basketEditor.sector.trim() || 'Information Technology';
    const currentCategories = base.categories || [];
    const existingCategory = currentCategories.find((category) => category.name.toLowerCase() === sectorName.toLowerCase());
    const category = existingCategory || {
      id: createValueChainId('category'),
      name: sectorName,
      lanes: [{ id: createValueChainId('lane'), name: 'Default' }],
    };
    const lane = category.lanes[0] || { id: createValueChainId('lane'), name: 'Default' };
    const groupId = basketEditor.id || createValueChainId('group');
    const parentSectorId = createParentSectorId(sectorName, groupId);
    const nextGroup: ValueChainGroup = {
      id: groupId,
      categoryId: category.id,
      laneId: lane.id,
      segmentId: segment.id,
      name,
      parentSectorId,
      parentSectorNameJa: sectorName,
      parentSectorNameEn: sectorName,
      stocks: parseStocksText(basketEditor.stocksText),
    };
    const nextGroups = (base.groups || []).some((group) => group.id === groupId)
      ? (base.groups || []).map((group) => (group.id === groupId ? nextGroup : group))
      : [nextGroup, ...(base.groups || [])];
    persistBasketDbChain({
      ...base,
      stages: base.stages?.some((item) => item.id === stage.id) ? base.stages : [stage, ...(base.stages || [])],
      categories: existingCategory ? currentCategories : [category, ...currentCategories],
      groups: nextGroups,
    }, selectedMacroScopeOption?.historyId ? 'replace-current' : 'new-history');
    setBasketEditor(null);
  };

  const deleteBasketGroup = (groupId: string) => {
    const base = normalizeStoredChain(editableBasketChain, editableBasketChain.name || 'マクロ全体');
    persistBasketDbChain({
      ...base,
      groups: (base.groups || []).filter((group) => group.id !== groupId),
    }, selectedMacroScopeOption?.historyId ? 'replace-current' : 'new-history');
    if (selectedBasketId === groupId) setSelectedBasketId(null);
    setBasketContextMenu(null);
  };

  const findEditableStock = (groupId: string, symbol: string): MacroStock | null => {
    const normalizedSymbol = normalizeSymbol(symbol);
    const group = findEditableBasketGroup(groupId);
    return group?.stocks.find((stock) => normalizeSymbol(stock.symbol) === normalizedSymbol) ?? null;
  };

  const clearStockDataCache = (symbols: string[]) => {
    const normalizedSymbols = Array.from(new Set(symbols.map(normalizeSymbol).filter(Boolean)));
    if (normalizedSymbols.length === 0) return;
    setMacroQuoteCache((current) => {
      const next = { ...current };
      normalizedSymbols.forEach((symbol) => {
        delete next[symbol];
      });
      return next;
    });
    setSparklineCache((current) => {
      const next = { ...current };
      normalizedSymbols.forEach((symbol) => {
        delete next[symbol];
      });
      return next;
    });
    sparklineFetchKeysRef.current.clear();
    sparklineFetchedKeysRef.current.clear();
    klineQueueRunIdRef.current += 1;
    setKlineFetchProgress(null);
    setQuoteRefreshToken((value) => value + 1);
  };

  const fetchResolvedStockQuote = async (symbol: string): Promise<{ symbol: string; quote: MacroQuote } | null> => {
    try {
      const response = await fetch('/api/moomoo/quote', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      const data = await response.json();
      const resolvedSymbol = normalizeSymbol(String(data.symbol || symbol));
      const quote = parseMacroQuoteResult(data as MacroQuoteResult, resolvedSymbol || symbol);
      if (!response.ok || !quote) return null;
      return { symbol: resolvedSymbol || normalizeSymbol(symbol), quote };
    } catch {
      return null;
    }
  };

  const openStockEditModal = (groupId: string, symbol: string) => {
    const stock = findEditableStock(groupId, symbol);
    if (!stock) return;
    setStockEditModal({
      mode: 'edit',
      groupId,
      originalSymbol: stock.symbol,
      symbol: stock.symbol,
      name: stock.name,
      market: stock.market || (stock.symbol.startsWith('JP.') ? 'JP' : 'US'),
      loading: false,
      error: null,
    });
  };

  const openStockAddModal = (groupId: string) => {
    const group = findEditableBasketGroup(groupId);
    if (!group) return;
    setStockEditModal({
      mode: 'add',
      groupId,
      originalSymbol: '',
      symbol: '',
      name: '',
      market: group.market || (marketFilter === 'all' ? '' : marketFilter.toUpperCase()),
      loading: false,
      error: null,
    });
    setBasketContextMenu(null);
    setStockContextMenu(null);
  };

  const deleteEditableStock = (_groupId: string, symbol: string) => {
    const normalizedSymbol = normalizeSymbol(symbol);

    // 1. 現在のメイン構成 (VALUE_CHAIN_STORAGE_KEY) から該当銘柄を削除して保存
    // currentChain が null の場合（初期デフォルト状態）は、rawBaskets から chain を構築して保存する
    const currentChain = readStoredValueChain()
      ?? normalizeStoredChain(createChainFromBaskets(selectedMacroScopeOption?.label || 'マクロ全体', rawBaskets));
    const nextGroups = (currentChain.groups || []).map((group) => {
      const nextStocks = (group.stocks || []).filter(
        (item) => normalizeSymbol(item.symbol) !== normalizedSymbol
      );
      return {
        ...group,
        stocks: nextStocks,
      };
    });
    localStorage.setItem(VALUE_CHAIN_STORAGE_KEY, JSON.stringify({ ...currentChain, groups: nextGroups }));

    // 2. 履歴データ (CHAIN_HISTORY_STORAGE_KEY) の全エントリーから該当銘柄を削除して保存
    const history = readValueChainHistory();
    const nextHistory = history.map((entry) => {
      if (!entry.chain) return entry;
      const nextGroups = (entry.chain.groups || []).map((group) => {
        const nextStocks = (group.stocks || []).filter(
          (item) => normalizeSymbol(item.symbol) !== normalizedSymbol
        );
        return {
          ...group,
          stocks: nextStocks,
        };
      });
      return {
        ...entry,
        chain: { ...entry.chain, groups: nextGroups },
      };
    });
    writeValueChainHistory(nextHistory);

    // 3. 表示用の現在のデータキャッシュをクリア
    clearStockDataCache([symbol, normalizedSymbol]);

    // 4. アプリケーション全体に削除イベントを通知
    window.dispatchEvent(new CustomEvent('mooview:delete-global-stock', { detail: { symbol } }));

    // 5. 選択状態のクリア
    const selectedStockSymbol = selectedStockKey?.split(':').slice(1).join(':') || '';
    if (normalizeSymbol(selectedStockSymbol) === normalizedSymbol) {
      setSelectedStockKey(null);
    }
    if (normalizeSymbol(activeSymbol) === normalizedSymbol) {
      setActiveSymbol('NVDA');
    }
    setStockContextMenu(null);

    // 6. 同期イベントを発火して表示を即時更新（storage イベントリスナーが拾う）
    dispatchValueChainSync();
    // さらに React state を直接更新して確実に再レンダリングを保証する
    setMacroScopeOptions(readSyncedMacroScopeOptions());
  };

  const resolveStockInput = async (
    rawSymbol: string,
    rawName: string,
    rawMarket: string,
    fallbackStock: MacroStock | null,
  ): Promise<MacroStock> => {
    const cleanSymbolInput = rawSymbol.trim();
    const cleanNameInput = rawName.trim();
    const symbolLooksLikeCode = isLikelyTickerInput(cleanSymbolInput);
    let symbol = symbolLooksLikeCode ? normalizeSymbol(cleanSymbolInput) : '';
    let name = cleanNameInput;
    let market = rawMarket.trim().toUpperCase();
    let quoteResult = symbol ? await fetchResolvedStockQuote(symbol) : null;
    let candidate: SymbolSearchCandidate | null = null;

    if (!quoteResult) {
      const searchQueries = Array.from(new Set([cleanNameInput, cleanSymbolInput].filter(Boolean)));
      for (const query of searchQueries) {
        candidate = await searchMoomooCandidate(query);
        const candidateSymbol = normalizeSymbol(candidate?.symbol || candidate?.code || '');
        if (!candidateSymbol || candidateSymbol === symbol) continue;
        const candidateQuote = await fetchResolvedStockQuote(candidateSymbol);
        if (candidateQuote) {
          symbol = candidateQuote.symbol;
          quoteResult = candidateQuote;
          break;
        }
        if (!symbol) {
          symbol = candidateSymbol;
        }
        if (!name && candidate) {
          name = candidate.name || candidate.nameEn || candidate.code || candidateSymbol;
        }
        if (!market && candidate?.market) {
          market = candidate.market;
        }
      }
    }

    if (!symbol) {
      throw new Error('銘柄コード、または検索できる銘柄名を入力してください。');
    }

    const quote = quoteResult?.quote;
    const quoteSymbol = quoteResult?.symbol ? normalizeSymbol(quoteResult.symbol) : symbol;
    const resolvedSymbol = quoteSymbol || symbol;
    const resolvedName = name || quote?.name || candidate?.name || candidate?.nameEn || fallbackStock?.name || resolvedSymbol;
    const resolvedMarket = market || candidate?.market || (resolvedSymbol.startsWith('JP.') ? 'JP' : 'US');
    return normalizeChainStock({
      symbol: resolvedSymbol,
      name: resolvedName,
      market: resolvedMarket,
      marketCap: quote?.marketCap ?? fallbackStock?.marketCap ?? 0,
      baseChangePct: quote?.changePct ?? fallbackStock?.baseChangePct ?? 0,
    });
  };

  const submitStockEdit = async () => {
    if (!stockEditModal || stockEditModal.loading) return;
    const modal = stockEditModal;
    const fallbackStock = modal.mode === 'edit' ? findEditableStock(modal.groupId, modal.originalSymbol) : null;
    setStockEditModal({ ...modal, loading: true, error: null });
    try {
      const stock = await resolveStockInput(modal.symbol, modal.name, modal.market, fallbackStock);
      const base = normalizeStoredChain(editableBasketChain, editableBasketChain.name || 'マクロ全体');
      const nextGroups = (base.groups || []).map((group) => {
        if (group.id !== modal.groupId) return group;
        const normalizedStockSymbol = normalizeSymbol(stock.symbol);
        const normalizedOriginalSymbol = normalizeSymbol(modal.originalSymbol);
        const existingIndex = group.stocks.findIndex((item) => normalizeSymbol(item.symbol) === normalizedStockSymbol);
        const nextStocks = modal.mode === 'add'
          ? (existingIndex >= 0
            ? group.stocks.map((item) => (normalizeSymbol(item.symbol) === normalizedStockSymbol ? stock : item))
            : [...group.stocks, stock])
          : group.stocks.map((item) => (
            normalizeSymbol(item.symbol) === normalizedOriginalSymbol ? stock : item
          ));
        return { ...group, stocks: nextStocks };
      });
      persistBasketDbChain({
        ...base,
        groups: nextGroups,
      }, selectedMacroScopeOption?.historyId ? 'replace-current' : 'new-history');
      clearStockDataCache([modal.originalSymbol, modal.symbol, stock.symbol]);
      const nextStockKey = `${modal.groupId}:${normalizeSymbol(stock.symbol)}`;
      setSelectedStockKey(nextStockKey);
      setActiveSymbol(stock.symbol);
      setStockEditModal(null);
    } catch (error) {
      setStockEditModal({
        ...modal,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const fillStockFromSearch = async () => {
    if (!stockEditModal || stockEditModal.loading) return;
    const modal = stockEditModal;
    const fallbackStock = modal.mode === 'edit' ? findEditableStock(modal.groupId, modal.originalSymbol) : null;
    setStockEditModal({ ...modal, loading: true, error: null });
    try {
      const stock = await resolveStockInput(modal.symbol, modal.name, modal.market, fallbackStock);
      setStockEditModal({
        ...modal,
        symbol: stock.symbol,
        name: stock.name,
        market: stock.market,
        loading: false,
        error: null,
      });
    } catch (error) {
      setStockEditModal({
        ...modal,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleBasketDbImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const text = await file.text();
    const cachePayload = parseMacroFlowCacheJson(text);
    if (cachePayload) {
      await importMacroFlowCache(cachePayload, file.name);
      return;
    }
    const importedChain = parseValueChainJson(text) || parseValueChainCsv(text, editableBasketChain);
    if (!importedChain) return;
    setBasketDbImportDecision({
      chain: importedChain,
      importedAt: new Date().toISOString(),
      sourceName: file.name,
    });
    setBasketEditor(null);
  };

  const importMacroFlowCache = async (payload: MacroFlowCacheExportPayload, sourceName: string) => {
    setCacheTransferStatus('キャッシュをインポート中...');
    const importedHistory = sanitizeStoredQuoteHistory(payload.quoteHistory);
    const latestQuotes = sanitizeStoredQuoteMap(payload.latestQuotes?.quotes);
    const latestDate = payload.latestQuotes?.date || payload.flowEndDate;
    if (latestDate && isDateValueText(latestDate) && Object.keys(latestQuotes).length > 0) {
      importedHistory[latestDate] = {
        ...importedHistory[latestDate],
        ...latestQuotes,
      };
    }

    const mergedHistory: Record<string, Record<string, MacroQuote | null>> = {};
    Object.entries(importedHistory).forEach(([date, quotes]) => {
      mergedHistory[date] = { ...quotes };
    });
    Object.entries(macroQuoteHistoryRef.current).forEach(([date, quotes]) => {
      mergedHistory[date] = { ...(mergedHistory[date] ?? {}), ...sanitizeStoredQuoteMap(quotes) };
    });
    const quoteHistoryDays = await writeStoredMacroQuoteHistoryIndexedDb(mergedHistory);
    setMacroQuoteHistory((current) => {
      const next = { ...current };
      Object.entries(importedHistory).forEach(([date, quotes]) => {
        next[date] = { ...quotes, ...(next[date] || {}) };
      });
      return next;
    });

    const todayQuotes = importedHistory[FLOW_END_DATE];
    if (todayQuotes && Object.keys(todayQuotes).length > 0) {
      const mergedToday = { ...todayQuotes, ...macroQuoteCacheRef.current };
      setMacroQuoteCache(mergedToday);
      await writeStoredMacroQuoteIndexedDb(mergedToday);
    }

    const klineRecords = Array.isArray(payload.klineRecords) ? payload.klineRecords : [];
    const importedKlineRecords = klineRecords
      .map(sanitizeStoredKlineRecord)
      .filter((record): record is StoredKlineCacheRecord & { key: string } => Boolean(record));
    const klineCount = await writeStoredKlineCacheRecords(importedKlineRecords);
    if (importedKlineRecords.length > 0) {
      const nextSparklineCache: Record<string, Candle[]> = {};
      importedKlineRecords.forEach((record) => {
        if (record.reqNum !== sparklineReqNum || !record.symbol) return;
        const candles = sanitizeStoredCandles(record.candles);
        if (candles) nextSparklineCache[normalizeSymbol(record.symbol)] = candles;
      });
      if (Object.keys(nextSparklineCache).length > 0) {
        setSparklineCache((current) => ({ ...current, ...nextSparklineCache }));
      }
    }

    if (payload.valueChain?.current) {
      localStorage.setItem(VALUE_CHAIN_STORAGE_KEY, JSON.stringify(normalizeStoredChain(payload.valueChain.current)));
    }
    if (Array.isArray(payload.valueChain?.history) && payload.valueChain.history.length > 0) {
      const mergedValueChainHistory = mergeValueChainHistoryEntries(payload.valueChain.history, readValueChainHistory());
      writeValueChainHistory(mergedValueChainHistory);
      if (payload.valueChain.activeHistoryId) {
        localStorage.setItem(ACTIVE_CHAIN_HISTORY_ID_STORAGE_KEY, payload.valueChain.activeHistoryId);
      }
      refreshBasketScopeOptions(payload.valueChain.activeHistoryId ? `value-chain-history-${payload.valueChain.activeHistoryId}` : macroScope);
    }

    setBasketDbImportDecision(null);
    setBasketDbExportMenuAnchor(null);
    setQuoteRefreshToken((value) => value + 1);
    setCacheTransferStatus(`${sourceName}: snapshot ${quoteHistoryDays}日分 / KLine ${klineCount}件を取り込みました`);
  };

  const applyBasketDbImportDecision = (mode: 'replace-current' | 'new-history') => {
    if (!basketDbImportDecision) return;
    persistBasketDbChain(basketDbImportDecision.chain, mode);
    setBasketDbImportDecision(null);
  };

  const exportBasketDbJson = () => {
    downloadText('mooview-value-chain-template.json', 'application/json;charset=utf-8', JSON.stringify(editableBasketChain, null, 2));
    setBasketDbExportMenuAnchor(null);
  };

  const exportBasketDbCsv = () => {
    downloadText('mooview-value-chain-template.csv', 'text/csv;charset=utf-8', createValueChainCsv(editableBasketChain));
    setBasketDbExportMenuAnchor(null);
  };

  const exportBasketDbSpec = () => {
    downloadText('mooview-value-chain-template-spec.md', 'text/markdown;charset=utf-8', createTemplateSpec(editableBasketChain));
    setBasketDbExportMenuAnchor(null);
  };

  const exportMacroFlowCacheJson = async () => {
    setCacheTransferStatus('キャッシュを書き出し中...');
    const storedHistory = await readStoredMacroQuoteHistoryIndexedDb();
    const memoryHistory = sanitizeStoredQuoteHistory(macroQuoteHistoryRef.current);
    const todayQuotes = sanitizeStoredQuoteMap(macroQuoteCacheRef.current);
    const mergedHistory = {
      ...storedHistory,
      ...memoryHistory,
    };
    if (Object.keys(todayQuotes).length > 0) {
      mergedHistory[FLOW_END_DATE] = todayQuotes;
    }
    const quoteHistory = Object.fromEntries(
      Object.entries(mergedHistory).map(([date, quotes]) => [
        date,
        {
          date,
          savedAt: Date.now(),
          quotes: sanitizeStoredQuoteMap(quotes),
        } satisfies StoredMacroQuoteCache,
      ]),
    );
    const klineRecords = await readStoredKlineCacheRecords();
    const payload: MacroFlowCacheExportPayload = {
      schema: MACRO_FLOW_CACHE_EXPORT_SCHEMA,
      schemaVersion: MACRO_FLOW_CACHE_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      flowEndDate: FLOW_END_DATE,
      latestQuotes: {
        date: FLOW_END_DATE,
        savedAt: Date.now(),
        quotes: todayQuotes,
      },
      quoteHistory,
      klineRecords,
      valueChain: {
        current: readStoredValueChain(),
        history: readValueChainHistory(),
        activeHistoryId: localStorage.getItem(ACTIVE_CHAIN_HISTORY_ID_STORAGE_KEY),
      },
    };
    downloadText(`mooview-macroflow-cache-${FLOW_END_DATE}.json`, 'application/json;charset=utf-8', JSON.stringify(payload, null, 2));
    setBasketDbExportMenuAnchor(null);
    setCacheTransferStatus(`キャッシュを書き出しました: snapshot ${Object.keys(quoteHistory).length}日分 / KLine ${klineRecords.length}件`);
  };

  const runRangeHistoryBackfill = async () => {
    const runId = historyBackfillRunIdRef.current + 1;
    historyBackfillRunIdRef.current = runId;
    const datesNewestFirst = getBusinessDateValuesInWindow(rangeStartDate, rangeEndDate).reverse();
    const targetDates = new Set(datesNewestFirst);
    const historyAtStart = macroQuoteHistoryRef.current;
    const latestQuotes = macroQuoteCacheRef.current;
    const needsHistoryBackfill = (symbol: string, date: string) => (
      shouldReplaceStoredQuoteWithKline(getStoredQuoteForDate(symbol, date, historyAtStart, latestQuotes), date)
    );
    const targetSymbols = macroQuoteSymbols.filter((symbol) => (
      datesNewestFirst.some((date) => needsHistoryBackfill(symbol, date))
    ));
    const totalMissing = targetSymbols.reduce((sum, symbol) => (
      sum + datesNewestFirst.filter((date) => needsHistoryBackfill(symbol, date)).length
    ), 0);
    const totalBatches = Math.max(1, Math.ceil(targetSymbols.length / KLINE_BATCH_SIZE));
    const backfillReqNum = getBackfillReqNumForDateCount(datesNewestFirst.length);

    setHistoryBackfillProgress({
      status: targetSymbols.length === 0 ? 'done' : 'loading',
      currentBatch: 0,
      totalBatches,
      processedSymbols: 0,
      totalSymbols: targetSymbols.length,
      filledQuotes: 0,
      totalMissing,
      currentDate: datesNewestFirst[0] || rangeEndDate,
      totalDates: datesNewestFirst.length,
      failedSymbols: [],
    });
    if (targetSymbols.length === 0) return;

    let processedSymbols = 0;
    let filledQuotes = 0;
    const failedSymbols: string[] = [];
    const applyUpdates = async (updates: Record<string, Record<string, MacroQuote | null>>) => {
      const updateEntries = datesNewestFirst
        .map((date) => [date, updates[date]] as const)
        .filter(([, quotes]) => quotes && Object.keys(quotes).length > 0);
      if (updateEntries.length === 0) return;
      const nextHistory = { ...macroQuoteHistoryRef.current };
      for (const [date, quotes] of updateEntries) {
        const mergedDateQuotes = {
          ...(nextHistory[date] || {}),
          ...quotes,
        };
        nextHistory[date] = mergedDateQuotes;
        await writeStoredMacroQuoteHistoryDateIndexedDb(date, mergedDateQuotes);
        filledQuotes += Object.keys(quotes).length;
      }
      macroQuoteHistoryRef.current = nextHistory;
      setMacroQuoteHistory(nextHistory);
    };

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
      const currentBatch = batchIndex + 1;
      if (batchIndex > 0) {
        setHistoryBackfillProgress({
          status: 'waiting',
          currentBatch,
          totalBatches,
          processedSymbols,
          totalSymbols: targetSymbols.length,
          filledQuotes,
          totalMissing,
          currentDate: datesNewestFirst[0] || rangeEndDate,
          totalDates: datesNewestFirst.length,
          failedSymbols,
        });
        await waitForKlineBatchInterval();
        if (historyBackfillRunIdRef.current !== runId) return;
      }

      setHistoryBackfillProgress({
        status: 'loading',
        currentBatch,
        totalBatches,
        processedSymbols,
        totalSymbols: targetSymbols.length,
        filledQuotes,
        totalMissing,
        currentDate: datesNewestFirst[0] || rangeEndDate,
        totalDates: datesNewestFirst.length,
        failedSymbols,
      });

      const batch = targetSymbols.slice(batchIndex * KLINE_BATCH_SIZE, (batchIndex + 1) * KLINE_BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (symbol) => {
        const normalizedSymbol = normalizeSymbol(symbol);
        const cachedCandles = await readStoredKlineCandles(normalizedSymbol, backfillReqNum);
        if (cachedCandles && hasCandlesForRequestedRange(cachedCandles, rangeStartDate, rangeEndDate)) {
          return [normalizedSymbol, cachedCandles] as const;
        }
        try {
          const response = await fetch('/api/moomoo/kline', {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: normalizedSymbol, timeframe: '1d', reqNum: backfillReqNum }),
          });
          const data = await response.json();
          const candles = Array.isArray(data.candles)
            ? (data.candles as Candle[]).filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
            : [];
          if (!response.ok || !data.success || candles.length === 0) return null;
          await writeStoredKlineCandles(normalizedSymbol, backfillReqNum, candles);
          return [normalizedSymbol, candles] as const;
        } catch {
          return null;
        }
      }));
      if (historyBackfillRunIdRef.current !== runId) return;

      const updates: Record<string, Record<string, MacroQuote | null>> = {};
      const nextSparklineCache: Record<string, Candle[]> = {};
      batchResults.forEach((result, index) => {
        processedSymbols += 1;
        if (!result) {
          failedSymbols.push(batch[index]);
          return;
        }
        const [symbol, candles] = result;
        nextSparklineCache[symbol] = candles;
        const symbolUpdates = createQuoteHistoryUpdatesFromCandles(symbol, candles, targetDates, macroQuoteHistoryRef.current, macroQuoteCacheRef.current);
        Object.entries(symbolUpdates).forEach(([date, quotes]) => {
          updates[date] = {
            ...(updates[date] || {}),
            ...quotes,
          };
        });
      });
      if (Object.keys(nextSparklineCache).length > 0) {
        setSparklineCache((current) => ({ ...current, ...nextSparklineCache }));
      }
      await applyUpdates(updates);

      setHistoryBackfillProgress({
        status: batchIndex === totalBatches - 1
          ? failedSymbols.length > 0 || filledQuotes < totalMissing ? 'partial' : 'done'
          : 'waiting',
        currentBatch,
        totalBatches,
        processedSymbols,
        totalSymbols: targetSymbols.length,
        filledQuotes,
        totalMissing,
        currentDate: datesNewestFirst[0] || rangeEndDate,
        totalDates: datesNewestFirst.length,
        failedSymbols,
      });
    }
  };

  const openPanel = (mode: SidePanelMode) => {
    if (sidePanelOpen && sidePanelMode === mode && mode === 'chart') {
      setSidePanelOpen(false);
      return;
    }
    setSidePanelOpen(true);
    setSidePanelMode(mode);
  };

  const openChartForStock = (stock: StockMetric) => {
    setActiveSymbol(stock.symbol);
    setSelectedStockKey(`${stock.basketId}:${normalizeSymbol(stock.symbol)}`);
    setSelectedSectorId(stock.sector);
    setSelectedBasketId(stock.basketId);
    setSidePanelOpen(true);
    setSidePanelMode('chart');
  };

  const addChartComparisonSymbols = (symbols: string[]) => {
    const activeNormalized = normalizeSymbol(activeSymbol);
    setChartComparisonSymbols((current) => {
      const next = [...current];
      const seen = new Set(next.map(normalizeSymbol));
      symbols.map(normalizeSymbol).filter(Boolean).forEach((symbol) => {
        if (symbol === activeNormalized || seen.has(symbol)) return;
        next.push(symbol);
        seen.add(symbol);
      });
      return next;
    });
  };

  const getDroppedStockSymbols = (event: React.DragEvent<HTMLElement>): string[] => {
    const customPayload = event.dataTransfer.getData('application/x-mooview-symbols');
    if (customPayload) {
      try {
        const parsed = JSON.parse(customPayload) as unknown;
        if (Array.isArray(parsed)) return parsed.map(String).map(normalizeSymbol).filter(Boolean);
      } catch {
        // テキスト転送にフォールバックする。
      }
    }
    const plain = event.dataTransfer.getData('text/plain');
    return plain.split(/[\s,]+/).map(normalizeSymbol).filter(Boolean);
  };

  const beginStockDrag = (event: React.DragEvent<HTMLElement>, symbol: string) => {
    const normalizedSymbol = normalizeSymbol(symbol);
    setDraggingStockSymbol(normalizedSymbol);
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', normalizedSymbol);
    event.dataTransfer.setData('application/x-mooview-symbols', JSON.stringify([normalizedSymbol]));
  };

  const dropStockOnChart = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const symbols = getDroppedStockSymbols(event);
    addChartComparisonSymbols(symbols);
    setDraggingStockSymbol(null);
    setSidePanelOpen(true);
    setSidePanelMode('chart');
  };

  const selectSector = (sectorId: string) => {
    setSelectedStockKey(null);
    setSelectedSectorId((current) => {
      const next = current === sectorId ? null : sectorId;
      if (next === null) setSelectedBasketId(null);
      return next;
    });
    setSelectedBasketId(null);
  };

  const selectBasket = (basket: BasketMetric) => {
    setSelectedStockKey(null);
    setSelectedBasketId((current) => current === basket.id ? null : basket.id);
    setSelectedSectorId(getBasketParentSectorId(basket));
  };

  const openColorSettings = (target: ColorTarget) => {
    setColorTarget(target);
    setSidePanelOpen(true);
    setSidePanelMode('settings');
  };

  const updateRangeDate = (handle: RangeHandle, nextDate: string) => {
    const safeDate = clampBusinessDateValue(nextDate);
    if (handle === 'start') {
      const safeEndDate = clampBusinessDateValue(rangeEndDate);
      setRangeStartDate(safeDate <= safeEndDate ? safeDate : safeEndDate);
      return;
    }
    const safeStartDate = clampBusinessDateValue(rangeStartDate);
    setRangeEndDate(safeDate >= safeStartDate ? safeDate : safeStartDate);
  };

  const updateRangeFromClientX = (clientX: number, handle: RangeHandle) => {
    const track = rangeTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    updateRangeDate(handle, businessDateFromOffset(Math.round(ratio * sliderTotalDays), sliderStartDate, FLOW_END_DATE));
  };

  const moveDate = (direction: -1 | 1) => {
    const nextStartDate = clampBusinessDateValue(addBusinessDays(rangeStartDate, direction));
    const nextEndDate = clampBusinessDateValue(addBusinessDays(rangeEndDate, direction));
    if (nextStartDate <= nextEndDate) {
      setRangeStartDate(nextStartDate);
      setRangeEndDate(nextEndDate);
    }
  };

  const handleCalendarSelect = (date: string) => {
    updateRangeDate(calendarTarget, date);
    setCalendarOpen(false);
  };

  const resetFlowView = () => {
    setRangeStartDate(FLOW_END_DATE);
    setRangeEndDate(FLOW_END_DATE);
    setSearchQuery('');
    setMacroScope(MACRO_ALL_SCOPE_ID);
    setMarketFilter('all');
    setSortState({ sectors: null, baskets: null, stocks: null });
    setSelectedSectorId(null);
    setSelectedBasketId(null);
    setSelectedStockKey(null);
    setChartComparisonSymbols([]);
    setDraggingStockSymbol(null);
  };

  const klineProgressText = (() => {
    if (!klineFetchProgress) return null;
    if (klineFetchProgress.totalBatches === 0) {
      return `KLine復元済 ${klineFetchProgress.cachedSymbols}`;
    }
    const remainingBatches = Math.max(0, klineFetchProgress.totalBatches - klineFetchProgress.currentBatch);
    const label = klineFetchProgress.status === 'done'
      ? 'KLine完了'
      : klineFetchProgress.status === 'waiting'
        ? 'KLine待機'
        : 'KLine取得中';
    return `${label} ${klineFetchProgress.currentBatch}/${klineFetchProgress.totalBatches} 残${remainingBatches}`;
  })();
  const klineProgressTitle = klineFetchProgress
    ? `KLine ${klineFetchProgress.fetchedSymbols}/${klineFetchProgress.totalSymbols}銘柄取得、cache ${klineFetchProgress.cachedSymbols}銘柄`
    : undefined;
  const historyBackfillProgressText = (() => {
    if (!historyBackfillProgress) return null;
    const label = historyBackfillProgress.status === 'done'
      ? '履歴取得完了'
      : historyBackfillProgress.status === 'partial'
        ? '履歴一部取得'
        : historyBackfillProgress.status === 'waiting'
          ? '履歴待機'
          : '履歴取得中';
    return `${label} ${historyBackfillProgress.processedSymbols}/${historyBackfillProgress.totalSymbols} 残${Math.max(0, historyBackfillProgress.totalMissing - historyBackfillProgress.filledQuotes)}`;
  })();
  const historyBackfillProgressTitle = historyBackfillProgress
    ? `表示期間 ${rangeStartDate} - ${rangeEndDate} / ${historyBackfillProgress.totalDates}営業日 / 追加保存 ${historyBackfillProgress.filledQuotes}/${historyBackfillProgress.totalMissing}件 / batch ${historyBackfillProgress.currentBatch}/${historyBackfillProgress.totalBatches}${historyBackfillProgress.failedSymbols.length > 0 ? ` / 失敗: ${historyBackfillProgress.failedSymbols.slice(0, 20).join(', ')}` : ''}`
    : undefined;
  const quoteProgressText = (() => {
    if (!quoteFetchProgress) return null;
    const label = quoteFetchProgress.status === 'done'
      ? '1D完了'
      : quoteFetchProgress.status === 'partial'
        ? '1D一部取得'
        : '1D取得中';
    const remainingSymbols = Math.max(0, quoteFetchProgress.totalSymbols - quoteFetchProgress.fetchedSymbols);
    return `${label} ${quoteFetchProgress.fetchedSymbols}/${quoteFetchProgress.totalSymbols} 残${remainingSymbols}`;
  })();
  const quoteProgressTitle = quoteFetchProgress
    ? `1D snapshot 取得済 ${quoteFetchProgress.fetchedSymbols}/${quoteFetchProgress.totalSymbols}銘柄 / 今回対象 ${quoteFetchProgress.targetSymbols}銘柄 / 復元cache ${quoteFetchProgress.cachedSymbols}銘柄 / batch ${quoteFetchProgress.currentBatch}/${quoteFetchProgress.totalBatches}${quoteFetchProgress.failedSymbols.length > 0 ? ` / 未取得: ${quoteFetchProgress.failedSymbols.slice(0, 20).join(', ')}` : ''}`
    : undefined;
  const rangeProgressText = historyBackfillProgressText || klineProgressText || quoteProgressText;
  const rangeProgressTitle = historyBackfillProgressText ? historyBackfillProgressTitle : klineProgressText ? klineProgressTitle : quoteProgressTitle;
  const rangeProgressStatus = historyBackfillProgressText
    ? historyBackfillProgress?.status
    : klineProgressText
    ? klineFetchProgress?.status
    : quoteFetchProgress?.status;
  const historyBackfillRunning = historyBackfillProgress?.status === 'loading' || historyBackfillProgress?.status === 'waiting';

  useEffect(() => {
    if (!dragRangeHandle) return undefined;
    const handlePointerMove = (event: PointerEvent) => {
      updateRangeFromClientX(event.clientX, dragRangeHandle);
    };
    const handlePointerUp = () => setDragRangeHandle(null);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragRangeHandle, rangeEndDate, rangeStartDate, sliderStartDate, sliderTotalDays]);

  useEffect(() => {
    if (!columnResize) return undefined;
    const handlePointerMove = (event: PointerEvent) => {
      const delta = event.clientX - columnResize.startX;
      const targetColumn: FlowColumnKey =
        columnResize.boundary === 'regional-sector' ? 'regional'
          : columnResize.boundary === 'sector-basket' ? 'sectors'
            : columnResize.boundary === 'basket-stock' ? 'baskets'
              : 'stocks';
      setColumnWidths({
        ...columnResize.widths,
        [targetColumn]: clamp(columnResize.widths[targetColumn] + delta, FLOW_COLUMN_MIN_WIDTH, FLOW_COLUMN_MAX_WIDTH),
      });
    };
    const handlePointerUp = () => setColumnResize(null);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [columnResize]);

  useEffect(() => {
    if (!sidePanelResizing) return undefined;
    const handlePointerMove = (event: PointerEvent) => {
      setSidePanelWidth(clamp(sidePanelResizing.startWidth + sidePanelResizing.startX - event.clientX, SIDE_PANEL_MIN_WIDTH, SIDE_PANEL_MAX_WIDTH));
    };
    const handlePointerUp = () => setSidePanelResizing(null);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [sidePanelResizing]);

  useEffect(() => {
    if (!sidePanelOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidePanelOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidePanelOpen]);

  useEffect(() => {
    if (!sidePanelOpen) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-macro-chart-panel="true"]') || target.closest('[data-macro-side-nav="true"]')) return;
      if (target.closest('[data-macro-stock-card="true"]')) return;
      setSidePanelOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [sidePanelOpen]);

  const renderPanelTitle = () => {
    if (sidePanelMode === 'chart') return 'チャート表示';
    if (sidePanelMode === 'settings') return 'フロー設定';
    if (sidePanelMode === 'summary') return 'TOP Flow Summary';
    if (sidePanelMode === 'annotation') return 'Event Annotation';
    if (sidePanelMode === 'sources') return 'Data Sources';
    return 'Basket Database';
  };

  return (
    <main
      className="flex-1 min-h-0 bg-[#050505] text-[#d1d4dc] flex flex-col overflow-hidden"
      style={{ fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif' }}
    >
      <div className="h-16 border-b border-[#202020] bg-[#080808] pl-3 pr-[56px] shrink-0 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-8 bg-sky-400" />
            <select hidden
              value={macroScope}
              onChange={(event) => setMacroScope(event.target.value)}
              className="h-8 w-64 bg-[#050505] border border-[#242424] px-2 text-[11px] font-bold text-gray-100 outline-none focus:border-sky-500/70"
              aria-label="マクロ資金フローの表示範囲"
              title={macroScopeOptions.find((option) => option.id === macroScope)?.detail}
            >
              {macroScopeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="relative w-64">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setMacroScopeMenuOpen((open) => !open);
                }}
                className="h-11 w-full bg-[#050505] border border-[#242424] px-2 py-1 text-left outline-none transition hover:border-sky-500/70 focus:border-sky-500/70 flex items-center justify-between gap-2"
                aria-haspopup="listbox"
                aria-expanded={macroScopeMenuOpen}
                aria-label="マクロ資金フローの表示範囲"
                title={`${selectedMacroScopeOption?.label || 'マクロ全体'}\n${selectedMacroScopeOption?.detail || 'バリューチェーン情報なし'}`}
              >
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[11px] font-bold text-gray-100">{selectedMacroScopeOption?.label || 'マクロ全体'}</span>
                  <span className="mt-0.5 block truncate text-[9px] font-normal text-gray-500">{selectedMacroScopeOption?.detail || 'バリューチェーン情報なし'}</span>
                </span>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${macroScopeMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {macroScopeMenuOpen && (
                <div
                  className="absolute left-0 top-full z-[95] mt-1 max-h-80 w-80 overflow-y-auto border border-[#252525] bg-[#050505] py-1 shadow-2xl"
                  role="listbox"
                  onClick={(event) => event.stopPropagation()}
                >
                  {macroScopeOptions.map((option) => (
                    <div
                      key={option.id}
                      className={`group flex items-center gap-1 px-1.5 py-1 hover:bg-[#151515] ${option.id === macroScope ? 'bg-[#10251f]' : ''}`}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={option.id === macroScope}
                        onClick={() => {
                          setMacroScope(option.id);
                          setMacroScopeMenuOpen(false);
                        }}
                        className="min-w-0 flex-1 px-1.5 py-1 text-left"
                        title={option.detail}
                      >
                        <span className="block truncate text-[11px] font-bold text-gray-100">{option.label}</span>
                        <span className="block truncate text-[9px] text-gray-500">{option.detail}</span>
                      </button>
                      {option.historyId && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeMacroScopeOption(option);
                          }}
                          className="h-7 w-7 shrink-0 flex items-center justify-center text-gray-500 hover:bg-red-950/30 hover:text-red-300"
                          title={`${option.label} を削除`}
                          aria-label={`${option.label} を削除`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="h-7 w-px bg-[#2a2a2a]" />
          <div className="relative h-12 w-[364px] bg-[#050505] px-1.5 py-1.5">
            <div className="flex items-center justify-between font-mono text-[10px]">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setCalendarTarget('start');
                  setCalendarMonth(rangeStartDate.slice(0, 7));
                  setCalendarOpen((open) => !open || calendarTarget !== 'start');
                }}
                className={`h-5 border px-2 transition ${calendarTarget === 'start' && calendarOpen ? 'border-emerald-600 bg-emerald-950/40 text-emerald-200' : 'border-[#242424] bg-[#050505] text-gray-400 hover:text-white'}`}
                title="開始日を選択"
                aria-label="開始日を選択"
              >
                {rangeStartDate}
              </button>
              <div
                className="flex min-w-[116px] flex-col items-center leading-none"
                title={rangeProgressTitle}
                aria-label={rangeProgressTitle}
              >
                <span className="text-emerald-300">{activeWindowDays}D</span>
                {rangeProgressText && (
                  <span
                    className={`mt-0.5 max-w-[116px] truncate text-[8px] ${rangeProgressStatus === 'done' ? 'text-emerald-400' : rangeProgressStatus === 'waiting' || rangeProgressStatus === 'partial' ? 'text-amber-300' : 'text-cyan-300'}`}
                    title={rangeProgressTitle}
                  >
                    {rangeProgressText}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setCalendarTarget('end');
                  setCalendarMonth(rangeEndDate.slice(0, 7));
                  setCalendarOpen((open) => !open || calendarTarget !== 'end');
                }}
                className={`h-5 border px-2 transition ${calendarTarget === 'end' && calendarOpen ? 'border-emerald-600 bg-emerald-950/40 text-emerald-200' : 'border-[#242424] bg-[#050505] text-gray-400 hover:text-white'}`}
                title="終了日を選択"
                aria-label="終了日を選択"
              >
                {rangeEndDate}
              </button>
            </div>
            <div
              ref={rangeTrackRef}
              className="relative mt-1 h-5 cursor-pointer select-none"
              onPointerDown={(event) => {
                const track = rangeTrackRef.current;
                if (!track) return;
                const rect = track.getBoundingClientRect();
                const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
                const offset = Math.round(ratio * sliderTotalDays);
                const handle: RangeHandle = Math.abs(offset - timelineStartIndex) <= Math.abs(offset - timelineEndIndex) ? 'start' : 'end';
                setDragRangeHandle(handle);
                updateRangeFromClientX(event.clientX, handle);
              }}
            >
              <div className="absolute left-0 right-0 top-1.5 h-px bg-[#333333]" />
              <div
                className="absolute top-1.5 h-px bg-emerald-500/70"
                style={{ left: `${rangeStartPct}%`, width: `${Math.max(0, rangeEndPct - rangeStartPct)}%` }}
              />
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setDragRangeHandle('start');
                  updateRangeFromClientX(event.clientX, 'start');
                }}
                className="absolute top-[-2px] h-4 w-4 -translate-x-1/2 rounded-full border border-emerald-300 bg-[#050505] shadow-[0_0_0_2px_rgba(5,5,5,0.9)]"
                style={{ left: `${rangeStartPct}%` }}
                title={`開始日 ${rangeStartDate}`}
                aria-label="開始日ハンドル"
              />
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setDragRangeHandle('end');
                  updateRangeFromClientX(event.clientX, 'end');
                }}
                className="absolute top-[-2px] h-4 w-4 -translate-x-1/2 rounded-full border border-emerald-300 bg-[#050505] shadow-[0_0_0_2px_rgba(5,5,5,0.9)]"
                style={{ left: `${rangeEndPct}%` }}
                title={`終了日 ${rangeEndDate}`}
                aria-label="終了日ハンドル"
              />
            </div>
            {calendarOpen && (
              <div
                className={`absolute top-14 z-[90] w-56 bg-[#050505] border border-[#262626] p-2 shadow-2xl ${calendarTarget === 'start' ? 'left-0' : 'right-0'}`}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between text-[10px] text-gray-100">
                  <button type="button" onClick={() => setCalendarMonth((month) => shiftCalendarMonth(month, -1))} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#111111]" aria-label="前の月">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-bold">{formatCalendarMonthLabel(calendarMonth)}</span>
                  <button type="button" onClick={() => setCalendarMonth((month) => shiftCalendarMonth(month, 1))} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#111111]" aria-label="次の月">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="mt-1 grid grid-cols-7 gap-0.5 text-center text-[9px] text-gray-500">
                  {CALENDAR_WEEK_LABELS.map((label, index) => (
                    <div key={`${label}-${index}`} className="py-1">{label}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5 text-[10px]">
                  {calendarDays.map((day) => {
                    const selectedStart = day.date === rangeStartDate;
                    const selectedEnd = day.date === rangeEndDate;
                    const disabledDay = day.date < FLOW_MIN_DATE || day.date > FLOW_END_DATE || !isBusinessDateValue(day.date);
                    return (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => handleCalendarSelect(day.date)}
                        disabled={disabledDay}
                        className={`h-7 transition ${
                          selectedStart || selectedEnd
                            ? 'bg-emerald-500 text-black font-bold'
                            : day.inMonth
                              ? 'text-gray-100 hover:bg-[#111111]'
                              : 'text-gray-600 hover:text-gray-300 hover:bg-[#111111]'
                        } ${disabledDay ? 'opacity-25 cursor-not-allowed hover:bg-transparent hover:text-gray-600' : ''}`}
                      >
                        {Number(day.date.slice(8, 10))}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="flex h-8 shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={runRangeHistoryBackfill}
              disabled={historyBackfillRunning}
              className={`h-8 w-8 inline-flex items-center justify-center border transition ${
                historyBackfillRunning
                  ? 'cursor-wait border-cyan-700/70 bg-cyan-950/30 text-cyan-300'
                  : 'border-[#242424] bg-[#050505] text-gray-400 hover:border-cyan-500/70 hover:text-cyan-200'
              }`}
              title={`表示期間の日次履歴をIndexedDBへ取得: ${rangeStartDate} - ${rangeEndDate}`}
              aria-label="表示期間の日次履歴を取得"
            >
              <CalendarDays className="h-3.5 w-3.5" />
            </button>
            <div className="flex h-8 shrink-0 items-center border border-[#242424] bg-[#050505] p-0.5">
            {(['jp', 'us', 'all'] as MarketFilter[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMarketFilter(option)}
                className={`h-6 min-w-9 px-2 text-[10px] font-bold uppercase transition ${
                  marketFilter === option
                    ? 'bg-emerald-500 text-black'
                    : 'text-gray-400 hover:bg-[#111111] hover:text-white'
                }`}
                aria-pressed={marketFilter === option}
                title={option === 'jp' ? '日本株のみ' : option === 'us' ? '海外株のみ' : '日本株と海外株'}
              >
                {option.toUpperCase()}
              </button>
            ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <form
            className="relative h-7 w-56 border border-[#242424] bg-[#080808] flex items-center gap-1 px-2 focus-within:border-sky-500/70"
            onSubmit={(event) => event.preventDefault()}
          >
            <Search className="w-3.5 h-3.5 shrink-0 text-gray-500" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[10px] text-gray-100 placeholder:text-gray-600 outline-none"
              placeholder="Sector / Basket / Symbol"
              aria-label="セクター、バスケット、銘柄を検索"
            />
          </form>
          <button type="button" onClick={() => moveDate(-1)} className="w-6 h-7 flex items-center justify-center text-gray-400 hover:text-white" title="前へ" aria-label="前へ">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => moveDate(1)} className="w-6 h-7 flex items-center justify-center text-gray-400 hover:text-white" title="次へ" aria-label="次へ">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button type="button" onClick={resetFlowView} className="h-7 w-7 text-gray-300 hover:text-white hover:bg-[#111111] inline-flex items-center justify-center" aria-label="表示をリセット" title="表示をリセット">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-[56px]">
        <div className="p-3 flex flex-col gap-3" style={{ minWidth: Math.max(1220, flowLayout.width) }}>
          <section className="order-4 grid grid-cols-[minmax(190px,0.85fr)_minmax(300px,1.25fr)_minmax(250px,1fr)] gap-2">
            <div className="border border-[#202020] bg-[#080808] min-h-[420px]">
              <button
                type="button"
                onDoubleClick={() => cycleSort('sectors')}
                className="w-full h-9 border-b border-[#202020] px-3 flex items-center justify-between text-left hover:bg-[#101010]"
                title="ダブルクリックで昇順、降順、元に戻す"
              >
                <span className="text-[11px] font-bold text-white">Sectors</span>
                <span className="text-[9px] text-sky-300">{formatSortIndicator(sortState.sectors)}</span>
              </button>
              <div className="divide-y divide-[#1b1b1b]">
                {orderedSectors.map((sector, index) => (
                  <button
                    key={sector.id}
                    type="button"
                    onClick={() => selectSector(sector.id)}
                    onDoubleClick={() => openColorSettings({ id: sector.id, label: sector.name, kind: 'sector' })}
                    className={`w-full px-3 py-2.5 text-left transition ${
                      selectedSectorId === sector.id
                        ? 'bg-[#101820] ring-1 ring-inset ring-sky-700/70'
                        : selectedSectorId && selectedSectorId !== sector.id
                          ? 'opacity-45 hover:bg-[#101010]'
                          : 'hover:bg-[#101010]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`min-w-0 truncate text-[11px] font-bold ${selectedSectorId === sector.id ? 'text-white' : 'text-gray-100'}`}>{index + 1}. {sector.name}</span>
                      <span className={`font-mono text-[10px] ${selectedSectorId === sector.id ? 'text-white' : sector.dataCoverage <= 0 ? 'text-gray-500' : sector.changePct >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{formatPctMaybe(sector.changePct, sector.dataCoverage > 0)}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1 flex-1 bg-[#1a1a1a]">
                        <div className="h-full" style={{ width: `${clamp(sector.score / Math.max(1, topSector?.score ?? sector.score) * 100, 4, 100)}%`, backgroundColor: getHeatTone(sector.changePct).stroke }} />
                      </div>
                      <span className={`w-12 text-right text-[9px] font-mono ${selectedSectorId === sector.id ? 'text-white' : 'text-gray-500'}`}>{formatFlow(sector.nodeVolume)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-[#202020] bg-[#080808] min-h-[420px]">
              <button
                type="button"
                onDoubleClick={() => cycleSort('baskets')}
                className="w-full h-9 border-b border-[#202020] px-3 flex items-center justify-between text-left hover:bg-[#101010]"
                title="ダブルクリックで昇順、降順、元に戻す"
              >
                <span className="text-[11px] font-bold text-white">Themes / Baskets</span>
                <span className="text-[9px] text-sky-300">{formatSortIndicator(sortState.baskets)}</span>
              </button>
              <div className="divide-y divide-[#1b1b1b]">
                {orderedBaskets.map((basket, index) => (
                  <button
                    key={basket.id}
                    type="button"
                    onClick={() => selectBasket(basket)}
                    onDoubleClick={() => openColorSettings({ id: basket.id, label: basket.name, kind: 'basket' })}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setSelectedBasketId(basket.id);
                      setSelectedSectorId(getBasketParentSectorId(basket));
                      setSelectedStockKey(null);
                      setBasketContextMenu({
                        x: event.clientX,
                        y: event.clientY,
                        groupId: basket.id,
                        label: basket.name,
                      });
                      setStockContextMenu(null);
                    }}
                    className={`w-full px-3 py-2.5 text-left transition ${
                      selectedBasketId === basket.id
                        ? 'bg-[#101820] ring-1 ring-inset ring-sky-700/70'
                        : (selectedSectorId && getBasketParentSectorId(basket) !== selectedSectorId) || (selectedBasketId && selectedBasketId !== basket.id)
                          ? 'opacity-45 hover:bg-[#101010]'
                          : 'hover:bg-[#101010]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`min-w-0 truncate text-[11px] font-bold ${selectedBasketId === basket.id ? 'text-white' : 'text-gray-100'}`}>{index + 1}. {basket.name}</span>
                      <span className={`font-mono text-[10px] ${selectedBasketId === basket.id ? 'text-white' : basket.dataCoverage <= 0 ? 'text-gray-500' : basket.changePct >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{formatPctMaybe(basket.changePct, basket.dataCoverage > 0)}</span>
                    </div>
                    <div className={`mt-1 flex items-center justify-between gap-3 text-[9px] ${selectedBasketId === basket.id ? 'text-white' : 'text-gray-500'}`}>
                      <span className="truncate">{basket.sector}</span>
                      <span className="font-mono">{basket.stockMetrics.length} stocks</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 bg-[#1a1a1a]">
                        <div className="h-full" style={{ width: `${clamp(basket.score / Math.max(1, topBasket?.score ?? basket.score) * 100, 4, 100)}%`, backgroundColor: getHeatTone(basket.changePct).stroke }} />
                      </div>
                      <span className={`w-12 text-right text-[9px] font-mono ${selectedBasketId === basket.id ? 'text-white' : 'text-gray-500'}`}>{formatFlow(basket.nodeVolume)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-[#202020] bg-[#080808] min-h-[420px]">
              <button
                type="button"
                onDoubleClick={() => cycleSort('stocks')}
                className="w-full h-9 border-b border-[#202020] px-3 flex items-center justify-between text-left hover:bg-[#101010]"
                title="ダブルクリックで昇順、降順、元に戻す"
              >
                <span className="text-[11px] font-bold text-white">Stocks</span>
                <span className="text-[9px] text-sky-300">{formatSortIndicator(sortState.stocks)}</span>
              </button>
              <div className="divide-y divide-[#1b1b1b]">
                {visibleStocks.slice(0, 22).map((stock, index) => {
                  const stockKey = `${stock.basketId}:${normalizeSymbol(stock.symbol)}`;
                  const selected = selectedStockKey === stockKey;
                  const japanese = isJapanStock(stock.symbol);
                  const primary = japanese ? stock.name : formatStockCode(stock.symbol);
                  const secondary = japanese
                    ? `${formatStockCode(stock.symbol)}  ${formatStockMarketCap(stock.marketCap)}`
                    : `${stock.name}  ${formatStockMarketCap(stock.marketCap)}`;
                  return (
                    <button
                      key={`${stock.basketId}-${stock.symbol}`}
                      type="button"
                      onClick={() => {
                        setActiveSymbol(stock.symbol);
                        setSelectedStockKey(stockKey);
                        setSelectedSectorId(stock.sector);
                        setSelectedBasketId(stock.basketId);
                      }}
                      onDoubleClick={() => openChartForStock(stock)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setStockContextMenu({
                          x: event.clientX,
                          y: event.clientY,
                          groupId: stock.basketId,
                          symbol: stock.symbol,
                          label: stock.name,
                        });
                        setBasketContextMenu(null);
                      }}
                      className={`w-full px-3 py-2 text-left transition ${selected ? 'bg-sky-950/20 ring-1 ring-inset ring-sky-700/60' : 'hover:bg-[#101010]'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={`min-w-0 truncate text-[11px] font-bold ${japanese ? '' : 'font-mono'} ${selected ? 'text-white' : 'text-gray-100'}`}>{index + 1}. {primary}</span>
                        <span className={`font-mono text-[10px] ${selected ? 'text-white' : !stock.hasLiveQuote ? 'text-gray-500' : stock.changePct >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{formatStockPctMaybe(stock.changePct, stock.hasLiveQuote)}</span>
                      </div>
                      <div className={`mt-1 text-[9px] ${selected ? 'text-white' : 'text-gray-500'}`}>
                        <span className="block truncate">{secondary}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="order-2 border border-[#202020] bg-[#080808]">
            <div className="overflow-x-auto">
              <div
                className="relative"
                style={{ width: flowLayout.width, height: flowSvgHeight }}
              >
                <div className="absolute left-0 right-0 top-0 z-20 h-8 border-b border-[#161616] bg-[#060606]/80 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  <div className="absolute top-0 flex h-8 items-center px-2" style={{ left: flowLayout.left.regional, width: columnWidths.regional }}>Macro</div>
                  <button type="button" onDoubleClick={() => cycleSort('sectors')} className="absolute top-0 flex h-8 items-center justify-center px-2 uppercase hover:text-white" style={{ left: flowLayout.left.sectors, width: columnWidths.sectors }}>Sectors {formatSortIndicator(sortState.sectors)}</button>
                  <button type="button" onDoubleClick={() => cycleSort('baskets')} className="absolute top-0 flex h-8 items-center justify-center px-2 uppercase hover:text-white" style={{ left: flowLayout.left.baskets, width: columnWidths.baskets }}>Themes / Baskets {formatSortIndicator(sortState.baskets)}</button>
                  <button type="button" onDoubleClick={() => cycleSort('stocks')} className="absolute top-0 flex h-8 items-center justify-end px-2 uppercase hover:text-white" style={{ left: flowLayout.left.stocks, width: columnWidths.stocks }}>Stocks {formatSortIndicator(sortState.stocks)}</button>
                </div>
                {flowColumnBoundaries.map((boundary) => (
                  <React.Fragment key={boundary.boundary}>
                    <div
                      className="absolute top-0 z-20 h-full w-px bg-[#3a3a3a]/90"
                      style={{ left: boundary.left }}
                    />
                    <button
                      type="button"
                      className="absolute top-0 z-30 h-full w-3 -translate-x-1/2 cursor-col-resize bg-transparent hover:bg-emerald-500/15"
                      style={{ left: boundary.left }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        setColumnResize({ boundary: boundary.boundary, startX: event.clientX, widths: columnWidths });
                      }}
                      aria-label={`${boundary.label}をリサイズ`}
                      title="列幅を調整"
                    />
                  </React.Fragment>
                ))}
                <svg
                  className="absolute inset-0 z-0"
                  width={flowLayout.width}
                  height={flowSvgHeight}
                  viewBox={`0 0 ${flowLayout.width} ${flowSvgHeight}`}
                  aria-hidden="true"
                >
                  {flowLinks.map((link) => {
                    const sourceNode = flowNodeMap.get(link.sourceId);
                    const targetNode = flowNodeMap.get(link.targetId);
                    if (!sourceNode || !targetNode) return null;
                    const selectedStockTargetId = selectedStockKey ? `stock:${selectedStockKey}` : null;
                    const selectedBasketNodeId = selectedBasketId ? `basket:${selectedBasketId}` : null;
                    const selectedSectorNodeId = selectedSectorId ? `sector:${selectedSectorId}` : null;
                    const hasSelection = Boolean(selectedSectorId || selectedBasketId || selectedStockKey);
                    const active = selectedStockTargetId
                      ? link.targetId === selectedStockTargetId || link.targetId === selectedBasketNodeId
                      : (selectedBasketNodeId
                        ? link.sourceId === selectedBasketNodeId || link.targetId === selectedBasketNodeId
                        : Boolean(selectedSectorNodeId && link.sourceId === selectedSectorNodeId));
                    const muted = hasSelection && !active;
                    const flowRatio = link.flowValue / maxLinkFlow;
                    const sourceX = flowLayout.left[link.sourceColumn] + columnWidths[link.sourceColumn];
                    const targetX = flowLayout.left[link.targetColumn];
                    const sourceY = getFlowNodeY(sourceNode);
                    const targetY = getFlowNodeY(targetNode);
                    return (
                      <path
                        key={link.id}
                        d={createFlowPath(sourceX, sourceY, targetX, targetY)}
                        fill="none"
                        stroke={getFlowStrokeColor(link.changePct, flowRatio, Boolean(active), hasSelection)}
                        strokeWidth={active ? clamp(flowRatio * 34, 3, 34) : clamp(flowRatio * 12, 1, 12)}
                        strokeLinecap="round"
                        opacity={getFlowStrokeOpacity(flowRatio, Boolean(active), Boolean(muted))}
                      >
                        <title>{link.label}</title>
                      </path>
                    );
                  })}
                </svg>

                <div className="absolute inset-0 z-10">
                  {flowSectionHeaders.map((header) => (
                    <div
                      key={`flow-section-${header.label}`}
                      className="absolute flex h-[17px] items-center px-1 text-[9px] font-bold uppercase tracking-wider text-gray-500"
                      style={{ left: flowLayout.left.regional, top: header.top, width: columnWidths.regional }}
                    >
                      {header.label}
                    </div>
                  ))}

                  {sectorEtfRows.map((item) => {
                    const node = flowNodeMap.get(`sector-etf:${item.id}`);
                    if (!node) return null;
                    const selected = normalizeSymbol(activeSymbol) === normalizeSymbol(item.symbol);
                    const tone = getHeatTone(item.changePct, selected && item.hasLiveQuote);
                    return (
                      <button
                        key={`flow-sector-etf-${item.id}`}
                        type="button"
                        draggable
                        onClick={() => {
                          setActiveSymbol(item.symbol);
                          setSelectedSectorId(null);
                          setSelectedBasketId(null);
                          setSelectedStockKey(null);
                        }}
                        onDoubleClick={() => {
                          setActiveSymbol(item.symbol);
                          setSelectedSectorId(null);
                          setSelectedBasketId(null);
                          setSelectedStockKey(null);
                          setSidePanelOpen(true);
                          setSidePanelMode('chart');
                        }}
                        onDragStart={(event) => {
                          setDraggingSectorEtfId(item.id);
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', item.id);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          const movingId = draggingSectorEtfId || event.dataTransfer.getData('text/plain');
                          if (!movingId || movingId === item.id) return;
                          setSectorEtfOrder((current) => moveIdBefore(current, movingId, item.id));
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          setDraggingSectorEtfId(null);
                        }}
                        onDragEnd={() => setDraggingSectorEtfId(null)}
                        title={`${item.label} / ${item.displaySymbol}\nPrice ${formatNodePrice(item.symbol, item.price)}\nChange ${formatPctMaybe(item.changePct, item.hasLiveQuote)}\nVolume ${formatFlow(item.nodeVolume)}`}
                        className={`absolute overflow-hidden border px-1 py-0.5 text-left transition ${
                          selected
                            ? 'text-white shadow-[0_0_14px_rgba(22,163,74,0.16)]'
                            : draggingSectorEtfId === item.id
                              ? 'text-gray-300 opacity-70'
                            : 'text-gray-200 hover:border-[#505050]'
                        }`}
                        style={{
                          left: flowLayout.left.regional,
                          top: node.top,
                          width: columnWidths.regional,
                          height: node.height,
                          backgroundColor: selected ? (item.hasLiveQuote ? tone.fill : '#151515') : '#0b0b0b',
                          borderColor: selected ? tone.border : '#303030',
                          borderLeftColor: selected ? tone.border : '#555555',
                        }}
                      >
                        <FlowCardBody
                          title={item.label}
                          subtitle={`${item.displaySymbol} ${formatNodePrice(item.symbol, item.price)}`}
                          changeText={formatPctMaybe(item.changePct, item.hasLiveQuote)}
                          changeTone={getPriceTone(item.changePct, item.hasLiveQuote, selected)}
                          priceText={formatNodePrice(item.symbol, item.price)}
                          priceTone={getPriceTone(item.changePct, item.hasLiveQuote, selected)}
                          candles={sparklineCache[normalizeSymbol(item.symbol)]}
                          changePct={item.changePct}
                          selected={selected}
                          startDate={rangeStartDate}
                          endDate={rangeEndDate}
                          columnWidth={columnWidths.regional}
                        />
                      </button>
                    );
                  })}

                  {regionalRows.map((region) => {
                    const node = flowNodeMap.get(`regional:${region.id}`);
                    if (!node) return null;
                    const selected = normalizeSymbol(activeSymbol) === normalizeSymbol(region.symbol);
                    const tone = getHeatTone(region.changePct, selected && region.hasLiveQuote);
                    return (
                      <button
                        key={`flow-regional-${region.id}`}
                        type="button"
                        draggable
                        onClick={() => {
                          setActiveSymbol(region.symbol);
                          setSelectedSectorId(null);
                          setSelectedBasketId(null);
                          setSelectedStockKey(null);
                        }}
                        onDoubleClick={() => {
                          setActiveSymbol(region.symbol);
                          setSelectedSectorId(null);
                          setSelectedBasketId(null);
                          setSelectedStockKey(null);
                          setSidePanelOpen(true);
                          setSidePanelMode('chart');
                        }}
                        onDragStart={(event) => {
                          setDraggingRegionalId(region.id);
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', region.id);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          const movingId = draggingRegionalId || event.dataTransfer.getData('text/plain');
                          if (!movingId || movingId === region.id) return;
                          setRegionalOrder((current) => moveIdBefore(current, movingId, region.id));
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          setDraggingRegionalId(null);
                        }}
                        onDragEnd={() => setDraggingRegionalId(null)}
                        title={`${region.label} / ${region.displaySymbol}\nPrice ${formatRegionalPrice(region.symbol, region.price)}\nChange ${formatPctMaybe(region.changePct, region.hasLiveQuote)}\nVolume ${formatFlow(region.nodeVolume)}`}
                        className={`absolute overflow-hidden border px-1 py-0.5 text-left transition ${
                          selected
                            ? 'text-white shadow-[0_0_14px_rgba(22,163,74,0.16)]'
                            : draggingRegionalId === region.id
                              ? 'text-gray-300 opacity-70'
                              : 'text-gray-200 hover:border-[#505050]'
                        }`}
                        style={{
                          left: flowLayout.left.regional,
                          top: node.top,
                          width: columnWidths.regional,
                          height: node.height,
                          backgroundColor: selected ? (region.hasLiveQuote ? tone.fill : '#151515') : '#0b0b0b',
                          borderColor: selected ? tone.border : '#303030',
                          borderLeftColor: selected ? tone.border : '#555555',
                        }}
                      >
                        <FlowCardBody
                          title={region.label}
                          subtitle={`${region.displaySymbol} ${formatNodePrice(region.symbol, region.price)}`}
                          changeText={formatPctMaybe(region.changePct, region.hasLiveQuote)}
                          changeTone={getPriceTone(region.changePct, region.hasLiveQuote, selected)}
                          priceText={formatNodePrice(region.symbol, region.price)}
                          priceTone={getPriceTone(region.changePct, region.hasLiveQuote, selected)}
                          candles={sparklineCache[normalizeSymbol(region.symbol)]}
                          changePct={region.changePct}
                          selected={selected}
                          startDate={rangeStartDate}
                          endDate={rangeEndDate}
                          columnWidth={columnWidths.regional}
                        />
                      </button>
                    );
                  })}

                  {orderedSectors.map((sector) => {
                    const node = flowNodeMap.get(`sector:${sector.id}`);
                    if (!node) return null;
                    const selected = selectedSectorId === sector.id;
                    const faded = Boolean(selectedSectorId && selectedSectorId !== sector.id);
                    const tone = getHeatTone(sector.changePct, selected && sector.dataCoverage > 0);
                    return (
                      <button
                        key={`flow-sector-${sector.id}`}
                        type="button"
                        onClick={() => selectSector(sector.id)}
                        onDoubleClick={() => openColorSettings({ id: `flow-sector-${sector.id}`, label: sector.name, kind: 'sector' })}
                        title={`${sector.name}\nVol ${formatFlow(sector.nodeVolume)}\nFlow ${formatFlow(sector.flowValue)}\nChange ${formatPctMaybe(sector.changePct, sector.dataCoverage > 0)}`}
                        className={`absolute overflow-hidden border px-1 py-0.5 text-left transition ${
                          selected
                            ? 'text-white shadow-[0_0_14px_rgba(22,163,74,0.22)]'
                            : faded
                              ? 'text-gray-500'
                              : 'text-gray-200 hover:border-[#505050]'
                        }`}
                        style={{
                          left: flowLayout.left.sectors,
                          top: node.top,
                          width: columnWidths.sectors,
                          height: node.height,
                          backgroundColor: selected ? (sector.dataCoverage > 0 ? tone.fill : '#151515') : '#0b0b0b',
                          borderColor: selected ? tone.border : faded ? '#202020' : '#303030',
                          borderLeftColor: selected ? tone.border : '#555555',
                        }}
                      >
                        <FlowCardBody
                          title={sector.name}
                          subtitle=""
                          changeText={formatPctMaybe(sector.changePct, sector.dataCoverage > 0)}
                          changeTone={getPriceTone(sector.changePct, sector.dataCoverage > 0, selected)}
                          priceText=""
                          priceTone={getPriceTone(sector.changePct, sector.dataCoverage > 0, selected)}
                          candles={sectorRollupCandles[sector.id]}
                          changePct={sector.changePct}
                          selected={selected}
                          startDate={rangeStartDate}
                          endDate={rangeEndDate}
                          columnWidth={columnWidths.sectors}
                          showSparkline={false}
                        />
                      </button>
                    );
                  })}

                  {flowBaskets.map((basket) => {
                    const node = flowNodeMap.get(`basket:${basket.id}`);
                    if (!node) return null;
                    const selected = selectedBasketId === basket.id;
                    const faded = Boolean((selectedSectorId && getBasketParentSectorId(basket) !== selectedSectorId) || (selectedBasketId && selectedBasketId !== basket.id));
                    const tone = getHeatTone(basket.changePct, selected && basket.dataCoverage > 0);
                    return (
                      <button
                        key={`flow-basket-${basket.id}`}
                        type="button"
                        onClick={() => selectBasket(basket)}
                        onDoubleClick={() => openColorSettings({ id: `flow-basket-${basket.id}`, label: basket.name, kind: 'basket' })}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setSelectedBasketId(basket.id);
                          setSelectedSectorId(getBasketParentSectorId(basket));
                          setSelectedStockKey(null);
                          setBasketContextMenu({
                            x: event.clientX,
                            y: event.clientY,
                            groupId: basket.id,
                            label: basket.name,
                          });
                          setStockContextMenu(null);
                        }}
                        title={`${basket.name}\n${basket.sector}\nVol ${formatFlow(basket.nodeVolume)}\nFlow ${formatFlow(basket.flowValue)}\nRelative Return ${formatPctMaybe(basket.relativeReturn, basket.dataCoverage > 0)}`}
                        className={`absolute overflow-hidden border px-1 py-0.5 text-left transition ${
                          selected
                            ? 'text-white shadow-[0_0_14px_rgba(22,163,74,0.22)]'
                            : faded
                              ? 'text-gray-500'
                              : 'text-gray-200 hover:border-[#505050]'
                        }`}
                        style={{
                          left: flowLayout.left.baskets,
                          top: node.top,
                          width: columnWidths.baskets,
                          height: node.height,
                          backgroundColor: selected ? (basket.dataCoverage > 0 ? tone.fill : '#151515') : '#0b0b0b',
                          borderColor: selected ? tone.border : faded ? '#202020' : '#303030',
                          borderLeftColor: selected ? tone.border : '#555555',
                        }}
                      >
                        <FlowCardBody
                          title={basket.name}
                          subtitle={`${basket.sector} ${formatFlow(basket.nodeVolume)}`}
                          changeText={formatPctMaybe(basket.changePct, basket.dataCoverage > 0)}
                          changeTone={getPriceTone(basket.changePct, basket.dataCoverage > 0, selected)}
                          priceText=""
                          priceTone={getPriceTone(basket.changePct, basket.dataCoverage > 0, selected)}
                          candles={undefined}
                          changePct={basket.changePct}
                          selected={selected}
                          startDate={rangeStartDate}
                          endDate={rangeEndDate}
                          columnWidth={columnWidths.baskets}
                          showSparkline={false}
                        />
                      </button>
                    );
                  })}

                  {flowStocks.map((stock) => {
                    const node = flowNodeMap.get(`stock:${stock.basketId}:${stock.symbol}`);
                    if (!node) return null;
                    const stockKey = `${stock.basketId}:${normalizeSymbol(stock.symbol)}`;
                    const selected = selectedStockKey === stockKey;
                    const faded = Boolean(selectedBasketId && selectedBasketId !== stock.basketId);
                    const tone = getHeatTone(stock.changePct, selected && stock.hasLiveQuote);
                    const japanese = isJapanStock(stock.symbol);
                    const primary = japanese ? stock.name : formatStockCode(stock.symbol);
                    const secondary = japanese
                      ? `${formatStockCode(stock.symbol)}  ${formatStockMarketCap(stock.marketCap)}`
                      : `${stock.name}  ${formatStockMarketCap(stock.marketCap)}`;
                    return (
                      <button
                        key={`flow-stock-${stock.basketId}-${stock.symbol}`}
                        type="button"
                        data-macro-stock-card="true"
                        draggable
                        onClick={() => {
                          setActiveSymbol(stock.symbol);
                          setSelectedStockKey(stockKey);
                          setSelectedSectorId(stock.sector);
                          setSelectedBasketId(stock.basketId);
                        }}
                        onDoubleClick={() => openChartForStock(stock)}
                        onDragStart={(event) => beginStockDrag(event, stock.symbol)}
                        onDragEnd={() => setDraggingStockSymbol(null)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setStockContextMenu({
                            x: event.clientX,
                            y: event.clientY,
                            groupId: stock.basketId,
                            symbol: stock.symbol,
                            label: stock.name,
                          });
                          setBasketContextMenu(null);
                        }}
                        title={`${stock.symbol} ${stock.name}\nVol ${formatStockMetric(stock.nodeVolume)}\nFlow ${formatStockMetric(stock.flowValue)}\nAlpha ${formatStockPctMaybe(stock.alpha, stock.hasLiveQuote)}\nMomentum ${stock.momentum.toFixed(2)}`}
                        className={`absolute overflow-hidden border px-1 py-0.5 text-left transition ${
                          selected
                            ? 'text-white shadow-[0_0_14px_rgba(22,163,74,0.22)]'
                            : draggingStockSymbol === normalizeSymbol(stock.symbol)
                              ? 'text-gray-300 opacity-70'
                            : faded
                              ? 'text-gray-500'
                              : 'text-gray-200 hover:border-[#505050]'
                        }`}
                        style={{
                          left: flowLayout.left.stocks,
                          top: node.top,
                          width: columnWidths.stocks,
                          height: node.height,
                          backgroundColor: selected ? (stock.hasLiveQuote ? tone.fill : '#151515') : '#0b0b0b',
                          borderColor: selected ? tone.border : faded ? '#202020' : '#303030',
                          borderLeftColor: selected ? tone.border : '#555555',
                        }}
                      >
                        <FlowCardBody
                          title={primary}
                          subtitle={secondary}
                          changeText={formatStockPctMaybe(stock.changePct, stock.hasLiveQuote)}
                          changeTone={getPriceTone(stock.changePct, stock.hasLiveQuote, selected)}
                          priceText={formatNodePrice(stock.symbol, stock.price)}
                          priceTone={getPriceTone(stock.changePct, stock.hasLiveQuote, selected)}
                          candles={sparklineCache[normalizeSymbol(stock.symbol)]}
                          changePct={stock.changePct}
                          selected={selected}
                          monoTitle={!japanese}
                          startDate={rangeStartDate}
                          endDate={rangeEndDate}
                          columnWidth={columnWidths.stocks}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {basketContextMenu && (
        <div
          className="fixed z-[95] w-52 border border-[#343434] bg-[#080808] py-1 text-[10px] text-gray-200 shadow-2xl"
          style={{ left: basketContextMenu.x, top: basketContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseUp={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
        >
          <div className="border-b border-[#242424] px-2.5 py-1.5 text-[9px] text-gray-500">
            <span className="block truncate">{basketContextMenu.label}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              openStockAddModal(basketContextMenu.groupId);
            }}
            className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-[#171717]"
          >
            <Plus className="h-3.5 w-3.5" />
            銘柄を追加
          </button>
          <button
            type="button"
            onClick={() => {
              const group = findEditableBasketGroup(basketContextMenu.groupId);
              if (group) openBasketEditor(group);
              setBasketContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-[#171717]"
          >
            <Pencil className="h-3.5 w-3.5" />
            グルーピング名編集
          </button>
          <button
            type="button"
            onClick={() => {
              deleteBasketGroup(basketContextMenu.groupId);
            }}
            className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-red-300 hover:bg-red-950/30 hover:text-red-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Themeを削除
          </button>
        </div>
      )}

      {stockContextMenu && (
        <div
          className="fixed z-[95] w-44 border border-[#343434] bg-[#080808] py-1 text-[10px] text-gray-200 shadow-2xl"
          style={{ left: stockContextMenu.x, top: stockContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseUp={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              openStockEditModal(stockContextMenu.groupId, stockContextMenu.symbol);
              setStockContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-[#171717]"
          >
            <Pencil className="h-3.5 w-3.5" />
            銘柄編集
          </button>
          <button
            type="button"
            onClick={() => {
              const stock = visibleStocks.find((item) => (
                item.basketId === stockContextMenu.groupId
                && normalizeSymbol(item.symbol) === normalizeSymbol(stockContextMenu.symbol)
              ));
              if (stock) openChartForStock(stock);
              setStockContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-[#171717]"
          >
            <ChartNoAxesCombined className="h-3.5 w-3.5" />
            チャート表示
          </button>
          <button
            type="button"
            onClick={() => {
              deleteEditableStock(stockContextMenu.groupId, stockContextMenu.symbol);
            }}
            className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-red-300 hover:bg-red-950/30 hover:text-red-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
            削除
          </button>
        </div>
      )}

      {stockEditModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 px-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !stockEditModal.loading) setStockEditModal(null);
          }}
        >
          <form
            className="w-full max-w-md border border-[#343434] bg-[#080808] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void submitStockEdit();
            }}
          >
            <div className="flex h-10 items-center justify-between border-b border-[#242424] px-3">
              <div className="text-xs font-bold text-white">銘柄編集</div>
              <button
                type="button"
                onClick={() => setStockEditModal(null)}
                disabled={stockEditModal.loading}
                className="flex h-7 w-7 items-center justify-center text-gray-400 hover:text-white disabled:opacity-40"
                aria-label="銘柄編集を閉じる"
                title="閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-3">
              <label className="block text-[10px] text-gray-500">
                ティッカーコードまたは銘柄名
                <input
                  value={stockEditModal.symbol}
                  onChange={(event) => setStockEditModal((current) => current ? { ...current, symbol: event.target.value, error: null } : current)}
                  className="mt-1 h-9 w-full border border-[#303030] bg-[#101010] px-2 text-sm text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="ASML / AMAT / Samsung"
                  autoFocus
                />
              </label>
              <label className="block text-[10px] text-gray-500">
                銘柄名
                <input
                  value={stockEditModal.name}
                  onChange={(event) => setStockEditModal((current) => current ? { ...current, name: event.target.value, error: null } : current)}
                  className="mt-1 h-9 w-full border border-[#303030] bg-[#101010] px-2 text-sm text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="Applied Materials"
                />
              </label>
              <label className="block text-[10px] text-gray-500">
                市場
                <input
                  value={stockEditModal.market}
                  onChange={(event) => setStockEditModal((current) => current ? { ...current, market: event.target.value, error: null } : current)}
                  className="mt-1 h-9 w-full border border-[#303030] bg-[#101010] px-2 text-sm text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="US / JP / HK"
                />
              </label>
              {stockEditModal.error && (
                <div className="border border-red-900/70 bg-red-950/20 px-2 py-1.5 text-[10px] text-red-200">
                  {stockEditModal.error}
                </div>
              )}
            </div>
            <div className="flex h-11 items-center justify-between gap-2 border-t border-[#242424] px-3">
              <button
                type="button"
                onClick={() => void fillStockFromSearch()}
                disabled={stockEditModal.loading}
                className="h-7 border border-[#303030] bg-[#101010] px-3 text-[11px] text-gray-300 hover:bg-[#171717] hover:text-white disabled:opacity-40"
              >
                {stockEditModal.loading ? '検索中' : '補完'}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStockEditModal(null)}
                  disabled={stockEditModal.loading}
                  className="h-7 border border-[#303030] bg-[#101010] px-3 text-[11px] text-gray-300 hover:bg-[#171717] hover:text-white disabled:opacity-40"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={stockEditModal.loading}
                  className="h-7 border border-emerald-700 bg-emerald-600 px-3 text-[11px] font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  OK
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div
        data-macro-chart-panel="true"
        className="fixed top-24 right-0 bottom-0 z-40 flex border-l border-[#202020] bg-[#080808] shadow-2xl overflow-visible transition-[width] duration-150 ease-out"
        style={{ width: sidePanelOpen ? sidePanelWidth + SIDE_PANEL_NAV_WIDTH : SIDE_PANEL_NAV_WIDTH }}
      >
        {sidePanelOpen && (
          <button
            type="button"
            className="w-1.5 shrink-0 cursor-col-resize bg-[#191919]/90 hover:bg-emerald-500 active:bg-emerald-600"
            onPointerDown={(event) => {
              event.preventDefault();
              setSidePanelResizing({ startX: event.clientX, startWidth: sidePanelWidth });
            }}
            aria-label="チャートパネル幅を調整"
            title="チャートパネル幅を調整"
          />
        )}
        <div
          className={`min-w-0 flex flex-col overflow-hidden transition-[width] duration-150 ease-out ${sidePanelOpen ? '' : 'pointer-events-none'}`}
          style={{ width: sidePanelOpen ? sidePanelWidth : 0 }}
        >
          <div className="h-10 shrink-0 border-b border-[#1b1b1b] px-3 flex items-center justify-between">
            <div className="text-xs font-bold text-white truncate">{renderPanelTitle()}</div>
            <button
              type="button"
              onClick={() => setSidePanelOpen(false)}
              className="w-7 h-7 text-gray-400 hover:text-white hover:bg-[#111111] flex items-center justify-center"
              aria-label="サイドパネルを閉じる"
              title="閉じる"
            >
              <PanelRightOpen className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto bg-[#080808]">
            {sidePanelMode === 'chart' && (
              <div className="h-full min-h-0 flex flex-col">
                <div className="shrink-0 border-b border-[#1b1b1b] p-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setSymbolMenuOpen((open) => !open)}
                      className="h-8 w-full bg-[#050505] border border-[#222222] px-2 flex items-center justify-between gap-2 text-xs font-bold uppercase text-white outline-none transition hover:border-sky-500/60 hover:text-sky-200 focus:border-sky-500"
                      aria-haspopup="listbox"
                      aria-expanded={symbolMenuOpen}
                      aria-label="チャート銘柄"
                    >
                      <span className="min-w-0 truncate">{activeSymbol}</span>
                      <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-sky-300 transition-transform ${symbolMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {symbolMenuOpen && (
                      <div className="absolute left-0 right-0 top-full z-[70] mt-1 max-h-72 overflow-y-auto border border-[#252525] bg-[#050505] py-1 shadow-2xl" role="listbox">
                        {stockOptions.map((option) => (
                          <button
                            key={option.symbol}
                            type="button"
                            role="option"
                            aria-selected={normalizeSymbol(option.symbol) === normalizeSymbol(activeSymbol)}
                            onClick={() => {
                              setActiveSymbol(option.symbol);
                              setSymbolMenuOpen(false);
                            }}
                            className="w-full px-2.5 py-1.5 text-left text-[11px] font-bold uppercase text-white hover:bg-[#111111] hover:text-sky-300"
                          >
                            <span className="flex min-w-0 items-baseline gap-2">
                              <span className="shrink-0 font-mono">{option.symbol}</span>
                              <span className="min-w-0 truncate text-[10px] font-semibold normal-case text-gray-300">{option.name}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center p-0.5 gap-0.5 overflow-x-auto scrollbar-none">
                      {CHART_TIMEFRAME_OPTIONS.map((timeframe) => (
                        <button
                          key={timeframe}
                          type="button"
                          onClick={() => onChartTimeframeChange(timeframe)}
                          className={`px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                            chartTimeframe === timeframe
                              ? 'bg-emerald-500 text-black'
                              : 'text-gray-400 hover:text-white hover:bg-[#111111]'
                          }`}
                        >
                          {formatTimeframeLabel(timeframe)}
                        </button>
                      ))}
                    </div>
                    <div className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => onChartStateChange((current) => ({ ...current, showVolume: !current.showVolume }))}
                        className={`px-1 ${chartState.showVolume ? 'text-[#26a69a] font-bold' : 'text-gray-500 hover:text-gray-200'}`}
                        title="出来高を表示"
                      >
                        VOL
                      </button>
                      <button
                        type="button"
                        onClick={() => onChartStateChange((current) => ({ ...current, showRsi: !current.showRsi }))}
                        className={`px-1 ${chartState.showRsi ? 'text-[#f3a14b] font-bold' : 'text-gray-500 hover:text-gray-200'}`}
                        title="RSIを表示"
                      >
                        RSI
                      </button>
                      <button
                        type="button"
                        onClick={() => onChartStateChange((current) => ({ ...current, showMacd: !current.showMacd }))}
                        className={`px-1 ${chartState.showMacd ? 'text-emerald-400 font-bold' : 'text-gray-500 hover:text-gray-200'}`}
                        title="MACDを表示"
                      >
                        MACD
                      </button>
                      <button
                        type="button"
                        onClick={() => onChartStateChange((current) => ({
                          ...current,
                          zoomFactor: 8,
                          scrollOffsetPct: 100,
                          priceScale: 1,
                          priceOffsetPct: 0,
                          rsiHeightPct: 25,
                          macdHeightPct: 25,
                        }))}
                        className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-white hover:bg-[#202020]"
                        title="チャート表示をリセット"
                        aria-label="チャート表示をリセット"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {false && chartComparisonSymbols.length > 0 && (
                    <div className="mt-2 flex items-center gap-1 overflow-x-auto border-t border-[#161616] pt-1">
                      {chartComparisonSymbols.map((symbol, index) => (
                        <span
                          key={`macro-chart-comparison-${symbol}`}
                          className="inline-flex h-5 shrink-0 items-center gap-1 border border-[#2a2a2a] bg-[#111111] px-1.5 font-mono text-[9px] font-bold"
                          style={{ color: getFlowPaletteColor(index), borderColor: `${getFlowPaletteColor(index)}55` }}
                        >
                          {symbol}
                          <button
                            type="button"
                            onClick={() => setChartComparisonSymbols((current) => current.filter((item) => item !== symbol))}
                            className="text-gray-500 hover:text-red-300"
                            aria-label={`${symbol}の比較を削除`}
                            title="比較から削除"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div
                  className={`flex-1 min-h-0 bg-[#090909] ${draggingStockSymbol ? 'ring-1 ring-inset ring-emerald-500/40' : ''}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                  }}
                  onDrop={dropStockOnChart}
                >
                  {activeSymbol ? (
                    renderTickerChart({
                      symbol: activeSymbol,
                      comparisonSymbols: chartComparisonSymbols,
                      onRemoveComparisonSymbol: (symbol) => setChartComparisonSymbols((current) => current.filter((item) => item !== symbol)),
                      onOpenIndicatorSettings: () => {
                        setSidePanelOpen(true);
                        setSidePanelMode('settings');
                      },
                      focusDate: selectedDate,
                      focusDateActive: true,
                    })
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-gray-500">銘柄なし</div>
                  )}
                </div>
              </div>
            )}

            {sidePanelMode === 'settings' && (
              <div className="p-3 space-y-3">
                <div className="border border-[#242424] bg-[#0b0b0b] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] text-gray-500">対象</div>
                      <div className="text-xs font-bold text-white truncate">{colorTarget.label}</div>
                    </div>
                    <Settings className="w-4 h-4 text-emerald-300" />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-gray-400">
                    <div className="border border-[#242424] bg-[#050505] p-2">
                      <div className="mb-1 text-gray-500">プラス</div>
                      <div className="h-3 bg-[rgba(22,163,74,0.72)]" />
                    </div>
                    <div className="border border-[#242424] bg-[#050505] p-2">
                      <div className="mb-1 text-gray-500">マイナス</div>
                      <div className="h-3 bg-[rgba(220,38,38,0.72)]" />
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] leading-relaxed text-gray-500">
                    フロー色はヒートマップ連動に固定。未選択経路はグレー、クリック中の経路だけ緑/赤で強調する。
                  </div>
                </div>
                {activeSymbol && (
                  <div className="border border-[#242424] bg-[#0b0b0b]">
                    {renderIndicatorSettings(activeSymbol)}
                  </div>
                )}
              </div>
            )}

            {sidePanelMode === 'summary' && (
              <div className="p-3 space-y-2">
                <div className="border border-[#242424] bg-[#0b0b0b] p-3">
                  <div className="text-[10px] text-gray-500">Top Sector</div>
                  <div className="mt-1 text-sm font-bold text-white">{topSector?.name ?? '-'}</div>
                  <div className="mt-1 text-[11px] font-mono text-sky-300">{topSector ? formatFlow(topSector.flowValue) : '-'}</div>
                </div>
                <div className="border border-[#242424] bg-[#0b0b0b] p-3">
                  <div className="text-[10px] text-gray-500">Top Basket</div>
                  <div className="mt-1 text-sm font-bold text-white">{topBasket?.name ?? '-'}</div>
                  <div className="mt-1 text-[11px] font-mono text-sky-300">{topBasket ? formatPctMaybe(topBasket.changePct, topBasket.dataCoverage > 0) : '-'}</div>
                </div>
                <div className="border border-[#242424] bg-[#0b0b0b] p-3">
                  <div className="text-[10px] text-gray-500">Top Stock</div>
                  <div className="mt-1 text-sm font-bold text-white">{topStock?.symbol ?? '-'}</div>
                  <div className="mt-1 text-[11px] font-mono text-sky-300">{topStock ? formatPctMaybe(topStock.changePct, topStock.hasLiveQuote) : '-'}</div>
                </div>
              </div>
            )}

            {sidePanelMode === 'annotation' && (
              <div className="p-3 space-y-2">
                {[
                  [FLOW_EVENT_DATE, 'NVDA Earnings'],
                  ['2026-06-13', 'Semiconductors'],
                  ['2026-06-17', 'AI Infrastructure'],
                  ['2026-06-24', 'Liquid Cooling'],
                  ['2026-07-03', 'Stock Arrival'],
                ].map(([date, text]) => (
                  <div key={date} className="border border-[#242424] bg-[#0b0b0b] px-3 py-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] text-white">{text}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-gray-500">{date}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {sidePanelMode === 'sources' && (
              <div className="p-3 space-y-2">
                {[
                  ['Moomoo OpenAPI', 'Quotes / Kline'],
                  ['ValueChain Database', 'Basket Groups'],
                  ['Polygon', 'Market Data'],
                  ['JPX', 'Japan Volume'],
                  ['Financial Modeling Prep', 'Financial Data'],
                ].map(([name, detail]) => (
                  <div key={name} className="border border-[#242424] bg-[#0b0b0b] px-3 py-2 flex items-center justify-between gap-3">
                    <span className="text-[11px] font-bold text-white">{name}</span>
                    <span className="text-[10px] text-gray-500">{detail}</span>
                  </div>
                ))}
              </div>
            )}

            {sidePanelMode === 'basket-db' && (
              <div className="p-3 space-y-3">
                <div className="border border-[#242424] bg-[#0b0b0b] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[9px] uppercase tracking-wider text-gray-500">Basket Database</div>
                      <div className="truncate text-xs font-bold text-white">{editableBasketChain.name || selectedMacroScopeOption?.label || 'マクロ全体'}</div>
                    </div>
                    <span className="shrink-0 font-mono text-[9px] text-gray-500">{editableBasketGroups.length} baskets</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <button type="button" onClick={() => openBasketEditor()} className="h-7 w-7 inline-flex items-center justify-center border border-[#303030] bg-[#101010] text-gray-300 hover:bg-[#181818] hover:text-white" title="バスケットを追加" aria-label="バスケットを追加">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => basketDbImportInputRef.current?.click()} className="h-7 w-7 inline-flex items-center justify-center border border-[#303030] bg-[#101010] text-gray-300 hover:bg-[#181818] hover:text-white" title="CSV/JSON/キャッシュインポート" aria-label="CSV/JSON/キャッシュインポート">
                      <Upload className="h-3.5 w-3.5" />
                    </button>
                    <div className="relative" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setBasketDbExportMenuAnchor((anchor) => (anchor === 'panel' ? null : 'panel'))}
                        className={`h-7 w-7 inline-flex items-center justify-center border border-[#303030] bg-[#101010] hover:bg-[#181818] hover:text-white ${basketDbExportMenuAnchor === 'panel' ? 'text-white' : 'text-gray-300'}`}
                        title="エクスポート"
                        aria-label="エクスポート"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                      </button>
                      {basketDbExportMenuAnchor === 'panel' && (
                        <div className="absolute left-0 top-8 z-50 w-44 border border-[#303030] bg-[#080808] py-1 shadow-2xl">
                          <button type="button" onClick={exportBasketDbCsv} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[10px] text-gray-200 hover:bg-[#171717]">
                            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-300" />
                            CSVエクスポート
                          </button>
                          <button type="button" onClick={exportBasketDbJson} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[10px] text-gray-200 hover:bg-[#171717]">
                            <FileJson className="h-3.5 w-3.5 text-sky-300" />
                            JSONエクスポート
                          </button>
                          <button type="button" onClick={exportMacroFlowCacheJson} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[10px] text-gray-200 hover:bg-[#171717]">
                            <Database className="h-3.5 w-3.5 text-cyan-300" />
                            キャッシュJSON
                          </button>
                          <button type="button" onClick={exportBasketDbSpec} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[10px] text-gray-200 hover:bg-[#171717]">
                            <FileDown className="h-3.5 w-3.5 text-gray-300" />
                            テンプレート仕様
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {cacheTransferStatus && (
                    <div className="mt-2 truncate border border-[#242424] bg-[#050505] px-2 py-1 font-mono text-[9px] text-cyan-300" title={cacheTransferStatus}>
                      {cacheTransferStatus}
                    </div>
                  )}
                </div>

                {basketEditor && (
                  <div className="border border-[#303030] bg-[#080808] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{basketEditor.id ? 'Edit Basket' : 'Add Basket'}</div>
                      <button type="button" onClick={() => setBasketEditor(null)} className="h-6 w-6 inline-flex items-center justify-center text-gray-500 hover:bg-[#151515] hover:text-white" aria-label="編集を閉じる">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <label className="mt-2 block">
                      <span className="text-[9px] text-gray-500">バスケット名</span>
                      <input value={basketEditor.name} onChange={(event) => setBasketEditor((current) => current ? { ...current, name: event.target.value } : current)} className="mt-1 h-8 w-full border border-[#303030] bg-black px-2 text-[11px] font-bold text-white outline-none focus:border-emerald-600" />
                    </label>
                    <label className="mt-2 block">
                      <span className="text-[9px] text-gray-500">セクター</span>
                      <input value={basketEditor.sector} onChange={(event) => setBasketEditor((current) => current ? { ...current, sector: event.target.value } : current)} className="mt-1 h-8 w-full border border-[#303030] bg-black px-2 text-[11px] text-gray-100 outline-none focus:border-emerald-600" />
                    </label>
                    <label className="mt-2 block">
                      <span className="text-[9px] text-gray-500">構成銘柄 CSV: symbol,name,market,marketCap,baseChangePct</span>
                      <textarea value={basketEditor.stocksText} onChange={(event) => setBasketEditor((current) => current ? { ...current, stocksText: event.target.value } : current)} rows={7} className="mt-1 w-full resize-y border border-[#303030] bg-black px-2 py-1.5 font-mono text-[10px] text-gray-100 outline-none focus:border-emerald-600" spellCheck={false} />
                    </label>
                    <div className="mt-3 flex justify-end gap-2">
                      <button type="button" onClick={() => setBasketEditor(null)} className="h-7 px-3 border border-[#303030] bg-[#101010] text-[10px] text-gray-300 hover:bg-[#181818] hover:text-white">
                        キャンセル
                      </button>
                      <button type="button" onClick={saveBasketEditor} className="h-7 px-3 border border-emerald-700 bg-emerald-700 text-[10px] font-bold text-white hover:bg-emerald-600">
                        保存
                      </button>
                    </div>
                  </div>
                )}

                {basketDbImportDecision && (
                  <div className="border border-emerald-800/70 bg-[#07110d] p-3 text-[10px]">
                    <div className="font-bold text-white">インポート確認</div>
                    <div className="mt-1 text-gray-400">{basketDbImportDecision.sourceName} / {basketDbImportDecision.chain.name || 'Untitled'} / {formatImportTimestamp(basketDbImportDecision.importedAt)}</div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={() => setBasketDbImportDecision(null)} className="h-7 px-2.5 border border-[#303030] bg-[#101010] text-gray-300 hover:text-white">取消</button>
                      <button type="button" onClick={() => applyBasketDbImportDecision('replace-current')} className="h-7 px-2.5 border border-[#404040] bg-[#181818] font-bold text-white hover:bg-[#222]">現在DBへ上書き</button>
                      <button type="button" onClick={() => applyBasketDbImportDecision('new-history')} className="h-7 px-2.5 border border-emerald-700 bg-emerald-700 font-bold text-white hover:bg-emerald-600">新規DBとして追加</button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {editableBasketGroups.map((group) => {
                    const sector = getBasketGroupSector(group);
                    return (
                      <div key={`db-editable-${group.id}`} className="border border-[#242424] bg-[#0b0b0b] p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[11px] font-bold text-white">{group.name}</div>
                            <div className="mt-0.5 truncate text-[9px] text-gray-500">{sector} / {group.stocks.length} stocks</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button type="button" onClick={() => openBasketEditor(group)} className="h-6 w-6 inline-flex items-center justify-center border border-[#303030] text-gray-400 hover:bg-[#181818] hover:text-white" title="編集" aria-label="編集">
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button type="button" onClick={() => deleteBasketGroup(group.id)} className="h-6 w-6 inline-flex items-center justify-center border border-[#303030] text-gray-400 hover:bg-red-950/40 hover:text-red-200" title="削除" aria-label="削除">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {group.stocks.slice(0, 10).map((stock) => (
                            <span key={`${group.id}-${stock.symbol}`} className="px-1.5 py-0.5 border border-[#242424] bg-[#050505] text-[9px] font-mono text-gray-300">{stock.symbol}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {editableBasketGroups.length === 0 && (
                    <div className="border border-dashed border-[#303030] bg-[#080808] p-4 text-center text-[10px] text-gray-500">
                      バスケットがありません。追加またはCSV/JSONインポートで作成してください。
                    </div>
                  )}
                </div>
                <div className="hidden">
                  {['追加', '編集', '削除', '取込', '出力'].map((label) => (
                    <button key={label} type="button" disabled className="h-7 border border-[#242424] bg-[#101010] text-[10px] text-gray-500 disabled:opacity-70">
                      {label}
                    </button>
                  ))}
                </div>
                <div className="hidden">
                  {orderedBaskets.slice(0, 8).map((basket) => (
                    <div key={`db-${basket.id}`} className="border border-[#242424] bg-[#0b0b0b] p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[11px] font-bold text-white">{basket.name}</span>
                        <span className="font-mono text-[9px] text-gray-500">{basket.stockMetrics.length}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {basket.stockMetrics.slice(0, 8).map((stock) => (
                          <span key={`${basket.id}-${stock.symbol}`} className="px-1.5 py-0.5 border border-[#242424] bg-[#050505] text-[9px] font-mono text-gray-300">
                            {stock.symbol}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        <nav data-macro-side-nav="true" className="relative w-11 shrink-0 bg-[#070707] border-l border-[#242424] flex flex-col items-center py-2 gap-1">
          <SidePanelButton mode="chart" activeMode={sidePanelMode} title="チャート表示" onClick={() => openPanel('chart')}>
            <ChartNoAxesCombined className="w-5 h-5" />
          </SidePanelButton>
          <SidePanelButton mode="settings" activeMode={sidePanelMode} title="チャート設定" onClick={() => openPanel('settings')}>
            <Settings className="w-4 h-4" />
          </SidePanelButton>
          <div className="relative flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => basketDbImportInputRef.current?.click()}
              className="w-9 h-9 flex items-center justify-center border border-transparent text-gray-400 transition hover:bg-[#161616] hover:text-white"
              title="CSV/JSON/キャッシュインポート"
              aria-label="CSV/JSON/キャッシュインポート"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setBasketDbExportMenuAnchor((anchor) => (anchor === 'nav' ? null : 'nav'));
              }}
              className={`w-9 h-9 flex items-center justify-center border transition ${
                basketDbExportMenuAnchor === 'nav'
                  ? 'bg-[#202020] border-[#4a4a4a] text-white'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-[#161616]'
              }`}
              title="エクスポート"
              aria-label="エクスポート"
            >
              <FileDown className="w-3.5 h-3.5" />
            </button>
            {basketDbExportMenuAnchor === 'nav' && (
              <div
                className="absolute right-10 top-10 z-50 w-44 border border-[#303030] bg-[#080808] py-1 text-[10px] text-gray-200 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <button type="button" onClick={exportBasketDbCsv} className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-[#171717]">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-300" />
                  CSVエクスポート
                </button>
                <button type="button" onClick={exportBasketDbJson} className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-[#171717]">
                  <FileJson className="h-3.5 w-3.5 text-sky-300" />
                  JSONエクスポート
                </button>
                <button type="button" onClick={exportMacroFlowCacheJson} className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-[#171717]">
                  <Database className="h-3.5 w-3.5 text-cyan-300" />
                  キャッシュJSON
                </button>
                <button type="button" onClick={exportBasketDbSpec} className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-[#171717]">
                  <FileDown className="h-3.5 w-3.5 text-gray-300" />
                  テンプレート仕様書
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => openPanel('basket-db')}
              className="w-9 h-9 flex items-center justify-center border border-transparent text-gray-400 transition hover:bg-[#161616] hover:text-white"
              title="Basket Database"
              aria-label="Basket Database"
            >
              <Layers3 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="my-1 h-px w-7 bg-[#242424]" />
          <SidePanelButton mode="summary" activeMode={sidePanelMode} title="TOP Flow Summary" onClick={() => openPanel('summary')}>
            <Activity className="w-4 h-4" />
          </SidePanelButton>
          <SidePanelButton mode="annotation" activeMode={sidePanelMode} title="Event Annotation" onClick={() => openPanel('annotation')}>
            <FileText className="w-4 h-4" />
          </SidePanelButton>
          <SidePanelButton mode="sources" activeMode={sidePanelMode} title="Data Sources" onClick={() => openPanel('sources')}>
            <Database className="w-4 h-4" />
          </SidePanelButton>
        </nav>
        <input
          ref={basketDbImportInputRef}
          type="file"
          accept=".csv,.json,application/json,text/csv"
          className="hidden"
          onChange={handleBasketDbImportFile}
        />
      </div>
    </main>
  );
}
