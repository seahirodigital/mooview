import { ETFDataRow, PredictionAnalysis, ScenarioResult } from '../types';

export const normalizeDate = (d?: string): string => {
  if (!d) return '';
  return d.replace(/[-/]/g, '').trim();
};

export function findPreviousSettlementRow(
  data: ETFDataRow[],
  targetLatestRow?: ETFDataRow
): ETFDataRow | null {
  if (!data || data.length === 0) return null;
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const latest = targetLatestRow || sorted[sorted.length - 1];
  const targetDivDate = normalizeDate(latest.last_div_date);

  if (targetDivDate) {
    // 1. Exact match on row.date === targetDivDate
    const exact = sorted.find((d) => normalizeDate(d.date) === targetDivDate);
    if (exact) return exact;

    // 2. Closest row on or before targetDivDate
    const candidates = sorted.filter((d) => normalizeDate(d.date) <= targetDivDate);
    if (candidates.length > 0) {
      return candidates[candidates.length - 1];
    }
  }

  // 3. Fallback: find any settlement row with last_div > 0 strictly prior to latest row
  const divRows = sorted.filter(
    (d) => d.last_div > 0 && normalizeDate(d.date) < normalizeDate(latest.date)
  );
  if (divRows.length > 0) {
    return divRows[divRows.length - 1];
  }

  return sorted[0];
}

export function enrichETFData(rawRows: ETFDataRow[]): ETFDataRow[] {
  if (!rawRows || rawRows.length === 0) return [];

  // Sort by date ascending
  const sorted = [...rawRows].sort((a, b) => a.date.localeCompare(b.date));

  // Determine prev_div_units for R calculation
  // Find settlement dates with last_div > 0
  let lastKnownSettlementUnits = sorted[0].total_units || 1000;
  let lastKnownSettlementDate = '';

  const enriched: ETFDataRow[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    const prevRow = i > 0 ? sorted[i - 1] : null;

    // Total units = net_assets / nav
    const nav = row.nav > 0 ? row.nav : 1;
    const net_assets = row.net_assets > 0 ? row.net_assets : (row.net_assets_mil || 0) * 1000000;
    const total_units = row.total_units > 0 ? row.total_units : net_assets / nav;

    // Daily change rate
    let daily_unit_change_rate = 100.0;
    if (prevRow && prevRow.total_units > 0) {
      daily_unit_change_rate = (total_units / prevRow.total_units) * 100;
    }

    // Check if this row is a settlement date with dividend
    const rowCleanDate = normalizeDate(row.date);
    const lastDivCleanDate = normalizeDate(row.last_div_date);
    if (lastDivCleanDate && row.last_div > 0) {
      if (rowCleanDate === lastDivCleanDate || lastDivCleanDate !== lastKnownSettlementDate) {
        lastKnownSettlementDate = lastDivCleanDate;
        lastKnownSettlementUnits = total_units;
      }
    }

    const r_cumulative = lastKnownSettlementUnits > 0 ? total_units / lastKnownSettlementUnits : 1.0;

    enriched.push({
      ...row,
      nav,
      net_assets,
      total_units,
      daily_unit_change_rate,
      r_cumulative,
    });
  }

  return enriched;
}

