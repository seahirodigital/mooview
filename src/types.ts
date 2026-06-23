export type Timeframe = '1m' | '3m' | '5m' | '10m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1mo';
export type ChartDisplayRange = 'd' | 'w' | null;
export type IndicatorLineStyle = 'solid' | 'dashed' | 'dotted' | 'dashdot';

export interface IndicatorConfig {
  id: string;
  type: 'ma' | 'ema' | 'boll' | 'rsi' | 'macd' | 'vrvp';
  params: {
    period?: number;
    periodSlow?: number;
    periodFast?: number;
    periodSignal?: number;
    stdDev?: number;
    colorPrimary?: string;
    colorSecondary?: string;
    colorTertiary?: string;
  };
  enabled: boolean;
}

export interface SymbolIndicatorSettings {
  symbol: string;
  indicators: {
    ma: { enabled: boolean; period1: number; color1: string; style1: IndicatorLineStyle; period2: number; color2: string; style2: IndicatorLineStyle; period3: number; color3: string; style3: IndicatorLineStyle };
    ema: { enabled: boolean; period1: number; color1: string; style1: IndicatorLineStyle; period2: number; color2: string; style2: IndicatorLineStyle };
    boll: { enabled: boolean; period: number; levels: number[]; color: string; colorFill: string; style: IndicatorLineStyle };
    rsi: { enabled: boolean; period: number; color: string; style: IndicatorLineStyle; overbought: number; oversold: number };
    macd: { enabled: boolean; fast: number; slow: number; signal: number; colorMacd: string; styleMacd: IndicatorLineStyle; colorSignal: string; styleSignal: IndicatorLineStyle; colorHistUp: string; colorHistDown: string };
    vrvp: { enabled: boolean; rows: number; widthPct: number; colorUp: string; colorDown: string; colorPoc: string };
  };
}

export interface Candle {
  time: number; // timestamp in seconds
  timeStr: string; // readable time
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartPanel {
  id: string;
  symbol: string;
  watchlistTabId?: string;
  watchlistSectionId?: string;
  timeframe: Timeframe;
  displayRange?: ChartDisplayRange;
  zoomFactor: number; // e.g. how many pixels per candle, from 2 to 40
  scrollOffsetPct: number; // scroll percentage (0=right-most/latest, 100=left-most/oldest)
  showRsi: boolean;
  showMacd: boolean;
  showVolume: boolean;
  comparisonSymbols?: string[];
  priceScale?: number;
  priceOffsetPct?: number;
  rsiHeightPct?: number;
  macdHeightPct?: number;
}

export interface TickerInfo {
  symbol: string;
  name: string;
  basePrice: number;
  dailyChangePct: number;
}
