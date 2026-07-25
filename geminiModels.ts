export const GEMINI_CHART_MODELS = [
  {
    id: 'gemini-3.6-flash',
    label: 'Gemini 3.6 Flash',
    description: '最新・推奨。高度なチャート画像分析向け',
    preview: false,
  },
  {
    id: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    description: '高精度と応答速度のバランス重視',
    preview: false,
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash Preview',
    description: 'Gemini 3世代の高速プレビュー版',
    preview: true,
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: '従来モデル。低遅延で安定した分析',
    preview: false,
  },
  {
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    description: '新世代の低コスト・高速モデル',
    preview: false,
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    description: '軽量・低コストのGemini 3世代モデル',
    preview: false,
  },
] as const;

export type GeminiChartModelId = typeof GEMINI_CHART_MODELS[number]['id'];

export const DEFAULT_GEMINI_CHART_MODEL: GeminiChartModelId = 'gemini-2.5-flash';

const GEMINI_CHART_MODEL_IDS = new Set<string>(
  GEMINI_CHART_MODELS.map((model) => model.id),
);

export function isGeminiChartModelId(value: unknown): value is GeminiChartModelId {
  return typeof value === 'string' && GEMINI_CHART_MODEL_IDS.has(value.trim());
}

export function normalizeGeminiChartModelId(value: unknown): GeminiChartModelId {
  return isGeminiChartModelId(value) ? value.trim() as GeminiChartModelId : DEFAULT_GEMINI_CHART_MODEL;
}
