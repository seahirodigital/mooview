export type ChartExportResolutionId = 'square-720' | 'landscape-720' | 'landscape-1080';
export type ChartExportSelectionMode = 'all' | 'first' | 'custom';
export type ChartExportFrameRate = 30 | 60;

export interface ChartExportSelection {
  mode: ChartExportSelectionMode;
  firstCount: number;
  panelIds: string[];
}

export interface ChartVideoExportSettings {
  durationSeconds: number;
  frameRate: ChartExportFrameRate;
  resolutionId: ChartExportResolutionId;
  selection: ChartExportSelection;
}

export interface ChartImageExportSettings {
  selection: ChartExportSelection;
}

export interface ChartExportResolution {
  id: ChartExportResolutionId;
  width: number;
  height: number;
  label: string;
}

export const CHART_EXPORT_RESOLUTIONS: ChartExportResolution[] = [
  {
    id: 'square-720',
    width: 720,
    height: 720,
    label: '720×720（正方形・既定）',
  },
  {
    id: 'landscape-720',
    width: 1280,
    height: 720,
    label: '1280×720（横長・推奨）',
  },
  {
    id: 'landscape-1080',
    width: 1920,
    height: 1080,
    label: '1920×1080（横長・最大）',
  },
];

export const CHART_EXPORT_FINAL_HOLD_SECONDS = 3;

export const DEFAULT_CHART_VIDEO_EXPORT_SETTINGS: ChartVideoExportSettings = {
  durationSeconds: 5,
  frameRate: 30,
  resolutionId: 'square-720',
  selection: {
    mode: 'all',
    firstCount: 1,
    panelIds: [],
  },
};

export const DEFAULT_CHART_IMAGE_EXPORT_SETTINGS: ChartImageExportSettings = {
  selection: {
    mode: 'all',
    firstCount: 1,
    panelIds: [],
  },
};

interface ChartPanelEntry {
  panelId: string;
  svg: SVGSVGElement;
  svgRect: DOMRect;
  header: HTMLElement;
  headerRect: DOMRect;
  rect: DOMRect;
}

