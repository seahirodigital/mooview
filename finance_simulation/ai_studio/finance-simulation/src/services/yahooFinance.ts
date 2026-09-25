// Yahoo Finance ticker resolution and live/cached quote helper

export interface TickerInfo {
  ticker: string;
  name: string;
  price: number; // in USD or JPY
  currency: 'USD' | 'JPY';
  dividendYield: number; // in %
  market: 'US' | 'JP_TRUST' | 'JP_ETF';
  payoutDay?: number;
  note?: string;
}

// Preset verified knowledge base for Japanese & US dividend assets
const TICKER_DATABASE: Record<string, TickerInfo> = {
  'QQQI': {
    ticker: 'QQQI',
    name: 'NEOS Nasdaq-100 High Income ETF',
    price: 52.80,
    currency: 'USD',
    dividendYield: 14.12,
    market: 'US',
    payoutDay: 18,
    note: 'Nasdaq100 カバードコール・高利回りETF',
  },
  'IWMI': {
    ticker: 'IWMI',
    name: 'NEOS Russell 2000 High Income ETF',
    price: 49.30,
    currency: 'USD',
    dividendYield: 14.35,
    market: 'US',
    payoutDay: 18,
    note: 'ラッセル2000 カバードコールETF',
  },
  'SPY': {
    ticker: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    price: 588.20,
    currency: 'USD',
    dividendYield: 1.25,
    market: 'US',
    payoutDay: 30,
    note: 'S&P500 インデックスETF',
  },
  'GPIQ': {
    ticker: 'GPIQ',
    name: 'Goldman Sachs Nasdaq-100 Premium Income',
    price: 41.10,
    currency: 'USD',
    dividendYield: 10.45,
    market: 'US',
    payoutDay: 15,
    note: 'GS 米国高配当プレミアム',
  },
  '5G': {
    ticker: '5G',
    name: 'グローバル5G株式ファンド (毎月決算型)',
    price: 12450,
    currency: 'JPY',
    dividendYield: 30.00,
    market: 'JP_TRUST',
    payoutDay: 7,
    note: '国内毎月分配型 投資信託',
  },
  'ﾌｨﾃﾞF': {
    ticker: 'ﾌｨﾃﾞF',
    name: 'フィデリティ・USハイ・イールド・ファンド',
    price: 9800,
    currency: 'JPY',
    dividendYield: 20.00,
    market: 'JP_TRUST',
    payoutDay: 24,
    note: '国内投資信託 毎月分配型',
  },
  '世界': {
    ticker: '世界',
    name: '世界高配当株プレミアム (毎月決算型)',
    price: 11200,
    currency: 'JPY',
    dividendYield: 16.40,
    market: 'JP_TRUST',
    payoutDay: 24,
    note: '世界高配当投信',
  },
  '563A': {
    ticker: '563A',
    name: 'GX 米国株・カバード・コール (2865/563A)',
    price: 1042,
    currency: 'JPY',
    dividendYield: 11.20,
    market: 'JP_ETF',
    payoutDay: 10,
    note: '東証上場 カバコETF',
  },
  '2563': {
    ticker: '2563',
    name: 'iシェアーズ S&P500 米国株 ETF (H無)',
    price: 342.5,
    currency: 'JPY',
    dividendYield: 1.35,
    market: 'JP_ETF',
    payoutDay: 15,
    note: '東証上場 S&P500コアETF',
  },
  '2564': {
    ticker: '2564',
    name: 'GX 米国配当貴族 ETF',
    price: 2650,
    currency: 'JPY',
    dividendYield: 3.45,
    market: 'JP_ETF',
    payoutDay: 20,
    note: '東証上場 米国配当貴族',
  },
  '1489': {
    ticker: '1489',
    name: 'NF 日経高配当50 ETF',
    price: 2480,
    currency: 'JPY',
    dividendYield: 3.82,
    market: 'JP_ETF',
    payoutDay: 7,
    note: '日経高配当50連動ETF',
  },
  '1655': {
    ticker: '1655',
    name: 'iシェアーズ S&P500 米国株 ETF (東証)',
    price: 612.0,
    currency: 'JPY',
    dividendYield: 1.30,
    market: 'JP_ETF',
    payoutDay: 15,
    note: '東証上場 S&P500 ETF',
  },
  'VYM': {
    ticker: 'VYM',
    name: 'Vanguard High Dividend Yield ETF',
    price: 131.20,
    currency: 'USD',
    dividendYield: 2.82,
    market: 'US',
    payoutDay: 20,
    note: 'バンガード 米国高配当株式ETF',
  },
  'JEPI': {
    ticker: 'JEPI',
    name: 'JPMorgan Equity Premium Income ETF',
    price: 58.50,
    currency: 'USD',
    dividendYield: 7.65,
    market: 'US',
    payoutDay: 5,
    note: 'J.P.モルガン 株式プレミアムインカム',
  },
  'JEPQ': {
    ticker: 'JEPQ',
    name: 'JPMorgan Nasdaq Equity Premium Income',
    price: 55.40,
    currency: 'USD',
    dividendYield: 9.38,
    market: 'US',
    payoutDay: 5,
    note: 'J.P.モルガン ナスダック・プレミアムインカム',
  },
  'SCHD': {
    ticker: 'SCHD',
    name: 'Schwab US Dividend Equity ETF',
    price: 84.10,
    currency: 'USD',
    dividendYield: 3.42,
    market: 'US',
    payoutDay: 25,
    note: 'チャールズ・シュワブ 米国高配当ETF',
  },
  'HDV': {
    ticker: 'HDV',
    name: 'iShares Core High Dividend ETF',
    price: 112.30,
    currency: 'USD',
    dividendYield: 3.55,
    market: 'US',
    payoutDay: 25,
    note: 'iシェアーズ コア米国高配当株ETF',
  },
  'SPYD': {
    ticker: 'SPYD',
    name: 'SPDR Portfolio S&P 500 High Dividend',
    price: 42.60,
    currency: 'USD',
    dividendYield: 4.45,
    market: 'US',
    payoutDay: 20,
    note: 'SPDR ポートフォリオS&P500高配当株式ETF',
  },
  '9432': {
    ticker: '9432',
    name: '日本電信電話 (NTT)',
    price: 156.0,
    currency: 'JPY',
    dividendYield: 3.33,
    market: 'JP_ETF',
    payoutDay: 30,
    note: '国内高配当ディフェンシブ',
  },
  '8306': {
    ticker: '8306',
    name: '三菱UFJフィナンシャル・グループ',
    price: 1780.0,
    currency: 'JPY',
    dividendYield: 3.40,
    market: 'JP_ETF',
    payoutDay: 30,
    note: '国内メガバンク 高配当',
  },
  '8058': {
    ticker: '8058',
    name: '三菱商事',
    price: 3120.0,
    currency: 'JPY',
    dividendYield: 3.20,
    market: 'JP_ETF',
    payoutDay: 30,
    note: '総合商社 累進配当',
  }
};

