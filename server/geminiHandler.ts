import type { GoogleGenAI } from '@google/genai';
import type { Request, Response } from 'express';
import {
  DEFAULT_GEMINI_CHART_MODEL,
  isGeminiChartModelId,
  normalizeGeminiChartModelId,
} from '../geminiModels';

const MAX_PROMPT_LENGTH = 30_000;
const MAX_MEDIA_COUNT = 12;
const MAX_TOTAL_MEDIA_BYTES = 14 * 1024 * 1024;
const RETRY_DELAYS_MS = [700, 1_500];
const ALLOWED_MEDIA_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/mp4',
]);

interface GeminiChartMedia {
  mimeType: string;
  data: string;
}

function normalizePrompt(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMedia(value: unknown): GeminiChartMedia[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('画像・動画データの形式が正しくありません。');
    }
    const source = entry as Partial<GeminiChartMedia>;
    const mimeType = typeof source.mimeType === 'string' ? source.mimeType.trim() : '';
    const data = typeof source.data === 'string' ? source.data.trim() : '';
    if (!ALLOWED_MEDIA_MIME_TYPES.has(mimeType) || !data) {
      throw new Error('対応していない画像・動画データです。');
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
      throw new Error('画像・動画データの形式が正しくありません。');
    }
    return { mimeType, data };
  });
}

function resolveErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const source = error as { status?: unknown; code?: unknown };
  const status = Number(source.status ?? source.code);
  return Number.isInteger(status) ? status : null;
}

function isRetryableGeminiError(error: unknown): boolean {
  const status = resolveErrorStatus(error);
  if (status === 429 || (status !== null && status >= 500)) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('unavailable')
    || message.includes('resource exhausted')
    || message.includes('timeout');
}

async function generateWithRetry(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
  media: GeminiChartMedia[],
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          ...media.map((item) => ({
            inlineData: {
              mimeType: item.mimeType,
              data: item.data,
            },
          })),
          { text: prompt },
        ],
        config: {
          ...(model.startsWith('gemini-2.5-') ? { temperature: 0.2 } : {}),
          maxOutputTokens: 4_096,
        },
      });
      const text = response.text?.trim() || '';
      if (!text) {
        throw new Error('Geminiから文章が返されませんでした。');
      }
      return text;
    } catch (error) {
      lastError = error;
      if (attempt >= RETRY_DELAYS_MS.length || !isRetryableGeminiError(error)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}

async function generateWithFallback(
  ai: GoogleGenAI,
  requestedModel: string,
  prompt: string,
  media: GeminiChartMedia[],
): Promise<{ text: string; model: string }> {
  try {
    return {
      text: await generateWithRetry(ai, requestedModel, prompt, media),
      model: requestedModel,
    };
  } catch (primaryError) {
    // 選択中のモデルが利用できない、または一時的に処理できない場合でも、
    // 自動通知を止めないよう指定どおりGemini 2.5 Flashへ切り替える。
    if (requestedModel === DEFAULT_GEMINI_CHART_MODEL) {
      throw primaryError;
    }
    console.warn('選択されたGeminiモデルでの分析に失敗したため、Gemini 2.5 Flashへ切り替えます。', {
      requestedModel,
      status: resolveErrorStatus(primaryError),
    });
    return {
      text: await generateWithRetry(ai, DEFAULT_GEMINI_CHART_MODEL, prompt, media),
      model: DEFAULT_GEMINI_CHART_MODEL,
    };
  }
}

function createPublicError(error: unknown): { status: number; message: string } {
  const upstreamStatus = resolveErrorStatus(error);
  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return {
      status: 502,
      message: 'Gemini APIキーが無効か、モデルを利用する権限がありません。',
    };
  }
  if (upstreamStatus === 429) {
    return {
      status: 429,
      message: 'Gemini APIの利用上限に達しました。時間を置いて再実行してください。',
    };
  }
  if (upstreamStatus !== null && upstreamStatus >= 500) {
    return {
      status: 502,
      message: 'Gemini APIが一時的に利用できません。時間を置いて再実行してください。',
    };
  }
  return {
    status: 502,
    message: error instanceof Error && error.message === 'Geminiから文章が返されませんでした。'
      ? error.message
      : 'Geminiによるチャート分析に失敗しました。',
  };
}

export async function handleGeminiChartAnalysis(
  request: Request,
  response: Response,
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || '';
  if (!apiKey) {
    response.status(503).json({
      error: 'Gemini APIキーがサーバーに設定されていません。',
    });
    return;
  }

  try {
    const prompt = normalizePrompt(request.body?.prompt);
    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
      response.status(400).json({
        error: `AIプロンプトは1文字以上${MAX_PROMPT_LENGTH.toLocaleString('ja-JP')}文字以内で入力してください。`,
      });
      return;
    }

    let media: GeminiChartMedia[];
    try {
      // 旧クライアントのimagesも受け付け、動画ONの新クライアントはmediaを使う。
      media = normalizeMedia(request.body?.media ?? request.body?.images);
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : '画像・動画データの形式が正しくありません。',
      });
      return;
    }
    if (media.length === 0 || media.length > MAX_MEDIA_COUNT) {
      response.status(400).json({
        error: `Geminiへ送るチャート画像・動画は1件以上${MAX_MEDIA_COUNT}件以内で指定してください。`,
      });
      return;
    }

    const totalMediaBytes = media.reduce(
      (total, item) => total + Buffer.byteLength(item.data, 'base64'),
      0,
    );
    if (totalMediaBytes > MAX_TOTAL_MEDIA_BYTES) {
      response.status(413).json({
        error: 'Geminiへ送る画像・動画の合計容量が大きすぎます。対象チャートを減らしてください。',
      });
      return;
    }

    const requestedModel = request.body?.model;
    if (requestedModel !== undefined && !isGeminiChartModelId(requestedModel)) {
      response.status(400).json({
        error: '選択されたGeminiモデルは利用できません。',
      });
      return;
    }
    const configuredModel = process.env.GEMINI_MODEL?.trim()
      || DEFAULT_GEMINI_CHART_MODEL;
    const model = requestedModel === undefined
      ? normalizeGeminiChartModelId(configuredModel)
      : requestedModel.trim();
    // サーバー起動時の認証モジュール読み込みを避け、AI実行時だけSDKを初期化する。
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const result = await generateWithFallback(ai, model, prompt, media);
    response.json(result);
  } catch (error) {
    console.error('Geminiチャート分析に失敗しました。', {
      status: resolveErrorStatus(error),
      message: error instanceof Error ? error.message : String(error),
    });
    const publicError = createPublicError(error);
    response.status(publicError.status).json({ error: publicError.message });
  }
}
