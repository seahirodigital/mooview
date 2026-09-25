export type TabType = 'assets' | 'dividend' | 'simulation' | 'living';

// Living expense row
export interface ExpenseItem {
  id: string;
  name: string;
  amount: number; // 基準月額 (万円)
  category: 'fixed' | 'variable' | 'tax' | 'spot' | 'other';
  note?: string;
}

// Cash inflow item (Dividend, Allowance, Side-income, etc.)
export interface IncomeItem {
  id: string;
  name: string;
  amount: number; // 基準月額 (万円)
  category?: 'dividend' | 'allowance' | 'affiliate' | 'salary' | 'other';
  isRecurring: boolean;
  note?: string;
}

export type DividendFrequency = 'monthly' | 'semi_annual' | 'quarterly' | 'annual' | 'custom';

export interface CustomDividendFrequency {
  label: string;
  payoutMonths: number[];
}

// High dividend holding
export interface DividendStock {
  id: string;
  linkedAssetId?: string; // 資産一覧の対応行を特定する固有ID
  ticker: string; // e.g. QQQI, IWMI, 5G, SPY
  name: string;
  market: 'US' | 'JP_TRUST' | 'JP_ETF' | 'OTHER';
  allocationPercent?: number; // target allocation %
  investedAmount: number; // in 万円 (e.g. 500 = 5,000,000 yen)
  shares?: number; // 保有枚数・口数
  averageCost?: number; // 平均取得単価 (円またはドル)
  currentPrice?: number; // MooViewチャートビューで取得した現在値
  estimatedYield: number; // Annual yield % (e.g. 13.0 for 13%)
  usTaxRate: number; // e.g. 10 (%)
  jpTaxRate: number; // e.g. 20 (%)
  frequency?: DividendFrequency; // 毎月型('monthly') | 年2回型('semi_annual') | 年4回型('quarterly') | 年1回型('annual') | カスタム('custom')
  customFrequencyLabel?: string;
  payoutMonths?: number[]; // e.g. [1,2,3,4,5,6,7,8,9,10,11,12] or [6,12]
  payoutDay?: number; // e.g. 18th
  manualMonthlyDividend?: number; // Optional override in 万円
  note?: string;
}

// Asset management item
export type BuiltInAssetCategory = 'cash' | 'core_stocks' | 'dividend_stocks' | 'illiquid_other';
// ユーザーが追加する区分も同じ資産・月次・スプシのキーとして扱う。
export type AssetCategory = BuiltInAssetCategory | string;

export interface CustomAssetCategory {
  id: string;
  label: string;
  color: string;
}

export interface AssetItem {
  id: string;
  linkedDividendId?: string; // 配当一覧の対応行を特定する固有ID
  category: AssetCategory;
  name: string;
  ticker?: string;
  amount: number; // in 万円
  shares?: number; // 保有枚数・口数
  averageCost?: number; // 平均取得単価 (円またはドル)
  currentPrice?: number; // MooViewチャートビューで取得した現在値
  estimatedYield?: number; // 配当利回り (%)
  payoutDay?: number; // 支払日
  payoutMonths?: number[]; // 支払月
  institution?: string; // e.g. 住信SBI, MUFJ, 新生, JRE, 楽天, Webull
  monthlyContribution?: number; // 定期積立 (万円/月)
  note?: string;
  lastUpdated?: string;
}

export interface CustomCellStyle {
  bg?: string; // hex or color class
  color?: string;
  fontWeight?: 'normal' | 'bold' | 'semibold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline' | 'line-through';
}

// 資産一覧の列配置もクラウド元帳に保存し、PC・スマホで同じ順序を再現する。
export interface AssetTableLayout {
  columnOrder: string[];
  columnWidths: Record<string, number>;
}

export interface TimelineColumn {
  id: string; // e.g. "2026-01", "2026-09", "2027-01", "custom_xxx"
  label: string;
  year?: number;
  month?: number;
  isCurrent?: boolean;
  isCustom?: boolean;
}

export interface CustomStylesState {
  cells: Record<string, CustomCellStyle>; // key: `${rowId}_${colId}`
  rows: Record<string, CustomCellStyle>; // key: rowId
  cols: Record<string, CustomCellStyle>; // key: colId
}

// Sickness allowance month entry (from spreadsheet)
export interface SicknessAllowanceMonth {
  month: string; // e.g. "2026/01"
  calendarDays: number; // e.g. 31
  businessDays: number; // e.g. 19
  amount: number; // in 万円 (e.g. 66.1)
  received: boolean;
}

// Lump sum inflow (相続, 退職金, 不動産売却 等)
export interface LumpSumItem {
  id: string;
  year: number; // 何年後 (1〜35)
  amount: number; // 万円
  label: string; // 例: "相続", "特別臨時金"
}

// Simulation parameters
export interface SimulationConfig {
  years: number; // e.g. 10 (1〜35)
  currentCoreAmount: number; // in 万円
  monthlyInvestment: number; // in 万円 / month
  baseAnnualRate: number; // e.g. 10 (%) - mid
  bullAnnualRate: number; // e.g. 15 (%) - max
  bearAnnualRate: number; // e.g. -7 (%) - bear mid
  minAnnualRate?: number; // e.g. 7 (%) - min
  bearMinAnnualRate?: number; // e.g. -5 (%) - bear min
  bearMaxAnnualRate?: number; // e.g. -10 (%) - bear max
  fireTargetAmount?: number; // e.g. 10000 (1億円)
  reinvestDividends: boolean;
  marketCrashYear?: number;
  lumpSums?: LumpSumItem[]; // 臨時金リスト
  // Aliases for convenience
  baseReturnRate?: number;
  bullReturnRate?: number;
  bearReturnRate?: number;
  minReturnRate?: number;
  bearMinReturnRate?: number;
  bearMaxReturnRate?: number;
  targetAmount?: number;
}
