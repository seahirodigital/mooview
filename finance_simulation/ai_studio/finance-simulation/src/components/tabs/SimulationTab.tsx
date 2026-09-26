import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { SimulationChart } from '../charts/InteractiveChart';
import { EditableCell } from '../common/EditableCell';
import { LumpSumItem } from '../../types';
import { ArrowUpRight, Plus, Trash2, Edit3, X, Link as LinkIcon, Check } from 'lucide-react';

export const SimulationTab: React.FC = () => {
  const {
    simulationConfig,
    updateSimulationConfig,
    coreStocksTotal,
    dividendStocksTotal,
    cashTotal,
    netWorthTotal,
    monthlySurplus,
    incomes,
    expenses,
    timelineColumns,
    monthlyOverrides,
    getMonthlyDividendForCol,
    setCategoryTotal,
    theme,
  } = useApp();

  const isDark = theme === 'dark';

  // Initial Capital Sync Source
  const [capitalSource, setCapitalSource] = useState<'core' | 'core_plus_cash' | 'net_worth' | 'custom'>('core');

  // One-time Income Modal / Manager state
  const [showLumpSumModal, setShowLumpSumModal] = useState<boolean>(false);
  const [editingLumpSum, setEditingLumpSum] = useState<LumpSumItem | null>(null);
  const [newLumpSum, setNewLumpSum] = useState<Omit<LumpSumItem, 'id'>>({
    year: 5,
    amount: 1000,
    label: '退職金 / 臨時収入',
  });

  // Target yield scenario list (Default 3 scenarios: Base, Bull, Bear) + Custom user-added scenarios
  const [customScenarios, setCustomScenarios] = useState<{ id: string; name: string; rate: number; color: string }[]>([]);
  const [showAddScenarioModal, setShowAddScenarioModal] = useState<boolean>(false);
  const [newScenario, setNewScenario] = useState<{ name: string; rate: number; color: string }>({
    name: '強気＋ (Ultra)',
    rate: 20,
    color: 'var(--color-finance-accent-mid)',
  });

  // Calculate actual initial principal based on linked tab or custom setting
  const initialPrincipal = useMemo(() => {
    switch (capitalSource) {
      case 'core_plus_cash':
        return coreStocksTotal + cashTotal;
      case 'net_worth':
        return netWorthTotal;
      case 'custom':
        return simulationConfig.currentCoreAmount || coreStocksTotal;
      case 'core':
      default:
        return coreStocksTotal;
    }
  }, [capitalSource, coreStocksTotal, cashTotal, netWorthTotal, simulationConfig.currentCoreAmount]);

  const simulationYears = Math.min(10, Math.max(0, Number(simulationConfig.years) || 0));
  // 試算対象元本以外は、資産管理タブの現在値を固定資産として合算する。
  // これにより、元本の選択を変えても現在の総資産を二重計上しない。
  const otherAssetsTotal = Math.max(0, netWorthTotal - initialPrincipal);

  const baseReturnRate = simulationConfig.baseReturnRate ?? simulationConfig.baseAnnualRate ?? 7;
  const bullReturnRate = simulationConfig.bullReturnRate ?? simulationConfig.bullAnnualRate ?? 15;
  const bearReturnRate = simulationConfig.bearReturnRate ?? simulationConfig.bearAnnualRate ?? -5;
  const coreGrowthRate = Math.min(40, Math.max(0, Number(simulationConfig.coreGrowthRate ?? 7)));
  const dividendGrowthRate = Math.min(40, Math.max(0, Number(simulationConfig.dividendGrowthRate ?? 5)));
  const formatScenarioRate = (rate: number) => `${rate >= 0 ? '+' : ''}${rate}%`;

  // 資産管理タブの各月の入金・支出をそのまま使う。未入力月は直前の既知月を引き継ぐ。
  const timelineSurpluses = useMemo(() => timelineColumns.map((column) => {
    const incomeTotal = incomes.reduce((sum, item) => {
      if (monthlyOverrides[item.id]?.[column.id] !== undefined) return sum + (Number(monthlyOverrides[item.id][column.id]) || 0);
      if (item.id === 'inc_dividend' || item.category === 'dividend') return sum + getMonthlyDividendForCol(column);
      return sum + (Number(item.amount) || 0);
    }, 0);
    const expenseTotal = expenses.reduce((sum, item) => {
      if (String(item.name || '').replace(/[\s　]/g, '').includes('家賃')) return sum + (Number(item.amount) || 0);
      if (monthlyOverrides[item.id]?.[column.id] !== undefined) return sum + (Number(monthlyOverrides[item.id][column.id]) || 0);
      return sum + (Number(item.amount) || 0);
    }, 0);
    return Math.round((incomeTotal - expenseTotal) * 10) / 10;
  }), [expenses, getMonthlyDividendForCol, incomes, monthlyOverrides, timelineColumns]);

  const currentTimelineIndex = timelineColumns.findIndex((column) => column.isCurrent);
  const currentMonthKey = (() => {
    const currentColumn = timelineColumns[currentTimelineIndex >= 0 ? currentTimelineIndex : 0];
    return currentColumn?.year && currentColumn.month
      ? currentColumn.year * 12 + currentColumn.month - 1
      : null;
  })();
  const projectionDateLabel = (year: number) => {
    if (currentMonthKey === null) return year === 0 ? '現在' : `${year}年後`;
    // 1年後は現在月から12か月後。月次CFの集計期間と表示年月を一致させる。
    const monthKey = currentMonthKey + (year * 12);
    const calendarYear = Math.floor(monthKey / 12);
    const calendarMonth = (monthKey % 12) + 1;
    return year === 0
      ? `${calendarYear}/${String(calendarMonth).padStart(2, '0')} (現在)`
      : `${calendarYear}/${String(calendarMonth).padStart(2, '0')}`;
  };
  const ageAtMonthKey = (monthKey: number | null) => {
    if (currentMonthKey === null || monthKey === null) return null;
    const birthdayMonth = 2;
    let age = 43;
    for (let key = currentMonthKey + 1; key <= monthKey; key += 1) {
      if ((key % 12) + 1 === birthdayMonth) age += 1;
    }
    return age;
  };
  const currentMonthlySurplus = currentTimelineIndex >= 0
    ? timelineSurpluses[currentTimelineIndex]
    : Number(monthlySurplus) || 0;
  const monthlyForecastSurplus = useMemo(() => {
    const startIndex = currentTimelineIndex >= 0 ? currentTimelineIndex : 0;
    const datedEntries = timelineColumns
      .map((column, index) => ({
        key: column.year && column.month ? column.year * 12 + column.month - 1 : null,
        value: timelineSurpluses[index],
      }))
      .filter((entry): entry is { key: number; value: number } => entry.key !== null && (currentMonthKey === null || entry.key >= currentMonthKey))
      .sort((left, right) => left.key - right.key);
    let previous = currentMonthlySurplus;
    return Array.from({ length: simulationYears * 12 }, (_, offset) => {
      const targetMonthKey = currentMonthKey === null ? null : currentMonthKey + offset + 1;
      if (targetMonthKey !== null) {
        const latest = datedEntries.filter((entry) => entry.key <= targetMonthKey).at(-1);
        if (latest) previous = latest.value;
      } else {
        const sequenceValue = timelineSurpluses[startIndex + offset + 1];
        if (sequenceValue !== undefined) previous = sequenceValue;
      }
      return previous;
    });
  }, [currentMonthKey, currentMonthlySurplus, currentTimelineIndex, simulationYears, timelineColumns, timelineSurpluses]);

  // Lump sum items from config
  const lumpSums: LumpSumItem[] = simulationConfig.lumpSums || [];

  // Add / Edit / Delete lump sums
  const handleSaveLumpSum = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingLumpSum) {
      const updated = lumpSums.map((item) =>
        item.id === editingLumpSum.id ? { ...editingLumpSum } : item
      );
      updateSimulationConfig({ lumpSums: updated });
      setEditingLumpSum(null);
    } else {
      const newItem: LumpSumItem = {
        id: `lump_${Date.now()}`,
        year: Number(newLumpSum.year) || 1,
        amount: Number(newLumpSum.amount) || 0,
        label: newLumpSum.label.trim() || '臨時収入',
      };
      updateSimulationConfig({ lumpSums: [...lumpSums, newItem] });
      setNewLumpSum({ year: 5, amount: 1000, label: '退職金 / 臨時収入' });
    }
    setShowLumpSumModal(false);
  };

  const handleDeleteLumpSum = (id: string) => {
    const updated = lumpSums.filter((item) => item.id !== id);
    updateSimulationConfig({ lumpSums: updated });
  };

  // 現在の元本を0年目とし、家計CFの余剰を毎月積み立てて4シナリオを年次計算する。
  const chartData = useMemo(() => {
    const data = [{
      year: 0,
      label: '現在',
      base: Math.round(initialPrincipal + otherAssetsTotal),
      bull: Math.round(initialPrincipal + otherAssetsTotal),
      bear: Math.round(initialPrincipal + otherAssetsTotal),
      split: Math.round(netWorthTotal),
      invested: Math.round(initialPrincipal + otherAssetsTotal),
      age: ageAtMonthKey(currentMonthKey),
      lumpSum: 0,
    }];
    const baseRate = baseReturnRate / 100;
    const bullRate = bullReturnRate / 100;
    const bearRate = bearReturnRate / 100;

    let baseBalance = initialPrincipal;
    let bullBalance = initialPrincipal;
    let bearBalance = initialPrincipal;
    let splitCoreBalance = coreStocksTotal;
    let splitDividendBalance = dividendStocksTotal;
    let cumulativeInvested = initialPrincipal + otherAssetsTotal;
    const splitOtherAssetsTotal = Math.max(0, netWorthTotal - coreStocksTotal - dividendStocksTotal);
    const growWithMonthlyDeposits = (balance: number, annualRate: number, deposits: number[]): number => {
      const monthlyRate = Math.pow(Math.max(0, 1 + annualRate), 1 / 12) - 1;
      let next = balance;
      deposits.forEach((deposit) => {
        next = (next + deposit) * (1 + monthlyRate);
      });
      return next;
    };

    for (let year = 1; year <= simulationYears; year++) {
      // Check one-time lump sums for this specific year
      const yearLumpSums = lumpSums.filter((l) => l.year === year);
      const lumpSumTotal = yearLumpSums.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
      const yearDeposits = monthlyForecastSurplus.slice((year - 1) * 12, year * 12);

      cumulativeInvested += yearDeposits.reduce((sum, amount) => sum + amount, 0) + lumpSumTotal;

      baseBalance = growWithMonthlyDeposits(baseBalance + lumpSumTotal, baseRate, yearDeposits);
      bullBalance = growWithMonthlyDeposits(bullBalance + lumpSumTotal, bullRate, yearDeposits);
      bearBalance = growWithMonthlyDeposits(bearBalance + lumpSumTotal, bearRate, yearDeposits);
      splitCoreBalance = growWithMonthlyDeposits(splitCoreBalance + lumpSumTotal, coreGrowthRate / 100, yearDeposits);
      splitDividendBalance = growWithMonthlyDeposits(splitDividendBalance, dividendGrowthRate / 100, yearDeposits.map(() => 0));

      data.push({
        year,
        label: projectionDateLabel(year),
        base: Math.round(baseBalance + otherAssetsTotal),
        bull: Math.round(bullBalance + otherAssetsTotal),
        bear: Math.round(Math.max(0, bearBalance) + otherAssetsTotal),
        split: Math.round(splitCoreBalance + splitDividendBalance + splitOtherAssetsTotal),
        invested: Math.round(cumulativeInvested),
        age: ageAtMonthKey(currentMonthKey === null ? null : currentMonthKey + (year * 12)),
        lumpSum: lumpSumTotal,
      });
    }
    return data;
  }, [
    simulationYears,
    initialPrincipal,
    otherAssetsTotal,
    monthlyForecastSurplus,
    projectionDateLabel,
    ageAtMonthKey,
    coreGrowthRate,
    dividendGrowthRate,
    coreStocksTotal,
    dividendStocksTotal,
    netWorthTotal,
    baseReturnRate,
    bullReturnRate,
    bearReturnRate,
    lumpSums,
  ]);

  const finalYearData = chartData[chartData.length - 1] || {
    base: initialPrincipal,
    bull: initialPrincipal,
    bear: initialPrincipal,
    invested: initialPrincipal,
  };
  return (
    <div className="space-y-6">
      {/* Top Controls Toolbar: Apple-like Flat Navigation Bar (Title removed as requested) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-black/10 dark:border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          {/* Capital Link Status Selector */}
          <div className="flex items-center gap-1.5 px-3 py-1 border border-black/10 dark:border-white/10 bg-[var(--color-finance-surface)] dark:bg-white/5 text-xs">
            <LinkIcon className="w-3.5 h-3.5 text-[var(--color-finance-accent)]" />
            <span className="text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60">初期元本連動:</span>
            <select
              value={capitalSource}
              onChange={(e) => setCapitalSource(e.target.value as any)}
              className="bg-transparent font-bold text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)] cursor-pointer outline-hidden"
            >
              <option value="core" className="text-black">コア株式のみ ({coreStocksTotal.toLocaleString()}万)</option>
              <option value="core_plus_cash" className="text-black">コア株式＋現金 ({(coreStocksTotal + cashTotal).toLocaleString()}万)</option>
              <option value="net_worth" className="text-black">総純資産 全連動 ({netWorthTotal.toLocaleString()}万)</option>
              <option value="custom" className="text-black">手動カスタム指定</option>
            </select>
          </div>
        </div>

        {/* One-Time Income Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingLumpSum(null);
              setShowLumpSumModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[var(--color-finance-accent)] hover:bg-[var(--color-finance-accent-strong)] transition-all shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>一時収入 (退職金・ボーナス等)</span>
            {lumpSums.length > 0 && (
              <span className="px-1.5 py-0.2 bg-white/20 text-white font-mono text-[10px] ml-1">
                {lumpSums.length}件
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Lump Sum Items Quick Strip (If any configured) */}
      {lumpSums.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 border border-black/10 dark:border-white/10 bg-[var(--color-finance-surface)]/60 dark:bg-white/5 text-xs">
          <span className="text-[11px] font-semibold text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60">
            登録済み一時収入:
          </span>
          {lumpSums.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-1.5 px-2.5 py-1 border border-black/10 dark:border-white/10 bg-white dark:bg-[var(--color-finance-dark-surface)]"
            >
              <span className="font-bold text-[var(--color-finance-accent)]">{item.year}年目</span>
              <span>{item.label}:</span>
              <span className="font-mono font-bold text-[var(--color-finance-positive)]">+{item.amount.toLocaleString()}万円</span>
              <button
                onClick={() => {
                  setEditingLumpSum(item);
                  setShowLumpSumModal(true);
                }}
                className="text-[var(--color-finance-ink)]/40 dark:text-[var(--color-finance-surface)]/40 hover:text-[var(--color-finance-accent)] ml-1"
                title="編集"
              >
                <Edit3 className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleDeleteLumpSum(item.id)}
                className="text-[var(--color-finance-ink)]/40 dark:text-[var(--color-finance-surface)]/40 hover:text-finance-negative"
                title="削除"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Grid: Parameters Control & Scenario Results */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Editable Parameters */}
        <div className="lg:col-span-1 border border-black/10 dark:border-white/10 bg-[var(--color-finance-surface)]/50 dark:bg-white/5 p-5 space-y-4 transition-colors">
          <div className="pb-2 border-b border-black/5 dark:border-white/10">
            <h2 className={`text-sm font-semibold ${isDark ? 'text-[var(--color-finance-surface)]' : 'text-[var(--color-finance-ink)]'}`}>
              試算パラメータ
            </h2>
          </div>

          <div className="space-y-3.5 text-xs">
            {/* Simulation Years (0〜10年後) */}
            <div className="p-3 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5">
              <label className="text-[10px] text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60 block mb-1">
                試算期間 (0〜10年後)
              </label>
              <div className="flex items-center justify-between">
                <EditableCell
                  value={simulationYears}
                  type="number"
                  min={0}
                  max={10}
                  suffix=" 年間"
                  onSave={(val) => updateSimulationConfig({ years: Math.min(10, Math.max(0, Number(val) || 0)) })}
                  textClassName={`text-base font-bold font-mono ${isDark ? 'text-[var(--color-finance-surface)]' : 'text-[var(--color-finance-ink)]'}`}
                />
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="1"
                  value={simulationYears}
                  onChange={(e) => updateSimulationConfig({ years: Number(e.target.value) })}
                  className="w-20 accent-[var(--color-finance-accent)] cursor-pointer"
                />
              </div>
            </div>

            {/* Current Initial Principal */}
            <div className="p-3 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60 block">
                  初期元本 (万円)
                </label>
                <span className="text-[9px] text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)] font-sans font-medium">
                  {capitalSource === 'core' && 'コア株式連動'}
                  {capitalSource === 'core_plus_cash' && 'コア＋現金連動'}
                  {capitalSource === 'net_worth' && '総純資産連動'}
                  {capitalSource === 'custom' && '手動設定'}
                </span>
              </div>
              <EditableCell
                value={initialPrincipal}
                type="number"
                step="50"
                min={0}
                onSave={(val) => {
                  const amount = Number(val) || 0;
                  setCapitalSource('core');
                  setCategoryTotal('core_stocks', amount);
                  updateSimulationConfig({ currentCoreAmount: amount });
                }}
                textClassName="text-base font-bold font-mono text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)]"
              />
            </div>

            {/* Monthly Investment */}
            <div className="p-3 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5">
              <label className="text-[10px] text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60 block mb-1">
                毎月積立額 (資産管理表CF連動)
              </label>
              <div className="text-base font-bold font-mono text-[var(--color-finance-positive)]">{currentMonthlySurplus.toFixed(1)} 万円/月</div>
            </div>

            {/* Scenario Yield Rates with Plus Button */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-[var(--color-finance-ink)]/70 dark:text-[var(--color-finance-surface)]/70">
                  シナリオ利回り設定 (%)
                </span>
                <button
                  onClick={() => setShowAddScenarioModal(true)}
                  className="flex items-center gap-1 text-[11px] font-bold text-[var(--color-finance-accent)] hover:underline"
                  title="追加利回りシナリオを作成"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>追加</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
                {/* Base */}
                <div className="p-2 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5">
                  <span className="text-[10px] text-[var(--color-finance-positive)] font-sans font-bold block">標準 (Base)</span>
                  <EditableCell
                    value={baseReturnRate}
                    type="number"
                    step="0.5"
                    suffix="%"
                    align="center"
                    onSave={(val) =>
                      updateSimulationConfig({
                        baseReturnRate: Number(val) || 7,
                        baseAnnualRate: Number(val) || 7,
                      })
                    }
                    textClassName="font-bold text-[var(--color-finance-positive)]"
                  />
                </div>

                {/* Bull */}
                <div className="p-2 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5">
                  <span className="text-[10px] text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)] font-sans font-bold block">強気 (Bull)</span>
                  <EditableCell
                    value={bullReturnRate}
                    type="number"
                    step="0.5"
                    suffix="%"
                    align="center"
                    onSave={(val) =>
                      updateSimulationConfig({
                        bullReturnRate: Number(val) || 15,
                        bullAnnualRate: Number(val) || 15,
                      })
                    }
                    textClassName="font-bold text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)]"
                  />
                </div>

                {/* Bear */}
                <div className="p-2 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5">
                  <span className="text-[10px] text-[var(--color-finance-negative)] font-sans font-bold block">弱気 (Bear)</span>
                  <EditableCell
                    value={bearReturnRate}
                    type="number"
                    step="0.5"
                    suffix="%"
                    align="center"
                    onSave={(val) =>
                      updateSimulationConfig({
                        bearReturnRate: Number(val) || -5,
                        bearAnnualRate: Number(val) || -5,
                      })
                    }
                    textClassName="font-bold text-[var(--color-finance-negative)]"
                  />
                </div>
              </div>

              {/* コア株式・高配当ポートフォリオの個別成長率 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <div className="p-2.5 border border-[var(--color-finance-accent-mid)]/30 bg-[var(--color-finance-accent-mid)]/5">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-sans font-bold text-[var(--color-finance-accent-mid)]">コア株式 ({coreGrowthRate}%)</label>
                    <span className="text-[10px] font-mono text-[var(--color-finance-accent-mid)]">0〜40%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    step="1"
                    value={coreGrowthRate}
                    onChange={(e) => updateSimulationConfig({ coreGrowthRate: Number(e.target.value) })}
                    className="w-full accent-[var(--color-finance-accent-mid)] cursor-pointer"
                    aria-label="コア株式の成長率"
                  />
                </div>
                <div className="p-2.5 border border-[var(--color-finance-accent-mid)]/30 bg-[var(--color-finance-accent-mid)]/5">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-sans font-bold text-[var(--color-finance-accent-mid)]">高配当ポートフォリオ ({dividendGrowthRate}%)</label>
                    <span className="text-[10px] font-mono text-[var(--color-finance-accent-mid)]">0〜40%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    step="1"
                    value={dividendGrowthRate}
                    onChange={(e) => updateSimulationConfig({ dividendGrowthRate: Number(e.target.value) })}
                    className="w-full accent-[var(--color-finance-accent-mid)] cursor-pointer"
                    aria-label="高配当ポートフォリオの成長率"
                  />
                </div>
              </div>

              {/* Custom Scenarios List (If added) */}
              {customScenarios.map((sc) => (
                <div
                  key={sc.id}
                  className="flex items-center justify-between p-2 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 font-mono text-xs"
                >
                  <span className="font-sans font-bold text-xs" style={{ color: sc.color }}>
                    {sc.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold" style={{ color: sc.color }}>
                      {sc.rate > 0 ? `+${sc.rate}%` : `${sc.rate}%`}
                    </span>
                    <button
                      onClick={() => setCustomScenarios(customScenarios.filter((s) => s.id !== sc.id))}
                      className="text-black/40 dark:text-white/40 hover:text-finance-negative"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右側: 年次チャート・試算表・シナリオ結果 */}
        <div className="lg:col-span-3 space-y-6">
          <SimulationChart
            data={chartData}
            rates={{ base: baseReturnRate, bull: bullReturnRate, bear: bearReturnRate, core: coreGrowthRate, dividend: dividendGrowthRate }}
          />

          {/* 年次純資産試算: 年次を横方向へ並べ、S&P500試算とその他資産を合算 */}
          <div className="border border-black/10 dark:border-white/10 bg-[var(--color-finance-surface)]/50 dark:bg-white/5 overflow-hidden">
            <div className="px-4 py-3 border-b border-black/10 dark:border-white/10">
              <h3 className="text-sm font-semibold">年次純資産試算 (万円)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs font-mono tabular-nums">
                <thead className="bg-black/5 dark:bg-white/5">
                  <tr>
                    <th className="sticky left-0 z-10 bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-surface)] px-4 py-2 text-left font-semibold">シナリオ</th>
                    {chartData.map((row) => (
                      <th key={row.year} className="px-4 py-2 text-right font-semibold whitespace-nowrap">
                        {row.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-black/5 dark:border-white/10">
                    <th className="sticky left-0 z-10 bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-surface)] px-4 py-2 text-left font-semibold">積立元本（余剰累積）</th>
                    {chartData.map((row) => <td key={row.year} className="px-4 py-2 text-right whitespace-nowrap">{row.invested.toLocaleString()} 万円</td>)}
                  </tr>
                  <tr className="border-t border-black/5 dark:border-white/10 bg-[var(--color-finance-positive)]/5">
                    <th className="sticky left-0 z-10 bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-surface)] px-4 py-2 text-left font-semibold text-[var(--color-finance-positive)]">{formatScenarioRate(baseReturnRate)}</th>
                    {chartData.map((row) => <td key={row.year} className="px-4 py-2 text-right font-semibold text-[var(--color-finance-positive)] whitespace-nowrap">{row.base.toLocaleString()} 万円</td>)}
                  </tr>
                  <tr className="border-t border-black/5 dark:border-white/10 bg-[var(--color-finance-accent)]/5">
                    <th className="sticky left-0 z-10 bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-surface)] px-4 py-2 text-left font-semibold text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)]">{formatScenarioRate(bullReturnRate)}</th>
                    {chartData.map((row) => <td key={row.year} className="px-4 py-2 text-right font-semibold text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)] whitespace-nowrap">{row.bull.toLocaleString()} 万円</td>)}
                  </tr>
                  <tr className="border-t border-black/5 dark:border-white/10 bg-[var(--color-finance-negative)]/5">
                    <th className="sticky left-0 z-10 bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-surface)] px-4 py-2 text-left font-semibold text-[var(--color-finance-negative)]">{formatScenarioRate(bearReturnRate)}</th>
                    {chartData.map((row) => <td key={row.year} className="px-4 py-2 text-right font-semibold text-[var(--color-finance-negative)] whitespace-nowrap">{row.bear.toLocaleString()} 万円</td>)}
                  </tr>
                  <tr className="border-t border-black/5 dark:border-white/10 bg-[var(--color-finance-accent-mid)]/5">
                    <th className="sticky left-0 z-10 bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-surface)] px-4 py-2 text-left font-semibold text-[var(--color-finance-accent-mid)]">コア株式 ({coreGrowthRate}%) / 高配当ポートフォリオ ({dividendGrowthRate}%)</th>
                    {chartData.map((row) => <td key={row.year} className="px-4 py-2 text-right font-semibold text-[var(--color-finance-accent-mid)] whitespace-nowrap">{(row.split ?? 0).toLocaleString()} 万円</td>)}
                  </tr>
                  <tr className="border-t-2 border-black/10 dark:border-white/10">
                    <th className="sticky left-0 z-10 bg-[var(--color-finance-surface)] dark:bg-[var(--color-finance-dark-surface)] px-4 py-2 text-left font-semibold">年齢（歳）</th>
                    {chartData.map((row) => {
                      const monthKey = currentMonthKey === null ? null : currentMonthKey + (row.year * 12);
                      const age = ageAtMonthKey(monthKey);
                      return <td key={row.year} className="px-4 py-2 text-right font-semibold whitespace-nowrap">{age ?? '—'}</td>;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 3 Outcome Milestone Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Base Scenario Card */}
            <div className="border border-black/10 dark:border-white/10 p-5 bg-[var(--color-finance-surface)]/80 dark:bg-white/5 transition-colors">
              <div className="flex items-center justify-between text-xs text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60 mb-1">
                <span className="font-semibold text-[var(--color-finance-positive)] flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-[var(--color-finance-positive)]" />
                  {formatScenarioRate(baseReturnRate)}
                </span>
                <span className="font-mono">{simulationYears}年後</span>
              </div>
              <div className="text-2xl font-bold font-mono text-[var(--color-finance-positive)] tabular-nums mt-1">
                {(finalYearData.base / 10000).toFixed(2)} 億円
              </div>
              <div className="text-xs text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60 mt-1 font-mono">
                {finalYearData.base.toLocaleString()} 万円
              </div>
              <div className="text-[11px] text-[var(--color-finance-ink)]/50 dark:text-[var(--color-finance-surface)]/50 mt-3 pt-2 border-t border-black/5 dark:border-white/10">
                元本: {finalYearData.invested.toLocaleString()}万 / 利益: +{(finalYearData.base - finalYearData.invested).toLocaleString()}万
              </div>
            </div>

            {/* Bull Scenario Card */}
            <div className="border border-black/10 dark:border-white/10 p-5 bg-[var(--color-finance-surface)]/80 dark:bg-white/5 transition-colors">
              <div className="flex items-center justify-between text-xs text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60 mb-1">
                <span className="font-semibold text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)] flex items-center gap-1.5">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  {formatScenarioRate(bullReturnRate)}
                </span>
                <span className="font-mono">{simulationYears}年後</span>
              </div>
              <div className="text-2xl font-bold font-mono text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)] tabular-nums mt-1">
                {(finalYearData.bull / 10000).toFixed(2)} 億円
              </div>
              <div className="text-xs text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60 mt-1 font-mono">
                {finalYearData.bull.toLocaleString()} 万円
              </div>
              <div className="text-[11px] text-[var(--color-finance-ink)]/50 dark:text-[var(--color-finance-surface)]/50 mt-3 pt-2 border-t border-black/5 dark:border-white/10">
                元本: {finalYearData.invested.toLocaleString()}万 / 利益: +{(finalYearData.bull - finalYearData.invested).toLocaleString()}万
              </div>
            </div>

            {/* Bear Scenario Card */}
            <div className="border border-black/10 dark:border-white/10 p-5 bg-[var(--color-finance-surface)]/80 dark:bg-white/5 transition-colors">
              <div className="flex items-center justify-between text-xs text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60 mb-1">
                <span className="font-semibold text-[var(--color-finance-negative)] flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-[var(--color-finance-negative)]" />
                  {formatScenarioRate(bearReturnRate)}
                </span>
                <span className="font-mono">{simulationYears}年後</span>
              </div>
              <div className="text-2xl font-bold font-mono text-[var(--color-finance-negative)] tabular-nums mt-1">
                {(finalYearData.bear / 10000).toFixed(2)} 億円
              </div>
              <div className="text-xs text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60 mt-1 font-mono">
                {finalYearData.bear.toLocaleString()} 万円
              </div>
              <div className="text-[11px] text-[var(--color-finance-ink)]/50 dark:text-[var(--color-finance-surface)]/50 mt-3 pt-2 border-t border-black/5 dark:border-white/10">
                元本: {finalYearData.invested.toLocaleString()}万 / 損益: {finalYearData.bear - finalYearData.invested >= 0 ? '+' : ''}{(finalYearData.bear - finalYearData.invested).toLocaleString()}万
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: One-Time Income (退職金・ボーナス・臨時金) Manager */}
      {showLumpSumModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div
            className={`w-full max-w-md p-6 border shadow-2xl transition-colors ${
              isDark ? 'bg-[var(--color-finance-dark-surface)] border-white/15 text-[var(--color-finance-surface)]' : 'bg-white border-black/10 text-[var(--color-finance-ink)]'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-black/10 dark:border-white/10">
              <h3 className="text-sm font-bold">
                {editingLumpSum ? '一時収入の編集' : '一時収入の追加 (退職金・臨時金)'}
              </h3>
              <button
                onClick={() => {
                  setShowLumpSumModal(false);
                  setEditingLumpSum(null);
                }}
                className="text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLumpSum} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="text-[11px] font-semibold block mb-1">収入名 / 項目</label>
                <input
                  type="text"
                  required
                  placeholder="例: 退職金、特別ボーナス、不動産売却益"
                  value={editingLumpSum ? editingLumpSum.label : newLumpSum.label}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (editingLumpSum) {
                      setEditingLumpSum({ ...editingLumpSum, label: val });
                    } else {
                      setNewLumpSum((prev) => ({ ...prev, label: val }));
                    }
                  }}
                  className="w-full p-2 border border-black/15 dark:border-white/15 bg-transparent font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold block mb-1">受取時期 (何年後)</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={40}
                      required
                      value={editingLumpSum ? editingLumpSum.year : newLumpSum.year}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 1;
                        if (editingLumpSum) {
                          setEditingLumpSum({ ...editingLumpSum, year: val });
                        } else {
                          setNewLumpSum((prev) => ({ ...prev, year: val }));
                        }
                      }}
                      className="w-full p-2 border border-black/15 dark:border-white/15 bg-transparent font-mono font-bold"
                    />
                    <span className="shrink-0 text-xs">年目</span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold block mb-1">金額 (万円)</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="10"
                      min={1}
                      required
                      value={editingLumpSum ? editingLumpSum.amount : newLumpSum.amount}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        if (editingLumpSum) {
                          setEditingLumpSum({ ...editingLumpSum, amount: val });
                        } else {
                          setNewLumpSum((prev) => ({ ...prev, amount: val }));
                        }
                      }}
                      className="w-full p-2 border border-black/15 dark:border-white/15 bg-transparent font-mono font-bold text-[var(--color-finance-accent)]"
                    />
                    <span className="shrink-0 text-xs">万円</span>
                  </div>
                </div>
              </div>

              <div className="p-2.5 border border-black/10 dark:border-white/10 bg-[var(--color-finance-surface)] dark:bg-white/5 text-[11px] text-black/60 dark:text-white/60">
                ※ 指定された年次に元本へ加算され、その後の全将来シミュレーション複利計算へダイレクトに反映されます。
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowLumpSumModal(false);
                    setEditingLumpSum(null);
                  }}
                  className="px-4 py-2 border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[var(--color-finance-accent)] text-white font-semibold hover:bg-[var(--color-finance-accent-strong)]"
                >
                  {editingLumpSum ? '更新して反映' : '追加して反映'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Custom Scenario Modal */}
      {showAddScenarioModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div
            className={`w-full max-w-sm p-6 border shadow-2xl transition-colors ${
              isDark ? 'bg-[var(--color-finance-dark-surface)] border-white/15 text-[var(--color-finance-surface)]' : 'bg-white border-black/10 text-[var(--color-finance-ink)]'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-black/10 dark:border-white/10">
              <h3 className="text-sm font-bold">利回りシナリオの追加</h3>
              <button
                onClick={() => setShowAddScenarioModal(false)}
                className="text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 pt-4 text-xs">
              <div>
                <label className="text-[11px] font-semibold block mb-1">シナリオ名</label>
                <input
                  type="text"
                  value={newScenario.name}
                  onChange={(e) => setNewScenario({ ...newScenario, name: e.target.value })}
                  className="w-full p-2 border border-black/15 dark:border-white/15 bg-transparent"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold block mb-1">想定年利回り (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={newScenario.rate}
                  onChange={(e) => setNewScenario({ ...newScenario, rate: Number(e.target.value) || 0 })}
                  className="w-full p-2 border border-black/15 dark:border-white/15 bg-transparent font-mono font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddScenarioModal(false)}
                  className="px-4 py-2 border border-black/15 dark:border-white/15"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomScenarios([
                      ...customScenarios,
                      {
                        id: `sc_${Date.now()}`,
                        name: newScenario.name,
                        rate: newScenario.rate,
                        color: newScenario.color,
                      },
                    ]);
                    setShowAddScenarioModal(false);
                  }}
                  className="px-4 py-2 bg-[var(--color-finance-accent)] text-white font-semibold"
                >
                  追加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
