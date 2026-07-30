import type { GeminiChartModelId } from '../geminiModels';

export const DEFAULT_CHART_AI_PROMPT = `#日本株 フロー分析

▼セクター/TPX
・
強：
弱：

▼半導体個別/TPX
・
強：
弱：

#デイトレ  #日経平均


添付図を読み込み分析後に、以下のフレームワークに沿ってXの投稿を作れ

主に強いセクター、弱いセクター、強い半導体セクター、弱い半導体セクター二言及しろ、強い・弱い個別銘柄に言及しろ、米国株は指示のある場合にのみ、分析材料としろ

必ず▼の下の行に添付チャートのに対するマーケットの解釈を短文で追記しろ

米株分析：不要

#日本株 フロー分析
直後の文章は、投稿内容を端的にまとめた簡易的なまとめにしろ

## 注意
文頭にAIからの応答の出力である、「はい、わかりました、以下のように出力します」などのような文章は一切不要で、以下の回答のみを出力せよ

ーーテンプレート
#日本株 フロー分析

米国株循環も注視 NASよりSPが強いか要確認



▼セクター/TPX

・運輸、トヨタ、エネルギー等バリューが強い

強：運輸・自動車・エネルギー

弱：半導体、電気



▼半導体個別/TPX

・MLCC銘柄の流入が一巡

強：信越化学、

弱：太陽誘電、イビデン、村田製作所、#デイトレ  #日経平均`;

const CHART_AI_ENDPOINT = '/api/ai/chart-analysis';
const CHART_AI_TIMEOUT_MS = 120_000;
const MAX_CHART_AI_MEDIA_BYTES = 14 * 1024 * 1024;

interface EncodedChartMedia {
  mimeType: string;
  data: string;
}

export interface ChartAiAnalysisResult {
  text: string;
  model: string;
}

function encodeFileAsBase64(file: File): Promise<EncodedChartMedia> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const separatorIndex = result.indexOf(',');
      if (separatorIndex < 0) {
        reject(new Error('AIへ送る画像・動画データを作成できませんでした。'));
        return;
      }
      resolve({
        mimeType: file.type || 'image/png',
        data: result.slice(separatorIndex + 1),
      });
    };
    reader.onerror = () => reject(new Error('AIへ送る画像・動画を読み込めませんでした。'));
    reader.readAsDataURL(file);
  });
}

export async function requestChartAiAnalysis(
  prompt: string,
  mediaFiles: File[],
  model: GeminiChartModelId,
): Promise<ChartAiAnalysisResult> {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    throw new Error('AIプロンプトを入力してください。');
  }
  if (mediaFiles.length === 0) {
    throw new Error('AIへ送るチャート画像・動画がありません。');
  }

  const totalMediaBytes = mediaFiles.reduce((total, file) => total + file.size, 0);
  if (totalMediaBytes > MAX_CHART_AI_MEDIA_BYTES) {
    throw new Error('Geminiへ送る画像・動画の合計容量が大きすぎます。対象チャートを減らしてください。');
  }

  const media = await Promise.all(mediaFiles.map(encodeFileAsBase64));
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), CHART_AI_TIMEOUT_MS);

  try {
    const response = await fetch(CHART_AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: normalizedPrompt,
        media,
        model,
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null) as {
      error?: string;
      text?: string;
      model?: string;
    } | null;

    if (!response.ok) {
      throw new Error(data?.error || `AI分析に失敗しました（HTTP ${response.status}）。`);
    }

    const text = data?.text?.trim() || '';
    if (!text) {
      throw new Error('AIから文章が返されませんでした。');
    }
    return {
      text,
      model: data?.model?.trim() || 'Gemini',
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AI分析がタイムアウトしました。時間を置いて再実行してください。');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
