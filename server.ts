import 'dotenv/config';

import { spawn, type ChildProcess } from 'child_process';
import express from 'express';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import { handleMoomooRequest } from './server/moomooHandler.js';
import { resolveMoomooGatewayKey } from './server/moomooClient.js';
import { handleGeminiChartAnalysis } from './server/geminiHandler.js';
import {
  startDiscordAutomationScheduler,
  triggerDiscordAutomationJob,
} from './server/discordAutomation.js';
import {
  readDiscordAutomationRuns,
  readDiscordAutomationSettings,
  writeDiscordAutomationSettings,
} from './server/discordAutomationStore.js';
import {
  normalizeSharedWorkspaceProfile,
  readSharedWorkspaceSettings,
  sharedWorkspaceSettingsEnabled,
  writeSharedWorkspaceSettings,
} from './server/workspaceSettingsStore.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST?.trim() || '0.0.0.0';
let gatewayProcess: ChildProcess | null = null;

app.use(express.json({ limit: '20mb' }));

function workspaceSettingsOriginAllowed(origin: string, requestHost: string): boolean {
  try {
    const originUrl = new URL(origin);
    if (originUrl.host === requestHost) {
      return true;
    }
    return ['localhost', '127.0.0.1', '::1'].includes(originUrl.hostname);
  } catch {
    return false;
  }
}

app.use('/api/workspace-settings', (request, response, next) => {
  const origin = request.get('origin');
  if (origin) {
    if (!workspaceSettingsOriginAllowed(origin, request.get('host') || '')) {
      response.status(403).json({ error: '許可されていないオリジンです。' });
      return;
    }
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }
  next();
});

app.get('/api/workspace-settings', async (request, response) => {
  try {
    const profile = normalizeSharedWorkspaceProfile(request.query.profile);
    response.json(await readSharedWorkspaceSettings(profile));
  } catch (error) {
    console.error('共有設定の読み込みに失敗しました。', error);
    response.status(500).json({ error: '共有設定の読み込みに失敗しました。' });
  }
});

app.put('/api/workspace-settings', async (request, response) => {
  if (!sharedWorkspaceSettingsEnabled()) {
    response.status(404).json({ error: '共有設定保存は無効です。' });
    return;
  }
  try {
    const profile = normalizeSharedWorkspaceProfile(request.query.profile);
    const saved = await writeSharedWorkspaceSettings(
      profile,
      request.body?.settings,
      request.body?.expectedRevision,
      request.body?.force === true,
    );
    response.json(saved);
  } catch (error) {
    const isConflict = error instanceof Error
      && (error as Error & { code?: string }).code === 'REVISION_CONFLICT';
    response.status(isConflict ? 409 : 400).json({
      error: error instanceof Error ? error.message : '共有設定の保存に失敗しました。',
    });
  }
});

app.use('/api/ai', (request, response, next) => {
  const origin = request.get('origin');
  if (origin && !workspaceSettingsOriginAllowed(origin, request.get('host') || '')) {
    response.status(403).json({ error: '許可されていないオリジンです。' });
    return;
  }
  next();
});

app.post('/api/ai/chart-analysis', (request, response) => {
  void handleGeminiChartAnalysis(request, response);
});

app.use('/api/discord-automation', (request, response, next) => {
  const origin = request.get('origin');
  if (origin) {
    if (!workspaceSettingsOriginAllowed(origin, request.get('host') || '')) {
      response.status(403).json({ error: '許可されていないオリジンです。' });
      return;
    }
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }
  next();
});

app.get('/api/discord-automation/settings', async (_request, response) => {
  try {
    response.json(await readDiscordAutomationSettings());
  } catch (error) {
    console.error('Discord自動通知設定の読み込みに失敗しました。', error);
    response.status(500).json({ error: 'Discord自動通知設定の読み込みに失敗しました。' });
  }
});

app.put('/api/discord-automation/settings', async (request, response) => {
  try {
    response.json(await writeDiscordAutomationSettings(request.body?.settings));
  } catch (error) {
    console.error('Discord自動通知設定の保存に失敗しました。', error);
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Discord自動通知設定の保存に失敗しました。',
    });
  }
});

app.get('/api/discord-automation/runs', async (_request, response) => {
  try {
    response.json(await readDiscordAutomationRuns());
  } catch (error) {
    console.error('Discord自動通知履歴の読み込みに失敗しました。', error);
    response.status(500).json({ error: 'Discord自動通知履歴の読み込みに失敗しました。' });
  }
});

app.post('/api/discord-automation/jobs/:jobId/run', async (request, response) => {
  try {
    const settings = await readDiscordAutomationSettings();
    const job = settings.jobs.find((candidate) => candidate.id === request.params.jobId);
    if (!job) {
      response.status(404).json({ error: '指定された自動通知設定が見つかりません。' });
      return;
    }
    if (!settings.discordEnabled || !job.enabled) {
      response.status(409).json({ error: 'Discord通知またはこの自動通知設定がOFFです。' });
      return;
    }
    void triggerDiscordAutomationJob(port, job).catch((error) => {
      console.error('Discord自動通知の手動実行に失敗しました。', error instanceof Error ? error.message : error);
    });
    response.status(202).json({ message: 'Discord自動通知を開始しました。実行履歴で結果を確認してください。' });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Discord自動通知を開始できませんでした。',
    });
  }
});

