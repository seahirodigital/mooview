const GAS_URL_ENV = 'FINANCE_SIMULATION_GAS_URL';
const GAS_TOKEN_ENV = 'FINANCE_SIMULATION_SYNC_TOKEN';

function gasEndpoint(): string {
  const endpoint = process.env[GAS_URL_ENV]?.trim();
  if (!endpoint) {
    throw new Error('財務シミュレーションのGoogleスプレッドシート連携はまだサーバー設定されていません。');
  }
  return endpoint;
}

function syncToken(): string {
  const token = process.env[GAS_TOKEN_ENV]?.trim();
  if (!token) {
    throw new Error('財務シミュレーション同期トークンがサーバーへ設定されていません。');
  }
  return token;
}

async function parseGasResponse(response: Response): Promise<any> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || 'Google Apps Scriptとの同期に失敗しました。');
  }
  return body;
}

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function readGasWithRetry(endpoint: URL): Promise<any> {
  let lastError: unknown;
  // Apps Script のコールドスタートや一時ロックを、端末側の同期失敗として扱わない。
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await parseGasResponse(await fetch(endpoint, { signal: AbortSignal.timeout(18_000) }));
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(700 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Google Apps Scriptとの同期に失敗しました。');
}

export async function readFinanceSimulationSheet(spreadsheetId: string): Promise<any> {
  const endpoint = new URL(gasEndpoint());
  endpoint.searchParams.set('action', 'read');
  endpoint.searchParams.set('spreadsheetId', spreadsheetId);
  endpoint.searchParams.set('token', syncToken());
  return readGasWithRetry(endpoint);
}

export async function writeFinanceSimulationSheet(spreadsheetId: string, state: unknown): Promise<any> {
  return parseGasResponse(await fetch(gasEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'write', spreadsheetId, token: syncToken(), state }),
    signal: AbortSignal.timeout(20_000),
  }));
}
