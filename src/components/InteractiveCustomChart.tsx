import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Candle, IndicatorLineStyle, SymbolIndicatorSettings, Timeframe } from '../types';
import { 
  calculateMA, 
  calculateEMA, 
  calculateBoll, 
  calculateRSI, 
  calculateMACD 
} from '../indicators';
import { Plus, Minus, RotateCcw } from 'lucide-react';

interface InteractiveCustomChartProps {
  symbol: string;
  candles: Candle[];
  timeframe: Timeframe;
  indicatorSettings: SymbolIndicatorSettings;
  zoomFactor: number;
  setZoomFactor: (zf: number) => void;
  scrollOffsetPct: number;
  setScrollOffsetPct: (pct: number) => void;
  showVolume: boolean;
  showRsi: boolean;
  showMacd: boolean;
  comparisonSymbols?: string[];
  comparisonCandles?: Record<string, Candle[]>;
  emptyMessage?: string;
  priceScale: number;
  setPriceScale: (scale: number) => void;
  rsiHeightPct: number;
  setRsiHeightPct: (pct: number) => void;
  macdHeightPct: number;
  setMacdHeightPct: (pct: number) => void;
  onOpenIndicatorSettings?: () => void;
}

function getLineDasharray(style: IndicatorLineStyle): string | undefined {
  switch (style) {
    case 'dashed':
      return '6 4';
    case 'dotted':
      return '1 4';
    case 'dashdot':
      return '7 3 1 3';
    default:
      return undefined;
  }
}

