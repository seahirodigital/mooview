import { GoogleGenAI } from '@google/genai';
import type { Request, Response } from 'express';
import {
  DEFAULT_GEMINI_CHART_MODEL,
  isGeminiChartModelId,
  normalizeGeminiChartModelId,
} from '../geminiModels';

const MAX_PROMPT_LENGTH = 30_000;
const MAX_IMAGE_COUNT = 12;
const MAX_TOTAL_IMAGE_BYTES = 14 * 1024 * 1024;
const RETRY_DELAYS_MS = [700, 1_500];
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

interface GeminiChartImage {
  mimeType: string;
  data: string;
}

function normalizePrompt(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeImages(value: unknown): GeminiChartImage[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('画像データの形式が正しくありません。');
    }
    const source = entry as Partial<GeminiChartImage>;
    const mimeType = typeof source.mimeType === 'string' ? source.mimeType.trim() : '';
    const data = typeof source.data === 'string' ? source.data.trim() : '';
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType) || !data) {
      throw new Error('対応していない画像データです。');
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
      throw new Error('画像データの形式が正しくありません。');
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
  images: GeminiChartImage[],
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          ...images.map((image) => ({
            inlineData: {
              mimeType: image.mimeType,
              data: image.data,
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

    let images: GeminiChartImage[];
    try {
      images = normalizeImages(request.body?.images);
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : '画像データの形式が正しくありません。',
      });
      return;
    }
    if (images.length === 0 || images.length > MAX_IMAGE_COUNT) {
      response.status(400).json({
        error: `チャート画像は1枚以上${MAX_IMAGE_COUNT}枚以内で指定してください。`,
      });
      return;
    }

    const totalImageBytes = images.reduce(
      (total, image) => total + Buffer.byteLength(image.data, 'base64'),
      0,
    );
    if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
      response.status(413).json({
        error: '選択した画像の合計容量が大きすぎます。対象チャートを減らしてください。',
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
    const ai = new GoogleGenAI({ apiKey });
    const text = await generateWithRetry(ai, model, prompt, images);
    response.json({ text, model });
  } catch (error) {
    console.error('Geminiチャート分析に失敗しました。', {
      status: resolveErrorStatus(error),
      message: error instanceof Error ? error.message : String(error),
    });
    const publicError = createPublicError(error);
    response.status(publicError.status).json({ error: publicError.message });
  }
}
