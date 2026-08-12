import http, { type IncomingMessage, type ServerResponse } from 'http';
import fs from 'fs/promises';
import path from 'path';

import {
  createPublicGeminiError,
  generateGeminiContent,
  type GeminiInlineData,
} from './geminiHandler';
import { callMoomooGateway, type MoomooAction } from './moomooClient';
import {
  startDiscordAutomationScheduler,
  triggerDiscordAutomationJob,
} from './discordAutomation';
import { readDiscordAutomationSettings } from './discordAutomationStore';
import { readSharedWorkspaceSettings } from './workspaceSettingsStore';

const WORKER_HOST = '127.0.0.1';
const WORKER_PORT = Number(process.env.MOOVIEW_DISCORD_AUTOMATION_WORKER_PORT || 3001);
const DIST_DIRECTORY = path.resolve(process.cwd(), 'dist');
const MAX_JSON_BYTES = 16 * 1024 * 1024;

const STATIC_MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += bytes.length;
    if (received > MAX_JSON_BYTES) {
      throw new Error('リクエストのサイズが上限を超えています。');
    }
    chunks.push(bytes);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('リクエスト形式が正しくありません。');
  }
  return value as Record<string, unknown>;
}

async function handleWorkspaceSettings(response: ServerResponse): Promise<void> {
  try {
    writeJson(response, 200, await readSharedWorkspaceSettings('desktop'));
  } catch (error) {
    console.error('Discord専用ワーカー: 共有ワークスペース設定の読み込みに失敗しました。', error);
    writeJson(response, 500, { error: '共有ワークスペース設定を読み込めませんでした。' });
  }
}

async function handleMoomoo(
  action: MoomooAction,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const payload = await readJsonBody(request);
    const result = await callMoomooGateway(action, payload);
    writeJson(response, result.status, result.data);
  } catch (error) {
    writeJson(response, 400, {
      success: false,
      error: error instanceof Error ? error.message : 'Moomooリクエストの形式が正しくありません。',
    });
  }
}

function normalizeGeminiMedia(value: unknown): GeminiInlineData[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const source = item as Partial<GeminiInlineData>;
    const mimeType = typeof source.mimeType === 'string' ? source.mimeType.trim() : '';
    const data = typeof source.data === 'string' ? source.data.trim() : '';
    return mimeType && data ? [{ mimeType, data }] : [];
  });
}

async function handleGeminiAnalysis(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody(request);
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const media = normalizeGeminiMedia(body.media ?? body.images);
    const model = typeof body.model === 'string' ? body.model : undefined;
    if (!prompt || media.length === 0) {
      writeJson(response, 400, { error: 'Geminiへ送るプロンプトまたはチャートがありません。' });
      return;
    }
    writeJson(response, 200, await generateGeminiContent(prompt, media, model));
  } catch (error) {
    const publicError = createPublicGeminiError(error);
    console.error('Discord専用ワーカー: Geminiチャート分析に失敗しました。', publicError.message);
    writeJson(response, publicError.status, { error: publicError.message });
  }
}

async function handleManualRun(
  jobId: string,
  response: ServerResponse,
): Promise<void> {
  try {
    const settings = await readDiscordAutomationSettings();
    const job = settings.jobs.find((candidate) => candidate.id === jobId);
    if (!job) {
      writeJson(response, 404, { error: '指定したDiscord自動通知設定が見つかりません。' });
      return;
    }
    if (!settings.discordEnabled || !job.enabled) {
      writeJson(response, 409, { error: 'Discord通知またはこの設定がOFFです。' });
      return;
    }
    void triggerDiscordAutomationJob(WORKER_PORT, job).catch((error) => {
      console.error('Discord専用ワーカー: 手動実行に失敗しました。', error);
    });
    writeJson(response, 202, { message: 'Discord自動通知を開始しました。' });
  } catch (error) {
    writeJson(response, 500, {
      error: error instanceof Error ? error.message : 'Discord自動通知を開始できませんでした。',
    });
  }
}

function resolvedStaticPath(urlPath: string): string | null {
  const requested = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const target = path.resolve(DIST_DIRECTORY, requested);
  const relative = path.relative(DIST_DIRECTORY, target);
  return relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' ? target : null;
}

async function serveStatic(urlPath: string, response: ServerResponse): Promise<void> {
  const target = resolvedStaticPath(urlPath);
  if (!target) {
    writeJson(response, 403, { error: '許可されていないパスです。' });
    return;
  }
  try {
    const bytes = await fs.readFile(target);
    response.writeHead(200, {
      'Content-Type': STATIC_MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': bytes.length,
      'Cache-Control': path.basename(target) === 'index.html' ? 'no-store' : 'public, max-age=3600',
    });
    response.end(bytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !path.extname(urlPath)) {
      await serveStatic('/', response);
      return;
    }
    writeJson(response, 404, { error: 'ファイルが見つかりません。' });
  }
}

const server = http.createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url || '/', `http://${WORKER_HOST}:${WORKER_PORT}`);
    const actionMatch = /^\/api\/moomoo\/(status|quote|quotes|kline|search)$/.exec(url.pathname);
    const manualMatch = /^\/api\/discord-automation\/jobs\/([a-zA-Z0-9-]+)\/run$/.exec(url.pathname);

    if (request.method === 'GET' && url.pathname === '/api/workspace-settings') {
      await handleWorkspaceSettings(response);
      return;
    }
    if (request.method === 'POST' && actionMatch) {
      await handleMoomoo(actionMatch[1] as MoomooAction, request, response);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/ai/chart-analysis') {
      await handleGeminiAnalysis(request, response);
      return;
    }
    if (request.method === 'POST' && manualMatch) {
      await handleManualRun(manualMatch[1], response);
      return;
    }
    if (request.method === 'GET') {
      await serveStatic(url.pathname, response);
      return;
    }
    writeJson(response, 405, { error: 'このメソッドは利用できません。' });
  })().catch((error) => {
    console.error('Discord専用ワーカー: リクエスト処理に失敗しました。', error);
    if (!response.headersSent) writeJson(response, 500, { error: 'Discord専用ワーカーでエラーが発生しました。' });
    else response.destroy();
  });
});

server.listen(WORKER_PORT, WORKER_HOST, () => {
  console.log(`Discord専用ワーカー起動: http://${WORKER_HOST}:${WORKER_PORT}`);
  startDiscordAutomationScheduler({ port: WORKER_PORT });
});
