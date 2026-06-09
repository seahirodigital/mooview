export type MoomooAction = 'status' | 'quote' | 'kline';

export interface MoomooGatewayResult {
  success?: boolean;
  connected?: boolean;
  error?: string;
  [key: string]: unknown;
}

function getGatewayUrl(): string {
  const configuredUrl = process.env.MOOMOO_GATEWAY_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, '');
  }
  if (process.env.VERCEL) {
    throw new Error('MOOMOO_GATEWAY_URLがVercelに設定されていません。');
  }
  return 'http://127.0.0.1:8787';
}

export async function callMoomooGateway(
  action: MoomooAction,
  payload: Record<string, unknown> = {},
): Promise<{ status: number; data: MoomooGatewayResult }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const gatewayKey = process.env.MOOMOO_GATEWAY_KEY?.trim();
    if (gatewayKey) {
      headers.Authorization = `Bearer ${gatewayKey}`;
    }

    const response = await fetch(`${getGatewayUrl()}/v1/${action}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let data: MoomooGatewayResult;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {
        success: false,
        connected: false,
        error: 'Moomooゲートウェイから不正な応答を受信しました。',
      };
    }
    return { status: response.status, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 502,
      data: {
        success: false,
        connected: false,
        error: `Moomooゲートウェイへ接続できません: ${message}`,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}
