import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export type MoomooAction = 'status' | 'quote' | 'quotes' | 'kline' | 'search';

export interface MoomooGatewayResult {
  success?: boolean;
  connected?: boolean;
  error?: string;
  [key: string]: unknown;
}

let cachedGatewayKey: string | null | undefined;

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

function readProductionTunnelGatewayKey(): string {
  if (process.platform !== 'win32') return '';
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const encryptedKeyPath = path.join(
    localAppData,
    'mooview',
    'production-tunnel',
    'gateway-key.dpapi',
  );
  if (!fs.existsSync(encryptedKeyPath)) return '';

  const command = [
    '$encryptedValue = (Get-Content -LiteralPath $env:MOOVIEW_GATEWAY_KEY_PATH -Raw).Trim()',
    '$secureValue = $encryptedValue | ConvertTo-SecureString',
    '$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)',
    'try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }',
    'finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }',
  ].join('; ');

  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        MOOVIEW_GATEWAY_KEY_PATH: encryptedKeyPath,
      },
      timeout: 5000,
      windowsHide: true,
    },
  );

  if (result.status !== 0) return '';
  return result.stdout.trim();
}

export function resolveMoomooGatewayKey(): string {
  const configuredKey = process.env.MOOMOO_GATEWAY_KEY?.trim();
  if (configuredKey) return configuredKey;
  if (cachedGatewayKey !== undefined) return cachedGatewayKey || '';
  cachedGatewayKey = readProductionTunnelGatewayKey() || null;
  return cachedGatewayKey || '';
}

export async function callMoomooGateway(
  action: MoomooAction,
  payload: Record<string, unknown> = {},
): Promise<{ status: number; data: MoomooGatewayResult }> {
  const controller = new AbortController();
  const timeoutMs =
    action === 'quotes' ? 30000
    : action === 'kline' || action === 'search' ? 20000
    : 10000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const gatewayKey = resolveMoomooGatewayKey();
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
    if (response.status === 401) {
      data = {
        ...data,
        success: false,
        connected: false,
        error: 'Moomooゲートウェイ認証に失敗しました。ローカルゲートウェイとNodeサーバーのMOOMOO_GATEWAY_KEYが一致していません。',
      };
    }
    return { status: response.status, data };
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? `リクエストが${Math.ceil(timeoutMs / 1000)}秒でタイムアウトしました`
      : error instanceof Error ? error.message : String(error);
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
