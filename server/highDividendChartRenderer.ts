import sharp from 'sharp';

import type { DiscordAutomationArtifact } from '../discordAutomation';
import type { ETFDataRow } from '../src/highDividend/types';

const WIDTH = 1_280;
const HEIGHT = 720;
const PLOT = { left: 105, top: 150, width: 1_060, height: 430 };
const ORANGE = '#ea580c';
const GREEN = '#15803d';
const BLACK = '#1a1a1a';
const GRID = '#d1d5db';

interface ChartPoint {
  date: string;
  primary: number;
  secondary?: number;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  }[character] || character));
}

function totalUnits(row: ETFDataRow): number {
  return row.total_units > 0
    ? row.total_units
    : row.nav > 0 ? row.net_assets / row.nav : 0;
}

function displayDate(value: string): string {
  return value.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1/$2/$3');
}

function chartRows(data: ETFDataRow[]): ETFDataRow[] {
  // 通知用チャートも画面と同じ全期間データを使用する。
  return [...data].sort((left, right) => left.date.localeCompare(right.date));
}

function range(values: number[]): { min: number; max: number } {
  const finite = values.filter(Number.isFinite);
  const rawMin = Math.min(...finite);
  const rawMax = Math.max(...finite);
  const padding = Math.max((rawMax - rawMin) * 0.12, Math.max(Math.abs(rawMax) * 0.02, 1));
  return { min: rawMin - padding, max: rawMax + padding };
}

function xFor(index: number, count: number): number {
  return PLOT.left + (count <= 1 ? PLOT.width / 2 : (index / (count - 1)) * PLOT.width);
}

function yFor(value: number, scale: { min: number; max: number }): number {
  const denominator = scale.max - scale.min || 1;
  return PLOT.top + PLOT.height - ((value - scale.min) / denominator) * PLOT.height;
}

function linePath(values: number[], scale: { min: number; max: number }): string {
  return values.map((value, index) => `${index === 0 ? 'M' : 'L'}${xFor(index, values.length).toFixed(1)},${yFor(value, scale).toFixed(1)}`).join(' ');
}

function gridSvg(scale: { min: number; max: number }, formatter: (value: number) => string): string {
  return Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const y = PLOT.top + PLOT.height - ratio * PLOT.height;
    const value = scale.min + ratio * (scale.max - scale.min);
    return [
      `<line x1="${PLOT.left}" y1="${y}" x2="${PLOT.left + PLOT.width}" y2="${y}" stroke="${GRID}" stroke-dasharray="4 5"/>`,
      `<text x="${PLOT.left - 16}" y="${y + 5}" text-anchor="end" class="axis">${escapeXml(formatter(value))}</text>`,
    ].join('');
  }).join('');
}

function dateLabelsSvg(points: ChartPoint[]): string {
  const indexes = Array.from(new Set([0, Math.floor((points.length - 1) / 3), Math.floor((points.length - 1) * 2 / 3), points.length - 1]));
  return indexes.map((index) => (
    `<text x="${xFor(index, points.length)}" y="${PLOT.top + PLOT.height + 37}" text-anchor="middle" class="axis">${displayDate(points[index].date)}</text>`
  )).join('');
}