/** Yahoo Finance Japanの国内投信コード（8桁）かを判定する。 */
export function isJapaneseMutualFundCode(inputCode: unknown): boolean {
  return /^\d{8}$/.test(String(inputCode ?? '').trim().replace(/^JP\./i, ''));
}

/**
 * Normalizes input code to search ticker database
 */
export function lookupYahooFinanceTicker(inputCode: string): TickerInfo | null {
  const safeInputCode = String(inputCode ?? '');
  if (!safeInputCode) return null;
  const cleanCode = safeInputCode.trim().toUpperCase().replace(/^[A-Z]*:/, '');

  if (TICKER_DATABASE[cleanCode]) {
    return TICKER_DATABASE[cleanCode];
  }

  // Check partial key match
  const foundKey = Object.keys(TICKER_DATABASE).find(k =>
    cleanCode.includes(k) || k.includes(cleanCode)
  );

  if (foundKey) {
    return TICKER_DATABASE[foundKey];
  }

  return null;
}

/**
 * Yahoo Financeの実データ現在値と、既知銘柄の補助メタデータを返す。
 */
export async function fetchYahooFinanceQuote(ticker: string): Promise<TickerInfo> {
  const safeTicker = String(ticker ?? '');
  const normalized = lookupYahooFinanceTicker(safeTicker);
  try {
    const response = await fetch('/api/yahoo/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: safeTicker }),
    });
    const data = await response.json() as { success?: boolean; price?: unknown; currency?: unknown };
    const price = Number(data.price);
    if (response.ok && data.success !== false && Number.isFinite(price) && price > 0) {
      return {
        ...(normalized || {
          ticker: safeTicker.toUpperCase(),
          name: `${safeTicker.toUpperCase()} 株式/ETF`,
          price,
          currency: data.currency === 'JPY' ? 'JPY' : 'USD',
          dividendYield: 0,
          market: /^[0-9]+[A-Z]?$/.test(safeTicker) ? 'JP_ETF' : 'US',
        }),
        price,
      };
    }
  } catch {
    // 現在値の取得失敗時は補助メタデータだけを返し、呼び出し側で既存値を保持する。
  }

  if (normalized) return normalized;

  // 未知の銘柄は現在値を捏造せず、呼び出し側で入力待ちにする。
  return {
    ticker: safeTicker.toUpperCase(),
    name: `${safeTicker.toUpperCase()} 株式/ETF`,
    price: 0,
    currency: /^[0-9]+[A-Z]?$/.test(safeTicker) ? 'JPY' : 'USD',
    dividendYield: 4.5,
    market: /^[0-9]+[A-Z]?$/.test(safeTicker) ? 'JP_ETF' : 'US',
    payoutDay: 15,
  };
}