app.post('/api/moomoo/status', (request, response) =>
  handleMoomooRequest('status', request, response),
);
app.post('/api/moomoo/quote', (request, response) =>
  handleMoomooRequest('quote', request, response),
);
app.post('/api/moomoo/quotes', (request, response) =>
  handleMoomooRequest('quotes', request, response),
);
app.post('/api/moomoo/kline', (request, response) =>
  handleMoomooRequest('kline', request, response),
);
app.post('/api/moomoo/search', (request, response) =>
  handleMoomooRequest('search', request, response),
);

function getGatewayUrl(): URL {
  return new URL(process.env.MOOMOO_GATEWAY_URL || 'http://127.0.0.1:8787');
}

function isLocalGateway(url: URL): boolean {
  return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
}

function resolveLocalPython(): string {
  const configuredPython = process.env.MOOMOO_PYTHON?.trim();
  if (configuredPython) {
    return path.resolve(configuredPython);
  }

  if (process.platform === 'win32') {
    const localAppData =
      process.env.LOCALAPPDATA ||
      path.join(os.homedir(), 'AppData', 'Local');
    return path.join(
      localAppData,
      'mooview',
      'venv',
      'Scripts',
      'python.exe',
    );
  }
  return path.join(os.homedir(), '.local', 'share', 'mooview', 'venv', 'bin', 'python');
}

async function gatewayIsHealthy(url: URL): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const gatewayKey = resolveMoomooGatewayKey();
    if (gatewayKey) {
      headers.Authorization = `Bearer ${gatewayKey}`;
    }
    const response = await fetch(new URL('/v1/status', url), {
      method: 'POST',
      headers,
      body: '{}',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function localPortIsOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(700);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function selectLocalGatewayUrl(preferredUrl: URL): Promise<URL> {
  const preferredPort = Number(preferredUrl.port || 8787);
  for (let portOffset = 0; portOffset < 10; portOffset += 1) {
    const candidateUrl = new URL(preferredUrl.toString());
    candidateUrl.port = String(preferredPort + portOffset);
    if (await gatewayIsHealthy(candidateUrl)) {
      return candidateUrl;
    }
    if (!(await localPortIsOpen(candidateUrl.hostname, Number(candidateUrl.port)))) {
      return candidateUrl;
    }
  }
  return preferredUrl;
}

async function waitForGateway(url: URL): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await gatewayIsHealthy(url)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Moomooゲートウェイが起動しませんでした: ${url.origin}`);
}

async function ensureLocalGateway(): Promise<void> {
  let gatewayUrl = getGatewayUrl();
  if (
    process.env.VERCEL ||
    process.env.MOOMOO_GATEWAY_AUTOSTART === 'false' ||
    !isLocalGateway(gatewayUrl)
  ) {
    return;
  }

  gatewayUrl = await selectLocalGatewayUrl(gatewayUrl);
  process.env.MOOMOO_GATEWAY_URL = gatewayUrl.origin;
  if (await gatewayIsHealthy(gatewayUrl)) {
    return;
  }

  const pythonPath = resolveLocalPython();
  const gatewayScript = path.resolve(process.cwd(), 'moomoo_gateway.py');
  const gatewayKey = resolveMoomooGatewayKey();
  if (!fs.existsSync(pythonPath)) {
    throw new Error(`Moomoo用Pythonが見つかりません: ${pythonPath}`);
  }
  if (!fs.existsSync(gatewayScript)) {
    throw new Error(`ゲートウェイスクリプトが見つかりません: ${gatewayScript}`);
  }

  gatewayProcess = spawn(pythonPath, [gatewayScript], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MOOMOO_GATEWAY_KEY: gatewayKey,
      MOOMOO_GATEWAY_HOST: gatewayUrl.hostname,
      MOOMOO_GATEWAY_PORT: gatewayUrl.port || '8787',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });
  gatewayProcess.once('error', (error) => {
    console.error(`Moomooゲートウェイの起動に失敗しました: ${error.message}`);
  });
  gatewayProcess.once('exit', (code) => {
    if (code && code !== 0) {
      console.error(`Moomooゲートウェイが終了しました: code=${code}`);
    }
    gatewayProcess = null;
  });

  await waitForGateway(gatewayUrl);
  console.log(`Moomooゲートウェイ接続完了: ${gatewayUrl.origin}`);
}

function stopGateway(): void {
  if (gatewayProcess && !gatewayProcess.killed) {
    gatewayProcess.kill();
  }
}

async function startServer(): Promise<void> {
  try {
    await ensureLocalGateway();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }

  if (process.env.NODE_ENV !== 'production') {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : undefined,
        watch: hmrDisabled ? null : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_request, response) => {
      response.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, host, () => {
    console.log(`MooViewサーバー起動: http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`);
    startDiscordAutomationScheduler({ port });
  });
}

process.once('SIGINT', () => {
  stopGateway();
  process.exit(0);
});
process.once('SIGTERM', () => {
  stopGateway();
  process.exit(0);
});

startServer();
