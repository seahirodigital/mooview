import { generateGeminiContent, generateGeminiPdfContent } from './geminiHandler';
import { fetchDisclosurePdf } from './disclosureSources';
import {
  getDisclosure,
  readDisclosureSettings,
  saveDisclosureSummary,
} from './disclosureStore';

const MAX_INLINE_PDF_BYTES = 14 * 1024 * 1024;
const MAX_PDF_BYTES = 50 * 1024 * 1024;

export async function summarizeDisclosure(id: number): Promise<{
  id: number;
  text: string;
  model: string;
}> {
  const disclosure = getDisclosure(id);
  if (!disclosure) throw new Error('指定された開示情報が見つかりません。');
  if (disclosure.tag === 'NOISE') {
    throw new Error('NOISEに分類された開示はGemini要約の対象外です。');
  }
  if (!disclosure.pdfAvailable) throw new Error('この開示情報には要約可能なPDFがありません。');
  const pdfResponse = await fetchDisclosurePdf(
    disclosure.source,
    disclosure.sourceDocumentId,
    disclosure.sourceUrl,
  );
  const declaredLength = Number(pdfResponse.headers.get('content-length') || 0);
  if (declaredLength > MAX_PDF_BYTES) {
    throw new Error('PDFが50MBを超えているためGemini要約の対象外です。');
  }
  const bytes = Buffer.from(await pdfResponse.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES) {
    throw new Error('PDFが50MBを超えているためGemini要約の対象外です。');
  }
  const settings = readDisclosureSettings();
  const context = [
    disclosure.source === 'tdnet' || disclosure.source === 'tdnet-scrape'
      ? settings.tdnetGeminiPrompt
      : settings.geminiPrompt,
    '',
    '--- 対象資料 ---',
    `企業名: ${disclosure.companyName}`,
    `証券コード: ${disclosure.secCode || '不明'}`,
    `開示日時: ${disclosure.publishedAt}`,
    `タグ: ${disclosure.tag}`,
    `タイトル: ${disclosure.title}`,
  ].join('\n');
  const result = bytes.length <= MAX_INLINE_PDF_BYTES
    ? await generateGeminiContent(context, [{
        mimeType: 'application/pdf',
        data: bytes.toString('base64'),
      }], settings.geminiModel)
    : await generateGeminiPdfContent(
        context,
        bytes,
        `${disclosure.secCode || disclosure.edinetCode || 'company'}-${disclosure.id}.pdf`,
        settings.geminiModel,
      );
  saveDisclosureSummary(disclosure.id, result.text, result.model);
  return { id: disclosure.id, text: result.text, model: result.model };
}
