const SERIES_COLOR_PALETTE = [
  '#ff4057',
  '#ff9f1a',
  '#fff04a',
  '#39b54a',
  '#009b87',
  '#00bcd4',
  '#2f6bff',
  '#6f40c9',
  '#b12ac9',
  '#f72572',
  '#d7263d',
  '#ff7a00',
  '#ffc21a',
  '#2f9e44',
  '#00796b',
  '#0097a7',
  '#1d4ed8',
  '#5b21b6',
  '#9c27b0',
  '#c2185b',
  '#b91c1c',
  '#e65100',
  '#f9a825',
  '#2e7d32',
  '#00695c',
  '#00838f',
  '#0f52ba',
  '#512da8',
  '#8e24aa',
  '#ad1457',
  '#7f1d1d',
  '#bf360c',
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
  const lightness = 42 + (seed % 10);
  return hslToHex(hue, 92, lightness);
}
