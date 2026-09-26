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
  split?: number;
  invested?: number;
  age?: number | null;
}

interface SimulationLineChartProps {
  data: SimulationDataPoint[];
  rates?: {
    base: number;
    bull: number;
    bear: number;
    core?: number;
    dividend?: number;
  };
}

export const SimulationLineChart: React.FC<SimulationLineChartProps> = ({ data, rates }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  const width = 800;
  const height = 360;
  const padding = { top: 30, right: 30, bottom: 54, left: 60 };

  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // Max value calculation
  const maxVal = Math.max(
    ...data.map(d => Math.max(d.bull, d.base, d.bear, d.split ?? 0)),
    10000
  );
  const minVal = 0;

  const getX = (index: number) => padding.left + (index / Math.max(1, data.length - 1)) * graphWidth;
  const getY = (val: number) => padding.top + graphHeight - ((val - minVal) / (maxVal - minVal)) * graphHeight;

  // Paths
  const createPath = (key: 'bull' | 'base' | 'bear') => {
    return data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d[key])}`).join(' ');
  };

  // Y-axis grid ticks (5 steps)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const val = minVal + pct * (maxVal - minVal);
    return { val, y: getY(val) };
  });

  const activePoint = hoverIndex !== null ? data[hoverIndex] : data[data.length - 1];
  const baseRate = rates?.base ?? 7;
  const bullRate = rates?.bull ?? 15;
  const bearRate = rates?.bear ?? -5;
  const coreRate = rates?.core ?? 7;
  const dividendRate = rates?.dividend ?? 5;
  const formatRate = (rate: number) => `${rate >= 0 ? '+' : ''}${rate}%`;

  return (
    <div className="w-full bg-[var(--color-finance-surface)]/80 dark:bg-white/5 border border-black/10 dark:border-white/10 p-6 sm:p-8 select-none transition-colors">
      {/* Chart Top Legend & Value Display (Apple Minimalist) */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 text-xs">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[var(--color-finance-accent)] inline-block"></span>
            <span className="text-[var(--color-finance-ink)]/70 dark:text-[var(--color-finance-surface)]/70 font-medium">{formatRate(bullRate)}</span>
            <span className="font-mono text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)] font-semibold tabular-nums">
              {formatYen(activePoint.bull)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[var(--color-finance-accent-mid)] inline-block"></span>
            <span className="text-[var(--color-finance-ink)]/70 dark:text-[var(--color-finance-surface)]/70 font-medium">コア{formatRate(coreRate)} / 高配当{formatRate(dividendRate)}</span>
            <span className="font-mono text-[var(--color-finance-accent-mid)] font-semibold tabular-nums">
              {formatYen(activePoint.split ?? 0)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[var(--color-finance-positive)] inline-block"></span>
            <span className="text-[var(--color-finance-ink)]/70 dark:text-[var(--color-finance-surface)]/70 font-medium">{formatRate(baseRate)}</span>
            <span className="font-mono text-[var(--color-finance-positive)] font-semibold tabular-nums">
              {formatYen(activePoint.base)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[var(--color-finance-negative)] inline-block"></span>
            <span className="text-[var(--color-finance-ink)]/70 dark:text-[var(--color-finance-surface)]/70 font-medium">{formatRate(bearRate)}</span>
            <span className="font-mono text-[var(--color-finance-negative)] font-semibold tabular-nums">
              {formatYen(activePoint.bear)}
            </span>
          </div>
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
                className="text-[10px] fill-[var(--color-finance-ink)]/50 dark:fill-[var(--color-finance-surface)]/50 font-mono"
              >
                {formatYen(t.val)}
              </text>
            </g>
          ))}

          {/* Scenario Lines */}
          <path
            d={createPath('bull')}
            fill="none"
            stroke="var(--color-finance-accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d={createPath('base')}
            fill="none"
            stroke="var(--color-finance-positive)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d={createPath('bear')}
            fill="none"
            stroke="var(--color-finance-negative)"
            strokeWidth="2"
            strokeDasharray="5 3"
            strokeLinecap="round"
          />
          <path
            d={data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.split ?? 0)}`).join(' ')}
            fill="none"
            stroke="var(--color-finance-accent-mid)"
            strokeWidth="2.5"
            strokeDasharray="7 3"
            strokeLinecap="round"
          />

          {/* X Axis labels */}
          {data.map((d, i) => {
            if (i % Math.ceil(data.length / 6) === 0 || i === data.length - 1) {
              return (
                <text
                  key={i}
                  x={getX(i)}
                  y={height - 28}
                  textAnchor="middle"
                  className="text-[11px] fill-[var(--color-finance-ink)]/60 dark:fill-[var(--color-finance-surface)]/60 font-mono"
                >
                  <tspan x={getX(i)} dy="0">{d.label || `${d.year}年目`}</tspan>
                  {typeof d.age === 'number' && <tspan x={getX(i)} dy="14">({d.age})</tspan>}
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
                stroke="var(--color-finance-muted)"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle
                cx={getX(hoverIndex)}
                cy={getY(data[hoverIndex].bull)}
                r="4.5"
                fill="var(--color-finance-accent)"
                stroke="var(--color-finance-canvas)"
                strokeWidth="2"
              />
              <circle
                cx={getX(hoverIndex)}
                cy={getY(data[hoverIndex].split ?? 0)}
                r="4.5"
                fill="var(--color-finance-accent-mid)"
                stroke="var(--color-finance-canvas)"
                strokeWidth="2"
              />
              <circle
                cx={getX(hoverIndex)}
                cy={getY(data[hoverIndex].base)}
                r="5.5"
                fill="var(--color-finance-positive)"
                stroke="var(--color-finance-canvas)"
                strokeWidth="2"
              />
              <circle
                cx={getX(hoverIndex)}
                cy={getY(data[hoverIndex].bear)}
                r="4"
                fill="var(--color-finance-negative)"
                stroke="var(--color-finance-canvas)"
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

      <div className="flex items-center justify-end text-[11px] text-[var(--color-finance-ink)]/50 dark:text-[var(--color-finance-surface)]/50 mt-4 px-1">
        <span className="font-mono">{activePoint.label || `${activePoint.year}年目`}</span>
      </div>
    </div>
  );
};

export const SimulationChart = SimulationLineChart;

export interface MonthlyAssetDataPoint {
  label: string;
  netWorth: number;
  coreStocks: number;
  dividendStocks: number;
  cash: number;
  investmentCapacity: number;
}

interface MonthlyAssetLineChartProps {
  data: MonthlyAssetDataPoint[];
  masked?: boolean;
}

const formatChartAmount = (value: number, masked = false) => masked ? '***' : `${Math.round(value).toLocaleString()}万円`;

// 月次元帳の資産行をそのまま可視化する。表と別の推計式を持たせない。
export const MonthlyAssetLineChart: React.FC<MonthlyAssetLineChartProps> = ({ data, masked = false }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  if (data.length === 0) return null;

  const width = 900;
  const height = 390;
  const padding = { top: 30, right: 28, bottom: 58, left: 74 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;
  const series = [
    { key: 'netWorth', label: '純資産推計', color: 'var(--color-finance-accent)', emphasis: true },
    { key: 'coreStocks', label: 'コア株式', color: 'var(--color-finance-accent-strong)', emphasis: false },
    { key: 'dividendStocks', label: '高配当ポートフォリオ', color: 'var(--color-finance-accent-mid)', emphasis: false },
    { key: 'cash', label: '現金', color: 'var(--color-finance-accent-muted)', emphasis: false },
    { key: 'investmentCapacity', label: '投資余力（累積余剰）', color: 'var(--color-finance-accent-on-dark)', emphasis: false },
  ] as const;
  const values = data.flatMap((point) => series.map((item) => point[item.key]));
  const maximum = Math.max(...values, 1);
  const minimum = Math.min(0, ...values);
  const range = Math.max(maximum - minimum, 1);
  const yPadding = range * 0.08;
  const minY = minimum - yPadding;
  const maxY = maximum + yPadding;
  const getX = (index: number) => padding.left + (index / Math.max(data.length - 1, 1)) * graphWidth;
  const getY = (value: number) => padding.top + graphHeight - ((value - minY) / (maxY - minY)) * graphHeight;
  const createPath = (key: typeof series[number]['key']) => data
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${getX(index)} ${getY(point[key])}`)
    .join(' ');
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = minY + (maxY - minY) * ratio;
    return { value, y: getY(value) };
  });
  const activeIndex = hoverIndex ?? data.length - 1;
  const activePoint = data[activeIndex];
  const labelStep = Math.max(1, Math.ceil(data.length / 8));

  return (
    <section className="border border-black/10 bg-finance-surface/80 p-5 transition-colors dark:border-white/10 dark:bg-white/5 sm:p-7">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-finance-ink dark:text-finance-surface">月次資産推移</h2>
          <p className="mt-1 text-[11px] text-finance-muted dark:text-finance-surface/60">横軸：月次　縦軸：金額（万円）</p>
        </div>
        <span className="font-mono text-xs font-semibold text-finance-accent dark:text-finance-accent-on-dark">{activePoint.label}</span>
      </div>

      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px]">
        {series.map((item) => (
          <div key={item.key} className="flex items-center gap-1.5 text-finance-muted dark:text-finance-surface/70">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
            <span className="font-mono font-semibold" style={{ color: item.color }}>{formatChartAmount(activePoint[item.key], masked)}</span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[700px] w-full" role="img" aria-label="月次資産推移グラフ" onMouseLeave={() => setHoverIndex(null)}>
          {yTicks.map((tick) => (
            <g key={tick.value}>
              <line x1={padding.left} y1={tick.y} x2={width - padding.right} y2={tick.y} stroke="currentColor" className="text-black/10 dark:text-white/10" strokeDasharray="2 3" />
              <text x={padding.left - 10} y={tick.y + 4} textAnchor="end" className="fill-finance-muted font-mono text-[10px] dark:fill-finance-surface/60">{formatChartAmount(tick.value, masked)}</text>
            </g>
          ))}
          {series.map((item) => (
            <path key={item.key} d={createPath(item.key)} fill="none" stroke={item.color} strokeWidth={item.emphasis ? 3.5 : 2.25} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {data.map((point, index) => {
            if (index % labelStep !== 0 && index !== data.length - 1) return null;
            return <text key={point.label} x={getX(index)} y={height - 25} textAnchor="middle" className="fill-finance-muted font-mono text-[10px] dark:fill-finance-surface/60">{point.label}</text>;
          })}
          {hoverIndex !== null && <line x1={getX(activeIndex)} y1={padding.top} x2={getX(activeIndex)} y2={height - padding.bottom} stroke="var(--color-finance-muted)" strokeWidth="1" strokeDasharray="3 3" />}
          {series.map((item) => data.map((point, index) => (
            <circle key={`${item.key}-${index}`} cx={getX(index)} cy={getY(point[item.key])} r={hoverIndex === index ? 5 : 3} fill={item.color} stroke="var(--color-finance-canvas)" strokeWidth="1.5" className="cursor-pointer" onMouseEnter={() => setHoverIndex(index)} onFocus={() => setHoverIndex(index)} tabIndex={0}>
              <title>{`${point.label} ${item.label}: ${formatChartAmount(point[item.key], masked)}`}</title>
            </circle>
          )))}
        </svg>
      </div>
    </section>
  );
};

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
    <div className="bg-[var(--color-finance-surface)]/80 dark:bg-white/5 border border-black/10 dark:border-white/10 p-6 sm:p-8 flex flex-col items-center relative overflow-hidden transition-colors">
      <div className="w-full flex items-center justify-between text-xs mb-3">
        <span className="font-medium text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)]">配当生活費カバー率</span>
        <span className={`px-2.5 py-1 text-[11px] font-medium border ${
          isAchieved
            ? 'bg-[var(--color-finance-positive)]/15 text-[var(--color-finance-positive)] border-[var(--color-finance-positive)]/30'
            : coverageRate >= 70
            ? 'bg-[var(--color-finance-accent)]/15 text-[var(--color-finance-accent)] border-[var(--color-finance-accent)]/30'
            : 'bg-[var(--color-finance-accent-muted)]/15 text-[var(--color-finance-accent-muted)] border-[var(--color-finance-accent-muted)]/30'
        }`}>
          {isAchieved ? '達成 (100%超)' : coverageRate >= 70 ? 'Side-FIRE射程圏' : '積立拡張中'}
        </span>
      </div>

      <div className="relative flex flex-col items-center justify-center my-2">
        <svg width="200" height="115" viewBox="0 0 200 115" className="overflow-visible">
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
            stroke={isAchieved ? 'var(--color-finance-positive)' : 'var(--color-finance-accent)'}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />

          <circle cx="180" cy="100" r="3" fill="var(--color-finance-positive)" />
        </svg>

        <div className="absolute bottom-1 flex flex-col items-center text-center">
          <div className="text-3xl font-bold font-mono tracking-tight text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)] tabular-nums flex items-baseline">
            {coverageRate.toFixed(1)}
            <span className="text-lg font-normal opacity-60 ml-0.5">%</span>
          </div>
          <span className="text-[11px] text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60">生活費カバー</span>
        </div>
      </div>

      <div className="w-full grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-black/5 dark:border-white/10 text-center">
        <div className="border border-black/10 dark:border-white/10 p-2.5 bg-white/60 dark:bg-white/5">
          <div className="text-[10px] text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60">受取配当(月額・手取り)</div>
          <div className="text-sm font-semibold font-mono text-[var(--color-finance-positive)] tabular-nums mt-0.5">
            {monthlyDividend.toFixed(1)} 万円
          </div>
        </div>
        <div className="border border-black/10 dark:border-white/10 p-2.5 bg-white/60 dark:bg-white/5">
          <div className="text-[10px] text-[var(--color-finance-ink)]/60 dark:text-[var(--color-finance-surface)]/60">必要生活費</div>
          <div className="text-sm font-semibold font-mono text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)] tabular-nums mt-0.5">
            {monthlyExpenses.toFixed(1)} 万円
          </div>
        </div>
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
      <div className="p-8 text-center text-xs bg-[var(--color-finance-surface)]/80 dark:bg-white/5 rounded-3xl text-[var(--color-finance-ink)]/50 dark:text-[var(--color-finance-surface)]/50">
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
        <div className="relative flex w-full max-w-[320px] items-center justify-center">
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
            <text x="120" y="114" textAnchor="middle" className="fill-[var(--color-finance-ink)] dark:fill-[var(--color-finance-surface)]" fontSize="9">{totalLabel}</text>
            <text x="120" y="131" textAnchor="middle" className="fill-[var(--color-finance-accent)] dark:fill-[var(--color-finance-accent-on-dark)]" fontSize="15" fontWeight="700">{totalValue.toLocaleString()}</text>
            <text x="120" y="143" textAnchor="middle" className="fill-[var(--color-finance-ink)]/60 dark:fill-[var(--color-finance-surface)]/60" fontSize="8">万円</text>
          </svg>
        </div>

      </div>
    </div>
  );
};
