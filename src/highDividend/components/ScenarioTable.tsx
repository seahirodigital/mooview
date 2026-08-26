import React from 'react';
import { ScenarioResult } from '../types';
import { formatCurrency } from '../utils/calc';
import { Target, CheckCircle2 } from 'lucide-react';

interface ScenarioTableProps {
  scenarios: ScenarioResult[];
  targetYield: number;
  selectedScenarioId: string;
  onSelectScenario: (id: string) => void;
}

export const ScenarioTable: React.FC<ScenarioTableProps> = ({
  scenarios,
  targetYield,
  selectedScenarioId,
  onSelectScenario,
}) => {
  return (
    <section className="bg-white border border-black/15 p-5 sm:p-6 mb-6 shadow-xs">
      {/* Header */}
      <div className="border-b border-black/10 pb-3 mb-5">
        <h2 className="text-xl sm:text-2xl font-serif font-black tracking-tight text-[#1A1A1A]">
          次回分配金 予測シナリオ（目標年利 {(targetYield * 100).toFixed(0)}% 割返しモデル）
        </h2>
      </div>

      {/* 4 Scenario Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {scenarios.map((s) => {
          const isSelected = s.id === selectedScenarioId;
          const isBase = s.isBase;
          return (
            <div
              key={s.id}
              onClick={() => onSelectScenario(s.id)}
              className={`p-4 border transition-all cursor-pointer select-none relative ${
                isSelected
                  ? 'border-2 border-orange-600 bg-orange-50/50 shadow-md ring-2 ring-orange-500/20'
                  : 'border-black/10 bg-[#FDFCFB] hover:border-black/30 hover:bg-black/2'
              }`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-sans font-bold text-white bg-orange-600 px-1.5 py-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5" /> 選択中
                </div>
              )}

              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-xs font-bold text-gray-500">シナリオ {s.id}</span>
                {isBase && (
                  <span className="text-[9px] font-sans font-bold bg-[#1A1A1A] text-white px-1.5 py-0.2">
                    メイン予測
                  </span>
                )}
              </div>

              <div className="text-sm font-sans font-bold text-[#1A1A1A] line-clamp-1 mb-2">
                {s.name.replace(/シナリオ[A-D]:\s*/, '')}
              </div>

              <div className="text-2xl sm:text-3xl font-serif font-black text-[#1A1A1A] tracking-tight">
                ¥{formatCurrency(Math.round(s.predicted_div))}
                <span className="text-xs font-sans font-normal text-gray-500 ml-1">/ 100口</span>
              </div>

              <div className="mt-2 pt-2 border-t border-black/10 flex justify-between items-center text-[11px] font-sans">
                <span className="text-gray-500">年換算利回り:</span>
                <span className="font-mono font-bold text-orange-700">{s.annual_yield.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between items-center text-[11px] font-sans text-gray-500">
                <span>月額分配率:</span>
                <span className="font-mono font-semibold text-gray-700">{s.monthly_yield.toFixed(2)}%</span>
              </div>

              <div className="mt-2 text-[10px] font-sans text-gray-600 bg-black/5 p-1.5 border border-black/5">
                NAV: ¥{formatCurrency(s.nav)} / R: {s.r.toFixed(3)}x
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse font-sans">
          <thead>
            <tr className="border-b-2 border-[#1A1A1A] bg-[#F9F7F2] text-[#1A1A1A] uppercase tracking-wider font-bold">
              <th className="py-2.5 px-3">シナリオ</th>
              <th className="py-2.5 px-3">前提状況・市場動向</th>
              <th className="py-2.5 px-3 text-right">想定NAV</th>
              <th className="py-2.5 px-3 text-right">想定口数増加率 (R)</th>
              <th className="py-2.5 px-3 text-right">100口あたり予想分配金</th>
              <th className="py-2.5 px-3 text-right">年換算利回り</th>
              <th className="py-2.5 px-3 text-right">月額分配率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10">
            {scenarios.map((s) => {
              const isSelected = s.id === selectedScenarioId;
              return (
                <tr
                  key={s.id}
                  onClick={() => onSelectScenario(s.id)}
                  className={`transition-colors cursor-pointer ${
                    isSelected ? 'bg-orange-50/80 font-semibold' : 'hover:bg-[#F9F7F2]'
                  }`}
                >
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-orange-600"></span>
                      <strong className="font-mono font-bold text-[#1A1A1A]">シナリオ {s.id}</strong>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-gray-700">
                    {s.name.replace(/シナリオ[A-D]:\s*/, '')}
                    {s.isBase && <span className="ml-2 text-[10px] text-orange-700 font-bold">[現状維持]</span>}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    ¥{formatCurrency(s.nav)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-orange-800">
                    {s.r.toFixed(3)}x ({((s.r - 1) * 100 >= 0 ? '+' : '')}{((s.r - 1) * 100).toFixed(1)}%)
                  </td>
                  <td className="py-3 px-3 text-right font-serif font-black text-base text-[#1A1A1A]">
                    ¥{formatCurrency(Math.round(s.predicted_div))}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-orange-700">
                    {s.annual_yield.toFixed(2)}%
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-gray-700">
                    {s.monthly_yield.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
