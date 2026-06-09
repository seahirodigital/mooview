import { useState, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { SymbolIndicatorSettings } from '../types';

interface IndicatorSettingsPanelProps {
  settings: SymbolIndicatorSettings;
  onChange: (updated: SymbolIndicatorSettings) => void;
  onReset: () => void;
}

type IndicatorKey = keyof SymbolIndicatorSettings['indicators'];

const COLOR_PALETTE = [
  '#e7c039',
  '#20aced',
  '#e152f2',
  '#f85f73',
  '#00e575',
  '#6c5dd3',
  '#f3a14b',
  '#2d8cf0',
  '#ff9900',
  '#26a69a',
  '#ef5350',
  '#ffffff',
];

interface ColorButtonProps {
  id: string;
  label: string;
  color: string;
  openPicker: string | null;
  setOpenPicker: (id: string | null) => void;
  onChange: (color: string) => void;
}

function ColorButton({
  id,
  label,
  color,
  openPicker,
  setOpenPicker,
  onChange,
}: ColorButtonProps) {
  const isOpen = openPicker === id;
  const openUpward = id.startsWith('macd') || id.startsWith('vrvp');

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpenPicker(isOpen ? null : id)}
        className="w-4 h-4 rounded-sm border border-white/35 hover:border-white transition"
        style={{ backgroundColor: color }}
        aria-label={`${label}の色を選択`}
        title={`${label}: ${color}`}
      />
      {isOpen && (
        <span className={`absolute right-0 z-50 grid grid-cols-6 gap-1 bg-[#0b0d16] border border-[#34394c] p-2 shadow-2xl min-w-[142px] ${
          openUpward ? 'bottom-6' : 'top-6'
        }`}>
          {COLOR_PALETTE.map((paletteColor) => (
            <button
              type="button"
              key={paletteColor}
              onClick={() => {
                onChange(paletteColor);
                setOpenPicker(null);
              }}
              className={`w-4 h-4 rounded-sm border ${
                color.toLowerCase() === paletteColor.toLowerCase()
                  ? 'border-white ring-1 ring-blue-400'
                  : 'border-white/20'
              }`}
              style={{ backgroundColor: paletteColor }}
              aria-label={`${label}を${paletteColor}に変更`}
              title={paletteColor}
            />
          ))}
          <label
            className="relative col-span-6 h-5 border border-[#34394c] cursor-pointer overflow-hidden"
            title="任意の色を選択"
          >
            <input
              type="color"
              value={color}
              onChange={(event) => {
                onChange(event.target.value);
                setOpenPicker(null);
              }}
              className="absolute inset-[-6px] w-[calc(100%+12px)] h-8 cursor-pointer"
              aria-label={`${label}の任意色`}
            />
          </label>
        </span>
      )}
    </span>
  );
}

interface NumberRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

function NumberRow({ label, value, min, max, step = 1, onChange }: NumberRowProps) {
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-2 min-h-7 px-2 border-t border-[#222634]">
      <span className="text-[10px] text-gray-400 truncate">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          if (Number.isFinite(nextValue)) {
            onChange(Math.max(min, Math.min(max, nextValue)));
          }
        }}
        className="h-5 bg-[#171a27] border border-[#303548] text-white text-right text-[10px] font-mono px-1 outline-none focus:border-blue-500"
      />
    </label>
  );
}

interface IndicatorHeaderProps {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function IndicatorHeader({ label, enabled, onToggle, children }: IndicatorHeaderProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center min-h-8 px-2 bg-[#11141f]">
      <span className="text-[11px] font-bold text-gray-200 truncate">{label}</span>
      <span className="flex items-center gap-1.5">
        {children}
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggle}
          className="w-3.5 h-3.5 rounded border-[#394057] text-blue-600 focus:ring-0 cursor-pointer"
          aria-label={`${label}を表示`}
        />
      </span>
    </div>
  );
}

