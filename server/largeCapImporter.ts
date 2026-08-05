import fs from 'fs';
import path from 'path';

import { normalizeSecuritiesCode, upsertCompany } from './disclosureStore';

interface CsvRow {
  コード?: string;
  銘柄?: string;
  市場?: string;
}

const NON_STOCK_NAME_PATTERN = /先物|指数|ETF|上場投信|債券|FX|平均株価|^TOPIX$/i;

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function readCsv(filePath: string): CsvRow[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])) as CsvRow;
  });
}

function isJapaneseIndividualStock(row: CsvRow): boolean {
  const code = row.コード?.trim() || '';
  const name = row.銘柄?.trim() || '';
  return row.市場?.trim() === '日本株'
    && Boolean(normalizeSecuritiesCode(code))
    && !code.startsWith('.')
    && !NON_STOCK_NAME_PATTERN.test(name);
}

export function seedLargeCapCompanies(): { imported: number; sourceFiles: string[] } {
  const sources = [
    { filePath: path.resolve(process.cwd(), 'TOPIX 100.csv'), topix100: true, nikkei225: false },
    { filePath: path.resolve(process.cwd(), '日経225.csv'), topix100: false, nikkei225: true },
  ];
  const importedCodes = new Set<string>();
  const availableFiles: string[] = [];
  for (const source of sources) {
    if (!fs.existsSync(source.filePath)) continue;
    availableFiles.push(source.filePath);
    for (const row of readCsv(source.filePath).filter(isJapaneseIndividualStock)) {
      const secCode = normalizeSecuritiesCode(row.コード);
      if (!secCode) continue;
      upsertCompany({
        name: row.銘柄?.trim() || secCode,
        secCode,
        tickerCode: `${secCode}.JP`,
        topix100: source.topix100 || undefined,
        nikkei225: source.nikkei225 || undefined,
        largeCap: true,
        notifyEnabled: true,
        preserveNotificationSetting: true,
      });
      importedCodes.add(secCode);
    }
  }
  return { imported: importedCodes.size, sourceFiles: availableFiles };
}
