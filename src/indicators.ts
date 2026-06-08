import { Candle } from './types';

export function calculateMA(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += candles[i - j].close;
      }
      result.push(Number((sum / period).toFixed(2)));
    }
  }
  return result;
}

export function calculateEMA(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  if (candles.length === 0) return result;
  
  const k = 2 / (period + 1);
  let prevEma = candles[0].close;
  result.push(prevEma);
  
  for (let i = 1; i < candles.length; i++) {
    const curEma = candles[i].close * k + prevEma * (1 - k);
    result.push(Number(curEma.toFixed(2)));
    prevEma = curEma;
  }
  
  // Mark first few periods as null as they are ramping up
  for (let i = 0; i < Math.min(period - 1, candles.length); i++) {
    result[i] = null;
  }
  return result;
}

export interface BollResult {
  middle: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
}

export function calculateBoll(candles: Candle[], period: number, stdDevMultiplier: number): BollResult {
  const middle: (number | null)[] = [];
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      middle.push(null);
      upper.push(null);
      lower.push(null);
    } else {
      // Calculate SMA
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += candles[i - j].close;
      }
      const mean = sum / period;
      
      // Calculate StdDev
      let varianceSum = 0;
      for (let j = 0; j < period; j++) {
        const diff = candles[i - j].close - mean;
        varianceSum += diff * diff;
      }
      const stdDev = Math.sqrt(varianceSum / period);
      
      const up = mean + stdDevMultiplier * stdDev;
      const dn = mean - stdDevMultiplier * stdDev;
      
      middle.push(Number(mean.toFixed(2)));
      upper.push(Number(up.toFixed(2)));
      lower.push(Number(dn.toFixed(2)));
    }
  }
  
  return { middle, upper, lower };
}

export function calculateRSI(candles: Candle[], period: number): (number | null)[] {
  const rsi: (number | null)[] = [];
  if (candles.length < 2) {
    return Array(candles.length).fill(null);
  }
  
  const gains: number[] = [];
  const losses: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }
  
  // First RSI value calculations
  let avgGain = 0;
  let avgLoss = 0;
  
  for (let i = 0; i < candles.length; i++) {
    if (i <= period) {
      rsi.push(null);
      if (i > 0 && i <= period) {
        avgGain += gains[i - 1];
        avgLoss += losses[i - 1];
      }
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
      }
    } else {
      // Wilder's smoothing technique
      avgGain = (avgGain * (period - 1) + gains[i - 1]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period;
      
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const currentRsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
      rsi.push(Number(currentRsi.toFixed(2)));
    }
  }
  
  return rsi;
}

export interface MacdResult {
  macd: (number | null)[];
  signal: (number | null)[];
  hist: (number | null)[];
}

export function calculateMACD(
  candles: Candle[], 
  fast: number, 
  slow: number, 
  signalPeriod: number
): MacdResult {
  const macdLine: (number | null)[] = [];
  const signalLine: (number | null)[] = [];
  const histogram: (number | null)[] = [];
  
  if (candles.length === 0) {
    return { macd: [], signal: [], hist: [] };
  }
  
  const emaFast = calculateEMA(candles, fast);
  const emaSlow = calculateEMA(candles, slow);
  
  // Calculate MACD line = EMA(fast) - EMA(slow)
  const tempMacdLine: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const f = emaFast[i];
    const s = emaSlow[i];
    if (f !== null && s !== null) {
      const val = f - s;
      macdLine.push(Number(val.toFixed(3)));
      tempMacdLine.push(val);
    } else {
      macdLine.push(null);
      tempMacdLine.push(0); // placeholder
    }
  }
  
  // Calculate Signal line = EMA of MACD Line
  const k = 2 / (signalPeriod + 1);
  let firstValidMacdIdx = -1;
  for (let i = 0; i < candles.length; i++) {
    if (macdLine[i] !== null) {
      firstValidMacdIdx = i;
      break;
    }
  }
  
  if (firstValidMacdIdx === -1) {
    return {
      macd: macdLine,
      signal: Array(candles.length).fill(null),
      hist: Array(candles.length).fill(null)
    };
  }
  
  let prevSignal = tempMacdLine[firstValidMacdIdx];
  for (let i = 0; i < candles.length; i++) {
    if (i < firstValidMacdIdx + signalPeriod - 1) {
      signalLine.push(null);
      histogram.push(null);
    } else if (i === firstValidMacdIdx + signalPeriod - 1) {
      // average to seed
      let sum = 0;
      for (let j = 0; j < signalPeriod; j++) {
        sum += tempMacdLine[i - j];
      }
      prevSignal = sum / signalPeriod;
      signalLine.push(Number(prevSignal.toFixed(3)));
      
      const curMacd = macdLine[i];
      histogram.push(curMacd !== null ? Number((curMacd - prevSignal).toFixed(3)) : null);
    } else {
      const curSignal = tempMacdLine[i] * k + prevSignal * (1 - k);
      signalLine.push(Number(curSignal.toFixed(3)));
      
      const curMacd = macdLine[i];
      histogram.push(curMacd !== null ? Number((curMacd - curSignal).toFixed(3)) : null);
      prevSignal = curSignal;
    }
  }
  
  return { macd: macdLine, signal: signalLine, hist: histogram };
}