interface CompositeLayout {
  entries: ChartPanelEntry[];
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PreparedChartComposite {
  layout: CompositeLayout;
  headerCanvases: Map<string, HTMLCanvasElement>;
}

interface RenderCompositeOptions {
  width: number;
  height: number;
  panelIds: string[];
}

interface ExportChartVideoOptions extends RenderCompositeOptions {
  durationSeconds: number;
  frameRate?: number;
  beforeFrame: (progress: number) => Promise<void>;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
  fileNumber?: number;
  download?: boolean;
  iosCompatible?: boolean;
}

interface ExportChartImageOptions {
  download?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ensureEven(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function createTimestamp(): string {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ];
  return `${parts.slice(0, 3).join('')}-${parts.slice(3).join('')}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function downloadChartVideoFile(file: File): void {
  downloadBlob(file, file.name);
}

function createUnionRect(first: DOMRect, second: DOMRect): DOMRect {
  const left = Math.min(first.left, second.left);
  const top = Math.min(first.top, second.top);
  const right = Math.max(first.right, second.right);
  const bottom = Math.max(first.bottom, second.bottom);
  return new DOMRect(left, top, right - left, bottom - top);
}

function collectChartPanelEntries(panelIds: string[]): ChartPanelEntry[] {
  const requestedPanelIds = new Set(panelIds);
  const entries = Array.from(
    document.querySelectorAll<HTMLElement>('[data-chart-export-panel-id]'),
  ).flatMap((panelElement) => {
    const panelId = panelElement.dataset.chartExportPanelId;
    if (!panelId || !requestedPanelIds.has(panelId)) return [];
    const svg = panelElement.querySelector<SVGSVGElement>('svg[data-chart-export-svg="true"]');
    const header = panelElement.querySelector<HTMLElement>('[data-chart-export-panel-header="true"]');
    if (!svg || !header) return [];
    const svgRect = svg.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    if (
      svgRect.width <= 0
      || svgRect.height <= 0
      || headerRect.width <= 0
      || headerRect.height <= 0
    ) {
      return [];
    }
    return [{
      panelId,
      svg,
      svgRect,
      header,
      headerRect,
      rect: createUnionRect(headerRect, svgRect),
    }];
  });

  const order = new Map(panelIds.map((panelId, index) => [panelId, index]));
  entries.sort(
    (first, second) => (order.get(first.panelId) ?? 0) - (order.get(second.panelId) ?? 0),
  );
  return entries;
}

function createCompositeLayout(panelIds: string[]): CompositeLayout {
  const entries = collectChartPanelEntries(panelIds);
  if (entries.length === 0) {
    throw new Error('選択したカスタムチャートを画面内で取得できませんでした。');
  }

  const left = Math.min(...entries.map((entry) => entry.rect.left));
  const top = Math.min(...entries.map((entry) => entry.rect.top));
  const right = Math.max(...entries.map((entry) => entry.rect.right));
  const bottom = Math.max(...entries.map((entry) => entry.rect.bottom));
  return {
    entries,
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

async function prepareChartComposite(panelIds: string[]): Promise<PreparedChartComposite> {
  const layout = createCompositeLayout(panelIds);
  const { toCanvas } = await import('html-to-image');
  const headerCanvases = new Map<string, HTMLCanvasElement>();

  for (const entry of layout.entries) {
    const headerCanvas = await toCanvas(entry.header, {
      backgroundColor: '#111111',
      cacheBust: false,
      pixelRatio: 1,
      skipFonts: true,
      width: Math.max(1, Math.ceil(entry.headerRect.width)),
      height: Math.max(1, Math.ceil(entry.headerRect.height)),
    });
    headerCanvases.set(entry.panelId, headerCanvas);
  }

  return { layout, headerCanvases };
}

function loadSvgImage(svg: SVGSVGElement, width: number, height: number): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  if (!clone.hasAttribute('viewBox')) {
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  const serialized = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(
    new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }),
  );

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('チャート画像の描画準備に失敗しました。'));
    };
    image.src = url;
  });
}

async function renderChartComposite(
  canvas: HTMLCanvasElement,
  options: RenderCompositeOptions,
  prepared: PreparedChartComposite,
): Promise<void> {
  const { layout, headerCanvases } = prepared;
  const targetWidth = ensureEven(options.width);
  const targetHeight = ensureEven(options.height);
  if (canvas.width !== targetWidth) canvas.width = targetWidth;
  if (canvas.height !== targetHeight) canvas.height = targetHeight;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('チャート出力用Canvasを作成できませんでした。');
  }

  context.fillStyle = '#050505';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(canvas.width / layout.width, canvas.height / layout.height);
  const renderedWidth = layout.width * scale;
  const renderedHeight = layout.height * scale;
  const offsetX = (canvas.width - renderedWidth) / 2;
  const offsetY = (canvas.height - renderedHeight) / 2;

  for (const entry of layout.entries) {
    const headerCanvas = headerCanvases.get(entry.panelId);
    if (headerCanvas) {
      context.drawImage(
        headerCanvas,
        offsetX + (entry.headerRect.left - layout.left) * scale,
        offsetY + (entry.headerRect.top - layout.top) * scale,
        entry.headerRect.width * scale,
        entry.headerRect.height * scale,
      );
    }

    const sourceWidth = Math.max(1, entry.svgRect.width);
    const sourceHeight = Math.max(1, entry.svgRect.height);
    const image = await loadSvgImage(entry.svg, sourceWidth, sourceHeight);
    context.drawImage(
      image,
      offsetX + (entry.svgRect.left - layout.left) * scale,
      offsetY + (entry.svgRect.top - layout.top) * scale,
      sourceWidth * scale,
      sourceHeight * scale,
    );
  }
}

function resolveImageDimensions(layout: CompositeLayout): { width: number; height: number } {
  const scale = Math.min(1, 1920 / layout.width, 1080 / layout.height);
  return {
    width: ensureEven(layout.width * scale),
    height: ensureEven(layout.height * scale),
  };
}

export function resolveChartExportPanelIds(
  selection: ChartExportSelection,
  availablePanelIds: string[],
): string[] {
  if (selection.mode === 'all') return availablePanelIds;
  if (selection.mode === 'first') {
    return availablePanelIds.slice(0, clamp(Math.round(selection.firstCount), 1, 4));
  }
  const selectedIds = new Set(selection.panelIds);
  return availablePanelIds.filter((panelId) => selectedIds.has(panelId));
}

export function normalizeChartVideoExportSettings(raw: unknown): ChartVideoExportSettings {
  const source = raw && typeof raw === 'object'
    ? raw as Partial<ChartVideoExportSettings>
    : {};
  const resolutionId = CHART_EXPORT_RESOLUTIONS.some(
    (resolution) => resolution.id === source.resolutionId,
  )
    ? source.resolutionId as ChartExportResolutionId
    : DEFAULT_CHART_VIDEO_EXPORT_SETTINGS.resolutionId;
  return {
    durationSeconds: clamp(
      Number(source.durationSeconds) || DEFAULT_CHART_VIDEO_EXPORT_SETTINGS.durationSeconds,
      1,
      30,
    ),
    frameRate: source.frameRate === 60 ? 60 : 30,
    resolutionId,
    selection: normalizeChartExportSelection(source.selection),
  };
}

export function normalizeChartImageExportSettings(raw: unknown): ChartImageExportSettings {
  const source = raw && typeof raw === 'object'
    ? raw as Partial<ChartImageExportSettings>
    : {};
  return {
    selection: normalizeChartExportSelection(source.selection),
  };
}

function normalizeChartExportSelection(raw: unknown): ChartExportSelection {
  const source = raw && typeof raw === 'object'
    ? raw as Partial<ChartExportSelection>
    : {};
  const mode: ChartExportSelectionMode = source.mode === 'first' || source.mode === 'custom'
    ? source.mode
    : 'all';
  return {
    mode,
    firstCount: clamp(Math.round(Number(source.firstCount) || 1), 1, 4),
    panelIds: Array.isArray(source.panelIds)
      ? source.panelIds.filter((panelId): panelId is string => typeof panelId === 'string')
      : [],
  };
}

export async function exportChartImage(
  panelIds: string[],
  onProgress?: (progress: number) => void,
  options: ExportChartImageOptions = {},
): Promise<File[]> {
  const timestamp = createTimestamp();
  const canvas = document.createElement('canvas');
  const files: File[] = [];
  for (let index = 0; index < panelIds.length; index += 1) {
    const panelId = panelIds[index];
    const prepared = await prepareChartComposite([panelId]);
    const dimensions = resolveImageDimensions(prepared.layout);
    await renderChartComposite(canvas, {
      ...dimensions,
      panelIds: [panelId],
    }, prepared);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('PNG画像の作成に失敗しました。'));
        }
      }, 'image/png');
    });
    const panelNumber = String(index + 1).padStart(2, '0');
    const filename = `mooview-chart-${panelNumber}-${timestamp}.png`;
    const file = new File([blob], filename, {
      type: 'image/png',
      lastModified: Date.now(),
    });
    if (options.download !== false) {
      downloadBlob(file, filename);
    }
    files.push(file);
    onProgress?.((index + 1) / panelIds.length);
  }
  return files;
}

export async function exportChartVideo(
  options: ExportChartVideoOptions,
): Promise<File> {
  const throwIfAborted = () => {
    if (options.signal?.aborted) {
      throw new DOMException('動画作成を停止しました。', 'AbortError');
    }
  };
  throwIfAborted();
  const requestedFrameRate = clamp(Math.round(options.frameRate ?? 30), 1, 60);
  // PCは従来設定を維持し、iOSだけ写真アプリとの互換性を優先して30fpsを上限にする。
  const frameRate = options.iosCompatible ? Math.min(requestedFrameRate, 30) : requestedFrameRate;
  const animationDurationSeconds = clamp(options.durationSeconds, 1, 30);
  const animationFrameCount = Math.max(2, Math.round(animationDurationSeconds * frameRate));
  const finalHoldFrameCount = Math.round(CHART_EXPORT_FINAL_HOLD_SECONDS * frameRate);
  const totalFrameCount = animationFrameCount + finalHoldFrameCount;
  const canvas = document.createElement('canvas');
  canvas.width = ensureEven(options.width);
  canvas.height = ensureEven(options.height);
  const prepared = await prepareChartComposite(options.panelIds);
  throwIfAborted();

  const {
    BufferTarget,
    CanvasSource,
    Mp4OutputFormat,
    Output,
  } = await import('mediabunny');
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat(options.iosCompatible ? { fastStart: 'in-memory' } : undefined),
    target,
  });
  const bitrate = canvas.width >= 1920 ? 8_000_000 : 5_000_000;
  const fullCodecString = options.iosCompatible
    ? canvas.width >= 1920 ? 'avc1.42e028' : 'avc1.42e01f'
    : canvas.width >= 1920 ? 'avc1.640028' : 'avc1.64001f';
  const videoSource = new CanvasSource(canvas, {
    codec: 'avc',
    bitrate,
    bitrateMode: 'variable',
    keyFrameInterval: 2,
    fullCodecString,
    hardwareAcceleration: 'no-preference',
  });
  output.addVideoTrack(videoSource);
  let finalized = false;

  try {
    await output.start();
    throwIfAborted();

    for (let frameIndex = 0; frameIndex < totalFrameCount; frameIndex += 1) {
      throwIfAborted();
      if (frameIndex < animationFrameCount) {
        const progress = animationFrameCount <= 1
          ? 1
          : frameIndex / (animationFrameCount - 1);
        await options.beforeFrame(progress);
        throwIfAborted();
        await renderChartComposite(canvas, options, prepared);
      }
      throwIfAborted();
      await videoSource.add(
        frameIndex / frameRate,
        1 / frameRate,
        {
          keyFrame: frameIndex === 0
            || frameIndex === animationFrameCount
            || frameIndex % (frameRate * 2) === 0,
        },
      );
      options.onProgress?.((frameIndex + 1) / totalFrameCount);
    }

    throwIfAborted();
    videoSource.close();
    await output.finalize();
    finalized = true;
  } catch (error) {
    if (!finalized) {
      await output.cancel().catch(() => undefined);
    }
    throw error;
  }

  if (!target.buffer) {
    throw new Error('MP4動画データを取得できませんでした。');
  }
  const fileNumber = String(options.fileNumber ?? 1).padStart(2, '0');
  const filename = `mooview-chart-${fileNumber}-${createTimestamp()}.mp4`;
  const file = new File([target.buffer], filename, {
    type: 'video/mp4',
    lastModified: Date.now(),
  });
  if (options.download !== false) {
    downloadBlob(file, filename);
  }
  return file;
}
