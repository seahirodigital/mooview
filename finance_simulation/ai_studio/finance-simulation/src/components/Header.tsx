import React from 'react';
import { useApp } from '../context/AppContext';
import { formatYen } from './charts/InteractiveChart';
import { Landmark, TrendingUp, ShieldCheck, JapaneseYen, ArrowUpRight } from 'lucide-react';

export const HeaderSummary: React.FC = () => {
  const {
    netWorthTotal,
    coreStocksTotal,
    totalExpenses,
    totalMonthlyDividend,
    dividendCoverageRate,
    remainingSicknessTotal,
    setCurrentTab,
  } = useApp();

  return (
    <div className="w-full mb-6">
      {/* 4 Quick Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Net Worth */}
        <div
          onClick={() => setCurrentTab('assets')}
          className="bg-slate-900/70 hover:bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-3.5 sm:p-4 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5 font-medium">
              <Landmark className="w-3.5 h-3.5 text-emerald-400" />
              総資産 (純資産)
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-white tabular-nums">
            {formatYen(netWorthTotal)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between font-mono">
            <span>内コア株式</span>
            <span className="text-slate-300">{formatYen(coreStocksTotal)}</span>
          </div>
        </div>

        {/* Card 2: Living Expenses */}
        <div
          onClick={() => setCurrentTab('living')}
          className="bg-slate-900/70 hover:bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-3.5 sm:p-4 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5 font-medium">
              <JapaneseYen className="w-3.5 h-3.5 text-amber-400" />
              月次生活費 (設定)
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-slate-100 tabular-nums">
            {totalExpenses.toFixed(1)} <span className="text-sm font-normal text-slate-400">万円/月</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between font-mono">
            <span>年間換算</span>
            <span className="text-slate-300">{(totalExpenses * 12).toFixed(1)} 万円</span>
          </div>
        </div>

        {/* Card 3: Dividend Income & Coverage */}
        <div
          onClick={() => setCurrentTab('dividend')}
          className="bg-slate-900/70 hover:bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-3.5 sm:p-4 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              受取配当 (手取り)
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-emerald-400 tabular-nums">
            {totalMonthlyDividend.toFixed(1)} <span className="text-sm font-normal text-slate-400">万円/月</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between font-mono">
            <span>生活費カバー率</span>
            <span className={`font-semibold ${dividendCoverageRate >= 100 ? 'text-emerald-400' : 'text-sky-400'}`}>
              {dividendCoverageRate.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Card 4: S&P500 Simulation / Future Cash */}
        <div
          onClick={() => setCurrentTab('simulation')}
          className="bg-slate-900/70 hover:bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-3.5 sm:p-4 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5 font-medium">
              <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
              将来試算 (S&P500)
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-purple-300 tabular-nums">
            +7% <span className="text-sm font-normal text-slate-400">複利運用</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between font-mono">
            <span>手当金受給予定</span>
            <span className="text-amber-400 font-semibold">{remainingSicknessTotal.toFixed(1)} 万円</span>
          </div>
        </div>
      </div>
    </div>
  );
};
