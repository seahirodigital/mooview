import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileDown,
  FileJson,
  FileSpreadsheet,
  Maximize2,
  MoreVertical,
  PanelRightOpen,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { TickerInfo } from '../types';

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

interface TickerStat extends TickerInfo {
  currentPrice: number | null;
  computedChange: number | null;
}

interface ValueChainMapProps {
  tickers: TickerStat[];
  onOpenTickerInChart: (symbol: string) => void;
  onAddSymbolsToWatchlist: (symbols: string[]) => void;
  onCompareSymbols: (symbols: string[]) => void;
}

type HeaderMenuTarget =
  | { type: 'segment'; id: string; label: string }
  | { type: 'category'; id: string; label: string }
  | { type: 'group'; id: string; label: string };

type ContextMenu =
  | { x: number; y: number; target: HeaderMenuTarget }
  | { x: number; y: number; target: { type: 'stock'; groupId: string; symbol: string; label: string } }
  | { x: number; y: number; target: { type: 'empty-cell'; categoryId: string; laneId: string; segmentId: string; label: string } };

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
const todayString = () => new Date().toISOString().slice(0, 10);

function normalizeSymbol(symbol: string): string {
  const trimmed = symbol.trim();
  if (/^\d{3,5}$/.test(trimmed)) return `JP.${trimmed}`;
  return trimmed.toUpperCase();
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
      segment?.id ?? '',
      segment?.name.replace(/\n/g, ' / ') ?? '',
      category?.id ?? '',
      category?.name ?? '',
      lane?.id ?? '',
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

function validateChainData(value: unknown): ValueChainData | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<ValueChainData>;
  if (!Array.isArray(source.stages) || !Array.isArray(source.categories) || !Array.isArray(source.groups)) {
    return null;
  }
  return {
    name: typeof source.name === 'string' && source.name.trim() ? source.name : 'インポート済みバリューチェーン',
    stages: source.stages,
    categories: source.categories,
    groups: source.groups,
  };
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
  onOpenTickerInChart,
  onAddSymbolsToWatchlist,
  onCompareSymbols,
}: ValueChainMapProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [chain, setChain] = useState<ValueChainData>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_VALUE_CHAIN;
    try {
      return validateChainData(JSON.parse(saved)) ?? DEFAULT_VALUE_CHAIN;
    } catch {
      return DEFAULT_VALUE_CHAIN;
    }
  });
  const [sortMode, setSortMode] = useState<SortMode>('change');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('day');
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [ioMenuOpen, setIoMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);
  const [comparisonPanelOpen, setComparisonPanelOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ mouseX: 0, mouseY: 0, x: 0, y: 0 });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chain));
  }, [chain]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  useEffect(() => {
    if (!detailSymbol && !comparisonPanelOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDetailSymbol(null);
        setComparisonPanelOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [comparisonPanelOpen, detailSymbol]);

  const displayDate = previousBusinessDate(selectedDate);
  const isToday = selectedDate === todayString();
  const referenceLabel = displayDate === selectedDate ? selectedDate : `${selectedDate} -> ${displayDate}`;
  const tickerStats = useMemo(() => {
    return new Map(tickers.map((ticker) => [ticker.symbol.toUpperCase(), ticker]));
  }, [tickers]);
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
  const selectedSet = useMemo(() => new Set(selectedSymbols), [selectedSymbols]);

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
    const nextName = window.prompt('グループ名を編集', group.name);
    if (!nextName) return;
    setChain((current) => ({
      ...current,
      groups: current.groups.map((item) => item.id === groupId ? { ...item, name: nextName.trim() || item.name } : item),
    }));
  };

  const updateHeaderName = (target: HeaderMenuTarget) => {
    const nextName = window.prompt('名前を編集', target.label);
    if (!nextName) return;
    setChain((current) => {
      if (target.type === 'segment') {
        return {
          ...current,
          stages: current.stages.map((stage) => ({
            ...stage,
            segments: stage.segments.map((segment) => segment.id === target.id ? { ...segment, name: nextName.trim() || segment.name } : segment),
          })),
        };
      }
      if (target.type === 'category') {
        return {
          ...current,
          categories: current.categories.map((category) => category.id === target.id ? { ...category, name: nextName.trim() || category.name } : category),
        };
      }
      return {
        ...current,
        groups: current.groups.map((group) => group.id === target.id ? { ...group, name: nextName.trim() || group.name } : group),
      };
    });
  };

  const addStockToGroup = (groupId: string) => {
    const rawSymbol = window.prompt('追加する銘柄コードを入力');
    if (!rawSymbol) return;
    const symbol = normalizeSymbol(rawSymbol);
    const rawName = window.prompt('銘柄名を入力', symbol);
    const live = tickerStats.get(symbol);
    const stock: ChainStock = {
      symbol,
      name: rawName?.trim() || live?.name || symbol,
      market: symbol.startsWith('JP.') ? 'JP' : 'US',
      marketCap: 0,
      baseChangePct: live?.computedChange ?? 0,
    };
    setChain((current) => ({
      ...current,
      groups: current.groups.map((group) => group.id === groupId ? { ...group, stocks: [...group.stocks, stock] } : group),
    }));
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
    window.setTimeout(() => addStockToGroup(groupId), 0);
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

  const handleExportJson = () => {
    downloadText('mooview-value-chain-template.json', 'application/json;charset=utf-8', JSON.stringify(chain, null, 2));
    setIoMenuOpen(false);
  };

  const handleExportCsv = () => {
    downloadText('mooview-value-chain-template.csv', 'text/csv;charset=utf-8', createCsv(chain));
    setIoMenuOpen(false);
  };

  const handleDownloadSpec = () => {
    downloadText('mooview-value-chain-template-spec.md', 'text/markdown;charset=utf-8', createTemplateSpec(chain));
    setIoMenuOpen(false);
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const text = await file.text();
    if (file.name.toLowerCase().endsWith('.json')) {
      const imported = validateChainData(JSON.parse(text));
      if (imported) setChain(imported);
      return;
    }
    const rows = parseCsv(text);
    const groups = new Map<string, ValueGroup>();
    rows.forEach((row) => {
      const groupId = row.groupId?.trim();
      if (!groupId) return;
      const existing = groups.get(groupId);
      const stockSymbol = normalizeSymbol(row.symbol ?? '');
      const stock = stockSymbol
        ? {
            symbol: stockSymbol,
            name: row.name?.trim() || stockSymbol,
            market: row.market?.trim() || (stockSymbol.startsWith('JP.') ? 'JP' : 'US'),
            marketCap: Number(row.marketCap) || 0,
            baseChangePct: Number(row.baseChangePct) || 0,
          }
        : null;
      const nextGroup: ValueGroup = existing ?? {
        id: groupId,
        categoryId: row.categoryId?.trim() || '',
        laneId: row.laneId?.trim() || '',
        segmentId: row.segmentId?.trim() || '',
        name: row.groupName?.trim() || groupId,
        stocks: [],
      };
      if (stock) nextGroup.stocks = [...nextGroup.stocks, stock];
      groups.set(groupId, nextGroup);
    });
    if (groups.size > 0) {
      setChain((current) => ({
        ...current,
        name: rows[0]?.chainName?.trim() || current.name,
        groups: Array.from(groups.values()),
      }));
    }
  };

  const moveDate = (direction: -1 | 1) => {
    const date = new Date(`${selectedDate}T12:00:00`);
    date.setDate(date.getDate() + (periodMode === 'week' ? 7 * direction : direction));
    setSelectedDate(date.toISOString().slice(0, 10));
  };

  const toggleSelectSymbol = (symbol: string) => {
    setSelectedSymbols((current) => (
      current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : [...current, symbol]
    ));
  };

  const compareSymbols = (symbols: string[]) => {
    const uniqueSymbols = Array.from(new Set(symbols)).filter(Boolean);
    if (uniqueSymbols.length === 0) return;
    setSelectedSymbols(uniqueSymbols);
    setComparisonPanelOpen(true);
    onAddSymbolsToWatchlist(uniqueSymbols);
    onCompareSymbols(uniqueSymbols);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const detailStock = useMemo(() => {
    if (!detailSymbol) return null;
    for (const group of chain.groups) {
      const stock = group.stocks.find((item) => item.symbol === detailSymbol);
      if (stock) return { stock, group };
    }
    return null;
  }, [chain.groups, detailSymbol]);

  const gridTemplateColumns = '132px 64px ' + segments.map(() => '142px').join(' ');
  const canvasWidth = 196 + segments.length * 142;

  return (
    <div className="flex-1 min-h-0 bg-[#050505] text-[#d1d4dc] flex flex-col overflow-hidden">
      <div className="h-12 border-b border-[#202020] bg-[#080808] px-3 shrink-0 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-8 bg-emerald-500 rounded-full" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">{chain.name}</div>
              <div className="text-[10px] text-[#848e9c] truncate">工程 x カテゴリ x 銘柄ヒートマップ</div>
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
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0" data-no-pan="true">
          <div className="flex items-center gap-1 bg-[#101010] border border-[#242424] h-8 px-1.5">
            <button type="button" onClick={() => moveDate(-1)} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white" title="前へ" aria-label="前へ">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <CalendarDays className="w-3.5 h-3.5 text-emerald-300" />
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="bg-transparent text-[10px] text-gray-200 outline-none w-[116px]"
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
          <div className="relative">
            <button
              type="button"
              onClick={() => setIoMenuOpen((open) => !open)}
              className="w-8 h-8 border border-[#242424] bg-[#101010] flex items-center justify-center text-gray-300 hover:text-white hover:bg-[#181818]"
              title="インポートとエクスポート"
              aria-label="インポートとエクスポート"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {ioMenuOpen && (
              <div className="absolute right-0 top-9 z-40 w-56 bg-[#080808] border border-[#303030] shadow-2xl py-1 text-[10px]">
                <button type="button" onClick={handleExportCsv} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
                  CSVエクスポート
                </button>
                <button type="button" onClick={handleExportJson} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left">
                  <FileJson className="w-3.5 h-3.5 text-sky-300" />
                  JSONエクスポート
                </button>
                <button type="button" onClick={() => importInputRef.current?.click()} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left">
                  <Upload className="w-3.5 h-3.5 text-gray-300" />
                  CSV/JSONインポート
                </button>
                <button type="button" onClick={handleExportCsv} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left">
                  <Download className="w-3.5 h-3.5 text-gray-300" />
                  テンプレートダウンロード
                </button>
                <button type="button" onClick={handleDownloadSpec} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left">
                  <FileDown className="w-3.5 h-3.5 text-gray-300" />
                  テンプレート仕様書
                </button>
              </div>
            )}
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,.json,application/json,text/csv"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>
        </div>
      </div>

      <div className="h-8 border-b border-[#181818] bg-[#060606] px-3 shrink-0 flex items-center justify-between text-[10px] text-[#848e9c]">
        <div className="flex items-center gap-4 min-w-0">
          <span className="truncate">参照日: <b className="text-gray-200 font-mono">{referenceLabel}</b></span>
          <span className="truncate">銘柄数: <b className="text-gray-200">{chain.groups.reduce((sum, group) => sum + group.stocks.length, 0)}</b></span>
          <span className="truncate">空セル維持: <b className="text-emerald-300">ON</b></span>
          {multiSelectMode && <span className="text-emerald-300">複数選択: {selectedSymbols.length}件</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0" data-no-pan="true">
          <button type="button" onClick={() => setZoom((value) => clamp(value - 0.1, 0.55, 1.6))} className="h-6 px-2 border border-[#242424] bg-[#101010] hover:bg-[#181818]" aria-label="縮小">-</button>
          <span className="font-mono text-gray-300 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => clamp(value + 0.1, 0.55, 1.6))} className="h-6 px-2 border border-[#242424] bg-[#101010] hover:bg-[#181818]" aria-label="拡大">+</button>
          <button type="button" onClick={resetView} className="h-6 px-2 border border-[#242424] bg-[#101010] hover:bg-[#181818] flex items-center gap-1">
            <RotateCcw className="w-3 h-3" />
            リセット
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`relative flex-1 min-h-0 overflow-hidden bg-[#050505] ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
        onWheel={(event) => {
          event.preventDefault();
          const nextZoom = clamp(zoom + (event.deltaY > 0 ? -0.06 : 0.06), 0.55, 1.6);
          setZoom(nextZoom);
        }}
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target as HTMLElement;
          if (target.closest('[data-no-pan="true"],button,input,select,a')) return;
          setIsPanning(true);
          setPanStart({ mouseX: event.clientX, mouseY: event.clientY, x: pan.x, y: pan.y });
        }}
        onMouseMove={(event) => {
          if (!isPanning) return;
          setPan({
            x: panStart.x + event.clientX - panStart.mouseX,
            y: panStart.y + event.clientY - panStart.mouseY,
          });
        }}
        onMouseUp={() => setIsPanning(false)}
        onMouseLeave={() => setIsPanning(false)}
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
            <div className="bg-[#101010] border-r border-b border-[#252525]" />
            <div className="bg-[#101010] border-r border-b border-[#252525]" />
            {chain.stages.map((stage) => (
              <div
                key={stage.id}
                className="h-8 bg-[#1d1d1f] border-r border-b border-[#353535] flex items-center justify-center text-gray-200 font-bold"
                style={{ gridColumn: `span ${stage.segments.length}` }}
              >
                {stage.name}
              </div>
            ))}

            <div className="h-10 bg-[#101010] border-r border-b border-[#252525]" />
            <div className="h-10 bg-[#101010] border-r border-b border-[#252525]" />
            {segments.map((segment) => {
              const stage = findStage(chain, segment.id);
              return (
                <button
                  key={segment.id}
                  type="button"
                  data-no-pan="true"
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({ x: event.clientX, y: event.clientY, target: { type: 'segment', id: segment.id, label: segment.name } });
                  }}
                  className="h-10 bg-[#202022] border-r border-b border-[#353535] px-2 text-center hover:bg-[#29292b] transition"
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
                    className="min-h-[132px] bg-[#111214] border-r border-b border-[#252525] p-1.5"
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
                    data-no-pan="true"
                  >
                    {groups.length === 0 ? (
                      <div
                        className="h-full min-h-[116px] border border-dashed border-[#252525] bg-[#0d0d0e] hover:border-[#3f3f46] hover:bg-[#121214] transition"
                        title="該当銘柄0件の空白枠。右クリックで銘柄追加"
                      />
                    ) : (
                      <div className="space-y-1.5">
                        {groups.map((group) => (
                          <div
                            key={group.id}
                            className="border border-[#2b2b2b] bg-[#0b0b0b] p-1.5"
                            onContextMenu={(event) => {
                              event.preventDefault();
                              setContextMenu({ x: event.clientX, y: event.clientY, target: { type: 'group', id: group.id, label: group.name } });
                            }}
                            data-no-pan="true"
                          >
                            <button
                              type="button"
                              className="w-full text-left text-[9px] font-bold text-gray-300 hover:text-white truncate mb-1"
                              onClick={() => updateGroupName(group.id)}
                              title={`${findStage(chain, group.segmentId)?.name ?? ''} / ${findSegment(chain, group.segmentId)?.name.replace(/\n/g, ' ') ?? ''} / ${group.name}`}
                            >
                              {group.name}
                            </button>
                            <div className="grid grid-cols-2 gap-1">
                              {sortedStocks(group.stocks).map((stock) => {
                                const change = resolveChange(stock);
                                const live = tickerStats.get(stock.symbol.toUpperCase());
                                const selected = selectedSet.has(stock.symbol);
                                return (
                                  <button
                                    key={`${group.id}-${stock.symbol}`}
                                    type="button"
                                    className={`min-h-[38px] border px-1.5 py-1 text-left transition hover:ring-1 hover:ring-white/50 ${selected ? 'ring-2 ring-emerald-300' : ''}`}
                                    style={getHeatStyle(change)}
                                    title={`${findStage(chain, group.segmentId)?.name ?? ''} / ${findSegment(chain, group.segmentId)?.name.replace(/\n/g, ' ') ?? ''}\n${stock.name}\n${periodMode === 'week' ? '5日間変動率' : '前日比'} ${formatPct(change)}`}
                                    onClick={() => {
                                      if (multiSelectMode) {
                                        toggleSelectSymbol(stock.symbol);
                                      } else {
                                        setDetailSymbol(stock.symbol);
                                      }
                                    }}
                                    onDoubleClick={() => setDetailSymbol(stock.symbol)}
                                    onContextMenu={(event) => {
                                      event.preventDefault();
                                      setContextMenu({ x: event.clientX, y: event.clientY, target: { type: 'stock', groupId: group.id, symbol: stock.symbol, label: stock.name } });
                                    }}
                                  >
                                    <span className="block text-[9px] font-bold text-white truncate">{stock.name}</span>
                                    <span className="block text-[9px] font-mono text-white/85 truncate">{stock.symbol}</span>
                                    <span className="block text-[9px] font-mono text-white">{formatPct(change)}</span>
                                    {live?.currentPrice !== null && live?.currentPrice !== undefined && (
                                      <span className="block text-[8px] text-white/65 truncate">{live.currentPrice.toLocaleString()}</span>
                                    )}
                                  </button>
                                );
                              })}
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
                <div key={`${category.id}-${lane.id}-lane`} className="bg-[#151618] border-r border-b border-[#2a2a2a] flex items-center justify-center px-1 text-gray-300 font-bold">
                  {lane.name}
                </div>,
                ...rowCells,
              ];
            }))}
          </div>
        </div>

        <div className="absolute left-3 bottom-3 bg-[#080808]/95 border border-[#242424] px-3 py-2 text-[10px] text-gray-400 flex items-center gap-3 pointer-events-none">
          <Maximize2 className="w-3.5 h-3.5 text-emerald-300" />
          <span>ドラッグで移動、ホイールで拡大縮小</span>
          <span className="text-[#303030]">|</span>
          <span>赤 -5% / 黒 0% / 緑 +5%</span>
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
              <button type="button" onClick={() => { addStockToGroup(contextMenu.target.groupId); setContextMenu(null); }} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left">
                <Plus className="w-3.5 h-3.5" />
                銘柄追加
              </button>
              <button type="button" onClick={() => { removeStockFromGroup(contextMenu.target.groupId, contextMenu.target.symbol); setContextMenu(null); }} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-red-950/30 text-red-300 text-left">
                <Trash2 className="w-3.5 h-3.5" />
                銘柄削除
              </button>
              <button type="button" onClick={() => { setMultiSelectMode(true); toggleSelectSymbol(contextMenu.target.symbol); setContextMenu(null); }} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left">
                <CheckSquare className="w-3.5 h-3.5" />
                複数選択
              </button>
              <button type="button" onClick={() => { onOpenTickerInChart(contextMenu.target.symbol); setContextMenu(null); }} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left">
                <ExternalLink className="w-3.5 h-3.5" />
                既存チャートで表示
              </button>
              <button type="button" onClick={() => { compareSymbols(selectedSymbols.length > 0 ? selectedSymbols : [contextMenu.target.symbol]); setContextMenu(null); }} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left">
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
                <button type="button" onClick={() => { addStockToGroup(contextMenu.target.id); setContextMenu(null); }} className="w-full px-2.5 py-2 flex items-center gap-2 hover:bg-[#171717] text-left">
                  <Plus className="w-3.5 h-3.5" />
                  グループへ銘柄追加
                </button>
              )}
              <button type="button" className="w-full px-2.5 py-2 flex items-center gap-2 text-gray-600 cursor-not-allowed text-left" disabled>
                <SlidersHorizontal className="w-3.5 h-3.5" />
                行/列の追加はTODO
              </button>
              <button type="button" className="w-full px-2.5 py-2 flex items-center gap-2 text-gray-600 cursor-not-allowed text-left" disabled>
                <Trash2 className="w-3.5 h-3.5" />
                行/列の削除はTODO
              </button>
            </>
          )}
        </div>
      )}

      {(detailStock || comparisonPanelOpen) && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDetailSymbol(null);
              setComparisonPanelOpen(false);
            }
          }}
        >
        <div className="absolute inset-y-0 right-0 w-[380px] max-w-[92vw] bg-[#080808] border-l border-[#303030] shadow-2xl flex flex-col">
          <div className="h-11 border-b border-[#242424] px-3 flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">{comparisonPanelOpen ? '比較サイドパネル' : detailStock?.stock.name}</div>
              <div className="text-[10px] text-gray-500 truncate">{comparisonPanelOpen ? `${selectedSymbols.length}銘柄を既存ウォッチリストへ連携` : detailStock?.stock.symbol}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setDetailSymbol(null);
                setComparisonPanelOpen(false);
              }}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white"
              aria-label="サイドパネルを閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {comparisonPanelOpen ? (
            <div className="p-3 space-y-2 overflow-y-auto">
              <div className="bg-[#101010] border border-[#242424] p-3 text-[11px] leading-relaxed text-gray-300">
                選択銘柄は既存ウォッチリストへ追加済みです。既存チャート側の比較ラインにも同じ銘柄を連携します。
              </div>
              {selectedSymbols.map((symbol) => {
                const stock = chain.groups.flatMap((group) => group.stocks).find((item) => item.symbol === symbol);
                const change = stock ? resolveChange(stock) : 0;
                return (
                  <div key={symbol} className="h-10 border border-[#242424] bg-[#101010] px-2 flex items-center justify-between">
                    <span className="font-bold text-gray-100 text-xs truncate">{stock?.name ?? symbol}</span>
                    <span className={`font-mono text-[11px] ${change >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{formatPct(change)}</span>
                  </div>
                );
              })}
            </div>
          ) : detailStock && (
            <div className="p-3 space-y-3 overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-[#101010] border border-[#242424] p-2">
                  <span className="block text-gray-500">グループ</span>
                  <span className="block text-gray-100 font-bold truncate">{detailStock.group.name}</span>
                </div>
                <div className="bg-[#101010] border border-[#242424] p-2">
                  <span className="block text-gray-500">変動率</span>
                  <span className={`block font-mono font-bold ${resolveChange(detailStock.stock) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{formatPct(resolveChange(detailStock.stock))}</span>
                </div>
                <div className="bg-[#101010] border border-[#242424] p-2">
                  <span className="block text-gray-500">市場</span>
                  <span className="block text-gray-100 font-bold">{detailStock.stock.market}</span>
                </div>
                <div className="bg-[#101010] border border-[#242424] p-2">
                  <span className="block text-gray-500">時価総額</span>
                  <span className="block text-gray-100 font-bold font-mono">{detailStock.stock.marketCap.toLocaleString()}</span>
                </div>
              </div>
              <div className="h-48 bg-[#101010] border border-[#242424] p-3">
                <div className="text-[10px] text-gray-500 mb-2">簡易チャート</div>
                <svg viewBox="0 0 320 130" className="w-full h-[130px] overflow-visible">
                  <polyline
                    fill="none"
                    stroke={resolveChange(detailStock.stock) >= 0 ? '#34d399' : '#f87171'}
                    strokeWidth="2"
                    points={Array.from({ length: 18 }).map((_, index) => {
                      const seed = dateSeed(`${detailStock.stock.symbol}-${index}-${displayDate}`);
                      const x = (index / 17) * 320;
                      const y = 65 - resolveChange(detailStock.stock) * 4 + (seed - 0.5) * 42;
                      return `${x},${clamp(y, 12, 118)}`;
                    }).join(' ')}
                  />
                </svg>
              </div>
              <button
                type="button"
                onClick={() => onOpenTickerInChart(detailStock.stock.symbol)}
                className="w-full h-9 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                既存チャートで表示
              </button>
            </div>
          )}
        </div>
        </div>
      )}
    </div>
  );
}
