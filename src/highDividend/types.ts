export interface ETFDataRow {
  date: string; // YYYYMMDD
  nav: number; // 基準価額 (円)
  change: number; // 前日比 (円)
  net_assets_mil?: number; // 純資産総額 (百万円)
  net_assets: number; // 純資産総額 (円)
  last_div_date: string; // 直近決算日
  last_div: number; // 直近分配金 (100口あたり)
  reinv_nav: number; // 分配金再投資基準価額
  total_units: number; // 総発行口数 (net_assets / nav)
  daily_unit_change_rate?: number; // 前日比口数増減率 (%)
  r_cumulative?: number; // 前回決算比累積増加率 (R)
}

export interface ScenarioResult {
  id: string;
  name: string;
  condition: string;
  nav: number;
  r: number;
  theoretical_div: number; // 月間理論分配金 (100口あたり)
  predicted_div: number; // 予測分配金 (100口あたり)
  monthly_yield: number; // 月次利回り (%)
  annual_yield: number; // 年次換算利回り (%)
  isBase?: boolean;
}

export interface PredictionAnalysis {
  latestRow: ETFDataRow;
  prevDivRow?: ETFDataRow;
  rValue: number;
  rPercent: number;
  theoreticalMonthlyDiv: number;
  avgHistoricalDiv: number;
  historicalAnnualYield: number;
  scenarios: ScenarioResult[];
  divHistory: { date: string; amount: number; navAtTime?: number }[];
}
