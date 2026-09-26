import React, { useMemo, useState } from 'react';

export interface MonthlyAssetDataPoint {
  label: string;
  netWorth: number;
  coreStocks: number;
  dividendStocks: number;
  cash: number;
  investmentCapacity: number;
}

type SeriesKey = Exclude<keyof MonthlyAssetDataPoint, 'label'>;

const SERIES: Array<{ key: SeriesKey; label: string; color: string }> = [
  { key: 'netWorth', label: '総資産推計', color: '#0071e3' },
  { key: 'coreStocks', label: 'コア株式', color: '#af52de' },
  { key: 'dividendStocks', label: '高配当ポートフォリオ', color: '#34c759' },
  { key: 'cash', label: '現金', color: '#ff9500' },
  { key: 'investmentCapacity', label: '投資余力（累積余剰）', color: '#5ac8fa' },
];

const STACKED_SERIES: SeriesKey[] = ['coreStocks', 'dividendStocks', 'cash', 'investmentCapacity'];

const formatAmount = (value: number, masked: boolean) => masked ? '***' : `${Math.round(value).toLocaleString()}万円`;

interface MonthlyAssetLineChartProps {
  data: MonthlyAssetDataPoint[];
  masked?: boolean;
}

// 表と同じ月次元帳を使用し、ONになっている系列全体に合わせて縦軸を切り替える。
export const MonthlyAssetLineChart: React.FC<MonthlyAssetLineChartProps> = ({ data, masked = false }) => {
  const [visibleKeys, setVisibleKeys] = useState<SeriesKey[]>(['netWorth']);
  const [activeKey, setActiveKey] = useState<SeriesKey>('netWorth');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const visibleSeries = useMemo(
    () => SERIES.filter((series) => visibleKeys.includes(series.key)),
    [visibleKeys],
  );

  // 総資産推計以外は、資産を下から順に積み上げた累積値として描画する。
  const chartData = useMemo(() => data.map((point) => {
    let cumulative = 0;
    const stackedPoint = { ...point };
    STACKED_SERIES.forEach((key) => {
      cumulative += point[key];
      stackedPoint[key] = cumulative;
    });
    return stackedPoint;
  }), [data]);

  if (data.length === 0) return null;

  const width = 900;
  const height = 390;
  const padding = { top: 30, right: 28, bottom: 58, left: 74 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;
  const visibleValues = chartData.flatMap((point) => visibleSeries.map((series) => point[series.key]));
  const visibleMinimum = Math.min(...visibleValues);
  const visibleMaximum = Math.max(...visibleValues);
  const visibleRange = Math.max(visibleMaximum - visibleMinimum, Math.abs(visibleMaximum) * 0.08, 1);
  const minY = Math.max(0, visibleMinimum - visibleRange * 0.16);
  const maxY = Math.max(minY + 1, visibleMaximum + visibleRange * 0.16);
  const getX = (index: number) => padding.left + (index / Math.max(data.length - 1, 1)) * graphWidth;
  const getY = (value: number) => padding.top + graphHeight - ((value - minY) / Math.max(maxY - minY, 1)) * graphHeight;
  const createPath = (key: SeriesKey) => chartData
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${getX(index)} ${getY(point[key])}`)
    .join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = minY + (maxY - minY) * ratio;
    return { value, y: getY(value) };
  });
  const currentIndex = hoverIndex ?? data.length - 1;
  const currentPoint = chartData[currentIndex];
  const labelStep = Math.max(1, Math.ceil(data.length / 8));

  const toggleSeries = (key: SeriesKey) => {
    const isVisible = visibleKeys.includes(key);
    if (isVisible && visibleKeys.length === 1) return;
    const nextKeys = isVisible
      ? visibleKeys.filter((visibleKey) => visibleKey !== key)
      : [...visibleKeys, key];
    setVisibleKeys(nextKeys);
    setActiveKey(isVisible && activeKey === key ? nextKeys[0] : key);
  };

  return (
    <section className="-mt-4 border-0 bg-transparent p-5 transition-colors sm:p-7">
      <div className="mb-4">
        <div>
          <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">月次資産推移</h2>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" aria-label="表示する資産系列">
        {SERIES.map((series) => {
          const isVisible = visibleKeys.includes(series.key);
          const isActive = activeKey === series.key;
          return (
            <button
              key={series.key}
              type="button"
              onClick={() => toggleSeries(series.key)}
              aria-pressed={isVisible}
              title={isVisible ? `${series.label}を非表示` : `${series.label}を表示`}
              className={`flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px] transition-colors ${
                isVisible
                  ? 'border-black/15 bg-white dark:border-white/20 dark:bg-white/10'
                  : 'border-transparent bg-black/5 text-[#1d1d1f]/45 dark:bg-white/5 dark:text-[#f5f5f7]/45'
              } ${isActive ? 'ring-1 ring-[#0071e3]/35 dark:ring-[#2997ff]/45' : ''}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series.color }} />
              <span className={isActive ? 'font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]' : ''}>{series.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#1d1d1f]/65 dark:text-[#f5f5f7]/70">
        {visibleSeries.map((series) => (
          <span key={series.key} className="font-mono" style={{ color: series.color }}>
            {series.label} {formatAmount(currentPoint[series.key], masked)}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[700px] w-full" role="img" aria-label="月次資産推移グラフ" onMouseLeave={() => setHoverIndex(null)}>
          <defs>
            <clipPath id="monthly-asset-plot">
              <rect x={padding.left} y={padding.top} width={graphWidth} height={graphHeight} />
            </clipPath>
          </defs>
          {ticks.map((tick) => (
            <g key={tick.value}>
              <line x1={padding.left} y1={tick.y} x2={width - padding.right} y2={tick.y} stroke="currentColor" className="text-black/10 dark:text-white/10" strokeDasharray="2 3" />
              <text x={padding.left - 10} y={tick.y + 4} textAnchor="end" className="fill-[#1d1d1f]/55 dark:fill-[#f5f5f7]/60 font-mono text-[10px]">{formatAmount(tick.value, masked)}</text>
            </g>
          ))}
          <g clipPath="url(#monthly-asset-plot)">
            {hoverIndex !== null && <line x1={getX(currentIndex)} y1={padding.top} x2={getX(currentIndex)} y2={height - padding.bottom} stroke="#8e8e93" strokeWidth="1" strokeDasharray="3 3" />}
            {visibleSeries.map((series) => (
              <path key={series.key} d={createPath(series.key)} fill="none" stroke={series.color} strokeWidth={activeKey === series.key ? 3.5 : 2.25} strokeLinecap="round" strokeLinejoin="round" opacity={activeKey === series.key ? 1 : 0.72} />
            ))}
            {visibleSeries.flatMap((series) => chartData.map((point, index) => (
              <circle key={`${series.key}-${index}`} cx={getX(index)} cy={getY(point[series.key])} r={hoverIndex === index ? 5 : 3} fill={series.color} stroke="#ffffff" strokeWidth="1.5" className="cursor-pointer" onMouseEnter={() => setHoverIndex(index)} onFocus={() => setHoverIndex(index)} tabIndex={0}>
                <title>{`${point.label} ${series.label}: ${formatAmount(point[series.key], masked)}`}</title>
              </circle>
            )))}
          </g>
          {chartData.map((point, index) => {
            if (index % labelStep !== 0 && index !== chartData.length - 1) return null;
            return <text key={point.label} x={getX(index)} y={height - 25} textAnchor="middle" className="fill-[#1d1d1f]/55 dark:fill-[#f5f5f7]/60 font-mono text-[10px]">{point.label}</text>;
          })}
        </svg>
      </div>
    </section>
  );
};
