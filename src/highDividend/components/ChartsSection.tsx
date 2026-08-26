import React, { useState, useRef } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import { toPng, toBlob } from 'html-to-image';
import { Copy, Download, Check, HelpCircle } from 'lucide-react';
import { ETFDataRow, ScenarioResult } from '../types';
import { formatCurrency, formatDateStr, findPreviousSettlementRow } from '../utils/calc';

interface ChartsSectionProps {
  data: ETFDataRow[];
  scenarios: ScenarioResult[];
  targetYield?: number;
}

export const ChartsSection: React.FC<ChartsSectionProps> = ({ data, scenarios, targetYield = 0.15 }) => {
  // Right container tab state: 'units' | 'scenarios' | 'daily_change'
  const [activeRightTab, setActiveRightTab] = useState<'units' | 'scenarios' | 'daily_change'>('units');

  // Copy status indicators
  const [leftCopied, setLeftCopied] = useState<boolean>(false);
  const [rightCopied, setRightCopied] = useState<boolean>(false);
  const [isExportingLeft, setIsExportingLeft] = useState<boolean>(false);
  const [isExportingRight, setIsExportingRight] = useState<boolean>(false);

  const leftChartRef = useRef<HTMLDivElement>(null);
  const rightChartRef = useRef<HTMLDivElement>(null);

  // Format dataset with previous day comparisons
  const chartData = data.map((d, index) => {
    const prev = index > 0 ? data[index - 1] : null;
    const unitsDiff = prev ? Math.round(d.total_units - prev.total_units) : 0;
    const unitsDiffPct = prev && prev.total_units > 0 ? ((d.total_units - prev.total_units) / prev.total_units) * 100 : 0;
    const netAssetsDiff = prev ? parseFloat(((d.net_assets - prev.net_assets) / 100000000).toFixed(2)) : 0;

    return {
      date: formatDateStr(d.date),
      rawDate: d.date,
      nav: d.nav,
      change: d.change,
      reinv_nav: d.reinv_nav,
      total_units: Math.round(d.total_units),
      units_diff: unitsDiff,
      units_diff_pct: parseFloat(unitsDiffPct.toFixed(2)),
      net_assets_oku: parseFloat((d.net_assets / 100000000).toFixed(2)),
      net_assets_diff: netAssetsDiff,
      daily_change_pct: d.daily_unit_change_rate ? parseFloat((d.daily_unit_change_rate - 100).toFixed(2)) : 0,
      r_cumulative: d.r_cumulative ? parseFloat(d.r_cumulative.toFixed(3)) : 1.0,
      last_div: d.last_div,
    };
  });

  // Filter 5/1 onwards for daily change chart
  const dailyChangeData = chartData.filter((d) => {
    const cleanDate = d.rawDate.replace(/[-/]/g, '');
    return cleanDate >= '20260501';
  });

  // Calculate dilution and change from previous dividend date (e.g. 8/10) to latest date
  const latestRow = data.length > 0 ? data[data.length - 1] : null;
  const prevDivRow = latestRow ? findPreviousSettlementRow(data, latestRow) : (data.length > 0 ? data[0] : null);

  const prevDivUnits = prevDivRow?.total_units || (data.length > 0 ? data[0].total_units : 1);
  const currentUnits = latestRow?.total_units || 1;
  const unitsRatio = prevDivUnits > 0 ? currentUnits / prevDivUnits : 1.0;
  const unitsChangePct = prevDivUnits > 0 ? ((currentUnits - prevDivUnits) / prevDivUnits) * 100 : 0;
  const prevDivDateLabel = prevDivRow ? formatDateStr(prevDivRow.date) : '前回決算日';

  // Bar chart data for scenarios
  const barChartData = scenarios.map((s) => ({
    name: s.name.replace(/シナリオ[A-D]:\s*/, ''),
    shortName: s.id,
    predicted_div: Math.round(s.predicted_div),
    annual_yield: parseFloat(s.annual_yield.toFixed(2)),
    monthly_yield: parseFloat(s.monthly_yield.toFixed(2)),
    nav: s.nav,
    r: s.r,
  }));

  const scenarioColors: Record<string, string> = {
    A: '#1A1A1A',
    B: '#D97706',
    C: '#B91C1C',
    D: '#15803D',
  };

  // Export & Copy Helpers
  const handleDownloadImage = async (ref: React.RefObject<HTMLDivElement | null>, filename: string, setExporting: (v: boolean) => void) => {
    if (!ref.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(ref.current, {
        backgroundColor: '#FFFFFF',
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export image', err);
    } finally {
      setExporting(false);
    }
  };

  const handleCopyImage = async (
    ref: React.RefObject<HTMLDivElement | null>,
    titleText: string,
    setCopied: (v: boolean) => void,
    setExporting: (v: boolean) => void
  ) => {
    if (!ref.current) return;
    setExporting(true);
    try {
      const blob = await toBlob(ref.current, {
        backgroundColor: '#FFFFFF',
        pixelRatio: 2,
      });
      if (blob && navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        return;
      }
      throw new Error('ClipboardItem not supported');
    } catch (err) {
      try {
        await navigator.clipboard.writeText(`${titleText} | 563A ETF 予測データ端末`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch (clipErr) {
        console.warn('Clipboard write failed', clipErr);
      }
    } finally {
      setExporting(false);
    }
  };

  // Custom Editorial Tooltip for NAV Chart
  const NavCustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-[#1A1A1A] p-3 shadow-md text-xs font-sans">
          <p className="font-bold text-[#1A1A1A] border-b border-black/10 pb-1 mb-1.5 font-mono">{label}</p>
          {payload.map((item: any, idx: number) => (
            <div key={idx} className="flex justify-between items-center gap-4 py-0.5">
              <span className="text-gray-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: item.color }} />
                {item.name}:
              </span>
              <span className="font-mono font-bold text-[#1A1A1A]">
                ¥{typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Custom Editorial Tooltip for Total Units Chart (Includes 前日比)
  const UnitsCustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0]?.payload;
      const unitsDiff = dataPoint?.units_diff ?? 0;
      const unitsDiffPct = dataPoint?.units_diff_pct ?? 0;
      const isUp = unitsDiff > 0;
      const isDown = unitsDiff < 0;

      return (
        <div className="bg-white border border-[#1A1A1A] p-3 shadow-md text-xs font-sans min-w-[210px]">
          <p className="font-bold text-[#1A1A1A] border-b border-black/10 pb-1 mb-1.5 font-mono">{label}</p>

          {/* Total units value */}
          <div className="flex justify-between items-center py-0.5">
            <span className="text-gray-600 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block bg-[#EA580C]" />
              総発行口数:
            </span>
            <span className="font-mono font-bold text-[#1A1A1A]">
              {dataPoint?.total_units?.toLocaleString()} 口
            </span>
          </div>

          {/* 前日比口数 */}
          <div className="flex justify-between items-center py-0.5 border-t border-dashed border-black/10 mt-1 pt-1">
            <span className="text-gray-500 text-[11px]">口数 前日比:</span>
            <span className={`font-mono font-bold text-[11px] ${isUp ? 'text-orange-700' : isDown ? 'text-blue-700' : 'text-gray-600'}`}>
              {isUp ? '+' : ''}{unitsDiff.toLocaleString()} 口 ({isUp ? '+' : ''}{unitsDiffPct.toFixed(2)}%)
            </span>
          </div>

          {/* Net assets */}
          <div className="flex justify-between items-center py-0.5 mt-1 border-t border-black/10 pt-1">
            <span className="text-gray-600 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block bg-[#1A1A1A]" />
              純資産総額:
            </span>
            <span className="font-mono font-bold text-[#1A1A1A]">
              {dataPoint?.net_assets_oku} 億円
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Dedicated Scenario Bar Tooltip
  const ScenarioCustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0]?.payload;
      if (!dataPoint) return null;

      return (
        <div className="bg-white border border-[#1A1A1A] p-3 shadow-md text-xs font-sans min-w-[220px]">
          <p className="font-bold text-[#1A1A1A] border-b border-black/10 pb-1 mb-1.5 font-mono">
            シナリオ {dataPoint.shortName}: {dataPoint.name}
          </p>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">予測分配金:</span>
              <span className="font-serif font-black text-orange-700 text-sm">
                ¥{formatCurrency(dataPoint.predicted_div)} <span className="text-[10px] font-sans font-normal text-gray-500">/ 100口</span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">年換算利回り:</span>
              <span className="font-mono font-bold text-[#1A1A1A] bg-orange-50 px-1.5 py-0.5 border border-orange-200">
                {dataPoint.annual_yield.toFixed(2)}% / 年
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">月額分配率:</span>
              <span className="font-mono font-bold text-gray-700">
                {dataPoint.monthly_yield.toFixed(2)}% / 月
              </span>
            </div>
            <div className="flex justify-between items-center text-[10px] text-gray-500 pt-1.5 border-t border-black/5">
              <span>前提NAV / R係数:</span>
              <span className="font-mono font-medium">¥{formatCurrency(dataPoint.nav)} / {dataPoint.r.toFixed(3)}x</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom Tooltip for Daily Change % Chart
  const DailyChangeTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0]?.payload;
      return (
        <div className="bg-white border border-[#1A1A1A] p-2.5 shadow-md text-xs font-sans">
          <p className="font-bold text-[#1A1A1A] border-b border-black/10 pb-1 mb-1 font-mono">{label}</p>
          <div className="flex justify-between items-center gap-3">
            <span className="text-gray-600">前日比口数増減率:</span>
            <span className={`font-mono font-bold ${dataPoint.daily_change_pct > 0 ? 'text-orange-700' : dataPoint.daily_change_pct < 0 ? 'text-red-700' : 'text-gray-700'}`}>
              {dataPoint.daily_change_pct > 0 ? '+' : ''}{dataPoint.daily_change_pct.toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between items-center gap-3 mt-1 text-[11px] text-gray-500">
            <span>口数増減数:</span>
            <span className="font-mono">{dataPoint.units_diff > 0 ? '+' : ''}{dataPoint.units_diff?.toLocaleString()} 口</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Common chart margins to guarantee exact alignment of X-axis and Y-axis between Left and Right
  const sharedChartMargin = { top: 10, right: 15, left: -5, bottom: 15 };

  return (
    <section className="bg-white border border-black/15 p-4 sm:p-6 shadow-xs">
      {/* Section Header */}
      <div className="mb-4 pb-3 border-b border-black/10">
        <h2 className="text-xl sm:text-2xl font-serif font-black tracking-tight text-[#1A1A1A]">
          データ推移と可視化チャート
        </h2>
      </div>

      {/* 2-Column Side-by-Side Comparison Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ================= LEFT COLUMN: Fixed 基準価額 (NAV) Chart ================= */}
        <div ref={leftChartRef} className="border border-black/10 bg-[#FDFCFB] p-4 flex flex-col justify-between relative">
          <div>
            {/* Top Control Bar with perfectly aligned height matching Right Column */}
            <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-black/5 min-h-[32px]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-[#1A1A1A] inline-block" />
                <h3 className="text-sm font-sans font-bold text-[#1A1A1A] uppercase tracking-wide">
                  基準価額 (NAV) 推移
                </h3>
              </div>

              {/* Action Buttons: Minimal borderless/transparent icons */}
              <div className="flex items-center gap-1">
                <div className="hidden sm:flex items-center gap-2 text-[10px] font-sans text-gray-500 mr-2">
                  <span className="flex items-center gap-1 text-[#1A1A1A]">
                    <span className="w-2 h-0.5 bg-[#1A1A1A] inline-block" /> 基準価額
                  </span>
                  <span className="flex items-center gap-1 text-emerald-800">
                    <span className="w-2 h-0.5 bg-emerald-700 inline-block" /> 再投資NAV
                  </span>
                </div>

                <button
                  type="button"
                  title="画像をクリップボードにコピー"
                  disabled={isExportingLeft}
                  onClick={() => handleCopyImage(leftChartRef, '563A 基準価額(NAV)推移チャート', setLeftCopied, setIsExportingLeft)}
                  className="p-1 text-gray-500 hover:text-black transition-colors cursor-pointer disabled:opacity-40"
                >
                  {leftCopied ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="button"
                  title="PNG画像としてダウンロード"
                  disabled={isExportingLeft}
                  onClick={() => handleDownloadImage(leftChartRef, `563A_NAV_Chart_${new Date().toISOString().slice(0,10)}`, setIsExportingLeft)}
                  className="p-1 text-gray-500 hover:text-black transition-colors cursor-pointer disabled:opacity-40"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Subtitle / Legend Spacer to equalize top offset */}
            <div className="text-[11px] font-sans text-gray-500 mb-2 min-h-[18px] flex items-center justify-between">
              <span className="font-mono text-gray-600">全期間日次推移（基準価額 & 再投資NAV）</span>
            </div>

            {/* Chart Area */}
            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={sharedChartMargin}>
                  <defs>
                    <linearGradient id="navGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1A1A1A" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#1A1A1A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 2" stroke="#E5E5E5" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: '#666', fontFamily: 'JetBrains Mono' }}
                    tickLine={false}
                    axisLine={{ stroke: '#1A1A1A' }}
                    minTickGap={25}
                  />
                  <YAxis
                    domain={['dataMin - 2000', 'dataMax + 2000']}
                    tick={{ fontSize: 9, fill: '#666', fontFamily: 'JetBrains Mono' }}
                    tickLine={false}
                    axisLine={{ stroke: '#1A1A1A' }}
                    tickFormatter={(val) => `¥${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<NavCustomTooltip />} />

                  {/* Reference line labels positioned right above X-axis */}
                  <ReferenceLine
                    x="2026/07/10"
                    stroke="#EA580C"
                    strokeDasharray="3 3"
                    label={{
                      value: '第1回 1,400円',
                      position: 'insideBottomLeft',
                      dy: -6,
                      fill: '#EA580C',
                      fontSize: 10,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: 'bold',
                    }}
                  />
                  <ReferenceLine
                    x="2026/08/10"
                    stroke="#EA580C"
                    strokeDasharray="3 3"
                    label={{
                      value: '第2回 900円',
                      position: 'insideBottomLeft',
                      dy: -6,
                      fill: '#EA580C',
                      fontSize: 10,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: 'bold',
                    }}
                  />

                  <Area
                    type="monotone"
                    dataKey="nav"
                    name="基準価額"
                    stroke="#1A1A1A"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#navGradient)"
                  />
                  <Line
                    type="monotone"
                    dataKey="reinv_nav"
                    name="分配金再投資NAV"
                    stroke="#15803D"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-black/10 text-[11px] font-sans text-gray-600 flex justify-between items-center min-h-[22px]">
            <span><strong>決算履歴:</strong> 第1回 1,400円 → 第2回 900円</span>
            <span className="text-orange-700 font-bold">次回決算: 2026/09/10</span>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: 3 Swappable Comparison Charts ================= */}
        <div ref={rightChartRef} className="border border-black/10 bg-[#FDFCFB] p-4 flex flex-col justify-between relative">
          <div>
            {/* Top Control Bar with perfectly aligned height matching Left Column */}
            <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-black/5 min-h-[32px]">
              <div className="flex items-center gap-1 bg-[#F1EFEA] p-0.5 border border-black/10">
                <button
                  onClick={() => setActiveRightTab('units')}
                  className={`px-2 py-0.5 text-[10px] sm:text-[11px] font-sans font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                    activeRightTab === 'units'
                      ? 'bg-[#1A1A1A] text-white'
                      : 'text-gray-600 hover:text-black hover:bg-white'
                  }`}
                >
                  総発行口数
                </button>
                <button
                  onClick={() => setActiveRightTab('scenarios')}
                  className={`px-2 py-0.5 text-[10px] sm:text-[11px] font-sans font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                    activeRightTab === 'scenarios'
                      ? 'bg-[#1A1A1A] text-white'
                      : 'text-gray-600 hover:text-black hover:bg-white'
                  }`}
                >
                  予測シナリオ比較
                </button>
                <button
                  onClick={() => setActiveRightTab('daily_change')}
                  className={`px-2 py-0.5 text-[10px] sm:text-[11px] font-sans font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                    activeRightTab === 'daily_change'
                      ? 'bg-[#1A1A1A] text-white'
                      : 'text-gray-600 hover:text-black hover:bg-white'
                  }`}
                >
                  口数増減率 (前日比%)
                </button>
              </div>

              {/* Action Buttons: Minimal borderless/transparent icons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="画像をクリップボードにコピー"
                  disabled={isExportingRight}
                  onClick={() =>
                    handleCopyImage(
                      rightChartRef,
                      `563A ${activeRightTab === 'units' ? '総発行口数' : activeRightTab === 'scenarios' ? '予測シナリオ比較' : '口数増減率'}チャート`,
                      setRightCopied,
                      setIsExportingRight
                    )
                  }
                  className="p-1 text-gray-500 hover:text-black transition-colors cursor-pointer disabled:opacity-40"
                >
                  {rightCopied ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="button"
                  title="PNG画像としてダウンロード"
                  disabled={isExportingRight}
                  onClick={() =>
                    handleDownloadImage(
                      rightChartRef,
                      `563A_${activeRightTab}_${new Date().toISOString().slice(0, 10)}`,
                      setIsExportingRight
                    )
                  }
                  className="p-1 text-gray-500 hover:text-black transition-colors cursor-pointer disabled:opacity-40"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Subtitle / Legend Spacer to equalize top offset with Left Column */}
            <div className="text-[11px] font-sans text-gray-500 mb-2 min-h-[18px] flex justify-between items-center relative">
              {activeRightTab === 'units' && (
                <div className="flex items-center justify-between w-full flex-wrap gap-x-2 gap-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-orange-700 font-medium">● 総発行口数 (左軸)</span>
                    <span className="text-gray-700 font-medium">--- 純資産 (右軸)</span>
                  </div>

                  <div className="flex items-center gap-1.5 bg-orange-50/90 px-2 py-0.5 border border-orange-200/90 text-[10px] sm:text-[11px]">
                    <span className="text-gray-600 font-sans">
                      前回配当({prevDivDateLabel})比 口数増減:
                    </span>
                    <span className={`font-mono font-bold ${unitsChangePct >= 0 ? 'text-orange-700' : 'text-emerald-700'}`}>
                      {unitsChangePct >= 0 ? '+' : ''}{unitsChangePct.toFixed(2)}%
                      <span className="text-gray-500 font-normal font-sans ml-1 text-[10px]">(R: {unitsRatio.toFixed(3)}x)</span>
                    </span>

                    {/* Interactive ? icon with rich tooltip */}
                    <div className="relative group inline-flex items-center">
                      <button
                        type="button"
                        className="text-gray-400 group-hover:text-orange-600 cursor-help p-0.5 focus:outline-none flex items-center transition-colors"
                        aria-label="563A希薄化・濃縮化の算定数式とメカニズム"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>

                      {/* Tooltip Popup on hover */}
                      <div className="hidden group-hover:block absolute right-0 top-full mt-1.5 w-80 sm:w-96 p-3.5 bg-[#1A1A1A] text-white text-[11px] font-sans shadow-2xl border border-white/20 z-50 pointer-events-none text-left">
                        <div className="font-serif font-bold text-orange-400 text-xs border-b border-white/15 pb-1 mb-2">
                          563A 希薄化・濃縮化の算定数式とメカニズム
                        </div>

                        <div className="space-y-2 leading-relaxed text-gray-200">
                          <div>
                            <strong className="text-white block text-[10px] uppercase tracking-wider text-orange-300">【算定数式】</strong>
                            <div className="bg-white/10 p-2 font-mono text-[10px] text-orange-200 border border-white/10 my-1 space-y-1">
                              <div>口数増減割合(%) = ((最新口数 {Math.round(currentUnits).toLocaleString()} - 前回決算口数 {Math.round(prevDivUnits).toLocaleString()}) / 前回決算口数) × 100 = <strong className="text-white">{unitsChangePct >= 0 ? '+' : ''}{unitsChangePct.toFixed(2)}%</strong></div>
                              <div>希薄化係数 R = 最新口数 / 前回決算口数 = <strong className="text-white">{unitsRatio.toFixed(3)}倍</strong></div>
                              <div>100口あたり予想分配金 = 理論分配金 / R</div>
                            </div>
                          </div>

                          <div>
                            <strong className="text-white block text-[10px] uppercase tracking-wider text-orange-300">【563A固有の分配金発生ロジック】</strong>
                            <p className="text-[10px] text-gray-300">
                              563Aは韓国上場ETF（TIGER US NASDAQ100 Target Daily Covered Call）1本に投資するファンド・オブ・ファンズです。
                            </p>
                            <ul className="list-disc list-inside text-[10px] text-gray-300 space-y-0.5 mt-1">
                              <li><strong className="text-white">韓国ETF決算日（月末）</strong>：韓国ETFから受け取る分配金（分配原資の総額）が確定。</li>
                              <li><strong className="text-white">563A決算日（翌月10日）</strong>：その分配原資を発行済口数で均等に配分。</li>
                            </ul>
                            <p className="text-[10px] text-gray-300 mt-1">
                              この「月末 → 翌月10日」の間に大きな新規設定（資金流入）があると、分配原資は増えないまま口数だけが増加するため1口あたり分配金が薄まります（希薄化）。逆に交換（口数減少）が多いと1口あたり分配金は増えます（濃縮化）。
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {activeRightTab === 'scenarios' && (
                <span className="font-mono text-[#1A1A1A]">目標年利 {(targetYield * 100).toFixed(0)}% 割返し数理モデル</span>
              )}
              {activeRightTab === 'daily_change' && (
                <span className="font-mono text-gray-600">2026/05/01〜直近の日次増減率</span>
              )}
            </div>

            {/* TAB 1: 総発行口数 & 純資産 */}
            {activeRightTab === 'units' && (
              <div className="h-64 sm:h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={sharedChartMargin}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#E5E5E5" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: '#666', fontFamily: 'JetBrains Mono' }}
                      tickLine={false}
                      axisLine={{ stroke: '#1A1A1A' }}
                      minTickGap={25}
                    />
                    <YAxis
                      yAxisId="units"
                      domain={['dataMin - 20000', 'dataMax + 20000']}
                      tick={{ fontSize: 9, fill: '#EA580C', fontFamily: 'JetBrains Mono' }}
                      tickLine={false}
                      axisLine={{ stroke: '#EA580C' }}
                      tickFormatter={(val) => `${(val / 1000).toFixed(0)}k口`}
                    />
                    <YAxis
                      yAxisId="assets"
                      orientation="right"
                      domain={['dataMin - 20', 'dataMax + 20']}
                      tick={{ fontSize: 9, fill: '#1A1A1A', fontFamily: 'JetBrains Mono' }}
                      tickLine={false}
                      axisLine={{ stroke: '#1A1A1A' }}
                      tickFormatter={(val) => `${val}億`}
                    />
                    <Tooltip content={<UnitsCustomTooltip />} />

                    {/* Reference lines for 1st and 2nd Dividend dates */}
                    <ReferenceLine
                      yAxisId="units"
                      x="2026/07/10"
                      stroke="#EA580C"
                      strokeDasharray="3 3"
                      label={{
                        value: '第1回 1,400円',
                        position: 'insideBottomLeft',
                        dy: -6,
                        fill: '#EA580C',
                        fontSize: 10,
                        fontFamily: 'Plus Jakarta Sans',
                        fontWeight: 'bold',
                      }}
                    />
                    <ReferenceLine
                      yAxisId="units"
                      x="2026/08/10"
                      stroke="#EA580C"
                      strokeDasharray="3 3"
                      label={{
                        value: '第2回 900円',
                        position: 'insideBottomLeft',
                        dy: -6,
                        fill: '#EA580C',
                        fontSize: 10,
                        fontFamily: 'Plus Jakarta Sans',
                        fontWeight: 'bold',
                      }}
                    />

                    <Line
                      yAxisId="units"
                      type="monotone"
                      dataKey="total_units"
                      name="総発行口数"
                      stroke="#EA580C"
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      yAxisId="assets"
                      type="monotone"
                      dataKey="net_assets_oku"
                      name="純資産総額"
                      stroke="#1A1A1A"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* TAB 2: 予測シナリオ比較 */}
            {activeRightTab === 'scenarios' && (
              <div className="h-64 sm:h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} margin={sharedChartMargin}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#E5E5E5" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: '#1A1A1A', fontFamily: 'Plus Jakarta Sans', fontWeight: 'bold' }}
                      tickLine={false}
                      axisLine={{ stroke: '#1A1A1A' }}
                    />
                    <YAxis
                      domain={[800, 1600]}
                      tick={{ fontSize: 9, fill: '#666', fontFamily: 'JetBrains Mono' }}
                      tickLine={false}
                      axisLine={{ stroke: '#1A1A1A' }}
                      tickFormatter={(val) => `¥${val}`}
                    />
                    <Tooltip content={<ScenarioCustomTooltip />} />
                    <ReferenceLine
                      y={900}
                      stroke="#B91C1C"
                      strokeDasharray="3 3"
                      label={{
                        value: '前回8/10: 900円',
                        position: 'insideTopLeft',
                        fill: '#B91C1C',
                        fontSize: 9,
                        fontFamily: 'Plus Jakarta Sans',
                        fontWeight: 'bold',
                      }}
                    />
                    <ReferenceLine
                      y={1311}
                      stroke="#1A1A1A"
                      strokeDasharray="4 4"
                      label={{
                        value: '理論値: 1,311円',
                        position: 'insideTopRight',
                        fill: '#1A1A1A',
                        fontSize: 9,
                        fontFamily: 'Plus Jakarta Sans',
                        fontWeight: 'bold',
                      }}
                    />
                    <Bar dataKey="predicted_div" name="予測分配金" radius={[0, 0, 0, 0]}>
                      {barChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.shortName === 'A' ? '#EA580C' : scenarioColors[entry.shortName] || '#1A1A1A'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* TAB 3: 口数増減率 (前日比%) */}
            {activeRightTab === 'daily_change' && (
              <div className="h-64 sm:h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChangeData} margin={sharedChartMargin}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#E5E5E5" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: '#666', fontFamily: 'JetBrains Mono' }}
                      tickLine={false}
                      axisLine={{ stroke: '#1A1A1A' }}
                      minTickGap={20}
                    />
                    <YAxis
                      domain={[-2, 10]}
                      tick={{ fontSize: 9, fill: '#666', fontFamily: 'JetBrains Mono' }}
                      tickLine={false}
                      axisLine={{ stroke: '#1A1A1A' }}
                      tickFormatter={(val) => `${val}%`}
                    />
                    <Tooltip content={<DailyChangeTooltip />} />
                    <ReferenceLine y={0} stroke="#1A1A1A" strokeWidth={1} />
                    <Bar dataKey="daily_change_pct" name="前日比口数増減率(%)" fill="#1A1A1A">
                      {dailyChangeData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.daily_change_pct > 3 ? '#EA580C' : entry.daily_change_pct < 0 ? '#B91C1C' : '#1A1A1A'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="mt-2 pt-2 border-t border-black/10 text-[11px] font-sans text-gray-600 flex justify-between items-center min-h-[22px]">
            {activeRightTab === 'units' && (
              <span>※口数・純資産推移</span>
            )}
            {activeRightTab === 'scenarios' && (
              <span>※バーにマウスオーバーで各シナリオの年利・月利を詳細表示</span>
            )}
            {activeRightTab === 'daily_change' && (
              <span>※2026/05/01 以降の安定期データを表示</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
