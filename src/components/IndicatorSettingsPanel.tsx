import { SymbolIndicatorSettings } from '../types';
import { SlidersHorizontal, Sliders, CheckCircle, RotateCcw } from 'lucide-react';

interface IndicatorSettingsPanelProps {
  settings: SymbolIndicatorSettings;
  onChange: (updated: SymbolIndicatorSettings) => void;
  onReset: () => void;
}

export function IndicatorSettingsPanel({ settings, onChange, onReset }: IndicatorSettingsPanelProps) {
  const handleToggle = (key: 'ma' | 'ema' | 'boll' | 'rsi' | 'macd') => {
    const updated = {
      ...settings,
      indicators: {
        ...settings.indicators,
        [key]: {
          ...settings.indicators[key],
          enabled: !settings.indicators[key].enabled,
        }
      }
    };
    onChange(updated);
  };

  const handleNestedChange = (
    key: 'ma' | 'ema' | 'boll' | 'rsi' | 'macd',
    field: string,
    value: any
  ) => {
    const updated = {
      ...settings,
      indicators: {
        ...settings.indicators,
        [key]: {
          ...settings.indicators[key],
          [field]: value,
        }
      }
    };
    onChange(updated);
  };

  const { ma, ema, boll, rsi, macd } = settings.indicators;

  return (
    <div className="space-y-4 text-xs">
      
      {/* SECTION HEADER */}
      <div className="flex items-center justify-between pb-1 border-b border-[#21263d]">
        <span className="font-bold text-gray-300">インジケーター設定 ({settings.symbol})</span>
        <button 
          onClick={onReset}
          className="text-[10px] text-gray-400 hover:text-red-400 flex items-center transition-colors font-semibold"
          title="数値を標準価格に戻します"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          標準設定に戻す
        </button>
      </div>

      {/* 1. SIMPLE MOVING AVERAGE (SMA) */}
      <div className="bg-[#141624] p-3 rounded-lg border border-[#21263d] space-y-2">
        <div className="flex items-center justify-between">
          <label className="font-bold text-gray-200 select-none cursor-pointer flex items-center space-x-2">
            <span className="w-1.5 h-3 inline-block rounded-sm" style={{ backgroundColor: ma.color1 }}></span>
            <span>単純移動平均線 (SMA)</span>
          </label>
          <input 
            type="checkbox" 
            checked={ma.enabled}
            onChange={() => handleToggle('ma')}
            className="rounded border-[#2d3552] text-blue-600 focus:ring-0 cursor-pointer w-3.5 h-3.5"
          />
        </div>
        {ma.enabled && (
          <div className="grid grid-cols-1 gap-2 pt-1 border-t border-gray-800/50 mt-1">
            <div className="grid grid-cols-2 gap-2 items-center">
              <span className="text-gray-400">短期期間 (Period 1):</span>
              <input 
                type="number" 
                value={ma.period1}
                min={2}
                max={200}
                onChange={(e) => handleNestedChange('ma', 'period1', Math.max(1, parseInt(e.target.value) || 5))}
                className="bg-[#1c1f35] border border-[#2c3552] rounded text-white px-1.5 py-0.5 text-right w-full font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
              <span className="text-gray-400">中期期間 (Period 2):</span>
              <input 
                type="number" 
                value={ma.period2}
                min={2}
                max={200}
                onChange={(e) => handleNestedChange('ma', 'period2', Math.max(1, parseInt(e.target.value) || 25))}
                className="bg-[#1c1f35] border border-[#2c3552] rounded text-white px-1.5 py-0.5 text-right w-full font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
              <span className="text-gray-400">長期期間 (Period 3):</span>
              <input 
                type="number" 
                value={ma.period3}
                min={2}
                max={300}
                onChange={(e) => handleNestedChange('ma', 'period3', Math.max(1, parseInt(e.target.value) || 50))}
                className="bg-[#1c1f35] border border-[#2c3552] rounded text-white px-1.5 py-0.5 text-right w-full font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. EXPONENTIAL MOVING AVERAGE (EMA) */}
      <div className="bg-[#141624] p-3 rounded-lg border border-[#21263d] space-y-2">
        <div className="flex items-center justify-between">
          <label className="font-bold text-gray-200 select-none cursor-pointer flex items-center space-x-2">
            <span className="w-1.5 h-3 inline-block rounded-sm" style={{ backgroundColor: ema.color1 }}></span>
            <span>指数平滑移動平均線 (EMA)</span>
          </label>
          <input 
            type="checkbox" 
            checked={ema.enabled}
            onChange={() => handleToggle('ema')}
            className="rounded border-[#2d3552] text-blue-600 focus:ring-0 cursor-pointer w-3.5 h-3.5"
          />
        </div>
        {ema.enabled && (
          <div className="grid grid-cols-1 gap-2 pt-1 border-t border-gray-800/50 mt-1">
            <div className="grid grid-cols-2 gap-2 items-center">
              <span className="text-gray-400">短期EMA (Period 1):</span>
              <input 
                type="number" 
                value={ema.period1}
                min={2}
                max={200}
                onChange={(e) => handleNestedChange('ema', 'period1', Math.max(1, parseInt(e.target.value) || 9))}
                className="bg-[#1c1f35] border border-[#2c3552] rounded text-white px-1.5 py-0.5 text-right w-full font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
              <span className="text-gray-400">長期EMA (Period 2):</span>
              <input 
                type="number" 
                value={ema.period2}
                min={2}
                max={200}
                onChange={(e) => handleNestedChange('ema', 'period2', Math.max(1, parseInt(e.target.value) || 26))}
                className="bg-[#1c1f35] border border-[#2c3552] rounded text-white px-1.5 py-0.5 text-right w-full font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. BOLLINGER BANDS (BOLL) */}
      <div className="bg-[#141624] p-3 rounded-lg border border-[#21263d] space-y-2">
        <div className="flex items-center justify-between">
          <label className="font-bold text-gray-200 select-none cursor-pointer flex items-center space-x-2">
            <span className="w-1.5 h-3 inline-block rounded-sm" style={{ backgroundColor: boll.color }}></span>
            <span>ボリンジャーバンド (BOLL)</span>
          </label>
          <input 
            type="checkbox" 
            checked={boll.enabled}
            onChange={() => handleToggle('boll')}
            className="rounded border-[#2d3552] text-blue-600 focus:ring-0 cursor-pointer w-3.5 h-3.5"
          />
        </div>
        {boll.enabled && (
          <div className="grid grid-cols-1 gap-2 pt-1 border-t border-gray-800/50 mt-1">
            <div className="grid grid-cols-2 gap-2 items-center">
              <span className="text-gray-400">期間 (Period):</span>
              <input 
                type="number" 
                value={boll.period}
                min={2}
                max={150}
                onChange={(e) => handleNestedChange('boll', 'period', Math.max(1, parseInt(e.target.value) || 20))}
                className="bg-[#1c1f35] border border-[#2c3552] rounded text-white px-1.5 py-0.5 text-right w-full font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
              <span className="text-gray-400">標準偏差 (StdDev / σ):</span>
              <input 
                type="number" 
                value={boll.stdDev}
                step="0.5"
                min="0.5"
                max="5"
                onChange={(e) => handleNestedChange('boll', 'stdDev', Math.max(0.1, parseFloat(e.target.value) || 2))}
                className="bg-[#1c1f35] border border-[#2c3552] rounded text-white px-1.5 py-0.5 text-right w-full font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* 4. RELATIVE STRENGTH INDEX (RSI) */}
      <div className="bg-[#141624] p-3 rounded-lg border border-[#21263d] space-y-2">
        <div className="flex items-center justify-between">
          <label className="font-bold text-gray-200 select-none cursor-pointer flex items-center space-x-2">
            <span className="w-1.5 h-3 inline-block rounded-sm" style={{ backgroundColor: rsi.color }}></span>
            <span>RSIオシレーター</span>
          </label>
          <input 
            type="checkbox" 
            checked={rsi.enabled}
            onChange={() => handleToggle('rsi')}
            className="rounded border-[#2d3552] text-blue-600 focus:ring-0 cursor-pointer w-3.5 h-3.5"
          />
        </div>
        {rsi.enabled && (
          <div className="grid grid-cols-1 gap-2 pt-1 border-t border-gray-800/50 mt-1">
            <div className="grid grid-cols-2 gap-2 items-center">
              <span className="text-gray-400">期間 (Period):</span>
              <input 
                type="number" 
                value={rsi.period}
                min={2}
                max={100}
                onChange={(e) => handleNestedChange('rsi', 'period', Math.max(1, parseInt(e.target.value) || 14))}
                className="bg-[#1c1f35] border border-[#2c3552] rounded text-white px-1.5 py-0.5 text-right w-full font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
              <span className="text-gray-400">買われすぎ境界 (Ok):</span>
              <input 
                type="number" 
                value={rsi.overbought}
                min={51}
                max={99}
                onChange={(e) => handleNestedChange('rsi', 'overbought', Math.max(1, Math.min(100, parseInt(e.target.value) || 70)))}
                className="bg-[#1c1f35] border border-[#2c3552] rounded text-white px-1.5 py-0.5 text-right w-full font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
              <span className="text-gray-400">売られすぎ境界 (Os):</span>
              <input 
                type="number" 
                value={rsi.oversold}
                min={1}
                max={49}
                onChange={(e) => handleNestedChange('rsi', 'oversold', Math.max(1, Math.min(100, parseInt(e.target.value) || 30)))}
                className="bg-[#1c1f35] border border-[#2c3552] rounded text-white px-1.5 py-0.5 text-right w-full font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* 5. MACD (MOVING AVERAGE CONVERGENCE DIVERGENCE) */}
      <div className="bg-[#141624] p-3 rounded-lg border border-[#21263d] space-y-2">
        <div className="flex items-center justify-between">
          <label className="font-bold text-gray-200 select-none cursor-pointer flex items-center space-x-2">
            <span className="w-1.5 h-3 inline-block rounded-sm" style={{ backgroundColor: macd.colorMacd }}></span>
            <span>MACD</span>
          </label>
          <input 
            type="checkbox" 
            checked={macd.enabled}
            onChange={() => handleToggle('macd')}
            className="rounded border-[#2d3552] text-blue-600 focus:ring-0 cursor-pointer w-3.5 h-3.5"
          />
        </div>
        {macd.enabled && (
          <div className="grid grid-cols-1 gap-2 pt-1 border-t border-gray-800/50 mt-1">
            <div className="grid grid-cols-2 gap-2 items-center">
              <span className="text-gray-400">短期高速EMA (Fast):</span>
              <input 
                type="number" 
                value={macd.fast}
                min={2}
                max={100}
                onChange={(e) => handleNestedChange('macd', 'fast', Math.max(1, parseInt(e.target.value) || 12))}
                className="bg-[#1c1f35] border border-[#2c3552] rounded text-white px-1.5 py-0.5 text-right w-full font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
              <span className="text-gray-400">長期低速EMA (Slow):</span>
              <input 
                type="number" 
                value={macd.slow}
                min={2}
                max={200}
                onChange={(e) => handleNestedChange('macd', 'slow', Math.max(1, parseInt(e.target.value) || 26))}
                className="bg-[#1c1f35] border border-[#2c3552] rounded text-white px-1.5 py-0.5 text-right w-full font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
              <span className="text-gray-400">マイルシグナル (Signal):</span>
              <input 
                type="number" 
                value={macd.signal}
                min={2}
                max={100}
                onChange={(e) => handleNestedChange('macd', 'signal', Math.max(1, parseInt(e.target.value) || 9))}
                className="bg-[#1c1f35] border border-[#2c3552] rounded text-white px-1.5 py-0.5 text-right w-full font-mono"
              />
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
