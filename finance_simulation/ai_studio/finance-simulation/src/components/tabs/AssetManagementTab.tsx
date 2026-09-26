import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { AssetItem, AssetCategory, IncomeItem, ExpenseItem, TimelineColumn } from '../../types';
import { EditableCell } from '../common/EditableCell';
import { MonthlyAssetLineChart, PortfolioDonutChart } from '../charts/InteractiveChart';
import { DividendTimeline } from './DividendTimeline';
import { lookupYahooFinanceTicker } from '../../services/yahooFinance';
import {
  calculateAssetAmountManYen,
  fetchYahooFinanceCurrentQuote,
  fetchYahooFinanceUsdJpy,
  isJapaneseMutualFundCode,
  type YahooFinanceCurrentQuote,
} from '../../services/mooviewQuote';
import {
  Plus,
  Trash2,
  Copy,
  GripVertical,
  X,
  RotateCcw,
  Palette,
  Type,
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Percent,
  Eye,
  EyeOff,
} from 'lucide-react';

const CATEGORY_META: Record<AssetCategory, { label: string; color: string }> = {
  core_stocks: { label: 'コア株式 (S&P500)', color: 'var(--color-finance-accent)' },
  dividend_stocks: { label: '高配当資産 (ETF/投信)', color: 'var(--color-finance-accent-strong)' },
  cash: { label: '生活防衛資金 (預金)', color: 'var(--color-finance-accent-muted)' },
  illiquid_other: { label: '金・確定拠出・その他', color: 'var(--color-finance-accent-mid)' },
};

const FINANCE_CHART_COLORS = [
  'var(--color-finance-accent)',
  'var(--color-finance-accent-strong)',
  'var(--color-finance-accent-mid)',
  'var(--color-finance-accent-muted)',
  'var(--color-finance-accent-on-dark)',
];

type AssetColumnKey = 'drag' | 'category' | 'name' | 'ticker' | 'institution' | 'shares' | 'averageCost' | 'currentPrice' | 'amount' | 'share';

const DEFAULT_ASSET_COLUMNS: { key: AssetColumnKey; label: string; minWidth: number; defaultWidth: number; align: 'left' | 'right' | 'center' }[] = [
  { key: 'drag', label: '順序', minWidth: 40, defaultWidth: 44, align: 'center' },
  { key: 'category', label: '区分', minWidth: 120, defaultWidth: 140, align: 'left' },
  { key: 'name', label: '資産名称', minWidth: 150, defaultWidth: 200, align: 'left' },
  { key: 'ticker', label: 'ティッカー', minWidth: 80, defaultWidth: 90, align: 'left' },
  { key: 'institution', label: '口座 / 機関', minWidth: 100, defaultWidth: 130, align: 'left' },
  { key: 'shares', label: '保有枚数/口数', minWidth: 100, defaultWidth: 120, align: 'center' },
  { key: 'averageCost', label: '平均取得単価', minWidth: 100, defaultWidth: 120, align: 'center' },
  { key: 'currentPrice', label: '現在値', minWidth: 90, defaultWidth: 110, align: 'center' },
  { key: 'amount', label: '現在評価額 (万円)', minWidth: 120, defaultWidth: 140, align: 'center' },
  { key: 'share', label: '構成比', minWidth: 70, defaultWidth: 80, align: 'center' },
];

// 過去の表示設定に新しい列が含まれていなくても、必要な集計列は必ず表示する。
const normalizeAssetColumnKeys = (value: unknown): AssetColumnKey[] => {
  const defaultKeys = DEFAULT_ASSET_COLUMNS.map((column) => column.key);
  const savedKeys = Array.isArray(value)
    ? value.filter((key): key is AssetColumnKey => defaultKeys.includes(key as AssetColumnKey))
    : [];
  return [...savedKeys, ...defaultKeys.filter((key) => !savedKeys.includes(key))];
};

const FUND_IDENTITY_STOP_WORDS = new Set(['the', 'fund', 'investment', 'trust', 'jp', 'us']);

// Yahooの日本語ファンド名・愛称と、ユーザーが入力した短い表示名を照合する。
const fundIdentityTokens = (value: unknown): string[] => {
  const normalized = String(value ?? '')
    .toLowerCase()
    .replace(/フィデリティ/g, 'fidelity')
    .replace(/投資信託|ファンド|株式/g, ' ')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2');
  const matches = normalized.match(/[a-z0-9]+|[一-龯ぁ-んァ-ヶ]{2,}/g);
  const rawTokens = Array.from(matches || []);
  const tokens: string[] = [];
  for (let index = 0; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    const next = rawTokens[index + 1];
    if (/^\d$/.test(token) && /^[a-z]$/i.test(next || '')) {
      tokens.push(`${token}${next}`.toLowerCase());
      index += 1;
    } else {
      tokens.push(token.toLowerCase());
    }
  }
  return tokens.filter((token) => token.length >= 2 && !FUND_IDENTITY_STOP_WORDS.has(token));
};

const fundQuoteMatchesAssetName = (assetName: string, quote: YahooFinanceCurrentQuote): boolean => {
  const assetTokens = new Set(fundIdentityTokens(assetName));
  if (assetTokens.size === 0) return false;
  const quoteTokens = [...fundIdentityTokens(quote.name), ...(quote.aliases || []).flatMap(fundIdentityTokens)];
  return quoteTokens.some((token) => assetTokens.has(token));
};

const PRESET_COLORS = [
  { label: 'なし (標準)', value: '' },
  { label: '淡いブランドブルー', value: 'var(--color-finance-accent-subtle)' },
  { label: 'やわらかいブルー', value: 'var(--color-finance-accent-soft)' },
  { label: 'ニュートラル', value: 'var(--color-finance-surface)' },
  { label: '濃いブランドブルー', value: 'var(--color-finance-accent-strong)' },
  { label: '注意（赤字）', value: 'color-mix(in srgb, var(--color-finance-negative) 14%, transparent)' },
];

const PRESET_TEXT_COLORS = [
  { label: '標準 (黒/白)', value: '' },
  { label: '本文', value: 'var(--color-finance-ink)' },
  { label: 'ブランドブルー', value: 'var(--color-finance-accent)' },
  { label: 'プラス', value: 'var(--color-finance-positive)' },
  { label: 'マイナス', value: 'var(--color-finance-negative)' },
];

