import { ExpenseItem, IncomeItem, DividendStock, AssetItem, SicknessAllowanceMonth, SimulationConfig } from '../types';

export const INITIAL_EXPENSES: ExpenseItem[] = [
  { id: 'exp_rent', name: '家賃/人', amount: 7.5, category: 'fixed', note: '住居費固定' },
  { id: 'exp_entertainment', name: 'エンタメ', amount: 10.0, category: 'variable', note: '娯楽・交際費' },
  { id: 'exp_tax', name: '税金', amount: 6.0, category: 'tax', note: '住民税等' },
  { id: 'exp_food', name: '食費', amount: 5.0, category: 'variable', note: '自炊・外食' },
  { id: 'exp_misc', name: '雑費', amount: 4.0, category: 'variable', note: '日用品・消耗品' },
  { id: 'exp_internet', name: 'ネット', amount: 0.4, category: 'fixed', note: '光回線' },
  { id: 'exp_mobile', name: 'スマホ', amount: 0.3, category: 'fixed', note: '通信費' },
  { id: 'exp_life_ins', name: '生命保険', amount: 0.3, category: 'fixed', note: '保険料' },
  { id: 'exp_fitness', name: '運動', amount: 0.3, category: 'fixed', note: 'ジム・スポーツ' },
  { id: 'exp_it', name: 'IT', amount: 0.3, category: 'fixed', note: 'サブスク・クラウド' },
  { id: 'exp_elec', name: '電気', amount: 0, category: 'variable', note: '光熱費 (必要時入力)' },
  { id: 'exp_water', name: '水道', amount: 0, category: 'variable', note: '水道代 (必要時入力)' },
  { id: 'exp_gas', name: 'ガス', amount: 0, category: 'variable', note: 'ガス代 (必要時入力)' },
];

export const INITIAL_INCOMES: IncomeItem[] = [
  { id: 'inc_dividend', name: '配当', amount: 33.6, category: 'dividend', isRecurring: true, note: '保有高配当ポートフォリオより自動計算' },
  { id: 'inc_allowance', name: '傷病手当', amount: 66.1, category: 'allowance', isRecurring: true, note: '日当¥34,815換算 (2026年受給)' },
  { id: 'inc_amazon', name: 'Amazonアフィリエイト', amount: 2.0, category: 'affiliate', isRecurring: true, note: '副収入・ブログ/SNS' },
  { id: 'inc_other', name: 'その他臨時収入・給与', amount: 0.0, category: 'other', isRecurring: false, note: '副収入・還付金など' },
];

