import { Candle, Timeframe, TickerInfo } from './types';

// Simple seedable random number generator for reproducible charts
export function createRng(seedStr: string) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = (Math.imul(31, h) + seedStr.charCodeAt(i)) | 0;
  }
  return function() {
    h = (Math.imul(h, 48271) + 1) | 0;
    return (h >>> 0) / 2147483648;
  };
}

export const DEFAULT_TICKERS: TickerInfo[] = [
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', basePrice: 512.45, dailyChangePct: 0.18 },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust (Nasdaq 100)', basePrice: 442.20, dailyChangePct: -0.45 },
  { symbol: 'AAPL', name: 'Apple Inc.', basePrice: 189.60, dailyChangePct: 1.25 },
  { symbol: 'MSFT', name: 'Microsoft Corporation', basePrice: 415.50, dailyChangePct: -0.12 },
  { symbol: 'TSLA', name: 'Tesla, Inc.', basePrice: 178.40, dailyChangePct: -3.42 },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', basePrice: 915.10, dailyChangePct: 4.80 },
  { symbol: 'BTC_USD', name: 'Bitcoin / US Dollar', basePrice: 68500.00, dailyChangePct: 2.10 },
];

export function getIntervalSeconds(timeframe: Timeframe): number {
  switch (timeframe) {
    case '1m': return 60;
    case '3m': return 180;
    case '5m': return 300;
    case '10m': return 600;
    case '30m': return 1800;
    case '1h': return 3600;
    case '4h': return 14400;
    case '1d': return 86450; // Use close values
    case '1w': return 604800;
    case '1mo': return 2592000;
    default: return 86400;
  }
}

export function formatDate(timestampSec: number, timeframe: Timeframe): string {
  const date = new Date(timestampSec * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  
  if (timeframe === '1d' || timeframe === '1w' || timeframe === '1mo') {
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
  } else {
    return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}

export function generateCandles(
  symbol: string,
  timeframe: Timeframe,
  count: number = 300
): Candle[] {
  const rng = createRng(symbol + timeframe);
  
  // Find ticker specific details or make up
  const ticker = DEFAULT_TICKERS.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase()) || 
                 { symbol: symbol.toUpperCase(), name: `${symbol.toUpperCase()} Stock`, basePrice: 150 + rng() * 300, dailyChangePct: (rng() - 0.5) * 4 };
  
  let price = ticker.basePrice;
  const interval = getIntervalSeconds(timeframe);
  const now = Math.floor(Date.now() / 1000);
  
  // High and low volatility based on the asset
  let volatility = 0.0015; // base volatility per step
  if (symbol.includes('BTC') || symbol.toUpperCase() === 'TSLA') {
    volatility = 0.0045; // crypto / high volatile
  } else if (symbol.toUpperCase() === 'VOO') {
    volatility = 0.0008; // index funds stable
  }
  
  // Scale volatility based on timeframe duration
  // More time = more volatility
  const timeframeMultiplier = {
    '1m': 1,
    '3m': 1.5,
    '5m': 2,
    '10m': 2.5,
    '30m': 4,
    '1h': 6,
    '4h': 10,
    '1d': 20,
    '1w': 40,
    '1mo': 80,
  }[timeframe] || 1;

  const stepVol = volatility * timeframeMultiplier;
  
  const candles: Candle[] = [];
  
  // Initial starting price back in time
  // Run brownian motion forwards, but start from a backwards-calculated value
  let curPrice = price * (1 + (rng() - 0.5) * 0.2); // slight offset
  
  // Generate a random-walk line first to resolve open-close relationships neatly
  const prices: number[] = [curPrice];
  const noiseSeed = rng() * 100;
  
  for (let i = 1; i < count; i++) {
    // Add trend + some seasonal sine wave + random noise
    const trend = (rng() - 0.495) * stepVol * 0.15; // slight positive bias
    const cycle = Math.sin((i + noiseSeed) / 15) * stepVol * 0.3;
    const noise = (rng() - 0.5) * stepVol;
    
    curPrice = curPrice * (1 + trend + cycle + noise);
    if (curPrice < 1) curPrice = 1; // protect boundaries
    prices.push(curPrice);
  }
  
  // Create candlesticks from price trend
  for (let i = 0; i < count; i++) {
    const itemClose = prices[i];
    const itemOpen = i === 0 ? itemClose * (1 + (rng() - 0.5) * stepVol * 0.1) : prices[i - 1];
    
    // Create random high/low wicks
    const maxVal = Math.max(itemOpen, itemClose);
    const minVal = Math.min(itemOpen, itemClose);
    
    const wickHighOffset = rng() * stepVol * 0.7 * maxVal;
    const wickLowOffset = rng() * stepVol * 0.7 * minVal;
    
    const high = maxVal + wickHighOffset;
    const low = Math.max(0.1, minVal - wickLowOffset);
    
    // Scale volume based on candle range and asset
    const baseVolume = symbol.toUpperCase() === 'VOO' ? 1000000 : 250000;
    const volumeMultiplier = 0.5 + rng() * 1.5;
    const candleSpreadPct = (high - low) / low;
    const candleSpreadMultiplier = 1 + candleSpreadPct * 40;
    
    const volume = Math.floor(baseVolume * volumeMultiplier * candleSpreadMultiplier);
    
    const time = now - (count - 1 - i) * interval;
    
    candles.push({
      time,
      timeStr: formatDate(time, timeframe),
      open: Number(itemOpen.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(itemClose.toFixed(2)),
      volume: volume
    });
  }
  
  return candles;
}

// Generate a tick for real-time performance
export function simulateTick(lastCandle: Candle, volatilityPct: number = 0.0005): Candle {
  const change = 1 + (Math.random() - 0.5) * volatilityPct;
  const newClose = Number((lastCandle.close * change).toFixed(2));
  const newHigh = Number(Math.max(lastCandle.high, newClose).toFixed(2));
  const newLow = Number(Math.min(lastCandle.low, newClose).toFixed(2));
  
  return {
    ...lastCandle,
    close: newClose,
    high: newHigh,
    low: newLow,
    volume: lastCandle.volume + Math.floor(Math.random() * 500)
  };
}
