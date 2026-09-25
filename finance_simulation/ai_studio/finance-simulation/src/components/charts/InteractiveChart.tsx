import React, { useState } from 'react';

// Formatter helper
export const formatYen = (manYen: number): string => {
  if (Math.abs(manYen) >= 10000) {
    const oku = (manYen / 10000).toFixed(2);
    return `${oku}億円`;
  }
  return `${Math.round(manYen).toLocaleString()}万円`;
};

// 1. Simulation Line Chart (Bull, Base, Bear)
export interface SimulationDataPoint {
  year: number;
  label?: string;
  bull: number;
  base: number;
  bear: number;
  invested?: number;
}

interface SimulationLineChartProps {
  data: SimulationDataPoint[];
  targetAmount: number; // in 万円
}

export const SimulationLineChart: React.FC<SimulationLineChartProps> = ({ data, targetAmount }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  const width = 800;
  const height = 360;
  const padding = { top: 30, right: 30, bottom: 40, left: 60 };

  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // Max value calculation
  const maxVal = Math.max(
    ...data.map(d => Math.max(d.bull, d.base, d.bear)),
    targetAmount * 1.15,
    10000
  );
  const minVal = 0;

  const getX = (index: number) => padding.left + (index / (data.length - 1)) * graphWidth;
  const getY = (val: number) => padding.top + graphHeight - ((val - minVal) / (maxVal - minVal)) * graphHeight;

  // Paths
  const createPath = (key: 'bull' | 'base' | 'bear') => {
    return data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d[key])}`).join(' ');
  };

  const createAreaPath = (key: 'bull' | 'base' | 'bear') => {
    const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d[key])}`).join(' ');
    const lastX = getX(data.length - 1);
    const firstX = getX(0);
    const bottomY = getY(0);
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  // Y-axis grid ticks (5 steps)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const val = minVal + pct * (maxVal - minVal);
    return { val, y: getY(val) };
  });

  const activePoint = hoverIndex !== null ? data[hoverIndex] : data[data.length - 1];

  return (
    <div className="w-full bg-[#f5f5f7]/80 dark:bg-white/5 border border-black/10 dark:border-white/10 p-6 sm:p-8 select-none transition-colors">
      {/* Chart Top Legend & Value Display (Apple Minimalist) */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 text-xs">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#0071e3] inline-block"></span>
            <span className="text-[#1d1d1f]/70 dark:text-[#f5f5f7]/70 font-medium">Bull (+15%)</span>
            <span className="font-mono text-[#0071e3] dark:text-[#2997ff] font-semibold tabular-nums">
              {formatYen(activePoint.bull)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#34c759] inline-block"></span>
            <span className="text-[#1d1d1f]/70 dark:text-[#f5f5f7]/70 font-medium">Base (+7%)</span>
            <span className="font-mono text-[#34c759] font-semibold tabular-nums">
              {formatYen(activePoint.base)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#ff3b30] inline-block"></span>
            <span className="text-[#1d1d1f]/70 dark:text-[#f5f5f7]/70 font-medium">Bear (-5%)</span>
            <span className="font-mono text-[#ff3b30] font-semibold tabular-nums">
              {formatYen(activePoint.bear)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono font-medium px-3 py-1 border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/10 text-[#1d1d1f] dark:text-[#f5f5f7]">
          <span>目標: {formatYen(targetAmount)}</span>
        </div>
      </div>

      {/* SVG Viewport */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible cursor-crosshair"
          onMouseLeave={() => setHoverIndex(null)}
          onTouchEnd={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="bullGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0071e3" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#0071e3" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34c759" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#34c759" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {yTicks.map((t, idx) => (
            <g key={idx}>
              <line
                x1={padding.left}
                y1={t.y}
                x2={width - padding.right}
                y2={t.y}
                stroke="currentColor"
                className="text-black/10 dark:text-white/10"
                strokeDasharray="2 3"
              />
              <text
                x={padding.left - 10}
                y={t.y + 4}
                textAnchor="end"
                className="text-[10px] fill-[#1d1d1f]/50 dark:fill-[#f5f5f7]/50 font-mono"
              >
                {formatYen(t.val)}
              </text>
            </g>
          ))}

          {/* Target Amount Line */}
          {targetAmount <= maxVal && (
            <g>
              <line
                x1={padding.left}
                y1={getY(targetAmount)}
                x2={width - padding.right}
                y2={getY(targetAmount)}
                stroke="#ff9500"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <text
                x={width - padding.right - 4}
                y={getY(targetAmount) - 6}
                textAnchor="end"
                className="text-[10px] fill-[#ff9500] font-mono font-medium"
              >
                FIRE目標 {formatYen(targetAmount)}
              </text>
            </g>
          )}

          {/* Areas */}
          <path d={createAreaPath('bull')} fill="url(#bullGrad)" />
          <path d={createAreaPath('base')} fill="url(#baseGrad)" />

          {/* Scenario Lines */}
          <path
            d={createPath('bull')}
            fill="none"
            stroke="#0071e3"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d={createPath('base')}
            fill="none"
            stroke="#34c759"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d={createPath('bear')}
            fill="none"
            stroke="#ff3b30"
            strokeWidth="2"
            strokeDasharray="5 3"
            strokeLinecap="round"
          />

          {/* X Axis labels */}
          {data.map((d, i) => {
            if (i % Math.ceil(data.length / 6) === 0 || i === data.length - 1) {
              return (
                <text
                  key={i}
                  x={getX(i)}
                  y={height - 12}
                  textAnchor="middle"
                  className="text-[11px] fill-[#1d1d1f]/60 dark:fill-[#f5f5f7]/60 font-mono"
                >
                  {d.label || `${d.year}年目`}
                </text>
              );
            }
            return null;
          })}

          {/* Crosshair on active hover */}
          {hoverIndex !== null && (
            <g>
              <line
                x1={getX(hoverIndex)}
                y1={padding.top}
                x2={getX(hoverIndex)}
                y2={height - padding.bottom}
                stroke="#8e8e93"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle
                cx={getX(hoverIndex)}
                cy={getY(data[hoverIndex].bull)}
                r="4.5"
                fill="#0071e3"
                stroke="#ffffff"
                strokeWidth="2"
              />
              <circle
                cx={getX(hoverIndex)}
                cy={getY(data[hoverIndex].base)}
                r="5.5"
                fill="#34c759"
                stroke="#ffffff"
                strokeWidth="2"
              />
              <circle
                cx={getX(hoverIndex)}
                cy={getY(data[hoverIndex].bear)}
                r="4"
                fill="#ff3b30"
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Hover interaction transparent bars */}
          {data.map((_, i) => (
            <rect
              key={i}
              x={getX(i) - graphWidth / (data.length * 2)}
              y={padding.top}
              width={graphWidth / data.length}
              height={graphHeight}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
              onTouchMove={() => setHoverIndex(i)}
            />
          ))}
        </svg>
      </div>

      <div className="flex items-center justify-between text-[11px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50 mt-4 px-1">
        <span>※ 過去実績と複利計算に基づく3シナリオ比較推移</span>
        <span className="font-mono">{activePoint.label || `${activePoint.year}年目`}</span>
      </div>
    </div>
  );
};

export const SimulationChart = SimulationLineChart;

// 2. Dividend Coverage Semi-Circle Gauge Meter (Apple Minimalist)
interface CoverageGaugeProps {
  coverageRate: number; // e.g. 90.9
  monthlyDividend: number; // in 万円
  monthlyExpenses: number; // in 万円
}

export const CoverageGauge: React.FC<CoverageGaugeProps> = ({
  coverageRate,
  monthlyDividend,
  monthlyExpenses,
}) => {
  const radius = 80;
  const strokeWidth = 14;
  const circumference = Math.PI * radius;
  const progressPercent = Math.min(coverageRate, 100) / 100;
  const strokeDashoffset = circumference - progressPercent * circumference;

  const isAchieved = coverageRate >= 100;

  return (
    <div className="bg-[#f5f5f7]/80 dark:bg-white/5 border border-black/10 dark:border-white/10 p-6 sm:p-8 flex flex-col items-center relative overflow-hidden transition-colors">
      <div className="w-full flex items-center justify-between text-xs mb-3">
        <span className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">配当生活費カバー率</span>
        <span className={`px-2.5 py-1 text-[11px] font-medium border ${
          isAchieved
            ? 'bg-[#34c759]/15 text-[#34c759] border-[#34c759]/30'
            : coverageRate >= 70
            ? 'bg-[#0071e3]/15 text-[#0071e3] border-[#0071e3]/30'
            : 'bg-[#ff9500]/15 text-[#ff9500] border-[#ff9500]/30'
        }`}>
          {isAchieved ? '達成 (100%超)' : coverageRate >= 70 ? 'Side-FIRE射程圏' : '積立拡張中'}
        </span>
      </div>

      <div className="relative flex flex-col items-center justify-center my-2">
        <svg width="200" height="115" viewBox="0 0 200 115" className="overflow-visible">
          <defs>
            <linearGradient id="gaugeGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ff9500" />
              <stop offset="50%" stopColor="#0071e3" />
              <stop offset="100%" stopColor="#34c759" />
            </linearGradient>
          </defs>

          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="currentColor"
            className="text-black/10 dark:text-white/10"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />

          <circle cx="180" cy="100" r="3" fill="#34c759" />
        </svg>

        <div className="absolute bottom-1 flex flex-col items-center text-center">
          <div className="text-3xl font-bold font-mono tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7] tabular-nums flex items-baseline">
            {coverageRate.toFixed(1)}
            <span className="text-lg font-normal opacity-60 ml-0.5">%</span>
          </div>
          <span className="text-[11px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60">生活費カバー</span>
        </div>
      </div>

      <div className="w-full grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-black/5 dark:border-white/10 text-center">
        <div className="border border-black/10 dark:border-white/10 p-2.5 bg-white/60 dark:bg-white/5">
          <div className="text-[10px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60">受取配当(月額・手取り)</div>
          <div className="text-sm font-semibold font-mono text-[#34c759] tabular-nums mt-0.5">
            {monthlyDividend.toFixed(1)} 万円
          </div>
        </div>
        <div className="border border-black/10 dark:border-white/10 p-2.5 bg-white/60 dark:bg-white/5">
          <div className="text-[10px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60">必要生活費</div>
          <div className="text-sm font-semibold font-mono text-[#1d1d1f] dark:text-[#f5f5f7] tabular-nums mt-0.5">
            {monthlyExpenses.toFixed(1)} 万円
          </div>
        </div>
      </div>

      <div className="text-xs text-center mt-3 text-[#1d1d1f]/70 dark:text-[#f5f5f7]/70 font-mono">
        {monthlyDividend >= monthlyExpenses ? (
          <span className="text-[#34c759] font-medium">
            余剰配当: +{(monthlyDividend - monthlyExpenses).toFixed(1)} 万円/月 (再投資可能)
          </span>
        ) : (
          <span>
            完全FIREまであと <strong className="text-[#ff9500]">{(monthlyExpenses - monthlyDividend).toFixed(1)} 万円/月</strong> 不足
          </span>
        )}
      </div>
    </div>
  );
};

// 3. Asset Allocation Donut Chart (With Total Assets In Center and breakdown percentages)
export interface DonutItem {
  id: string;
  label: string;
  value: number; // in 万円
  color: string;
}

export interface PortfolioDonutChartProps {
  items: DonutItem[];
  totalLabel?: string;
}

export const PortfolioDonutChart: React.FC<PortfolioDonutChartProps> = ({ items, totalLabel = '合計' }) => {
  const totalValue = items.reduce((sum, item) => sum + item.value, 0);

  if (totalValue === 0) {
    return (
      <div className="p-8 text-center text-xs bg-[#f5f5f7]/80 dark:bg-white/5 rounded-3xl text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50">
        データがありません
      </div>
    );
  }

  let accumulatedPercent = 0;
  const piePoint = (radius: number, angle: number) => ({
    x: 120 + radius * Math.cos(angle),
    y: 120 + radius * Math.sin(angle),
  });
  const pieSlicePath = (startPercent: number, endPercent: number) => {
    const startAngle = (startPercent / 100) * Math.PI * 2 - Math.PI / 2;
    const endAngle = (endPercent / 100) * Math.PI * 2 - Math.PI / 2;
    const outerStart = piePoint(106, startAngle);
    const outerEnd = piePoint(106, endAngle);
    const innerEnd = piePoint(56, endAngle);
    const innerStart = piePoint(56, startAngle);
    const largeArc = endPercent - startPercent > 50 ? 1 : 0;
    return `M ${outerStart.x} ${outerStart.y} A 106 106 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A 56 56 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`;
  };
  const slices = items.map((item) => {
    const percentage = (item.value / totalValue) * 100;
    const startPercent = accumulatedPercent;
    accumulatedPercent += percentage;
    return {
      ...item,
      percentage: Math.round(percentage * 10) / 10,
      startPercent,
      endPercent: accumulatedPercent,
    };
  });

  return (
    <div className="w-full bg-transparent transition-colors">
      <div className="flex flex-col items-center gap-4">
        {/* Donut graphic with Central Total Assets */}
        <div className="relative flex w-full max-w-[360px] items-center justify-center">
          <svg viewBox="0 0 240 240" className="h-auto w-full" role="img">
            {slices.map((slice) => {
              const title = `${slice.label}: ${slice.value.toLocaleString()}万円 (${slice.percentage.toFixed(1)}%)`;
              if (slice.percentage >= 99.99) {
                return <circle key={slice.id} cx="120" cy="120" r="106" fill={slice.color} className="cursor-pointer transition-opacity hover:opacity-90"><title>{title}</title></circle>;
              }
              return <path key={slice.id} d={pieSlicePath(slice.startPercent, slice.endPercent)} fill={slice.color} stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" className="cursor-pointer transition-opacity hover:opacity-90"><title>{title}</title></path>;
            })}
            {slices.map((slice) => {
              const midpoint = ((slice.startPercent + slice.endPercent) / 200) * Math.PI * 2 - Math.PI / 2;
              const labelPoint = piePoint(81, midpoint);
              const label = slice.label.length > 10 ? `${slice.label.slice(0, 10)}…` : slice.label;
              const fontSize = slice.percentage < 6 ? 5.5 : slice.percentage < 12 ? 6.5 : 8;
              return (
                <text key={`${slice.id}-label`} x={labelPoint.x} y={labelPoint.y - fontSize} textAnchor="middle" fill="white" fontSize={fontSize} fontWeight="700" className="pointer-events-none">
                  <tspan x={labelPoint.x}>{label}</tspan>
                  <tspan x={labelPoint.x} dy={fontSize + 1}>{slice.value.toLocaleString()}万円</tspan>
                  <tspan x={labelPoint.x} dy={fontSize + 1}>{slice.percentage.toFixed(1)}%</tspan>
                </text>
              );
            })}
            <circle cx="120" cy="120" className="fill-transparent" r="56" />
            <text x="120" y="114" textAnchor="middle" className="fill-[#1d1d1f] dark:fill-[#f5f5f7]" fontSize="9">{totalLabel}</text>
            <text x="120" y="131" textAnchor="middle" className="fill-[#0071e3] dark:fill-[#2997ff]" fontSize="15" fontWeight="700">{totalValue.toLocaleString()}</text>
            <text x="120" y="143" textAnchor="middle" className="fill-[#1d1d1f]/60 dark:fill-[#f5f5f7]/60" fontSize="8">万円</text>
          </svg>
        </div>

      </div>
    </div>
  );
};
