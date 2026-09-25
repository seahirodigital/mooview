export interface YahooFinanceQuote {
  symbol: string;
  price: number;
  currency?: string;
  exchangeName?: string;
  marketTime?: number;
  /** 株価は1株、国内投信の基準価額は1万口あたりで返す。 */
  priceBasis: 'per_share' | 'per_10000_units';
  instrumentType: 'stock' | 'jp_fund';
  name?: string;
  aliases?: string[];
}

interface CachedFundQuote {
  quote: YahooFinanceQuote;
  expiresAt: number;
}

const JP_FUND_CODE_PATTERN = /^\d{7,8}$/;
const FUND_QUOTE_CACHE_MS = 15 * 60 * 1000;
const fundQuoteCache = new Map<string, CachedFundQuote>();

/** Yahoo Finance Japanで使われる国内投資信託の8桁コードかを判定する。 */
export function normalizeJapaneseFundCode(rawTicker: unknown): string | null {
  const value = String(rawTicker ?? '').trim().toUpperCase().replace(/^JP\./, '');
  return JP_FUND_CODE_PATTERN.test(value) ? value.padStart(8, '0') : null;
}

export function normalizeYahooFinanceSymbol(rawTicker: unknown): string {
  const raw = String(rawTicker ?? '').trim().toUpperCase();
  if (!raw) return '';
  if (raw.startsWith('US.')) return raw.slice(3);
  if (raw.startsWith('JP.')) return `${raw.slice(3)}.T`;
  if (raw.startsWith('HK.')) return `${raw.slice(3)}.HK`;
  if (raw.endsWith('.JP')) return `${raw.slice(0, -3)}.T`;
  if (raw.endsWith('.US')) return raw.slice(0, -3);
  if (raw.endsWith('.T') || raw.endsWith('.HK')) return raw;
  if (/^\d{3,5}[A-Z]?$/.test(raw)) return `${raw}.T`;
  return raw;
}

/**
 * Yahoo Finance Japanの投信詳細ページから基準価額を取得する。
 * 投信コードは公開Chart APIのシンボルではないため、株価APIとは別経路にする。
 * ブラウザではなくサーバーで取得し、短時間の繰り返しアクセスを避けるためキャッシュする。
 */
async function fetchYahooJapanFundQuote(code: string): Promise<YahooFinanceQuote> {
  const cached = fundQuoteCache.get(code);
  if (cached && cached.expiresAt > Date.now()) return cached.quote;

  const endpoint = `https://finance.yahoo.co.jp/quote/${encodeURIComponent(code)}`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (compatible; MooView/1.0; +https://mooview-oci.taild87712.ts.net/)',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Yahoo Finance Japan HTTP ${response.status}`);

  const html = await response.text();
  // ページの埋め込み状態と表示用HTMLの双方を許容し、表示基準価額だけを取り出す。
  const priceText = html.match(/\\"price\\":\{\\"value\\":\\"([\d,]+)\\"/i)?.[1]
    || html.match(/_CommonPriceBoard__price[^>]*>[\s\S]{0,1000}?_StyledNumber__value[^>]*>([\d,]+)</i)?.[1];
  const price = Number((priceText || '').replace(/,/g, ''));
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`${code}の投信基準価額をYahoo Finance Japanから取得できません。`);
  }

  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  const name = title?.replace(new RegExp(`【${code}】.*$`), '').trim();
  const nickname = html.match(/\\"nickName\\":\\"([^\"]*)\\"/i)?.[1]?.trim();
  const quote: YahooFinanceQuote = {
    symbol: code,
    price,
    currency: 'JPY',
    exchangeName: 'Yahoo Finance Japan 投資信託',
    priceBasis: 'per_10000_units',
    instrumentType: 'jp_fund',
    name: name || undefined,
    aliases: nickname ? [nickname] : undefined,
  };
  fundQuoteCache.set(code, { quote, expiresAt: Date.now() + FUND_QUOTE_CACHE_MS });
  return quote;
}

export async function fetchYahooFinanceQuote(rawTicker: unknown): Promise<YahooFinanceQuote> {
  const fundCode = normalizeJapaneseFundCode(rawTicker);
  if (fundCode) return fetchYahooJapanFundQuote(fundCode);

  const symbol = normalizeYahooFinanceSymbol(rawTicker);
  if (!symbol) throw new Error('Yahoo Financeのティッカーが空です。');

  const endpoint = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  endpoint.searchParams.set('range', '1d');
  endpoint.searchParams.set('interval', '1m');
  endpoint.searchParams.set('includePrePost', 'true');
  const response = await fetch(endpoint, {
    headers: { Accept: 'application/json', 'User-Agent': 'MooView/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Yahoo Finance HTTP ${response.status}`);

  const payload = await response.json() as {
    chart?: { result?: Array<{ meta?: Record<string, unknown>; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }>; error?: { description?: string } | null };
  };
  const result = payload.chart?.result?.[0];
  const meta = result?.meta;
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const latestClose = [...closes].reverse().find((value) => Number.isFinite(Number(value)));
  const price = Number(meta?.regularMarketPrice ?? latestClose);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(payload.chart?.error?.description || `${symbol}の現在値をYahoo Financeから取得できません。`);
  }
  return {
    symbol,
    price,
    currency: typeof meta?.currency === 'string' ? meta.currency : undefined,
    exchangeName: typeof meta?.exchangeName === 'string' ? meta.exchangeName : undefined,
    marketTime: Number.isFinite(Number(meta?.regularMarketTime)) ? Number(meta?.regularMarketTime) : undefined,
    priceBasis: 'per_share',
    instrumentType: 'stock',
  };
}
