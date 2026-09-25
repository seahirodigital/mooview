export type YahooPriceBasis = 'per_share' | 'per_10000_units';

export interface YahooFinanceCurrentQuote {
  price: number;
  currency?: string;
  priceBasis: YahooPriceBasis;
  instrumentType: 'stock' | 'jp_fund';
  name?: string;
  aliases?: string[];
}

/** 国内投資信託のYahoo Finance Japanコード（8桁）かを判定する。 */
export function isJapaneseMutualFundCode(rawTicker: unknown): boolean {
  return /^\d{7,8}$/.test(String(rawTicker ?? '').trim().replace(/^JP\./i, ''));
}

/** 資産一覧が使う万円単位へ、株数または投信口数から評価額を換算する。 */
export function calculateAssetAmountManYen(
  price: number,
  units: number,
  priceBasis: YahooPriceBasis,
  currency: string = 'JPY',
  usdJpy: number = 1,
): number {
  const divisor = priceBasis === 'per_10000_units' ? 100_000_000 : 10_000;
  const jpyPrice = currency.toUpperCase() === 'USD' ? price * usdJpy : price;
  return Math.round((jpyPrice * units / divisor) * 10) / 10;
}

let usdJpyCache: { value: number; expiresAt: number } | null = null;

/** Yahoo Financeから米ドル/円を取得する。短時間は同じ値を再利用する。 */
export async function fetchYahooFinanceUsdJpy(): Promise<number | null> {
  if (usdJpyCache && usdJpyCache.expiresAt > Date.now()) return usdJpyCache.value;
  const symbol = 'USDJPY=X';
  if (typeof window === 'undefined') return null;
  try {
    const response = await fetch('/api/yahoo/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    });
    if (!response.ok) return null;
    const data = await response.json() as { success?: boolean; price?: unknown };
    const value = Number(data.price);
    if (data.success === false || !Number.isFinite(value) || value <= 0) return null;
    usdJpyCache = { value, expiresAt: Date.now() + 60_000 };
    return value;
  } catch {
    return null;
  }
}

/**
 * Yahoo Financeの実データAPIから現在値を取得する。
 * 取得できない場合はnullを返し、画面上の既存値を壊さない。
 */
export function normalizeYahooSymbol(rawTicker: unknown): string {
  const value = String(rawTicker ?? '').trim().toUpperCase();
  if (!value) return '';
  if (value.startsWith('JP.')) return `${value.slice(3)}.T`;
  if (value.startsWith('US.')) return value.slice(3);
  if (value.startsWith('HK.')) return `${value.slice(3)}.HK`;
  if (value.endsWith('.T') || value.endsWith('.HK')) return value;
  if (/^\d{3,5}[A-Z]?$/.test(value)) return `${value}.T`;
  return value;
}

export async function fetchYahooFinanceCurrentQuote(rawTicker: unknown): Promise<YahooFinanceCurrentQuote | null> {
  const symbol = normalizeYahooSymbol(rawTicker);
  if (!symbol || typeof window === 'undefined') return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('/api/yahoo/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json() as {
      success?: boolean;
      price?: unknown;
      currency?: unknown;
      priceBasis?: unknown;
      instrumentType?: unknown;
      name?: unknown;
      aliases?: unknown;
    };
    const price = Number(data.price);
    if (data.success === false || !Number.isFinite(price) || price <= 0) return null;
    const priceBasis: YahooPriceBasis = data.priceBasis === 'per_10000_units'
      ? 'per_10000_units'
      : 'per_share';
    return {
      price,
      currency: typeof data.currency === 'string' ? data.currency : undefined,
      priceBasis,
      instrumentType: data.instrumentType === 'jp_fund' ? 'jp_fund' : 'stock',
      name: typeof data.name === 'string' ? data.name : undefined,
      aliases: Array.isArray(data.aliases) ? data.aliases.filter((value): value is string => typeof value === 'string') : undefined,
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}
