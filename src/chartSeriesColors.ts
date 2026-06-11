const SERIES_COLOR_PALETTE = [
  '#22d3ee',
  '#f97316',
  '#a78bfa',
  '#f43f5e',
  '#eab308',
  '#34d399',
  '#60a5fa',
  '#fb7185',
  '#c084fc',
  '#2dd4bf',
  '#facc15',
  '#38bdf8',
  '#fb923c',
  '#818cf8',
  '#4ade80',
  '#f472b6',
  '#06b6d4',
  '#f59e0b',
  '#8b5cf6',
  '#10b981',
  '#ef4444',
  '#14b8a6',
  '#84cc16',
  '#ec4899',
  '#0ea5e9',
  '#d946ef',
  '#a3e635',
  '#f87171',
  '#67e8f9',
  '#fdba74',
  '#c4b5fd',
  '#bef264',
];

function hashSymbol(symbol: string): number {
  let hash = 0;
  for (let index = 0; index < symbol.length; index += 1) {
    hash = (hash * 31 + symbol.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (value: number) => {
    const hex = Math.round((value + m) * 255).toString(16).padStart(2, '0');
    return hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function getSeriesColor(symbol: string, index: number): string {
  if (index >= 0 && index < SERIES_COLOR_PALETTE.length) {
    return SERIES_COLOR_PALETTE[index];
  }

  const seed = hashSymbol(`${symbol}:${index}`);
  const hue = (seed * 137.508) % 360;
  const lightness = 54 + (seed % 8);
  return hslToHex(hue, 82, lightness);
}
