import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckSquare,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  FileDown,
  FileJson,
  FileSpreadsheet,
  PanelRightOpen,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { ChartPanel, TickerInfo, Timeframe } from '../types';

type SortMode = 'change' | 'marketCap';
type PeriodMode = 'day' | 'week';

interface Segment {
  id: string;
  name: string;
  parentId: string;
}

interface Stage {
  id: string;
  name: string;
  segments: Segment[];
}

interface Lane {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  lanes: Lane[];
}

interface ChainStock {
  symbol: string;
  name: string;
  market: string;
  marketCap: number;
  baseChangePct: number;
}

interface ValueGroup {
  id: string;
  categoryId: string;
  laneId: string;
  segmentId: string;
  name: string;
  stocks: ChainStock[];
}

interface ValueChainData {
  name: string;
  stages: Stage[];
  categories: Category[];
  groups: ValueGroup[];
}

interface ValueChainHistoryEntry {
  id: string;
  importedAt: string;
  chain: ValueChainData;
}

interface TickerStat extends TickerInfo {
  currentPrice: number | null;
  computedChange: number | null;
}

interface SymbolSearchCandidate {
  symbol: string;
  code: string;
  name: string;
  nameEn: string;
  market: string;
  category: string;
}

interface ValueChainMapProps {
  tickers: TickerStat[];
  chartState: ChartPanel;
  onChartStateChange: React.Dispatch<React.SetStateAction<ChartPanel>>;
  renderTickerChart: (options: {
    symbol: string;
    comparisonSymbols?: string[];
    onOpenIndicatorSettings?: () => void;
  }) => React.ReactNode;
  renderIndicatorSettings: (symbol: string) => React.ReactNode;
  onOpenTickerInChart: (symbol: string) => void;
  onAddSymbolsToWatchlist: (symbols: string[]) => void;
  onChartSymbolsChange: (symbols: string[]) => void;
}

type HeaderMenuTarget =
  | { type: 'stage'; id: string; label: string }
  | { type: 'segment'; id: string; label: string }
  | { type: 'category'; id: string; label: string }
  | { type: 'lane'; id: string; categoryId: string; label: string }
  | { type: 'group'; id: string; label: string };

type ContextMenu =
  | { x: number; y: number; target: HeaderMenuTarget }
  | { x: number; y: number; target: { type: 'stock'; groupId: string; symbol: string; label: string } }
  | { x: number; y: number; target: { type: 'empty-cell'; categoryId: string; laneId: string; segmentId: string; label: string } };

type NameEditModalState = {
  target: HeaderMenuTarget;
  value: string;
};

type StructureEditModalState =
  | { type: 'stage'; referenceStageId: string; position: 'before' | 'after'; value: string }
  | { type: 'segment'; stageId: string; afterSegmentId?: string; value: string }
  | { type: 'category'; referenceCategoryId: string; position: 'before' | 'after'; value: string }
  | { type: 'lane'; categoryId: string; afterLaneId?: string; value: string };

type StockEditModalState = {
  mode: 'add' | 'edit';
  groupId: string;
  originalSymbol?: string;
  symbol: string;
  name: string;
  market: string;
  loading: boolean;
  error: string | null;
};

type ConfirmModalState =
  | { type: 'stock'; groupId: string; symbol: string; label: string }
  | { type: 'selected-stocks'; groupId: string; symbols: string[]; label: string }
  | { type: 'group'; groupId: string; label: string }
  | { type: 'stage'; stageId: string; label: string }
  | { type: 'segment'; segmentId: string; label: string }
  | { type: 'category'; categoryId: string; label: string }
  | { type: 'lane'; categoryId: string; laneId: string; label: string };

type ImportDecisionModalState = {
  chain: ValueChainData;
  importedAt: string;
  sourceName: string;
};

const DEFAULT_VALUE_CHAIN: ValueChainData = {
  name: '半導体バリューチェーン',
  stages: [
    {
      id: 'design',
      name: '設計・開発',
      segments: [{ id: 'design-core', name: '設計', parentId: 'design' }],
    },
    {
      id: 'front',
      name: '前工程',
      segments: [
        { id: 'wafer', name: '準備\nウェーハ製造', parentId: 'front' },
        { id: 'mask', name: '準備\nフォトマスク製造', parentId: 'front' },
        { id: 'film', name: '成膜・洗浄', parentId: 'front' },
        { id: 'lithography', name: 'リソグラフィ', parentId: 'front' },
        { id: 'etching', name: 'エッチング', parentId: 'front' },
        { id: 'implant', name: '不純物導入', parentId: 'front' },
      ],
    },
    {
      id: 'back',
      name: '後工程',
      segments: [
        { id: 'package', name: '基板・材料', parentId: 'back' },
        { id: 'dicing', name: 'ダイシング', parentId: 'back' },
        { id: 'mounting', name: 'マウンティング', parentId: 'back' },
        { id: 'test', name: '検査', parentId: 'back' },
      ],
    },
    {
      id: 'trading',
      name: '商社',
      segments: [{ id: 'trading-house', name: '商社', parentId: 'trading' }],
    },
  ],
  categories: [
    {
      id: 'chipmaker',
      name: '半導体メーカー',
      lanes: [
        { id: 'global', name: '海外' },
        { id: 'jp', name: '日本' },
      ],
    },
    {
      id: 'materials',
      name: '部素材メーカー・材料供給',
      lanes: [
        { id: 'global', name: '海外' },
        { id: 'jp', name: '日本' },
      ],
    },
    {
      id: 'equipment',
      name: '検査・製造装置',
      lanes: [
        { id: 'global', name: '海外' },
        { id: 'jp', name: '日本' },
      ],
    },
  ],
  groups: [
    {
      id: 'g-fabless-global',
      categoryId: 'chipmaker',
      laneId: 'global',
      segmentId: 'design-core',
      name: 'ファブレス',
      stocks: [
        { symbol: 'NVDA', name: 'NVIDIA', market: 'US', marketCap: 3200000, baseChangePct: 4.8 },
        { symbol: 'AMD', name: 'AMD', market: 'US', marketCap: 260000, baseChangePct: 1.1 },
        { symbol: 'AVGO', name: 'Broadcom', market: 'US', marketCap: 690000, baseChangePct: 2.2 },
        { symbol: 'QCOM', name: 'Qualcomm', market: 'US', marketCap: 240000, baseChangePct: -0.7 },
      ],
    },
    {
      id: 'g-idm-global',
      categoryId: 'chipmaker',
      laneId: 'global',
      segmentId: 'design-core',
      name: '垂直統合型',
      stocks: [
        { symbol: 'INTC', name: 'Intel', market: 'US', marketCap: 135000, baseChangePct: -1.8 },
        { symbol: 'MU', name: 'Micron', market: 'US', marketCap: 155000, baseChangePct: 0.9 },
      ],
    },
    {
      id: 'g-foundry-global',
      categoryId: 'chipmaker',
      laneId: 'global',
      segmentId: 'wafer',
      name: 'ファウンドリ',
      stocks: [
        { symbol: 'TSM', name: 'TSMC', market: 'US', marketCap: 820000, baseChangePct: 1.7 },
        { symbol: 'UMC', name: 'UMC', market: 'US', marketCap: 19000, baseChangePct: -0.4 },
      ],
    },
    {
      id: 'g-idm-jp',
      categoryId: 'chipmaker',
      laneId: 'jp',
      segmentId: 'design-core',
      name: '日本IDM',
      stocks: [
        { symbol: 'JP.6723', name: 'ルネサス', market: 'JP', marketCap: 4200, baseChangePct: 2.6 },
        { symbol: 'JP.6501', name: '日立製作所', market: 'JP', marketCap: 9800, baseChangePct: 0.8 },
      ],
    },
    {
      id: 'g-mask-jp',
      categoryId: 'materials',
      laneId: 'jp',
      segmentId: 'mask',
      name: 'フォトマスク',
      stocks: [
        { symbol: 'JP.7911', name: 'TOPPAN', market: 'JP', marketCap: 980, baseChangePct: 3.4 },
        { symbol: 'JP.7912', name: '大日本印刷', market: 'JP', marketCap: 1120, baseChangePct: 1.4 },
      ],
    },
    {
      id: 'g-materials-global',
      categoryId: 'materials',
      laneId: 'global',
      segmentId: 'film',
      name: '高機能化学',
      stocks: [
        { symbol: 'AMAT', name: 'Applied Materials', market: 'US', marketCap: 180000, baseChangePct: 1.6 },
        { symbol: 'LRCX', name: 'Lam Research', market: 'US', marketCap: 125000, baseChangePct: -0.9 },
      ],
    },
    {
      id: 'g-wafer-jp',
      categoryId: 'materials',
      laneId: 'jp',
      segmentId: 'wafer',
      name: 'ウェーハ',
      stocks: [
        { symbol: 'JP.4063', name: '信越化学工業', market: 'JP', marketCap: 12200, baseChangePct: 1.9 },
        { symbol: 'JP.4043', name: 'トクヤマ', market: 'JP', marketCap: 210, baseChangePct: -1.2 },
      ],
    },
    {
      id: 'g-photoresist-jp',
      categoryId: 'materials',
      laneId: 'jp',
      segmentId: 'lithography',
      name: 'フォトレジスト',
      stocks: [
        { symbol: 'JP.4186', name: '東京応化工業', market: 'JP', marketCap: 620, baseChangePct: 2.8 },
        { symbol: 'JP.4005', name: '住友化学', market: 'JP', marketCap: 570, baseChangePct: -2.6 },
        { symbol: 'JP.4401', name: 'ADEKA', market: 'JP', marketCap: 330, baseChangePct: -0.8 },
      ],
    },
    {
      id: 'g-equipment-global',
      categoryId: 'equipment',
      laneId: 'global',
      segmentId: 'lithography',
      name: '露光装置',
      stocks: [
        { symbol: 'ASML', name: 'ASML', market: 'US', marketCap: 410000, baseChangePct: 0.5 },
        { symbol: 'KLAC', name: 'KLA', market: 'US', marketCap: 110000, baseChangePct: 1.2 },
      ],
    },
    {
      id: 'g-equipment-jp',
      categoryId: 'equipment',
      laneId: 'jp',
      segmentId: 'lithography',
      name: '製造装置',
      stocks: [
        { symbol: 'JP.8035', name: '東京エレクトロン', market: 'JP', marketCap: 14800, baseChangePct: 3.7 },
        { symbol: 'JP.6857', name: 'アドバンテスト', market: 'JP', marketCap: 5200, baseChangePct: -2.4 },
        { symbol: 'JP.7735', name: 'SCREEN', market: 'JP', marketCap: 1320, baseChangePct: -1.1 },
        { symbol: 'JP.6146', name: 'ディスコ', market: 'JP', marketCap: 6100, baseChangePct: 2.0 },
      ],
    },
    {
      id: 'g-test-jp',
      categoryId: 'equipment',
      laneId: 'jp',
      segmentId: 'test',
      name: '検査装置',
      stocks: [
        { symbol: 'JP.7729', name: '東京精密', market: 'JP', marketCap: 580, baseChangePct: 1.3 },
        { symbol: 'JP.6590', name: '芝浦メカトロニクス', market: 'JP', marketCap: 740, baseChangePct: -3.1 },
      ],
    },
    {
      id: 'g-trading-jp',
      categoryId: 'materials',
      laneId: 'jp',
      segmentId: 'trading-house',
      name: '半導体商社',
      stocks: [
        { symbol: 'JP.2768', name: '双日', market: 'JP', marketCap: 930, baseChangePct: 0.6 },
        { symbol: 'JP.8058', name: '三菱商事', market: 'JP', marketCap: 13100, baseChangePct: -0.5 },
      ],
    },
  ],
};

const STORAGE_KEY = 'mooview_value_chain_map_v1';
const CHAIN_HISTORY_STORAGE_KEY = 'mooview_value_chain_history_v1';
const ACTIVE_CHAIN_HISTORY_ID_STORAGE_KEY = 'mooview_value_chain_active_history_id';
const CHART_PANEL_WIDTH_STORAGE_KEY = 'mooview_value_chain_chart_panel_width';
const STOCK_FONT_SIZE_STORAGE_KEY = 'mooview_value_chain_stock_font_size';
const INDEX_GROUP_ID = 'g-index';
const INDEX_CATEGORY_ID = '__index-category';
const INDEX_LANE_ID = '__index-lane';
const INDEX_SEGMENT_ID = '__index-segment';
const HEADER_STAGE_ROW_HEIGHT = 52;
const HEADER_SEGMENT_ROW_HEIGHT = 40;
const DETAIL_PANEL_NAV_WIDTH = 44;
const DETAIL_PANEL_MIN_WIDTH = 360;
const DETAIL_PANEL_MAX_WIDTH = 860;
const CHART_TIMEFRAMES: Timeframe[] = ['1m', '3m', '5m', '10m', '30m', '1h', '4h', '1d', '1w', '1mo'];
const todayString = () => new Date().toISOString().slice(0, 10);

