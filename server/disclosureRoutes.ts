import { Readable } from 'stream';
import type { Express, Request, Response } from 'express';

import type { DisclosureSourceGroup, DisclosureTag } from '../disclosureTypes';
import { notifyDiscordText } from './discordNotifier';
import { summarizeDisclosure } from './disclosureAi';
import { fetchDisclosurePdf } from './disclosureSources';
import {
  getCompany,
  getDisclosure,
  listDisclosures,
  listLargeCapCompanies,
  readDisclosureSettings,
  normalizeHttpsUrl,
  upsertCompany,
  updateAllLargeCapCompanyNotifications,
  writeDisclosureSettings,
} from './disclosureStore';
import {
  forceEdinetDisclosureSync,
  forceDisclosureSync,
  forceTdnetDisclosureSync,
  getDisclosureServiceStatus,
  refreshDisclosuresForSearch,
} from './disclosureService';

function numberParam(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
}

function safeFilename(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 120) || 'disclosure';
}

function publicError(error: unknown): string {
  return error instanceof Error ? error.message : '処理に失敗しました。';
}

function optionalHttpsUrl(value: unknown, label: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = normalizeHttpsUrl(value);
  if (!normalized) throw new Error(`${label}はHTTPS URLで入力してください。`);
  return normalized;
}