export function IndicatorSettingsPanel({
  settings,
  onChange,
  onReset,
}: IndicatorSettingsPanelProps) {
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const { ma, ema, boll, rsi, macd, vrvp } = settings.indicators;

  const handleToggle = (key: IndicatorKey) => {
    onChange({
      ...settings,
      indicators: {
        ...settings.indicators,
        [key]: {
          ...settings.indicators[key],
          enabled: !settings.indicators[key].enabled,
        },
      },
    });
  };

  const handleNestedChange = <K extends IndicatorKey>(
    key: K,
    field: keyof SymbolIndicatorSettings['indicators'][K],
    value: SymbolIndicatorSettings['indicators'][K][keyof SymbolIndicatorSettings['indicators'][K]],
  ) => {
    onChange({
      ...settings,
      indicators: {
        ...settings.indicators,
        [key]: {
          ...settings.indicators[key],
          [field]: value,
        },
      },
    });
  };

  const colorButton = (
    id: string,
    label: string,
    color: string,
    onColorChange: (color: string) => void,
  ) => (
    <ColorButton
      id={id}
      label={label}
      color={color}
      openPicker={openPicker}
      setOpenPicker={setOpenPicker}
      onChange={onColorChange}
    />
  );

  return (
    <div className="text-xs border border-[#2a2e3d] bg-[#0e111b]">
      <div className="flex items-center justify-between h-8 px-2 border-b border-[#2a2e3d]">
        <span className="font-bold text-gray-200">{settings.symbol}</span>
        <button
          type="button"
          onClick={onReset}
          className="text-[9px] text-gray-500 hover:text-red-300 flex items-center gap-1"
          title="標準設定に戻す"
        >
          <RotateCcw className="w-3 h-3" />
          リセット
        </button>
      </div>

      <section className="border-b border-[#2a2e3d]">
        <IndicatorHeader label="SMA" enabled={ma.enabled} onToggle={() => handleToggle('ma')}>
          {colorButton('ma-1', 'SMA短期線', ma.color1, (color) => handleNestedChange('ma', 'color1', color))}
          {colorButton('ma-2', 'SMA中期線', ma.color2, (color) => handleNestedChange('ma', 'color2', color))}
          {colorButton('ma-3', 'SMA長期線', ma.color3, (color) => handleNestedChange('ma', 'color3', color))}
        </IndicatorHeader>
        {ma.enabled && (
          <>
            <NumberRow label="短期" value={ma.period1} min={2} max={200} onChange={(value) => handleNestedChange('ma', 'period1', value)} />
            <NumberRow label="中期" value={ma.period2} min={2} max={200} onChange={(value) => handleNestedChange('ma', 'period2', value)} />
            <NumberRow label="長期" value={ma.period3} min={2} max={300} onChange={(value) => handleNestedChange('ma', 'period3', value)} />
          </>
        )}
      </section>

      <section className="border-b border-[#2a2e3d]">
        <IndicatorHeader label="EMA" enabled={ema.enabled} onToggle={() => handleToggle('ema')}>
          {colorButton('ema-1', 'EMA短期線', ema.color1, (color) => handleNestedChange('ema', 'color1', color))}
          {colorButton('ema-2', 'EMA長期線', ema.color2, (color) => handleNestedChange('ema', 'color2', color))}
        </IndicatorHeader>
        {ema.enabled && (
          <>
            <NumberRow label="短期" value={ema.period1} min={2} max={200} onChange={(value) => handleNestedChange('ema', 'period1', value)} />
            <NumberRow label="長期" value={ema.period2} min={2} max={200} onChange={(value) => handleNestedChange('ema', 'period2', value)} />
          </>
        )}
      </section>

      <section className="border-b border-[#2a2e3d]">
        <IndicatorHeader label="ボリンジャーバンド" enabled={boll.enabled} onToggle={() => handleToggle('boll')}>
          {colorButton('boll', 'バンド色', boll.color, (color) => handleNestedChange('boll', 'color', color))}
        </IndicatorHeader>
        {boll.enabled && (
          <>
            <NumberRow label="期間" value={boll.period} min={2} max={150} onChange={(value) => handleNestedChange('boll', 'period', value)} />
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 min-h-8 px-2 border-t border-[#222634]">
              <span className="text-[10px] text-gray-400">表示するσ</span>
              <span className="flex items-center gap-2">
                {[1, 2, 3].map((level) => (
                  <label key={level} className="flex items-center gap-1 text-[10px] text-gray-300">
                    <input
                      type="checkbox"
                      checked={boll.levels.includes(level)}
                      onChange={() => {
                        if (boll.levels.includes(level) && boll.levels.length === 1) {
                          return;
                        }
                        const nextLevels = boll.levels.includes(level)
                          ? boll.levels.filter((currentLevel) => currentLevel !== level)
                          : [...boll.levels, level].sort((a, b) => a - b);
                        handleNestedChange('boll', 'levels', nextLevels);
                      }}
                      className="w-3 h-3 rounded border-[#394057] text-blue-600 focus:ring-0"
                    />
                    {level}σ
                  </label>
                ))}
              </span>
            </div>
          </>
        )}
      </section>

      <section className="border-b border-[#2a2e3d]">
        <IndicatorHeader label="RSI" enabled={rsi.enabled} onToggle={() => handleToggle('rsi')}>
          {colorButton('rsi', 'RSI線', rsi.color, (color) => handleNestedChange('rsi', 'color', color))}
        </IndicatorHeader>
        {rsi.enabled && (
          <>
            <NumberRow label="期間" value={rsi.period} min={2} max={100} onChange={(value) => handleNestedChange('rsi', 'period', value)} />
            <NumberRow label="買われすぎ" value={rsi.overbought} min={51} max={99} onChange={(value) => handleNestedChange('rsi', 'overbought', value)} />
            <NumberRow label="売られすぎ" value={rsi.oversold} min={1} max={49} onChange={(value) => handleNestedChange('rsi', 'oversold', value)} />
          </>
        )}
      </section>

      <section className="border-b border-[#2a2e3d]">
        <IndicatorHeader label="MACD" enabled={macd.enabled} onToggle={() => handleToggle('macd')}>
          {colorButton('macd', 'MACD線', macd.colorMacd, (color) => handleNestedChange('macd', 'colorMacd', color))}
          {colorButton('macd-signal', 'シグナル線', macd.colorSignal, (color) => handleNestedChange('macd', 'colorSignal', color))}
          {colorButton('macd-up', '上昇バー', macd.colorHistUp, (color) => handleNestedChange('macd', 'colorHistUp', color))}
          {colorButton('macd-down', '下降バー', macd.colorHistDown, (color) => handleNestedChange('macd', 'colorHistDown', color))}
        </IndicatorHeader>
        {macd.enabled && (
          <>
            <NumberRow label="Fast" value={macd.fast} min={2} max={100} onChange={(value) => handleNestedChange('macd', 'fast', value)} />
            <NumberRow label="Slow" value={macd.slow} min={2} max={200} onChange={(value) => handleNestedChange('macd', 'slow', value)} />
            <NumberRow label="Signal" value={macd.signal} min={2} max={100} onChange={(value) => handleNestedChange('macd', 'signal', value)} />
          </>
        )}
      </section>

      <section>
        <IndicatorHeader label="VRVP" enabled={vrvp.enabled} onToggle={() => handleToggle('vrvp')}>
          {colorButton('vrvp-up', 'VRVP上昇出来高', vrvp.colorUp, (color) => handleNestedChange('vrvp', 'colorUp', color))}
          {colorButton('vrvp-down', 'VRVP下降出来高', vrvp.colorDown, (color) => handleNestedChange('vrvp', 'colorDown', color))}
          {colorButton('vrvp-poc', 'VRVP POC', vrvp.colorPoc, (color) => handleNestedChange('vrvp', 'colorPoc', color))}
        </IndicatorHeader>
        {vrvp.enabled && (
          <>
            <NumberRow label="価格帯数" value={vrvp.rows} min={8} max={80} onChange={(value) => handleNestedChange('vrvp', 'rows', value)} />
            <NumberRow label="表示幅 (%)" value={vrvp.widthPct} min={8} max={45} onChange={(value) => handleNestedChange('vrvp', 'widthPct', value)} />
          </>
        )}
      </section>
    </div>
  );
}
