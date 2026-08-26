import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../utils/calc';
import { RefreshCw, Coins, Shield, Plus, RotateCcw } from 'lucide-react';

interface CustomSimulatorProps {
  currentNav: number;
  currentR: number;
  targetYield: number;
}

export const CustomSimulator: React.FC<CustomSimulatorProps> = ({
  currentNav,
  currentR,
  targetYield,
}) => {
  const [simNav, setSimNav] = useState<number>(currentNav);
  const [simR, setSimR] = useState<number>(parseFloat(currentR.toFixed(3)));
  const [holdingUnits, setHoldingUnits] = useState<number>(1000); // 1000 units default

  // Sync state if initial props change
  useEffect(() => {
    setSimNav(currentNav);
  }, [currentNav]);

  useEffect(() => {
    setSimR(parseFloat(currentR.toFixed(3)));
  }, [currentR]);

  // Calculate dynamic NAV range: -30% to +30% based on currentNav
  const minNav = Math.round(currentNav * 0.7);
  const maxNav = Math.round(currentNav * 1.3);
  const navStep = Math.max(10, Math.round(currentNav * 0.002));
  const navChangePercent = currentNav > 0 ? ((simNav - currentNav) / currentNav) * 100 : 0;

  // Calculate prediction for custom values
  const theoretical = (simNav * targetYield) / 12;
  const predictedDivPer100 = simR > 0 ? theoretical / simR : theoretical;
  const monthlyYield = simNav > 0 ? (predictedDivPer100 / simNav) * 100 : 0;
  const annualYield = monthlyYield * 12;

  // Total payout for user's holding
  const validUnits = Math.max(0, holdingUnits || 0);
  const totalPayout = (predictedDivPer100 / 100) * validUnits;
  const taxRate = 0.05; // 外国税等 5%引
  const afterTaxPayout = totalPayout * (1 - taxRate);

  // Difference vs Previous 8/10 Dividend (900 yen per 100 units)
  const prevDiv100 = 900;
  const diffFromPrev = predictedDivPer100 - prevDiv100;
  const diffPercent = ((predictedDivPer100 - prevDiv100) / prevDiv100) * 100;

  // Percentage change for R (-30% to +30%)
  const rChangePercent = (simR - 1) * 100;

  const handleReset = () => {
    setSimNav(currentNav);
    setSimR(parseFloat(currentR.toFixed(3)));
  };

  const handleHoldingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) {
      setHoldingUnits(0);
    } else {
      setHoldingUnits(Math.max(0, val));
    }
  };

  const handleAddUnits = (delta: number) => {
    setHoldingUnits((prev) => Math.max(0, (prev || 0) + delta));
  };

  const handleClearUnits = () => {
    setHoldingUnits(0);
  };

  return (
    <section className="bg-[#1A1A1A] text-white border border-[#1A1A1A] p-5 sm:p-6 mb-6 shadow-xs relative overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 border-b border-white/15 pb-3 mb-5">
        <div>
          <span className="text-[10px] uppercase font-sans font-bold text-gray-400 tracking-widest block">
            Interactive Projection Sandbox // Custom Scenario Modeling
          </span>
          <h2 className="text-xl sm:text-2xl font-serif font-black tracking-tight text-white mt-0.5">
            カスタム分配金 & 受取額シミュレーター
          </h2>
        </div>
        <button
          onClick={handleReset}
          className="text-xs font-sans text-gray-300 hover:text-white flex items-center gap-1.5 self-start sm:self-auto cursor-pointer border border-white/20 px-3 py-1 bg-white/5 hover:bg-white/10 transition-colors uppercase tracking-wider font-bold"
        >
          <RefreshCw className="w-3 h-3" /> 現状値に復元
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Sliders & Holding input (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Slider 1: Estimated NAV (-30% to +30% from currentNav) */}
          <div className="bg-white/5 p-4 border border-white/10">
            <div className="flex justify-between items-center text-xs font-sans font-bold mb-1.5">
              <span className="text-gray-300 uppercase tracking-wider text-[10px]">① 決算直前の想定 基準価額 (NAV)</span>
              <span className="text-base font-serif font-bold text-orange-400 tabular-nums">
                ¥{formatCurrency(simNav)}
                <span className="text-xs font-mono font-bold text-orange-300 ml-1.5">
                  ({navChangePercent >= 0 ? '+' : ''}{navChangePercent.toFixed(1)}%)
                </span>
              </span>
            </div>
            <input
              type="range"
              min={minNav}
              max={maxNav}
              step={navStep}
              value={simNav}
              onChange={(e) => setSimNav(Number(e.target.value))}
              className="w-full h-1.5 bg-white/20 appearance-none cursor-pointer accent-orange-500"
            />
            <div className="flex justify-between text-[10px] font-mono text-gray-400 mt-1">
              <span>-30% (¥{formatCurrency(minNav)})</span>
              <span className="text-orange-400 font-bold">現在値 ¥{formatCurrency(currentNav)}</span>
              <span>+30% (¥{formatCurrency(maxNav)})</span>
            </div>
          </div>

          {/* Slider 2: Dilution R (-30% to +30%, 0.700x to 1.300x) */}
          <div className="bg-white/5 p-4 border border-white/10">
            <div className="flex justify-between items-center text-xs font-sans font-bold mb-1.5">
              <span className="text-gray-300 uppercase tracking-wider text-[10px]">② 想定 口数累積増加率 (R: 希薄化係数)</span>
              <span className="text-base font-serif font-bold text-orange-400 tabular-nums">
                {simR.toFixed(3)} 倍
                <span className="text-xs font-mono font-bold text-orange-300 ml-1.5">
                  ({rChangePercent >= 0 ? '+' : ''}{rChangePercent.toFixed(1)}%)
                </span>
              </span>
            </div>
            <input
              type="range"
              min="0.700"
              max="1.300"
              step="0.001"
              value={simR}
              onChange={(e) => setSimR(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-white/20 appearance-none cursor-pointer accent-orange-500"
            />
            <div className="flex justify-between text-[10px] font-mono text-gray-400 mt-1">
              <span>-30% (0.700x)</span>
              <span>±0% (1.000x)</span>
              <span className="text-orange-400 font-bold">
                現在値 {currentR.toFixed(3)}x ({((currentR - 1) * 100 >= 0 ? '+' : '')}{((currentR - 1) * 100).toFixed(1)}%)
              </span>
              <span>+30% (1.300x)</span>
            </div>
          </div>

          {/* Direct Input & Presets: Holding Units */}
          <div className="bg-white/5 p-4 border border-white/10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2.5">
              <label htmlFor="holding-units-input" className="text-gray-300 uppercase tracking-wider text-[10px] flex items-center gap-1 font-sans font-bold">
                <Coins className="w-3.5 h-3.5 text-orange-400" /> ③ あなたの保有口数（直接数値入力可能）
              </label>

              <div className="flex items-center gap-1.5">
                <input
                  id="holding-units-input"
                  type="number"
                  min="0"
                  max="10000000"
                  step="100"
                  value={holdingUnits === 0 ? '' : holdingUnits}
                  placeholder="0"
                  onChange={handleHoldingChange}
                  className="w-28 sm:w-36 px-2.5 py-1 text-right text-base font-serif font-bold text-orange-400 bg-black/40 border border-orange-500/50 focus:border-orange-400 focus:outline-hidden tabular-nums"
                />
                <span className="text-xs font-sans text-gray-300 font-bold">口</span>
              </div>
            </div>

            {/* Quick Additive Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap pt-2.5 border-t border-white/10">
              <span className="text-[10px] uppercase font-sans text-gray-400 mr-1 font-bold">加算クイック追加:</span>
              {[100, 500, 1000, 5000, 10000].map((addAmount) => (
                <button
                  key={addAmount}
                  type="button"
                  onClick={() => handleAddUnits(addAmount)}
                  className="flex items-center gap-0.5 text-xs px-2.5 py-1 font-mono font-bold cursor-pointer transition-colors bg-white/10 text-gray-200 border border-white/15 hover:bg-orange-600 hover:text-white hover:border-orange-500 active:scale-95"
                >
                  <Plus className="w-3 h-3 text-orange-400" />
                  <span>{formatCurrency(addAmount)}口</span>
                </button>
              ))}
              <button
                type="button"
                onClick={handleClearUnits}
                className="flex items-center gap-1 text-xs px-2 py-1 font-sans text-gray-400 hover:text-red-300 hover:bg-red-950/40 border border-white/10 transition-colors ml-auto cursor-pointer"
                title="保有口数を0にリセット"
              >
                <RotateCcw className="w-3 h-3" />
                <span>クリア</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Calculated Payout Result (5 cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between bg-white text-[#1A1A1A] p-5 border border-white/20 shadow-md">
          <div>
            <div className="flex justify-between items-center border-b border-black/10 pb-2 mb-3">
              <span className="text-[10px] uppercase font-sans font-bold text-gray-500 tracking-wider">
                Simulated Projection Payout
              </span>
              <span className="text-[10px] font-sans font-bold bg-[#1A1A1A] text-white px-2 py-0.5">
                {formatCurrency(validUnits)}口 保有時
              </span>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-sans text-gray-500 block">100口あたり予想分配金</span>
                <span className="text-xs font-mono font-bold text-orange-700 bg-orange-50 px-2 py-0.5 border border-orange-200">
                  {monthlyYield.toFixed(2)}% / 月
                </span>
              </div>
              <div className="text-3xl sm:text-4xl font-serif font-black text-[#1A1A1A] tracking-tight mt-0.5">
                ¥{formatCurrency(Math.round(predictedDivPer100))}
                <span className="text-sm font-sans font-normal text-gray-500 ml-1">/ 100口</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs font-sans">
                <span className={`font-bold ${diffFromPrev >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  前回(900円)比: {diffFromPrev >= 0 ? '+' : ''}{formatCurrency(Math.round(diffFromPrev))}円 ({diffPercent >= 0 ? '+' : ''}{diffPercent.toFixed(1)}%)
                </span>
                <span className="text-gray-400">|</span>
                <span className="font-mono text-gray-700 font-semibold">
                  月額分配率: <span className="text-orange-700 font-bold">{monthlyYield.toFixed(2)}%/月</span>
                </span>
              </div>
            </div>

            <div className="space-y-2 border-t border-black/10 pt-3">
              <div className="flex justify-between items-center text-xs font-sans">
                <span className="text-gray-600">税引前 受取予想額:</span>
                <span className="font-serif text-lg font-bold text-[#1A1A1A] tabular-nums">
                  ¥{formatCurrency(Math.round(totalPayout))}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs font-sans">
                <span className="text-gray-600">手取り予想額 (外国税等 5%引):</span>
                <span className="font-serif text-lg font-bold text-orange-700 tabular-nums">
                  ¥{formatCurrency(Math.round(afterTaxPayout))}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs font-sans text-gray-500">
                <span>年利換算 利回り:</span>
                <span className="font-mono font-bold text-[#1A1A1A]">{annualYield.toFixed(2)}% / 年</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-black/10 text-[10px] font-sans text-gray-500 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Shield className="w-3 h-3 text-gray-400" /> ※NISA成長投資枠なら非課税 (税引前全額受取)
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