export const INITIAL_DIVIDEND_STOCKS: DividendStock[] = [
  {
    id: 'div_qqqi',
    ticker: 'QQQI',
    name: 'Webull QQQI (米国)',
    market: 'US',
    allocationPercent: 25,
    investedAmount: 500,
    estimatedYield: 13.00,
    usTaxRate: 10,
    jpTaxRate: 20,
    frequency: 'monthly',
    payoutMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    payoutDay: 18,
    note: 'Nasdaq 100 オプション戦略'
  },
  {
    id: 'div_iwmi',
    ticker: 'IWMI',
    name: 'Webull IWMI (米国)',
    market: 'US',
    allocationPercent: 25,
    investedAmount: 500,
    estimatedYield: 13.86,
    usTaxRate: 10,
    jpTaxRate: 20,
    frequency: 'monthly',
    payoutMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    payoutDay: 18,
    note: 'ラッセル2000 高配当戦略'
  },
  {
    id: 'div_5g',
    ticker: '5G',
    name: '5G 投資信託 (国内)',
    market: 'JP_TRUST',
    allocationPercent: 30,
    investedAmount: 600,
    estimatedYield: 30.00,
    usTaxRate: 0,
    jpTaxRate: 20,
    frequency: 'monthly',
    payoutMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    payoutDay: 7,
    note: '毎月分配型投信 (7日)'
  },
  {
    id: 'div_fidelity',
    ticker: 'ﾌｨﾃﾞF米株',
    name: 'ﾌｨﾃﾞF 米株 (信託)',
    market: 'JP_TRUST',
    allocationPercent: 15,
    investedAmount: 300,
    estimatedYield: 20.00,
    usTaxRate: 0,
    jpTaxRate: 20,
    frequency: 'monthly',
    payoutMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    payoutDay: 24,
    note: 'フィデリティ米国株式投信 (24日)'
  },
  {
    id: 'div_world',
    ticker: '世界',
    name: '世界 投資信託 (国内)',
    market: 'JP_TRUST',
    allocationPercent: 5,
    investedAmount: 100,
    estimatedYield: 16.40,
    usTaxRate: 0,
    jpTaxRate: 5,
    frequency: 'monthly',
    payoutMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    payoutDay: 24,
    note: 'グローバル高配当 (24日)'
  },
  {
    id: 'div_spy',
    ticker: 'SPY',
    name: 'SPY (米国ETF)',
    market: 'US',
    allocationPercent: 0,
    investedAmount: 90,
    estimatedYield: 1.5,
    usTaxRate: 10,
    jpTaxRate: 20,
    frequency: 'quarterly',
    payoutMonths: [3, 6, 9, 12],
    manualMonthlyDividend: 6.0,
    note: 'S&P500 ETF 四半期分配'
  },
  {
    id: 'div_gpiq',
    ticker: 'GPIQ',
    name: '米高配当 GPIQ (1日)',
    market: 'US',
    allocationPercent: 0,
    investedAmount: 210,
    estimatedYield: 10.20,
    usTaxRate: 10,
    jpTaxRate: 20,
    frequency: 'monthly',
    payoutMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    payoutDay: 1,
    note: 'ゴールドマンサックス・インカムETF'
  },
  {
    id: 'div_563a',
    ticker: '563A',
    name: 'カバコ 563A (8日)',
    market: 'JP_ETF',
    allocationPercent: 0,
    investedAmount: 0,
    estimatedYield: 11.00,
    usTaxRate: 0,
    jpTaxRate: 20,
    frequency: 'semi_annual',
    payoutMonths: [6, 12],
    payoutDay: 8,
    note: 'カバードコールETF (年2回分配)'
  }
];

export const INITIAL_ASSETS: AssetItem[] = [
  // 現金 (Cash)
  { id: 'asset_mufj', category: 'cash', name: 'MUFJ + SBI新生銀行', amount: 20, institution: 'MUFJ/SBI新生', note: '日常決済口座' },
  { id: 'asset_docomo', category: 'cash', name: 'ドコモ住信SBI (+USD)', amount: 11, institution: '住信SBIネット銀行', note: '外貨・ドル保有含む' },
  { id: 'asset_jre', category: 'cash', name: 'JRE Bank', amount: 277, institution: 'JRE Bank (楽天)', note: '生活防衛資金' },
  { id: 'asset_hybrid', category: 'cash', name: 'Hybrid預金＠SBI新生', amount: 1144, institution: 'SBI証券/新生', note: '証券待機資金・余力' },
  { id: 'asset_webull_cash', category: 'cash', name: 'Webull 預金', amount: 200, institution: 'Webull証券', note: '米国株買付余力' },

  // 株式 (コア)
  { id: 'asset_sp500_core', category: 'core_stocks', name: 'S&P500 (2563)', ticker: '2563', amount: 7616, institution: 'SBI証券', note: '主力コア資産 (S&P500投信/ETF)' },
  { id: 'asset_sp500_nisa', category: 'core_stocks', name: 'NISA(積立) S&P500', ticker: 'SP500', amount: 267, monthlyContribution: 25, institution: 'SBI証券', note: '新NISA定期積立 (月25万円)' },

  // 高配当 (サテライト)
  { id: 'asset_qqqi', category: 'dividend_stocks', name: 'Webull QQQI', ticker: 'QQQI', amount: 506, institution: 'Webull証券', note: '米高配当オプションETF' },
  { id: 'asset_iwmi', category: 'dividend_stocks', name: 'Webull IWMI', ticker: 'IWMI', amount: 65, institution: 'Webull証券', note: 'ラッセル高配当ETF' },
  { id: 'asset_5g', category: 'dividend_stocks', name: '5G 投資信託', ticker: '5G', amount: 490, institution: 'SBI証券', note: '毎月分配投信' },
  { id: 'asset_fidelity', category: 'dividend_stocks', name: 'ﾌｨﾃﾞF 米株', ticker: 'FIDELITY', amount: 198, institution: 'SBI証券', note: '米国高配当投信' },
  { id: 'asset_gpiq', category: 'dividend_stocks', name: 'GPIQ', ticker: 'GPIQ', amount: 210, institution: 'SBI証券', note: '米高配当ETF' },
  { id: 'asset_matsui', category: 'dividend_stocks', name: '松井証券 保有株', ticker: 'MATSUI', amount: 200, institution: '松井証券', note: '株式・投信' },
  { id: 'asset_single_stock', category: 'dividend_stocks', name: '国内個別株', amount: 31, institution: '証券各社', note: '日本高配当株' },
  { id: 'asset_cfd', category: 'dividend_stocks', name: 'CFD (GMO)', ticker: 'CFD', amount: 65, institution: 'GMOクリック証券', note: 'CFDポジション' },

  // 現物・低流動性
  { id: 'asset_gold', category: 'illiquid_other', name: '金インゴッド (現物)', amount: 240, institution: '田中貴金属等', note: '純金現物保有' },
  { id: 'asset_ideco', category: 'illiquid_other', name: 'iDeCo / 企業型DC (PwCD&M)', amount: 485, institution: '確定拠出年金', note: '年金受給用 (低流動性)' },
  { id: 'asset_medi', category: 'illiquid_other', name: 'Medi (積立保険/解約返戻)', amount: 150, institution: '保険会社', note: '医療・貯蓄性資産' },
];

