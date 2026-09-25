import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  TabType,
  ExpenseItem,
  IncomeItem,
  DividendStock,
  AssetItem,
  SicknessAllowanceMonth,
  SimulationConfig,
  CustomCellStyle,
  TimelineColumn,
  CustomStylesState,
  CustomDividendFrequency,
  CustomAssetCategory,
  BuiltInAssetCategory,
  AssetTableLayout,
} from '../types';
import {
  INITIAL_EXPENSES,
  INITIAL_INCOMES,
  INITIAL_DIVIDEND_STOCKS,
  INITIAL_ASSETS,
  INITIAL_SICKNESS_SCHEDULE,
  INITIAL_SIMULATION_CONFIG
} from '../data/initialData';
import { isJapaneseMutualFundCode, lookupYahooFinanceTicker } from '../services/yahooFinance';
import { FinanceSheetState, GoogleSheetsSyncConfig, DEFAULT_SHEETS_CONFIG, pushToGoogleSheet, pullFromGoogleSheet } from '../services/googleSheets';

const STORAGE_KEY = 'finance_simulation_data_v2';

const BUILT_IN_ASSET_CATEGORIES: BuiltInAssetCategory[] = [
  'core_stocks', 'dividend_stocks', 'cash', 'illiquid_other',
];
const monthlyCategoryRowId = (category: AssetItem['category']) => `prog_category_${category}`;

export interface CalculatedDividend {
  stock: DividendStock;
  netYield: number; // %
  annualNet: number; // 万円
  monthlyNet: number; // 万円
}

interface AppContextType {
  currentTab: TabType;
  setCurrentTab: (tab: TabType) => void;

  // Theme
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  // Expenses
  expenses: ExpenseItem[];
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseItem[]>>;
  addExpense: (item: Omit<ExpenseItem, 'id'>) => void;
  updateExpense: (id: string, updates: Partial<ExpenseItem>) => void;
  deleteExpense: (id: string) => void;
  moveExpense: (id: string, direction: 'up' | 'down') => void;
  totalExpenses: number;

  // Incomes
  incomes: IncomeItem[];
  setIncomes: React.Dispatch<React.SetStateAction<IncomeItem[]>>;
  addIncome: (item: Omit<IncomeItem, 'id'>) => void;
  updateIncome: (id: string, updates: Partial<IncomeItem>) => void;
  deleteIncome: (id: string) => void;
  moveIncome: (id: string, direction: 'up' | 'down') => void;
  addCashflowRowAfter: (id: string) => void;
  moveCashflowRow: (id: string, direction: 'up' | 'down') => void;
  totalIncome: number;
  monthlySurplus: number;

  // Dividends
  dividendStocks: DividendStock[];
  setDividendStocks: React.Dispatch<React.SetStateAction<DividendStock[]>>;
  addDividendStock: (stock: Omit<DividendStock, 'id'>) => void;
  updateDividendStock: (id: string, updates: Partial<DividendStock>) => void;
  deleteDividendStock: (id: string) => void;
  calculatedDividends: CalculatedDividend[];
  totalInvestedDividends: number;
  totalMonthlyDividend: number;
  totalAnnualDividend: number;
  overallNetYield: number;
  dividendCoverageRate: number; // % of living expenses covered
  dividendShortfall: number;
  customDividendFrequencies: CustomDividendFrequency[];
  registerCustomDividendFrequency: (frequency: CustomDividendFrequency) => void;

  // Assets
  assets: AssetItem[];
  setAssets: React.Dispatch<React.SetStateAction<AssetItem[]>>;
  addAsset: (asset: Omit<AssetItem, 'id'>, insertAfterId?: string) => string;
  updateAsset: (id: string, updates: Partial<AssetItem>) => void;
  deleteAsset: (id: string) => void;
  moveAsset: (id: string, direction: 'up' | 'down') => void;
  reorderAssets: (fromIndex: number, toIndex: number) => void;
  categoryOrder: AssetItem['category'][];
  moveCategoryOrder: (category: AssetItem['category'], direction: 'left' | 'right') => void;
  assetTableLayout: AssetTableLayout;
  updateAssetTableLayout: (updates: Partial<AssetTableLayout>) => void;
  customAssetCategories: CustomAssetCategory[];
  registerCustomAssetCategory: (label: string) => AssetItem['category'] | null;
  deleteCustomAssetCategory: (category: AssetItem['category'], replacementCategory?: AssetItem['category']) => boolean;
  renameCustomAssetCategory: (category: AssetItem['category'], label: string) => boolean;
  cashTotal: number;
  coreStocksTotal: number;
  dividendStocksTotal: number;
  illiquidTotal: number;
  netWorthTotal: number;
  setCategoryTotal: (category: AssetItem['category'], amount: number) => void;

  // Timeline Columns (2026-09 to 2028-12 + custom / extended columns)
  timelineColumns: TimelineColumn[];
  addTimelineColumn: (label: string, insertAfterId?: string) => void;
  deleteTimelineColumn: (colId: string) => void;
  moveTimelineColumn: (colId: string, direction: 'left' | 'right') => void;
  addNextYearColumns: () => void;

  // Monthly Cashflow Matrix
  monthlyOverrides: Record<string, Record<string, number>>;
  setMonthlyOverrides: React.Dispatch<React.SetStateAction<Record<string, Record<string, number>>>>;
  updateMonthlyCell: (itemId: string, colId: string, amount: number, propagateToFuture?: boolean) => void;
  getMonthlyDividendForCol: (col: TimelineColumn) => number;

  // Custom styling (right-click color & font changes for cell/row/col)
  customStyles: CustomStylesState;
  updateCustomStyle: (target: 'cell' | 'row' | 'col', id: string, style: Partial<CustomCellStyle> | null) => void;
  customLabels: Record<string, string>;
  updateCustomLabel: (id: string, label: string) => void;

  // Undo (Ctrl+Z)
  undo: () => void;
  canUndo: boolean;

  // Sickness Allowance
  sicknessSchedule: SicknessAllowanceMonth[];
  setSicknessSchedule: React.Dispatch<React.SetStateAction<SicknessAllowanceMonth[]>>;
  toggleSicknessReceived: (month: string) => void;
  remainingSicknessTotal: number;

  // Simulation
  simulationConfig: SimulationConfig;
  setSimulationConfig: React.Dispatch<React.SetStateAction<SimulationConfig>>;
  updateSimulationConfig: (updates: Partial<SimulationConfig>) => void;

  // Google Sheets Two-Way Sync
  sheetsConfig: GoogleSheetsSyncConfig;
  updateSheetsConfig: (updates: Partial<GoogleSheetsSyncConfig>) => void;
  syncPushGoogleSheets: (accessToken: string) => Promise<{ success: boolean; message: string }>;
  syncPullGoogleSheets: (accessToken: string) => Promise<{ success: boolean; message: string }>;
  cloudSyncStatus: 'connecting' | 'synced' | 'offline';
  refreshCloudData: () => Promise<{ success: boolean; message: string }>;