function baseSvg(title: string, legend: string, content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <style>
      .title { font-family: Arial, 'Noto Sans JP', sans-serif; font-size: 30px; font-weight: 700; fill: ${BLACK}; }
      .subtitle { font-family: Arial, 'Noto Sans JP', sans-serif; font-size: 18px; font-weight: 600; fill: #4b5563; }
      .axis { font-family: Arial, 'Noto Sans JP', sans-serif; font-size: 16px; fill: #6b7280; }
      .note { font-family: Arial, 'Noto Sans JP', sans-serif; font-size: 17px; fill: #4b5563; }
      .value { font-family: Arial, 'Noto Sans JP', sans-serif; font-size: 22px; font-weight: 700; fill: ${BLACK}; }
    </style>
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect x="18" y="18" width="1244" height="684" fill="#ffffff" stroke="#e5e7eb" stroke-width="2"/>
    <text x="52" y="75" class="title">${escapeXml(title)}</text>
    <text x="52" y="112" class="subtitle">${escapeXml(legend)}</text>
    ${content}
  </svg>`;
}

async function toArtifact(name: string, svg: string): Promise<DiscordAutomationArtifact> {
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return { name, mimeType: 'image/png', base64: png.toString('base64') };
}

export async function renderHighDividendDiscordCharts(
  data: ETFDataRow[],
): Promise<DiscordAutomationArtifact[]> {
  const rows = chartRows(data);
  if (rows.length < 2) throw new Error('563Aチャート画像を作成するための時系列データが不足しています。');

  const navPoints: ChartPoint[] = rows.map((row) => ({
    date: row.date,
    primary: row.nav,
    secondary: row.reinv_nav || row.nav,
  }));
  const navScale = range(navPoints.flatMap((point) => [point.primary, point.secondary || point.primary]));
  const navLatest = navPoints[navPoints.length - 1];
  const navSvg = baseSvg(
    '基準価額（NAV）推移',
    '■ 基準価額　― 再投資NAV',
    `${gridSvg(navScale, (value) => `¥${Math.round(value / 1_000)}k`)}
     <line x1="${PLOT.left}" y1="${PLOT.top}" x2="${PLOT.left}" y2="${PLOT.top + PLOT.height}" stroke="${BLACK}" stroke-width="2"/>
     <line x1="${PLOT.left}" y1="${PLOT.top + PLOT.height}" x2="${PLOT.left + PLOT.width}" y2="${PLOT.top + PLOT.height}" stroke="${BLACK}" stroke-width="2"/>
     <path d="${linePath(navPoints.map((point) => point.primary), navScale)}" fill="none" stroke="${BLACK}" stroke-width="4"/>
     <path d="${linePath(navPoints.map((point) => point.secondary || point.primary), navScale)}" fill="none" stroke="${GREEN}" stroke-width="4"/>
     <circle cx="${xFor(navPoints.length - 1, navPoints.length)}" cy="${yFor(navLatest.primary, navScale)}" r="6" fill="${BLACK}"/>
     ${dateLabelsSvg(navPoints)}
     <text x="52" y="647" class="note">最新基準価額</text>
     <text x="52" y="680" class="value">¥${Math.round(navLatest.primary).toLocaleString('ja-JP')}</text>
     <text x="1165" y="680" text-anchor="end" class="note">基準日：${displayDate(navLatest.date)}</text>`,
  );

  const unitsPoints: ChartPoint[] = rows.map((row) => ({
    date: row.date,
    primary: totalUnits(row),
    secondary: row.net_assets / 100_000_000,
  }));
  const unitsScale = range(unitsPoints.map((point) => point.primary));
  const assetsScale = range(unitsPoints.map((point) => point.secondary || 0));
  const latest = unitsPoints[unitsPoints.length - 1];
  const previous = unitsPoints[unitsPoints.length - 2];
  const dailyChange = previous.primary > 0 ? ((latest.primary / previous.primary) - 1) * 100 : 0;
  const sign = dailyChange >= 0 ? '+' : '';
  const unitsSvg = baseSvg(
    '総発行口数',
    '● 総発行口数（左軸）　--- 純資産（右軸）',
    `${gridSvg(unitsScale, (value) => `${Math.round(value / 1_000).toLocaleString('ja-JP')}k口`)}
     ${Array.from({ length: 5 }, (_, index) => {
       const ratio = index / 4;
       const y = PLOT.top + PLOT.height - ratio * PLOT.height;
       const value = assetsScale.min + ratio * (assetsScale.max - assetsScale.min);
       return `<text x="${PLOT.left + PLOT.width + 16}" y="${y + 5}" class="axis">${value.toFixed(0)}億</text>`;
     }).join('')}
     <line x1="${PLOT.left}" y1="${PLOT.top}" x2="${PLOT.left}" y2="${PLOT.top + PLOT.height}" stroke="${ORANGE}" stroke-width="2"/>
     <line x1="${PLOT.left + PLOT.width}" y1="${PLOT.top}" x2="${PLOT.left + PLOT.width}" y2="${PLOT.top + PLOT.height}" stroke="${BLACK}" stroke-width="2"/>
     <line x1="${PLOT.left}" y1="${PLOT.top + PLOT.height}" x2="${PLOT.left + PLOT.width}" y2="${PLOT.top + PLOT.height}" stroke="${BLACK}" stroke-width="2"/>
     <path d="${linePath(unitsPoints.map((point) => point.primary), unitsScale)}" fill="none" stroke="${ORANGE}" stroke-width="5"/>
     <path d="${linePath(unitsPoints.map((point) => point.secondary || 0), assetsScale)}" fill="none" stroke="${BLACK}" stroke-width="3" stroke-dasharray="10 8"/>
     <circle cx="${xFor(unitsPoints.length - 1, unitsPoints.length)}" cy="${yFor(latest.primary, unitsScale)}" r="7" fill="${ORANGE}"/>
     ${dateLabelsSvg(unitsPoints)}
     <rect x="735" y="85" width="430" height="45" rx="4" fill="#fff7ed" stroke="#fed7aa"/>
     <text x="755" y="115" class="value" fill="${ORANGE}">前日比 口数増減：${sign}${dailyChange.toFixed(2)}%</text>
     <text x="52" y="647" class="note">最新総発行口数</text>
     <text x="52" y="680" class="value">${Math.round(latest.primary).toLocaleString('ja-JP')}口</text>
     <text x="1165" y="680" text-anchor="end" class="note">純資産：${(latest.secondary || 0).toFixed(2)}億円</text>`,
  );

  // Discordでの並び順は要求どおり右図（総発行口数）→左図（NAV）。
  return Promise.all([
    toArtifact(`563A_total-units_${latest.date}.png`, unitsSvg),
    toArtifact(`563A_nav_${navLatest.date}.png`, navSvg),
  ]);
}
