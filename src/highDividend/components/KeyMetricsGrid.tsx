import React from 'react';
import { PredictionAnalysis } from '../types';
import { formatCurrency } from '../utils/calc';
import { TrendingUp, TrendingDown, HelpCircle } from 'lucide-react';

interface KeyMetricsGridProps {
  analysis: PredictionAnalysis;
  targetYield: number;
  onOpenDilutionGuide: () => void;
}

export const KeyMetricsGrid: React.FC<KeyMetricsGridProps> = ({
  analysis,
  targetYield,
  onOpenDilutionGuide,
}) => {
  const { latestRow, prevDivRow, rValue, rPercent, theoreticalMonthlyDiv } = analysis;

  const isNavUp = latestRow.change >= 0;
  const netAssetsOku = (latestRow.net_assets / 100000000).toFixed(1);

  return (
    <section className="bg-white border border-black/15 p-4 sm:p-5 shadow-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Metric 1: Reference NAV */}
        <div className="p-3.5 bg-[#FDFCFB] border border-black/10 flex flex-col justify-between">
          <div>
            <p className="text-[10px] uppercase font-sans font-bold text-gray-500 tracking-wider">基準価額(NAV)</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl sm:text-3xl font-serif font-bold text-[#1A1A1A] tabular-nums">
                ¥{formatCurrency(latestRow.nav)}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-black/5 flex items-center justify-between text-xs font-sans">
            <span className={`inline-flex items-center font-bold ${isNavUp ? 'text-emerald-700' : 'text-red-600'}`}>
              {isNavUp ? <TrendingUp className="w-3.5 h-3.5 mr-0.5" /> : <TrendingDown className="w-3.5 h-3.5 mr-0.5" />}
              {isNavUp ? '+' : ''}{formatCurrency(latestRow.change)} 円
            </span>
            <span className="text-gray-400 text-[10px] uppercase">前日比変動</span>
          </div>
        </div>

        {/* Metric 2: Total Units & Net Assets */}
        <div className="p-3.5 bg-[#FDFCFB] border border-black/10 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center">
              <p className="text-[10px] uppercase font-sans font-bold text-gray-500 tracking-wider">総発行口数</p>
              <span className="text-[10px] font-sans font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 border border-orange-200">
                純資産 {netAssetsOku}億円
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl sm:text-3xl font-serif font-bold text-[#1A1A1A] tabular-nums">
                {formatCurrency(Math.round(latestRow.total_units))}
              </span>
              <span className="text-xs font-sans text-gray-500">口</span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-black/5 text-xs font-sans text-gray-500 flex justify-between">
            <span>前回決算(8/10):</span>
            <span className="font-mono text-[#1A1A1A]">{formatCurrency(Math.round(prevDivRow?.total_units || 0))} 口</span>
          </div>
        </div>

        {/* Metric 3: Dilution Factor R */}
        <div className="p-3.5 bg-[#FDFCFB] border border-black/10 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1">
                <p className="text-[10px] uppercase font-sans font-bold text-gray-500 tracking-wider">Dilution Factor (R)</p>
                <button
                  onClick={onOpenDilutionGuide}
                  className="text-gray-400 hover:text-orange-600 transition-colors cursor-pointer"
                  title="希薄化メカニズムを解説"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>
              <span
                className={`text-[9px] uppercase font-sans font-bold px-1.5 py-0.5 border ${
                  rPercent < 3.0
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-amber-50 border-amber-300 text-amber-800'
                }`}
              >
                {rPercent < 3.0 ? '希薄化ほぼ消失' : '資金流入中'}
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl sm:text-3xl font-serif font-bold text-[#1A1A1A] tabular-nums">
                {rValue.toFixed(3)}
              </span>
              <span className="text-xs font-sans font-normal text-gray-400">x</span>
              <span className="text-xs font-mono font-bold text-orange-700 ml-auto">
                ({rPercent >= 0 ? '+' : ''}{rPercent.toFixed(1)}%)
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-black/5 text-xs font-sans text-gray-500 flex justify-between">
            <span>前回7/10~8/10希薄化:</span>
            <span className="font-mono text-red-600">1.530x (+53%)</span>
          </div>
        </div>

        {/* Metric 4: Theoretical Monthly Target */}
        <div className="p-3.5 bg-[#1A1A1A] text-white flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center">
              <p className="text-[10px] uppercase font-sans font-bold tracking-wider text-gray-300">Theoretical Monthly</p>
              <span className="text-[9px] uppercase font-sans font-bold text-orange-400 border border-orange-400/40 px-1.5 py-0.5">
                年{(targetYield * 100).toFixed(0)}% 目標
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl sm:text-3xl font-serif font-bold text-white tabular-nums">
                ¥{formatCurrency(Math.round(theoreticalMonthlyDiv))}
              </span>
              <span className="text-xs font-sans text-gray-400">/ 100口</span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-white/15 text-[10px] font-mono text-gray-400 flex justify-between">
            <span>(NAV × {(targetYield * 100).toFixed(0)}%) ÷ 12ヶ月</span>
            <span className="text-emerald-400 font-bold">{((targetYield / 12) * 100).toFixed(2)}%/月</span>
          </div>
        </div>
      </div>
    </section>
  );
};
