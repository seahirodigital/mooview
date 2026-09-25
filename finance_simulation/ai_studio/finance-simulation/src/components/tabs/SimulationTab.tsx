import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { SimulationChart } from '../charts/InteractiveChart';
import { EditableCell } from '../common/EditableCell';
import { LumpSumItem } from '../../types';
import { ArrowUpRight, Flame, Plus, Trash2, Edit3, X, Link as LinkIcon, Check } from 'lucide-react';

export const SimulationTab: React.FC = () => {
  const {
    simulationConfig,
    updateSimulationConfig,
    coreStocksTotal,
    cashTotal,
    netWorthTotal,
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
    color: '#af52de',
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

  const simulationYears = Math.max(1, simulationConfig.years || 10);
  const monthlyDeposit = simulationConfig.monthlyInvestment;

  const baseReturnRate = simulationConfig.baseReturnRate ?? simulationConfig.baseAnnualRate ?? 7;
  const bullReturnRate = simulationConfig.bullReturnRate ?? simulationConfig.bullAnnualRate ?? 15;
  const bearReturnRate = simulationConfig.bearReturnRate ?? simulationConfig.bearAnnualRate ?? -5;
  const targetAmount = simulationConfig.targetAmount ?? simulationConfig.fireTargetAmount ?? 10000;

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

  // Compute 3 scenario curves: Base, Bull, Bear + One-time incomes applied to specific years
  // Starting from Year 1 (as requested by user)
  const chartData = useMemo(() => {
    const data = [];
    const baseRate = baseReturnRate / 100;
    const bullRate = bullReturnRate / 100;
    const bearRate = bearReturnRate / 100;

    let baseBalance = initialPrincipal;
    let bullBalance = initialPrincipal;
    let bearBalance = initialPrincipal;
    let cumulativeInvested = initialPrincipal;

    for (let year = 1; year <= simulationYears; year++) {
      const annualDeposit = monthlyDeposit * 12;

      // Check one-time lump sums for this specific year
      const yearLumpSums = lumpSums.filter((l) => l.year === year);
      const lumpSumTotal = yearLumpSums.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

      cumulativeInvested += annualDeposit + lumpSumTotal;

      // Compound calculations with deposit & lump sum
      baseBalance = (baseBalance + annualDeposit + lumpSumTotal) * (1 + baseRate);
      bullBalance = (bullBalance + annualDeposit + lumpSumTotal) * (1 + bullRate);

      if (year === 2) {
        bearBalance = (bearBalance + annualDeposit + lumpSumTotal) * 0.75; // -25% market drawdown
      } else if (year === 7) {
        bearBalance = (bearBalance + annualDeposit + lumpSumTotal) * 0.82; // -18% recession
      } else {
        bearBalance = (bearBalance + annualDeposit + lumpSumTotal) * (1 + bearRate);
      }

      data.push({
        year,
        label: `${year}年目`,
        base: Math.round(baseBalance),
        bull: Math.round(bullBalance),
        bear: Math.round(Math.max(0, bearBalance)),
        invested: Math.round(cumulativeInvested),
        lumpSum: lumpSumTotal,
      });
    }
    return data;
  }, [
    simulationYears,
    initialPrincipal,
    monthlyDeposit,
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
  const isBaseGoalAchieved = finalYearData.base >= targetAmount;

  return (
    <div className="space-y-6">
      {/* Top Controls Toolbar: Apple-like Flat Navigation Bar (Title removed as requested) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-black/10 dark:border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          {/* Target FIRE Achieved Badge */}
          <span
            className={`text-xs px-3 py-1.5 border flex items-center gap-1.5 font-medium ${
              isBaseGoalAchieved
                ? 'bg-[#34c759]/15 text-[#34c759] border-[#34c759]/30'
                : 'bg-[#ff9500]/15 text-[#ff9500] border-[#ff9500]/30'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>目標 {targetAmount.toLocaleString()}万円: {isBaseGoalAchieved ? '達成見込み' : '計画調整推奨'}</span>
          </span>

          {/* Capital Link Status Selector */}
          <div className="flex items-center gap-1.5 px-3 py-1 border border-black/10 dark:border-white/10 bg-[#f5f5f7] dark:bg-white/5 text-xs">
            <LinkIcon className="w-3.5 h-3.5 text-[#0071e3]" />
            <span className="text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60">初期元本連動:</span>
            <select
              value={capitalSource}
              onChange={(e) => setCapitalSource(e.target.value as any)}
              className="bg-transparent font-bold text-[#0071e3] dark:text-[#2997ff] cursor-pointer outline-hidden"
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
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0071e3] hover:bg-[#0077ed] transition-all shadow-xs"
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
        <div className="flex flex-wrap items-center gap-2 p-2.5 border border-black/10 dark:border-white/10 bg-[#f5f5f7]/60 dark:bg-white/5 text-xs">
          <span className="text-[11px] font-semibold text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60">
            登録済み一時収入:
          </span>
          {lumpSums.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-1.5 px-2.5 py-1 border border-black/10 dark:border-white/10 bg-white dark:bg-[#1a1a1c]"
            >
              <span className="font-bold text-[#0071e3]">{item.year}年目</span>
              <span>{item.label}:</span>
              <span className="font-mono font-bold text-[#34c759]">+{item.amount.toLocaleString()}万円</span>
              <button
                onClick={() => {
                  setEditingLumpSum(item);
                  setShowLumpSumModal(true);
                }}
                className="text-[#1d1d1f]/40 dark:text-[#f5f5f7]/40 hover:text-[#0071e3] ml-1"
                title="編集"
              >
                <Edit3 className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleDeleteLumpSum(item.id)}
                className="text-[#1d1d1f]/40 dark:text-[#f5f5f7]/40 hover:text-red-500"
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
        <div className="lg:col-span-1 border border-black/10 dark:border-white/10 bg-[#f5f5f7]/50 dark:bg-white/5 p-5 space-y-4 transition-colors">
          <div className="pb-2 border-b border-black/5 dark:border-white/10">
            <h2 className={`text-sm font-semibold ${isDark ? 'text-[#f5f5f7]' : 'text-[#1d1d1f]'}`}>
              試算パラメータ
            </h2>
            <span className="text-[11px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50">
              各項目をクリック/ダブルクリックで変更可能
            </span>
          </div>

          <div className="space-y-3.5 text-xs">
            {/* Simulation Years (1年から開始) */}
            <div className="p-3 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5">
              <label className="text-[10px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 block mb-1">
                試算期間 (1年目〜)
              </label>
              <div className="flex items-center justify-between">
                <EditableCell
                  value={simulationConfig.years}
                  type="number"
                  min={1}
                  max={40}
                  suffix=" 年間"
                  onSave={(val) => updateSimulationConfig({ years: Number(val) || 10 })}
                  textClassName={`text-base font-bold font-mono ${isDark ? 'text-[#f5f5f7]' : 'text-[#1d1d1f]'}`}
                />
                <input
                  type="range"
                  min="1"
                  max="35"
                  step="1"
                  value={simulationConfig.years}
                  onChange={(e) => updateSimulationConfig({ years: Number(e.target.value) })}
                  className="w-20 accent-[#0071e3] cursor-pointer"
                />
              </div>
            </div>

            {/* Current Initial Principal */}
            <div className="p-3 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 block">
                  初期元本 (万円)
                </label>
                <span className="text-[9px] text-[#0071e3] dark:text-[#2997ff] font-sans font-medium">
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
                textClassName="text-base font-bold font-mono text-[#0071e3] dark:text-[#2997ff]"
              />
              <span className="text-[10px] text-[#1d1d1f]/40 dark:text-[#f5f5f7]/40 block mt-1">
                ※ 各タブの残高変更と自動同期
              </span>
            </div>

            {/* Monthly Investment */}
            <div className="p-3 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5">
              <label className="text-[10px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 block mb-1">
                毎月積立額 (万円/月)
              </label>
              <EditableCell
                value={simulationConfig.monthlyInvestment}
                type="number"
                step="1"
                min={0}
                suffix=" 万円"
                onSave={(val) => updateSimulationConfig({ monthlyInvestment: Number(val) || 0 })}
                textClassName="text-base font-bold font-mono text-[#34c759]"
              />
              <span className="text-[10px] text-[#1d1d1f]/40 dark:text-[#f5f5f7]/40 block mt-1">
                年間積立額: {(simulationConfig.monthlyInvestment * 12).toLocaleString()} 万円
              </span>
            </div>

            {/* Target Amount */}
            <div className="p-3 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5">
              <label className="text-[10px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 block mb-1">
                目標資産額 (万円)
              </label>
              <EditableCell
                value={targetAmount}
                type="number"
                step="500"
                min={100}
                suffix=" 万円"
                onSave={(val) =>
                  updateSimulationConfig({
                    targetAmount: Number(val) || 10000,
                    fireTargetAmount: Number(val) || 10000,
                  })
                }
                textClassName="text-base font-bold font-mono text-[#ff9500]"
              />
            </div>

            {/* Scenario Yield Rates with Plus Button */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-[#1d1d1f]/70 dark:text-[#f5f5f7]/70">
                  目標利回り設定 (%)
                </span>
                <button
                  onClick={() => setShowAddScenarioModal(true)}
                  className="flex items-center gap-1 text-[11px] font-bold text-[#0071e3] hover:underline"
                  title="追加利回りシナリオを作成"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>追加</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
                {/* Base */}
                <div className="p-2 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5">
                  <span className="text-[10px] text-[#34c759] font-sans font-bold block">標準 (Base)</span>
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
                    textClassName="font-bold text-[#34c759]"
                  />
                </div>

                {/* Bull */}
                <div className="p-2 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5">
                  <span className="text-[10px] text-[#0071e3] dark:text-[#2997ff] font-sans font-bold block">強気 (Bull)</span>
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
                    textClassName="font-bold text-[#0071e3] dark:text-[#2997ff]"
                  />
                </div>

                {/* Bear */}
                <div className="p-2 border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5">
                  <span className="text-[10px] text-[#ff3b30] font-sans font-bold block">弱気 (Bear)</span>
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
                    textClassName="font-bold text-[#ff3b30]"
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
                      className="text-black/40 dark:text-white/40 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 3 Cols: Interactive Chart & Outcome Milestone Cards */}
        <div className="lg:col-span-3 space-y-6">
          <SimulationChart data={chartData} targetAmount={targetAmount} />

          {/* 3 Outcome Milestone Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Base Scenario Card */}
            <div className="border border-black/10 dark:border-white/10 p-5 bg-[#f5f5f7]/80 dark:bg-white/5 transition-colors">
              <div className="flex items-center justify-between text-xs text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mb-1">
                <span className="font-semibold text-[#34c759] flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-[#34c759]" />
                  Base (+{baseReturnRate}%)
                </span>
                <span className="font-mono">{simulationYears}年後</span>
              </div>
              <div className="text-2xl font-bold font-mono text-[#34c759] tabular-nums mt-1">
                {(finalYearData.base / 10000).toFixed(2)} 億円
              </div>
              <div className="text-xs text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mt-1 font-mono">
                {finalYearData.base.toLocaleString()} 万円
              </div>
              <div className="text-[11px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50 mt-3 pt-2 border-t border-black/5 dark:border-white/10">
                元本: {finalYearData.invested.toLocaleString()}万 / 利益: +{(finalYearData.base - finalYearData.invested).toLocaleString()}万
              </div>
            </div>

            {/* Bull Scenario Card */}
            <div className="border border-black/10 dark:border-white/10 p-5 bg-[#f5f5f7]/80 dark:bg-white/5 transition-colors">
              <div className="flex items-center justify-between text-xs text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mb-1">
                <span className="font-semibold text-[#0071e3] dark:text-[#2997ff] flex items-center gap-1.5">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  Bull (+{bullReturnRate}%)
                </span>
                <span className="font-mono">{simulationYears}年後</span>
              </div>
              <div className="text-2xl font-bold font-mono text-[#0071e3] dark:text-[#2997ff] tabular-nums mt-1">
                {(finalYearData.bull / 10000).toFixed(2)} 億円
              </div>
              <div className="text-xs text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mt-1 font-mono">
                {finalYearData.bull.toLocaleString()} 万円
              </div>
              <div className="text-[11px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50 mt-3 pt-2 border-t border-black/5 dark:border-white/10">
                元本: {finalYearData.invested.toLocaleString()}万 / 利益: +{(finalYearData.bull - finalYearData.invested).toLocaleString()}万
              </div>
            </div>

            {/* Bear Scenario Card */}
            <div className="border border-black/10 dark:border-white/10 p-5 bg-[#f5f5f7]/80 dark:bg-white/5 transition-colors">
              <div className="flex items-center justify-between text-xs text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mb-1">
                <span className="font-semibold text-[#ff3b30] flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-[#ff3b30]" />
                  Bear ({bearReturnRate}%)
                </span>
                <span className="font-mono">{simulationYears}年後</span>
              </div>
              <div className="text-2xl font-bold font-mono text-[#ff3b30] tabular-nums mt-1">
                {(finalYearData.bear / 10000).toFixed(2)} 億円
              </div>
              <div className="text-xs text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mt-1 font-mono">
                {finalYearData.bear.toLocaleString()} 万円
              </div>
              <div className="text-[11px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50 mt-3 pt-2 border-t border-black/5 dark:border-white/10">
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
              isDark ? 'bg-[#1c1c1e] border-white/15 text-[#f5f5f7]' : 'bg-white border-black/10 text-[#1d1d1f]'
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
                      className="w-full p-2 border border-black/15 dark:border-white/15 bg-transparent font-mono font-bold text-[#0071e3]"
                    />
                    <span className="shrink-0 text-xs">万円</span>
                  </div>
                </div>
              </div>

              <div className="p-2.5 border border-black/10 dark:border-white/10 bg-[#f5f5f7] dark:bg-white/5 text-[11px] text-black/60 dark:text-white/60">
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
                  className="px-4 py-2 bg-[#0071e3] text-white font-semibold hover:bg-[#0077ed]"
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
              isDark ? 'bg-[#1c1c1e] border-white/15 text-[#f5f5f7]' : 'bg-white border-black/10 text-[#1d1d1f]'
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
                  className="px-4 py-2 bg-[#0071e3] text-white font-semibold"
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