function createDefaultIndexGroup(): ValueGroup {
  return {
    id: INDEX_GROUP_ID,
    categoryId: INDEX_CATEGORY_ID,
    laneId: INDEX_LANE_ID,
    segmentId: INDEX_SEGMENT_ID,
    name: '指数',
    stocks: [
      { symbol: 'QQQ', name: 'QQQ', market: 'US', marketCap: 0, baseChangePct: 0 },
      { symbol: 'SPY', name: 'SPY', market: 'US', marketCap: 0, baseChangePct: 0 },
      { symbol: 'SOX', name: 'SOX', market: 'US', marketCap: 0, baseChangePct: 0 },
      { symbol: 'JP.1321', name: '日経225', market: 'JP', marketCap: 0, baseChangePct: 0 },
      { symbol: 'JP.200A', name: '200A', market: 'JP', marketCap: 0, baseChangePct: 0 },
      { symbol: 'JP.213A', name: '213A', market: 'JP', marketCap: 0, baseChangePct: 0 },
    ],
  };
}

function ensureIndexGroup(chain: ValueChainData): ValueChainData {
  const defaults = createDefaultIndexGroup();
  const groups = chain.groups.map((group) => {
    if (group.id !== INDEX_GROUP_ID) return group;
    return {
      ...defaults,
      ...group,
      categoryId: INDEX_CATEGORY_ID,
      laneId: INDEX_LANE_ID,
      segmentId: INDEX_SEGMENT_ID,
      name: group.name?.trim() || defaults.name,
      stocks: Array.isArray(group.stocks) ? group.stocks : defaults.stocks,
    };
  });
  if (groups.some((group) => group.id === INDEX_GROUP_ID)) {
    return { ...chain, groups };
  }
  return {
    ...chain,
    groups: [defaults, ...groups],
  };
}

function formatTimeframeLabel(timeframe: Timeframe): string {
  if (timeframe === '1mo') return '1月';
  if (timeframe === '1d') return '日';
  if (timeframe === '1w') return '週';
  return timeframe;
}

function createValueChainId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isLikelyTickerInput(value: string): boolean {
  const trimmed = value.trim();
  return /^[A-Za-z]{1,6}$/.test(trimmed)
    || /^[A-Za-z0-9._-]+\.(US|JP|HK|FX|BD)$/i.test(trimmed)
    || /^\.[A-Za-z0-9._-]+\.(US|JP)$/i.test(trimmed)
    || /^\d{3,5}[A-Za-z]?(\.T|\.JP)?$/i.test(trimmed);
}

function normalizeSymbol(symbol: string): string {
  const cleaned = symbol.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return '';
  const upper = cleaned.toUpperCase();
  if (upper.startsWith('US.')) return upper.slice(3);
  if (upper.endsWith('.US')) return upper.slice(0, -3);
  if (upper.startsWith('JP.')) return `JP.${upper.slice(3)}`;
  if (upper.endsWith('.JP')) return `JP.${upper.slice(0, -3)}`;
  if (upper.endsWith('.T')) return `JP.${upper.slice(0, -2)}`;
  if (/^\d{3,5}[A-Z]?$/.test(upper)) return `JP.${upper}`;
  return upper;
}

function findSegment(chain: ValueChainData, segmentId: string): Segment | null {
  for (const stage of chain.stages) {
    const segment = stage.segments.find((item) => item.id === segmentId);
    if (segment) return segment;
  }
  return null;
}

function findStage(chain: ValueChainData, segmentId: string): Stage | null {
  return chain.stages.find((stage) => stage.segments.some((segment) => segment.id === segmentId)) ?? null;
}

function shouldMergeStageHeader(stage: Stage): boolean {
  if (stage.segments.length !== 1) return false;
  const segmentName = stage.segments[0]?.name.trim() ?? '';
  return !segmentName || segmentName === stage.name.trim() || (stage.id === 'design' && segmentName === '設計');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function dateSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 9973;
  }
  return hash / 9973;
}

function previousBusinessDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}

function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function getHeatStyle(value: number): React.CSSProperties {
  const intensity = clamp(Math.abs(value) / 5, 0.08, 1);
  if (value > 0) {
    return {
      backgroundColor: `rgba(22, 163, 74, ${0.18 + intensity * 0.72})`,
      borderColor: `rgba(74, 222, 128, ${0.24 + intensity * 0.48})`,
    };
  }
  if (value < 0) {
    return {
      backgroundColor: `rgba(220, 38, 38, ${0.18 + intensity * 0.72})`,
      borderColor: `rgba(248, 113, 113, ${0.24 + intensity * 0.48})`,
    };
  }
  return {
    backgroundColor: 'rgba(31, 31, 31, 0.92)',
    borderColor: 'rgba(75, 85, 99, 0.52)',
  };
}

