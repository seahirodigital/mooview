export type Timeframe = '1m' | '3m' | '5m' | '10m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1mo';

export interface IndicatorConfig {
  id: string;
  type: 'ma' | 'ema' | 'boll' | 'rsi' | 'macd';
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
    ma: { enabled: boolean; period1: number; color1: string; period2: number; color2: string; period3: number; color3: string };
    ema: { enabled: boolean; period1: number; color1: string; period2: number; color2: string };
    boll: { enabled: boolean; period: number; stdDev: number; color: string; colorFill: string };
    rsi: { enabled: boolean; period: number; color: string; overbought: number; oversold: number };
    macd: { enabled: boolean; fast: number; slow: number; signal: number; colorMacd: string; colorSignal: string; colorHistUp: string; colorHistDown: string };
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
  timeframe: Timeframe;
  zoomFactor: number; // e.g. how many pixels per candle, from 2 to 40
  scrollOffsetPct: number; // scroll percentage (0=right-most/latest, 100=left-most/oldest)
  showRsi: boolean;
  showMacd: boolean;
  showVolume: boolean;
  comparisonSymbols?: string[];
  priceScale?: number;
  rsiHeightPct?: number;
  macdHeightPct?: number;
}

export interface TickerInfo {
  symbol: string;
  name: string;
  basePrice: number;
  dailyChangePct: number;
}