export const INITIAL_SICKNESS_SCHEDULE: SicknessAllowanceMonth[] = [
  { month: '2026/01', calendarDays: 31, businessDays: 19, amount: 66.1, received: true },
  { month: '2026/02', calendarDays: 28, businessDays: 19, amount: 66.1, received: true },
  { month: '2026/03', calendarDays: 31, businessDays: 20, amount: 69.6, received: true },
  { month: '2026/04', calendarDays: 30, businessDays: 21, amount: 73.1, received: true },
  { month: '2026/05', calendarDays: 31, businessDays: 18, amount: 62.7, received: false },
  { month: '2026/06', calendarDays: 30, businessDays: 22, amount: 76.6, received: false },
  { month: '2026/07', calendarDays: 31, businessDays: 22, amount: 76.6, received: false },
  { month: '2026/08', calendarDays: 31, businessDays: 20, amount: 69.6, received: false },
  { month: '2026/09', calendarDays: 30, businessDays: 19, amount: 66.1, received: false },
  { month: '2026/10', calendarDays: 31, businessDays: 21, amount: 73.1, received: false },
  { month: '2026/11', calendarDays: 30, businessDays: 19, amount: 66.1, received: false },
  { month: '2026/12', calendarDays: 31, businessDays: 23, amount: 80.1, received: false },
  { month: '2027/01', calendarDays: 31, businessDays: 19, amount: 66.1, received: false },
  { month: '2027/02', calendarDays: 28, businessDays: 19, amount: 66.1, received: false },
  { month: '2027/03', calendarDays: 31, businessDays: 22, amount: 76.6, received: false },
  { month: '2027/04', calendarDays: 30, businessDays: 21, amount: 73.1, received: false },
];

export const INITIAL_SIMULATION_CONFIG: SimulationConfig = {
  years: 2,
  currentCoreAmount: 7883, // S&P500 Core 7616 + NISA 267
  monthlyInvestment: 25.0, // Monthly investment (万円)
  baseAnnualRate: 7.0, // S&P500 historic real return
  bullAnnualRate: 15.0, // Bull market
  bearAnnualRate: -5.0, // Bear market
  coreGrowthRate: 7.0,
  dividendGrowthRate: 5.0,
  reinvestDividends: true,
  marketCrashYear: 3, // Stress test scenario: Year 3 -30% drop
};
