import type { DisclosureSource, DisclosureTag } from '../disclosureTypes';

function normalizeTitle(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

export function classifyDisclosure(
  title: string,
  source: DisclosureSource,
  sourceType = '',
  noiseKeywords: string[] = [],
): DisclosureTag {
  const normalizedTitle = normalizeTitle(title);
  const isNoise = noiseKeywords.some((keyword) => {
    const normalizedKeyword = normalizeTitle(keyword);
    return normalizedKeyword && normalizedTitle.includes(normalizedKeyword);
  });
  if (isNoise) return 'NOISE';
  if (/自己株式.*取得|自己株買い|自己株式取得/.test(normalizedTitle)) return '自己株買い';
  if (/増配|配当予想.*増額|配当.*上方修正/.test(normalizedTitle)) return '増配';
  if (/上方修正|上方に修正|増額修正/.test(normalizedTitle)) return '上方修正';
  if (/下方修正|下方に修正|減額修正/.test(normalizedTitle)) return '下方修正';
  if (/業績予想.*修正|業績.*修正|通期.*予想.*変更/.test(normalizedTitle)) return '業績修正';
  if (/決算説明|決算説明会|決算補足|決算概要/.test(normalizedTitle)) return '決算説明';
  if (/決算短信|短信/.test(normalizedTitle)) return '短信';
  const normalizedSourceType = normalizeTitle(sourceType);
  if (/yuho|securities.report|annual[_-]?report|有価証券報告書|半期報告書|四半期報告書/.test(`${normalizedSourceType}${normalizedTitle}`)) {
    return '有報';
  }
  if (source === 'tdnet' || source === 'tdnet-scrape') return '適時開示';
  return 'その他';
}
