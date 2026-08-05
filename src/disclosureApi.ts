import type {
  DisclosureApiSettings,
  DisclosureCompany,
  DisclosureListResponse,
  DisclosureSearchRefreshResult,
  DisclosureSettings,
  DisclosureSourceGroup,
  DisclosureSyncRunResult,
  DisclosureSyncStatus,
  DisclosureTag,
} from '../disclosureTypes';

export const DISCLOSURE_COMPANY_NOTIFICATIONS_CHANGED_EVENT = 'mooview:disclosure-company-notifications-changed';

export function announceDisclosureCompanyNotificationsChanged(): void {
  window.dispatchEvent(new Event(DISCLOSURE_COMPANY_NOTIFICATIONS_CHANGED_EVENT));
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(payload?.error || `企業開示DBへの接続に失敗しました（HTTP ${response.status}）。`);
  }
  if (payload === null) throw new Error('企業開示DBから空の応答が返されました。');
  return payload;
}

export async function fetchDisclosures(params: {
  query: string;
  largeCapOnly: boolean;
  tag: DisclosureTag | '';
  sort: string;
  direction: 'asc' | 'desc' | '';
  page: number;
  pageSize: number | 'all';
  sourceGroups: DisclosureSourceGroup[];
  excludeNoise: boolean;
}): Promise<DisclosureListResponse> {
  const query = new URLSearchParams({
    query: params.query,
    largeCapOnly: params.largeCapOnly ? '1' : '0',
    tag: params.tag,
    sort: params.sort,
    direction: params.direction,
    page: String(params.page),
    pageSize: String(params.pageSize),
    sources: params.sourceGroups.join(','),
    excludeNoise: params.excludeNoise ? '1' : '0',
  });
  return readJson<DisclosureListResponse>(await fetch(`/api/disclosures?${query}`));
}

export async function fetchDisclosureSettings(): Promise<DisclosureApiSettings> {
  return readJson<DisclosureApiSettings>(await fetch('/api/disclosures/settings'));
}

export async function saveDisclosureSettings(settings: DisclosureSettings): Promise<DisclosureSettings> {
  return readJson<DisclosureSettings>(await fetch('/api/disclosures/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  }));
}

export async function fetchDisclosureStatus(): Promise<DisclosureSyncStatus> {
  return readJson<DisclosureSyncStatus>(await fetch('/api/disclosures/status'));
}

export async function synchronizeDisclosures(): Promise<DisclosureSyncRunResult> {
  return readJson<DisclosureSyncRunResult>(await fetch('/api/disclosures/sync', {
    method: 'POST',
  }));
}

export async function synchronizeEdinetDisclosures(): Promise<DisclosureSyncRunResult> {
  return readJson<DisclosureSyncRunResult>(await fetch('/api/disclosures/sync/edinet', {
    method: 'POST',
  }));
}

export async function synchronizeTdnetDisclosures(): Promise<DisclosureSyncRunResult> {
  return readJson<DisclosureSyncRunResult>(await fetch('/api/disclosures/sync/tdnet', {
    method: 'POST',
  }));
}

export async function refreshDisclosuresForSearch(
  query: string,
  sources: DisclosureSourceGroup[],
): Promise<DisclosureSearchRefreshResult> {
  return readJson<DisclosureSearchRefreshResult>(await fetch('/api/disclosures/search-refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, sources }),
  }));
}

export async function fetchDisclosureCompanies(query = ''): Promise<DisclosureCompany[]> {
  const params = new URLSearchParams({ query });
  return readJson<DisclosureCompany[]>(await fetch(`/api/disclosures/companies?${params}`));
}

export async function createDisclosureCompany(input: {
  name: string;
  secCode: string;
  edinetCode: string;
  irUrl: string;
  notifyEnabled: boolean;
  tdnetNotifyEnabled: boolean;
}): Promise<DisclosureCompany> {
  return readJson<DisclosureCompany>(await fetch('/api/disclosures/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }));
}

export async function updateDisclosureCompany(
  id: number,
  input: Partial<DisclosureCompany>,
): Promise<DisclosureCompany> {
  return readJson<DisclosureCompany>(await fetch(`/api/disclosures/companies/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }));
}

export async function setAllDisclosureCompanyNotifications(
  source: DisclosureSourceGroup,
  enabled: boolean,
): Promise<{
  source: DisclosureSourceGroup;
  enabled: boolean;
  updated: number;
}> {
  return readJson(await fetch('/api/disclosures/companies/notifications', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, enabled }),
  }));
}

export async function summarizeDisclosures(ids: number[]): Promise<{
  results: Array<{ id: number; text?: string; model?: string; error?: string }>;
}> {
  return readJson(await fetch('/api/disclosures/summaries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }));
}
