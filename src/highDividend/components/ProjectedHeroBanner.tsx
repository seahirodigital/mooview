import React from 'react';
import { PredictionAnalysis } from '../types';
import { formatCurrency } from '../utils/calc';
import { CalendarCheck, ArrowRight } from 'lucide-react';

interface ProjectedHeroBannerProps {
  analysis: PredictionAnalysis;
  selectedScenarioId?: string;
  onOpenDilutionGuide: () => void;
}

export const ProjectedHeroBanner: React.FC<ProjectedHeroBannerProps> = ({
  analysis,
  selectedScenarioId = 'A',
  onOpenDilutionGuide,
}) => {
  const { scenarios } = analysis;
  const activeScenario = scenarios.find((s) => s.id === selectedScenarioId) || scenarios[0];

  return (
    <section className="bg-[#1A1A1A] text-white border border-[#1A1A1A] p-6 relative overflow-hidden shadow-xs">
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-orange-600 text-white text-[10px] font-sans font-bold uppercase tracking-widest px-2.5 py-1 flex items-center gap-1">
              <CalendarCheck className="w-3.5 h-3.5" /> 次回第3回決算: 2026年9月10日
            </span>
            <span className="text-[10px] font-sans uppercase tracking-wider text-gray-400 border border-white/20 px-2 py-0.5">
              希薄化解消フェーズ
            </span>
          </div>

          <h3 className="text-xl sm:text-2xl lg:text-3xl font-serif font-bold text-white leading-tight">
            次回分配金 予測レンジ: <span className="text-orange-400 italic">¥1,270 〜 ¥1,291</span> / 100口
          </h3>

          <p className="text-xs sm:text-sm font-sans text-gray-300 leading-relaxed">
            8/10決算時の急激な口数膨張（+53%）から一転、直近は口数増加率がわずか <strong className="text-white">+1.2%（R=1.012）</strong> に沈静化。
            前回900円への大幅減額ショックから本来の目標水準（年利換算約14.8%）へのV字回復が見込まれます。
          </p>
        </div>

        <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end gap-3 border-t lg:border-t-0 pt-4 lg:pt-0 border-white/15">
          <div className="bg-white/10 p-4 border border-white/20 w-full sm:w-auto text-left lg:text-right">
            <span className="text-[10px] uppercase font-sans tracking-widest text-gray-400 block font-bold">
              選択中: シナリオ {activeScenario.id} ({activeScenario.name.replace(/シナリオ[A-D]:\s*/, '')})
            </span>
            <span className="text-3xl sm:text-4xl font-serif font-black text-white italic">
              ¥{formatCurrency(Math.round(activeScenario.predicted_div))}
            </span>
            <span className="text-xs font-sans text-orange-400 font-bold block mt-0.5">
              年換算利回り {activeScenario.annual_yield.toFixed(2)}%
            </span>
          </div>

          <button
            onClick={onOpenDilutionGuide}
            className="inline-flex items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-white hover:text-orange-400 transition-colors underline underline-offset-4 cursor-pointer"
          >
            <span>希薄化メカニズム・予測数理モデル解説</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Subtle decorative editorial watermark */}
      <div className="absolute -bottom-12 -right-12 w-48 h-48 border-[20px] border-white/5 rounded-full pointer-events-none"></div>
    </section>
  );
};