function escapeCsv(value: string | number): string {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
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

function createCsv(chain: ValueChainData): string {
  const headers = [
    'chainName',
    'stageId',
    'stageName',
    'segmentId',
    'segmentName',
    'categoryId',
    'categoryName',
    'laneId',
    'laneName',
    'groupId',
    'groupName',
    'symbol',
    'name',
    'market',
    'marketCap',
    'baseChangePct',
  ];
  const rows = chain.groups.flatMap((group) => {
    const category = chain.categories.find((item) => item.id === group.categoryId);
    const lane = category?.lanes.find((item) => item.id === group.laneId);
    const segment = findSegment(chain, group.segmentId);
    const stage = findStage(chain, group.segmentId);
    const stocks = group.stocks.length > 0
      ? group.stocks
      : [{ symbol: '', name: '', market: '', marketCap: 0, baseChangePct: 0 }];
    return stocks.map((stock) => [
      chain.name,
      stage?.id ?? '',
      stage?.name ?? '',
      segment?.id ?? group.segmentId,
      segment?.name.replace(/\n/g, ' / ') ?? (group.id === INDEX_GROUP_ID ? group.name : ''),
      category?.id ?? group.categoryId,
      category?.name ?? (group.id === INDEX_GROUP_ID ? group.name : ''),
      lane?.id ?? group.laneId,
      lane?.name ?? '',
      group.id,
      group.name,
      stock.symbol,
      stock.name,
      stock.market,
      stock.marketCap,
      stock.baseChangePct,
    ]);
  });
  return [
    headers.join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ].join('\r\n');
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

function importString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function parseImportedNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validateChainData(value: unknown): ValueChainData | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<ValueChainData>;
  if (!Array.isArray(source.stages) || !Array.isArray(source.categories) || !Array.isArray(source.groups)) {
    return null;
  }
  const stages: Stage[] = source.stages.map((stageValue, stageIndex) => {
    const stageSource = stageValue as Partial<Stage>;
    const stageId = importString(stageSource.id, `stage-${stageIndex + 1}`);
    const stageName = importString(stageSource.name, stageId);
    const rawSegments = Array.isArray(stageSource.segments) ? stageSource.segments : [];
    const segments = rawSegments.map((segmentValue, segmentIndex) => {
      const segmentSource = segmentValue as Partial<Segment>;
      return {
        id: importString(segmentSource.id, `${stageId}-segment-${segmentIndex + 1}`),
        name: importString(segmentSource.name, stageName),
        parentId: importString(segmentSource.parentId, stageId),
      };
    });
    return {
      id: stageId,
      name: stageName,
      segments: segments.length > 0
        ? segments
        : [{ id: `${stageId}-segment-1`, name: stageName, parentId: stageId }],
    };
  });
  const categories: Category[] = source.categories.map((categoryValue, categoryIndex) => {
    const categorySource = categoryValue as Partial<Category>;
    const categoryId = importString(categorySource.id, `category-${categoryIndex + 1}`);
    const categoryName = importString(categorySource.name, categoryId);
    const rawLanes = Array.isArray(categorySource.lanes) ? categorySource.lanes : [];
    const lanes = rawLanes.map((laneValue, laneIndex) => {
      const laneSource = laneValue as Partial<Lane>;
      return {
        id: importString(laneSource.id, `${categoryId}-lane-${laneIndex + 1}`),
        name: importString(laneSource.name, `${categoryName}-${laneIndex + 1}`),
      };
    });
    return {
      id: categoryId,
      name: categoryName,
      lanes: lanes.length > 0 ? lanes : [{ id: `${categoryId}-lane-1`, name: categoryName }],
    };
  });
  const groups: ValueGroup[] = source.groups.map((groupValue, groupIndex) => {
    const groupSource = groupValue as Partial<ValueGroup>;
    const groupId = importString(groupSource.id, `group-${groupIndex + 1}`);
    const rawStocks = Array.isArray(groupSource.stocks) ? groupSource.stocks : [];
    return {
      id: groupId,
      categoryId: importString(groupSource.categoryId, ''),
      laneId: importString(groupSource.laneId, ''),
      segmentId: importString(groupSource.segmentId, ''),
      name: importString(groupSource.name, groupId),
      stocks: rawStocks.map((stockValue, stockIndex) => {
        const stockSource = stockValue as Partial<ChainStock>;
        const symbol = importString(stockSource.symbol, `UNKNOWN-${stockIndex + 1}`);
        return {
          symbol: normalizeSymbol(symbol),
          name: importString(stockSource.name, symbol),
          market: importString(stockSource.market, symbol.startsWith('JP.') ? 'JP' : 'US'),
          marketCap: parseImportedNumber(stockSource.marketCap, 0),
          baseChangePct: parseImportedNumber(stockSource.baseChangePct, 0),
        };
      }).filter((stock) => stock.symbol && !stock.symbol.startsWith('UNKNOWN-')),
    };
  });
  return ensureIndexGroup({
    name: typeof source.name === 'string' && source.name.trim() ? source.name : 'インポート済みバリューチェーン',
    stages,
    categories,
    groups,
  });
}

function parseValueChainJson(text: string): ValueChainData | null {
  const trimmed = text.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return null;
  try {
    return validateChainData(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

function validateChainHistory(value: unknown): ValueChainHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entryValue, index) => {
    if (!entryValue || typeof entryValue !== 'object') return [];
    const source = entryValue as Partial<ValueChainHistoryEntry>;
    const chain = validateChainData(source.chain);
    if (!chain) return [];
    return [{
      id: importString(source.id, `history-${index + 1}`),
      importedAt: importString(source.importedAt, new Date().toISOString()),
      chain,
    }];
  });
}

function readStoredChainHistory(): ValueChainHistoryEntry[] {
  try {
    return validateChainHistory(JSON.parse(localStorage.getItem(CHAIN_HISTORY_STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

function readStoredActiveHistoryId(): string | null {
  const value = localStorage.getItem(ACTIVE_CHAIN_HISTORY_ID_STORAGE_KEY);
  return value && value.trim() ? value : null;
}

function createHistoryEntry(chain: ValueChainData, importedAt: string): ValueChainHistoryEntry {
  return {
    id: createValueChainId('chain-history'),
    importedAt,
    chain,
  };
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

function createTemplateSpec(chain: ValueChainData): string {
  return `# MooView バリューチェーンテンプレート仕様書

## 目的
AIまたは人間が調査した銘柄を、MooViewのバリューチェーンマップにそのまま読み込める形へ整理するための仕様です。

## JSON形式
- ルートは \`name\`, \`stages\`, \`categories\`, \`groups\` を持つオブジェクトです。
- \`stages[].segments[].id\` は横軸の小分類IDです。
- \`categories[].lanes[].id\` は縦軸カテゴリ内の属性IDです。
- \`groups[]\` は \`categoryId\`, \`laneId\`, \`segmentId\` を必ず持ち、交差セルに配置されます。
- \`groups[].stocks[]\` は \`symbol\`, \`name\`, \`market\`, \`marketCap\`, \`baseChangePct\` を持ちます。

## CSV形式
\`chainName,stageId,stageName,segmentId,segmentName,categoryId,categoryName,laneId,laneName,groupId,groupName,symbol,name,market,marketCap,baseChangePct\`

## 現在の軸
- バリューチェーン名: ${chain.name}
- 横軸: ${chain.stages.map((stage) => `${stage.name}（${stage.segments.map((segment) => segment.name.replace(/\n/g, '/')).join(', ')}）`).join(' / ')}
- 縦軸: ${chain.categories.map((category) => `${category.name}（${category.lanes.map((lane) => lane.name).join(', ')}）`).join(' / ')}

## AIへの作成指示例
対象セクターの主要企業を調査し、上記CSVまたはJSON形式で、横軸工程、縦軸カテゴリ、グループ名、銘柄コード、銘柄名、国/市場、概算時価総額、初期表示用の騰落率を出力してください。銘柄コードはMooViewで検索可能なコードを優先し、日本株は \`JP.8035\` の形式にしてください。
`;
}

export function ValueChainMap({
  tickers,
  chartState,
  onChartStateChange,
  renderTickerChart,
  renderIndicatorSettings,
  onOpenTickerInChart,
  onAddSymbolsToWatchlist,
  onChartSymbolsChange,
}: ValueChainMapProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panMovedRef = useRef(false);
  const previousTickerPricesRef = useRef<Record<string, number | null>>({});
  const tickerFlashTimeoutRef = useRef<number | null>(null);
  const [chain, setChain] = useState<ValueChainData>(() => {
    const history = readStoredChainHistory();
    const activeHistoryId = readStoredActiveHistoryId();
    const activeEntry = history.find((entry) => entry.id === activeHistoryId);
    if (activeEntry) return activeEntry.chain;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return ensureIndexGroup(DEFAULT_VALUE_CHAIN);
    try {
      return validateChainData(JSON.parse(saved)) ?? ensureIndexGroup(DEFAULT_VALUE_CHAIN);
    } catch {
      return ensureIndexGroup(DEFAULT_VALUE_CHAIN);
    }
  });
  const [chainHistory, setChainHistory] = useState<ValueChainHistoryEntry[]>(() => readStoredChainHistory());
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(() => {
    const savedActiveHistoryId = readStoredActiveHistoryId();
    const history = readStoredChainHistory();
    return history.some((entry) => entry.id === savedActiveHistoryId) ? savedActiveHistoryId : null;
  });
  const [sortMode, setSortMode] = useState<SortMode>('change');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('day');
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [chainMenuOpen, setChainMenuOpen] = useState(false);
  const [nameEditModal, setNameEditModal] = useState<NameEditModalState | null>(null);
  const [structureEditModal, setStructureEditModal] = useState<StructureEditModalState | null>(null);
  const [stockEditModal, setStockEditModal] = useState<StockEditModalState | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [importDecisionModal, setImportDecisionModal] = useState<ImportDecisionModalState | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);
  const [comparisonPanelOpen, setComparisonPanelOpen] = useState(false);
  const [chartSidebarOpen, setChartSidebarOpen] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState<'chart' | 'indicators'>('chart');
  const [chartSidebarWidth, setChartSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem(CHART_PANEL_WIDTH_STORAGE_KEY));
    return Number.isFinite(saved)
      ? clamp(saved, DETAIL_PANEL_MIN_WIDTH, DETAIL_PANEL_MAX_WIDTH)
      : 460;
  });
  const [stockFontSize, setStockFontSize] = useState(() => {
    const saved = Number(localStorage.getItem(STOCK_FONT_SIZE_STORAGE_KEY));
    return Number.isFinite(saved) ? clamp(saved, 8, 16) : 10;
  });
  const [tickerFlash, setTickerFlash] = useState<Record<string, 'up' | 'down'>>({});
  const [importBackup, setImportBackup] = useState<ValueChainData | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ mouseX: 0, mouseY: 0, x: 0, y: 0 });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chain));
    if (activeHistoryId) {
      setChainHistory((current) => current.map((entry) => (
        entry.id === activeHistoryId ? { ...entry, chain } : entry
      )));
    }
  }, [activeHistoryId, chain]);

  useEffect(() => {
    localStorage.setItem(CHAIN_HISTORY_STORAGE_KEY, JSON.stringify(chainHistory));
  }, [chainHistory]);

  useEffect(() => {
    if (activeHistoryId) {
      localStorage.setItem(ACTIVE_CHAIN_HISTORY_ID_STORAGE_KEY, activeHistoryId);
    } else {
      localStorage.removeItem(ACTIVE_CHAIN_HISTORY_ID_STORAGE_KEY);
    }
  }, [activeHistoryId]);

  useEffect(() => {
    localStorage.setItem(CHART_PANEL_WIDTH_STORAGE_KEY, String(chartSidebarWidth));
  }, [chartSidebarWidth]);

  useEffect(() => {
    localStorage.setItem(STOCK_FONT_SIZE_STORAGE_KEY, String(stockFontSize));
  }, [stockFontSize]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const preventBrowserZoom = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };
    element.addEventListener('wheel', preventBrowserZoom, { passive: false });
    return () => element.removeEventListener('wheel', preventBrowserZoom);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const close = () => setExportMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [exportMenuOpen]);

  useEffect(() => {
    if (!chainMenuOpen) return;
    const close = () => setChainMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [chainMenuOpen]);

  useEffect(() => {
    if (!nameEditModal && !structureEditModal && !stockEditModal && !confirmModal && !importDecisionModal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setNameEditModal(null);
      setStructureEditModal(null);
      setStockEditModal(null);
      setConfirmModal(null);
      setImportDecisionModal(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmModal, importDecisionModal, nameEditModal, stockEditModal, structureEditModal]);

  useEffect(() => {
    if (!chartSidebarOpen && !detailSymbol && !comparisonPanelOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDetailSymbol(null);
        setComparisonPanelOpen(false);
        setChartSidebarOpen(false);
        setSidePanelMode('chart');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chartSidebarOpen, comparisonPanelOpen, detailSymbol]);

  const openDatePicker = () => {
    const input = dateInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!input) return;
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
      } else {
        input.focus();
      }
    } catch {
      input.focus();
    }
  };

  const displayDate = previousBusinessDate(selectedDate);
  const isToday = selectedDate === todayString();
  const tickerStats = useMemo(() => {
    return new Map(tickers.map((ticker) => [ticker.symbol.toUpperCase(), ticker]));
  }, [tickers]);

  useEffect(() => {
    if (!isToday) {
      previousTickerPricesRef.current = {};
      setTickerFlash({});
      return;
    }

    const nextValues: Record<string, number | null> = {};
    const nextFlash: Record<string, 'up' | 'down'> = {};
    tickers.forEach((ticker) => {
      const symbol = ticker.symbol.toUpperCase();
      nextValues[symbol] = ticker.currentPrice;
      const previousPrice = previousTickerPricesRef.current[symbol];
      if (
        previousPrice !== undefined
        && previousPrice !== null
        && ticker.currentPrice !== null
        && ticker.currentPrice !== previousPrice
      ) {
        nextFlash[symbol] = ticker.currentPrice > previousPrice ? 'up' : 'down';
      }
    });
    previousTickerPricesRef.current = nextValues;

    if (Object.keys(nextFlash).length === 0) return;
    setTickerFlash((current) => ({ ...current, ...nextFlash }));
    if (tickerFlashTimeoutRef.current !== null) {
      window.clearTimeout(tickerFlashTimeoutRef.current);
    }
    tickerFlashTimeoutRef.current = window.setTimeout(() => {
      setTickerFlash({});
      tickerFlashTimeoutRef.current = null;
    }, 900);
  }, [isToday, tickers]);

  const segments = useMemo(() => chain.stages.flatMap((stage) => stage.segments), [chain.stages]);
  const groupsByCell = useMemo(() => {
    const map = new Map<string, ValueGroup[]>();
    chain.groups.forEach((group) => {
      const key = `${group.categoryId}|${group.laneId}|${group.segmentId}`;
      const groups = map.get(key) ?? [];
      groups.push(group);
      map.set(key, groups);
    });
    return map;
  }, [chain.groups]);
  const indexGroup = useMemo(() => (
    chain.groups.find((group) => group.id === INDEX_GROUP_ID) ?? createDefaultIndexGroup()
  ), [chain.groups]);
  const selectedSet = useMemo(() => new Set(selectedSymbols), [selectedSymbols]);
  const indexStockRowCount = Math.max(2, Math.ceil(indexGroup.stocks.length / 3));
  const indexStockRowHeight = Math.max(35, stockFontSize * 2 + 16);
  const stageHeaderHeight = HEADER_STAGE_ROW_HEIGHT;
  const segmentHeaderHeight = HEADER_SEGMENT_ROW_HEIGHT + Math.max(0, indexStockRowCount - 2) * indexStockRowHeight;
  const totalHeaderHeight = stageHeaderHeight + segmentHeaderHeight;

  const resolveChange = (stock: ChainStock): number => {
    const live = tickerStats.get(stock.symbol.toUpperCase());
    if (isToday && periodMode === 'day' && live?.computedChange !== null && live?.computedChange !== undefined) {
      return live.computedChange;
    }
    const seed = dateSeed(`${stock.symbol}-${displayDate}-${periodMode}`);
    const drift = (seed - 0.5) * (periodMode === 'week' ? 4.4 : 2.2);
    return clamp(stock.baseChangePct + drift, -9.99, 9.99);
  };

  const sortedStocks = (stocks: ChainStock[]) => {
    return [...stocks].sort((first, second) => {
      if (sortMode === 'marketCap') return second.marketCap - first.marketCap;
      return resolveChange(second) - resolveChange(first);
    });
  };

  const updateGroupName = (groupId: string) => {
    const group = chain.groups.find((item) => item.id === groupId);
    if (!group) return;
    setNameEditModal({
      target: { type: 'group', id: groupId, label: group.name },
      value: group.name,
    });
  };

  const updateHeaderName = (target: HeaderMenuTarget) => {
    setNameEditModal({
      target,
      value: target.label,
    });
  };

  const applyNameEdit = (target: HeaderMenuTarget, rawName: string) => {
    const nextName = rawName.trim();
    if (!nextName) {
      setNameEditModal(null);
      return;
    }
    setChain((current) => {
      if (target.type === 'stage') {
        return {
          ...current,
          stages: current.stages.map((stage) => stage.id === target.id ? { ...stage, name: nextName } : stage),
        };
      }
      if (target.type === 'segment') {
        return {
          ...current,
          stages: current.stages.map((stage) => ({
            ...stage,
            segments: stage.segments.map((segment) => segment.id === target.id ? { ...segment, name: nextName } : segment),
          })),
        };
      }
      if (target.type === 'category') {
        return {
          ...current,
          categories: current.categories.map((category) => category.id === target.id ? { ...category, name: nextName } : category),
        };
      }
      if (target.type === 'lane') {
        return {
          ...current,
          categories: current.categories.map((category) => (
            category.id === target.categoryId
              ? {
                  ...category,
                  lanes: category.lanes.map((lane) => lane.id === target.id ? { ...lane, name: nextName } : lane),
                }
              : category
          )),
        };
      }
      return {
        ...current,
        groups: current.groups.map((group) => group.id === target.id ? { ...group, name: nextName } : group),
      };
    });
    setNameEditModal(null);
  };

  const openStockAddModal = (groupId: string, initialSymbol = '') => {
    setStockEditModal({
      mode: 'add',
      groupId,
      symbol: initialSymbol,
      name: '',
      market: initialSymbol.startsWith('JP.') ? 'JP' : 'US',
      loading: false,
      error: null,
    });
  };

  const openStockEditModal = (groupId: string, symbol: string) => {
    const group = chain.groups.find((item) => item.id === groupId);
    const stock = group?.stocks.find((item) => item.symbol === symbol);
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

  const resolveStockInput = async (rawSymbol: string, rawName: string, rawMarket: string): Promise<ChainStock> => {
    const cleanSymbolInput = rawSymbol.trim();
    const cleanNameInput = rawName.trim();
    const symbolLooksLikeCode = isLikelyTickerInput(cleanSymbolInput);
    let symbol = symbolLooksLikeCode ? normalizeSymbol(cleanSymbolInput) : '';
    let name = cleanNameInput;
    let market = rawMarket.trim();
    let candidate: SymbolSearchCandidate | null = null;
    const query = cleanNameInput || cleanSymbolInput;
    const liveBeforeSearch = symbol ? tickerStats.get(symbol.toUpperCase()) : null;

    if (query && (!symbol || !name || !liveBeforeSearch)) {
      candidate = await searchMoomooCandidate(query);
      const candidateSymbol = candidate ? normalizeSymbol(candidate.symbol || candidate.code || '') : '';
      if (candidateSymbol && (!symbol || !liveBeforeSearch || !symbolLooksLikeCode)) {
        symbol = candidateSymbol;
      }
      if (!name && candidate) {
        name = candidate.name || candidate.nameEn || candidate.code || candidateSymbol;
      }
      if (!market && candidate?.market) {
        market = candidate.market;
      }
    }

    if (!symbol) {
      throw new Error('銘柄コード、または検索できる銘柄名を入力してください。');
    }

    const live = tickerStats.get(symbol.toUpperCase());
    return {
      symbol,
      name: name || live?.name || symbol,
      market: market || (symbol.startsWith('JP.') ? 'JP' : 'US'),
      marketCap: 0,
      baseChangePct: live?.computedChange ?? 0,
    };
  };

  const submitStockEdit = async () => {
    if (!stockEditModal || stockEditModal.loading) return;
    const modal = stockEditModal;
    setStockEditModal({ ...modal, loading: true, error: null });
    try {
      const stock = await resolveStockInput(modal.symbol, modal.name, modal.market);
      setChain((current) => ({
        ...current,
        groups: current.groups.map((group) => {
          if (group.id !== modal.groupId) return group;
          const nextStocks = modal.mode === 'edit'
            ? group.stocks.map((item) => item.symbol === modal.originalSymbol ? stock : item)
            : [...group.stocks.filter((item) => item.symbol !== stock.symbol), stock];
          return { ...group, stocks: nextStocks };
        }),
      }));
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
    setStockEditModal({ ...modal, loading: true, error: null });
    try {
      const stock = await resolveStockInput(modal.symbol, modal.name, modal.market);
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

  const ensureGroupForCell = (categoryId: string, laneId: string, segmentId: string): string => {
    const existingGroup = chain.groups.find((group) => (
      group.categoryId === categoryId &&
      group.laneId === laneId &&
      group.segmentId === segmentId
    ));
    if (existingGroup) return existingGroup.id;

    const category = chain.categories.find((item) => item.id === categoryId);
    const lane = category?.lanes.find((item) => item.id === laneId);
    const segment = findSegment(chain, segmentId);
    const stage = findStage(chain, segmentId);
    const groupId = `group-${categoryId}-${laneId}-${segmentId}-${Date.now()}`;
    const groupName = `${segment?.name.replace(/\n/g, ' / ') ?? stage?.name ?? '工程'} × ${category?.name ?? 'カテゴリ'} × ${lane?.name ?? '属性'}`;

    setChain((current) => ({
      ...current,
      groups: [
        ...current.groups,
        {
          id: groupId,
          categoryId,
          laneId,
          segmentId,
          name: groupName,
          stocks: [],
        },
      ],
    }));
    return groupId;
  };

  const addStockToCell = (categoryId: string, laneId: string, segmentId: string) => {
    const groupId = ensureGroupForCell(categoryId, laneId, segmentId);
    openStockAddModal(groupId);
  };

  const removeStockFromGroup = (groupId: string, symbol: string) => {
    setChain((current) => ({
      ...current,
      groups: current.groups.map((group) => (
        group.id === groupId
          ? { ...group, stocks: group.stocks.filter((stock) => stock.symbol !== symbol) }
          : group
      )),
    }));
    setSelectedSymbols((current) => current.filter((item) => item !== symbol));
  };

  const removeStocksFromGroup = (groupId: string, symbols: string[]) => {
    const symbolSet = new Set(symbols);
    if (symbolSet.size === 0) return;
    setChain((current) => ({
      ...current,
      groups: current.groups.map((group) => (
        group.id === groupId
          ? { ...group, stocks: group.stocks.filter((stock) => !symbolSet.has(stock.symbol)) }
          : group
      )),
    }));
    setSelectedSymbols((current) => current.filter((symbol) => !symbolSet.has(symbol)));
  };

  const removeGroup = (groupId: string) => {
    if (groupId === INDEX_GROUP_ID) return;
    const removedSymbols = chain.groups.find((group) => group.id === groupId)?.stocks.map((stock) => stock.symbol) ?? [];
    setChain((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== groupId),
    }));
    if (removedSymbols.length > 0) {
      setSelectedSymbols((current) => current.filter((symbol) => !removedSymbols.includes(symbol)));
    }
  };

  const addStage = (referenceStageId: string, name: string, position: 'before' | 'after') => {
    const stageName = name.trim();
    if (!stageName) return;
    setChain((current) => {
      const nextStageId = createValueChainId('stage');
      const nextStage: Stage = {
        id: nextStageId,
        name: stageName,
        segments: [{
          id: createValueChainId('segment'),
          name: stageName,
          parentId: nextStageId,
        }],
      };
      const referenceIndex = current.stages.findIndex((stage) => stage.id === referenceStageId);
      const insertIndex = referenceIndex < 0
        ? current.stages.length
        : position === 'before'
          ? referenceIndex
          : referenceIndex + 1;
      const nextStages = [...current.stages];
      nextStages.splice(insertIndex, 0, nextStage);
      return { ...current, stages: nextStages };
    });
  };

  const addSegment = (stageId: string, name: string, afterSegmentId?: string) => {
    const segmentName = name.trim();
    if (!segmentName) return;
    setChain((current) => ({
      ...current,
      stages: current.stages.map((stage) => {
        if (stage.id !== stageId) return stage;
        const nextSegment: Segment = {
          id: createValueChainId('segment'),
          name: segmentName,
          parentId: stage.id,
        };
        if (!afterSegmentId) return { ...stage, segments: [...stage.segments, nextSegment] };
        const insertIndex = stage.segments.findIndex((segment) => segment.id === afterSegmentId);
        const nextSegments = [...stage.segments];
        nextSegments.splice(insertIndex >= 0 ? insertIndex + 1 : nextSegments.length, 0, nextSegment);
        return { ...stage, segments: nextSegments };
      }),
    }));
  };

  const removeSegment = (segmentId: string) => {
    setChain((current) => {
      const totalSegments = current.stages.reduce((sum, stage) => sum + stage.segments.length, 0);
      if (totalSegments <= 1) return current;
      return {
        ...current,
        stages: current.stages
          .map((stage) => ({
            ...stage,
            segments: stage.segments.filter((segment) => segment.id !== segmentId),
          }))
          .filter((stage) => stage.segments.length > 0),
        groups: current.groups.filter((group) => group.segmentId !== segmentId),
      };
    });
  };

  const removeStage = (stageId: string) => {
    setChain((current) => {
      const stage = current.stages.find((item) => item.id === stageId);
      if (!stage) return current;
      const totalSegments = current.stages.reduce((sum, item) => sum + item.segments.length, 0);
      if (totalSegments <= stage.segments.length) return current;
      const removedSegmentIds = new Set(stage.segments.map((segment) => segment.id));
      return {
        ...current,
        stages: current.stages.filter((item) => item.id !== stageId),
        groups: current.groups.filter((group) => !removedSegmentIds.has(group.segmentId)),
      };
    });
  };

  const addCategory = (referenceCategoryId: string, name: string, position: 'before' | 'after') => {
    const categoryName = name.trim();
    if (!categoryName) return;
    setChain((current) => {
      const nextCategory: Category = {
        id: createValueChainId('category'),
        name: categoryName,
        lanes: [{ id: createValueChainId('lane'), name: '未分類' }],
      };
      const referenceIndex = current.categories.findIndex((category) => category.id === referenceCategoryId);
      const insertIndex = referenceIndex < 0
        ? current.categories.length
        : position === 'before'
          ? referenceIndex
          : referenceIndex + 1;
      const nextCategories = [...current.categories];
      nextCategories.splice(insertIndex, 0, nextCategory);
      return { ...current, categories: nextCategories };
    });
  };

  const addLane = (categoryId: string, name: string, afterLaneId?: string) => {
    const laneName = name.trim();
    if (!laneName) return;
    setChain((current) => ({
      ...current,
      categories: current.categories.map((category) => {
        if (category.id !== categoryId) return category;
        const nextLane: Lane = {
          id: createValueChainId('lane'),
          name: laneName,
        };
        if (!afterLaneId) return { ...category, lanes: [...category.lanes, nextLane] };
        const insertIndex = category.lanes.findIndex((lane) => lane.id === afterLaneId);
        const nextLanes = [...category.lanes];
        nextLanes.splice(insertIndex >= 0 ? insertIndex + 1 : nextLanes.length, 0, nextLane);
        return { ...category, lanes: nextLanes };
      }),
    }));
  };

  const removeLane = (categoryId: string, laneId: string) => {
    setChain((current) => {
      const category = current.categories.find((item) => item.id === categoryId);
      if (!category || category.lanes.length <= 1) return current;
      return {
        ...current,
        categories: current.categories.map((item) => (
          item.id === categoryId
            ? { ...item, lanes: item.lanes.filter((lane) => lane.id !== laneId) }
            : item
        )),
        groups: current.groups.filter((group) => !(group.categoryId === categoryId && group.laneId === laneId)),
      };
    });
  };

  const removeCategory = (categoryId: string) => {
    setChain((current) => {
      if (current.categories.length <= 1) return current;
      return {
        ...current,
        categories: current.categories.filter((category) => category.id !== categoryId),
        groups: current.groups.filter((group) => group.categoryId !== categoryId),
      };
    });
  };

  const submitStructureEdit = () => {
    if (!structureEditModal) return;
    const name = structureEditModal.value.trim();
    if (!name) {
      setStructureEditModal(null);
      return;
    }
    if (structureEditModal.type === 'stage') {
      addStage(structureEditModal.referenceStageId, name, structureEditModal.position);
    } else if (structureEditModal.type === 'segment') {
      addSegment(structureEditModal.stageId, name, structureEditModal.afterSegmentId);
    } else if (structureEditModal.type === 'category') {
      addCategory(structureEditModal.referenceCategoryId, name, structureEditModal.position);
    } else {
      addLane(structureEditModal.categoryId, name, structureEditModal.afterLaneId);
    }
    setStructureEditModal(null);
  };

  const executeConfirmedDelete = () => {
    if (!confirmModal) return;
    if (confirmModal.type === 'stock') removeStockFromGroup(confirmModal.groupId, confirmModal.symbol);
    if (confirmModal.type === 'selected-stocks') removeStocksFromGroup(confirmModal.groupId, confirmModal.symbols);
    if (confirmModal.type === 'group') removeGroup(confirmModal.groupId);
    if (confirmModal.type === 'stage') removeStage(confirmModal.stageId);
    if (confirmModal.type === 'segment') removeSegment(confirmModal.segmentId);
    if (confirmModal.type === 'category') removeCategory(confirmModal.categoryId);
    if (confirmModal.type === 'lane') removeLane(confirmModal.categoryId, confirmModal.laneId);
    setConfirmModal(null);
  };

  const handleExportJson = () => {
    downloadText('mooview-value-chain-template.json', 'application/json;charset=utf-8', JSON.stringify(chain, null, 2));
  };

  const handleExportCsv = () => {
    downloadText('mooview-value-chain-template.csv', 'text/csv;charset=utf-8', createCsv(chain));
  };

  const handleDownloadSpec = () => {
    downloadText('mooview-value-chain-template-spec.md', 'text/markdown;charset=utf-8', createTemplateSpec(chain));
  };

  const queueImportDecision = (importedChain: ValueChainData, sourceName: string) => {
    setImportDecisionModal({
      chain: ensureIndexGroup(importedChain),
      importedAt: new Date().toISOString(),
      sourceName,
    });
  };

  const applyImportDecision = (mode: 'replace-current' | 'new-history') => {
    if (!importDecisionModal) return;
    const importedChain = ensureIndexGroup(importDecisionModal.chain);
    setImportBackup(chain);
    if (mode === 'new-history') {
      const entry = createHistoryEntry(importedChain, importDecisionModal.importedAt);
      setChainHistory((current) => [entry, ...current]);
      setActiveHistoryId(entry.id);
      setChain(importedChain);
    } else {
      if (activeHistoryId) {
        setChainHistory((current) => current.map((entry) => (
          entry.id === activeHistoryId
            ? { ...entry, importedAt: importDecisionModal.importedAt, chain: importedChain }
            : entry
        )));
      }
      setChain(importedChain);
    }
    setImportDecisionModal(null);
  };

  const selectHistoryEntry = (entry: ValueChainHistoryEntry) => {
    setActiveHistoryId(entry.id);
    localStorage.setItem(ACTIVE_CHAIN_HISTORY_ID_STORAGE_KEY, entry.id);
    setChain(entry.chain);
    setChainMenuOpen(false);
  };

  const removeHistoryEntry = (entryId: string) => {
    setChainHistory((current) => current.filter((entry) => entry.id !== entryId));
    if (activeHistoryId === entryId) {
      setActiveHistoryId(null);
      localStorage.removeItem(ACTIVE_CHAIN_HISTORY_ID_STORAGE_KEY);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const text = await file.text();
    const importedJson = parseValueChainJson(text);
    if (importedJson || file.name.toLowerCase().endsWith('.json')) {
      const imported = importedJson;
      if (imported) {
        queueImportDecision(imported, file.name);
      }
      return;
    }
    const rows = parseCsv(text);
    const groups = new Map<string, ValueGroup>();
    const stageMap = new Map<string, Stage>();
    const categoryMap = new Map<string, Category>();
    for (const row of rows) {
      const stageId = row.stageId?.trim() ?? '';
      const segmentId = row.segmentId?.trim() ?? '';
      if (stageId && segmentId && segmentId !== INDEX_SEGMENT_ID) {
        const stage = stageMap.get(stageId) ?? {
          id: stageId,
          name: row.stageName?.trim() || stageId,
          segments: [],
        };
        if (!stage.segments.some((segment) => segment.id === segmentId)) {
          stage.segments.push({
            id: segmentId,
            name: (row.segmentName?.trim() || segmentId).replace(/ \/ /g, '\n'),
            parentId: stageId,
          });
        }
        stageMap.set(stageId, stage);
      }

      const categoryId = row.categoryId?.trim() ?? '';
      const laneId = row.laneId?.trim() ?? '';
      if (categoryId && laneId && categoryId !== INDEX_CATEGORY_ID) {
        const category = categoryMap.get(categoryId) ?? {
          id: categoryId,
          name: row.categoryName?.trim() || categoryId,
          lanes: [],
        };
        if (!category.lanes.some((lane) => lane.id === laneId)) {
          category.lanes.push({
            id: laneId,
            name: row.laneName?.trim() || laneId,
          });
        }
        categoryMap.set(categoryId, category);
      }

      const groupId = row.groupId?.trim();
      if (!groupId) continue;
      const existing = groups.get(groupId);
      const rawSymbol = row.symbol?.trim() ?? '';
      const rawName = row.name?.trim() ?? '';
      let stock: ChainStock | null = null;
      if (rawSymbol || rawName) {
        try {
          const resolvedStock = await resolveStockInput(rawSymbol, rawName, row.market?.trim() ?? '');
          stock = {
            ...resolvedStock,
            marketCap: Number(row.marketCap) || resolvedStock.marketCap,
            baseChangePct: Number(row.baseChangePct) || resolvedStock.baseChangePct,
          };
        } catch {
          const stockSymbol = normalizeSymbol(rawSymbol);
          if (stockSymbol) {
            stock = {
              symbol: stockSymbol,
              name: rawName || stockSymbol,
              market: row.market?.trim() || (stockSymbol.startsWith('JP.') ? 'JP' : 'US'),
              marketCap: Number(row.marketCap) || 0,
              baseChangePct: Number(row.baseChangePct) || 0,
            };
          }
        }
      }
      const nextGroup: ValueGroup = existing ?? {
        id: groupId,
        categoryId: groupId === INDEX_GROUP_ID ? INDEX_CATEGORY_ID : categoryId,
        laneId: groupId === INDEX_GROUP_ID ? INDEX_LANE_ID : laneId,
        segmentId: groupId === INDEX_GROUP_ID ? INDEX_SEGMENT_ID : segmentId,
        name: row.groupName?.trim() || groupId,
        stocks: [],
      };
      if (stock) nextGroup.stocks = [...nextGroup.stocks, stock];
      groups.set(groupId, nextGroup);
    }
    if (groups.size > 0) {
      queueImportDecision(ensureIndexGroup({
        ...chain,
        name: rows[0]?.chainName?.trim() || chain.name,
        stages: stageMap.size > 0 ? Array.from(stageMap.values()) : chain.stages,
        categories: categoryMap.size > 0 ? Array.from(categoryMap.values()) : chain.categories,
        groups: Array.from(groups.values()),
      }), file.name);
    }
  };

  const moveDate = (direction: -1 | 1) => {
    const date = new Date(`${selectedDate}T12:00:00`);
    date.setDate(date.getDate() + (periodMode === 'week' ? 7 * direction : direction));
    setSelectedDate(date.toISOString().slice(0, 10));
  };

  const updateChartState = (updates: Partial<ChartPanel>) => {
    onChartStateChange((current) => ({ ...current, ...updates }));
  };

  const openSymbolInSidebar = (rawSymbol: string) => {
    const symbol = normalizeSymbol(rawSymbol);
    setComparisonPanelOpen(false);
    setSelectedSymbols([symbol]);
    setDetailSymbol(symbol);
    setChartSidebarOpen(true);
    setSidePanelMode('chart');
    updateChartState({ symbol });
  };

  const toggleSelectSymbol = (symbol: string) => {
    const normalizedSymbol = normalizeSymbol(symbol);
    setSelectedSymbols((current) => (
      current.includes(normalizedSymbol)
        ? current.filter((item) => item !== normalizedSymbol)
        : [...current, normalizedSymbol]
    ));
  };

  const getSelectedSymbolsInGroup = (groupId: string): string[] => {
    const group = chain.groups.find((item) => item.id === groupId);
    if (!group) return [];
    const groupSymbols = new Set(group.stocks.map((stock) => stock.symbol));
    return selectedSymbols.filter((symbol) => groupSymbols.has(symbol));
  };

  const compareSymbols = (symbols: string[]) => {
    const uniqueSymbols = Array.from(new Set(symbols.map((symbol) => normalizeSymbol(symbol)))).filter(Boolean);
    if (uniqueSymbols.length === 0) return;
    setSelectedSymbols(uniqueSymbols);
    setComparisonPanelOpen(true);
    setDetailSymbol(null);
    setChartSidebarOpen(true);
    setSidePanelMode('chart');
    updateChartState({ symbol: uniqueSymbols[0] });
    onAddSymbolsToWatchlist(uniqueSymbols);
  };

  const getComparisonActionSymbols = (symbol: string) => {
    const normalizedSymbol = normalizeSymbol(symbol);
    return Array.from(new Set(
      selectedSymbols.length > 0
        ? [normalizedSymbol, ...selectedSymbols]
        : [normalizedSymbol],
    )).filter(Boolean);
  };

  const getDragSymbolsForStock = (symbol: string) => {
    const normalizedSymbol = normalizeSymbol(symbol);
    if (selectedSet.has(normalizedSymbol) && selectedSymbols.length > 0) {
      return selectedSymbols;
    }
    return [normalizedSymbol];
  };

  const readDroppedSymbols = (event: React.DragEvent<HTMLElement>) => {
    const customPayload = event.dataTransfer.getData('application/x-mooview-symbols');
    if (customPayload) {
      try {
        const parsed = JSON.parse(customPayload);
        if (Array.isArray(parsed)) {
          return parsed.map((symbol) => normalizeSymbol(String(symbol))).filter(Boolean);
        }
      } catch {
        // text/plain の既存ドラッグ形式へフォールバックする。
      }
    }

    return event.dataTransfer
      .getData('text/plain')
      .split(/[\s,]+/)
      .map((symbol) => normalizeSymbol(symbol))
      .filter(Boolean);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const renderStockCard = (stock: ChainStock, group: ValueGroup) => {
    const change = resolveChange(stock);
    const selected = selectedSet.has(normalizeSymbol(stock.symbol));
    const flash = tickerFlash[normalizeSymbol(stock.symbol)];
    const category = chain.categories.find((item) => item.id === group.categoryId);
    const lane = category?.lanes.find((item) => item.id === group.laneId);
    const segment = findSegment(chain, group.segmentId);
    const stage = findStage(chain, group.segmentId);
    const stockClassification = group.id === INDEX_GROUP_ID
      ? group.name
      : [
          category?.name,
          lane?.name,
          stage?.name,
          segment?.name.replace(/\n/g, ' '),
          group.name,
        ].filter(Boolean).join(' / ');

    return (
      <button
        key={`${group.id}-${stock.symbol}`}
        type="button"
        className={`min-h-[34px] border px-1 py-0.5 text-left transition hover:ring-1 hover:ring-white/50 ${selected ? 'ring-2 ring-emerald-300' : ''}`}
        style={{
          ...getHeatStyle(change),
          fontSize: `${stockFontSize}px`,
          boxShadow: flash
            ? `inset 0 0 0 999px ${flash === 'up' ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 83, 80, 0.16)'}`
            : undefined,
        }}
        title={`分類: ${stockClassification}\n銘柄: ${stock.name}\nコード: ${stock.symbol}\n変動率: ${formatPct(change)}`}
        draggable
        onDragStart={(event) => {
          const dragSymbols = getDragSymbolsForStock(stock.symbol);
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData('text/plain', dragSymbols.join(','));
          event.dataTransfer.setData('application/x-mooview-symbols', JSON.stringify(dragSymbols));
        }}
        onClick={(event) => {
          if (panMovedRef.current) return;
          if (event.ctrlKey || event.metaKey || multiSelectMode) {
            setMultiSelectMode(true);
            toggleSelectSymbol(stock.symbol);
          }
        }}
        onDoubleClick={() => {
          if (panMovedRef.current) return;
          openSymbolInSidebar(stock.symbol);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setContextMenu({ x: event.clientX, y: event.clientY, target: { type: 'stock', groupId: group.id, symbol: stock.symbol, label: stock.name } });
        }}
      >
        <span className="block font-bold text-white truncate leading-tight">{stock.name}</span>
        <span className="block font-mono text-white leading-tight">{formatPct(change)}</span>
      </button>
    );
  };

  const finishPanning = () => {
    setIsPanning(false);
    window.setTimeout(() => {
      panMovedRef.current = false;
    }, 0);
  };

  const detailStock = useMemo(() => {
    if (!detailSymbol) return null;
    for (const group of chain.groups) {
      const stock = group.stocks.find((item) => item.symbol === detailSymbol);
      if (stock) return { stock, group };
    }
    return null;
  }, [chain.groups, detailSymbol]);

  const firstStock = useMemo(() => {
    return chain.groups.find((group) => group.stocks.length > 0)?.stocks[0] ?? null;
  }, [chain.groups]);

  const sidePanelPrimarySymbol =
    comparisonPanelOpen && selectedSymbols.length > 0
      ? selectedSymbols[0]
      : detailStock?.stock.symbol ?? selectedSymbols[0] ?? firstStock?.symbol ?? null;
  const sidePanelComparisonSymbols = comparisonPanelOpen && sidePanelPrimarySymbol
    ? selectedSymbols.filter((symbol) => symbol !== sidePanelPrimarySymbol)
    : [];
  const addSymbolsToSidePanelComparison = (symbols: string[]) => {
    const droppedSymbols = symbols.map((symbol) => normalizeSymbol(symbol)).filter(Boolean);
    if (droppedSymbols.length === 0) return;
    const nextSymbols = Array.from(new Set([
      sidePanelPrimarySymbol,
      ...sidePanelComparisonSymbols,
      ...droppedSymbols,
    ].filter((symbol): symbol is string => Boolean(symbol))));
    compareSymbols(nextSymbols);
  };
  const sidePanelChartSymbols = useMemo(() => (
    Array.from(new Set([
      sidePanelPrimarySymbol,
      ...sidePanelComparisonSymbols,
    ].filter((symbol): symbol is string => Boolean(symbol))))
  ), [sidePanelComparisonSymbols.join('|'), sidePanelPrimarySymbol]);
  const sidePanelSymbolOptions = useMemo(() => {
    const options = new Map<string, string>();
    chain.groups.forEach((group) => {
      group.stocks.forEach((stock) => {
        options.set(stock.symbol, stock.name || stock.symbol);
      });
    });
    tickers.forEach((ticker) => {
      options.set(ticker.symbol, ticker.name || ticker.symbol);
    });
    if (sidePanelPrimarySymbol && !options.has(sidePanelPrimarySymbol)) {
      options.set(sidePanelPrimarySymbol, sidePanelPrimarySymbol);
    }
    if (chartState.symbol && !options.has(chartState.symbol)) {
      options.set(chartState.symbol, chartState.symbol);
    }
    return Array.from(options.entries()).map(([symbol, name]) => ({ symbol, name }));
  }, [chain.groups, chartState.symbol, sidePanelPrimarySymbol, tickers]);
  const activeHistoryEntry = useMemo(() => (
    chainHistory.find((entry) => entry.id === activeHistoryId) ?? null
  ), [activeHistoryId, chainHistory]);

  useEffect(() => {
    if (sidePanelChartSymbols.length > 0) {
      onChartSymbolsChange(sidePanelChartSymbols);
    }
  }, [onChartSymbolsChange, sidePanelChartSymbols]);

  const openChartSidebar = () => {
    setSidePanelMode('chart');
    if (!detailSymbol && !comparisonPanelOpen) {
      const symbolToOpen = selectedSymbols[0] ?? firstStock?.symbol;
      if (symbolToOpen) {
        openSymbolInSidebar(symbolToOpen);
        return;
      }
    }
    if (sidePanelPrimarySymbol) {
      updateChartState({ symbol: sidePanelPrimarySymbol });
    }
    setChartSidebarOpen(true);
  };

  const closeChartSidebar = () => {
    setChartSidebarOpen(false);
    setComparisonPanelOpen(false);
    setDetailSymbol(null);
    setSidePanelMode('chart');
  };

  const handleChartSidebarResizeMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = chartSidebarWidth;
    const maxWidth = Math.min(DETAIL_PANEL_MAX_WIDTH, Math.max(DETAIL_PANEL_MIN_WIDTH, window.innerWidth - 96));

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setChartSidebarWidth(clamp(startWidth + startX - moveEvent.clientX, DETAIL_PANEL_MIN_WIDTH, maxWidth));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const gridTemplateColumns = '132px 64px ' + segments.map(() => '142px').join(' ');
  const canvasWidth = 196 + segments.length * 142;
  const contextStageIndex = contextMenu?.target.type === 'stage'
    ? chain.stages.findIndex((stage) => stage.id === contextMenu.target.id)
    : -1;
  const contextCategoryIndex = contextMenu?.target.type === 'category'
    ? chain.categories.findIndex((category) => category.id === contextMenu.target.id)
    : -1;
  const confirmTitle = confirmModal
    ? confirmModal.type === 'stock'
      ? '銘柄を削除'
      : confirmModal.type === 'selected-stocks'
        ? '個別銘柄の削除'
      : confirmModal.type === 'group'
        ? 'グループを削除'
        : confirmModal.type === 'stage'
          ? '工程を削除'
          : confirmModal.type === 'segment'
            ? '列を削除'
            : confirmModal.type === 'category'
              ? '大分類を削除'
              : '行を削除'
    : '';
  const confirmMessage = confirmModal
    ? confirmModal.type === 'stock'
      ? `${confirmModal.label} をこのグループから削除します。`
      : confirmModal.type === 'selected-stocks'
        ? `${confirmModal.label} をこのグループから削除します。`
      : confirmModal.type === 'group'
        ? `${confirmModal.label} と中の銘柄を削除します。`
        : confirmModal.type === 'stage'
          ? `${confirmModal.label} に含まれる列と配置済みグループを削除します。`
          : confirmModal.type === 'segment'
            ? `${confirmModal.label.replace(/\n/g, ' ')} 列と配置済みグループを削除します。`
            : confirmModal.type === 'category'
              ? `${confirmModal.label} と配下の行、配置済みグループを削除します。`
              : `${confirmModal.label} 行と配置済みグループを削除します。`
    : '';

  return (
    <div className="flex-1 min-h-0 bg-[#050505] text-[#d1d4dc] flex flex-col overflow-hidden">
      <div className="h-12 border-b border-[#202020] bg-[#080808] pl-3 pr-[56px] shrink-0 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-8 bg-emerald-500 rounded-full" />
            <div className="relative min-w-0" data-no-pan="true">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setChainMenuOpen((open) => !open);
                }}
                className="max-w-[280px] min-w-[190px] h-9 px-2 border border-transparent hover:border-[#303030] hover:bg-[#101010] flex items-center justify-between gap-2 text-left"
                title="バリューチェーン履歴"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-white truncate">{chain.name}</span>
                  <span className="block text-[9px] text-gray-500 truncate">
                    {activeHistoryEntry ? formatImportTimestamp(activeHistoryEntry.importedAt) : '現在表示'}
                  </span>
                </span>
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-gray-500 transition-transform ${chainMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {chainMenuOpen && (
                <div
                  className="absolute left-0 top-10 z-50 w-[360px] max-h-80 overflow-y-auto bg-[#080808] border border-[#343434] shadow-2xl py-1 text-[10px]"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="px-2.5 py-1.5 border-b border-[#242424] text-gray-500">
                    インポート履歴
                  </div>
                  {chainHistory.length === 0 ? (
                    <div className="px-2.5 py-3 text-gray-500">履歴はまだありません</div>
                  ) : (
                    chainHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className={`group flex items-center gap-2 px-2 py-1.5 hover:bg-[#151515] ${entry.id === activeHistoryId ? 'bg-[#10251f]' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => selectHistoryEntry(entry)}
                          className="min-w-0 flex-1 text-left"
                          title={`${entry.chain.name} / ${formatImportTimestamp(entry.importedAt)}`}
                        >
                          <span className="block text-[11px] font-bold text-gray-100 truncate">{entry.chain.name}</span>
                          <span className="block text-[9px] text-gray-500 truncate">{formatImportTimestamp(entry.importedAt)}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeHistoryEntry(entry.id);
                          }}
                          className="w-7 h-7 shrink-0 flex items-center justify-center text-gray-500 hover:text-red-300 hover:bg-red-950/30"
                          title="履歴を削除"
                          aria-label={`${entry.chain.name} の履歴を削除`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="h-7 w-px bg-[#2a2a2a]" />
          <div className="flex items-center gap-1" data-no-pan="true">
            <button
              type="button"
              onClick={() => setSortMode('change')}
              className={`h-7 px-2 text-[10px] border transition ${sortMode === 'change' ? 'bg-emerald-950/70 border-emerald-700 text-emerald-200' : 'bg-[#111] border-[#242424] text-gray-400 hover:text-white'}`}
            >
              変動率順
            </button>
            <button
              type="button"
              onClick={() => setSortMode('marketCap')}
              className={`h-7 px-2 text-[10px] border transition ${sortMode === 'marketCap' ? 'bg-emerald-950/70 border-emerald-700 text-emerald-200' : 'bg-[#111] border-[#242424] text-gray-400 hover:text-white'}`}
            >
              時価総額順
            </button>
            <span className="ml-2 text-[10px] text-[#848e9c] truncate">
              銘柄数: <b className="text-gray-200">{chain.groups.reduce((sum, group) => sum + group.stocks.length, 0)}</b>
            </span>
            {multiSelectMode && (
              <span className="text-[10px] text-emerald-300 truncate">
                複数選択: {selectedSymbols.length}件
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0" data-no-pan="true">
          {importBackup && (
            <button
              type="button"
              onClick={() => {
                setChain(importBackup);
                setImportBackup(null);
              }}
              className="h-7 px-2 border border-amber-700/60 bg-amber-950/30 text-[10px] text-amber-200 hover:bg-amber-900/40"
            >
              インポートを戻す
            </button>
          )}
          <div className="flex items-center gap-1 bg-[#101010] border border-[#242424] h-8 px-1">
            <button type="button" onClick={() => setStockFontSize((value) => clamp(value + 1, 8, 16))} className="h-6 px-1.5 text-[10px] border border-[#242424] bg-[#101010] hover:bg-[#181818]" aria-label="個別銘柄フォントを大きく">A+</button>
            <button type="button" onClick={() => setStockFontSize((value) => clamp(value - 1, 8, 16))} className="h-6 px-1.5 text-[10px] border border-[#242424] bg-[#101010] hover:bg-[#181818]" aria-label="個別銘柄フォントを小さく">A-</button>
            <button type="button" onClick={() => setZoom((value) => clamp(value - 0.1, 0.55, 1.6))} className="h-6 w-6 border border-[#242424] bg-[#101010] hover:bg-[#181818]" aria-label="縮小">-</button>
            <span className="font-mono text-gray-300 w-10 text-center text-[10px]">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((value) => clamp(value + 0.1, 0.55, 1.6))} className="h-6 w-6 border border-[#242424] bg-[#101010] hover:bg-[#181818]" aria-label="拡大">+</button>
            <button type="button" onClick={resetView} className="h-6 w-6 border border-[#242424] bg-[#101010] hover:bg-[#181818] inline-flex items-center justify-center" aria-label="リセット">
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center gap-1 bg-[#101010] border border-[#242424] h-8 px-1.5">
            <button type="button" onClick={() => moveDate(-1)} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white" title="前へ" aria-label="前へ">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={openDatePicker}
              className="w-5 h-6 flex items-center justify-center text-emerald-300 hover:text-emerald-200"
              title="日付を選択"
              aria-label="日付を選択"
            >
              <CalendarDays className="w-3.5 h-3.5" />
            </button>
            <input
              ref={dateInputRef}
              type="date"
              value={selectedDate}
              onClick={openDatePicker}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="bg-transparent text-[10px] text-gray-200 outline-none w-[116px] cursor-pointer"
              aria-label="表示日を選択"
            />
            <button type="button" onClick={() => moveDate(1)} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white" title="次へ" aria-label="次へ">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center bg-[#101010] border border-[#242424] h-8">
            <button
              type="button"
              onClick={() => setPeriodMode('day')}
              className={`h-full px-2 text-[10px] ${periodMode === 'day' ? 'bg-[#222] text-white' : 'text-gray-500 hover:text-gray-200'}`}
            >
              日毎
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('week')}
              className={`h-full px-2 text-[10px] ${periodMode === 'week' ? 'bg-[#222] text-white' : 'text-gray-500 hover:text-gray-200'}`}
            >
              週ごと
            </button>
          </div>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`relative flex-1 min-h-0 overflow-hidden bg-[#050505] ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
        onWheel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (event.ctrlKey) {
            setZoom((current) => clamp(current + (event.deltaY > 0 ? -0.06 : 0.06), 0.55, 1.6));
            return;
          }
          if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) {
            const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
              ? event.deltaX
              : event.deltaY;
            setPan((current) => ({
              ...current,
              x: current.x - horizontalDelta,
            }));
            return;
          }
          setPan((current) => ({
            ...current,
            y: current.y - event.deltaY,
          }));
        }}
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target as HTMLElement;
          if (target.closest('input,select,textarea,a,[data-pan-block="true"],[data-no-pan="true"]')) return;
          if (chartSidebarOpen || detailSymbol || comparisonPanelOpen) {
            closeChartSidebar();
          }
          panMovedRef.current = false;
          setIsPanning(true);
          setPanStart({ mouseX: event.clientX, mouseY: event.clientY, x: pan.x, y: pan.y });
        }}
        onMouseMove={(event) => {
          if (!isPanning) return;
          if (
            Math.abs(event.clientX - panStart.mouseX) > 4 ||
            Math.abs(event.clientY - panStart.mouseY) > 4
          ) {
            panMovedRef.current = true;
          }
          setPan({
            x: panStart.x + event.clientX - panStart.mouseX,
            y: panStart.y + event.clientY - panStart.mouseY,
          });
        }}
        onMouseUp={finishPanning}
        onMouseLeave={finishPanning}
      >
        <div
          className="absolute left-3 top-3 pb-10"
          style={{
            width: `${canvasWidth}px`,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          <div
            className="grid text-[10px] border-l border-t border-[#252525] shadow-2xl bg-[#0b0b0b]"
            style={{ gridTemplateColumns }}
          >
            <div
              className="bg-[#101010] border-r border-b border-[#252525] p-1 overflow-hidden"
              style={{ gridColumn: 'span 2', gridRow: 'span 2', height: `${totalHeaderHeight}px` }}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ x: event.clientX, y: event.clientY, target: { type: 'group', id: INDEX_GROUP_ID, label: indexGroup.name } });
              }}
            >
              <button
                type="button"
                className="w-full text-left text-[8px] font-bold text-gray-300 hover:text-white truncate mb-0.5"
                onClick={() => {
                  if (panMovedRef.current) return;
                  updateGroupName(INDEX_GROUP_ID);
                }}
                title="指数"
              >
                {indexGroup.name}
              </button>
              <div className="grid grid-cols-3 gap-0.5">
                {sortedStocks(indexGroup.stocks).map((stock) => renderStockCard(stock, indexGroup))}
              </div>
            </div>
            {chain.stages.map((stage) => {
              const merged = shouldMergeStageHeader(stage);
              return (
                <button
                  key={stage.id}
                  type="button"
                  data-no-pan="true"
                  className="bg-[#1d1d1f] border-r border-b border-[#353535] flex items-center justify-center text-gray-200 font-bold hover:bg-[#27272a] transition px-2"
                  style={{
                    gridColumn: `span ${stage.segments.length}`,
                    gridRow: merged ? 'span 2' : undefined,
                    height: `${merged ? totalHeaderHeight : stageHeaderHeight}px`,
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({ x: event.clientX, y: event.clientY, target: { type: 'stage', id: stage.id, label: stage.name } });
                  }}
                  title={stage.name}
                >
                  <span className="truncate">{stage.name}</span>
                </button>
              );
            })}

            {segments.map((segment) => {
              const stage = findStage(chain, segment.id);
              if (stage && shouldMergeStageHeader(stage)) return null;
              return (
                <button
                  key={segment.id}
                  type="button"
                  data-no-pan="true"
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({ x: event.clientX, y: event.clientY, target: { type: 'segment', id: segment.id, label: segment.name } });
                  }}
                  className="bg-[#202022] border-r border-b border-[#353535] px-2 text-center hover:bg-[#29292b] transition"
                  style={{ height: `${segmentHeaderHeight}px` }}
                  title={`${stage?.name ?? ''} / ${segment.name.replace(/\n/g, ' ')}`}
                >
                  <span className="block text-[9px] text-gray-500 truncate">{stage?.name}</span>
                  <span className="block whitespace-pre-line leading-tight text-gray-200 font-semibold">{segment.name}</span>
                </button>
              );
            })}

            {chain.categories.flatMap((category) => category.lanes.map((lane, laneIndex) => {
              const rowCells = segments.map((segment) => {
                const groups = groupsByCell.get(`${category.id}|${lane.id}|${segment.id}`) ?? [];
                return (
                  <div
                    key={`${category.id}-${lane.id}-${segment.id}`}
                    className="min-h-[118px] bg-[#111214] border-r border-b border-[#252525] p-1"
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (groups.length === 0) {
                        setContextMenu({
                          x: event.clientX,
                          y: event.clientY,
                          target: {
                            type: 'empty-cell',
                            categoryId: category.id,
                            laneId: lane.id,
                            segmentId: segment.id,
                            label: `${segment.name.replace(/\n/g, ' ')} / ${category.name} / ${lane.name}`,
                          },
                        });
                      }
                    }}
                  >
                    {groups.length === 0 ? (
                      <div
                        className="h-full min-h-[104px] border border-dashed border-[#252525] bg-[#0d0d0e] hover:border-[#3f3f46] hover:bg-[#121214] transition"
                        title="該当銘柄0件の空白枠。右クリックで銘柄追加"
                      />
                    ) : (
                      <div className="space-y-1">
                        {groups.map((group) => (
                          <div
                            key={group.id}
                            className="border border-[#2b2b2b] bg-[#0a0a0a] p-1"
                            onContextMenu={(event) => {
                              event.preventDefault();
                              setContextMenu({ x: event.clientX, y: event.clientY, target: { type: 'group', id: group.id, label: group.name } });
                            }}
                          >
                            <button
                              type="button"
                              className="w-full text-left text-[8px] font-bold text-gray-300 hover:text-white truncate mb-0.5"
                              onClick={() => {
                                if (panMovedRef.current) return;
                                updateGroupName(group.id);
                              }}
                              title={`${findStage(chain, group.segmentId)?.name ?? ''} / ${findSegment(chain, group.segmentId)?.name.replace(/\n/g, ' ') ?? ''} / ${group.name}`}
                            >
                              {group.name}
                            </button>
                            <div className="grid grid-cols-2 gap-0.5">
                              {sortedStocks(group.stocks).map((stock) => renderStockCard(stock, group))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              });

              return [
                laneIndex === 0 ? (
                  <button
                    key={`${category.id}-category`}
                    type="button"
                    data-no-pan="true"
                    className="bg-[#1c1d1f] border-r border-b border-[#303030] flex items-center justify-center px-2 text-center font-bold text-gray-200 hover:bg-[#232427]"
                    style={{ gridRow: `span ${category.lanes.length}` }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setContextMenu({ x: event.clientX, y: event.clientY, target: { type: 'category', id: category.id, label: category.name } });
                    }}
                  >
                    {category.name}
                  </button>
                ) : null,
                <button
                  key={`${category.id}-${lane.id}-lane`}
                  type="button"
                  data-no-pan="true"
                  className="bg-[#151618] border-r border-b border-[#2a2a2a] flex items-center justify-center px-1 text-gray-300 font-bold hover:bg-[#202124]"
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({
                      x: event.clientX,
                      y: event.clientY,
                      target: { type: 'lane', id: lane.id, categoryId: category.id, label: lane.name },
                    });
                  }}
                >
                  {lane.name}
                </button>,
                ...rowCells,
              ];
            }))}
          </div>
        </div>

      </div>

      {contextMenu && (
        <div
          className="fixed z-50 w-52 bg-[#080808] border border-[#343434] shadow-2xl py-1 text-[10px] text-gray-200"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          data-no-pan="true"
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.target.type === 'stock' ? (
            <>
              <button type="button" onClick={() => { openStockEditModal(contextMenu.target.groupId, contextMenu.target.symbol); setContextMenu(null); }} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left">
                <Pencil className="w-3.5 h-3.5" />
                銘柄編集
              </button>
              <button type="button" onClick={() => { openStockAddModal(contextMenu.target.groupId); setContextMenu(null); }} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left">
                <Plus className="w-3.5 h-3.5" />
                銘柄追加
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmModal({
                    type: 'stock',
                    groupId: contextMenu.target.groupId,
                    symbol: contextMenu.target.symbol,
                    label: contextMenu.target.label,
                  });
                  setContextMenu(null);
                }}
                className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-red-950/30 text-red-300 text-left"
              >
                <Trash2 className="w-3.5 h-3.5" />
                個別銘柄の削除
              </button>
              {contextMenu.target.groupId !== INDEX_GROUP_ID && (
                <button
                  type="button"
                  onClick={() => {
                    const group = chain.groups.find((item) => item.id === contextMenu.target.groupId);
                    setConfirmModal({
                      type: 'group',
                      groupId: contextMenu.target.groupId,
                      label: group?.name ?? 'グループ',
                    });
                    setContextMenu(null);
                  }}
                  className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-red-950/30 text-red-300 text-left"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  グループごと削除
                </button>
              )}
              <button type="button" onClick={() => { setMultiSelectMode(true); toggleSelectSymbol(contextMenu.target.symbol); setContextMenu(null); }} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left">
                <CheckSquare className="w-3.5 h-3.5" />
                複数選択
              </button>
              <button type="button" onClick={() => { onOpenTickerInChart(contextMenu.target.symbol); setContextMenu(null); }} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left">
                <ExternalLink className="w-3.5 h-3.5" />
                チャートビューで表示
              </button>
              <button type="button" onClick={() => { compareSymbols(getComparisonActionSymbols(contextMenu.target.symbol)); setContextMenu(null); }} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left">
                <PanelRightOpen className="w-3.5 h-3.5" />
                比較パネルで表示
              </button>
            </>
          ) : contextMenu.target.type === 'empty-cell' ? (
            <>
              <div className="px-2.5 py-1.5 border-b border-[#242424] text-[9px] text-gray-500 truncate">
                {contextMenu.target.label}
              </div>
              <button
                type="button"
                onClick={() => {
                  addStockToCell(contextMenu.target.categoryId, contextMenu.target.laneId, contextMenu.target.segmentId);
                  setContextMenu(null);
                }}
                className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left"
              >
                <Plus className="w-3.5 h-3.5" />
                この空セルへ銘柄追加
              </button>
              <button
                type="button"
                onClick={() => {
                  const groupId = ensureGroupForCell(
                    contextMenu.target.categoryId,
                    contextMenu.target.laneId,
                    contextMenu.target.segmentId,
                  );
                  setContextMenu(null);
                  window.setTimeout(() => updateGroupName(groupId), 0);
                }}
                className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left"
              >
                <Pencil className="w-3.5 h-3.5" />
                空セルのグループ名を作成
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { updateHeaderName(contextMenu.target); setContextMenu(null); }} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left">
                <Pencil className="w-3.5 h-3.5" />
                名前の編集
              </button>
              {contextMenu.target.type === 'group' && (
                <>
                  <button type="button" onClick={() => { openStockAddModal(contextMenu.target.id); setContextMenu(null); }} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left">
                    <Plus className="w-3.5 h-3.5" />
                    グループへ銘柄追加
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMultiSelectMode(true);
                      setContextMenu(null);
                    }}
                    className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    複数選択
                  </button>
                  <button
                    type="button"
                    disabled={getSelectedSymbolsInGroup(contextMenu.target.id).length === 0}
                    onClick={() => {
                      const symbols = getSelectedSymbolsInGroup(contextMenu.target.id);
                      if (symbols.length === 0) return;
                      compareSymbols(symbols);
                      setContextMenu(null);
                    }}
                    className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <PanelRightOpen className="w-3.5 h-3.5" />
                    比較パネルで表示
                  </button>
                  <button
                    type="button"
                    disabled={getSelectedSymbolsInGroup(contextMenu.target.id).length === 0}
                    onClick={() => {
                      const symbols = getSelectedSymbolsInGroup(contextMenu.target.id);
                      if (symbols.length === 0) return;
                      setConfirmModal({
                        type: 'selected-stocks',
                        groupId: contextMenu.target.id,
                        symbols,
                        label: `${symbols.length}件の選択中銘柄`,
                      });
                      setContextMenu(null);
                    }}
                    className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-red-950/30 text-red-300 text-left disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    個別銘柄の削除
                  </button>
                  {contextMenu.target.id !== INDEX_GROUP_ID && (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmModal({ type: 'group', groupId: contextMenu.target.id, label: contextMenu.target.label });
                        setContextMenu(null);
                      }}
                      className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-red-950/30 text-red-300 text-left"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      グループ削除
                    </button>
                  )}
                </>
              )}
              {contextMenu.target.type === 'stage' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setStructureEditModal({ type: 'segment', stageId: contextMenu.target.id, value: '新規列' });
                      setContextMenu(null);
                    }}
                    className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    この工程に列追加
                  </button>
                  {contextStageIndex === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setStructureEditModal({
                          type: 'stage',
                          referenceStageId: contextMenu.target.id,
                          position: 'before',
                          value: '新規工程',
                        });
                        setContextMenu(null);
                      }}
                      className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      工程を左に追加
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setStructureEditModal({
                        type: 'stage',
                        referenceStageId: contextMenu.target.id,
                        position: 'after',
                        value: '新規工程',
                      });
                      setContextMenu(null);
                    }}
                    className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    工程を右に追加
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmModal({ type: 'stage', stageId: contextMenu.target.id, label: contextMenu.target.label });
                      setContextMenu(null);
                    }}
                    className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-red-950/30 text-red-300 text-left"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    工程を削除
                  </button>
                </>
              )}
              {contextMenu.target.type === 'segment' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const stage = findStage(chain, contextMenu.target.id);
                      if (stage) {
                        setStructureEditModal({ type: 'segment', stageId: stage.id, afterSegmentId: contextMenu.target.id, value: '新規列' });
                      }
                      setContextMenu(null);
                    }}
                    className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    右に列追加
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmModal({ type: 'segment', segmentId: contextMenu.target.id, label: contextMenu.target.label });
                      setContextMenu(null);
                    }}
                    className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-red-950/30 text-red-300 text-left"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    列削除
                  </button>
                </>
              )}
              {contextMenu.target.type === 'category' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setStructureEditModal({ type: 'lane', categoryId: contextMenu.target.id, value: '新規行' });
                      setContextMenu(null);
                    }}
                    className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    行を追加
                  </button>
                  {contextCategoryIndex === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setStructureEditModal({
                          type: 'category',
                          referenceCategoryId: contextMenu.target.id,
                          position: 'before',
                          value: '新規分類',
                        });
                        setContextMenu(null);
                      }}
                      className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      分類を上に追加
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setStructureEditModal({
                        type: 'category',
                        referenceCategoryId: contextMenu.target.id,
                        position: 'after',
                        value: '新規分類',
                      });
                      setContextMenu(null);
                    }}
                    className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    下に分類を追加
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmModal({ type: 'category', categoryId: contextMenu.target.id, label: contextMenu.target.label });
                      setContextMenu(null);
                    }}
                    className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-red-950/30 text-red-300 text-left"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    大分類を削除
                  </button>
                </>
              )}
              {contextMenu.target.type === 'lane' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setStructureEditModal({
                        type: 'lane',
                        categoryId: contextMenu.target.categoryId,
                        afterLaneId: contextMenu.target.id,
                        value: '新規行',
                      });
                      setContextMenu(null);
                    }}
                    className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    下に行追加
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmModal({
                        type: 'lane',
                        categoryId: contextMenu.target.categoryId,
                        laneId: contextMenu.target.id,
                        label: contextMenu.target.label,
                      });
                      setContextMenu(null);
                    }}
                    className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-red-950/30 text-red-300 text-left"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    行削除
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {importDecisionModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/55 flex items-center justify-center px-4"
          data-no-pan="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setImportDecisionModal(null);
            }
          }}
        >
          <div
            className="w-full max-w-md bg-[#080808] border border-[#343434] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="h-10 border-b border-[#242424] px-3 flex items-center justify-between">
              <div className="text-xs font-bold text-white">インポート先の確認</div>
              <button
                type="button"
                onClick={() => setImportDecisionModal(null)}
                className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white"
                aria-label="インポート確認を閉じる"
                title="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 space-y-3 text-[11px] text-gray-300">
              <div className="border border-[#242424] bg-[#101010] p-2">
                <div className="text-[9px] text-gray-500">取り込みファイル</div>
                <div className="mt-0.5 font-bold text-white truncate">{importDecisionModal.sourceName}</div>
                <div className="mt-2 text-[9px] text-gray-500">取り込み名</div>
                <div className="mt-0.5 font-bold text-white truncate">{importDecisionModal.chain.name}</div>
                <div className="mt-2 text-[9px] text-gray-500">インポート日時</div>
                <div className="mt-0.5 font-mono text-gray-200">{formatImportTimestamp(importDecisionModal.importedAt)}</div>
              </div>
              <div className="text-gray-400 leading-relaxed">
                現在開いている「{chain.name}」へ上書きするか、履歴プルダウン内に新しいバリューチェーンとして追加するかを選択してください。
              </div>
            </div>
            <div className="px-3 py-3 border-t border-[#242424] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportDecisionModal(null)}
                className="h-8 px-3 border border-[#303030] bg-[#101010] text-[11px] text-gray-300 hover:text-white hover:bg-[#181818]"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => applyImportDecision('replace-current')}
                className="h-8 px-3 border border-[#3a3a3a] bg-[#181818] text-[11px] font-bold text-white hover:bg-[#222]"
              >
                現在表示へ上書き
              </button>
              <button
                type="button"
                onClick={() => applyImportDecision('new-history')}
                className="h-8 px-3 border border-emerald-700 bg-emerald-700 text-[11px] font-bold text-white hover:bg-emerald-600"
              >
                履歴へ新設
              </button>
            </div>
          </div>
        </div>
      )}

      {nameEditModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/55 flex items-center justify-center px-4"
          data-no-pan="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setNameEditModal(null);
            }
          }}
        >
          <form
            className="w-full max-w-sm bg-[#080808] border border-[#343434] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              applyNameEdit(nameEditModal.target, nameEditModal.value);
            }}
          >
            <div className="h-10 border-b border-[#242424] px-3 flex items-center justify-between">
              <div className="text-xs font-bold text-white">名前の編集</div>
              <button
                type="button"
                onClick={() => setNameEditModal(null)}
                className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white"
                aria-label="名前編集を閉じる"
                title="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 space-y-3">
              <label className="block text-[10px] text-gray-500">
                対象
                <span className="mt-1 block text-xs text-gray-200 font-bold truncate">
                  {nameEditModal.target.label}
                </span>
              </label>
              <label className="block text-[10px] text-gray-500">
                新しい名前
                <input
                  value={nameEditModal.value}
                  onChange={(event) => setNameEditModal((current) => current ? { ...current, value: event.target.value } : current)}
                  className="mt-1 h-9 w-full bg-[#101010] border border-[#303030] px-2 text-sm text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  autoFocus
                />
              </label>
            </div>
            <div className="h-11 border-t border-[#242424] px-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setNameEditModal(null)}
                className="h-7 px-3 border border-[#303030] bg-[#101010] text-[11px] text-gray-300 hover:text-white hover:bg-[#171717]"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="h-7 px-3 border border-emerald-700 bg-emerald-600 text-[11px] font-bold text-white hover:bg-emerald-500"
              >
                保存
              </button>
            </div>
          </form>
        </div>
      )}

      {structureEditModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/55 flex items-center justify-center px-4"
          data-no-pan="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setStructureEditModal(null);
          }}
        >
          <form
            className="w-full max-w-sm bg-[#080808] border border-[#343434] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              submitStructureEdit();
            }}
          >
            <div className="h-10 border-b border-[#242424] px-3 flex items-center justify-between">
              <div className="text-xs font-bold text-white">
                {structureEditModal.type === 'stage'
                  ? '工程を追加'
                  : structureEditModal.type === 'segment'
                    ? '列を追加'
                    : structureEditModal.type === 'category'
                      ? '分類を追加'
                      : '行を追加'}
              </div>
              <button
                type="button"
                onClick={() => setStructureEditModal(null)}
                className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white"
                aria-label="行列追加を閉じる"
                title="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3">
              <label className="block text-[10px] text-gray-500">
                {structureEditModal.type === 'stage'
                  ? '工程名'
                  : structureEditModal.type === 'segment'
                    ? '列名'
                    : structureEditModal.type === 'category'
                      ? '分類名'
                      : '行名'}
                <input
                  value={structureEditModal.value}
                  onChange={(event) => setStructureEditModal((current) => current ? { ...current, value: event.target.value } : current)}
                  className="mt-1 h-9 w-full bg-[#101010] border border-[#303030] px-2 text-sm text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  autoFocus
                />
              </label>
            </div>
            <div className="h-11 border-t border-[#242424] px-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setStructureEditModal(null)}
                className="h-7 px-3 border border-[#303030] bg-[#101010] text-[11px] text-gray-300 hover:text-white hover:bg-[#171717]"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="h-7 px-3 border border-emerald-700 bg-emerald-600 text-[11px] font-bold text-white hover:bg-emerald-500"
              >
                追加
              </button>
            </div>
          </form>
        </div>
      )}

      {stockEditModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/55 flex items-center justify-center px-4"
          data-no-pan="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !stockEditModal.loading) setStockEditModal(null);
          }}
        >
          <form
            className="w-full max-w-md bg-[#080808] border border-[#343434] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void submitStockEdit();
            }}
          >
            <div className="h-10 border-b border-[#242424] px-3 flex items-center justify-between">
              <div className="text-xs font-bold text-white">
                {stockEditModal.mode === 'edit' ? '銘柄編集' : '銘柄追加'}
              </div>
              <button
                type="button"
                onClick={() => setStockEditModal(null)}
                disabled={stockEditModal.loading}
                className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40"
                aria-label="銘柄編集を閉じる"
                title="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 space-y-3">
              <label className="block text-[10px] text-gray-500">
                銘柄コードまたは銘柄名
                <input
                  value={stockEditModal.symbol}
                  onChange={(event) => setStockEditModal((current) => current ? { ...current, symbol: event.target.value, error: null } : current)}
                  className="mt-1 h-9 w-full bg-[#101010] border border-[#303030] px-2 text-sm text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="NVDA / JP.8035 / 東京エレクトロン"
                  autoFocus
                />
              </label>
              <label className="block text-[10px] text-gray-500">
                銘柄名
                <input
                  value={stockEditModal.name}
                  onChange={(event) => setStockEditModal((current) => current ? { ...current, name: event.target.value, error: null } : current)}
                  className="mt-1 h-9 w-full bg-[#101010] border border-[#303030] px-2 text-sm text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="空ならMoomoo検索で補完"
                />
              </label>
              <label className="block text-[10px] text-gray-500">
                市場
                <input
                  value={stockEditModal.market}
                  onChange={(event) => setStockEditModal((current) => current ? { ...current, market: event.target.value, error: null } : current)}
                  className="mt-1 h-9 w-full bg-[#101010] border border-[#303030] px-2 text-sm text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="US / JP"
                />
              </label>
              {stockEditModal.error && (
                <div className="border border-red-900/70 bg-red-950/20 px-2 py-1.5 text-[10px] text-red-200">
                  {stockEditModal.error}
                </div>
              )}
            </div>
            <div className="h-11 border-t border-[#242424] px-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => void fillStockFromSearch()}
                disabled={stockEditModal.loading}
                className="h-7 px-3 border border-[#303030] bg-[#101010] text-[11px] text-gray-300 hover:text-white hover:bg-[#171717] disabled:opacity-40"
              >
                {stockEditModal.loading ? '検索中' : '補完'}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStockEditModal(null)}
                  disabled={stockEditModal.loading}
                  className="h-7 px-3 border border-[#303030] bg-[#101010] text-[11px] text-gray-300 hover:text-white hover:bg-[#171717] disabled:opacity-40"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={stockEditModal.loading}
                  className="h-7 px-3 border border-emerald-700 bg-emerald-600 text-[11px] font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {stockEditModal.mode === 'edit' ? '保存' : '追加'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {confirmModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center px-4"
          data-no-pan="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmModal(null);
          }}
        >
          <div
            className="w-full max-w-sm bg-[#080808] border border-[#343434] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="h-10 border-b border-[#242424] px-3 flex items-center justify-between">
              <div className="text-xs font-bold text-white">{confirmTitle}</div>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white"
                aria-label="削除確認を閉じる"
                title="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 text-xs text-gray-300 leading-relaxed">
              {confirmMessage}
            </div>
            <div className="h-11 border-t border-[#242424] px-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="h-7 px-3 border border-[#303030] bg-[#101010] text-[11px] text-gray-300 hover:text-white hover:bg-[#171717]"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={executeConfirmedDelete}
                className="h-7 px-3 border border-red-800 bg-red-700 text-[11px] font-bold text-white hover:bg-red-600"
              >
                削除
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="fixed top-24 right-0 bottom-0 z-40 flex border-l border-[#202020] bg-[#080808] shadow-2xl overflow-visible transition-[width] duration-150 ease-out"
        style={{
          width: chartSidebarOpen
            ? `${chartSidebarWidth + DETAIL_PANEL_NAV_WIDTH}px`
            : `${DETAIL_PANEL_NAV_WIDTH}px`,
        }}
      >
        {chartSidebarOpen && (
          <div
            className="w-1.5 bg-[#191919]/90 hover:bg-emerald-500 active:bg-emerald-600 cursor-col-resize transition-colors shrink-0 self-stretch"
            onMouseDown={handleChartSidebarResizeMouseDown}
            title="左右にドラッグしてサイドパネル幅を変更"
          />
        )}

        <div
          className={`min-w-0 flex flex-col overflow-hidden transition-[width] duration-150 ease-out ${chartSidebarOpen ? '' : 'pointer-events-none'}`}
          style={{ width: chartSidebarOpen ? `${chartSidebarWidth}px` : '0px' }}
        >
          <div className="shrink-0 border-b border-[#242424] bg-[#0b0b0b] px-3 py-2 space-y-2">
            <div className="flex items-center gap-2 min-w-0">
              <select
                value={sidePanelPrimarySymbol ?? chartState.symbol}
                onChange={(event) => openSymbolInSidebar(event.target.value)}
                className="min-w-[112px] max-w-[150px] bg-[#171717] border border-[#2a2a2a] text-white text-xs px-2 py-1 font-bold uppercase outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                aria-label="チャート銘柄"
              >
                {sidePanelSymbolOptions.map((option) => (
                  <option key={option.symbol} value={option.symbol}>
                    {option.symbol}
                  </option>
                ))}
              </select>

              {sidePanelComparisonSymbols.length > 0 && (
                <div className="min-w-0 flex items-center gap-1 overflow-x-auto scrollbar-none">
                  {sidePanelComparisonSymbols.map((symbol) => (
                    <span
                      key={symbol}
                      className="shrink-0 border border-[#2a2a2a] bg-[#171717]/80 px-1.5 py-0.5 text-[9px] font-mono font-bold text-emerald-300"
                    >
                      {symbol}
                    </span>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => compareSymbols(selectedSymbols.length > 0 ? selectedSymbols : sidePanelPrimarySymbol ? [sidePanelPrimarySymbol] : [])}
                disabled={selectedSymbols.length <= 1}
                className="ml-auto w-7 h-7 flex items-center justify-center border border-[#2a2a2a] bg-[#171717] text-gray-400 hover:text-white hover:bg-[#202020] disabled:opacity-30 disabled:cursor-not-allowed"
                title="選択中の銘柄を比較"
                aria-label="選択中の銘柄を比較"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex items-center bg-[#171717] border border-[#2a2a2a] p-0.5 gap-0.5 overflow-x-auto scrollbar-none">
                {CHART_TIMEFRAMES.map((timeframe) => (
                  <button
                    key={timeframe}
                    type="button"
                    onClick={() => updateChartState({ timeframe })}
                    className={`px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                      chartState.timeframe === timeframe
                        ? 'bg-emerald-600 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-[#202020]'
                    }`}
                  >
                    {formatTimeframeLabel(timeframe)}
                  </button>
                ))}
              </div>

              <div className="shrink-0 flex items-center gap-1 bg-[#171717]/70 px-1.5 py-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => updateChartState({ showVolume: !chartState.showVolume })}
                  className={`px-1 ${chartState.showVolume ? 'text-[#26a69a] font-bold bg-[#142d2a]' : 'text-gray-500 hover:text-gray-200'}`}
                  title="出来高を表示"
                >
                  VOL
                </button>
                <button
                  type="button"
                  onClick={() => updateChartState({ showRsi: !chartState.showRsi })}
                  className={`px-1 ${chartState.showRsi ? 'text-[#f3a14b] font-bold bg-[#342416]' : 'text-gray-500 hover:text-gray-200'}`}
                  title="RSIを表示"
                >
                  RSI
                </button>
                <button
                  type="button"
                  onClick={() => updateChartState({ showMacd: !chartState.showMacd })}
                  className={`px-1 ${chartState.showMacd ? 'text-emerald-400 font-bold bg-[#0f2a22]' : 'text-gray-500 hover:text-gray-200'}`}
                  title="MACDを表示"
                >
                  MACD
                </button>
                <button
                  type="button"
                  onClick={() => updateChartState({
                    zoomFactor: 8,
                    scrollOffsetPct: 100,
                    priceScale: 1,
                    priceOffsetPct: 0,
                    rsiHeightPct: 25,
                    macdHeightPct: 25,
                  })}
                  className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-white hover:bg-[#202020]"
                  title="チャート表示をリセット"
                  aria-label="チャート表示をリセット"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div
            className="flex-1 min-h-0 bg-[#090909]"
            onDragOver={(event) => {
              const hasSymbolPayload = event.dataTransfer.types.includes('text/plain')
                || event.dataTransfer.types.includes('application/x-mooview-symbols');
              if (!hasSymbolPayload) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(event) => {
              const symbols = readDroppedSymbols(event);
              if (symbols.length === 0) return;
              event.preventDefault();
              event.stopPropagation();
              addSymbolsToSidePanelComparison(symbols);
            }}
          >
            {sidePanelMode === 'indicators' && sidePanelPrimarySymbol ? (
              <div className="h-full min-h-0 overflow-y-auto bg-[#080808] p-2">
                {renderIndicatorSettings(sidePanelPrimarySymbol)}
              </div>
            ) : sidePanelPrimarySymbol ? (
              renderTickerChart({
                symbol: sidePanelPrimarySymbol,
                comparisonSymbols: sidePanelComparisonSymbols,
              })
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-gray-500">
                銘柄をダブルクリックしてください
              </div>
            )}
          </div>

          {comparisonPanelOpen && selectedSymbols.length > 0 && (
            <div className="max-h-36 shrink-0 overflow-y-auto border-t border-[#242424] bg-[#080808] p-2 space-y-1">
              {selectedSymbols.map((symbol) => {
                const stock = chain.groups.flatMap((group) => group.stocks).find((item) => item.symbol === symbol);
                const change = stock ? resolveChange(stock) : 0;
                return (
                  <div key={symbol} className="h-8 border border-[#242424] bg-[#101010] px-2 flex items-center justify-between text-[10px]">
                    <span className="font-bold text-gray-100 truncate">{stock?.name ?? symbol}</span>
                    <span className={`font-mono ${change >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{formatPct(change)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <nav className="relative w-11 shrink-0 bg-[#070707] border-l border-[#242424] flex flex-col items-center py-2 gap-1" data-no-pan="true">
          <button
            type="button"
            onClick={() => {
              if (chartSidebarOpen && sidePanelMode === 'chart') {
                setChartSidebarOpen(false);
                setSidePanelMode('chart');
              } else {
                openChartSidebar();
                setSidePanelMode('chart');
              }
            }}
            className={`w-9 h-10 flex items-center justify-center border transition ${
              chartSidebarOpen && sidePanelMode === 'chart'
                ? 'bg-[#202020] border-[#4a4a4a] text-white'
                : 'border-transparent text-gray-400 hover:text-white hover:bg-[#161616]'
            }`}
            title="バリューチェーンのチャートパネル"
            aria-label="バリューチェーンのチャートパネルを表示"
          >
            <ChartNoAxesCombined className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!chartSidebarOpen) {
                openChartSidebar();
              }
              setSidePanelMode('indicators');
            }}
            className={`w-9 h-9 flex items-center justify-center border transition ${
              chartSidebarOpen && sidePanelMode === 'indicators'
                ? 'bg-[#202020] border-[#4a4a4a] text-white'
                : 'border-transparent text-gray-400 hover:text-white hover:bg-[#161616]'
            }`}
            title="チャート設定"
            aria-label="チャート設定を表示"
          >
            <Settings className="w-4 h-4" />
          </button>
          <div className="my-1 h-px w-7 bg-[#242424]" />
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="w-9 h-9 flex items-center justify-center border border-transparent text-gray-400 hover:text-white hover:bg-[#161616]"
            title="CSV/JSONインポート"
            aria-label="CSV/JSONインポート"
          >
            <Upload className="w-4 h-4" />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setExportMenuOpen((open) => !open);
              }}
              className={`w-9 h-9 flex items-center justify-center border transition ${
                exportMenuOpen
                  ? 'bg-[#202020] border-[#4a4a4a] text-white'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-[#161616]'
              }`}
              title="エクスポート"
              aria-label="エクスポートメニューを開く"
            >
              <FileDown className="w-4 h-4" />
            </button>
            {exportMenuOpen && (
              <div
                className="absolute right-10 top-0 z-50 w-52 bg-[#080808] border border-[#303030] shadow-2xl py-1 text-[10px] text-gray-200"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    handleExportCsv();
                    setExportMenuOpen(false);
                  }}
                  className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
                  CSVエクスポート
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleExportJson();
                    setExportMenuOpen(false);
                  }}
                  className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left"
                >
                  <FileJson className="w-3.5 h-3.5 text-sky-300" />
                  JSONエクスポート
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDownloadSpec();
                    setExportMenuOpen(false);
                  }}
                  className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left"
                >
                  <FileDown className="w-3.5 h-3.5 text-gray-300" />
                  テンプレート仕様書
                </button>
              </div>
            )}
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,.json,application/json,text/csv"
            className="hidden"
            onChange={handleImportFile}
          />
        </nav>
      </div>
    </div>
  );
}
