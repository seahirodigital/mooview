import React from 'react';
import { X, BookOpen, AlertCircle, CheckCircle2, TrendingUp, Info } from 'lucide-react';

interface DilutionGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DilutionGuideModal: React.FC<DilutionGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-[#FDFCFB] border-2 border-[#1A1A1A] max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Modal Header (Editorial Ink) */}
        <div className="sticky top-0 bg-[#1A1A1A] text-white px-6 py-4 border-b border-black flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-orange-600 text-white flex items-center justify-center font-bold">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[9px] uppercase font-sans font-bold text-orange-400 tracking-widest block">
                Educational Special Report
              </span>
              <h3 className="text-base sm:text-lg font-serif font-bold text-white tracking-tight">
                563A 分配金希薄化メカニズムと数理予測モデル解説
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 text-sm font-sans text-gray-800 leading-relaxed">
          {/* Section 1: Core Mechanics */}
          <div className="bg-white p-4 border border-black/15">
            <h4 className="font-serif font-bold text-base text-[#1A1A1A] flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-orange-600" />
              1. ETFにおける分配金希薄化（減額）の基本構造
            </h4>
            <p className="text-xs sm:text-sm text-gray-700 mb-2">
              国内ETFには投資信託のような「収益調整金」などの平準化バッファーが存在しません。
              そのため、<strong>「過去1ヶ月間に稼ぎ出したオプションプレミアム原資（分子）」</strong>を、<strong>「決算日時点の総発行口数（分母）」</strong>で一律に割り算して分配します。
            </p>
            <div className="p-3 bg-[#F9F7F2] border border-black/10 font-mono text-xs text-[#1A1A1A] font-bold">
              100口あたり分配金 ＝ 運用で得られた分配金原資合計 ÷ 決算日の総発行口数 × 100
            </div>
          </div>

          {/* Section 2: Previous Distribution History */}
          <div>
            <h4 className="font-serif font-bold text-base text-[#1A1A1A] mb-3">2. 過去の決算実績の振り返り</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 border border-emerald-300 bg-emerald-50/50">
                <div className="font-bold text-emerald-900 text-xs flex items-center gap-1.5 mb-1 font-sans">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  第1回決算 (2026/07/10): 1,400円
                </div>
                <p className="text-xs text-gray-700">
                  4/23上場から<strong>約2.5ヶ月分の運用原資</strong>がプールされていたため、初回の分配金は1,400円と一時的に高額となりました。
                </p>
              </div>

              <div className="p-3.5 border border-red-300 bg-red-50/50">
                <div className="font-bold text-red-900 text-xs flex items-center gap-1.5 mb-1 font-sans">
                  <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                  第2回決算 (2026/08/10): 900円 (大幅減額)
                </div>
                <p className="text-xs text-gray-700">
                  通常1ヶ月分の運用期間に対し、投資家の買い殺到で総口数が<strong>約31.6万口→約48.4万口（約1.53倍・+53%増）</strong>へ急拡大。分子の原資増加が追いつかず、強烈な希薄化（減額）が発生しました。
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Next Distribution Rebound */}
          <div className="bg-orange-50/50 p-4 border border-orange-200">
            <h4 className="font-serif font-bold text-base text-orange-950 flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-orange-600" />
              3. 次回（9/10）はなぜ1,270円〜1,291円へ回復するのか？
            </h4>
            <p className="text-xs sm:text-sm text-gray-800 mb-2">
              8/10決算以降の直近データでは、総発行口数が 490,799口 → 496,798口（<strong>わずか+1.2%増、R=1.012</strong>）とほぼ横ばいに落ち着いています。
            </p>
            <ul className="list-disc list-inside text-xs sm:text-sm text-gray-700 space-y-1">
              <li>資金流入が安定したため、<strong>希薄化の悪影響はすでにほぼ消失</strong>しています。</li>
              <li>増えた純資産（520億円規模）で1ヶ月間フル運用され、オプションプレミアムが均等に積み上がっています。</li>
              <li>したがって、本来の設計目標である<strong>年利15%水準（月間約1,311円）</strong>へ向かって収束します。</li>
            </ul>
          </div>

          {/* Section 4: Mathematical Formula */}
          <div>
            <h4 className="font-serif font-bold text-base text-[#1A1A1A] mb-2">4. 予測算式モデルのステップ</h4>
            <div className="space-y-2 text-xs">
              <div className="p-3 bg-white border border-black/10">
                <span className="font-bold text-[#1A1A1A] block">ステップ1: 月間の理論目標分配金 (希薄化なし)</span>
                <p className="text-gray-700 font-mono mt-1">
                  ＝ (直近基準価額 × 100口) × 15% ÷ 12ヶ月 ＝ (104,879円 × 15%) ÷ 12 ＝ <strong>約1,311円</strong>
                </p>
              </div>
              <div className="p-3 bg-white border border-black/10">
                <span className="font-bold text-[#1A1A1A] block">ステップ2: 口数累積増加率 (R) による割返し補正</span>
                <p className="text-gray-700 font-mono mt-1">
                  ＝ 理論目標値 ÷ R ＝ 1,311円 ÷ 1.015 (想定中心値) ＝ <strong>約1,291円</strong>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-[#F9F7F2] px-6 py-3 border-t border-black/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-[#1A1A1A] hover:bg-orange-600 text-white font-sans text-xs font-bold uppercase tracking-widest cursor-pointer transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
