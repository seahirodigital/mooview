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
  FileText,
  Layers3,
  ListTree,
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
type RangeHandle = 'start' | 'end';
type ColumnBoundary = 'regional-sector' | 'sector-basket' | 'basket-stock' | 'stock-right';

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
}

interface MacroQuoteResult {
  success?: boolean;
  symbol?: string;
  name?: string;
  price?: number;
  changePct?: number;
  marketCap?: number;
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
    focusDate?: string;
    focusDateActive?: boolean;
  }) => React.ReactNode;
  renderIndicatorSettings: (symbol: string) => React.ReactNode;
  onChartSymbolsChange: (symbols: string[]) => void;
}

const FLOW_START_DATE = '2026-06-10';
const FLOW_END_DATE = getTodayDateValue();
const FLOW_MIN_DATE = getDateValueDaysAgo(365);
const DEFAULT_RANGE_DAYS = 5;
const FLOW_DEFAULT_START_DATE = getDateValueDaysAgo(DEFAULT_RANGE_DAYS);
const FLOW_EVENT_DATE = '2026-06-10';
const CALENDAR_WEEK_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const VALUE_CHAIN_STORAGE_KEY = 'mooview_value_chain_map_v1';
const CHAIN_HISTORY_STORAGE_KEY = 'mooview_value_chain_history_v1';
const ACTIVE_CHAIN_HISTORY_ID_STORAGE_KEY = 'mooview_value_chain_active_history_id';
const VALUE_CHAIN_SYNC_EVENT = 'mooview:value-chain-map-updated';
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
  { id: 'us10y', label: '米債', displaySymbol: 'US10Y', symbol: 'IEF', baseVolume: 42_000_000 },
  { id: 'usd-jpy', label: '為替', displaySymbol: 'USD/JPY', symbol: 'YCS', baseVolume: 28_000_000 },
  { id: 'gold', label: '金', displaySymbol: 'GOLD/USD', symbol: 'GLD', baseVolume: 18_000_000 },
  { id: 'dxy', label: 'ドル指数', displaySymbol: 'DXY', symbol: 'UUP', baseVolume: 16_000_000 },
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

function formatDateValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function clampDateValue(value: string): string {
  if (value < FLOW_MIN_DATE) return FLOW_MIN_DATE;
  if (value > FLOW_END_DATE) return FLOW_END_DATE;
  return value;
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
  start.setDate(firstDay.getDate() - firstDay.getDay());
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

function dateSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
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

function formatTimeframeLabel(timeframe: Timeframe): string {
  if (timeframe === '1mo') return '1M';
  if (timeframe === '1d') return 'day';
  if (timeframe === '1w') return 'Week';
  return timeframe;
}

function isJapanStock(symbol: string): boolean {
  return normalizeSymbol(symbol).startsWith('JP.');
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
  const hasPrice = Number.isFinite(price) && price > 0;
  const hasChange = Number.isFinite(changePct);
  const hasMarketCap = Number.isFinite(marketCap) && marketCap > 0;
  if (!hasPrice && !hasChange && !hasMarketCap) return null;
  return {
    name: ticker.name || ticker.symbol,
    price: hasPrice ? price : 0,
    changePct: hasChange ? changePct : 0,
    marketCap: hasMarketCap ? marketCap : undefined,
  };
}

function parseMacroQuoteResult(quote: MacroQuoteResult, fallbackSymbol: string): MacroQuote | null {
  const price = Number(quote.price);
  if (!quote.success || !Number.isFinite(price) || price <= 0) return null;
  const marketCap = Number(quote.marketCap);
  return {
    name: quote.name || quote.symbol || fallbackSymbol,
    price,
    changePct: Number.isFinite(Number(quote.changePct)) ? Number(quote.changePct) : 0,
    marketCap: Number.isFinite(marketCap) && marketCap > 0 ? marketCap : undefined,
  };
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
  const seenLabels = new Set<string>(['マクロ全体']);
  readValueChainHistory().forEach((entry, index) => {
    const label = entry.chain?.name?.trim();
    if (!label || seenLabels.has(label)) return;
    const historyId = String(entry.id || `history-${index}`);
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

function getDateOffset(value: string): number {
  return Math.round((dateFromValue(value).getTime() - dateFromValue(FLOW_START_DATE).getTime()) / 86_400_000);
}

function getTimelineDateOffset(value: string): number {
  return Math.round((dateFromValue(value).getTime() - dateFromValue(FLOW_MIN_DATE).getTime()) / 86_400_000);
}

function getTotalRangeDays(): number {
  return Math.max(1, getTimelineDateOffset(FLOW_END_DATE));
}

function dateFromOffset(offset: number): string {
  const date = dateFromValue(FLOW_MIN_DATE);
  date.setDate(date.getDate() + Math.round(clamp(offset, 0, getTotalRangeDays())));
  return formatDateValue(date);
}

function getRangeProgressPct(value: string): number {
  return (clamp(getTimelineDateOffset(value), 0, getTotalRangeDays()) / getTotalRangeDays()) * 100;
}

function getRangeWindowDays(startDate: string, endDate: string): number {
  return Math.max(0, Math.round((dateFromValue(endDate).getTime() - dateFromValue(startDate).getTime()) / 86_400_000));
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

function createLayerReturnPct(
  baseChangePct: number,
  symbol: string,
  rangeStartDays: number,
  rangeEndDays: number,
  layer: 'sector' | 'basket' | 'stock',
): number {
  const elapsedDays = Math.max(0, rangeEndDays);
  const windowDays = Math.max(1, rangeEndDays - rangeStartDays);
  const timelineWeight = elapsedDays <= 0 ? 0 : Math.pow(elapsedDays / 30, 0.76);
  const windowWeight = Math.sqrt(windowDays / 30);
  const impulseSeed = dateSeed(`${symbol}-${layer}-event-impulse`);
  const decaySeed = dateSeed(`${symbol}-${layer}-decay`);
  const layerLead =
    layer === 'sector'
      ? Math.max(0.18, 1.18 - elapsedDays * 0.026)
      : layer === 'basket'
        ? 0.5 + Math.min(0.95, elapsedDays / 18)
        : 0.34 + Math.min(1.1, elapsedDays / 25);
  const eventImpulse = (1.2 + impulseSeed * 4.8) * timelineWeight * windowWeight * layerLead;
  const noise = (decaySeed - 0.5) * (1.2 + timelineWeight * 2.4);
  return clamp(baseChangePct * (0.35 + timelineWeight) + eventImpulse + noise, -12, 42);
}

function createFlowRate(changePct: number, symbol: string, rangeStartDays: number, rangeEndDays: number): number {
  const windowDays = Math.max(1, rangeEndDays - rangeStartDays);
  const persistence = 0.58 + dateSeed(`${symbol}-flow-persistence`) * 0.5;
  const periodScale = Math.sqrt(windowDays / 30);
  return clamp((changePct / 100) * persistence * periodScale, -0.28, 0.82);
}

function createNodeVolume(baseVolume: number, flowRate: number): number {
  return Math.max(0, baseVolume * (1 + flowRate));
}

function createVolumeMultiplier(symbol: string, rangeStartDays: number, rangeEndDays: number): number {
  const elapsedDays = Math.max(1, rangeEndDays);
  const volumeShock = 0.72 + dateSeed(`${symbol}-${rangeStartDays}-${rangeEndDays}-volume`) * 1.75;
  const eventBoost = elapsedDays <= 14 ? 1.14 : 0.96;
  return clamp(volumeShock * eventBoost, 0.45, 3.2);
}

function createMomentum(changePct: number, symbol: string, rangeStartDays: number, rangeEndDays: number): number {
  const elapsedDays = Math.max(1, rangeEndDays);
  const windowDays = Math.max(1, rangeEndDays - rangeStartDays);
  const persistence = 0.7 + dateSeed(`${symbol}-momentum`) * 0.85;
  return clamp((Math.max(0, changePct) / 10) * persistence * Math.sqrt(windowDays / 7) * Math.sqrt(elapsedDays / 30), 0.12, 6.5);
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

function getCandlesForRange(candles: Candle[] | undefined, startDate: string, endDate: string): Candle[] {
  if (!candles || candles.length === 0) return [];
  const ranged = candles.filter((candle) => {
    const dateValue = getCandleDateValue(candle);
    return dateValue >= startDate && dateValue <= endDate;
  });
  if (ranged.length >= 2) return ranged;
  return candles.slice(-Math.min(24, candles.length));
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

function buildFallbackSparklinePath(changePct: number, width = 36, height = 18): string {
  const positive = changePct >= 0;
  const strength = clamp(Math.abs(changePct) / 8, 0.12, 1);
  const points = [0, 0.18, 0.36, 0.55, 0.72, 1].map((ratio, index) => {
    const wave = Math.sin((ratio * Math.PI * 1.6) + (positive ? 0.2 : 1.1)) * 1.6;
    const trend = (positive ? 1 - ratio : ratio) * (height - 5) * strength;
    const base = positive ? height - 4 - trend : 3 + trend;
    const x = ratio * width;
    const y = clamp(base + wave + (index % 2 === 0 ? 0.8 : -0.6), 1.5, height - 1.5);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return points.join(' ');
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
  const path = useMemo(() => (
    buildSparklinePath(visibleCandles, chartWidth) || buildFallbackSparklinePath(changePct, chartWidth)
  ), [changePct, chartWidth, visibleCandles]);
  const color = selected ? '#ffffff' : changePct >= 0 ? '#34d399' : '#fb7185';
  const fillColor = selected ? 'rgba(255,255,255,0.08)' : changePct >= 0 ? 'rgba(52,211,153,0.09)' : 'rgba(248,113,113,0.09)';
  return (
    <svg className="h-[18px] overflow-visible" style={{ width: chartWidth }} viewBox={`0 0 ${chartWidth} 18`} aria-hidden="true">
      <path d={`${path} L ${chartWidth} 18 L 0 18 Z`} fill={fillColor} stroke="none" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" />
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
}: MacroFlowMapProps) {
  const rangeTrackRef = useRef<HTMLDivElement | null>(null);
  const [macroScopeOptions, setMacroScopeOptions] = useState<MacroScopeOption[]>(() => readSyncedMacroScopeOptions());
  const [rangeStartDate, setRangeStartDate] = useState(FLOW_DEFAULT_START_DATE);
  const [rangeEndDate, setRangeEndDate] = useState(FLOW_END_DATE);
  const [calendarTarget, setCalendarTarget] = useState<RangeHandle>('end');
  const [dragRangeHandle, setDragRangeHandle] = useState<RangeHandle | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(FLOW_EVENT_DATE.slice(0, 7));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [macroScope, setMacroScope] = useState<string>(MACRO_ALL_SCOPE_ID);
  const [macroScopeMenuOpen, setMacroScopeMenuOpen] = useState(false);
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
  const [macroQuoteCache, setMacroQuoteCache] = useState<Record<string, MacroQuote | null>>({});
  const [sparklineCache, setSparklineCache] = useState<Record<string, Candle[]>>({});
  const basketDbImportInputRef = useRef<HTMLInputElement | null>(null);
  const [basketEditor, setBasketEditor] = useState<BasketEditorState | null>(null);
  const [basketDbImportDecision, setBasketDbImportDecision] = useState<MacroImportDecisionState | null>(null);
  const [basketDbExportMenuOpen, setBasketDbExportMenuOpen] = useState(false);

  const selectedDate = rangeEndDate;
  const timelineStartIndex = clamp(getTimelineDateOffset(rangeStartDate), 0, getTotalRangeDays());
  const timelineEndIndex = clamp(getTimelineDateOffset(rangeEndDate), 0, getTotalRangeDays());
  const rangeStartIndex = clamp(getDateOffset(rangeStartDate), 0, getTotalRangeDays());
  const rangeEndIndex = clamp(getDateOffset(rangeEndDate), 0, getTotalRangeDays());
  const activeWindowDays = getRangeWindowDays(rangeStartDate, rangeEndDate);
  const cumulativeDays = activeWindowDays;
  const rangeStartPct = getRangeProgressPct(rangeStartDate);
  const rangeEndPct = getRangeProgressPct(rangeEndDate);
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
  const baskets = useMemo(() => readValueChainBaskets(macroScope, macroScopeOptions), [macroScope, macroScopeOptions]);
  const sectorEtfDefs = useMemo(
    () => (isSemiconductorScope(macroScope, macroScopeOptions, baskets) ? SEMICONDUCTOR_SECTOR_ETF_DEFS : MACRO_SECTOR_ETF_DEFS),
    [baskets, macroScope, macroScopeOptions],
  );
  const macroQuoteSymbols = useMemo(() => Array.from(new Set([
    ...REGIONAL_MARKET_DEFS.map((region) => normalizeSymbol(region.symbol)),
    ...sectorEtfDefs.map((item) => normalizeSymbol(item.symbol)),
    ...baskets.flatMap((basket) => basket.stocks.map((stock) => normalizeSymbol(stock.symbol))),
  ].filter(Boolean))), [baskets, sectorEtfDefs]);
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
    if (!macroScopeMenuOpen) return undefined;
    const close = () => setMacroScopeMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [macroScopeMenuOpen]);

  useEffect(() => {
    if (!basketDbExportMenuOpen) return undefined;
    const close = () => setBasketDbExportMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [basketDbExportMenuOpen]);

  useEffect(() => {
    if (!basketEditor && !basketDbImportDecision) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setBasketEditor(null);
      setBasketDbImportDecision(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [basketDbImportDecision, basketEditor]);

  useEffect(() => {
    if (!macroQuoteSignature) return undefined;
    let cancelled = false;

    const loadQuotes = async () => {
      try {
        const nextQuotes: Record<string, MacroQuote | null> = {};
        const batchSize = 40;
        for (let index = 0; index < macroQuoteSymbols.length; index += batchSize) {
          const batch = macroQuoteSymbols.slice(index, index + batchSize);
          const response = await fetch('/api/moomoo/quotes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols: batch }),
          });
          const data = await response.json();
          if (!response.ok || !data.success || !data.quotes) {
            throw new Error(data.error || 'quotes fetch failed');
          }
          const resolvedSymbols = new Set<string>();
          Object.entries(data.quotes as Record<string, MacroQuoteResult>).forEach(([key, quote]) => {
            const requestKey = normalizeSymbol(String(key));
            const quoteKey = normalizeSymbol(String(quote.symbol || ''));
            const normalized = batch.includes(quoteKey) ? quoteKey : requestKey || quoteKey;
            if (!normalized) return;
            resolvedSymbols.add(normalized);
            nextQuotes[normalized] = parseMacroQuoteResult(quote, normalized);
          });
          batch.forEach((symbol) => {
            if (!resolvedSymbols.has(symbol)) nextQuotes[symbol] = null;
          });
        }
        if (!cancelled) {
          setMacroQuoteCache((current) => ({ ...current, ...nextQuotes }));
        }
      } catch {
        if (!cancelled) {
          setMacroQuoteCache((current) => current);
        }
      }
    };

    void loadQuotes();
    const interval = window.setInterval(loadQuotes, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [macroQuoteSignature, macroQuoteSymbols]);

  useEffect(() => {
    setRegionalOrder((current) => {
      const knownIds = new Set(REGIONAL_MARKET_DEFS.map((region) => region.id));
      const preserved = current.filter((id) => knownIds.has(id));
      const additions = REGIONAL_MARKET_DEFS.map((region) => region.id).filter((id) => !preserved.includes(id));
      return [...preserved, ...additions];
    });
  }, []);

  const metrics = useMemo<{
    baskets: BasketMetric[];
    sectors: SectorMetric[];
    stocks: StockMetric[];
  }>(() => {
    const isSingleDayWindow = rangeStartIndex === rangeEndIndex;
    const initialBasketMetrics = baskets.map((basket, basketIndex): BasketMetric => {
      const parentSectorName = getBasketParentSectorName(basket);
      const parentSectorId = getBasketParentSectorId(basket);
      const stockInputs = basket.stocks.map((stock) => {
        const live = quoteMap.get(normalizeSymbol(stock.symbol));
        const hasLiveQuote = Boolean(live);
        const baseChange = live?.changePct ?? 0;
        const marketCap = live?.marketCap ?? stock.marketCap;
        const changePct = hasLiveQuote
          ? isSingleDayWindow
            ? baseChange
            : createLayerReturnPct(baseChange, stock.symbol, rangeStartIndex, rangeEndIndex, 'stock')
          : 0;
        const flowRate = createFlowRate(changePct, stock.symbol, rangeStartIndex, rangeEndIndex);
        const nodeVolume = createNodeVolume(marketCap, flowRate);
        const volumeMultiplier = createVolumeMultiplier(stock.symbol, rangeStartIndex, rangeEndIndex);
        const momentum = createMomentum(changePct, stock.symbol, rangeStartIndex, rangeEndIndex);
        return {
          stock,
          hasLiveQuote,
          price: live?.price ?? null,
          marketCap,
          changePct,
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
      const basketChangePct = dataCoverage > 0
        ? isSingleDayWindow
          ? weightedStockChange
          : createLayerReturnPct(weightedStockChange, basket.id, rangeStartIndex, rangeEndIndex, 'basket')
        : 0;
      const basketFlowRate = dataCoverage > 0 ? createFlowRate(basketChangePct, basket.id, rangeStartIndex, rangeEndIndex) : 0;
      const nodeVolume = createNodeVolume(baseVolume, basketFlowRate);
      const stockMetrics = stockInputs.map(({ stock, hasLiveQuote, price, marketCap, changePct, nodeVolume: stockNodeVolume, volumeMultiplier, momentum }): StockMetric => {
        const alpha = hasLiveQuote ? changePct - basketChangePct : 0;
        const rawScore = hasLiveQuote
          ? Math.max(0.01, Math.abs(changePct)) * Math.sqrt(Math.max(1, stockNodeVolume)) * volumeMultiplier * Math.max(0.16, momentum)
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

    const sectorsByName = new Map<string, SectorMetric>();
    initialBasketMetrics.forEach((basket) => {
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
    const basketMetrics = initialBasketMetrics.map((basket): BasketMetric => {
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
  }, [baskets, quoteMap, rangeEndIndex, rangeStartIndex]);

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

  const orderedBaskets = useMemo(() => (
    applyMetricSort<BasketMetric>(filteredMetrics.baskets, sortState.baskets, (basket) => basket.score)
  ), [filteredMetrics.baskets, sortState.baskets]);

  const basketRank = useMemo(() => {
    return new Map(orderedBaskets.map((basket, index) => [basket.id, index]));
  }, [orderedBaskets]);

  const orderedSectors = useMemo(() => {
    if (sortState.sectors) {
      return applyMetricSort<SectorMetric>(filteredMetrics.sectors, sortState.sectors, (sector) => sector.score);
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
      return applyMetricSort<StockMetric>(filteredMetrics.stocks, sortState.stocks, (stock) => stock.score);
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
      return applyMetricSort<StockMetric>(scopedStocks, sortState.stocks, (stock) => stock.score);
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
    const symbols = Array.from(new Set([activeSymbol, ...visibleStocks.slice(0, 6).map((stock) => stock.symbol)].map(normalizeSymbol).filter(Boolean)));
    onChartSymbolsChange(symbols);
  }, [activeSymbol, onChartSymbolsChange, visibleStocks]);

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
    const isSingleDayWindow = rangeStartIndex === rangeEndIndex;
    return sectorEtfDefs.map((item) => {
      const live = quoteMap.get(normalizeSymbol(item.symbol));
      const hasLiveQuote = Boolean(live);
      const baseChange = live?.changePct ?? 0;
      const changePct = hasLiveQuote
        ? isSingleDayWindow
          ? baseChange
          : createLayerReturnPct(baseChange, item.symbol, rangeStartIndex, rangeEndIndex, 'sector')
        : 0;
      return {
        id: item.id,
        label: item.label,
        displaySymbol: item.displaySymbol,
        symbol: item.symbol,
        price: live?.price ?? null,
        changePct,
        hasLiveQuote,
        nodeVolume: hasLiveQuote
          ? createNodeVolume(item.baseVolume, createFlowRate(changePct, item.symbol, rangeStartIndex, rangeEndIndex))
          : 0,
      };
    });
  }, [quoteMap, rangeEndIndex, rangeStartIndex, sectorEtfDefs]);
  const regionalRows = useMemo<RegionalMarketMetric[]>(() => {
    const isSingleDayWindow = rangeStartIndex === rangeEndIndex;
    const definitionMap = new Map(REGIONAL_MARKET_DEFS.map((region) => [region.id, region]));
    return regionalOrder
      .map((id) => definitionMap.get(id))
      .filter((region): region is typeof REGIONAL_MARKET_DEFS[number] => Boolean(region))
      .map((region) => {
        const live = quoteMap.get(normalizeSymbol(region.symbol));
        const hasLiveQuote = Boolean(live);
        const baseChange = live?.changePct ?? 0;
        const changePct = hasLiveQuote
          ? isSingleDayWindow
            ? baseChange
            : createLayerReturnPct(baseChange, region.symbol, rangeStartIndex, rangeEndIndex, 'sector')
          : 0;
        return {
          id: region.id,
          label: REGIONAL_LABELS[region.id] || region.label,
          displaySymbol: region.displaySymbol,
          symbol: region.symbol,
          price: live?.price ?? null,
          changePct,
          hasLiveQuote,
          nodeVolume: hasLiveQuote
            ? createNodeVolume(region.baseVolume, createFlowRate(changePct, region.symbol, rangeStartIndex, rangeEndIndex))
            : 0,
        };
      });
  }, [quoteMap, rangeEndIndex, rangeStartIndex, regionalOrder]);
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
          label: `Alpha ${formatPctMaybe(stock.alpha, stock.hasLiveQuote)} x Volume ${formatFlow(stock.nodeVolume)} x Momentum ${stock.momentum.toFixed(2)}`,
        });
      });
    });
    return links;
  }, [flowBaskets, selectedBasketId, selectedSectorId, visibleStockKeys]);
  const sparklineSymbols = useMemo(() => Array.from(new Set([
    ...sectorEtfRows.map((item) => item.symbol),
    ...regionalRows.map((region) => region.symbol),
    ...flowBaskets.map((basket) => basket.stockMetrics[0]?.symbol || basket.stocks[0]?.symbol || ''),
    ...flowStocks.map((stock) => stock.symbol),
    ...orderedSectors.flatMap((sector) => sector.baskets.flatMap((basket) => basket.stockMetrics.map((stock) => stock.symbol))),
  ].map(normalizeSymbol).filter(Boolean))), [flowBaskets, flowStocks, orderedSectors, regionalRows, sectorEtfRows]);
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
    const missingSymbols = sparklineSymbols.filter((symbol) => !Object.prototype.hasOwnProperty.call(sparklineCache, symbol));
    if (missingSymbols.length === 0) return undefined;
    let cancelled = false;

    const loadSparklines = async () => {
      const next: Record<string, Candle[]> = {};
      const batchSize = 6;
      for (let index = 0; index < missingSymbols.length; index += batchSize) {
        const batch = missingSymbols.slice(index, index + batchSize);
        const results = await Promise.all(batch.map(async (symbol) => {
          try {
            const response = await fetch('/api/moomoo/kline', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbol, timeframe: '1d', reqNum: 260 }),
            });
            const data = await response.json();
            const candles = Array.isArray(data.candles)
              ? (data.candles as Candle[]).filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
              : [];
            return [symbol, data.success ? candles : []] as const;
          } catch {
            return [symbol, []] as const;
          }
        }));
        results.forEach(([symbol, candles]) => {
          next[symbol] = candles;
        });
        if (cancelled) return;
      }
      if (!cancelled) {
        setSparklineCache((current) => ({ ...current, ...next }));
      }
    };

    void loadSparklines();
    return () => {
      cancelled = true;
    };
  }, [sparklineCache, sparklineSymbols]);

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

  const openBasketEditor = (group?: ValueChainGroup) => {
    const selectedSectorName = orderedSectors.find((sector) => sector.id === selectedSectorId)?.name;
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
  };

  const handleBasketDbImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const text = await file.text();
    const importedChain = parseValueChainJson(text) || parseValueChainCsv(text, editableBasketChain);
    if (!importedChain) return;
    setBasketDbImportDecision({
      chain: importedChain,
      importedAt: new Date().toISOString(),
      sourceName: file.name,
    });
    setBasketEditor(null);
  };

  const applyBasketDbImportDecision = (mode: 'replace-current' | 'new-history') => {
    if (!basketDbImportDecision) return;
    persistBasketDbChain(basketDbImportDecision.chain, mode);
    setBasketDbImportDecision(null);
  };

  const exportBasketDbJson = () => {
    downloadText('mooview-value-chain-template.json', 'application/json;charset=utf-8', JSON.stringify(editableBasketChain, null, 2));
    setBasketDbExportMenuOpen(false);
  };

  const exportBasketDbCsv = () => {
    downloadText('mooview-value-chain-template.csv', 'text/csv;charset=utf-8', createValueChainCsv(editableBasketChain));
    setBasketDbExportMenuOpen(false);
  };

  const exportBasketDbSpec = () => {
    downloadText('mooview-value-chain-template-spec.md', 'text/markdown;charset=utf-8', createTemplateSpec(editableBasketChain));
    setBasketDbExportMenuOpen(false);
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
    const safeDate = clampDateValue(nextDate);
    if (handle === 'start') {
      setRangeStartDate(safeDate <= rangeEndDate ? safeDate : rangeEndDate);
      return;
    }
    setRangeEndDate(safeDate >= rangeStartDate ? safeDate : rangeStartDate);
  };

  const updateRangeFromClientX = (clientX: number, handle: RangeHandle) => {
    const track = rangeTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    updateRangeDate(handle, dateFromOffset(Math.round(ratio * getTotalRangeDays())));
  };

  const moveDate = (direction: -1 | 1) => {
    const windowDays = Math.max(0, timelineEndIndex - timelineStartIndex);
    const nextStart = clamp(timelineStartIndex + direction, 0, getTotalRangeDays() - windowDays);
    setRangeStartDate(dateFromOffset(nextStart));
    setRangeEndDate(dateFromOffset(nextStart + windowDays));
  };

  const handleCalendarSelect = (date: string) => {
    updateRangeDate(calendarTarget, date);
    setCalendarOpen(false);
  };

  const resetFlowView = () => {
    setRangeStartDate(FLOW_DEFAULT_START_DATE);
    setRangeEndDate(FLOW_END_DATE);
    setSearchQuery('');
    setMacroScope(MACRO_ALL_SCOPE_ID);
    setSortState({ sectors: null, baskets: null, stocks: null });
    setSelectedSectorId(null);
    setSelectedBasketId(null);
    setSelectedStockKey(null);
  };

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
  }, [dragRangeHandle, rangeEndDate, rangeStartDate]);

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
                className="h-8 w-full bg-[#050505] border border-[#242424] px-2 text-left text-[11px] font-bold text-gray-100 outline-none transition hover:border-sky-500/70 focus:border-sky-500/70 flex items-center justify-between gap-2"
                aria-haspopup="listbox"
                aria-expanded={macroScopeMenuOpen}
                aria-label="マクロ資金フローの表示範囲"
                title={selectedMacroScopeOption?.detail}
              >
                <span className="min-w-0 truncate">{selectedMacroScopeOption?.label || 'マクロ全体'}</span>
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
          <div className="relative h-12 w-[520px] bg-[#050505] px-1.5 py-1.5">
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
              <span className="text-emerald-300">{activeWindowDays}D</span>
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
                const offset = Math.round(ratio * getTotalRangeDays());
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
                className="absolute top-[-1px] h-3.5 w-3.5 -translate-x-1/2 rounded-full border border-emerald-300 bg-[#050505]"
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
                className="absolute top-[-1px] h-3.5 w-3.5 -translate-x-1/2 rounded-full border border-emerald-300 bg-[#050505]"
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
                    const outOfRange = day.date < FLOW_MIN_DATE || day.date > FLOW_END_DATE;
                    return (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => handleCalendarSelect(day.date)}
                        disabled={outOfRange}
                        className={`h-7 transition ${
                          selectedStart || selectedEnd
                            ? 'bg-emerald-500 text-black font-bold'
                            : day.inMonth
                              ? 'text-gray-100 hover:bg-[#111111]'
                              : 'text-gray-600 hover:text-gray-300 hover:bg-[#111111]'
                        } ${outOfRange ? 'opacity-30 cursor-not-allowed' : ''}`}
                      >
                        {Number(day.date.slice(8, 10))}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
                    ? `${formatStockCode(stock.symbol)}  ${formatFlow(stock.marketCap)}`
                    : `${stock.name}  ${formatFlow(stock.marketCap)}`;
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
                      className={`w-full px-3 py-2 text-left transition ${selected ? 'bg-sky-950/20 ring-1 ring-inset ring-sky-700/60' : 'hover:bg-[#101010]'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={`min-w-0 truncate text-[11px] font-bold ${japanese ? '' : 'font-mono'} ${selected ? 'text-white' : 'text-gray-100'}`}>{index + 1}. {primary}</span>
                        <span className={`font-mono text-[10px] ${selected ? 'text-white' : !stock.hasLiveQuote ? 'text-gray-500' : stock.changePct >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{formatPctMaybe(stock.changePct, stock.hasLiveQuote)}</span>
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
                        title={`${item.label} / ${item.displaySymbol}\nPrice ${formatNodePrice(item.symbol, item.price)}\nChange ${formatPctMaybe(item.changePct, item.hasLiveQuote)}\nVolume ${formatFlow(item.nodeVolume)}`}
                        className={`absolute overflow-hidden border px-1 py-0.5 text-left transition ${
                          selected
                            ? 'text-white shadow-[0_0_14px_rgba(22,163,74,0.16)]'
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
                      ? `${formatStockCode(stock.symbol)}  ${formatFlow(stock.marketCap)}`
                      : `${stock.name}  ${formatFlow(stock.marketCap)}`;
                    return (
                      <button
                        key={`flow-stock-${stock.basketId}-${stock.symbol}`}
                        type="button"
                        onClick={() => {
                          setActiveSymbol(stock.symbol);
                          setSelectedStockKey(stockKey);
                          setSelectedSectorId(stock.sector);
                          setSelectedBasketId(stock.basketId);
                        }}
                        onDoubleClick={() => openChartForStock(stock)}
                        title={`${stock.symbol} ${stock.name}\nVol ${formatFlow(stock.nodeVolume)}\nFlow ${formatFlow(stock.flowValue)}\nAlpha ${formatPctMaybe(stock.alpha, stock.hasLiveQuote)}\nMomentum ${stock.momentum.toFixed(2)}`}
                        className={`absolute overflow-hidden border px-1 py-0.5 text-left transition ${
                          selected
                            ? 'text-white shadow-[0_0_14px_rgba(22,163,74,0.22)]'
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
                          changeText={formatPctMaybe(stock.changePct, stock.hasLiveQuote)}
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
                </div>
                <div className="flex-1 min-h-0 bg-[#090909]">
                  {activeSymbol ? (
                    renderTickerChart({
                      symbol: activeSymbol,
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
                    <button type="button" onClick={() => basketDbImportInputRef.current?.click()} className="h-7 w-7 inline-flex items-center justify-center border border-[#303030] bg-[#101010] text-gray-300 hover:bg-[#181818] hover:text-white" title="CSV/JSONインポート" aria-label="CSV/JSONインポート">
                      <Upload className="h-3.5 w-3.5" />
                    </button>
                    <div className="relative" onClick={(event) => event.stopPropagation()}>
                      <button type="button" onClick={() => setBasketDbExportMenuOpen((open) => !open)} className="h-7 w-7 inline-flex items-center justify-center border border-[#303030] bg-[#101010] text-gray-300 hover:bg-[#181818] hover:text-white" title="エクスポート" aria-label="エクスポート">
                        <FileDown className="h-3.5 w-3.5" />
                      </button>
                      {basketDbExportMenuOpen && (
                        <div className="absolute left-0 top-8 z-50 w-44 border border-[#303030] bg-[#080808] py-1 shadow-2xl">
                          <button type="button" onClick={exportBasketDbCsv} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[10px] text-gray-200 hover:bg-[#171717]">
                            <FileText className="h-3.5 w-3.5 text-emerald-300" />
                            CSVエクスポート
                          </button>
                          <button type="button" onClick={exportBasketDbJson} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[10px] text-gray-200 hover:bg-[#171717]">
                            <Database className="h-3.5 w-3.5 text-sky-300" />
                            JSONエクスポート
                          </button>
                          <button type="button" onClick={exportBasketDbSpec} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[10px] text-gray-200 hover:bg-[#171717]">
                            <FileDown className="h-3.5 w-3.5 text-gray-300" />
                            テンプレート仕様
                          </button>
                        </div>
                      )}
                    </div>
                    <input ref={basketDbImportInputRef} type="file" accept=".csv,.json,application/json,text/csv" className="hidden" onChange={handleBasketDbImportFile} />
                  </div>
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
          <div className="my-1 h-px w-7 bg-[#242424]" />
          <SidePanelButton mode="basket-db" activeMode={sidePanelMode} title="Basket Database" onClick={() => openPanel('basket-db')}>
            <ListTree className="w-4 h-4" />
          </SidePanelButton>
          <div className="mt-auto flex flex-col items-center gap-1 pb-1 text-gray-600">
            <Upload className="w-3.5 h-3.5" />
            <FileDown className="w-3.5 h-3.5" />
            <Layers3 className="w-3.5 h-3.5" />
          </div>
        </nav>
      </div>
    </main>
  );
}