  // Data persistence
  resetToDefaults: () => void;
  exportJSON: () => void;
  importJSON: (jsonString: string) => boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Google スプレッドシートでは数値だけの銘柄コード（例: 2563）が number として返る。
// 画面内の照合はすべてこの関数を経由させ、データ型の違いで同期処理を止めない。
const normalizeTicker = (ticker: unknown): string => String(ticker ?? '').trim().toUpperCase();

const sameTicker = (left: unknown, right: unknown): boolean => {
  const normalizedLeft = normalizeTicker(left);
  return normalizedLeft !== '' && normalizedLeft === normalizeTicker(right);
};

const linkedDividendIdForAsset = (asset: AssetItem): string => asset.linkedDividendId || `div_${asset.id}`;
const linkedAssetIdForDividend = (stock: DividendStock): string => stock.linkedAssetId || `asset_${stock.id}`;

const normalizedHoldingKey = (ticker: unknown, name?: string): string => {
  const tickerKey = normalizeTicker(ticker);
  if (tickerKey) return `ticker:${tickerKey}`;
  return `name:${(name || '').replace(/[\s()（）]/g, '').toUpperCase()}`;
};

const normalizedNameKey = (name?: string): string =>
  `name:${(name || '').replace(/[\s()（）]/g, '').toUpperCase()}`;

function reconcileLinkedPortfolio(
  sourceAssets: AssetItem[],
  sourceDividends: DividendStock[],
  preference: 'asset' | 'dividend',
): { assets: AssetItem[]; dividendStocks: DividendStock[] } {
  const dividendAssets = sourceAssets.filter((asset) => asset.category === 'dividend_stocks');
  const usedStockIds = new Set<string>();
  const assetToStock = new Map<string, DividendStock>();
  const stockToAsset = new Map<string, AssetItem>();
  const assetToAsset = new Map<string, AssetItem>();
  const stockToStock = new Map<string, DividendStock>();
  const assetWins = preference === 'asset';

  const mergePair = (asset: AssetItem, stock: DividendStock): { asset: AssetItem; stock: DividendStock } => {
    const ticker = normalizeTicker(assetWins ? asset.ticker : stock.ticker) || normalizeTicker(stock.ticker) || normalizeTicker(asset.ticker);
    const name = assetWins ? (asset.name || stock.name) : (stock.name || asset.name);
    const amount = assetWins ? asset.amount : stock.investedAmount;
    const shares = assetWins ? (asset.shares ?? stock.shares) : (stock.shares ?? asset.shares);
    const averageCost = assetWins ? (asset.averageCost ?? stock.averageCost) : (stock.averageCost ?? asset.averageCost);
    const currentPrice = assetWins ? (asset.currentPrice ?? stock.currentPrice) : (stock.currentPrice ?? asset.currentPrice);
    const estimatedYield = assetWins ? (asset.estimatedYield ?? stock.estimatedYield) : (stock.estimatedYield ?? asset.estimatedYield ?? 0);
    const payoutDay = assetWins ? (asset.payoutDay ?? stock.payoutDay) : (stock.payoutDay ?? asset.payoutDay);
    const payoutMonths = assetWins ? (asset.payoutMonths ?? stock.payoutMonths) : (stock.payoutMonths ?? asset.payoutMonths);
    const note = assetWins ? (asset.note ?? stock.note) : (stock.note ?? asset.note);
    return {
      asset: { ...asset, linkedDividendId: stock.id, category: 'dividend_stocks', name, ticker, amount, shares, averageCost, currentPrice, estimatedYield, payoutDay, payoutMonths, note },
      stock: { ...stock, linkedAssetId: asset.id, ticker, name, investedAmount: amount, shares, averageCost, currentPrice, estimatedYield: estimatedYield ?? 0, payoutDay, payoutMonths, note },
    };
  };

  const createStock = (asset: AssetItem): DividendStock => ({
    id: asset.linkedDividendId || `div_${asset.id}`,
    linkedAssetId: asset.id,
    ticker: normalizeTicker(asset.ticker) || asset.name,
    name: asset.name,
    market: 'OTHER',
    investedAmount: asset.amount,
    shares: asset.shares,
    averageCost: asset.averageCost,
    currentPrice: asset.currentPrice,
    estimatedYield: asset.estimatedYield ?? 0,
    usTaxRate: 0,
    jpTaxRate: 20,
    payoutDay: asset.payoutDay,
    payoutMonths: asset.payoutMonths,
    frequency: 'custom',
    customFrequencyLabel: '未設定',
    note: asset.note,
  });

  const createAsset = (stock: DividendStock): AssetItem => ({
    id: stock.linkedAssetId || `asset_${stock.id}`,
    linkedDividendId: stock.id,
    category: 'dividend_stocks',
    name: stock.name,
    ticker: normalizeTicker(stock.ticker),
    amount: stock.investedAmount,
    shares: stock.shares,
    averageCost: stock.averageCost,
    currentPrice: stock.currentPrice,
    estimatedYield: stock.estimatedYield,
    payoutDay: stock.payoutDay,
    payoutMonths: stock.payoutMonths,
    institution: stock.market === 'US' ? '証券口座' : '金融機関',
    note: stock.note,
  });

  const findStock = (asset: AssetItem): DividendStock | undefined => {
    const explicit = sourceDividends.find((stock) => !usedStockIds.has(stock.id) && (stock.id === asset.linkedDividendId || stock.linkedAssetId === asset.id));
    if (explicit) return explicit;
    const sameNameAndTicker = sourceDividends.find((stock) => !usedStockIds.has(stock.id) && sameTicker(stock.ticker, asset.ticker) && normalizedNameKey(stock.name) === normalizedNameKey(asset.name));
    if (sameNameAndTicker) return sameNameAndTicker;
    const sameTickerCandidates = sourceDividends.filter((stock) => !usedStockIds.has(stock.id) && sameTicker(stock.ticker, asset.ticker));
    return sameTickerCandidates.length === 1 ? sameTickerCandidates[0] : undefined;
  };

  dividendAssets.forEach((asset) => {
    const stock = findStock(asset);
    if (stock) {
      usedStockIds.add(stock.id);
      const merged = mergePair(asset, stock);
      assetToStock.set(asset.id, merged.stock);
      stockToStock.set(stock.id, merged.stock);
      stockToAsset.set(stock.id, merged.asset);
      assetToAsset.set(asset.id, merged.asset);
    } else {
      const created = createStock(asset);
      usedStockIds.add(created.id);
      assetToStock.set(asset.id, created);
      stockToStock.set(created.id, created);
      const linkedAsset = { ...asset, linkedDividendId: created.id, ticker: normalizeTicker(asset.ticker) };
      stockToAsset.set(created.id, linkedAsset);
      assetToAsset.set(asset.id, linkedAsset);
    }
  });

  sourceDividends.forEach((stock) => {
    if (!usedStockIds.has(stock.id)) {
      const asset = createAsset(stock);
      stockToAsset.set(stock.id, asset);
      assetToAsset.set(asset.id, asset);
      assetToStock.set(asset.id, { ...stock, linkedAssetId: asset.id, ticker: normalizeTicker(stock.ticker) });
      stockToStock.set(stock.id, { ...stock, linkedAssetId: asset.id, ticker: normalizeTicker(stock.ticker) });
    }
  });

  const linkedAssets = sourceAssets.map((asset) => asset.category === 'dividend_stocks' ? (assetToAsset.get(asset.id) || asset) : asset);
  const existingAssetIds = new Set(linkedAssets.map((asset) => asset.id));
  stockToAsset.forEach((asset) => { if (!existingAssetIds.has(asset.id)) linkedAssets.push(asset); });
  const linkedDividends = sourceDividends.map((stock) => stockToStock.get(stock.id) || assetToStock.get(stock.linkedAssetId || '') || stock);
  const existingStockIds = new Set(linkedDividends.map((stock) => stock.id));
  assetToStock.forEach((stock) => { if (!existingStockIds.has(stock.id)) linkedDividends.push(stock); });

  return { assets: linkedAssets, dividendStocks: linkedDividends };
}

const CATEGORY_SUMMARY_LABEL: Record<AssetItem['category'], string> = {
  core_stocks: 'コア株式（月次表から追加）',
  dividend_stocks: '高配当資産（月次表から追加）',
  cash: '現金（月次表から追加）',
  illiquid_other: 'その他資産（月次表から追加）',
};

function distributeCategoryTotal(
  previous: AssetItem[],
  category: AssetItem['category'],
  requestedAmount: number,
): AssetItem[] {
  const amount = Math.max(0, Math.round((Number(requestedAmount) || 0) * 10) / 10);
  const categoryAssets = previous.filter((asset) => asset.category === category);
  const currentTotal = categoryAssets.reduce((sum, asset) => sum + (Number(asset.amount) || 0), 0);

  if (categoryAssets.length === 0) {
    if (amount === 0) return previous;
    return [...previous, {
      id: `asset_summary_${category}`,
      category,
      name: CATEGORY_SUMMARY_LABEL[category],
      ticker: '',
      amount,
      institution: '月次計画',
      note: '月次表からの連動入力',
    }];
  }

  if (currentTotal <= 0) {
    const firstId = categoryAssets[0].id;
    return previous.map((asset) => asset.id === firstId ? { ...asset, amount } : asset);
  }

  let distributed = 0;
  const lastId = categoryAssets[categoryAssets.length - 1].id;
  return previous.map((asset) => {
    if (asset.category !== category) return asset;
    if (asset.id === lastId) return { ...asset, amount: Math.max(0, Math.round((amount - distributed) * 10) / 10) };
    const nextAmount = Math.round(((Number(asset.amount) || 0) / currentTotal) * amount * 10) / 10;
    distributed += nextAmount;
    return { ...asset, amount: nextAmount };
  });
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 起動時は常に資産管理を開く。利用中のタブ切替はこのセッション内で保持する。
  const [currentTab, setCurrentTab] = useState<TabType>('assets');

  // Theme: dark by default, persists in localStorage
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEY + '_theme');
      return (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEY + '_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Load from local storage or defaults
  const [expenses, setExpenses] = useState<ExpenseItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + '_expenses');
      return saved ? JSON.parse(saved) : INITIAL_EXPENSES;
    } catch {
      return INITIAL_EXPENSES;
    }
  });

  const [incomes, setIncomes] = useState<IncomeItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + '_incomes');
      return saved ? JSON.parse(saved) : INITIAL_INCOMES;
    } catch {
      return INITIAL_INCOMES;
    }
  });

  const [dividendStocks, setDividendStocks] = useState<DividendStock[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + '_dividends');
      return saved ? JSON.parse(saved) : INITIAL_DIVIDEND_STOCKS;
    } catch {
      return INITIAL_DIVIDEND_STOCKS;
    }
  });

  const [customDividendFrequencies, setCustomDividendFrequencies] = useState<CustomDividendFrequency[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + '_custom_dividend_frequencies');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [assets, setAssets] = useState<AssetItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + '_assets');
      return saved ? JSON.parse(saved) : INITIAL_ASSETS;
    } catch {
      return INITIAL_ASSETS;
    }
  });
  const [customAssetCategories, setCustomAssetCategories] = useState<CustomAssetCategory[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + '_custom_asset_categories');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [customLabels, setCustomLabels] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + '_custom_labels');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const portfolioPreferenceRef = useRef<'asset' | 'dividend'>('asset');
  const cloudReadyRef = useRef(false);
  const autoSyncInFlightRef = useRef(false);
  const lastAutoSyncedSnapshotRef = useRef('');
  const latestFinanceStateSnapshotRef = useRef('');
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'connecting' | 'synced' | 'offline'>('connecting');

  useEffect(() => {
    const reconciled = reconcileLinkedPortfolio(assets, dividendStocks, portfolioPreferenceRef.current);
    if (JSON.stringify(reconciled.assets) !== JSON.stringify(assets)) {
      setAssets(reconciled.assets);
    }
    if (JSON.stringify(reconciled.dividendStocks) !== JSON.stringify(dividendStocks)) {
      setDividendStocks(reconciled.dividendStocks);
    }
  }, [assets, dividendStocks]);

  const [sicknessSchedule, setSicknessSchedule] = useState<SicknessAllowanceMonth[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + '_sickness');
      return saved ? JSON.parse(saved) : INITIAL_SICKNESS_SCHEDULE;
    } catch {
      return INITIAL_SICKNESS_SCHEDULE;
    }
  });

  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + '_sim');
      return saved ? JSON.parse(saved) : INITIAL_SIMULATION_CONFIG;
    } catch {
      return INITIAL_SIMULATION_CONFIG;
    }
  });

  const [sheetsConfig, setSheetsConfig] = useState<GoogleSheetsSyncConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + '_sheets');
      return saved ? JSON.parse(saved) : DEFAULT_SHEETS_CONFIG;
    } catch {
      return DEFAULT_SHEETS_CONFIG;
    }
  });

  // Save to local storage on changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY + '_expenses', JSON.stringify(expenses));
      localStorage.setItem(STORAGE_KEY + '_incomes', JSON.stringify(incomes));
      localStorage.setItem(STORAGE_KEY + '_dividends', JSON.stringify(dividendStocks));
      localStorage.setItem(STORAGE_KEY + '_custom_dividend_frequencies', JSON.stringify(customDividendFrequencies));
      localStorage.setItem(STORAGE_KEY + '_assets', JSON.stringify(assets));
      localStorage.setItem(STORAGE_KEY + '_custom_asset_categories', JSON.stringify(customAssetCategories));
      localStorage.setItem(STORAGE_KEY + '_custom_labels', JSON.stringify(customLabels));
      localStorage.setItem(STORAGE_KEY + '_sickness', JSON.stringify(sicknessSchedule));
      localStorage.setItem(STORAGE_KEY + '_sim', JSON.stringify(simulationConfig));
      localStorage.setItem(STORAGE_KEY + '_sheets', JSON.stringify(sheetsConfig));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  }, [expenses, incomes, dividendStocks, customDividendFrequencies, assets, customAssetCategories, customLabels, sicknessSchedule, simulationConfig, sheetsConfig]);

  const registerCustomAssetCategory = (label: string): AssetItem['category'] | null => {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) return null;
    const existing = customAssetCategories.find((item) => item.label === normalizedLabel);
    if (existing) return existing.id;
    const id = `custom_${Date.now()}`;
    const color = ['#5ac8fa', '#ff2d55', '#ffcc00', '#64d2ff', '#bf5af2'][customAssetCategories.length % 5];
    setCustomAssetCategories((previous) => [...previous, { id, label: normalizedLabel, color }]);
    setCategoryOrder((previous) => previous.includes(id) ? previous : [...previous, id]);
    return id;
  };

  const deleteCustomAssetCategory = (
    category: AssetItem['category'],
    replacementCategory: AssetItem['category'] = 'cash',
  ): boolean => {
    if (BUILT_IN_ASSET_CATEGORIES.includes(category as BuiltInAssetCategory)) return false;
    if (!customAssetCategories.some((item) => item.id === category)) return false;
    pushHistory();
    setAssets((previous) => previous.map((asset) => asset.category === category
      ? { ...asset, category: replacementCategory }
      : asset));
    setCustomAssetCategories((previous) => previous.filter((item) => item.id !== category));
    setCategoryOrder((previous) => previous.filter((item) => item !== category));
    setMonthlyOverrides((previous) => {
      const next = { ...previous };
      delete next[monthlyCategoryRowId(category)];
      return next;
    });
    return true;
  };

  const renameCustomAssetCategory = (category: AssetItem['category'], label: string): boolean => {
    if (BUILT_IN_ASSET_CATEGORIES.includes(category as BuiltInAssetCategory)) return false;
    const normalizedLabel = label.trim();
    if (!normalizedLabel || !customAssetCategories.some((item) => item.id === category)) return false;
    if (customAssetCategories.some((item) => item.id !== category && item.label === normalizedLabel)) return false;
    pushHistory();
    setCustomAssetCategories((previous) => previous.map((item) => item.id === category ? { ...item, label: normalizedLabel } : item));
    return true;
  };

  const updateCustomLabel = (id: string, label: string) => {
    const normalized = label.trim();
    setCustomLabels((previous) => {
      const next = { ...previous };
      if (normalized) next[id] = normalized;
      else delete next[id];
      return next;
    });
  };

  const registerCustomDividendFrequency = (frequency: CustomDividendFrequency) => {
    const normalizedLabel = frequency.label.trim();
    const normalizedMonths = Array.from(new Set(frequency.payoutMonths))
      .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12)
      .sort((left, right) => left - right);
    if (!normalizedLabel || normalizedMonths.length === 0) return;
    setCustomDividendFrequencies((previous) => {
      const next = previous.filter((item) => item.label !== normalizedLabel);
      return [...next, { label: normalizedLabel, payoutMonths: normalizedMonths }];
    });
  };

  // Calculations: Expenses & Incomes
  const totalExpenses = Math.round(expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) * 100) / 100;
  const totalIncome = Math.round(incomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) * 100) / 100;
  const monthlySurplus = Math.round((totalIncome - totalExpenses) * 100) / 100;

  // Calculations: Dividends
  // 配当一覧に同じティッカーが複数行ある場合でも、画面・集計は銘柄単位で1行にする。
  // 元帳（assets）は口座ごとの全行を合算し、同じ金額を重複して表示しない。
  const dividendGroups = new Map<string, DividendStock[]>();
  dividendStocks.forEach((stock) => {
    const key = normalizedHoldingKey(stock.ticker, stock.name);
    const group = dividendGroups.get(key) || [];
    group.push(stock);
    dividendGroups.set(key, group);
  });

  const calculatedDividends: CalculatedDividend[] = Array.from(dividendGroups.values()).map((group) => {
    // reconcile が作った仮の OTHER 行より、実際の市場情報を持つ行を代表として使う。
    const stock = group.find((item) => item.market !== 'OTHER') || group[0];
    const groupStockIds = new Set(group.map((item) => item.id));
    const matchingAssets = assets.filter((asset) => (
      groupStockIds.has(asset.linkedDividendId || '')
      || sameTicker(asset.ticker, stock.ticker)
      || (normalizeTicker(asset.ticker) === '' && normalizedNameKey(asset.name) === normalizedNameKey(stock.name))
    ));
    const aggregatedAmount = matchingAssets.length > 0
      ? Math.round(matchingAssets.reduce((sum, asset) => sum + (Number(asset.amount) || 0), 0) * 10) / 10
      // 資産側に未登録の新規配当行は、重複行を二重加算しないよう最大値を採用する。
      : Math.max(...group.map((item) => Number(item.investedAmount) || 0), 0);
    const assetYield = matchingAssets.find((asset) => Number(asset.estimatedYield) > 0)?.estimatedYield;
    const effectiveStock: DividendStock = {
      ...stock,
      investedAmount: aggregatedAmount,
      estimatedYield: Number(stock.estimatedYield) > 0 ? stock.estimatedYield : (assetYield || 0),
    };
    let netYield = 0;
    let annualNet = 0;
    let monthlyNet = 0;

    if (effectiveStock.manualMonthlyDividend !== undefined && effectiveStock.manualMonthlyDividend > 0) {
      monthlyNet = effectiveStock.manualMonthlyDividend;
      annualNet = monthlyNet * 12;
      netYield = effectiveStock.investedAmount > 0 ? (annualNet / effectiveStock.investedAmount) * 100 : 0;
    } else {
      const grossYield = effectiveStock.estimatedYield || 0;
      if (effectiveStock.market === 'US') {
        const afterUs = grossYield * (1 - (effectiveStock.usTaxRate || 10) / 100);
        netYield = afterUs * (1 - (effectiveStock.jpTaxRate || 20) / 100);
      } else {
        netYield = grossYield * (1 - (effectiveStock.jpTaxRate || 20) / 100);
      }
      annualNet = (effectiveStock.investedAmount * (netYield / 100));
      monthlyNet = annualNet / 12;
    }

    return {
      stock: effectiveStock,
      netYield: Math.round(netYield * 100) / 100,
      annualNet: Math.round(annualNet * 10) / 10,
      monthlyNet: Math.round(monthlyNet * 10) / 10,
    };
  });

  const totalInvestedDividends = Math.round(calculatedDividends.reduce((sum, item) => sum + (Number(item.stock.investedAmount) || 0), 0));
  const totalMonthlyDividend = Math.round(calculatedDividends.reduce((sum, c) => sum + c.monthlyNet, 0) * 10) / 10;
  const totalAnnualDividend = Math.round(totalMonthlyDividend * 12 * 10) / 10;
  const overallNetYield = totalInvestedDividends > 0
    ? Math.round(((totalAnnualDividend / totalInvestedDividends) * 100) * 100) / 100
    : 0;

  // Dividend Coverage Rate: (Monthly dividend / Monthly expense) * 100
  const dividendCoverageRate = totalExpenses > 0
    ? Math.round((totalMonthlyDividend / totalExpenses) * 1000) / 10
    : 0;
  const dividendShortfall = Math.max(0, Math.round((totalExpenses - totalMonthlyDividend) * 10) / 10);

  // Calculations: Assets
  const cashTotal = Math.round(assets.filter(a => a.category === 'cash').reduce((sum, a) => sum + (Number(a.amount) || 0), 0));
  const coreStocksTotal = Math.round(assets.filter(a => a.category === 'core_stocks').reduce((sum, a) => sum + (Number(a.amount) || 0), 0));
  const dividendStocksTotal = Math.round(assets.filter(a => a.category === 'dividend_stocks').reduce((sum, a) => sum + (Number(a.amount) || 0), 0));
  const illiquidTotal = Math.round(assets.filter(a => a.category === 'illiquid_other').reduce((sum, a) => sum + (Number(a.amount) || 0), 0));
  const customAssetsTotal = Math.round(assets
    .filter((asset) => !BUILT_IN_ASSET_CATEGORIES.includes(asset.category as BuiltInAssetCategory))
    .reduce((sum, asset) => sum + (Number(asset.amount) || 0), 0));
  const netWorthTotal = cashTotal + coreStocksTotal + dividendStocksTotal + illiquidTotal + customAssetsTotal;

  // Sickness Allowance calculations
  const remainingSicknessTotal = Math.round(
    sicknessSchedule.filter(s => !s.received).reduce((sum, s) => sum + s.amount, 0) * 10
  ) / 10;

  // --- AUTOMATIC BIDIRECTIONAL SYNC ENGINE ---

  // When expenses change, auto-update simulation monthly investment if user has positive surplus
  const updateExpense = (id: string, updates: Partial<ExpenseItem>) => {
    setExpenses(prev => {
      const next = prev.map(item => item.id === id ? { ...item, ...updates } : item);
      return next;
    });
  };

  const addExpense = (item: Omit<ExpenseItem, 'id'>) => {
    const newItem: ExpenseItem = { ...item, id: 'exp_' + Date.now() };
    setExpenses(prev => [...prev, newItem]);
  };

  const deleteExpense = (id: string) => {
    setExpenses(prev => prev.filter(item => item.id !== id));
  };

  const moveExpense = (id: string, direction: 'up' | 'down') => {
    setExpenses(prev => {
      const idx = prev.findIndex(item => item.id === id);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  const addIncome = (item: Omit<IncomeItem, 'id'>) => {
    const newItem: IncomeItem = { ...item, id: 'inc_' + Date.now() };
    setIncomes(prev => [...prev, newItem]);
  };

  const updateIncome = (id: string, updates: Partial<IncomeItem>) => {
    setIncomes(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const deleteIncome = (id: string) => {
    setIncomes(prev => prev.filter(item => item.id !== id));
  };

  const moveIncome = (id: string, direction: 'up' | 'down') => {
    setIncomes(prev => {
      const idx = prev.findIndex(item => item.id === id);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  const moveCashflowRow = (id: string, direction: 'up' | 'down') => {
    if (incomes.some((item) => item.id === id)) {
      moveIncome(id, direction);
      return;
    }
    if (expenses.some((item) => item.id === id)) {
      moveExpense(id, direction);
    }
  };

  const addCashflowRowAfter = (id: string) => {
    if (incomes.some((item) => item.id === id)) {
      const newItem: IncomeItem = {
        id: `inc_${Date.now()}`,
        name: '臨時収入',
        amount: 0,
        isRecurring: false,
        category: 'other',
      };
      setIncomes((previous) => {
        const index = previous.findIndex((item) => item.id === id);
        return index < 0
          ? [...previous, newItem]
          : [...previous.slice(0, index + 1), newItem, ...previous.slice(index + 1)];
      });
      return;
    }

    const newItem: ExpenseItem = {
      id: `exp_${Date.now()}`,
      name: '特別損失',
      amount: 0,
      category: 'spot',
    };
    setExpenses((previous) => {
      const index = previous.findIndex((item) => item.id === id);
      return index < 0
        ? [...previous, newItem]
        : [...previous.slice(0, index + 1), newItem, ...previous.slice(index + 1)];
    });
  };

  // When a dividend stock is added, AUTOMATICALLY sync to Assets table & auto-resolve ticker
  const addDividendStock = (stock: Omit<DividendStock, 'id'>) => {
    portfolioPreferenceRef.current = 'dividend';
    let populated = { ...stock };
    if (stock.ticker) {
      const lookup = lookupYahooFinanceTicker(stock.ticker);
      if (lookup) {
        if (!populated.name || populated.name === populated.ticker) populated.name = lookup.name;
        if (!populated.estimatedYield) populated.estimatedYield = lookup.dividendYield;
        if (!populated.payoutDay) populated.payoutDay = lookup.payoutDay;
        populated.market = lookup.market;
      }
    }

    const newId = 'div_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const newAssetId = 'asset_' + newId;
    const newStock: DividendStock = { ...populated, id: newId, linkedAssetId: newAssetId };
    setDividendStocks(prev => [...prev, newStock]);

    // Automatic bidirectional sync: add or update corresponding asset in Assets table
    setAssets(prev => {
      const exactIndex = prev.findIndex(a => a.linkedDividendId === newStock.id);
      const fallbackCandidates = prev
        .map((asset, assetIndex) => ({ asset, assetIndex }))
        .filter(({ asset }) => !asset.linkedDividendId && (sameTicker(asset.ticker, newStock.ticker) || asset.name === newStock.name));
      const index = exactIndex >= 0 ? exactIndex : fallbackCandidates.length === 1 ? fallbackCandidates[0].assetIndex : -1;
      if (index >= 0) {
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          linkedDividendId: newStock.id,
          amount: newStock.investedAmount,
          ticker: newStock.ticker,
          name: newStock.name,
          shares: newStock.shares,
          averageCost: newStock.averageCost,
          currentPrice: newStock.currentPrice,
          estimatedYield: newStock.estimatedYield,
          payoutDay: newStock.payoutDay,
          payoutMonths: newStock.payoutMonths,
          note: newStock.note,
        };
        return copy;
      }
      return [
        ...prev,
        {
          id: newAssetId,
          linkedDividendId: newStock.id,
          category: 'dividend_stocks',
          name: newStock.name,
          ticker: newStock.ticker,
          amount: newStock.investedAmount,
          shares: newStock.shares,
          averageCost: newStock.averageCost,
          currentPrice: newStock.currentPrice,
          estimatedYield: newStock.estimatedYield,
          payoutDay: newStock.payoutDay,
          payoutMonths: newStock.payoutMonths,
          institution: '証券口座',
          note: newStock.note || `自動同期 (利回り ${newStock.estimatedYield}%)`
        }
      ];
    });
  };

  // When a dividend stock is updated, AUTOMATICALLY sync to Assets table & auto-resolve ticker if ticker changed
  const updateDividendStock = (id: string, updates: Partial<DividendStock>) => {
    portfolioPreferenceRef.current = 'dividend';
    let finalUpdates = { ...updates };
    if (updates.ticker) {
      const lookup = lookupYahooFinanceTicker(updates.ticker);
      if (lookup) {
        if (!finalUpdates.name) finalUpdates.name = lookup.name;
        if (finalUpdates.estimatedYield === undefined) finalUpdates.estimatedYield = lookup.dividendYield;
        if (finalUpdates.payoutDay === undefined) finalUpdates.payoutDay = lookup.payoutDay;
        finalUpdates.market = lookup.market;
      }
    }

    setDividendStocks(prev => {
      const current = prev.find(s => s.id === id);
      const next = prev.map(item => item.id === id ? { ...item, ...finalUpdates } : item);

      // Automatic sync to Assets table
      const updatedItem = next.find(s => s.id === id);
      if (updatedItem && current) {
        setAssets(assetPrev => {
          const matches = assetPrev.filter((asset) => (
            asset.id === current.linkedAssetId
            || asset.linkedDividendId === updatedItem.id
            || sameTicker(asset.ticker, current.ticker)
            || sameTicker(asset.ticker, updatedItem.ticker)
            || normalizedNameKey(asset.name) === normalizedNameKey(current.name)
          ));
          if (matches.length > 0) {
            const amountChanged = finalUpdates.investedAmount !== undefined;
            const currentTotal = matches.reduce((sum, asset) => sum + (Number(asset.amount) || 0), 0);
            const targetTotal = Number(updatedItem.investedAmount) || 0;
            let distributed = 0;
            const lastMatchId = matches[matches.length - 1].id;
            return assetPrev.map((asset) => {
              if (!matches.some((match) => match.id === asset.id)) return asset;
              const nextAmount = amountChanged
                ? asset.id === lastMatchId
                  ? Math.max(0, Math.round((targetTotal - distributed) * 10) / 10)
                  : currentTotal > 0
                    ? Math.round(((Number(asset.amount) || 0) / currentTotal) * targetTotal * 10) / 10
                    : asset.id === matches[0].id ? targetTotal : 0
                : asset.amount;
              if (asset.id !== lastMatchId && amountChanged) distributed += nextAmount;
              return {
                ...asset,
                linkedDividendId: updatedItem.id,
                name: updatedItem.name,
                ticker: updatedItem.ticker,
                amount: nextAmount,
                shares: updatedItem.shares !== undefined ? updatedItem.shares : asset.shares,
                averageCost: updatedItem.averageCost !== undefined ? updatedItem.averageCost : asset.averageCost,
                currentPrice: updatedItem.currentPrice !== undefined ? updatedItem.currentPrice : asset.currentPrice,
                estimatedYield: updatedItem.estimatedYield !== undefined ? updatedItem.estimatedYield : asset.estimatedYield,
                payoutDay: updatedItem.payoutDay !== undefined ? updatedItem.payoutDay : asset.payoutDay,
                payoutMonths: updatedItem.payoutMonths !== undefined ? updatedItem.payoutMonths : asset.payoutMonths,
                note: updatedItem.note !== undefined ? updatedItem.note : asset.note,
              };
            });
          }
          return [
            ...assetPrev,
            {
              id: 'asset_' + updatedItem.id,
              linkedDividendId: updatedItem.id,
              category: 'dividend_stocks',
              name: updatedItem.name,
              ticker: updatedItem.ticker,
              amount: updatedItem.investedAmount,
              shares: updatedItem.shares,
              averageCost: updatedItem.averageCost,
              currentPrice: updatedItem.currentPrice,
              estimatedYield: updatedItem.estimatedYield,
              payoutDay: updatedItem.payoutDay,
              payoutMonths: updatedItem.payoutMonths,
              institution: updatedItem.market === 'US' ? 'Webull証券' : 'SBI証券',
              note: updatedItem.note || '自動同期'
            }
          ];
        });
      }

      return next;
    });
  };

  // When a dividend stock is deleted, AUTOMATICALLY remove from Assets table
  const deleteDividendStock = (id: string) => {
    setDividendStocks(prev => {
      const target = prev.find(s => s.id === id);
      if (target) {
        const linkedAssetId = target.linkedAssetId;
        setAssets(assetPrev => linkedAssetId
          ? assetPrev.filter(a => a.id !== linkedAssetId)
          : assetPrev.filter(a => !(sameTicker(a.ticker, target.ticker) && a.name === target.name)));
      }
      return prev.filter(item => item.id !== id);
    });
  };

  // When an asset is added
  const addAsset = (asset: Omit<AssetItem, 'id'>, insertAfterId?: string): string => {
    portfolioPreferenceRef.current = 'asset';
    let populated = { ...asset };
    if (asset.ticker) {
      const lookup = lookupYahooFinanceTicker(asset.ticker);
      if (lookup) {
        if (!populated.name) populated.name = lookup.name;
        if (populated.estimatedYield === undefined) populated.estimatedYield = lookup.dividendYield;
        if (populated.payoutDay === undefined) populated.payoutDay = lookup.payoutDay;
      }
    }
    const newId = 'asset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const newAsset: AssetItem = {
      ...populated,
      id: newId,
      ...(populated.category === 'dividend_stocks' ? { linkedDividendId: `div_${newId}` } : {}),
    };
    setAssets(prev => {
      if (!insertAfterId) return [...prev, newAsset];
      const index = prev.findIndex((item) => item.id === insertAfterId);
      if (index < 0) return [...prev, newAsset];
      const next = [...prev];
      next.splice(index + 1, 0, newAsset);
      return next;
    });

    // If it's a dividend stock, automatically sync to dividendStocks
    if (newAsset.category === 'dividend_stocks') {
      const lookup = newAsset.ticker ? lookupYahooFinanceTicker(newAsset.ticker) : null;
      const market = isJapaneseMutualFundCode(newAsset.ticker) ? 'JP_TRUST' : (lookup ? lookup.market : 'JP_ETF');
      setDividendStocks(divPrev => [
        ...divPrev,
        {
          id: 'div_' + newId,
          linkedAssetId: newAsset.id,
          ticker: newAsset.ticker || 'ETF',
          name: newAsset.name,
          market,
          investedAmount: newAsset.amount,
          shares: newAsset.shares || 0,
          averageCost: newAsset.averageCost || 0,
          currentPrice: newAsset.currentPrice,
          estimatedYield: newAsset.estimatedYield || lookup?.dividendYield || 10.0,
          usTaxRate: market === 'US' ? 10 : 0,
          jpTaxRate: 20,
          payoutDay: newAsset.payoutDay || lookup?.payoutDay || 15,
          payoutMonths: newAsset.payoutMonths,
          note: newAsset.note || '自動連動',
        }
      ]);
    }
    return newId;
  };

  // When an asset is updated, AUTOMATICALLY sync to dividendStocks or simulation core
  const updateAsset = (id: string, updates: Partial<AssetItem>) => {
    portfolioPreferenceRef.current = 'asset';
    let finalUpdates = { ...updates };
    if (updates.ticker) {
      const lookup = lookupYahooFinanceTicker(updates.ticker);
      if (lookup && !finalUpdates.name) {
        finalUpdates.name = lookup.name;
      }
    }

    setAssets(prev => {
      const current = prev.find(a => a.id === id);
      const next = prev.map(item => item.id === id ? { ...item, ...finalUpdates } : item);
      const updatedAsset = next.find(a => a.id === id);

      if (updatedAsset && current) {
        // 高配当区分から外した場合も、対応する配当行を残さない。
        if (current.category === 'dividend_stocks' && updatedAsset.category !== 'dividend_stocks') {
          const linkedDividendId = current.linkedDividendId;
          setDividendStocks(divPrev => linkedDividendId
            ? divPrev.filter(d => d.id !== linkedDividendId)
            : divPrev.filter(d => !(sameTicker(d.ticker, current.ticker) && d.name === current.name)));
        }
        // If dividend stock, AUTOMATICALLY update dividendStocks
        if (updatedAsset.category === 'dividend_stocks') {
          setDividendStocks(divPrev => {
            const linkedDividendId = current.linkedDividendId;
            const exactIndex = linkedDividendId ? divPrev.findIndex(d => d.id === linkedDividendId) : -1;
            const fallbackCandidates = divPrev
              .map((dividend, dividendIndex) => ({ dividend, dividendIndex }))
              .filter(({ dividend }) => !dividend.linkedAssetId && (
                sameTicker(dividend.ticker, current.ticker) ||
                dividend.name === current.name ||
                sameTicker(dividend.ticker, updatedAsset.ticker)
              ));
            const index = exactIndex >= 0 ? exactIndex : fallbackCandidates.length === 1 ? fallbackCandidates[0].dividendIndex : -1;
            if (index >= 0) {
              const copy = [...divPrev];
              copy[index] = {
                ...copy[index],
                linkedAssetId: updatedAsset.id,
                investedAmount: updatedAsset.amount,
                ticker: updatedAsset.ticker || copy[index].ticker,
                name: updatedAsset.name,
                ...(isJapaneseMutualFundCode(updatedAsset.ticker)
                  ? { market: 'JP_TRUST' as const, usTaxRate: 0 }
                  : {}),
                shares: updatedAsset.shares !== undefined ? updatedAsset.shares : copy[index].shares,
                averageCost: updatedAsset.averageCost !== undefined ? updatedAsset.averageCost : copy[index].averageCost,
                currentPrice: updatedAsset.currentPrice !== undefined ? updatedAsset.currentPrice : copy[index].currentPrice,
                estimatedYield: updatedAsset.estimatedYield !== undefined ? updatedAsset.estimatedYield : copy[index].estimatedYield,
                payoutDay: updatedAsset.payoutDay !== undefined ? updatedAsset.payoutDay : copy[index].payoutDay,
                payoutMonths: updatedAsset.payoutMonths !== undefined ? updatedAsset.payoutMonths : copy[index].payoutMonths,
                note: updatedAsset.note !== undefined ? updatedAsset.note : copy[index].note,
              };
              return copy;
            }
            return [
              ...divPrev,
              {
                id: 'div_' + updatedAsset.id,
                linkedAssetId: updatedAsset.id,
                ticker: updatedAsset.ticker || 'ETF',
                name: updatedAsset.name,
                market: isJapaneseMutualFundCode(updatedAsset.ticker)
                  ? 'JP_TRUST'
                  : (lookupYahooFinanceTicker(updatedAsset.ticker || '')?.market || 'US'),
                investedAmount: updatedAsset.amount,
                shares: updatedAsset.shares || 0,
                averageCost: updatedAsset.averageCost || 0,
                currentPrice: updatedAsset.currentPrice,
                estimatedYield: updatedAsset.estimatedYield || 10.0,
                usTaxRate: 10,
                jpTaxRate: 20,
                payoutDay: updatedAsset.payoutDay || 15,
                frequency: 'monthly',
                payoutMonths: updatedAsset.payoutMonths || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
                note: updatedAsset.note || '自動連動'
              }
            ];
          });
        }

        // If core stock (S&P500), AUTOMATICALLY update simulation currentCoreAmount
        if (updatedAsset.category === 'core_stocks') {
          const newCoreTotal = next
            .filter(a => a.category === 'core_stocks')
            .reduce((s, a) => s + (Number(a.amount) || 0), 0);
          setSimulationConfig(simPrev => ({
            ...simPrev,
            currentCoreAmount: newCoreTotal,
          }));
        }
      }

      return next;
    });
  };

  const deleteAsset = (id: string) => {
    setAssets(prev => {
      const target = prev.find(a => a.id === id);
      if (target && target.category === 'dividend_stocks') {
        const linkedDividendId = target.linkedDividendId;
        setDividendStocks(divPrev => linkedDividendId
          ? divPrev.filter(d => d.id !== linkedDividendId)
          : divPrev.filter(d => !(sameTicker(d.ticker, target.ticker) && d.name === target.name)));
      }
      return prev.filter(item => item.id !== id);
    });
  };

  // Reorder asset row up or down
  const moveAsset = (id: string, direction: 'up' | 'down') => {
    setAssets(prev => {
      const index = prev.findIndex(a => a.id === id);
      if (index === -1) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  // Reorder assets by dragging from index to index
  const reorderAssets = (fromIndex: number, toIndex: number) => {
    setAssets(prev => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      return copy;
    });
  };

  // Default Timeline Columns: 2026-09 (Current) to 2028-12 (2028年末までデフォルト記載, 1月のみ年記載)
  const generateDefaultTimelineColumns = (): TimelineColumn[] => {
    const cols: TimelineColumn[] = [];
    // 2026年: 9月(現在)〜12月
    cols.push({
      id: '2026-09',
      label: '2026年9月',
      year: 2026,
      month: 9,
      isCurrent: true,
    });
    for (let m = 10; m <= 12; m++) {
      cols.push({
        id: `2026-${String(m).padStart(2, '0')}`,
        label: `${m}月`,
        year: 2026,
        month: m,
        isCurrent: false,
      });
    }
    // 2027年: 1月〜12月 (1月のみ年を記載)
    for (let m = 1; m <= 12; m++) {
      cols.push({
        id: `2027-${String(m).padStart(2, '0')}`,
        label: m === 1 ? '2027年1月' : `${m}月`,
        year: 2027,
        month: m,
        isCurrent: false,
      });
    }
    // 2028年: 1月〜12月 (1月のみ年を記載)
    for (let m = 1; m <= 12; m++) {
      cols.push({
        id: `2028-${String(m).padStart(2, '0')}`,
        label: m === 1 ? '2028年1月' : `${m}月`,
        year: 2028,
        month: m,
        isCurrent: false,
      });
    }
    return cols;
  };

  const [timelineColumns, setTimelineColumns] = useState<TimelineColumn[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + '_timeline_columns_v3');
      if (saved) return JSON.parse(saved);
    } catch {}
    return generateDefaultTimelineColumns();
  });

  // Add next year (12 months) without requiring persistence (memory-only per user instruction)
  const addNextYearColumns = () => {
    setTimelineColumns(prev => {
      let maxYear = 2028;
      for (const c of prev) {
        if (c.year && c.year > maxYear) maxYear = c.year;
      }
      const nextYear = maxYear + 1;
      const newCols: TimelineColumn[] = [];
      for (let m = 1; m <= 12; m++) {
        newCols.push({
          id: `${nextYear}-${String(m).padStart(2, '0')}`,
          label: m === 1 ? `${nextYear}年1月` : `${m}月`,
          year: nextYear,
          month: m,
          isCurrent: false,
          isCustom: true,
        });
      }
      return [...prev, ...newCols];
    });
  };

  const addTimelineColumn = (label: string, insertAfterId?: string) => {
    pushHistory();
    setTimelineColumns(prev => {
      const newCol: TimelineColumn = {
        id: `custom_${Date.now()}`,
        label: label || '追加列',
        isCustom: true,
      };
      let next: TimelineColumn[];
      if (insertAfterId) {
        const idx = prev.findIndex(c => c.id === insertAfterId);
        if (idx !== -1) {
          next = [...prev.slice(0, idx + 1), newCol, ...prev.slice(idx + 1)];
        } else {
          next = [...prev, newCol];
        }
      } else {
        next = [...prev, newCol];
      }
      return next;
    });
  };

  const deleteTimelineColumn = (colId: string) => {
    pushHistory();
    setTimelineColumns(prev => {
      const next = prev.filter(c => c.id !== colId);
      return next;
    });
  };

  const moveTimelineColumn = (colId: string, direction: 'left' | 'right') => {
    pushHistory();
    setTimelineColumns((previous) => {
      const index = previous.findIndex((column) => column.id === colId);
      if (index < 0) return previous;
      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  // Custom styling (right-click for cell, row, col, header)
  const [customStyles, setCustomStyles] = useState<CustomStylesState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + '_custom_styles');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { cells: {}, rows: {}, cols: {} };
  });

  const updateCustomStyle = (target: 'cell' | 'row' | 'col', id: string, style: Partial<CustomCellStyle> | null) => {
    pushHistory();
    setCustomStyles(prev => {
      const next = {
        cells: { ...prev.cells },
        rows: { ...prev.rows },
        cols: { ...prev.cols },
      };
      const key = target === 'cell' ? 'cells' : target === 'row' ? 'rows' : 'cols';
      if (style === null) {
        delete next[key][id];
      } else {
        next[key][id] = { ...(next[key][id] || {}), ...style };
      }
      try {
        localStorage.setItem(STORAGE_KEY + '_custom_styles', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Monthly cashflow matrix overrides: itemId -> colId -> amount
  const [monthlyOverrides, setMonthlyOverrides] = useState<Record<string, Record<string, number>>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + '_monthly_overrides_v2');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY + '_timeline_columns_v3', JSON.stringify(timelineColumns));
      localStorage.setItem(STORAGE_KEY + '_monthly_overrides_v2', JSON.stringify(monthlyOverrides));
    } catch {}
  }, [timelineColumns, monthlyOverrides]);

  // 保有資産と月次の資産行は同じ元帳として扱う。どちらで直しても、全月の表示値を
  // 同じ区分合計へ即時反映し、古いスプシ値やローカル上書きで元に戻るのを防ぐ。
  useEffect(() => {
    const hasRentAccount = assets.some((asset) => {
      const name = String(asset.name || '').replace(/[\s　]/g, '');
      const category = customAssetCategories.find((item) => item.id === asset.category);
      return name.includes('家賃口座') || String(category?.label || '').replace(/[\s　]/g, '').includes('家賃口座');
    });
    const monthlyRentFor = (column: TimelineColumn) => expenses
      .filter((item) => String(item.name || '').replace(/[\s　]/g, '').includes('家賃'))
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const currentIndex = timelineColumns.findIndex((column) => column && column.isCurrent);
    const rentInCash = assets.some((asset) => {
      const name = String(asset.name || '').replace(/[\s　]/g, '');
      return asset.category === 'cash' && name.includes('家賃口座');
    });
    let accumulatedRent = 0;
    const rentCumulativeByCol: Record<string, number> = {};
    timelineColumns.forEach((column, index) => {
      if (index > (currentIndex >= 0 ? currentIndex : 0)) accumulatedRent += monthlyRentFor(column);
      rentCumulativeByCol[column.id] = Math.round(accumulatedRent * 10) / 10;
    });
    const categoryTotals: Record<string, number> = {
      prog_core_stocks: coreStocksTotal,
      prog_dividend_stocks: dividendStocksTotal,
      prog_cash_pool: cashTotal,
      prog_illiquid: illiquidTotal,
    };
    customAssetCategories.forEach((category) => {
      const base = Math.round(
        assets.filter((asset) => asset.category === category.id)
          .reduce((sum, asset) => sum + (Number(asset.amount) || 0), 0) * 10,
      ) / 10;
      categoryTotals[monthlyCategoryRowId(category.id)] = base;
    });
    setMonthlyOverrides((previous) => {
      let changed = false;
      const next = { ...previous };
      Object.entries(categoryTotals).forEach(([rowId, baseAmount]) => {
        const row = { ...(next[rowId] || {}) };
        timelineColumns.forEach((column) => {
          let amount = baseAmount;
          if (rowId === 'prog_cash_pool' && hasRentAccount && rentInCash) amount -= rentCumulativeByCol[column.id] || 0;
          if (rowId.startsWith('prog_category_')) {
            const categoryId = rowId.slice('prog_category_'.length);
            const category = customAssetCategories.find((item) => item.id === categoryId);
            const categoryIsRent = String(category?.label || '').replace(/[\s　]/g, '').includes('家賃口座');
            if (categoryIsRent && hasRentAccount) amount -= rentCumulativeByCol[column.id] || 0;
          }
          amount = Math.round(amount * 10) / 10;
          if (row[column.id] !== amount) {
            row[column.id] = amount;
            changed = true;
          }
        });
        if (changed) {
          next[rowId] = row;
        }
      });
      if (changed) {
        try { localStorage.setItem(STORAGE_KEY + '_monthly_overrides_v2', JSON.stringify(next)); } catch {}
      }
      return changed ? next : previous;
    });
  }, [assets, cashTotal, coreStocksTotal, customAssetCategories, dividendStocksTotal, expenses, illiquidTotal, timelineColumns]);

  // Undo (Ctrl+Z) history stack
  interface HistorySnapshot {
    assets: AssetItem[];
    dividendStocks: DividendStock[];
    incomes: IncomeItem[];
    expenses: ExpenseItem[];
    monthlyOverrides: Record<string, Record<string, number>>;
    timelineColumns: TimelineColumn[];
    customStyles: CustomStylesState;
  }

  const historyStackRef = useRef<HistorySnapshot[]>([]);
  const [canUndo, setCanUndo] = useState<boolean>(false);

  const pushHistory = useCallback(() => {
    const current: HistorySnapshot = {
      assets: JSON.parse(JSON.stringify(assets)),
      dividendStocks: JSON.parse(JSON.stringify(dividendStocks)),
      incomes: JSON.parse(JSON.stringify(incomes)),
      expenses: JSON.parse(JSON.stringify(expenses)),
      monthlyOverrides: JSON.parse(JSON.stringify(monthlyOverrides)),
      timelineColumns: JSON.parse(JSON.stringify(timelineColumns)),
      customStyles: JSON.parse(JSON.stringify(customStyles)),
    };
    historyStackRef.current.push(current);
    if (historyStackRef.current.length > 50) {
      historyStackRef.current.shift();
    }
    setCanUndo(true);
  }, [assets, dividendStocks, incomes, expenses, monthlyOverrides, timelineColumns, customStyles]);

  const undo = useCallback(() => {
    if (historyStackRef.current.length === 0) return;
    const previous = historyStackRef.current.pop();
    if (!previous) return;
    setAssets(previous.assets);
    setDividendStocks(previous.dividendStocks);
    setIncomes(previous.incomes);
    setExpenses(previous.expenses);
    setMonthlyOverrides(previous.monthlyOverrides);
    setTimelineColumns(previous.timelineColumns);
    setCustomStyles(previous.customStyles);
    setCanUndo(historyStackRef.current.length > 0);
  }, []);

  // Global Ctrl+Z (or Cmd+Z) keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (!isInput) {
          e.preventDefault();
          undo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo]);

  // 月次表のカテゴリ合計を変更した場合は、同じカテゴリの保有行を比率維持で更新する。
  const setCategoryTotal = (category: AssetItem['category'], amount: number) => {
    portfolioPreferenceRef.current = 'asset';
    setAssets((previous) => distributeCategoryTotal(previous, category, amount));
  };

  // Update monthly cell: by default propagate to all subsequent columns unless propagateToFuture === false
  const updateMonthlyCell = (
    itemId: string,
    colId: string,
    amount: number,
    propagateToFuture: boolean = true
  ) => {
    pushHistory();
    setMonthlyOverrides(prev => {
      const itemMap = { ...(prev[itemId] || {}) };
      if (!propagateToFuture) {
        itemMap[colId] = amount;
      } else {
        const startIdx = timelineColumns.findIndex(c => c.id === colId);
        if (startIdx !== -1) {
          for (let i = startIdx; i < timelineColumns.length; i++) {
            itemMap[timelineColumns[i].id] = amount;
          }
        } else {
          itemMap[colId] = amount;
        }
      }
      const next = { ...prev, [itemId]: itemMap };
      try {
        localStorage.setItem(STORAGE_KEY + '_monthly_overrides_v2', JSON.stringify(next));
      } catch {}
      return next;
    });

    // 月次表の資産区分を編集した時点で、月を問わず保有資産へ反映する。
    const categoryByRow: Record<string, AssetItem['category']> = {
      prog_core_stocks: 'core_stocks',
      prog_dividend_stocks: 'dividend_stocks',
      prog_cash_pool: 'cash',
      prog_illiquid: 'illiquid_other',
    };
    const category = categoryByRow[itemId]
      || customAssetCategories.find((item) => monthlyCategoryRowId(item.id) === itemId)?.id;
    if (category) {
      setCategoryTotal(category, amount);
    }
  };

  // Reconcile missing rows between dividendStocks and assets(dividend_stocks) so both tables are always full & synced
  useEffect(() => {
    setAssets(prevAssets => {
      let changed = false;
      const currentAssets = [...prevAssets];
      for (const ds of dividendStocks) {
        const match = currentAssets.find(a =>
          sameTicker(a.ticker, ds.ticker) ||
          a.name === ds.name
        );
        if (!match) {
          currentAssets.push({
            id: 'asset_' + ds.id,
            category: 'dividend_stocks',
            name: ds.name,
            ticker: ds.ticker,
            amount: ds.investedAmount,
            shares: ds.shares || 0,
            averageCost: ds.averageCost || 0,
            currentPrice: ds.currentPrice,
            estimatedYield: ds.estimatedYield,
            payoutDay: ds.payoutDay || 15,
            institution: ds.market === 'US' ? 'Webull証券' : 'SBI証券',
            note: '自動連動'
          });
          changed = true;
        } else {
          if (match.estimatedYield === undefined || (ds.shares && !match.shares) || (ds.currentPrice !== undefined && ds.currentPrice !== match.currentPrice)) {
            match.estimatedYield = ds.estimatedYield;
            if (ds.shares) match.shares = ds.shares;
            if (ds.averageCost) match.averageCost = ds.averageCost;
            if (ds.currentPrice !== undefined) match.currentPrice = ds.currentPrice;
            changed = true;
          }
        }
      }
      return changed ? currentAssets : prevAssets;
    });

    setDividendStocks(prevStocks => {
      let changed = false;
      const currentStocks = [...prevStocks];
      const assetDividendStocks = assets.filter(a => a.category === 'dividend_stocks');
      for (const a of assetDividendStocks) {
        const match = currentStocks.find(s =>
          sameTicker(s.ticker, a.ticker) ||
          s.name === a.name
        );
        if (!match) {
          const lookup = a.ticker ? lookupYahooFinanceTicker(a.ticker) : null;
          const market = isJapaneseMutualFundCode(a.ticker) ? 'JP_TRUST' : (lookup ? lookup.market : 'JP_ETF');
          currentStocks.push({
            id: 'div_' + a.id,
            ticker: a.ticker || 'ETF',
            name: a.name,
            market,
            investedAmount: a.amount,
            shares: a.shares || 0,
            averageCost: a.averageCost || 0,
            currentPrice: a.currentPrice,
            estimatedYield: a.estimatedYield || lookup?.dividendYield || 10.0,
            usTaxRate: market === 'US' ? 10 : 0,
            jpTaxRate: 20,
            frequency: 'monthly',
            payoutMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            payoutDay: a.payoutDay || lookup?.payoutDay || 15,
            note: a.note || '自動連動'
          });
          changed = true;
        }
      }
      return changed ? currentStocks : prevStocks;
    });
  }, []);

  // Dynamic monthly dividend payout calculation for a given timeline column
  const getMonthlyDividendForCol = (col: TimelineColumn): number => {
    const month = col.month || 1;
    let sum = 0;
    for (const c of calculatedDividends) {
      const s = c.stock;
      const freq = s.frequency || 'monthly';
      const months = s.payoutMonths && s.payoutMonths.length > 0
        ? s.payoutMonths
        : freq === 'semi_annual'
        ? [6, 12]
        : freq === 'quarterly'
        ? [3, 6, 9, 12]
        : freq === 'annual'
        ? [12]
        : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

      if (months.includes(month)) {
        if (s.manualMonthlyDividend !== undefined && s.manualMonthlyDividend > 0) {
          sum += s.manualMonthlyDividend;
        } else {
          sum += c.annualNet / months.length;
        }
      }
    }
    return Math.round(sum * 10) / 10;
  };

  // Category tab order (configurable left / right)
  const [categoryOrder, setCategoryOrder] = useState<AssetItem['category'][]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + '_cat_order');
      if (saved) return JSON.parse(saved);
    } catch {}
    return ['core_stocks', 'dividend_stocks', 'cash', 'illiquid_other'];
  });

  const [assetTableLayout, setAssetTableLayout] = useState<AssetTableLayout>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + '_asset_table_layout');
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<AssetTableLayout>;
        return {
          columnOrder: Array.isArray(parsed.columnOrder) ? parsed.columnOrder : [],
          columnWidths: parsed.columnWidths && typeof parsed.columnWidths === 'object' ? parsed.columnWidths : {},
        };
      }
    } catch {}
    return { columnOrder: [], columnWidths: {} };
  });

  const updateAssetTableLayout = (updates: Partial<AssetTableLayout>) => {
    setAssetTableLayout((previous) => ({
      columnOrder: updates.columnOrder ?? previous.columnOrder,
      columnWidths: updates.columnWidths ?? previous.columnWidths,
    }));
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY + '_cat_order', JSON.stringify(categoryOrder));
      localStorage.setItem(STORAGE_KEY + '_asset_table_layout', JSON.stringify(assetTableLayout));
      localStorage.setItem(STORAGE_KEY + '_custom_styles', JSON.stringify(customStyles));
    } catch {}
  }, [assetTableLayout, categoryOrder, customStyles]);

  const moveCategoryOrder = (category: AssetItem['category'], direction: 'left' | 'right') => {
    setCategoryOrder(prev => {
      const index = prev.indexOf(category);
      if (index === -1) return prev;
      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      try {
        localStorage.setItem(STORAGE_KEY + '_cat_order', JSON.stringify(copy));
      } catch {}
      return copy;
    });
  };

  // Mutators: Sickness
  const toggleSicknessReceived = (month: string) => {
    setSicknessSchedule(prev => prev.map(item =>
      item.month === month ? { ...item, received: !item.received } : item
    ));
  };

  // Mutators: Simulation
  const updateSimulationConfig = (updates: Partial<SimulationConfig>) => {
    setSimulationConfig(prev => ({ ...prev, ...updates }));
  };

  // Google Sheets sync mutators
  const updateSheetsConfig = (updates: Partial<GoogleSheetsSyncConfig>) => {
    setSheetsConfig(prev => ({ ...prev, ...updates }));
  };

  const buildFinanceSheetState = (): FinanceSheetState => ({
    assets,
    dividendStocks,
    expenses,
    incomes,
    sicknessSchedule,
    simulationConfig,
    timelineColumns,
    monthlyOverrides,
    customDividendFrequencies,
    customAssetCategories,
    customLabels,
    categoryOrder,
    assetTableLayout,
    customStyles,
  });

  const applyRemoteFinanceState = (data: FinanceSheetState) => {
    const reconciled = reconcileLinkedPortfolio(
      Array.isArray(data.assets) ? data.assets as AssetItem[] : [],
      Array.isArray(data.dividendStocks) ? data.dividendStocks as DividendStock[] : [],
      'asset',
    );
    if (Array.isArray(data.assets) || Array.isArray(data.dividendStocks)) {
      setAssets(reconciled.assets);
      setDividendStocks(reconciled.dividendStocks);
    }
    if (Array.isArray(data.expenses)) setExpenses(data.expenses as ExpenseItem[]);
    if (Array.isArray(data.incomes)) setIncomes(data.incomes as IncomeItem[]);
    if (Array.isArray(data.sicknessSchedule)) setSicknessSchedule(data.sicknessSchedule as SicknessAllowanceMonth[]);
    if (data.simulationConfig) setSimulationConfig(data.simulationConfig as SimulationConfig);
    if (Array.isArray(data.timelineColumns)) setTimelineColumns(data.timelineColumns as TimelineColumn[]);
    if (data.monthlyOverrides) setMonthlyOverrides(data.monthlyOverrides as Record<string, Record<string, number>>);
    if (Array.isArray(data.customDividendFrequencies)) setCustomDividendFrequencies(data.customDividendFrequencies as CustomDividendFrequency[]);
    if (Array.isArray(data.customAssetCategories)) setCustomAssetCategories(data.customAssetCategories as CustomAssetCategory[]);
    if (data.customLabels) setCustomLabels(data.customLabels as Record<string, string>);
    if (Array.isArray(data.categoryOrder)) setCategoryOrder(data.categoryOrder as AssetItem['category'][]);
    if (data.assetTableLayout) setAssetTableLayout({
      columnOrder: Array.isArray(data.assetTableLayout.columnOrder) ? data.assetTableLayout.columnOrder : [],
      columnWidths: data.assetTableLayout.columnWidths || {},
    });
    if (data.customStyles) setCustomStyles({
      cells: data.customStyles.cells || {},
      rows: data.customStyles.rows || {},
      cols: data.customStyles.cols || {},
    } as CustomStylesState);
  };

  // 通信中にも画面で編集されたかを判定するため、常に最新の元帳スナップショットを保持する。
  useEffect(() => {
    latestFinanceStateSnapshotRef.current = JSON.stringify(buildFinanceSheetState());
  }, [assets, assetTableLayout, categoryOrder, customAssetCategories, customDividendFrequencies, customLabels, customStyles, dividendStocks, expenses, incomes, monthlyOverrides, sicknessSchedule, simulationConfig, timelineColumns]);

  const syncPushGoogleSheets = async (accessToken: string) => {
    const res = await pushToGoogleSheet(sheetsConfig.spreadsheetId || undefined, accessToken, buildFinanceSheetState());
    if (res.success) {
      lastAutoSyncedSnapshotRef.current = JSON.stringify(res.snapshot?.state || buildFinanceSheetState());
      updateSheetsConfig({ lastSyncedAt: new Date().toLocaleTimeString() });
    }
    return res;
  };

  const syncPullGoogleSheets = async (accessToken: string) => {
    const res = await pullFromGoogleSheet(sheetsConfig.spreadsheetId || undefined, accessToken);
    if (res.success && res.data) {
      lastAutoSyncedSnapshotRef.current = JSON.stringify(res.data);
      applyRemoteFinanceState(res.data);
      updateSheetsConfig({ lastSyncedAt: new Date().toLocaleTimeString() });
    }
    return { success: res.success, message: res.message };
  };

  // クラウド元帳を唯一の正本にする。初回は必ず元帳を読み、端末固有の保存値で上書きしない。
  const refreshCloudData = useCallback(async () => {
    if (autoSyncInFlightRef.current) return { success: false, message: 'クラウド元帳を確認中です。' };
    autoSyncInFlightRef.current = true;
    setCloudSyncStatus('connecting');
    try {
      const result = await pullFromGoogleSheet(sheetsConfig.spreadsheetId || undefined, '');
      if (result.success && result.data) {
        lastAutoSyncedSnapshotRef.current = JSON.stringify(result.data);
        applyRemoteFinanceState(result.data);
        cloudReadyRef.current = true;
        setCloudSyncStatus('synced');
        updateSheetsConfig({
          ...(result.snapshot?.spreadsheetId && result.snapshot.spreadsheetId !== sheetsConfig.spreadsheetId
            ? { spreadsheetId: result.snapshot.spreadsheetId }
            : {}),
          lastSyncedAt: new Date().toLocaleTimeString(),
        });
      } else {
        setCloudSyncStatus('offline');
      }
      return { success: result.success, message: result.message };
    } finally {
      autoSyncInFlightRef.current = false;
    }
  }, [sheetsConfig.spreadsheetId]);

  useEffect(() => {
    let disposed = false;
    const load = async () => { if (!disposed) await refreshCloudData(); };
    void load();
    const events = new EventSource('/api/finance-simulation/events');
    events.addEventListener('revision', () => { void load(); });
    events.onerror = () => { if (!disposed) setCloudSyncStatus('offline'); };
    const fallback = window.setInterval(load, 30_000);
    return () => {
      disposed = true;
      events.close();
      window.clearInterval(fallback);
    };
  }, [refreshCloudData]);

  useEffect(() => {
    if (!cloudReadyRef.current) return;
    const state = buildFinanceSheetState();
    const snapshot = JSON.stringify(state);
    if (snapshot === lastAutoSyncedSnapshotRef.current) return;
    const timer = window.setTimeout(async () => {
      if (autoSyncInFlightRef.current) return;
      autoSyncInFlightRef.current = true;
      try {
        const result = await pushToGoogleSheet(sheetsConfig.spreadsheetId || undefined, '', state);
        if (result.success) {
          lastAutoSyncedSnapshotRef.current = JSON.stringify(result.snapshot?.state || state);
          setCloudSyncStatus('synced');
          updateSheetsConfig({ lastSyncedAt: new Date().toLocaleTimeString() });
        } else setCloudSyncStatus('offline');
      } finally {
        autoSyncInFlightRef.current = false;
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [assets, assetTableLayout, categoryOrder, customAssetCategories, customDividendFrequencies, customLabels, customStyles, dividendStocks, expenses, incomes, monthlyOverrides, sheetsConfig.spreadsheetId, sicknessSchedule, simulationConfig, timelineColumns]);

  // Reset to initial spreadsheet defaults
  const resetToDefaults = () => {
    setExpenses(INITIAL_EXPENSES);
    setIncomes(INITIAL_INCOMES);
    setDividendStocks(INITIAL_DIVIDEND_STOCKS);
    setAssets(INITIAL_ASSETS);
    setSicknessSchedule(INITIAL_SICKNESS_SCHEDULE);
    setSimulationConfig(INITIAL_SIMULATION_CONFIG);
    localStorage.removeItem(STORAGE_KEY + '_expenses');
    localStorage.removeItem(STORAGE_KEY + '_incomes');
    localStorage.removeItem(STORAGE_KEY + '_dividends');
    localStorage.removeItem(STORAGE_KEY + '_assets');
    localStorage.removeItem(STORAGE_KEY + '_sickness');
    localStorage.removeItem(STORAGE_KEY + '_sim');
  };

  // Export JSON
  const exportJSON = () => {
    const data = {
      ...buildFinanceSheetState(),
      schemaVersion: 2,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance_simulation_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON
  const importJSON = (jsonString: string): boolean => {
    try {
      const data = JSON.parse(jsonString);
      applyRemoteFinanceState(data as FinanceSheetState);
      return true;
    } catch (e) {
      console.error('Import failed', e);
      return false;
    }
  };

  return (
    <AppContext.Provider
      value={{
        currentTab,
        setCurrentTab,
        theme,
        toggleTheme,
        expenses,
        setExpenses,
        addExpense,
        updateExpense,
        deleteExpense,
        moveExpense,
        totalExpenses,
        incomes,
        setIncomes,
        addIncome,
        updateIncome,
        deleteIncome,
        moveIncome,
        addCashflowRowAfter,
        moveCashflowRow,
        totalIncome,
        monthlySurplus,
        dividendStocks,
        setDividendStocks,
        addDividendStock,
        updateDividendStock,
        deleteDividendStock,
        calculatedDividends,
        totalInvestedDividends,
        totalMonthlyDividend,
        totalAnnualDividend,
        overallNetYield,
        dividendCoverageRate,
        dividendShortfall,
        customDividendFrequencies,
        registerCustomDividendFrequency,
        assets,
        setAssets,
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
        cashTotal,
        coreStocksTotal,
        dividendStocksTotal,
        illiquidTotal,
        netWorthTotal,
        setCategoryTotal,
        monthlyOverrides,
        setMonthlyOverrides,
        updateMonthlyCell,
        getMonthlyDividendForCol,
        timelineColumns,
        addTimelineColumn,
        deleteTimelineColumn,
        moveTimelineColumn,
        addNextYearColumns,
        customStyles,
        updateCustomStyle,
        customLabels,
        updateCustomLabel,
        undo,
        canUndo,
        sicknessSchedule,
        setSicknessSchedule,
        toggleSicknessReceived,
        remainingSicknessTotal,
        simulationConfig,
        setSimulationConfig,
        updateSimulationConfig,
        sheetsConfig,
        updateSheetsConfig,
        syncPushGoogleSheets,
        syncPullGoogleSheets,
        cloudSyncStatus,
        refreshCloudData,
        resetToDefaults,
        exportJSON,
        importJSON,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