export const AssetManagementTab: React.FC = () => {
  const {
    assets,
    cashTotal,
    coreStocksTotal,
    dividendStocksTotal,
    totalInvestedDividends,
    calculatedDividends,
    totalMonthlyDividend,
    totalAnnualDividend,
    overallNetYield,
    illiquidTotal,
    netWorthTotal,
    addAsset,
    updateAsset,
    deleteAsset,
    moveAsset,
    reorderAssets,
    categoryOrder,
    moveCategoryOrder,
    assetTableLayout,
    updateAssetTableLayout,
    customAssetCategories,
    registerCustomAssetCategory,
    deleteCustomAssetCategory,
    renameCustomAssetCategory,
    incomes,
    addIncome,
    updateIncome,
    deleteIncome,
    moveIncome,
    addCashflowRowAfter,
    moveCashflowRow,
    expenses,
    addExpense,
    updateExpense,
    deleteExpense,
    moveExpense,
    monthlyOverrides,
    setMonthlyOverrides,
    updateMonthlyCell,
    getMonthlyDividendForCol,
    timelineColumns,
    deleteTimelineColumn,
    moveTimelineColumn,
    addNextYearColumns,
    customStyles,
    updateCustomStyle,
    customLabels,
    updateCustomLabel,
    undo,
    canUndo,
    theme,
  } = useApp();

  const isDark = theme === 'dark';
  const categoryMetaFor = (category: AssetCategory) => CATEGORY_META[category]
    || customAssetCategories.find((item) => item.id === category)
    || { label: category, color: 'var(--color-finance-muted)' };
  const labelFor = (id: string, fallback: string) => customLabels[id] || fallback;
  const uniqueAssetName = (baseName: string, copyMode = false) => {
    const base = String(baseName || '新規資産').trim() || '新規資産';
    const first = copyMode ? `${base} (コピー)` : base;
    if (!assets.some((asset) => asset.name === first)) return first;
    let index = copyMode ? 2 : 1;
    let candidate = copyMode ? `${base} (コピー${index})` : `${base}${index}`;
    while (assets.some((asset) => asset.name === candidate)) {
      index += 1;
      candidate = copyMode ? `${base} (コピー${index})` : `${base}${index}`;
    }
    return candidate;
  };
  const categoryOptions = [
    ...Object.entries(CATEGORY_META).map(([id, meta]) => ({ id: id as AssetCategory, ...meta })),
    ...customAssetCategories,
  ];

  // Category filter
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [maskAssetAmounts, setMaskAssetAmounts] = useState<boolean>(() => {
    try {
      return localStorage.getItem('finance_simulation_mask_asset_amounts') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('finance_simulation_mask_asset_amounts', String(maskAssetAmounts));
    } catch {}
  }, [maskAssetAmounts]);

  // Modals
  const [showAddAssetModal, setShowAddAssetModal] = useState<boolean>(false);
  const [showAddIncomeModal, setShowAddIncomeModal] = useState<boolean>(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState<boolean>(false);
  const [singleCellEditModal, setSingleCellEditModal] = useState<{
    open: boolean;
    itemId: string;
    colId: string;
    itemName: string;
    currentValue: number;
  }>({ open: false, itemId: '', colId: '', itemName: '', currentValue: 0 });
  const [headerTextEditModal, setHeaderTextEditModal] = useState<{ open: boolean; id: string; label: string }>({ open: false, id: '', label: '' });
  const [styleScope, setStyleScope] = useState<'cell' | 'row' | 'col'>('cell');

  // New item states
  const [newAsset, setNewAsset] = useState<Omit<AssetItem, 'id'>>({
    category: 'cash',
    name: '',
    ticker: '',
    amount: 100,
    shares: 0,
    averageCost: 0,
    currentPrice: 0,
    institution: '三井住友銀行',
    note: '',
  });

  const [newIncome, setNewIncome] = useState<Omit<IncomeItem, 'id'>>({
    name: '',
    amount: 10,
    isRecurring: true,
    category: 'other',
    note: '',
  });

  const [newExpense, setNewExpense] = useState<Omit<ExpenseItem, 'id'>>({
    name: '',
    amount: 5,
    category: 'variable',
    note: '',
  });

  // Drag and drop state for asset rows
  // 行の並び替えは表示中の絞り込み配列ではなく、資産IDで元配列を移動する。
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);

  // Persistent column widths for asset portfolio table
  const [colWidths, setColWidths] = useState<Record<AssetColumnKey, number>>(() => {
    const defaults = Object.fromEntries(DEFAULT_ASSET_COLUMNS.map((column) => [column.key, column.defaultWidth])) as Record<AssetColumnKey, number>;
    try {
      const saved = localStorage.getItem('finance_simulation_asset_col_widths_v2');
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        return DEFAULT_ASSET_COLUMNS.reduce((next, column) => {
          const width = Number(parsed[column.key]);
          next[column.key] = Number.isFinite(width) && width >= column.minWidth ? width : column.defaultWidth;
          return next;
        }, { ...defaults });
      }
    } catch {}
    return defaults;
  });

  // Persistent column order for asset portfolio table
  const [columnKeys, setColumnKeys] = useState<AssetColumnKey[]>(() => {
    try {
      const saved = localStorage.getItem('finance_simulation_asset_col_order_v2');
      if (saved) return normalizeAssetColumnKeys(JSON.parse(saved));
    } catch {}
    return normalizeAssetColumnKeys([]);
  });

  // 列の順序・幅も端末固有にせず、クラウド元帳から反映する。
  useEffect(() => {
    if (assetTableLayout.columnOrder.length > 0) {
      setColumnKeys(normalizeAssetColumnKeys(assetTableLayout.columnOrder));
    }
    if (Object.keys(assetTableLayout.columnWidths).length > 0) {
      setColWidths((previous) => DEFAULT_ASSET_COLUMNS.reduce((next, column) => {
        const width = Number(assetTableLayout.columnWidths[column.key]);
        next[column.key] = Number.isFinite(width) && width >= column.minWidth ? width : previous[column.key];
        return next;
      }, { ...previous }));
    }
  }, [assetTableLayout]);

  // Asset column resizing state
  const resizingColRef = useRef<{ key: AssetColumnKey; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingColRef.current) return;
      const { key, startX, startWidth } = resizingColRef.current;
      const colDef = DEFAULT_ASSET_COLUMNS.find(c => c.key === key);
      const minW = colDef?.minWidth || 40;
      const newWidth = Math.max(minW, startWidth + (e.clientX - startX));
      setColWidths(prev => {
        const next = { ...prev, [key]: newWidth };
        try {
          localStorage.setItem('finance_simulation_asset_col_widths_v2', JSON.stringify(next));
        } catch {}
        updateAssetTableLayout({ columnWidths: next });
        return next;
      });
    };

    const handleMouseUp = () => {
      resizingColRef.current = null;
      document.body.style.cursor = 'default';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [updateAssetTableLayout]);

  // Context menu state (rich right-click for cell, row, col, header)
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    targetType: 'cell' | 'row' | 'col' | 'header';
    rowId?: string;
    colId?: string;
    label?: string;
    currentValue?: number;
    assetItem?: AssetItem;
    categoryId?: AssetCategory;
  } | null>(null);

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    setStyleScope(contextMenu.targetType === 'col' ? 'col' : contextMenu.targetType === 'cell' ? 'cell' : 'row');
  }, [contextMenu]);

  const styleTargetForMenu = () => {
    if (!contextMenu) return null;
    const scope = contextMenu.targetType === 'row' || contextMenu.targetType === 'header' ? 'row' : styleScope;
    if (scope === 'cell' && contextMenu.rowId && contextMenu.colId) {
      return { type: 'cell' as const, id: `${contextMenu.rowId}_${contextMenu.colId}` };
    }
    if (scope === 'col' && contextMenu.colId) return { type: 'col' as const, id: contextMenu.colId };
    if (contextMenu.rowId) return { type: 'row' as const, id: contextMenu.rowId };
    return contextMenu.colId ? { type: 'col' as const, id: contextMenu.colId } : null;
  };

  const applyMenuStyle = (style: Parameters<typeof updateCustomStyle>[2]) => {
    const target = styleTargetForMenu();
    if (!target) return;
    updateCustomStyle(target.type, target.id, style);
    setContextMenu(null);
  };

  const editableHeaderLabelId = () => {
    if (!contextMenu?.rowId) return null;
    if (contextMenu.rowId === 'header_fixed' && contextMenu.colId) return `header_${contextMenu.colId}`;
    if (contextMenu.rowId === 'header_month' && contextMenu.colId) return `header_month_${contextMenu.colId}`;
    if (contextMenu.rowId === 'header_asset' && contextMenu.colId) return `header_asset_${contextMenu.colId}`;
    if (contextMenu.rowId.startsWith('sec_') || contextMenu.rowId.startsWith('prog_') || contextMenu.rowId.startsWith('row_')) return contextMenu.rowId;
    return null;
  };

  // Scroll container and current month column ref
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const currentMonthColRef = useRef<HTMLTableCellElement | null>(null);

  // ティッカーと保有枚数が入力された行だけ、チャートビューと同じMooView APIで現在値を更新する。
  // currentPrice/amountの更新自体は対象シグネチャに含めず、更新直後に再取得するループを防ぐ。
  const quoteFetchInFlightRef = useRef(new Set<string>());
  const updateAssetRef = useRef(updateAsset);
  updateAssetRef.current = updateAsset;
  const quoteTargetSignature = assets
    .filter((asset) => String(asset.ticker ?? '').trim() && Number(asset.shares) > 0)
    .map((asset) => `${asset.id}:${String(asset.ticker ?? '').trim()}:${Number(asset.shares)}`)
    .sort()
    .join('|');

  useEffect(() => {
    const targets = assets
      .filter((asset) => String(asset.ticker ?? '').trim() && Number(asset.shares) > 0)
      .map((asset) => ({ id: asset.id, name: asset.name, ticker: String(asset.ticker ?? '').trim(), shares: Number(asset.shares) }));
    if (targets.length === 0) return undefined;
    let disposed = false;

    const refresh = async () => {
      const results = await Promise.all(targets.map(async (target) => {
        if (quoteFetchInFlightRef.current.has(target.id)) return;
        quoteFetchInFlightRef.current.add(target.id);
        try {
          const quote = await fetchYahooFinanceCurrentQuote(target.ticker);
          return { target, quote };
        } finally {
          quoteFetchInFlightRef.current.delete(target.id);
        }
      }));
      if (disposed) return;
      const hasUsdQuote = results.some((result) => result?.quote?.currency?.toUpperCase() === 'USD');
      const usdJpy = hasUsdQuote ? await fetchYahooFinanceUsdJpy() : null;
      if (disposed) return;

      // 同じ投信を口座別に複数登録している場合も、コードと行名の不一致だけを補正する。
      // 正常なコード行を別の行へ移すことはしない。
      const uniqueFundQuotes = new Map<string, { target: typeof targets[number]; quote: YahooFinanceCurrentQuote }>();
      results.forEach((result) => {
        if (result?.quote?.instrumentType !== 'jp_fund') return;
        if (!uniqueFundQuotes.has(result.target.ticker)) uniqueFundQuotes.set(result.target.ticker, result as { target: typeof targets[number]; quote: YahooFinanceCurrentQuote });
      });

      results.forEach((result) => {
        if (!result?.quote) return;
        const matchingFundQuote = result.quote.instrumentType === 'jp_fund'
          ? [...uniqueFundQuotes.values()].find((source) => fundQuoteMatchesAssetName(result.target.name, source.quote))
          : undefined;
        const currentQuoteMatchesName = result.quote.instrumentType !== 'jp_fund'
          || fundQuoteMatchesAssetName(result.target.name, result.quote);
        const quote = !currentQuoteMatchesName && matchingFundQuote ? matchingFundQuote.quote : result.quote;
        const ticker = !currentQuoteMatchesName && matchingFundQuote ? matchingFundQuote.target.ticker : result.target.ticker;
        const isUsd = quote.currency?.toUpperCase() === 'USD';
        const amount = isUsd && !usdJpy
          ? undefined
          : calculateAssetAmountManYen(quote.price, result.target.shares, quote.priceBasis, quote.currency, usdJpy || 1);
        updateAssetRef.current(result.target.id, {
          ...(ticker !== result.target.ticker ? { ticker } : {}),
          currentPrice: quote.price,
          ...(amount !== undefined ? { amount } : {}),
        });
      });
    };

    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [quoteTargetSignature]);

  // Scroll to current month (2026年9月) on mount
  const scrollToCurrentMonth = () => {
    if (tableScrollRef.current && currentMonthColRef.current) {
      // 280px is the width of sticky column area (区分 + 項目名)
      const offset = currentMonthColRef.current.offsetLeft - 280;
      tableScrollRef.current.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
    }
  };

  useEffect(() => {
    // Immediate scroll on first load
    const timer = setTimeout(() => {
      if (tableScrollRef.current && currentMonthColRef.current) {
        const offset = currentMonthColRef.current.offsetLeft - 280;
        tableScrollRef.current.scrollLeft = Math.max(0, offset);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [timelineColumns]);

  // Helper to retrieve monthly amount for an income item
  const getIncomeColAmount = (item: IncomeItem, col: TimelineColumn): number => {
    if (monthlyOverrides[item.id]?.[col.id] !== undefined) {
      return monthlyOverrides[item.id][col.id];
    }
    if (item.id === 'inc_dividend' || item.category === 'dividend') {
      return getMonthlyDividendForCol(col);
    }
    return item.amount || 0;
  };

  // Helper to retrieve monthly amount for an expense item
  const getExpenseColAmount = (item: ExpenseItem, col: TimelineColumn): number => {
    // 家賃口座は支出欄の基準額を毎月必ず引く。過去に生成された単月上書き値で、翌月以降が戻らないようにする。
    if (String(item.name || '').replace(/[\s　]/g, '').includes('家賃')) return Number(item.amount) || 0;
    if (monthlyOverrides[item.id]?.[col.id] !== undefined) {
      return monthlyOverrides[item.id][col.id];
    }
    return item.amount || 0;
  };

  // Compute totals per timeline column
  const columnTotals = timelineColumns.map((col) => {
    const incSum = incomes.reduce((sum, item) => sum + getIncomeColAmount(item, col), 0);
    const expSum = expenses.reduce((sum, item) => sum + getExpenseColAmount(item, col), 0);
    const surplus = incSum - expSum;
    return {
      colId: col.id,
      col,
      income: Math.round(incSum * 10) / 10,
      expense: Math.round(expSum * 10) / 10,
      surplus: Math.round(surplus * 10) / 10,
    };
  });

  // 保有一覧に新設された区分だけを、月次表にも同じ元帳行として表示する。
  const visibleCustomCategories = customAssetCategories.filter((category) =>
    assets.some((asset) => asset.category === category.id),
  );
  const orderedCategoryIds = Array.from(new Set([
    ...categoryOrder,
    ...categoryOptions.map((category) => category.id),
  ]));

  // Cumulative surplus from current month forward for asset progression
  // Find current month index (2026年9月)
  const currentMonthIdx = timelineColumns.findIndex(c => c.isCurrent);
  const safeCurrentIdx = currentMonthIdx !== -1 ? currentMonthIdx : 0;

  // Compute accumulated surplus for each column
  // Future months accumulate surplus from now; past months show current snapshot or past progress
  const cumulativeSurplusByCol: Record<string, number> = {};
  let runningFutureSurplus = 0;
  timelineColumns.forEach((col, idx) => {
    if (idx < safeCurrentIdx) {
      cumulativeSurplusByCol[col.id] = 0;
    } else if (idx === safeCurrentIdx) {
      cumulativeSurplusByCol[col.id] = 0;
    } else {
      // Future month: 差引余剰は符号付きで繰り越す。赤字月は累積残高から差し引く。
      const prevSurplus = columnTotals[idx - 1]?.surplus || 0;
      runningFutureSurplus += prevSurplus;
      cumulativeSurplusByCol[col.id] = Math.round(runningFutureSurplus * 10) / 10;
    }
  });

  // 現金・投資余力累積 = 現在の現金残高 + その前月までの差引余剰累積。
  // monthlyOverrides にも同じ値を保存し、Sheetsへ送る元帳値と画面表示を一致させる。
  const cashPoolByCol: Record<string, number> = {};
  const hasRentAccount = assets.some((asset) => {
    const name = String(asset.name || '').replace(/[\s　]/g, '');
    const category = customAssetCategories.find((item) => item.id === asset.category);
    return name.includes('家賃口座') || String(category?.label || '').replace(/[\s　]/g, '').includes('家賃口座');
  });
  const monthlyRentByCol: Record<string, number> = {};
  timelineColumns.forEach((col) => {
    monthlyRentByCol[col.id] = expenses
      .filter((item) => String(item.name || '').replace(/[\s　]/g, '').includes('家賃'))
      .reduce((sum, item) => sum + getExpenseColAmount(item, col), 0);
  });
  const rentInCash = assets.some((asset) => {
    const name = String(asset.name || '').replace(/[\s　]/g, '');
    return asset.category === 'cash' && name.includes('家賃口座');
  });
  let accumulatedRent = 0;
  const rentCumulativeByCol: Record<string, number> = {};
  timelineColumns.forEach((col, idx) => {
    if (idx > safeCurrentIdx) accumulatedRent += monthlyRentByCol[col.id] || 0;
    rentCumulativeByCol[col.id] = Math.round(accumulatedRent * 10) / 10;
  });
  let accumulatedCashflow = 0;
  timelineColumns.forEach((col, idx) => {
    if (idx > safeCurrentIdx) accumulatedCashflow += columnTotals[idx - 1]?.surplus || 0;
    // 家賃口座は当月家賃を先に引き、翌月以降は差引余剰の累積も反映する。
    const rentDeduction = hasRentAccount && rentInCash ? (rentCumulativeByCol[col.id] || 0) : 0;
    cashPoolByCol[col.id] = Math.round((cashTotal + accumulatedCashflow - rentDeduction) * 10) / 10;
  });
  const cashPoolSignature = timelineColumns.map((col, idx) => `${col.id}:${cashPoolByCol[col.id]}`).join('|');
  useEffect(() => {
    setMonthlyOverrides((previous) => {
      const current = previous.prog_cash_pool || {};
      const nextRow = { ...current };
      let changed = false;
      Object.entries(cashPoolByCol).forEach(([colId, amount]) => {
        if (nextRow[colId] !== amount) {
          nextRow[colId] = amount;
          changed = true;
        }
      });
      return changed ? { ...previous, prog_cash_pool: nextRow } : previous;
    });
  }, [cashPoolSignature, setMonthlyOverrides]);

  // Style resolver: merges cell, row, and column styles
  const getResolvedStyle = (rowId: string, colId?: string): React.CSSProperties => {
    const cellStyle = colId ? customStyles.cells[`${rowId}_${colId}`] : undefined;
    const rowStyle = customStyles.rows[rowId];
    const colStyle = colId ? customStyles.cols[colId] : undefined;

    const bg = cellStyle?.bg || rowStyle?.bg || colStyle?.bg;
    const color = cellStyle?.color || rowStyle?.color || colStyle?.color;
    const fontWeight = cellStyle?.fontWeight || rowStyle?.fontWeight || colStyle?.fontWeight;
    const fontStyle = cellStyle?.fontStyle || rowStyle?.fontStyle || colStyle?.fontStyle;
    const textDecoration = cellStyle?.textDecoration || rowStyle?.textDecoration || colStyle?.textDecoration;

    return {
      backgroundColor: bg || undefined,
      color: color || undefined,
      fontWeight: fontWeight || undefined,
      fontStyle: fontStyle || undefined,
      textDecoration: textDecoration || undefined,
    };
  };

  // Filtered assets
  const filteredAssets = activeCategoryFilter === 'all'
    ? assets
    : assets.filter(a => a.category === activeCategoryFilter);

  // Column move handler
  const moveColumn = (key: AssetColumnKey, direction: 'left' | 'right') => {
    setColumnKeys(prev => {
      const idx = prev.indexOf(key);
      if (idx === -1) return prev;
      const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[targetIdx];
      copy[targetIdx] = temp;
      try {
        localStorage.setItem('finance_simulation_asset_col_order_v2', JSON.stringify(copy));
      } catch {}
      updateAssetTableLayout({ columnOrder: copy });
      return copy;
    });
  };

  // Row Drag handlers
  const handleDragStart = (assetId: string) => {
    setDraggedRowId(assetId);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const handleDrop = (targetId: string) => {
    if (!draggedRowId || draggedRowId === targetId) {
      setDraggedRowId(null);
      return;
    }
    const fromIndex = assets.findIndex((asset) => asset.id === draggedRowId);
    const toIndex = assets.findIndex((asset) => asset.id === targetId);
    if (fromIndex >= 0 && toIndex >= 0) reorderAssets(fromIndex, toIndex);
    setDraggedRowId(null);
  };

  const handleTickerLookup = (tickerVal: string) => {
    const uppercase = tickerVal.toUpperCase();
    const lookup = lookupYahooFinanceTicker(uppercase);
    if (lookup) {
      setNewAsset(prev => ({
        ...prev,
        ticker: uppercase,
        name: lookup.name,
      }));
    } else {
      setNewAsset(prev => ({ ...prev, ticker: uppercase }));
    }
  };

  type AssetChartSlice = { id: string; label: string; value: number; color: string };
  const currentChartMonth = timelineColumns.find((column) => column.isCurrent) || timelineColumns[0];
  const [assetChartMonthId, setAssetChartMonthId] = useState(currentChartMonth?.id || '');
  useEffect(() => {
    if (!timelineColumns.some((column) => column.id === assetChartMonthId)) {
      setAssetChartMonthId(currentChartMonth?.id || '');
    }
  }, [assetChartMonthId, currentChartMonth?.id, timelineColumns]);

  const chartMonth = timelineColumns.find((column) => column.id === assetChartMonthId) || currentChartMonth;
  const chartValue = (rowId: string, fallback: number): number => {
    if (!chartMonth) return fallback;
    return monthlyOverrides[rowId]?.[chartMonth.id] !== undefined
      ? Number(monthlyOverrides[rowId][chartMonth.id]) || 0
      : fallback;
  };
  const monthlyAssetChartData = timelineColumns.map((column) => {
    const coreStocks = Number(monthlyOverrides.prog_core_stocks?.[column.id] ?? coreStocksTotal) || 0;
    const dividendStocks = Number(monthlyOverrides.prog_dividend_stocks?.[column.id] ?? totalInvestedDividends) || 0;
    const cash = Number(cashPoolByCol[column.id] ?? cashTotal) || 0;
    const investmentCapacity = Number(cumulativeSurplusByCol[column.id] ?? 0) || 0;
    const netWorth = Math.round((netWorthTotal + investmentCapacity) * 10) / 10;
    return {
      label: labelFor(`header_month_${column.id}`, column.label),
      netWorth,
      coreStocks,
      dividendStocks,
      cash,
      investmentCapacity,
    };
  });
  const chartSlices: AssetChartSlice[] = [
    { id: 'core_stocks', label: 'コア株式 (S&P500)', value: chartValue('prog_core_stocks', coreStocksTotal), color: FINANCE_CHART_COLORS[0] },
    { id: 'dividend_stocks', label: '高配当資産 (ETF/投信)', value: chartValue('prog_dividend_stocks', dividendStocksTotal), color: FINANCE_CHART_COLORS[1] },
    { id: 'cash', label: '生活防衛資金・家賃口座', value: cashPoolByCol[chartMonth?.id || ''] ?? cashTotal, color: FINANCE_CHART_COLORS[3] },
    { id: 'illiquid_other', label: '金・確定拠出・その他', value: chartValue('prog_illiquid', illiquidTotal), color: FINANCE_CHART_COLORS[2] },
    ...visibleCustomCategories.map((category) => ({
      id: category.id,
      label: category.label,
      value: chartValue(`prog_category_${category.id}`, assets.filter((asset) => asset.category === category.id).reduce((sum, asset) => sum + (Number(asset.amount) || 0), 0)),
      color: category.color,
    })),
  ].filter((slice) => slice.value !== 0);
  const chartTotal = Math.round(chartSlices.reduce((sum, slice) => sum + slice.value, 0) * 10) / 10;
  const chartPositiveTotal = chartSlices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  const chartNumber = (value: number) => `${value < 0 ? '−' : ''}${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
  const chartDisplayNumber = (value: number) => maskAssetAmounts ? '***' : chartNumber(value);
  const dividendChartItems = calculatedDividends
    .filter((item) => !item.stock.excludeFromPortfolio && Number(item.stock.investedAmount) > 0)
    .map((item, index) => ({
      id: item.stock.id,
      label: item.stock.ticker || item.stock.name,
      value: Number(item.stock.investedAmount) || 0,
      color: FINANCE_CHART_COLORS[index % FINANCE_CHART_COLORS.length],
    }));
  const monthlyDividendChartItems = calculatedDividends
    .filter((item) => Number(item.monthlyNet) > 0)
    .map((item, index) => ({
      id: item.stock.id,
      label: item.stock.ticker || item.stock.name,
      value: Number(item.monthlyNet) || 0,
      color: FINANCE_CHART_COLORS[index % FINANCE_CHART_COLORS.length],
    }));
  const chartPieSlices = (() => {
    let startPercent = 0;
    return chartSlices.map((slice) => {
      const percent = chartPositiveTotal > 0 ? (Math.max(0, slice.value) / chartPositiveTotal) * 100 : 0;
      const result = { ...slice, percent, startPercent, endPercent: startPercent + percent };
      startPercent += percent;
      return result;
    });
  })();
  const piePoint = (radius: number, angle: number) => ({
    x: 120 + radius * Math.cos(angle),
    y: 120 + radius * Math.sin(angle),
  });
  const pieSlicePath = (startPercent: number, endPercent: number) => {
    const startAngle = (startPercent / 100) * Math.PI * 2 - Math.PI / 2;
    const endAngle = (endPercent / 100) * Math.PI * 2 - Math.PI / 2;
    const outerStart = piePoint(106, startAngle);
    const outerEnd = piePoint(106, endAngle);
    const innerEnd = piePoint(56, endAngle);
    const innerStart = piePoint(56, startAngle);
    const largeArc = endPercent - startPercent > 50 ? 1 : 0;
    return `M ${outerStart.x} ${outerStart.y} A 106 106 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A 56 56 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`;
  };

  return (
    <div className="space-y-6 pb-16">
      {/* 資産内訳: 表と同じ月次元帳を参照するモバイル優先サマリー */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:items-start">
          <div className="flex min-h-[420px] flex-col items-center justify-start bg-transparent">
            <div className="mb-1 flex min-h-[54px] w-full items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => setMaskAssetAmounts((current) => !current)}
                title={maskAssetAmounts ? '金額を表示' : '金額を伏せ字にする'}
                aria-label={maskAssetAmounts ? '金額の伏せ字を解除' : '金額を伏せ字にする'}
                aria-pressed={maskAssetAmounts}
                className={`inline-flex h-9 w-9 items-center justify-center border transition-colors ${
                  maskAssetAmounts
                    ? 'border-[var(--color-finance-accent)] bg-[var(--color-finance-accent)]/10 text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)]'
                    : 'border-black/15 text-[var(--color-finance-ink)]/60 hover:bg-black/5 dark:border-white/15 dark:text-[var(--color-finance-surface)]/60 dark:hover:bg-white/10'
                }`}
              >
                {maskAssetAmounts ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <select
                value={assetChartMonthId}
                onChange={(event) => setAssetChartMonthId(event.target.value)}
                className="w-full border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-[var(--color-finance-ink)] sm:w-44 dark:border-white/15 dark:bg-transparent dark:text-[var(--color-finance-surface)]"
                aria-label="資産構成の表示月"
              >
                {timelineColumns.map((column) => (
                  <option key={column.id} value={column.id} className="text-black">{column.label}{column.isCurrent ? '（現在）' : ''}</option>
                ))}
              </select>
            </div>
          <div className="relative h-[min(80vw,320px)] w-[min(80vw,320px)]" aria-label={`総資産 ${chartDisplayNumber(chartTotal)}万円`}>
            <svg viewBox="0 0 240 240" className="h-full w-full" role="img">
              {chartPieSlices.map((slice) => {
                if (slice.percent >= 99.99) {
                  return <circle key={slice.id} cx="120" cy="120" r="106" fill={slice.color}><title>{`${slice.label}: ${chartDisplayNumber(slice.value)}万円 (${slice.percent.toFixed(1)}%)`}</title></circle>;
                }
                return <path key={slice.id} d={pieSlicePath(slice.startPercent, slice.endPercent)} fill={slice.color} stroke="rgba(255,255,255,0.45)" strokeWidth="0.8"><title>{`${slice.label}: ${chartDisplayNumber(slice.value)}万円 (${slice.percent.toFixed(1)}%)`}</title></path>;
              })}
              {chartPieSlices.map((slice) => {
                const midpoint = ((slice.startPercent + slice.endPercent) / 200) * Math.PI * 2 - Math.PI / 2;
                const labelPoint = piePoint(81, midpoint);
                const compactLabel = slice.label.length > 10 ? `${slice.label.slice(0, 10)}…` : slice.label;
                const fontSize = slice.percent < 6 ? 5.5 : slice.percent < 12 ? 6.5 : 8;
                return (
                  <text key={`${slice.id}-label`} x={labelPoint.x} y={labelPoint.y - fontSize} textAnchor="middle" fill="white" fontSize={fontSize} fontWeight="700" className="pointer-events-none">
                    <tspan x={labelPoint.x}>{compactLabel}</tspan>
                    <tspan x={labelPoint.x} dy={fontSize + 1}>{chartDisplayNumber(slice.value)}万円</tspan>
                    <tspan x={labelPoint.x} dy={fontSize + 1}>{slice.percent.toFixed(1)}%</tspan>
                  </text>
                );
              })}
              <circle cx="120" cy="120" r="56" className="fill-transparent" />
              <text x="120" y="114" textAnchor="middle" className="fill-[var(--color-finance-ink)] dark:fill-[var(--color-finance-surface)]" fontSize="9">総資産合計</text>
              <text x="120" y="131" textAnchor="middle" className={chartTotal < 0 ? 'fill-[var(--color-finance-negative)]' : 'fill-[var(--color-finance-accent)] dark:fill-[var(--color-finance-accent-on-dark)]'} fontSize="15" fontWeight="700">{chartDisplayNumber(chartTotal)}</text>
              <text x="120" y="143" textAnchor="middle" className="fill-[var(--color-finance-ink)]/60 dark:fill-[var(--color-finance-surface)]/60" fontSize="8">万円</text>
            </svg>
            {chartSlices.length === 0 && <p className="absolute inset-0 flex items-center justify-center text-xs text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60">表示できる資産がありません。</p>}
          </div>
          </div>
          <div className="flex min-h-[420px] flex-col items-center bg-transparent">
            <div className="mb-1 flex min-h-[54px] w-full flex-col items-center justify-center text-center">
              <div className="text-[10px] text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60">年間受取配当 (手取り・2563込)</div>
              <div className="font-mono text-lg font-bold text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)]">{totalAnnualDividend.toFixed(1)} 万円</div>
            </div>
            <div className="min-h-0 w-full flex-1">
              <PortfolioDonutChart items={monthlyDividendChartItems} totalLabel="月額配当 (2563込)" />
            </div>
          </div>
          <div className="flex min-h-[420px] flex-col items-center bg-transparent">
            <div className="mb-1 flex min-h-[54px] w-full flex-col items-center justify-center text-center">
              <div className="text-[10px] text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60">税引後 加重平均利回り</div>
              <div className="font-mono text-lg font-bold text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)]">{overallNetYield.toFixed(2)} %</div>
            </div>
            <div className="min-h-0 w-full flex-1">
              <PortfolioDonutChart items={dividendChartItems} totalLabel="高配当ポートフォリオ" />
            </div>
          </div>
      </section>
      <DividendTimeline />
      <MonthlyAssetLineChart data={monthlyAssetChartData} masked={maskAssetAmounts} />
      {/* CASHFLOW & ASSET PROGRESSION MATRIX */}
      <div className="space-y-1">
        {/* The Matrix Table Container */}
        <div
          ref={tableScrollRef}
          className="overflow-x-auto border border-black/15 dark:border-white/15 bg-white dark:bg-[var(--color-finance-dark-surface)] select-none"
          style={{ scrollBehavior: 'smooth' }}
        >
          <table className="w-full text-xs text-left border-collapse min-w-[900px]">
            <thead>
              {/* Header row: 区分(56px) -> 項目名(160px) -> すぐ右に各月次列(現在月: 2026年9月〜) -> 最右＋列 */}
              <tr className="border-b border-black/15 dark:border-white/15 bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-canvas)] text-[var(--color-finance-ink)]/80 dark:text-[var(--color-finance-surface)]/80 font-sans">
                <th
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setStyleScope('cell');
                    setContextMenu({ x: e.clientX, y: e.clientY, targetType: 'cell', rowId: 'header_fixed', colId: 'category', label: labelFor('header_category', '区分') });
                  }}
                  style={getResolvedStyle('header_fixed', 'category')}
                  className="py-2 px-1 font-semibold sticky left-0 bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-canvas)] z-20 w-14 min-w-[56px] max-w-[56px] border-r border-black/15 dark:border-white/15 text-center"
                >
                  {labelFor('header_category', '区分')}
                </th>
                <th
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setStyleScope('cell');
                    setContextMenu({ x: e.clientX, y: e.clientY, targetType: 'cell', rowId: 'header_fixed', colId: 'name', label: labelFor('header_name', '項目名') });
                  }}
                  style={getResolvedStyle('header_fixed', 'name')}
                  className="py-2 px-3 font-semibold sticky left-[56px] bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-canvas)] z-20 w-40 min-w-[160px] max-w-[160px] border-r border-black/15 dark:border-white/15"
                >
                  {labelFor('header_name', '項目名')}
                </th>

                {/* Timeline columns: 1月のみ年を記載、横幅スリム化 */}
                {timelineColumns.map((col) => {
                  const isCurrent = col.isCurrent || col.id === '2026-09';
                  const colCustomStyle = getResolvedStyle('header_month', col.id);

                  return (
                    <th
                      key={col.id}
                      ref={isCurrent ? currentMonthColRef : null}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setStyleScope('cell');
                        setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        targetType: 'col',
                        rowId: 'header_month',
                        colId: col.id,
                        label: labelFor(`header_month_${col.id}`, col.label),
                        });
                      }}
                      style={{
                        backgroundColor: colCustomStyle.backgroundColor || (isCurrent ? 'var(--color-finance-accent-subtle)' : undefined),
                        color: colCustomStyle.color || undefined,
                      }}
                      className={`py-1.5 px-2 font-semibold text-center min-w-[65px] border-r border-black/15 dark:border-white/15 group cursor-context-menu relative ${
                        isCurrent ? 'border-b-2 border-b-[var(--color-finance-accent)]' : ''
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center">
                        <span className={`text-[11px] ${isCurrent ? 'font-bold text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)]' : ''}`}>
                          {labelFor(`header_month_${col.id}`, col.label)}
                        </span>
                        {isCurrent && (
                          <span className="text-[9px] font-bold text-white bg-[var(--color-finance-accent)] px-1 py-0.2 mt-0.5 tracking-wider">
                            現在
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}

                {/* 最右列: ＋ボタン列 (クリックで翌年を追加) */}
                <th className="py-1 px-1.5 text-center w-10 min-w-[40px] bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-canvas)]">
                  <button
                    onClick={addNextYearColumns}
                    title="次の年度 (12ヶ月分) を追加"
                    className="w-full py-0.5 hover:bg-[var(--color-finance-accent)] hover:text-white border border-black/20 dark:border-white/20 transition-colors cursor-pointer text-xs font-bold"
                  >
                    ＋
                  </button>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-black/10 dark:divide-white/10 font-mono text-xs">
              {/* ======================================================== */}
              {/* サマリー最上段: 資産残高推移 (自走純資産・総純資産を一番上に配置) */}
              {/* ======================================================== */}
              {/* Row 0.1: 総純資産推計 (月末残高 / 自走純資産) */}
              <tr
                style={getResolvedStyle('prog_total_net_worth')}
                className="bg-finance-accent-mid/10 dark:bg-finance-accent-mid/20 font-bold border-b-2 border-finance-accent-mid/40 text-xs"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    targetType: 'row',
                    rowId: 'prog_total_net_worth',
                    label: labelFor('prog_total_net_worth', '総純資産推計'),
                  });
                }}
              >
                {/* 区分: 基本4行＋追加区分を、資産ブロック全体で1つのセルに結合 */}
                <td
                  rowSpan={5 + visibleCustomCategories.length}
                  className="py-2 px-1 text-center font-sans font-bold sticky left-0 bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-canvas)] z-10 border-r border-black/15 dark:border-white/15 align-middle text-[var(--color-finance-accent-mid)]"
                >
                  資産
                </td>
                <td className="py-2 px-3 sticky left-[56px] bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-canvas)] z-10 font-sans font-bold border-r border-black/15 dark:border-white/15 text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)]">
                  {labelFor('prog_total_net_worth', '総純資産推計')}
                </td>
                {timelineColumns.map((col) => {
                  const extra = cumulativeSurplusByCol[col.id] || 0;
                  const estimatedNW = netWorthTotal + extra;

                  return (
                    <td
                      key={col.id}
                      style={getResolvedStyle('prog_total_net_worth', col.id)}
                      className={`py-2 px-2 text-center border-r border-black/15 dark:border-white/15 font-black text-xs text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)] ${
                        col.isCurrent ? 'bg-[var(--color-finance-accent)]/15 text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)]' : ''
                      }`}
                    >
                      <span>{maskAssetAmounts ? '***' : Math.round(estimatedNW).toLocaleString()}</span>
                    </td>
                  );
                })}
                <td className="py-1 px-1.5 border-r border-black/15 dark:border-white/15"></td>
              </tr>

              {/* Row 0.2: コア株式 (S&P500) */}
              <tr
                style={getResolvedStyle('prog_core_stocks')}
                className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-context-menu"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    targetType: 'row',
                    rowId: 'prog_core_stocks',
                    label: labelFor('prog_core_stocks', 'コア株式 (S&P500)'),
                  });
                }}
              >
                <td className="py-1.5 px-3 font-sans font-medium sticky left-[56px] bg-white dark:bg-[var(--color-finance-dark-surface)] z-10 border-r border-black/15 dark:border-white/15">
                  {labelFor('prog_core_stocks', 'コア株式 (S&P500)')}
                </td>
                {timelineColumns.map((col) => {
                  const cellVal = monthlyOverrides['prog_core_stocks']?.[col.id] !== undefined
                    ? monthlyOverrides['prog_core_stocks'][col.id]
                    : coreStocksTotal;

                  return (
                    <td
                      key={col.id}
                      style={getResolvedStyle('prog_core_stocks', col.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          targetType: 'cell',
                          rowId: 'prog_core_stocks',
                          colId: col.id,
                          label: `コア株式 (${col.label})`,
                          currentValue: cellVal,
                        });
                      }}
                      className={`py-1.5 px-2 text-center border-r border-black/15 dark:border-white/15 text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)] ${
                        col.isCurrent ? 'bg-[var(--color-finance-accent)]/5 font-bold' : ''
                      }`}
                    >
                      <EditableCell
                        value={cellVal}
                        type="number"
                        step="10"
                        align="center"
                        onSave={(val) => updateMonthlyCell('prog_core_stocks', col.id, Number(val) || 0, true)}
                        textClassName="text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)]"
                        masked={maskAssetAmounts}
                      />
                    </td>
                  );
                })}
                <td className="py-1 px-1.5 border-r border-black/15 dark:border-white/15"></td>
              </tr>

              {/* Row 0.3: 高配当ポートフォリオ */}
              <tr
                style={getResolvedStyle('prog_dividend_stocks')}
                className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-context-menu"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    targetType: 'row',
                    rowId: 'prog_dividend_stocks',
                    label: labelFor('prog_dividend_stocks', '高配当ポートフォリオ'),
                  });
                }}
              >
                <td className="py-1.5 px-3 font-sans font-medium sticky left-[56px] bg-white dark:bg-[var(--color-finance-dark-surface)] z-10 border-r border-black/15 dark:border-white/15">
                  {labelFor('prog_dividend_stocks', '高配当ポートフォリオ')}
                </td>
                {timelineColumns.map((col) => {
                  const cellVal = monthlyOverrides['prog_dividend_stocks']?.[col.id] !== undefined
                    ? monthlyOverrides['prog_dividend_stocks'][col.id]
                    : totalInvestedDividends;

                  return (
                    <td
                      key={col.id}
                      style={getResolvedStyle('prog_dividend_stocks', col.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          targetType: 'cell',
                          rowId: 'prog_dividend_stocks',
                          colId: col.id,
                          label: `高配当 (${col.label})`,
                          currentValue: cellVal,
                        });
                      }}
                      className={`py-1.5 px-2 text-center border-r border-black/15 dark:border-white/15 text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)] ${
                        col.isCurrent ? 'bg-[var(--color-finance-accent)]/5 font-bold' : ''
                      }`}
                    >
                      <EditableCell
                        value={cellVal}
                        type="number"
                        step="10"
                        align="center"
                        onSave={(val) => updateMonthlyCell('prog_dividend_stocks', col.id, Number(val) || 0, true)}
                        textClassName="text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)]"
                        masked={maskAssetAmounts}
                      />
                    </td>
                  );
                })}
                <td className="py-1 px-1.5 border-r border-black/15 dark:border-white/15"></td>
              </tr>

              {/* Row 0.4: 現金・投資余力累積 */}
              <tr
                style={getResolvedStyle('prog_cash_pool')}
                className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-context-menu"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    targetType: 'row',
                    rowId: 'prog_cash_pool',
                    label: labelFor('prog_cash_pool', '現金・投資余力累積'),
                  });
                }}
              >
                <td className="py-1.5 px-3 font-sans font-medium sticky left-[56px] bg-white dark:bg-[var(--color-finance-dark-surface)] z-10 border-r border-black/15 dark:border-white/15">
                  {labelFor('prog_cash_pool', '現金・投資余力累積')}
                </td>
                {timelineColumns.map((col) => {
                  const cellVal = cashPoolByCol[col.id] ?? cashTotal;

                  return (
                    <td
                      key={col.id}
                      style={getResolvedStyle('prog_cash_pool', col.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          targetType: 'cell',
                          rowId: 'prog_cash_pool',
                          colId: col.id,
                          label: `現金余力 (${col.label})`,
                          currentValue: cellVal,
                        });
                      }}
                      className={`py-1.5 px-2 text-center border-r border-black/15 dark:border-white/15 text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)] ${
                        col.isCurrent ? 'bg-[var(--color-finance-accent)]/5 font-bold' : ''
                      }`}
                    >
                      <EditableCell
                        value={cellVal}
                        type="number"
                        step="10"
                        align="center"
                        onSave={(val) => updateMonthlyCell('prog_cash_pool', col.id, Number(val) || 0, true)}
                        textClassName="text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)]"
                        masked={maskAssetAmounts}
                      />
                    </td>
                  );
                })}
                <td className="py-1 px-1.5 border-r border-black/15 dark:border-white/15"></td>
              </tr>

              {/* Row 0.5: 金・確定拠出・他 */}
              <tr
                style={getResolvedStyle('prog_illiquid')}
                className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-context-menu"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    targetType: 'row',
                    rowId: 'prog_illiquid',
                    label: labelFor('prog_illiquid', '金・確定拠出・他'),
                  });
                }}
              >
                <td className="py-1.5 px-3 font-sans font-medium sticky left-[56px] bg-white dark:bg-[var(--color-finance-dark-surface)] z-10 border-r border-black/15 dark:border-white/15">
                  {labelFor('prog_illiquid', '金・確定拠出・他')}
                </td>
                {timelineColumns.map((col) => {
                  const cellVal = monthlyOverrides['prog_illiquid']?.[col.id] !== undefined
                    ? monthlyOverrides['prog_illiquid'][col.id]
                    : illiquidTotal;

                  return (
                    <td
                      key={col.id}
                      style={getResolvedStyle('prog_illiquid', col.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          targetType: 'cell',
                          rowId: 'prog_illiquid',
                          colId: col.id,
                          label: `その他資産 (${col.label})`,
                          currentValue: cellVal,
                        });
                      }}
                      className={`py-1.5 px-2 text-center border-r border-black/15 dark:border-white/15 text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)] ${
                        col.isCurrent ? 'bg-[var(--color-finance-accent)]/5 font-bold' : ''
                      }`}
                    >
                      <EditableCell
                        value={cellVal}
                        type="number"
                        step="10"
                        align="center"
                        onSave={(val) => updateMonthlyCell('prog_illiquid', col.id, Number(val) || 0, true)}
                        textClassName="text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)]"
                        masked={maskAssetAmounts}
                      />
                    </td>
                  );
                })}
                <td className="py-1 px-1.5 border-r border-black/15 dark:border-white/15"></td>
              </tr>

              {visibleCustomCategories.map((category) => {
                const rowId = `prog_category_${category.id}`;
                const total = Math.round(assets
                  .filter((asset) => asset.category === category.id)
                  .reduce((sum, asset) => sum + (Number(asset.amount) || 0), 0) * 10) / 10;
                const label = labelFor(rowId, category.label);
                return (
                  <tr
                    key={category.id}
                    style={getResolvedStyle(rowId)}
                    className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-context-menu"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setStyleScope('row');
                      setContextMenu({ x: e.clientX, y: e.clientY, targetType: 'row', rowId, label });
                    }}
                  >
                    <td className="py-1.5 px-3 font-sans font-medium sticky left-[56px] bg-white dark:bg-[var(--color-finance-dark-surface)] z-10 border-r border-black/15 dark:border-white/15" style={{ color: category.color }}>
                      {label}
                    </td>
                    {timelineColumns.map((col) => {
                      const cellVal = monthlyOverrides[rowId]?.[col.id] ?? total;
                      return (
                        <td
                          key={col.id}
                          style={getResolvedStyle(rowId, col.id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setStyleScope('cell');
                            setContextMenu({ x: e.clientX, y: e.clientY, targetType: 'cell', rowId, colId: col.id, label: `${label} (${col.label})`, currentValue: cellVal });
                          }}
                          className={`py-1.5 px-2 text-center border-r border-black/15 dark:border-white/15 text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)] ${col.isCurrent ? 'bg-[var(--color-finance-accent)]/5 font-bold' : ''}`}
                        >
                          <EditableCell
                            value={cellVal}
                            type="number"
                            step="10"
                            align="center"
                            onSave={(val) => updateMonthlyCell(rowId, col.id, Number(val) || 0, true)}
                            textClassName="text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)]"
                            masked={maskAssetAmounts}
                          />
                        </td>
                      );
                    })}
                    <td className="py-1 px-1.5 border-r border-black/15 dark:border-white/15" />
                  </tr>
                );
              })}

              {/* ======================================================== */}
              {/* SECTION 1: 入金 (月次収入内訳) */}
              {/* ======================================================== */}
              <tr
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    targetType: 'header',
                    rowId: 'sec_income',
                    label: labelFor('sec_income', '【1. 入金（月次収入内訳）】'),
                  });
                }}
                style={getResolvedStyle('sec_income')}
                className="bg-finance-positive/10 dark:bg-finance-positive/15 font-sans font-bold text-xs border-y border-finance-positive/30 cursor-context-menu"
              >
                <td colSpan={2 + timelineColumns.length + 1} className="py-2 px-3 text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)]">
                  {labelFor('sec_income', '【1. 入金（月次収入内訳）】')}
                </td>
              </tr>

              {incomes.map((item, index) => {
                const isDiv = item.id === 'inc_dividend' || item.category === 'dividend';
                const rowCustomStyle = getResolvedStyle(item.id);

                return (
                  <tr
                    key={item.id}
                    style={rowCustomStyle}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        targetType: 'row',
                        rowId: item.id,
                        label: item.name,
                      });
                    }}
                    className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-context-menu"
                  >
                    {/* 区分: 最初行で rowSpan={incomes.length} により1つのセルに結合 */}
                    {index === 0 && (
                      <td
                        rowSpan={incomes.length}
                        className="py-1.5 px-1 font-sans font-bold sticky left-0 bg-white dark:bg-[var(--color-finance-dark-surface)] z-10 border-r border-black/15 dark:border-white/15 text-center text-[var(--color-finance-positive)] align-middle"
                      >
                        収入
                      </td>
                    )}
                    {/* 項目名 (sticky left-[56px]) */}
                    <td className="py-1.5 px-3 font-sans font-medium sticky left-[56px] bg-white dark:bg-[var(--color-finance-dark-surface)] z-10 border-r border-black/15 dark:border-white/15">
                      <EditableCell
                        value={item.name}
                        type="text"
                        onSave={(val) => updateIncome(item.id, { name: String(val) })}
                        textClassName="text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)]"
                      />
                    </td>

                    {/* Timeline monthly columns: 純粋な黒字数値、パーセンテージなし */}
                    {timelineColumns.map((col) => {
                      const amount = getIncomeColAmount(item, col);
                      const cellStyle = getResolvedStyle(item.id, col.id);

                      return (
                        <td
                          key={col.id}
                          style={cellStyle}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              targetType: 'cell',
                              rowId: item.id,
                              colId: col.id,
                              label: `${item.name} (${col.label})`,
                              currentValue: amount,
                            });
                          }}
                          className={`py-1.5 px-2 text-center border-r border-black/15 dark:border-white/15 ${
                            col.isCurrent ? 'bg-[var(--color-finance-accent)]/5 font-bold' : ''
                          }`}
                        >
                          {isDiv ? (
                            <span className="text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)] font-semibold tabular-nums">
                              {maskAssetAmounts ? '***' : amount.toFixed(1)}
                            </span>
                          ) : (
                            <EditableCell
                              value={amount}
                              type="number"
                              step="0.1"
                              align="center"
                              onSave={(val) => updateMonthlyCell(item.id, col.id, Number(val) || 0, true)}
                              textClassName="text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)] font-semibold"
                              masked={maskAssetAmounts}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="py-1 px-1.5 border-r border-black/15 dark:border-white/15"></td>
                  </tr>
                );
              })}

              {/* 収入合計行 */}
              <tr
                style={getResolvedStyle('row_income_total')}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    targetType: 'row',
                    rowId: 'row_income_total',
                    label: labelFor('row_income_total', '収入小計'),
                  });
                }}
                className="bg-finance-positive/5 font-bold border-t border-finance-positive/20"
              >
                <td className="py-2 px-3 sticky left-0 bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-canvas)] z-10 border-r border-black/15 dark:border-white/15" colSpan={2}>
                  {labelFor('row_income_total', '収入小計')}
                </td>
                {columnTotals.map((t) => (
                  <td
                    key={t.colId}
                    style={getResolvedStyle('row_income_total', t.colId)}
                    className={`py-2 px-2 text-center border-r border-black/15 dark:border-white/15 text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)] ${
                      t.col.isCurrent ? 'bg-[var(--color-finance-accent)]/10 font-black' : ''
                    }`}
                  >
                    {maskAssetAmounts ? '***' : t.income.toFixed(1)}
                  </td>
                ))}
                <td className="py-1 px-1.5 border-r border-black/15 dark:border-white/15"></td>
              </tr>

              {/* ======================================================== */}
              {/* SECTION 2: 出金 (生活費の出費) */}
              {/* ======================================================== */}
              <tr
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    targetType: 'header',
                    rowId: 'sec_expense',
                    label: labelFor('sec_expense', '【2. 出金（生活費の出費・固定費・変動費・税金・特損）】'),
                  });
                }}
                style={getResolvedStyle('sec_expense')}
                className="bg-finance-accent-muted/10 dark:bg-finance-accent-muted/15 font-sans font-bold text-xs border-y border-finance-accent-muted/30 cursor-context-menu"
              >
                <td colSpan={2 + timelineColumns.length + 1} className="py-2 px-3 text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)]">
                  {labelFor('sec_expense', '【2. 出金（生活費の出費・固定費・変動費・税金・特損）】')}
                </td>
              </tr>

              {expenses.map((item, index) => {
                const rowCustomStyle = getResolvedStyle(item.id);

                return (
                  <tr
                    key={item.id}
                    style={rowCustomStyle}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        targetType: 'row',
                        rowId: item.id,
                        label: item.name,
                      });
                    }}
                    className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-context-menu"
                  >
                    {/* 区分: 最初行で rowSpan={expenses.length} により1つのセルに結合 */}
                    {index === 0 && (
                      <td
                        rowSpan={expenses.length}
                        className="py-1.5 px-1 font-sans font-bold sticky left-0 bg-white dark:bg-[var(--color-finance-dark-surface)] z-10 border-r border-black/15 dark:border-white/15 text-center text-[var(--color-finance-accent-muted)] align-middle"
                      >
                        支出
                      </td>
                    )}
                    {/* 項目名 (sticky left-[56px]) */}
                    <td className="py-1.5 px-3 font-sans font-medium sticky left-[56px] bg-white dark:bg-[var(--color-finance-dark-surface)] z-10 border-r border-black/15 dark:border-white/15">
                      <EditableCell
                        value={item.name}
                        type="text"
                        onSave={(val) => updateExpense(item.id, { name: String(val) })}
                        textClassName="text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)]"
                      />
                    </td>

                    {/* Timeline monthly columns: 純粋な黒字数値、パーセンテージなし */}
                    {timelineColumns.map((col) => {
                      const amount = getExpenseColAmount(item, col);
                      const cellStyle = getResolvedStyle(item.id, col.id);

                      return (
                        <td
                          key={col.id}
                          style={cellStyle}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              targetType: 'cell',
                              rowId: item.id,
                              colId: col.id,
                              label: `${item.name} (${col.label})`,
                              currentValue: amount,
                            });
                          }}
                          className={`py-1.5 px-2 text-center border-r border-black/15 dark:border-white/15 ${
                            col.isCurrent ? 'bg-[var(--color-finance-accent)]/5 font-bold' : ''
                          }`}
                        >
                          <EditableCell
                            value={amount}
                            type="number"
                            step="0.1"
                            align="center"
                            onSave={(val) => updateMonthlyCell(item.id, col.id, Number(val) || 0, true)}
                            textClassName="text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)] font-semibold"
                            masked={maskAssetAmounts}
                          />
                        </td>
                      );
                    })}
                    <td className="py-1 px-1.5 border-r border-black/15 dark:border-white/15"></td>
                  </tr>
                );
              })}

              {/* 支出合計行 (支出率パーセンテージなし) */}
              <tr
                style={getResolvedStyle('row_expense_total')}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    targetType: 'row',
                    rowId: 'row_expense_total',
                    label: labelFor('row_expense_total', '支出小計'),
                  });
                }}
                className="bg-finance-accent-muted/5 font-bold border-t border-finance-accent-muted/20"
              >
                <td className="py-2 px-3 sticky left-0 bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-canvas)] z-10 border-r border-black/15 dark:border-white/15" colSpan={2}>
                  {labelFor('row_expense_total', '支出小計')}
                </td>
                {columnTotals.map((t) => (
                  <td
                    key={t.colId}
                    style={getResolvedStyle('row_expense_total', t.colId)}
                    className={`py-2 px-2 text-center border-r border-black/15 dark:border-white/15 text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)] ${
                      t.col.isCurrent ? 'bg-[var(--color-finance-accent)]/10 font-black' : ''
                    }`}
                  >
                    {maskAssetAmounts ? '***' : `-${t.expense.toFixed(1)}`}
                  </td>
                ))}
                <td className="py-1 px-1.5 border-r border-black/15 dark:border-white/15"></td>
              </tr>

              {/* ======================================================== */}
              {/* SECTION 3: 差引余剰 (余剰率パーセンテージなし) */}
              {/* ======================================================== */}
              <tr
                style={getResolvedStyle('row_surplus')}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    targetType: 'row',
                    rowId: 'row_surplus',
                    label: labelFor('row_surplus', '差引余剰 (投資積立原資)'),
                  });
                }}
                className="bg-[var(--color-finance-accent)]/10 dark:bg-[var(--color-finance-accent)]/15 font-bold border-y-2 border-[var(--color-finance-accent)]/30 text-xs"
              >
                <td className="py-2 px-1 text-center font-sans font-bold sticky left-0 bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-canvas)] z-10 border-r border-black/15 dark:border-white/15 text-[var(--color-finance-accent)]">
                  余剰
                </td>
                <td className="py-2 px-3 sticky left-[56px] bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-canvas)] z-10 font-sans font-bold border-r border-black/15 dark:border-white/15 text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)]">
                  {labelFor('row_surplus', '差引余剰 (投資積立原資)')}
                </td>
                {columnTotals.map((t) => {
                  const isPositive = t.surplus >= 0;
                  return (
                    <td
                      key={t.colId}
                      style={getResolvedStyle('row_surplus', t.colId)}
                      className={`py-2 px-2 text-center border-r border-black/15 dark:border-white/15 font-extrabold ${
                        isPositive ? 'text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)]' : 'text-finance-negative'
                      } ${t.col.isCurrent ? 'bg-[var(--color-finance-accent)]/20' : ''}`}
                    >
                      {maskAssetAmounts ? '***' : (isPositive ? `+${t.surplus.toFixed(1)}` : `${t.surplus.toFixed(1)}`)}
                    </td>
                  );
                })}
                <td className="py-1 px-1.5 border-r border-black/15 dark:border-white/15"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. ASSET PORTFOLIO TABLE (With shares, averageCost, drag row, resizable columns, sharp borders) */}
      <div className="space-y-3 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--color-finance-accent)]" />
            <h2 className={`text-base font-bold ${isDark ? 'text-[var(--color-finance-surface)]' : 'text-[var(--color-finance-ink)]'}`}>
              保有資産ポートフォリオ一覧表
            </h2>
          </div>
          <span className="text-[11px] text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60">
            ※ 上下ドラッグで並び替え / 列境界ドラッグで幅変更 / 行右クリックで複製・削除
          </span>
        </div>

        {/* Category Filter Tabs (Flat spreadsheet pills with left/right reordering buttons & drag) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCategoryFilter('all')}
            className={`px-3 py-1.5 text-xs font-semibold border transition-all shrink-0 ${
              activeCategoryFilter === 'all'
                ? isDark
                  ? 'bg-white text-black border-white'
                  : 'bg-[var(--color-finance-ink)] text-white border-[var(--color-finance-ink)]'
                : 'bg-transparent border-black/10 dark:border-white/10 opacity-70 hover:opacity-100'
            }`}
          >
            すべて ({assets.length})
          </button>
          {orderedCategoryIds.map((catKey, catIdx) => {
            const meta = categoryMetaFor(catKey);
            const count = assets.filter(a => a.category === catKey).length;
            const isFirst = catIdx === 0;
            const isLast = catIdx === orderedCategoryIds.length - 1;

            return (
              <div
                key={catKey}
                draggable
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    targetType: 'row',
                    rowId: `asset_category_${catKey}`,
                    categoryId: catKey,
                    label: `${meta.label}（区分）`,
                  });
                }}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', catKey);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const sourceKey = e.dataTransfer.getData('text/plain') as AssetCategory;
                  if (sourceKey && sourceKey !== catKey) {
                    const sourceIdx = categoryOrder.indexOf(sourceKey);
                    const targetIdx = catIdx;
                    if (sourceIdx < targetIdx) {
                      moveCategoryOrder(sourceKey, 'right');
                    } else {
                      moveCategoryOrder(sourceKey, 'left');
                    }
                  }
                }}
                className={`group flex items-center border transition-all shrink-0 cursor-grab active:cursor-grabbing ${
                  activeCategoryFilter === catKey
                    ? 'bg-[var(--color-finance-accent)] text-white border-[var(--color-finance-accent)]'
                    : 'bg-transparent border-black/10 dark:border-white/10 opacity-80 hover:opacity-100'
                }`}
              >
                {/* Left shift button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveCategoryOrder(catKey, 'left');
                  }}
                  disabled={isFirst}
                  title="タブを左へ移動"
                  className={`px-1 py-1 text-[9px] hover:bg-black/10 dark:hover:bg-white/15 transition-opacity ${
                    isFirst ? 'opacity-20 cursor-default' : 'opacity-40 group-hover:opacity-100 cursor-pointer'
                  }`}
                >
                  ◀
                </button>

                {/* Main Tab Label */}
                <button
                  type="button"
                  onClick={() => setActiveCategoryFilter(catKey)}
                  className="px-2 py-1.5 text-xs font-semibold flex items-center gap-1.5"
                >
                  <span className="w-2 h-2 inline-block shrink-0" style={{ backgroundColor: meta.color }} />
                  <span>{meta.label}</span>
                  <span className="opacity-60 text-[10px]">({count})</span>
                </button>

                {/* Right shift button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveCategoryOrder(catKey, 'right');
                  }}
                  disabled={isLast}
                  title="タブを右へ移動"
                  className={`px-1 py-1 text-[9px] hover:bg-black/10 dark:hover:bg-white/15 transition-opacity ${
                    isLast ? 'opacity-20 cursor-default' : 'opacity-40 group-hover:opacity-100 cursor-pointer'
                  }`}
                >
                  ▶
                </button>
              </div>
            );
          })}
        </div>

        {/* Resizable Asset Portfolio Table */}
        <div className="overflow-x-auto border border-black/10 dark:border-white/10 bg-white dark:bg-[var(--color-finance-dark-surface)] select-none">
          <table className="w-full text-xs text-left border-collapse table-fixed">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/10 bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-canvas)] text-[var(--color-finance-ink)]/70 dark:text-[var(--color-finance-surface)]/70 font-sans">
                {columnKeys.map((colKey) => {
                  const colDef = DEFAULT_ASSET_COLUMNS.find(c => c.key === colKey);
                  const width = colWidths[colKey] || colDef?.defaultWidth || 100;
                  return (
                    <th
                      key={colKey}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setStyleScope('cell');
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          targetType: 'header',
                          rowId: 'header_asset',
                          colId: colKey,
                          label: labelFor(`header_asset_${colKey}`, colDef?.label || colKey),
                        });
                      }}
                      style={{ width: `${width}px` }}
                      className={`relative py-2.5 px-3 font-semibold group border-r border-black/10 dark:border-white/10 ${
                        colDef?.align === 'right' ? 'text-right' : colDef?.align === 'center' ? 'text-center' : 'text-left'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 overflow-hidden">
                        <span className="truncate">{labelFor(`header_asset_${colKey}`, colDef?.label || colKey)}</span>
                        {colKey !== 'drag' && (
                          <div className="opacity-0 group-hover:opacity-70 flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => moveColumn(colKey, 'left')}
                              title="列を左へ"
                              className="hover:text-[var(--color-finance-accent)] p-0.5 text-[9px]"
                            >
                              ◀
                            </button>
                            <button
                              onClick={() => moveColumn(colKey, 'right')}
                              title="列を右へ"
                              className="hover:text-[var(--color-finance-accent)] p-0.5 text-[9px]"
                            >
                              ▶
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Drag handle on right edge */}
                      <div
                        onMouseDown={(e) => {
                          e.preventDefault();
                          document.body.style.cursor = 'col-resize';
                          resizingColRef.current = {
                            key: colKey,
                            startX: e.clientX,
                            startWidth: width,
                          };
                        }}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[var(--color-finance-accent)]/50 transition-colors z-20"
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-black/5 dark:divide-white/5 font-mono text-xs">
              {filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={columnKeys.length} className="py-12 text-center text-finance-muted font-sans">
                    資産が登録されていません。「資産を追加」ボタンから追加してください。
                  </td>
                </tr>
              ) : (
                filteredAssets.map((asset, index) => {
                  const catMeta = categoryMetaFor(asset.category);
                  const sharePercent = netWorthTotal > 0 ? ((asset.amount / netWorthTotal) * 100).toFixed(1) : '0.0';
                  const isDragging = draggedRowId === asset.id;

                  return (
                    <tr
                      key={asset.id}
                      draggable
                      onDragStart={() => handleDragStart(asset.id)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(asset.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          targetType: 'row',
                          rowId: asset.id,
                          label: asset.name,
                          assetItem: asset,
                        });
                      }}
                      className={`hover:bg-black/5 dark:hover:bg-white/5 transition-colors group cursor-grab active:cursor-grabbing ${
                        isDragging ? 'opacity-30 bg-[var(--color-finance-accent)]/10' : ''
                      }`}
                    >
                      {columnKeys.map((colKey) => {
                        const colDef = DEFAULT_ASSET_COLUMNS.find(c => c.key === colKey);
                        const alignClass = colDef?.align === 'right' ? 'text-right' : colDef?.align === 'center' ? 'text-center' : 'text-left';

                        return (
                          <td
                            key={colKey}
                            className={`py-2 px-3 truncate border-r border-black/10 dark:border-white/10 ${alignClass}`}
                          >
                            {colKey === 'drag' && (
                              <div className="flex items-center justify-center text-finance-muted group-hover:text-[var(--color-finance-accent)]">
                                <GripVertical className="w-4 h-4 cursor-grab" />
                              </div>
                            )}

                            {colKey === 'category' && (
                              <div className="font-sans">
                                <select
                                  value={asset.category}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const meta = categoryMetaFor(asset.category);
                                    setContextMenu({
                                      x: e.clientX,
                                      y: e.clientY,
                                      targetType: 'row',
                                      rowId: `asset_category_${asset.category}`,
                                      categoryId: asset.category,
                                      label: `${meta.label}（区分）`,
                                    });
                                  }}
                                  onChange={(e) => {
                                    if (e.target.value === '__create_asset_category__') {
                                      const label = window.prompt('新しい資産区分名を入力してください');
                                      const category = label ? registerCustomAssetCategory(label) : null;
                                      if (category) updateAsset(asset.id, { category });
                                      return;
                                    }
                                    if (e.target.value === '__edit_asset_category__') {
                                      if (customAssetCategories.some((item) => item.id === asset.category)) {
                                        const currentLabel = categoryMetaFor(asset.category).label;
                                        const nextLabel = window.prompt('区分名を編集してください', currentLabel);
                                        if (nextLabel?.trim()) renameCustomAssetCategory(asset.category, nextLabel);
                                      }
                                      e.currentTarget.value = asset.category;
                                      return;
                                    }
                                    if (e.target.value === '__delete_asset_category__') {
                                      if (customAssetCategories.some((item) => item.id === asset.category)
                                        && window.confirm(`区分「${categoryMetaFor(asset.category).label}」を削除しますか？\n使用中の資産行は生活防衛資金へ移動します。`)) {
                                        deleteCustomAssetCategory(asset.category, 'cash');
                                      }
                                      e.currentTarget.value = asset.category;
                                      return;
                                    }
                                    updateAsset(asset.id, { category: e.target.value as AssetCategory });
                                  }}
                                  className="text-[11px] py-0.5 px-1.5 border bg-transparent font-medium cursor-pointer"
                                  style={{ color: catMeta.color, borderColor: `${catMeta.color}50` }}
                                >
                                  {categoryOptions.map((category) => (
                                    <option key={category.id} value={category.id} className="text-black">{category.label}</option>
                                  ))}
                                  <option value="__create_asset_category__" className="text-black">＋ 新しい区分を追加…</option>
                                  <option value="__edit_asset_category__" className="text-black">✎ 選択中の区分を編集…</option>
                                  <option value="__delete_asset_category__" className="text-black">🗑 選択中の区分を削除…</option>
                                </select>
                              </div>
                            )}

                            {colKey === 'name' && (
                              <div className="font-sans">
                                <EditableCell
                                  value={asset.name}
                                  type="text"
                                  onSave={(val) => updateAsset(asset.id, { name: String(val) })}
                                  textClassName={`font-medium ${isDark ? 'text-[var(--color-finance-surface)]' : 'text-[var(--color-finance-ink)]'}`}
                                />
                              </div>
                            )}

                            {colKey === 'ticker' && (
                              <EditableCell
                                value={asset.ticker || '—'}
                                type="text"
                                onSave={(val) => {
                                  const uppercase = String(val).toUpperCase();
                                  const lookup = lookupYahooFinanceTicker(uppercase);
                                  if (lookup) {
                                    updateAsset(asset.id, {
                                      ticker: uppercase,
                                      name: lookup.name,
                                    });
                                  } else {
                                    updateAsset(asset.id, { ticker: uppercase });
                                  }
                                }}
                                textClassName="font-mono font-bold text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)]"
                              />
                            )}

                            {colKey === 'institution' && (
                              <div className="font-sans">
                                <EditableCell
                                  value={asset.institution || '—'}
                                  type="text"
                                  onSave={(val) => updateAsset(asset.id, { institution: String(val) })}
                                  textClassName="text-[var(--color-finance-ink)]/70 dark:text-[var(--color-finance-surface)]/70"
                                />
                              </div>
                            )}

                            {/* 保有枚数 / 口数 / 株数 */}
                            {colKey === 'shares' && (
                              <EditableCell
                                value={asset.shares !== undefined ? asset.shares : 0}
                                type="number"
                                step="1"
                                align="center"
                                onSave={(val) => updateAsset(asset.id, { shares: Number(val) || 0 })}
                                textClassName="text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)] font-medium"
                              />
                            )}

                            {/* 平均取得単価 */}
                            {colKey === 'averageCost' && (
                              <EditableCell
                                value={asset.averageCost !== undefined ? asset.averageCost : 0}
                                type="number"
                                step="0.1"
                                align="center"
                                onSave={(val) => updateAsset(asset.id, { averageCost: Number(val) || 0 })}
                                textClassName="text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)] font-medium"
                                masked={maskAssetAmounts}
                              />
                            )}

                            {/* MooViewチャートビューと同じ取得元の現在値 */}
                            {colKey === 'currentPrice' && (
                              <EditableCell
                                value={asset.currentPrice !== undefined && asset.currentPrice > 0 ? asset.currentPrice : '—'}
                                type="number"
                                step="0.01"
                                align="center"
                                onSave={(val) => {
                                  const currentPrice = Number(val) || 0;
                                  const shares = Number(asset.shares) || 0;
                                  updateAsset(asset.id, {
                                    currentPrice,
                                    ...(shares > 0 ? {
                                      amount: calculateAssetAmountManYen(
                                        currentPrice,
                                        shares,
                                        isJapaneseMutualFundCode(asset.ticker) ? 'per_10000_units' : 'per_share',
                                      ),
                                    } : {}),
                                  });
                                }}
                                textClassName="text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)] font-medium"
                                masked={maskAssetAmounts}
                              />
                            )}

                            {colKey === 'amount' && (
                              <EditableCell
                                value={asset.amount}
                                type="number"
                                step="10"
                                align="center"
                                onSave={(val) => updateAsset(asset.id, { amount: Number(val) || 0 })}
                                textClassName={`font-bold tabular-nums text-sm ${isDark ? 'text-[var(--color-finance-surface)]' : 'text-[var(--color-finance-ink)]'}`}
                                masked={maskAssetAmounts}
                              />
                            )}

                            {colKey === 'share' && (
                              <span className="font-mono text-[11px] text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60 tabular-nums">
                                {sharePercent}%
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======================================================== */}
      {/* Context Menu (Right Click on Cell, Row, Col, or Header) */}
      {/* ======================================================== */}
      {contextMenu && (
        <div
          style={{ top: `${Math.min(window.innerHeight - 380, contextMenu.y)}px`, left: `${Math.min(window.innerWidth - 240, contextMenu.x)}px` }}
          className={`fixed z-50 p-2 shadow-2xl border text-xs min-w-[220px] max-w-[280px] animate-in fade-in transition-all ${
            isDark
              ? 'bg-[var(--color-finance-dark-surface)] border-white/15 text-[var(--color-finance-surface)]'
              : 'bg-white border-black/15 text-[var(--color-finance-ink)]'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-[11px] font-bold text-finance-muted border-b border-black/10 dark:border-white/10 mb-1.5 flex items-center justify-between">
            <span className="truncate">{contextMenu.label || 'メニュー'}</span>
            <span className="text-[10px] uppercase opacity-60">
              {contextMenu.targetType}
            </span>
          </div>

          {/* Cell Specific: Change this single cell only */}
          {contextMenu.targetType === 'cell' && contextMenu.rowId && contextMenu.colId && !contextMenu.rowId.startsWith('header_') && (
            <button
              onClick={() => {
                setSingleCellEditModal({
                  open: true,
                  itemId: contextMenu.rowId!,
                  colId: contextMenu.colId!,
                  itemName: contextMenu.label || '',
                  currentValue: contextMenu.currentValue || 0,
                });
                setContextMenu(null);
              }}
              className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-[var(--color-finance-accent)]/10 text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)] font-semibold transition-colors"
            >
              <span>このセルだけ数値を変更 (右へ波及させない)</span>
            </button>
          )}

          {editableHeaderLabelId() && (
            <button
              onClick={() => {
                const id = editableHeaderLabelId();
                if (!id) return;
                setHeaderTextEditModal({ open: true, id, label: contextMenu.label || '' });
                setContextMenu(null);
              }}
              className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-[var(--color-finance-accent)]/10 text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)] font-semibold transition-colors"
            >
              テキストを編集
            </button>
          )}

          {contextMenu.rowId && contextMenu.colId && contextMenu.targetType !== 'row' && contextMenu.targetType !== 'header' && (
            <div className="px-2 py-1.5 border-t border-black/10 dark:border-white/10">
              <span className="block text-[10px] text-finance-muted font-semibold mb-1">色・書式の適用範囲</span>
              <div className="grid grid-cols-3 gap-1">
                {(['cell', 'row', 'col'] as const).map((scope) => (
                  <button
                    key={scope}
                    onClick={() => setStyleScope(scope)}
                    className={`px-1 py-1 border text-[10px] ${styleScope === scope ? 'bg-[var(--color-finance-accent)] border-[var(--color-finance-accent)] text-white' : 'border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10'}`}
                  >
                    {scope === 'cell' ? (contextMenu.rowId === 'header_month' || contextMenu.rowId === 'header_fixed' ? 'このヘッダー' : 'このセル') : scope === 'row' ? 'この行' : 'この列'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Background Color Palette */}
          <div className="py-1">
            <span className="block text-[10px] text-finance-muted font-semibold px-2 mb-1 flex items-center gap-1">
              <Palette className="w-3 h-3" />
              背景色を変更
            </span>
            <div className="grid grid-cols-5 gap-1 px-1">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.label}
                  onClick={() => applyMenuStyle(c.value ? { bg: c.value } : { bg: undefined })}
                  title={c.label}
                  className="w-7 h-6 border border-black/20 dark:border-white/20 flex items-center justify-center text-[9px] hover:scale-105 transition-transform"
                  style={{ backgroundColor: c.value || (isDark ? 'var(--color-finance-dark-surface)' : 'var(--color-finance-surface)') }}
                >
                  {!c.value && '✕'}
                </button>
              ))}
            </div>
          </div>

          {/* Font Color & Style */}
          <div className="py-1 border-t border-black/10 dark:border-white/10 mt-1">
            <span className="block text-[10px] text-finance-muted font-semibold px-2 mb-1 flex items-center gap-1">
              <Type className="w-3 h-3" />
              フォント・装飾
            </span>
            <div className="flex items-center gap-1 px-1 mb-1">
              <button
                onClick={() => applyMenuStyle({ fontWeight: 'bold' })}
                className="px-2 py-1 border border-black/20 dark:border-white/20 font-bold hover:bg-black/5"
              >
                B
              </button>
              <button
                onClick={() => applyMenuStyle({ fontStyle: 'italic' })}
                className="px-2 py-1 border border-black/20 dark:border-white/20 italic hover:bg-black/5"
              >
                I
              </button>
              <button
                onClick={() => applyMenuStyle({ textDecoration: 'line-through' })}
                className="px-2 py-1 border border-black/20 dark:border-white/20 line-through hover:bg-black/5"
              >
                S
              </button>
              <button
                onClick={() => applyMenuStyle(null)}
                className="px-2 py-1 border border-black/20 dark:border-white/20 text-[10px] hover:bg-black/5"
              >
                標準に戻す
              </button>
            </div>
            {/* Font color presets */}
            <div className="flex items-center gap-1 px-1">
              {PRESET_TEXT_COLORS.map(tc => (
                <button
                  key={tc.label}
                  onClick={() => applyMenuStyle({ color: tc.value || undefined })}
                  title={tc.label}
                  className="w-5 h-5 border border-black/20 dark:border-white/20 flex items-center justify-center font-bold text-[10px]"
                  style={{ color: tc.value || (isDark ? 'var(--color-finance-canvas)' : 'var(--color-finance-ink)') }}
                >
                  A
                </button>
              ))}
            </div>
          </div>

          {/* 月次計画の行操作。列追加ではなく、同じ区分の直下へ行を追加する。 */}
          <div className="py-1 border-t border-black/10 dark:border-white/10 mt-1">
            {contextMenu.targetType === 'header' && contextMenu.rowId === 'header_asset' && contextMenu.colId && (
              <>
                <button
                  onClick={() => { moveColumn(contextMenu.colId as AssetColumnKey, 'left'); setContextMenu(null); }}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  この列を左へ移動
                </button>
                <button
                  onClick={() => { moveColumn(contextMenu.colId as AssetColumnKey, 'right'); setContextMenu(null); }}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  この列を右へ移動
                </button>
                <button
                  onClick={() => {
                    const next = columnKeys.filter((key) => key !== contextMenu.colId);
                    setColumnKeys(next);
                    try { localStorage.setItem('finance_simulation_asset_col_order_v2', JSON.stringify(next)); } catch {}
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-[var(--color-finance-negative)] hover:bg-[var(--color-finance-negative)]/10"
                >
                  この列を削除（非表示）
                </button>
                <button
                  onClick={() => {
                    const hidden = DEFAULT_ASSET_COLUMNS.find((column) => !columnKeys.includes(column.key));
                    if (hidden) {
                      const next = [...columnKeys, hidden.key];
                      setColumnKeys(next);
                      try { localStorage.setItem('finance_simulation_asset_col_order_v2', JSON.stringify(next)); } catch {}
                    }
                    setContextMenu(null);
                  }}
                  disabled={DEFAULT_ASSET_COLUMNS.every((column) => columnKeys.includes(column.key))}
                  className="w-full text-left px-2.5 py-1.5 disabled:opacity-40 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  非表示列を追加
                </button>
              </>
            )}
            {contextMenu.targetType === 'col' && (
              <>
                {contextMenu.rowId === 'header_month' && contextMenu.colId && (
                  <>
                    <button onClick={() => { moveTimelineColumn(contextMenu.colId!, 'left'); setContextMenu(null); }} className="w-full text-left px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10">この月列を左へ移動</button>
                    <button onClick={() => { moveTimelineColumn(contextMenu.colId!, 'right'); setContextMenu(null); }} className="w-full text-left px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10">この月列を右へ移動</button>
                  </>
                )}
                <button
                  onClick={() => {
                    if (contextMenu.colId) deleteTimelineColumn(contextMenu.colId);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 text-[var(--color-finance-negative)] hover:bg-[var(--color-finance-negative)]/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>この列を削除</span>
                </button>
              </>
            )}
          </div>

          {/* Row Duplicate/Delete for AssetItem */}
          {contextMenu.categoryId && (
            <div className="py-1 border-t border-black/10 dark:border-white/10 mt-1">
              {CATEGORY_META[contextMenu.categoryId as keyof typeof CATEGORY_META] || customAssetCategories.some((item) => item.id === contextMenu.categoryId) ? (
                customAssetCategories.some((item) => item.id === contextMenu.categoryId) ? (
                  <>
                    <button
                      onClick={() => {
                        const categoryId = contextMenu.categoryId!;
                        const currentLabel = categoryMetaFor(categoryId).label;
                        const nextLabel = window.prompt('区分名を編集してください', currentLabel);
                        if (nextLabel?.trim()) renameCustomAssetCategory(categoryId, nextLabel);
                        setContextMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 text-[var(--color-finance-accent)] hover:bg-[var(--color-finance-accent)]/10 transition-colors"
                    >
                      <Type className="w-3.5 h-3.5" />
                      <span>この区分名を編集</span>
                    </button>
                    <button
                      onClick={() => {
                        const categoryId = contextMenu.categoryId!;
                        const categoryLabel = categoryMetaFor(categoryId).label;
                        if (window.confirm(`区分「${categoryLabel}」を削除しますか？\n使用中の資産行は「生活防衛資金（預金）」へ移動します。`)) {
                          deleteCustomAssetCategory(categoryId, 'cash');
                        }
                        setContextMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 text-[var(--color-finance-negative)] hover:bg-[var(--color-finance-negative)]/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>この区分を削除</span>
                    </button>
                  </>
                ) : (
                  <div className="px-2.5 py-1.5 text-[11px] text-finance-muted">標準区分は削除できません</div>
                )
              ) : null}
            </div>
          )}

          {contextMenu.assetItem && (
            <div className="py-1 border-t border-black/10 dark:border-white/10 mt-1">
              <button
                onClick={() => {
                  moveAsset(contextMenu.assetItem!.id, 'up');
                  setContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5 rotate-90 text-[var(--color-finance-accent)]" />
                <span>この資産行を上へ移動</span>
              </button>
              <button
                onClick={() => {
                  moveAsset(contextMenu.assetItem!.id, 'down');
                  setContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5 -rotate-90 text-[var(--color-finance-accent)]" />
                <span>この資産行を下へ移動</span>
              </button>
              <button
                onClick={() => {
                  addAsset({
                    ...contextMenu.assetItem!,
                    linkedDividendId: undefined,
                    name: uniqueAssetName(contextMenu.assetItem!.name, true),
                  }, contextMenu.assetItem!.id);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <Copy className="w-3.5 h-3.5 text-[var(--color-finance-accent)]" />
                <span>資産行を複製</span>
              </button>
              <button
                onClick={() => {
                  const source = contextMenu.assetItem!;
                  addAsset({
                    category: source.category,
                    name: uniqueAssetName('新規資産'),
                    ticker: '',
                    amount: 0,
                    shares: 0,
                    averageCost: 0,
                    currentPrice: 0,
                    institution: source.institution || '',
                    note: '',
                  }, source.id);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--color-finance-accent)]" />
                <span>この下に新規資産行を追加</span>
              </button>
              <button
                onClick={() => {
                  deleteAsset(contextMenu.assetItem!.id);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 text-[var(--color-finance-negative)] hover:bg-[var(--color-finance-negative)]/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>資産行を削除</span>
              </button>
            </div>
          )}

          {/* Delete Income/Expense Row */}
          {contextMenu.targetType === 'row' && contextMenu.rowId && !contextMenu.assetItem && !contextMenu.categoryId && !contextMenu.rowId.startsWith('sec_') && !contextMenu.rowId.startsWith('prog_') && (
            <div className="py-1 border-t border-black/10 dark:border-white/10 mt-1">
              <button
                onClick={() => {
                  moveCashflowRow(contextMenu.rowId!, 'up');
                  setContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5 rotate-90 text-[var(--color-finance-accent)]" />
                <span>この行を上へ移動</span>
              </button>
              <button
                onClick={() => {
                  moveCashflowRow(contextMenu.rowId!, 'down');
                  setContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5 rotate-90 text-[var(--color-finance-accent)]" />
                <span>この行を下へ移動</span>
              </button>
              <button
                onClick={() => {
                  addCashflowRowAfter(contextMenu.rowId!);
                  setContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--color-finance-accent)]" />
                <span>この下に行を追加（特損）</span>
              </button>
              <button
                onClick={() => {
                  if (incomes.some(i => i.id === contextMenu.rowId)) {
                    deleteIncome(contextMenu.rowId!);
                  } else if (expenses.some(e => e.id === contextMenu.rowId)) {
                    deleteExpense(contextMenu.rowId!);
                  }
                  setContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 text-[var(--color-finance-negative)] hover:bg-[var(--color-finance-negative)]/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>この行を削除</span>
              </button>
            </div>
          )}

          {/* Global Undo */}
          <div className="py-1 border-t border-black/10 dark:border-white/10 mt-1">
            <button
              onClick={() => {
                undo();
                setContextMenu(null);
              }}
              disabled={!canUndo}
              className={`w-full text-left px-2.5 py-1.5 flex items-center gap-2 transition-colors ${
                canUndo ? 'hover:bg-black/5 dark:hover:bg-white/10 text-[var(--color-finance-accent)]' : 'opacity-40 cursor-not-allowed'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>操作を1つ元に戻す (Ctrl+Z)</span>
            </button>
          </div>
        </div>
      )}

      {headerTextEditModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const value = new FormData(form).get('header-label');
              updateCustomLabel(headerTextEditModal.id, String(value || ''));
              setHeaderTextEditModal({ open: false, id: '', label: '' });
            }}
            className={`p-5 w-full max-w-sm border shadow-2xl space-y-4 ${isDark ? 'bg-[var(--color-finance-ink)] border-white/20 text-[var(--color-finance-surface)]' : 'bg-white border-black/20 text-[var(--color-finance-ink)]'}`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-black/10 dark:border-white/10">
              <h3 className="text-sm font-bold">表見出しを編集</h3>
              <button type="button" onClick={() => setHeaderTextEditModal({ open: false, id: '', label: '' })} className="p-1 hover:text-[var(--color-finance-accent)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input name="header-label" autoFocus defaultValue={headerTextEditModal.label} className="w-full p-2 border bg-transparent text-sm" />
            <div className="pt-2 flex justify-end gap-2 border-t border-black/10 dark:border-white/10 text-xs">
              <button type="button" onClick={() => setHeaderTextEditModal({ open: false, id: '', label: '' })} className="px-3 py-1.5 border border-black/10 dark:border-white/10">キャンセル</button>
              <button type="submit" className="px-3 py-1.5 bg-[var(--color-finance-accent)] text-white">保存</button>
            </div>
          </form>
        </div>
      )}

      {/* ======================================================== */}
      {/* Modal: Single Cell Edit (Spot override without propagation) */}
      {/* ======================================================== */}
      {singleCellEditModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className={`p-5 w-full max-w-sm border shadow-2xl space-y-4 ${
            isDark ? 'bg-[var(--color-finance-ink)] border-white/20 text-[var(--color-finance-surface)]' : 'bg-white border-black/20 text-[var(--color-finance-ink)]'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-black/10 dark:border-white/10">
              <h3 className="text-sm font-bold">このセルのみ数値を変更</h3>
              <button
                onClick={() => setSingleCellEditModal({ open: false, itemId: '', colId: '', itemName: '', currentValue: 0 })}
                className="p-1 hover:text-[var(--color-finance-accent)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--color-finance-ink)]/70 dark:text-[var(--color-finance-surface)]/70">
              対象: <span className="font-semibold">{singleCellEditModal.itemName}</span><br />
              （※ 右以降の月次には影響を与えず、この月単体のみ変更します）
            </p>
            <div>
              <label className="block text-[11px] font-semibold text-finance-muted mb-1">金額 (万円)</label>
              <input
                type="number"
                step="0.1"
                autoFocus
                defaultValue={singleCellEditModal.currentValue}
                id="single-cell-val-input"
                className="w-full p-2 border bg-transparent font-mono font-bold text-sm"
              />
            </div>
            <div className="pt-2 flex justify-end gap-2 border-t border-black/10 dark:border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setSingleCellEditModal({ open: false, itemId: '', colId: '', itemName: '', currentValue: 0 })}
                className="px-3 py-1.5 border border-black/10 dark:border-white/10"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById('single-cell-val-input') as HTMLInputElement;
                  const val = Number(input?.value) || 0;
                  // propagateToFuture = false!
                  updateMonthlyCell(singleCellEditModal.itemId, singleCellEditModal.colId, val, false);
                  setSingleCellEditModal({ open: false, itemId: '', colId: '', itemName: '', currentValue: 0 });
                }}
                className="px-4 py-1.5 font-semibold text-white bg-[var(--color-finance-accent)] hover:bg-[var(--color-finance-accent-strong)]"
              >
                この月のみ保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Modal: Add Asset (No rounded corners, straight border) */}
      {/* ======================================================== */}
      {showAddAssetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className={`p-6 w-full max-w-md border shadow-2xl space-y-4 ${
            isDark ? 'bg-[var(--color-finance-ink)] border-white/20 text-[var(--color-finance-surface)]' : 'bg-white border-black/20 text-[var(--color-finance-ink)]'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-black/10 dark:border-white/10">
              <h3 className="text-base font-bold">資産を追加</h3>
              <button onClick={() => setShowAddAssetModal(false)} className="p-1 hover:text-[var(--color-finance-accent)]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newAsset.name) return;
                addAsset(newAsset);
                setShowAddAssetModal(false);
                setNewAsset({ category: 'cash', name: '', ticker: '', amount: 100, shares: 0, averageCost: 0, currentPrice: 0, institution: '証券口座', note: '' });
              }}
              className="space-y-3.5 text-xs"
            >
              <div>
                <label className="block text-[11px] font-semibold text-finance-muted mb-1">資産区分</label>
                <select
                  value={newAsset.category}
                  onChange={(e) => {
                    if (e.target.value === '__create_asset_category__') {
                      const label = window.prompt('新しい資産区分名を入力してください');
                      const category = label ? registerCustomAssetCategory(label) : null;
                      if (category) setNewAsset({ ...newAsset, category });
                      return;
                    }
                    if (e.target.value === '__edit_asset_category__') {
                      if (customAssetCategories.some((item) => item.id === newAsset.category)) {
                        const currentLabel = categoryMetaFor(newAsset.category).label;
                        const nextLabel = window.prompt('区分名を編集してください', currentLabel);
                        if (nextLabel?.trim()) renameCustomAssetCategory(newAsset.category, nextLabel);
                      }
                      e.currentTarget.value = newAsset.category;
                      return;
                    }
                    if (e.target.value === '__delete_asset_category__') {
                      if (customAssetCategories.some((item) => item.id === newAsset.category)
                        && window.confirm(`区分「${categoryMetaFor(newAsset.category).label}」を削除しますか？\n使用中の資産行は生活防衛資金へ移動します。`)) {
                        deleteCustomAssetCategory(newAsset.category, 'cash');
                        setNewAsset((previous) => ({ ...previous, category: 'cash' }));
                      }
                      e.currentTarget.value = newAsset.category;
                      return;
                    }
                    setNewAsset({ ...newAsset, category: e.target.value as AssetCategory });
                  }}
                  className="w-full p-2 border bg-transparent font-medium"
                >
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id} className="text-black">{category.label}</option>
                  ))}
                  <option value="__create_asset_category__" className="text-black">＋ 新しい区分を追加…</option>
                  <option value="__edit_asset_category__" className="text-black">✎ 選択中の区分を編集…</option>
                  <option value="__delete_asset_category__" className="text-black">🗑 選択中の区分を削除…</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-finance-muted mb-1">ティッカー (任意: 入力で名称自動補完)</label>
                <input
                  type="text"
                  placeholder="例: VOO, SPY, QQQI, 2563"
                  value={newAsset.ticker || ''}
                  onChange={(e) => handleTickerLookup(e.target.value)}
                  className="w-full p-2 border bg-transparent font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-finance-muted mb-1">資産名称 *</label>
                <input
                  type="text"
                  required
                  placeholder="例: eMAXIS Slim S&P500"
                  value={newAsset.name}
                  onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
                  className="w-full p-2 border bg-transparent font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-finance-muted mb-1">現在評価額 (万円) *</label>
                  <input
                    type="number"
                    step="1"
                    required
                    value={newAsset.amount}
                    onChange={(e) => setNewAsset({ ...newAsset, amount: Number(e.target.value) || 0 })}
                    className="w-full p-2 border bg-transparent font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-finance-muted mb-1">金融機関 / 口座</label>
                  <input
                    type="text"
                    value={newAsset.institution || ''}
                    onChange={(e) => setNewAsset({ ...newAsset, institution: e.target.value })}
                    className="w-full p-2 border bg-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-finance-muted mb-1">保有枚数 / 口数</label>
                  <input
                    type="number"
                    step="1"
                    value={newAsset.shares || 0}
                    onChange={(e) => setNewAsset({ ...newAsset, shares: Number(e.target.value) || 0 })}
                    className="w-full p-2 border bg-transparent font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-finance-muted mb-1">平均取得単価 (円またはドル)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newAsset.averageCost || 0}
                    onChange={(e) => setNewAsset({ ...newAsset, averageCost: Number(e.target.value) || 0 })}
                    className="w-full p-2 border bg-transparent font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-black/10 dark:border-white/10 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddAssetModal(false)}
                  className="px-4 py-2 border border-black/10 dark:border-white/10"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-semibold text-white bg-[var(--color-finance-accent)] hover:bg-[var(--color-finance-accent-strong)]"
                >
                  保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Modal: Add Income */}
      {/* ======================================================== */}
      {showAddIncomeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className={`p-6 w-full max-w-sm border shadow-2xl space-y-4 ${
            isDark ? 'bg-[var(--color-finance-ink)] border-white/20 text-[var(--color-finance-surface)]' : 'bg-white border-black/20 text-[var(--color-finance-ink)]'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-black/10 dark:border-white/10">
              <h3 className="text-base font-bold">収入項目を追加</h3>
              <button onClick={() => setShowAddIncomeModal(false)} className="p-1 hover:text-[var(--color-finance-accent)]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newIncome.name) return;
                addIncome(newIncome);
                setShowAddIncomeModal(false);
                setNewIncome({ name: '', amount: 10, isRecurring: true, category: 'other', note: '' });
              }}
              className="space-y-3.5 text-xs"
            >
              <div>
                <label className="block text-[11px] font-semibold text-finance-muted mb-1">項目名 *</label>
                <input
                  type="text"
                  required
                  placeholder="例: 給与, 副業, Amazonアフィリエイト"
                  value={newIncome.name}
                  onChange={(e) => setNewIncome({ ...newIncome, name: e.target.value })}
                  className="w-full p-2 border bg-transparent font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-finance-muted mb-1">基準月額 (万円) *</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={newIncome.amount}
                  onChange={(e) => setNewIncome({ ...newIncome, amount: Number(e.target.value) || 0 })}
                  className="w-full p-2 border bg-transparent font-mono font-bold"
                />
              </div>

              <div className="pt-3 border-t border-black/10 dark:border-white/10 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddIncomeModal(false)}
                  className="px-4 py-2 border border-black/10 dark:border-white/10"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-semibold text-white bg-[var(--color-finance-accent)] hover:bg-[var(--color-finance-accent-strong)]"
                >
                  追加する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Modal: Add Expense */}
      {/* ======================================================== */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className={`p-6 w-full max-w-sm border shadow-2xl space-y-4 ${
            isDark ? 'bg-[var(--color-finance-ink)] border-white/20 text-[var(--color-finance-surface)]' : 'bg-white border-black/20 text-[var(--color-finance-ink)]'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-black/10 dark:border-white/10">
              <h3 className="text-base font-bold">支出項目・特別損失を追加</h3>
              <button onClick={() => setShowAddExpenseModal(false)} className="p-1 hover:text-[var(--color-finance-accent)]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newExpense.name) return;
                addExpense(newExpense);
                setShowAddExpenseModal(false);
                setNewExpense({ name: '', amount: 5, category: 'variable', note: '' });
              }}
              className="space-y-3.5 text-xs"
            >
              <div>
                <label className="block text-[11px] font-semibold text-finance-muted mb-1">項目名 *</label>
                <input
                  type="text"
                  required
                  placeholder="例: 食費, 家賃, 住民税, 11月特別出費"
                  value={newExpense.name}
                  onChange={(e) => setNewExpense({ ...newExpense, name: e.target.value })}
                  className="w-full p-2 border bg-transparent font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-finance-muted mb-1">区分</label>
                <select
                  value={newExpense.category}
                  onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value as any })}
                  className="w-full p-2 border bg-transparent font-medium"
                >
                  <option value="fixed" className="text-black">固定費 (家賃・光熱費・通信費)</option>
                  <option value="variable" className="text-black">変動費 (食費・娯楽・特別出費)</option>
                  <option value="tax" className="text-black">税金 (国保・住民税等)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-finance-muted mb-1">基準月額 (万円) *</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={newExpense.amount}
                  onChange={(e) => setNewExpense({ ...newExpense, amount: Number(e.target.value) || 0 })}
                  className="w-full p-2 border bg-transparent font-mono font-bold"
                />
              </div>

              <div className="pt-3 border-t border-black/10 dark:border-white/10 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddExpenseModal(false)}
                  className="px-4 py-2 border border-black/10 dark:border-white/10"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-semibold text-white bg-[var(--color-finance-accent)] hover:bg-[var(--color-finance-accent-strong)]"
                >
                  追加する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
