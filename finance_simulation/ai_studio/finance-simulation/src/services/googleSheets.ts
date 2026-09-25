// MooView サーバーを経由して、Apps Script を正規データストアとして利用する。

export interface GoogleSheetsSyncConfig {
  spreadsheetId: string;
  autoSync: boolean;
  lastSyncedAt: string | null;
}

export const DEFAULT_SHEETS_CONFIG: GoogleSheetsSyncConfig = {
  spreadsheetId: '',
  autoSync: true,
  lastSyncedAt: null,
};

export interface FinanceSheetState {
  assets: any[];
  dividendStocks: any[];
  expenses: any[];
  incomes?: any[];
  sicknessSchedule?: any[];
  simulationConfig?: any;
  timelineColumns?: any[];
  monthlyOverrides?: any;
  customDividendFrequencies?: any[];
  customAssetCategories?: any[];
  customLabels?: Record<string, string>;
  categoryOrder?: string[];
  assetTableLayout?: { columnOrder?: string[]; columnWidths?: Record<string, number> };
  customStyles?: { cells?: Record<string, unknown>; rows?: Record<string, unknown>; cols?: Record<string, unknown> };
}

export interface FinanceCloudSnapshot {
  state: FinanceSheetState;
  revision: string;
  updatedAt: string;
  spreadsheetId?: string;
}

/** スプレッドシート上の表構造と画面のデータ構造を確認しやすくするクリップボード用整形。 */
export function formatDataForGoogleSheets(state: FinanceSheetState) {
  const assetsRows = [
    ['カテゴリ', '資産名称', 'ティッカー', '保有枚数/口数', '平均取得単価', '現在値', '残高(万円)', '金融機関'],
    ...state.assets.map((asset: any) => [asset.category, asset.name, asset.ticker || '', asset.shares || 0, asset.averageCost || 0, asset.currentPrice || '', asset.amount, asset.institution || '']),
  ];
  const dividendRows = [
    ['ティッカー', '銘柄名', '市場', '投資額(万円)', '想定利回り(%)', '分配頻度'],
    ...state.dividendStocks.map((stock: any) => [
      stock.ticker,
      stock.name,
      stock.market,
      stock.investedAmount,
      stock.estimatedYield,
      stock.customFrequencyLabel || stock.frequency || 'monthly',
    ]),
  ];
  const expensesRows = [
    ['項目名', '分類', '月額(万円)'],
    ...state.expenses.map((expense: any) => [expense.name, expense.category, expense.amount]),
  ];
  return { assetsRows, dividendRows, expensesRows };
}

async function requestFinanceSync<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/finance-simulation/${path}`, {
    ...init,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Google スプレッドシート連携に失敗しました。');
  }
  return payload as T;
}

export async function pushToGoogleSheet(
  spreadsheetId: string | undefined,
  _accessToken: string,
  state: FinanceSheetState,
): Promise<{ success: boolean; message: string; snapshot?: FinanceCloudSnapshot }> {
  try {
    const result = await requestFinanceSync<FinanceCloudSnapshot & { message?: string }>('sync', {
      method: 'PUT',
      body: JSON.stringify({ spreadsheetId: spreadsheetId || undefined, state }),
    });
    return {
      success: true,
      message: result.message || 'クラウド元帳へ保存しました。',
      snapshot: result.state ? result : undefined,
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : '書き込みに失敗しました。' };
  }
}

export async function pullFromGoogleSheet(
  spreadsheetId: string | undefined,
  _accessToken: string,
): Promise<{ success: boolean; data?: FinanceSheetState; snapshot?: FinanceCloudSnapshot; message: string }> {
  try {
    const query = spreadsheetId ? `?spreadsheetId=${encodeURIComponent(spreadsheetId)}` : '';
    const result = await requestFinanceSync<FinanceCloudSnapshot & { message?: string }>(
      `sync${query}`,
    );
    return {
      success: true,
      data: result.state,
      snapshot: result.state ? result : undefined,
      message: result.message || 'クラウド元帳から読み込みました。',
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : '読み込みに失敗しました。' };
  }
}