async function handlePdf(request: Request, response: Response): Promise<void> {
  try {
    const id = numberParam(request.params.id, 0);
    const disclosure = getDisclosure(id);
    if (!disclosure) {
      response.status(404).json({ error: '指定された開示情報が見つかりません。' });
      return;
    }
    if (!disclosure.pdfAvailable) {
      response.status(409).json({ error: 'この開示情報にはPDFがありません。' });
      return;
    }
    const upstream = await fetchDisclosurePdf(
      disclosure.source,
      disclosure.sourceDocumentId,
      disclosure.sourceUrl,
    );
    const filename = safeFilename(
      `${disclosure.secCode || disclosure.edinetCode || 'company'}-${disclosure.publishedAt.slice(0, 10)}-${disclosure.title}.pdf`,
    );
    response.status(200);
    response.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/pdf');
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) response.setHeader('Content-Length', contentLength);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader(
      'Content-Disposition',
      `${request.query.download === '1' ? 'attachment' : 'inline'}; filename="disclosure-${id}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    if (!upstream.body) {
      response.end();
      return;
    }
    Readable.fromWeb(upstream.body as never).pipe(response);
  } catch (error) {
    if (!response.headersSent) response.status(502).json({ error: publicError(error) });
    else response.destroy(error instanceof Error ? error : undefined);
  }
}

export function registerDisclosureRoutes(app: Express): void {
  app.get('/api/disclosures', (request, response) => {
    try {
      const sourceGroups = typeof request.query.sources === 'string'
        ? request.query.sources.split(',').filter(
            (source): source is DisclosureSourceGroup => source === 'edinet' || source === 'tdnet',
          )
        : ['edinet', 'tdnet'] as DisclosureSourceGroup[];
      response.json(listDisclosures({
        query: typeof request.query.query === 'string' ? request.query.query : '',
        largeCapOnly: request.query.largeCapOnly !== '0',
        tag: typeof request.query.tag === 'string' ? request.query.tag as DisclosureTag : '',
        sort: typeof request.query.sort === 'string' ? request.query.sort : '',
        direction: request.query.direction === 'asc' || request.query.direction === 'desc'
          ? request.query.direction
          : '',
        page: numberParam(request.query.page, 1),
        pageSize: request.query.pageSize === 'all'
          ? 'all'
          : numberParam(request.query.pageSize, 50),
        sourceGroups,
        excludeNoise: request.query.excludeNoise !== '0',
      }));
    } catch (error) {
      response.status(500).json({ error: publicError(error) });
    }
  });

  app.get('/api/disclosures/status', (_request, response) => {
    try {
      response.json(getDisclosureServiceStatus());
    } catch (error) {
      response.status(500).json({ error: publicError(error) });
    }
  });

  app.get('/api/disclosures/settings', (_request, response) => {
    response.json({
      ...readDisclosureSettings(),
      apiConfigured: {
        edinet: Boolean(process.env.EDINET_API_KEY?.trim()),
        edinetDb: Boolean(process.env.EDINET_DB_API_KEY?.trim()),
        tdnet: true,
        gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
        discord: Boolean(process.env.DISCORD_WEBHOOK_URL?.trim()),
      },
    });
  });

  app.put('/api/disclosures/settings', (request, response) => {
    try {
      response.json(writeDisclosureSettings(request.body?.settings ?? request.body));
    } catch (error) {
      response.status(400).json({ error: publicError(error) });
    }
  });

  app.post('/api/disclosures/sync', async (_request, response) => {
    try {
      response.json(await forceDisclosureSync());
    } catch (error) {
      console.error('企業開示DBの手動同期に失敗しました。', publicError(error));
      response.status(502).json({ error: publicError(error) });
    }
  });

  app.post('/api/disclosures/sync/edinet', async (_request, response) => {
    try {
      response.json(await forceEdinetDisclosureSync());
    } catch (error) {
      console.error('企業開示DBのEDINET手動同期に失敗しました。', publicError(error));
      response.status(502).json({ error: publicError(error) });
    }
  });

  app.post('/api/disclosures/sync/tdnet', async (_request, response) => {
    try {
      response.json(await forceTdnetDisclosureSync());
    } catch (error) {
      console.error('企業開示DBのTDNET手動同期に失敗しました。', publicError(error));
      response.status(502).json({ error: publicError(error) });
    }
  });

  app.post('/api/disclosures/search-refresh', async (request, response) => {
    try {
      const query = typeof request.body?.query === 'string' ? request.body.query : '';
      const sourceGroups = Array.isArray(request.body?.sources)
        ? request.body.sources.filter(
            (source: unknown): source is DisclosureSourceGroup => source === 'edinet' || source === 'tdnet',
          )
        : ['edinet', 'tdnet'] as DisclosureSourceGroup[];
      response.json(await refreshDisclosuresForSearch(query, sourceGroups));
    } catch (error) {
      response.status(400).json({ error: publicError(error) });
    }
  });

  app.get('/api/disclosures/companies', (request, response) => {
    try {
      response.json(listLargeCapCompanies(
        typeof request.query.query === 'string' ? request.query.query : '',
      ));
    } catch (error) {
      response.status(500).json({ error: publicError(error) });
    }
  });

  app.post('/api/disclosures/companies', (request, response) => {
    try {
      const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
      if (!name) {
        response.status(400).json({ error: '企業名を入力してください。' });
        return;
      }
      const id = upsertCompany({
        name,
        edinetCode: request.body?.edinetCode,
        secCode: request.body?.secCode,
        tickerCode: request.body?.tickerCode,
        irUrl: optionalHttpsUrl(request.body?.irUrl, 'IRサイトURL'),
        largeCap: true,
        notifyEnabled: request.body?.notifyEnabled !== false,
        tdnetNotifyEnabled: request.body?.tdnetNotifyEnabled !== false,
      });
      response.status(201).json(getCompany(id));
    } catch (error) {
      response.status(400).json({ error: publicError(error) });
    }
  });

  app.put('/api/disclosures/companies/notifications', (request, response) => {
    try {
      const enabled = request.body?.enabled === true;
      const source: DisclosureSourceGroup = request.body?.source === 'tdnet' ? 'tdnet' : 'edinet';
      response.json({
        source,
        enabled,
        updated: updateAllLargeCapCompanyNotifications(source, enabled),
      });
    } catch (error) {
      response.status(400).json({ error: publicError(error) });
    }
  });

  app.put('/api/disclosures/companies/:id', (request, response) => {
    try {
      const current = getCompany(numberParam(request.params.id, 0));
      if (!current) {
        response.status(404).json({ error: '指定された企業が見つかりません。' });
        return;
      }
      const id = upsertCompany({
        name: typeof request.body?.name === 'string' ? request.body.name : current.name,
        edinetCode: request.body?.edinetCode ?? current.edinetCode,
        secCode: request.body?.secCode ?? current.secCode,
        tickerCode: request.body?.tickerCode ?? current.tickerCode,
        irUrl: request.body?.irUrl === undefined
          ? current.irUrl
          : optionalHttpsUrl(request.body.irUrl, 'IRサイトURL'),
        topix100: current.topix100,
        nikkei225: current.nikkei225,
        largeCap: request.body?.isLargeCap === undefined ? current.isLargeCap : request.body.isLargeCap === true,
        notifyEnabled: request.body?.notifyEnabled === undefined
          ? current.notifyEnabled
          : request.body.notifyEnabled === true,
        tdnetNotifyEnabled: request.body?.tdnetNotifyEnabled === undefined
          ? current.tdnetNotifyEnabled
          : request.body.tdnetNotifyEnabled === true,
      });
      response.json(getCompany(id));
    } catch (error) {
      response.status(400).json({ error: publicError(error) });
    }
  });

  app.post('/api/disclosures/summaries', async (request, response) => {
    const ids: number[] = Array.isArray(request.body?.ids)
      ? Array.from(new Set<number>(
          request.body.ids
            .map((id: unknown) => numberParam(id, 0))
            .filter((id: number) => id > 0),
        ))
      : [];
    if (ids.length === 0 || ids.length > 20) {
      response.status(400).json({ error: '要約対象は1件以上20件以内で選択してください。' });
      return;
    }
    const settings = readDisclosureSettings();
    const results: Array<{ id: number; text?: string; model?: string; error?: string }> = [];
    for (const id of ids) {
      try {
        const result = await summarizeDisclosure(id);
        results.push(result);
        if (settings.summaryNotificationsEnabled) {
          const disclosure = getDisclosure(id);
          await notifyDiscordText([
            '📝 **企業開示DB Gemini要約**',
            disclosure ? `企業: ${disclosure.companyName}${disclosure.secCode ? `（${disclosure.secCode}）` : ''}` : '',
            disclosure ? `タイトル: ${disclosure.title}` : '',
            '',
            result.text,
          ].filter(Boolean).join('\n'));
        }
      } catch (error) {
        results.push({ id, error: publicError(error) });
      }
    }
    response.json({ results });
  });

  app.get('/api/disclosures/:id/pdf', (request, response) => {
    void handlePdf(request, response);
  });
}