export function calculatePrediction(
  data: ETFDataRow[],
  targetYield: number = 0.15 // default 15%
): PredictionAnalysis | null {
  if (!data || data.length === 0) return null;

  const enriched = enrichETFData(data);
  const latestRow = enriched[enriched.length - 1];
  const currentNav = latestRow.nav;
  const currentUnits = latestRow.total_units;

  // Find previous settlement date row (8/10 etc.)
  const prevDivRow = findPreviousSettlementRow(enriched, latestRow) || enriched[0];

  const prevDivUnits = prevDivRow.total_units > 0 ? prevDivRow.total_units : enriched[0].total_units || 1;
  const rValue = currentUnits / prevDivUnits;
  const rPercent = (rValue - 1) * 100;

  // Monthly theoretical distribution (100口あたり) = (NAV * 100 * targetYield) / 12
  // Note: 100 units NAV = currentNav (100 units = 1 trade unit in TSE for 563A, where 1 trade unit NAV is ~105,000円)
  const theoreticalMonthlyDiv = (currentNav * targetYield) / 12;

  // Historical dividend average
  const divHistoryMap = new Map<string, { date: string; amount: number; navAtTime?: number }>();
  for (const row of enriched) {
    if (row.last_div > 0 && row.last_div_date) {
      divHistoryMap.set(row.last_div_date, {
        date: row.last_div_date,
        amount: row.last_div,
        navAtTime: row.nav,
      });
    }
  }
  const divHistory = Array.from(divHistoryMap.values());
  const avgHistoricalDiv =
    divHistory.length > 0
      ? divHistory.reduce((sum, d) => sum + d.amount, 0) / divHistory.length
      : 0;

  const historicalMonthlyYield = currentNav > 0 ? (avgHistoricalDiv / currentNav) * 100 : 0;
  const historicalAnnualYield = historicalMonthlyYield * 12;

  // Define 4 core scenarios matching the analytical paper model
  // Scenario A: 現状維持 (中心値) - R assumes slight flow +0.3% to settle at ~1.015
  // Scenario B: 資金流入微増 (下振れ) - R assumes +3.0% cumulative (R ~ 1.030)
  // Scenario C: 相場下落 5% × 流入微増 - NAV * 0.95, R ~ 1.030
  // Scenario D: 相場上昇 5% × 流入停止 - NAV * 1.05, R ~ 1.012 (current R)

  const scenarioConfigs = [
    {
      id: 'A',
      name: 'シナリオA: 現状維持 (中心値)',
      condition: '資金流入が横ばい維持・基準価額現水準',
      nav: currentNav,
      r: Math.max(1.0, rValue > 1.015 ? rValue : 1.015),
      isBase: true,
    },
    {
      id: 'B',
      name: 'シナリオB: 資金流入が微増',
      condition: '決算に向け口数が約3%増へ拡大（下振れリスク）',
      nav: currentNav,
      r: Math.max(1.03, rValue + 0.018),
      isBase: false,
    },
    {
      id: 'C',
      name: 'シナリオC: 相場下落 × 資金流入',
      condition: '相場下落（NAV -5%）かつ口数3%増（保守的・悲観）',
      nav: Math.round(currentNav * 0.95),
      r: Math.max(1.03, rValue + 0.018),
      isBase: false,
    },
    {
      id: 'D',
      name: 'シナリオD: 相場上昇 × 流入停止',
      condition: '相場上昇（NAV +5%）かつ口数増加完全ストップ（楽観）',
      nav: Math.round(currentNav * 1.05),
      r: rValue,
      isBase: false,
    },
  ];

  const scenarios: ScenarioResult[] = scenarioConfigs.map((s) => {
    const theoretical = (s.nav * targetYield) / 12;
    const predicted_div = s.r > 0 ? theoretical / s.r : theoretical;
    const monthly_yield = s.nav > 0 ? (predicted_div / s.nav) * 100 : 0;
    const annual_yield = monthly_yield * 12;

    return {
      id: s.id,
      name: s.name,
      condition: s.condition,
      nav: s.nav,
      r: s.r,
      theoretical_div: theoretical,
      predicted_div: predicted_div,
      monthly_yield: monthly_yield,
      annual_yield: annual_yield,
      isBase: s.isBase,
    };
  });

  return {
    latestRow,
    prevDivRow,
    rValue,
    rPercent,
    theoreticalMonthlyDiv,
    avgHistoricalDiv,
    historicalAnnualYield,
    scenarios,
    divHistory,
  };
}

export function formatDateStr(str: string): string {
  if (!str) return '-';
  const clean = str.replace(/[^\d]/g, '');
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}/${clean.slice(4, 6)}/${clean.slice(6, 8)}`;
  }
  return str;
}

export function formatCurrency(num: number, decimals: number = 0): string {
  if (isNaN(num)) return '0';
  return num.toLocaleString('ja-JP', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