function formatAxisDateLabel(candle: Candle, timeframe: Timeframe): string {
  const date = new Date(candle.time * 1000);
  if (timeframe === '1d' || timeframe === '1w' || timeframe === '1mo') {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  return candle.timeStr.includes(' ') ? candle.timeStr.split(' ')[1] : candle.timeStr;
}

export function InteractiveCustomChart({
  symbol,
  candles,
  timeframe,
  indicatorSettings,
  zoomFactor,
  setZoomFactor,
  scrollOffsetPct,
  setScrollOffsetPct,
  showVolume,
  showRsi,
  showMacd,
  comparisonSymbols = [],
  comparisonCandles = {},
  emptyMessage = 'データを取得中...',
  priceScale,
  setPriceScale,
  rsiHeightPct,
  setRsiHeightPct,
  macdHeightPct,
  setMacdHeightPct,
  onOpenIndicatorSettings,
}: InteractiveCustomChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 500, height: 350 });
  const [hoverData, setHoverData] = useState<{
    candleIdx: number;
    mouseX: number;
    mouseY: number;
  } | null>(null);

  // Drag state for panning
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartOffsetPct, setDragStartOffsetPct] = useState(0);
  const [isScalingPrice, setIsScalingPrice] = useState(false);
  const [priceScaleStartY, setPriceScaleStartY] = useState(0);
  const [priceScaleStartValue, setPriceScaleStartValue] = useState(1);
  const [priceAxisFocused, setPriceAxisFocused] = useState(false);

  // ResizeObserver to automatically map size transitions
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: Math.max(150, entry.contentRect.width),
          height: Math.max(150, entry.contentRect.height),
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const { width, height } = dimensions;

  // Amount of candles to fit in chart width
  // Right margin is 60px for price quotes label column
  const plotWidth = width - 60;
  const maxVisibleCount = Math.floor(plotWidth / zoomFactor);
  const visibleCandleCount = Math.min(candles.length, Math.max(10, maxVisibleCount));

  // Compute indices range based on scroll offset percentage (0 to 100)
  // 100% = latest portion (rightmost/present), 0% = oldest portion (leftmost)
  const totalLength = candles.length;
  const maxScrollIndex = Math.max(0, totalLength - visibleCandleCount);
  
  const scrollIndex = useMemo(() => {
    const pct = Math.max(0, Math.min(100, scrollOffsetPct)) / 100;
    // Standard mapping: scrollPct=100 (pct=1) is present (start index is maxScrollIndex), scrollPct=0 is oldest (start index is 0)
    return Math.floor(pct * maxScrollIndex);
  }, [scrollOffsetPct, maxScrollIndex]);

  const startIndex = Math.max(0, scrollIndex);
  const endIndex = Math.min(totalLength - 1, startIndex + visibleCandleCount - 1);

  const visibleCandles = useMemo(() => {
    return candles.slice(startIndex, endIndex + 1);
  }, [candles, startIndex, endIndex]);

  const indicators = indicatorSettings.indicators;

  // Compute Indicators dynamically
  const ma1 = useMemo(() => calculateMA(candles, indicators.ma.period1), [candles, indicators.ma.period1]);
  const ma2 = useMemo(() => calculateMA(candles, indicators.ma.period2), [candles, indicators.ma.period2]);
  const ma3 = useMemo(() => calculateMA(candles, indicators.ma.period3), [candles, indicators.ma.period3]);

  const ema1 = useMemo(() => calculateEMA(candles, indicators.ema.period1), [candles, indicators.ema.period1]);
  const ema2 = useMemo(() => calculateEMA(candles, indicators.ema.period2), [candles, indicators.ema.period2]);

  const bollLevels = useMemo(
    () => Array.from(new Set(indicators.boll.levels)).sort((a, b) => a - b),
    [indicators.boll.levels]
  );
  const bollResults = useMemo(
    () => bollLevels.map((level) => ({
      level,
      result: calculateBoll(candles, indicators.boll.period, level),
    })),
    [bollLevels, candles, indicators.boll.period]
  );

  const rsi = useMemo(() => calculateRSI(candles, indicators.rsi.period), [candles, indicators.rsi.period]);
  const macd = useMemo(() => calculateMACD(candles, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal), [candles, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal]);

  // Height of sections inside the canvas (percentages of total height)
  const activeRsi = showRsi && indicators.rsi.enabled;
  const activeMacd = showMacd && indicators.macd.enabled;

  const rsiHeight = activeRsi ? Math.max(30, (height * rsiHeightPct) / 100) : 0;
  const macdHeight = activeMacd ? Math.max(30, (height * macdHeightPct) / 100) : 0;
  const mainHeight = Math.max(100, height - rsiHeight - macdHeight);

  // Mouse event handlers for indicators layout dragging inside the chart
  const handleRsiDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const initialRsiPct = rsiHeightPct;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const deltaPct = (deltaY / height) * 100;
      setRsiHeightPct(Math.max(10, Math.min(45, initialRsiPct - deltaPct)));
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMacdDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const initialMacdPct = macdHeightPct;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const deltaPct = (deltaY / height) * 100;
      setMacdHeightPct(Math.max(10, Math.min(45, initialMacdPct - deltaPct)));
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Main starting price at first visible candle index for normalization comparison
  const mainStartPrice = useMemo(() => {
    if (visibleCandles.length === 0) return 1;
    return visibleCandles[0].close;
  }, [visibleCandles]);

  const comparisonCandleMaps = useMemo(() => {
    const result: Record<string, Map<number, Candle>> = {};
    comparisonSymbols.forEach((symbol) => {
      result[symbol] = new Map(
        (comparisonCandles[symbol] || []).map((candle) => [candle.time, candle])
      );
    });
    return result;
  }, [comparisonSymbols, comparisonCandles]);

  // 表示範囲の主銘柄と同じ時刻にある比較銘柄の最初の価格を基準にする
  const compStartPrice = useMemo(() => {
    const result: Record<string, number> = {};
    comparisonSymbols.forEach((symbol) => {
      const candleMap = comparisonCandleMaps[symbol];
      const firstAlignedCandle = visibleCandles
        .map((mainCandle) => candleMap?.get(mainCandle.time))
        .find((candle): candle is Candle => Boolean(candle));
      result[symbol] = firstAlignedCandle?.close || 1;
    });
    return result;
  }, [comparisonSymbols, comparisonCandleMaps, visibleCandles]);

  // Calculate high and low price ranges for scale bounds of visible candles
  const priceMinMax = useMemo(() => {
    if (visibleCandles.length === 0) return { min: 90, max: 110 };

    let highest = -Infinity;
    let lowest = Infinity;

    visibleCandles.forEach((c, idx) => {
      const realIdx = startIndex + idx;
      highest = Math.max(highest, c.high);
      lowest = Math.min(lowest, c.low);

      if (indicators.ma.enabled) {
        if (ma1[realIdx] !== null) highest = Math.max(highest, ma1[realIdx]!);
        if (ma1[realIdx] !== null) lowest = Math.min(lowest, ma1[realIdx]!);
        if (ma2[realIdx] !== null) highest = Math.max(highest, ma2[realIdx]!);
        if (ma2[realIdx] !== null) lowest = Math.min(lowest, ma2[realIdx]!);
        if (ma3[realIdx] !== null) highest = Math.max(highest, ma3[realIdx]!);
        if (ma3[realIdx] !== null) lowest = Math.min(lowest, ma3[realIdx]!);
      }

      if (indicators.ema.enabled) {
        if (ema1[realIdx] !== null) highest = Math.max(highest, ema1[realIdx]!);
        if (ema1[realIdx] !== null) lowest = Math.min(lowest, ema1[realIdx]!);
        if (ema2[realIdx] !== null) highest = Math.max(highest, ema2[realIdx]!);
        if (ema2[realIdx] !== null) lowest = Math.min(lowest, ema2[realIdx]!);
      }

      if (indicators.boll.enabled) {
        bollResults.forEach(({ result }) => {
          if (result.upper[realIdx] !== null) highest = Math.max(highest, result.upper[realIdx]!);
          if (result.lower[realIdx] !== null) lowest = Math.min(lowest, result.lower[realIdx]!);
        });
      }
    });

    // Include overlay comparison symbols in pricing range determination
    comparisonSymbols.forEach((symbol) => {
      const candleMap = comparisonCandleMaps[symbol];
      const startPrice = compStartPrice[symbol] || 1;
      visibleCandles.forEach((mainCandle) => {
        const compCandle = candleMap?.get(mainCandle.time);
        if (compCandle) {
          const ratio = compCandle.close / startPrice;
          const scaledPrice = ratio * mainStartPrice;
          highest = Math.max(highest, scaledPrice);
          lowest = Math.min(lowest, scaledPrice);
        }
      });
    });

    const delta = highest - lowest;
    const pad = delta * 0.05 || 2.0;
    const rawMin = Math.max(0.01, lowest - pad);
    const rawMax = highest + pad;
    const center = (rawMin + rawMax) / 2;
    const halfRange = (rawMax - rawMin) / 2 / Math.max(0.25, priceScale);

    return {
      min: Math.max(0.01, center - halfRange),
      max: center + halfRange
    };
  }, [visibleCandles, startIndex, indicators, ma1, ma2, ma3, ema1, ema2, bollResults, comparisonSymbols, comparisonCandleMaps, compStartPrice, mainStartPrice, priceScale]);

  // Mapping coordinate formulas
  const getX = (sliceIdx: number) => {
    if (visibleCandles.length <= 1) return 0;
    return (sliceIdx / (visibleCandles.length - 1)) * plotWidth;
  };

  const getY = (price: number) => {
    const bottomLabelPadding = 25;
    const plotH = mainHeight - bottomLabelPadding;
    const topMargin = 15;
    const pct = (price - priceMinMax.min) / (priceMinMax.max - priceMinMax.min);
    return plotH - pct * (plotH - topMargin);
  };

  // Volume scale
  const maxVolume = useMemo(() => {
    if (visibleCandles.length === 0) return 1000;
    return Math.max(...visibleCandles.map(c => c.volume), 1000);
  }, [visibleCandles]);

  const volumeProfile = useMemo(() => {
    if (!indicators.vrvp.enabled || visibleCandles.length === 0) {
      return null;
    }

    const rows = Math.max(8, Math.min(80, Math.round(indicators.vrvp.rows)));
    const lowest = Math.min(...visibleCandles.map((candle) => candle.low));
    const highest = Math.max(...visibleCandles.map((candle) => candle.high));
    const step = (highest - lowest) / rows || 1;
    const bins = Array.from({ length: rows }, (_, index) => ({
      low: lowest + index * step,
      high: lowest + (index + 1) * step,
      up: 0,
      down: 0,
      total: 0,
    }));

    visibleCandles.forEach((candle) => {
      const firstBin = Math.max(0, Math.min(rows - 1, Math.floor((candle.low - lowest) / step)));
      const lastBin = Math.max(0, Math.min(rows - 1, Math.floor((candle.high - lowest) / step)));
      const binCount = Math.max(1, lastBin - firstBin + 1);
      const volumePerBin = candle.volume / binCount;
      const isUp = candle.close >= candle.open;

      for (let index = firstBin; index <= lastBin; index += 1) {
        bins[index].total += volumePerBin;
        if (isUp) {
          bins[index].up += volumePerBin;
        } else {
          bins[index].down += volumePerBin;
        }
      }
    });

    const maxTotal = Math.max(...bins.map((bin) => bin.total), 1);
    const pocIndex = bins.reduce(
      (bestIndex, bin, index) => bin.total > bins[bestIndex].total ? index : bestIndex,
      0
    );

    return { bins, maxTotal, pocIndex };
  }, [indicators.vrvp.enabled, indicators.vrvp.rows, visibleCandles]);

  // Dynamic zoom actions
  const adjustZoom = (zoomIn: boolean) => {
    const scale = zoomIn ? 1.25 : 0.8;
    const nextZf = Math.max(2.5, Math.min(45, zoomFactor * scale));
    setZoomFactor(parseFloat(nextZf.toFixed(2)));
  };

  const adjustPriceScale = (zoomIn: boolean) => {
    const multiplier = zoomIn ? 1.12 : 1 / 1.12;
    const nextScale = Math.max(0.25, Math.min(8, priceScale * multiplier));
    setPriceScale(parseFloat(nextScale.toFixed(3)));
  };

  // Reset offset coordinates to latest index
  const snapToPresent = () => {
    setScrollOffsetPct(100); // 100% represents latest in this offset model
  };

  // SVG Mouse Drag Panning handlers
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    if (mouseX >= plotWidth) {
      setPriceAxisFocused(true);
      setIsScalingPrice(true);
      setPriceScaleStartY(e.clientY);
      setPriceScaleStartValue(priceScale);
      return;
    }

    setPriceAxisFocused(false);
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartOffsetPct(scrollOffsetPct);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isScalingPrice) {
      const deltaY = e.clientY - priceScaleStartY;
      const nextScale = priceScaleStartValue * Math.exp(-deltaY / 120);
      setPriceScale(
        parseFloat(Math.max(0.25, Math.min(8, nextScale)).toFixed(3))
      );
      return;
    }

    // Track dragging for pan scroll
    if (isDragging) {
      const dx = e.clientX - dragStartX;
      // Calculate how many candles shifted
      const shiftedCandlesCount = -dx / zoomFactor;
      if (maxScrollIndex > 0) {
        const offsetShiftPct = (shiftedCandlesCount / maxScrollIndex) * 100;
        let nextPct = dragStartOffsetPct + offsetShiftPct;
        nextPct = Math.max(0, Math.min(100, nextPct));
        setScrollOffsetPct(parseFloat(nextPct.toFixed(2)));
      }
      return;
    }

    // Determine hovered candle
    if (visibleCandles.length === 0 || mouseX >= plotWidth) {
      setHoverData(null);
      return;
    }

    const pct = mouseX / plotWidth;
    let sliceIdx = Math.floor(pct * visibleCandles.length);
    sliceIdx = Math.max(0, Math.min(visibleCandles.length - 1, sliceIdx));

    setHoverData({
      candleIdx: startIndex + sliceIdx,
      mouseX,
      mouseY,
    });
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
    setIsScalingPrice(false);
    setHoverData(null);
  };

  useEffect(() => {
    const chartElement = containerRef.current;
    if (!chartElement) return;

    const handleNativeWheel = (event: WheelEvent) => {
      const svg = svgRef.current;
      if (!svg || !(event.target instanceof Node) || !svg.contains(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const rect = svg.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      if (mouseX >= plotWidth || priceAxisFocused) {
        adjustPriceScale(event.deltaY < 0);
      } else {
        adjustZoom(event.deltaY < 0);
      }
    };

    chartElement.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => chartElement.removeEventListener('wheel', handleNativeWheel);
  }, [candles.length, plotWidth, priceAxisFocused, priceScale, zoomFactor]);

  const currentCandle = hoverData ? candles[hoverData.candleIdx] : candles[candles.length - 1];

  // Map polylines paths
  const getPolylinePoints = (valueArray: (number | null)[]) => {
    const pts: string[] = [];
    visibleCandles.forEach((_, i) => {
      const globalIdx = startIndex + i;
      const v = valueArray[globalIdx];
      if (v !== null && v !== undefined) {
        pts.push(`${getX(i)},${getY(v)}`);
      }
    });
    return pts.join(' ');
  };

  // Map comparison lines paths
  const getComparisonPolylinePoints = (sym: string) => {
    const pts: string[] = [];
    const candleMap = comparisonCandleMaps[sym];
    const startPrice = compStartPrice[sym] || 1;
    if (!candleMap) return '';

    visibleCandles.forEach((mainCandle, i) => {
      const compCandle = candleMap.get(mainCandle.time);
      if (compCandle) {
        const ratio = compCandle.close / startPrice;
        const scaledPrice = ratio * mainStartPrice;
        pts.push(`${getX(i)},${getY(scaledPrice)}`);
      }
    });
    return pts.join(' ');
  };

  return (
    <div 
      ref={containerRef}
      className="flex-1 w-full h-full flex flex-col min-h-0 relative select-none"
    >
      
      {/* 1. FLOATING CROSSHAIR INFO BANNER */}
      {currentCandle && (
        <div className="absolute top-2 left-3 bg-[#0d101a]/95 border border-[#232b45] px-2.5 py-1 rounded text-[10px] font-mono text-gray-400 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 pr-6 pointer-events-none shadow max-w-[95%]">
          <span className="text-white font-bold">{symbol}</span>
          <span>日付: <b className="text-[#a5b4fc]">{currentCandle.timeStr}</b></span>
          <span>始: <b className="text-white">{currentCandle.open.toFixed(2)}</b></span>
          <span>高: <b className="text-[#26a69a]">{currentCandle.high.toFixed(2)}</b></span>
          <span>安: <b className="text-[#ef5350]">{currentCandle.low.toFixed(2)}</b></span>
          <span>終: <b className="text-white">{currentCandle.close.toFixed(2)}</b></span>
          <span className="hidden sm:inline">出来高: <b className="text-[#8e98bd]">{currentCandle.volume.toLocaleString()}</b></span>
          
          {/* Legend for comparison symbols */}
          {comparisonSymbols.map((compSym, index) => {
            const lineColors = ['#f3a14b', '#a78bfa', '#22d3ee', '#f43f5e', '#eab308'];
            const color = lineColors[index % lineColors.length];
            const activeCandle = hoverData ? candles[hoverData.candleIdx] : candles[candles.length - 1];
            const compCandle = activeCandle
              ? comparisonCandleMaps[compSym]?.get(activeCandle.time)
              : null;
            const startPrice = compStartPrice[compSym] || 1;
            if (!compCandle) return null;
            const changePct = ((compCandle.close - startPrice) / startPrice) * 100;
            return (
              <span key={compSym} style={{ color }} className="font-bold border-l border-gray-800 pl-2">
                {compSym}: ${compCandle.close.toFixed(2)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
              </span>
            );
          })}
        </div>
      )}

      {/* 2. CHOSEN CHANGER STATE PANEL */}
      <div className="flex-1 w-full h-full relative">
        {candles.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 animate-pulse">
            {emptyMessage}
          </div>
        ) : (
          <svg 
            ref={svgRef}
            width={width}
            height={height}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            onDoubleClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const mouseX = event.clientX - rect.left;
              if (mouseX < plotWidth) {
                onOpenIndicatorSettings?.();
              }
            }}
            className={`w-full h-full bg-[#111320] ${
              isScalingPrice
                ? 'cursor-ns-resize'
                : isDragging
                  ? 'cursor-grabbing'
                  : 'cursor-crosshair'
            }`}
          >
            {/* DEF PLOT GRADIENTS */}
            <defs>
              <linearGradient id={`bollCorridor-${symbol}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={indicators.boll.color} stopOpacity="0.06" />
                <stop offset="100%" stopColor={indicators.boll.color} stopOpacity="0.01" />
              </linearGradient>
              <linearGradient id="bullVolGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#26a69a" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#26a69a" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="bearVolGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ef5350" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#ef5350" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* ================= A. MAIN PRICE GRID AREA ================= */}
            <g>
              <rect
                x={plotWidth}
                y={0}
                width={60}
                height={mainHeight}
                fill={priceAxisFocused ? 'rgba(59, 130, 246, 0.06)' : 'transparent'}
                className="cursor-ns-resize"
              />
              {/* Grid rules */}
              {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
                const bottomLabelPadding = 25;
                const plotH = mainHeight - bottomLabelPadding;
                const topMargin = 15;
                const currY = topMargin + p * (plotH - topMargin);
                const val = priceMinMax.max - p * (priceMinMax.max - priceMinMax.min);
                return (
                  <g key={i}>
                    <line 
                      x1={0} 
                      y1={currY} 
                      x2={plotWidth} 
                      y2={currY} 
                      stroke="#1a1e33" 
                      strokeDasharray="2" 
                    />
                    <text 
                      x={plotWidth + 6} 
                      y={currY + 3.5} 
                      fill="#7a87a7" 
                      fontSize="9" 
                      fontFamily="monospace"
                    >
                      {val.toFixed(2)}
                    </text>
                  </g>
                );
              })}

              {/* Bollinger Corridor */}
              {indicators.boll.enabled && bollResults.length > 0 && (
                <g>
                  {(() => {
                    const outerResult = bollResults[bollResults.length - 1].result;
                    const up: string[] = [];
                    const low: string[] = [];
                    visibleCandles.forEach((_, i) => {
                      const idx = startIndex + i;
                      const uVal = outerResult.upper[idx];
                      const lVal = outerResult.lower[idx];
                      if (uVal !== null && lVal !== null) {
                        up.push(`${getX(i)},${getY(uVal)}`);
                        low.unshift(`${getX(i)},${getY(lVal)}`);
                      }
                    });
                    if (up.length > 0) {
                      return (
                        <polygon 
                          points={[...up, ...low].join(' ')} 
                          fill={`url(#bollCorridor-${symbol})`}
                        />
                      );
                    }
                    return null;
                  })()}

                  {bollResults.map(({ level, result }, index) => {
                    const lastIndex = startIndex + visibleCandles.length - 1;
                    const upperValue = result.upper[lastIndex];
                    const lowerValue = result.lower[lastIndex];
                    const opacity = Math.max(0.45, 0.9 - index * 0.16);
                    const dashArray = getLineDasharray(indicators.boll.style);
                    return (
                      <g key={level}>
                        <polyline points={getPolylinePoints(result.upper)} fill="none" stroke={indicators.boll.color} strokeWidth="1" strokeDasharray={dashArray} opacity={opacity} />
                        <polyline points={getPolylinePoints(result.lower)} fill="none" stroke={indicators.boll.color} strokeWidth="1" strokeDasharray={dashArray} opacity={opacity} />
                        {upperValue !== null && (
                          <text x={plotWidth - 4} y={getY(upperValue) - 2} textAnchor="end" fill={indicators.boll.color} fontSize="8" opacity={opacity}>
                            +{level}σ
                          </text>
                        )}
                        {lowerValue !== null && (
                          <text x={plotWidth - 4} y={getY(lowerValue) + 9} textAnchor="end" fill={indicators.boll.color} fontSize="8" opacity={opacity}>
                            -{level}σ
                          </text>
                        )}
                      </g>
                    );
                  })}
                  <polyline points={getPolylinePoints(bollResults[0].result.middle)} fill="none" stroke={indicators.boll.color} strokeWidth="1" strokeDasharray={getLineDasharray(indicators.boll.style)} opacity="0.4" />
                </g>
              )}

              {volumeProfile && (
                <g opacity="0.8">
                  {volumeProfile.bins.map((bin, index) => {
                    const maxWidth = plotWidth * (Math.max(8, Math.min(45, indicators.vrvp.widthPct)) / 100);
                    const totalWidth = (bin.total / volumeProfile.maxTotal) * maxWidth;
                    const downWidth = bin.total > 0 ? totalWidth * (bin.down / bin.total) : 0;
                    const upWidth = totalWidth - downWidth;
                    const yTop = getY(bin.high);
                    const yBottom = getY(bin.low);
                    const barHeight = Math.max(1, yBottom - yTop - 1);
                    const x = 0;
                    const isPoc = index === volumeProfile.pocIndex;

                    return (
                      <g key={`${bin.low}-${bin.high}`}>
                        <rect
                          x={x}
                          y={yTop}
                          width={downWidth}
                          height={barHeight}
                          fill={isPoc ? indicators.vrvp.colorPoc : indicators.vrvp.colorDown}
                          fillOpacity={isPoc ? 0.8 : 0.5}
                        />
                        <rect
                          x={x + downWidth}
                          y={yTop}
                          width={upWidth}
                          height={barHeight}
                          fill={isPoc ? indicators.vrvp.colorPoc : indicators.vrvp.colorUp}
                          fillOpacity={isPoc ? 0.8 : 0.5}
                        />
                      </g>
                    );
                  })}
                </g>
              )}

              {/* SMAs */}
              {indicators.ma.enabled && (
                <g>
                  <polyline points={getPolylinePoints(ma1)} fill="none" stroke={indicators.ma.color1} strokeWidth="1.2" strokeDasharray={getLineDasharray(indicators.ma.style1)} />
                  <polyline points={getPolylinePoints(ma2)} fill="none" stroke={indicators.ma.color2} strokeWidth="1.2" strokeDasharray={getLineDasharray(indicators.ma.style2)} />
                  <polyline points={getPolylinePoints(ma3)} fill="none" stroke={indicators.ma.color3} strokeWidth="1.2" strokeDasharray={getLineDasharray(indicators.ma.style3)} />
                </g>
              )}

              {/* EMAs */}
              {indicators.ema.enabled && (
                <g>
                  <polyline points={getPolylinePoints(ema1)} fill="none" stroke={indicators.ema.color1} strokeWidth="1.2" strokeDasharray={getLineDasharray(indicators.ema.style1)} />
                  <polyline points={getPolylinePoints(ema2)} fill="none" stroke={indicators.ema.color2} strokeWidth="1.2" strokeDasharray={getLineDasharray(indicators.ema.style2)} />
                </g>
              )}

              {/* Render Comparison/Overlay Lines */}
              {comparisonSymbols.map((compSym, idx) => {
                const lineColors = ['#f3a14b', '#a78bfa', '#22d3ee', '#f43f5e', '#eab308'];
                const strokeColor = lineColors[idx % lineColors.length];
                const pointsStr = getComparisonPolylinePoints(compSym);
                if (!pointsStr) return null;
                return (
                  <polyline 
                    key={compSym} 
                    points={pointsStr} 
                    fill="none" 
                    stroke={strokeColor} 
                    strokeWidth="1.8" 
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.95" 
                  />
                );
              })}

              {/* Render Candlesticks */}
              {visibleCandles.map((c, i) => {
                const xVal = getX(i);
                const w = Math.max(1.5, zoomFactor * 0.75);
                const candleX = xVal - w / 2;

                const openY = getY(c.open);
                const closeY = getY(c.close);
                const highY = getY(c.high);
                const lowY = getY(c.low);

                const isBull = c.close >= c.open;
                const color = isBull ? '#26a69a' : '#ef5350';

                return (
                  <g key={i}>
                    {/* Shadow wick */}
                    <line 
                      x1={xVal} 
                      y1={highY} 
                      x2={xVal} 
                      y2={lowY} 
                      stroke={color} 
                      strokeWidth="1.2" 
                    />
                    {/* Rectangle block */}
                    <rect 
                      x={candleX}
                      y={Math.min(openY, closeY)}
                      width={w}
                      height={Math.max(1.0, Math.abs(openY - closeY))}
                      fill={color}
                      stroke={color}
                      strokeWidth="0.5"
                      rx="0.5"
                    />
                  </g>
                );
              })}

              {/* Bottom Label dates */}
              {visibleCandles.map((c, i) => {
                const drawLabelModulo = Math.max(2, Math.floor(65 / zoomFactor));
                if (i % drawLabelModulo !== 0) return null;
                const xVal = getX(i);
                return (
                  <g key={i}>
                    <line x1={xVal} y1={mainHeight - 25} x2={xVal} y2={mainHeight - 20} stroke="#212640" />
                    <text 
                      x={xVal}
                      y={mainHeight - 8}
                      fill="#576383"
                      fontSize="8"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {formatAxisDateLabel(c, timeframe)}
                    </text>
                  </g>
                );
              })}

              {/* Subtle Volume Overlay at bottom */}
              {showVolume && (
                <g opacity="0.35">
                  {visibleCandles.map((c, i) => {
                    const xVal = getX(i);
                    const w = Math.max(1.0, zoomFactor * 0.75 - 1);
                    const barX = xVal - w / 2;

                    const heightRatio = c.volume / maxVolume;
                    const barH = heightRatio * (mainHeight * 0.20); // 20% max overlay height
                    const barY = mainHeight - 25 - barH;

                    const isBull = c.close >= c.open;
                    const grad = isBull ? 'url(#bullVolGrad)' : 'url(#bearVolGrad)';

                    return (
                      <rect 
                        key={i}
                        x={barX}
                        y={barY}
                        width={w}
                        height={barH}
                        fill={isBull ? '#26a69a' : '#ef5350'}
                        fillOpacity="0.12"
                        stroke={isBull ? '#26a69a' : '#ef5350'}
                        strokeWidth="0.5"
                        strokeOpacity="0.25"
                      />
                    );
                  })}
                </g>
              )}
            </g>

            {/* ================= B. RSI OSCILLATOR AREA ================= */}
            {activeRsi && (
              <g transform={`translate(0, ${mainHeight})`}>
                <rect width={plotWidth} height={rsiHeight} fill="#0b0d18" stroke="#1c213a" strokeWidth="0.5" />
                
                {/* Rules markers */}
                {[indicators.rsi.overbought, 50, indicators.rsi.oversold].map((level) => {
                  const rsiY = rsiHeight - (level / 100) * rsiHeight;
                  const isOuter = level !== 50;
                  return (
                    <g key={level}>
                      <line 
                        x1={0} 
                        y1={rsiY} 
                        x2={plotWidth} 
                        y2={rsiY} 
                        stroke="#1a1e33" 
                        strokeDasharray="2"
                      />
                      <text x={plotWidth + 6} y={rsiY + 3} fill="#4e5a7b" fontSize="8" fontFamily="monospace">
                        {level}
                      </text>
                    </g>
                  );
                })}

                <text x="8" y="14" fill="#8b5cf6" fontSize="8" fontWeight="bold">RSI ({indicators.rsi.period})</text>

                {/* RSI Line */}
                <polyline 
                  points={
                    visibleCandles.map((_, i) => {
                      const idx = startIndex + i;
                      const rsiV = rsi[idx];
                      const rsiY = rsiV !== null ? rsiHeight - (rsiV / 100) * rsiHeight : rsiHeight / 2;
                      return `${getX(i)},${rsiY}`;
                    }).join(' ')
                  }
                  fill="none"
                  stroke={indicators.rsi.color}
                  strokeWidth="1"
                  strokeDasharray={getLineDasharray(indicators.rsi.style)}
                />
              </g>
            )}

            {/* ================= C. MACD DIVERGENCE AREA ================= */}
            {activeMacd && (
              <g transform={`translate(0, ${mainHeight + rsiHeight})`}>
                <rect width={plotWidth} height={macdHeight} fill="#0b0d18" stroke="#1c213a" strokeWidth="0.5" />
                
                {/* Zero center rule */}
                <line x1={0} y1={macdHeight / 2} x2={plotWidth} y2={macdHeight / 2} stroke="#212948" strokeWidth="1" />
                <text x={plotWidth + 6} y={macdHeight / 2 + 3} fill="#566288" fontSize="8" fontFamily="monospace">0.0</text>

                <text x="8" y="14" fill="#2d8cf0" fontSize="8" fontWeight="bold">MACD ({indicators.macd.fast}, {indicators.macd.slow}, {indicators.macd.signal})</text>

                {/* Histogram Bars */}
                {visibleCandles.map((_, i) => {
                  const idx = startIndex + i;
                  const val = macd.hist[idx];
                  if (val === null || val === undefined) return null;

                  // High auto rescaling for scale
                  const scaleFactor = (macdHeight * 0.4) / (priceMinMax.max * 0.04);
                  const barH = val * scaleFactor;
                  const isPos = val >= 0;

                  const w = Math.max(1, zoomFactor * 0.5);
                  const xVal = getX(i);

                  return (
                    <rect 
                      key={i}
                      x={xVal - w / 2}
                      y={isPos ? (macdHeight / 2) - barH : macdHeight / 2}
                      width={w}
                      height={Math.max(1, Math.abs(barH))}
                      fill={isPos ? indicators.macd.colorHistUp : indicators.macd.colorHistDown}
                      fillOpacity="0.5"
                    />
                  );
                })}

                {/* MACD Line */}
                <polyline 
                  points={
                    visibleCandles.map((_, i) => {
                      const idx = startIndex + i;
                      const val = macd.macd[idx];
                      const scaleFactor = (macdHeight * 0.4) / (priceMinMax.max * 0.04);
                      const mY = val !== null ? (macdHeight / 2) - val * scaleFactor : macdHeight / 2;
                      return `${getX(i)},${mY}`;
                    }).join(' ')
                  }
                  fill="none"
                  stroke={indicators.macd.colorMacd}
                  strokeWidth="1"
                  strokeDasharray={getLineDasharray(indicators.macd.styleMacd)}
                />

                {/* Signal Line */}
                <polyline 
                  points={
                    visibleCandles.map((_, i) => {
                      const idx = startIndex + i;
                      const val = macd.signal[idx];
                      const scaleFactor = (macdHeight * 0.4) / (priceMinMax.max * 0.04);
                      const mY = val !== null ? (macdHeight / 2) - val * scaleFactor : macdHeight / 2;
                      return `${getX(i)},${mY}`;
                    }).join(' ')
                  }
                  fill="none"
                  stroke={indicators.macd.colorSignal}
                  strokeWidth="1"
                  strokeDasharray={getLineDasharray(indicators.macd.styleSignal)}
                />
              </g>
            )}

            {/* Visual draggable splitters for indicators */}
            {activeRsi && (
              <g>
                <line
                  x1={0}
                  y1={mainHeight}
                  x2={plotWidth}
                  y2={mainHeight}
                  stroke="#1a1e33"
                  strokeWidth="1"
                  strokeDasharray="2"
                  className="pointer-events-none"
                />
                <line
                  x1={0}
                  y1={mainHeight}
                  x2={plotWidth}
                  y2={mainHeight}
                  stroke="transparent"
                  strokeWidth="12"
                  className="cursor-row-resize"
                  onMouseDown={handleRsiDividerMouseDown}
                />
              </g>
            )}

            {activeMacd && (
              <g>
                <line
                  x1={0}
                  y1={mainHeight + rsiHeight}
                  x2={plotWidth}
                  y2={mainHeight + rsiHeight}
                  stroke="#1a1e33"
                  strokeWidth="1"
                  strokeDasharray="2"
                  className="pointer-events-none"
                />
                <line
                  x1={0}
                  y1={mainHeight + rsiHeight}
                  x2={plotWidth}
                  y2={mainHeight + rsiHeight}
                  stroke="transparent"
                  strokeWidth="12"
                  className="cursor-row-resize"
                  onMouseDown={handleMacdDividerMouseDown}
                />
              </g>
            )}

            {/* ================= D. CURSOR AXIS CROSSHAIRS ================= */}
            {hoverData && hoverData.mouseX < plotWidth && (
              <g>
                <line 
                  x1={hoverData.mouseX} 
                  y1={0} 
                  x2={hoverData.mouseX} 
                  y2={height} 
                  stroke="#47547a" 
                  strokeDasharray="2 2" 
                />

                {hoverData.mouseY < mainHeight && (
                  <line 
                    x1={0} 
                    y1={hoverData.mouseY} 
                    x2={plotWidth} 
                    y2={hoverData.mouseY} 
                    stroke="#47547a" 
                    strokeDasharray="2 2" 
                  />
                )}

                {/* Axis Value display */}
                {hoverData.mouseY < mainHeight && (
                  <g transform={`translate(${plotWidth + 1}, ${hoverData.mouseY - 7})`}>
                    <rect width="55" height="15" fill="#2d3748" rx="2" />
                    <text x="27" y="10.5" fill="white" fontSize="8" fontFamily="monospace" textAnchor="middle">
                      {(() => {
                        const bottomLabelPadding = 25;
                        const plotH = mainHeight - bottomLabelPadding;
                        const topMargin = 15;
                        const pct = (plotH - hoverData.mouseY) / (plotH - topMargin);
                        const calcVal = priceMinMax.min + pct * (priceMinMax.max - priceMinMax.min);
                        return calcVal.toFixed(2);
                      })()}
                    </text>
                  </g>
                )}
              </g>
            )}
          </svg>
        )}

        {/* Floating Zoom overlay controllers */}
        <div className="absolute bottom-4 right-16 flex items-center space-x-1.5 z-10 bg-[#0d101a]/70 p-1 rounded-lg border border-[#212740] backdrop-blur-sm opacity-50 hover:opacity-100 transition-opacity">
          <button 
            type="button"
            onClick={() => adjustZoom(true)}
            className="w-6 h-6 bg-[#171a2b] border border-gray-800 text-gray-300 hover:text-[#26a69a] flex items-center justify-center hover:bg-gray-800 rounded transition"
            title="拡大"
          >
            <Plus size={11} className="stroke-[2.5]" />
          </button>
          
          <button 
            type="button"
            onClick={() => adjustZoom(false)}
            className="w-6 h-6 bg-[#171a2b] border border-gray-800 text-gray-300 hover:text-[#26a69a] flex items-center justify-center hover:bg-gray-800 rounded transition"
            title="縮小"
          >
            <Minus size={11} className="stroke-[2.5]" />
          </button>

          <button 
            type="button"
            onClick={snapToPresent}
            className="w-6 h-6 bg-[#171a2b] border border-gray-800 text-gray-300 hover:text-white flex items-center justify-center hover:bg-gray-800 rounded text-[9px] font-mono transition"
            title="最新データまで移動"
          >
            <RotateCcw size={10} />
          </button>
        </div>

        {/* Scroll back viewport banner notifier */}
        {scrollIndex < maxScrollIndex - 1 && (
          <div 
            onClick={snapToPresent}
            className="absolute bottom-4 left-4 bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 text-[9px] px-2.5 py-1 rounded font-mono font-bold cursor-pointer hover:bg-yellow-500/20 shadow flex items-center"
          >
            <span>◀ 過去データに移動中 (クリックで最新へ追従)</span>
          </div>
        )}

      </div>

    </div>
  );
}
