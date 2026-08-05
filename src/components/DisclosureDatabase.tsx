import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bell,
  BellOff,
  Bot,
  Building2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Link2,
  LoaderCircle,
  RefreshCw,
  Search,
  Square,
} from 'lucide-react';

import {
  DISCLOSURE_TAGS,
  type DisclosureListItem,
  type DisclosureListResponse,
  type DisclosureSourceGroup,
  type DisclosureTag,
} from '../../disclosureTypes';
import {
  announceDisclosureCompanyNotificationsChanged,
  DISCLOSURE_COMPANY_NOTIFICATIONS_CHANGED_EVENT,
  fetchDisclosures,
  fetchDisclosureSettings,
  refreshDisclosuresForSearch,
  saveDisclosureSettings,
  summarizeDisclosures,
  synchronizeEdinetDisclosures,
  synchronizeTdnetDisclosures,
  synchronizeTdnetScrapedDisclosures,
  updateDisclosureCompany,
} from '../disclosureApi';

type SortDirection = 'asc' | 'desc' | '';
type DisclosureSyncAction = DisclosureSourceGroup | 'tdnet-scrape';
type SortKey = 'publishedAt' | 'companyName' | 'secCode' | 'title' | 'tag'
  | 'sourceRoute' | 'summaryUpdatedAt' | 'documentUrl' | 'irUrl' | 'buffettCodeUrl';
type DisclosureColumnKey = 'select' | 'summary' | 'publishedAt' | 'companyName' | 'secCode'
  | 'sourceRoute' | 'title' | 'tag' | 'documentUrl' | 'irUrl' | 'buffettCodeUrl';
type DisclosurePageSize = 50 | 100 | 200 | 300 | 'all';

interface DisclosureContextMenuState {
  item: DisclosureListItem;
  x: number;
  y: number;
}

interface DisclosureLoadOverrides {
  query?: string;
  largeCapOnly?: boolean;
  tag?: DisclosureTag | '';
  sort?: SortKey;
  direction?: SortDirection;
  page?: number;
  sourceGroups?: DisclosureSourceGroup[];
  excludeNoise?: boolean;
}

const DISCLOSURE_COLUMN_WIDTHS_STORAGE_KEY = 'mooview_disclosure_column_widths_v1';
const DISCLOSURE_COLUMN_ORDER_STORAGE_KEY = 'mooview_disclosure_column_order_v1';
const DISCLOSURE_PAGE_SIZE_STORAGE_KEY = 'mooview_disclosure_page_size_v1';
const DEFAULT_DISCLOSURE_COLUMN_ORDER: DisclosureColumnKey[] = [
  'select',
  'publishedAt',
  'secCode',
  'sourceRoute',
  'tag',
  'companyName',
  'title',
  'summary',
  'documentUrl',
  'irUrl',
  'buffettCodeUrl',
];
const DEFAULT_DISCLOSURE_COLUMN_WIDTHS: Record<DisclosureColumnKey, number> = {
  select: 44,
  summary: 88,
  publishedAt: 132,
  companyName: 192,
  secCode: 96,
  sourceRoute: 52,
  title: 480,
  tag: 88,
  documentUrl: 56,
  irUrl: 68,
  buffettCodeUrl: 56,
};
const MIN_DISCLOSURE_COLUMN_WIDTHS: Record<DisclosureColumnKey, number> = {
  select: 40,
  summary: 68,
  publishedAt: 96,
  companyName: 112,
  secCode: 72,
  sourceRoute: 44,
  title: 180,
  tag: 64,
  documentUrl: 44,
  irUrl: 48,
  buffettCodeUrl: 44,
};
const LEGACY_DISCLOSURE_LINK_COLUMN_WIDTHS: Partial<Record<DisclosureColumnKey, number>> = {
  documentUrl: 88,
  irUrl: 116,
  buffettCodeUrl: 132,
};

function loadDisclosureColumnWidths(): Record<DisclosureColumnKey, number> {
  if (typeof window === 'undefined') return { ...DEFAULT_DISCLOSURE_COLUMN_WIDTHS };
  try {
    const stored = JSON.parse(window.localStorage.getItem(DISCLOSURE_COLUMN_WIDTHS_STORAGE_KEY) || '{}') as Record<string, unknown>;
    return DEFAULT_DISCLOSURE_COLUMN_ORDER.reduce<Record<DisclosureColumnKey, number>>((widths, key) => {
      const storedWidth = Number(stored[key]);
      const candidate = LEGACY_DISCLOSURE_LINK_COLUMN_WIDTHS[key] === storedWidth
        ? DEFAULT_DISCLOSURE_COLUMN_WIDTHS[key]
        : storedWidth;
      widths[key] = Number.isFinite(candidate)
        ? Math.min(1_200, Math.max(MIN_DISCLOSURE_COLUMN_WIDTHS[key], candidate))
        : DEFAULT_DISCLOSURE_COLUMN_WIDTHS[key];
      return widths;
    }, { ...DEFAULT_DISCLOSURE_COLUMN_WIDTHS });
  } catch {
    return { ...DEFAULT_DISCLOSURE_COLUMN_WIDTHS };
  }
}

function loadDisclosureColumnOrder(): DisclosureColumnKey[] {
  if (typeof window === 'undefined') return [...DEFAULT_DISCLOSURE_COLUMN_ORDER];
  try {
    const stored = JSON.parse(window.localStorage.getItem(DISCLOSURE_COLUMN_ORDER_STORAGE_KEY) || '[]') as unknown;
    if (!Array.isArray(stored)) return [...DEFAULT_DISCLOSURE_COLUMN_ORDER];
    const valid = stored.filter((key): key is DisclosureColumnKey => (
      typeof key === 'string' && DEFAULT_DISCLOSURE_COLUMN_ORDER.includes(key as DisclosureColumnKey)
    ));
    const next = Array.from(new Set(valid));
    for (const key of DEFAULT_DISCLOSURE_COLUMN_ORDER) {
      if (next.includes(key)) continue;
      if (key === 'sourceRoute' && next.includes('secCode')) {
        next.splice(next.indexOf('secCode') + 1, 0, key);
      } else {
        next.push(key);
      }
    }
    return next;
  } catch {
    return [...DEFAULT_DISCLOSURE_COLUMN_ORDER];
  }
}

function loadDisclosurePageSize(): DisclosurePageSize {
  if (typeof window === 'undefined') return 50;
  const stored = window.localStorage.getItem(DISCLOSURE_PAGE_SIZE_STORAGE_KEY);
  if (stored === 'all') return 'all';
  const numeric = Number(stored);
  return [50, 100, 200, 300].includes(numeric) ? numeric as DisclosurePageSize : 50;
}

const EMPTY_RESPONSE: DisclosureListResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 50,
};

function formatPublishedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}${part('month')}${part('day')} ${part('hour')}:${part('minute')}`;
}

function tagClassName(tag: DisclosureTag): string {
  if (tag === '短信') return 'border-cyan-800 bg-cyan-950/70 text-cyan-300';
  if (tag === '有報') return 'border-emerald-800 bg-emerald-950/70 text-emerald-300';
  if (tag === '上方修正' || tag === '増配' || tag === '自己株買い') return 'border-emerald-700 bg-emerald-950/70 text-emerald-200';
  if (tag === '下方修正') return 'border-red-800 bg-red-950/70 text-red-300';
  if (tag === '業績修正' || tag === '決算説明') return 'border-amber-800 bg-amber-950/70 text-amber-300';
  if (tag === '適時開示') return 'border-blue-800 bg-blue-950/70 text-blue-300';
  if (tag === 'NOISE') return 'border-gray-800 bg-gray-950 text-gray-600';
  return 'border-gray-700 bg-gray-900 text-gray-300';
}

export function DisclosureDatabase() {
  const [response, setResponse] = useState<DisclosureListResponse>(EMPTY_RESPONSE);
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [edinetEnabled, setEdinetEnabled] = useState(true);
  const [tdnetEnabled, setTdnetEnabled] = useState(true);
  const [excludeNoise, setExcludeNoise] = useState(true);
  const [largeCapOnly, setLargeCapOnly] = useState(true);
  const [tag, setTag] = useState<DisclosureTag | ''>('');
  const [sort, setSort] = useState<SortKey>('publishedAt');
  const [direction, setDirection] = useState<SortDirection>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<DisclosurePageSize>(loadDisclosurePageSize);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [syncingSource, setSyncingSource] = useState<DisclosureSyncAction | null>(null);
  const [searchSyncing, setSearchSyncing] = useState(false);
  const [summaryIds, setSummaryIds] = useState<Set<number>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<DisclosureColumnKey, number>>(loadDisclosureColumnWidths);
  const [columnOrder, setColumnOrder] = useState<DisclosureColumnKey[]>(loadDisclosureColumnOrder);
  const [resizingColumn, setResizingColumn] = useState<DisclosureColumnKey | null>(null);
  const [draggingColumn, setDraggingColumn] = useState<DisclosureColumnKey | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<DisclosureColumnKey | null>(null);
  const [contextMenu, setContextMenu] = useState<DisclosureContextMenuState | null>(null);
  const [companyNotificationIds, setCompanyNotificationIds] = useState<Set<number>>(() => new Set());
  const [noiseEditorOpen, setNoiseEditorOpen] = useState(false);
  const [noiseKeywordsText, setNoiseKeywordsText] = useState('');
  const [noiseKeywordsTitle, setNoiseKeywordsTitle] = useState('読み込み中…');
  const [savingNoiseKeywords, setSavingNoiseKeywords] = useState(false);
  const filterDetailsRef = useRef<HTMLDetailsElement>(null);
  const columnResizeRef = useRef<{
    key: DisclosureColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const load = useCallback(async (overrides: DisclosureLoadOverrides = {}) => {
    setLoading(true);
    setError(null);
    try {
      setResponse(await fetchDisclosures({
        query: overrides.query ?? query,
        largeCapOnly: overrides.largeCapOnly ?? largeCapOnly,
        tag: overrides.tag ?? tag,
        sort: overrides.sort ?? sort,
        direction: overrides.direction ?? direction,
        page: overrides.page ?? page,
        pageSize,
        sourceGroups: overrides.sourceGroups ?? [
          ...(edinetEnabled ? ['edinet' as const] : []),
          ...(tdnetEnabled ? ['tdnet' as const] : []),
        ],
        excludeNoise: overrides.excludeNoise ?? excludeNoise,
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '企業開示DBを読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [direction, edinetEnabled, excludeNoise, largeCapOnly, page, pageSize, query, sort, tag, tdnetEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [edinetEnabled, excludeNoise, largeCapOnly, page, pageSize, query, tag, tdnetEnabled]);

  useEffect(() => {
    void fetchDisclosureSettings().then((settings) => {
      const keywords = settings.noiseFilterKeywords.join('\n');
      setNoiseKeywordsText(keywords);
      setNoiseKeywordsTitle(settings.noiseFilterKeywords.length > 0
        ? `除外キーワード: ${settings.noiseFilterKeywords.join(' / ')}`
        : '除外キーワードは未登録です');
    }).catch(() => setNoiseKeywordsTitle('除外キーワードを取得できませんでした'));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(DISCLOSURE_COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(columnWidths));
    } catch {
      // ブラウザの保存領域が利用できなくても、現在の画面では列幅変更を継続する。
    }
  }, [columnWidths]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DISCLOSURE_COLUMN_ORDER_STORAGE_KEY, JSON.stringify(columnOrder));
    } catch {
      // 保存できない環境でも現在の列順変更は継続する。
    }
  }, [columnOrder]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DISCLOSURE_PAGE_SIZE_STORAGE_KEY, String(pageSize));
    } catch {
      // 保存できない環境でも現在の表示件数は維持する。
    }
  }, [pageSize]);

  useEffect(() => {
    const handleNotificationChange = () => void load();
    window.addEventListener(DISCLOSURE_COMPANY_NOTIFICATIONS_CHANGED_EVENT, handleNotificationChange);
    return () => window.removeEventListener(DISCLOSURE_COMPANY_NOTIFICATIONS_CHANGED_EVENT, handleNotificationChange);
  }, [load]);

  useEffect(() => {
    const closeFilter = (event: PointerEvent) => {
      const details = filterDetailsRef.current;
      if (!details?.open || details.contains(event.target as Node)) return;
      details.open = false;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && filterDetailsRef.current?.open) {
        filterDetailsRef.current.open = false;
      }
    };
    window.addEventListener('pointerdown', closeFilter);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', closeFilter);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!resizingColumn || !columnResizeRef.current) return undefined;
    const resizeState = columnResizeRef.current;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (event: PointerEvent) => {
      const width = Math.min(
        1_200,
        Math.max(
          MIN_DISCLOSURE_COLUMN_WIDTHS[resizeState.key],
          resizeState.startWidth + event.clientX - resizeState.startX,
        ),
      );
      setColumnWidths((current) => ({ ...current, [resizeState.key]: Math.round(width) }));
    };
    const handlePointerUp = () => {
      columnResizeRef.current = null;
      setResizingColumn(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    window.addEventListener('pointercancel', handlePointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [resizingColumn]);

  const selectedItems = useMemo(
    () => response.items.filter((item) => selectedIds.has(item.id)),
    [response.items, selectedIds],
  );
  const selectableItems = useMemo(
    () => response.items.filter((item) => item.pdfAvailable),
    [response.items],
  );
  const allVisibleSelected = selectableItems.length > 0
    && selectableItems.every((item) => selectedIds.has(item.id));
  const totalPages = Math.max(1, Math.ceil(response.total / response.pageSize));
  const tableWidth = useMemo(
    () => columnOrder.reduce((total, key) => total + columnWidths[key], 0),
    [columnOrder, columnWidths],
  );

  const cycleSort = (key: SortKey) => {
    setPage(1);
    if (sort !== key || direction === '') {
      setSort(key);
      setDirection('asc');
    } else if (direction === 'asc') {
      setDirection('desc');
    } else {
      setSort('publishedAt');
      setDirection('');
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sort !== key || direction === '') return <ArrowUpDown className="h-3 w-3 text-gray-600" />;
    return direction === 'asc'
      ? <ArrowUp className="h-3 w-3 text-emerald-300" />
      : <ArrowDown className="h-3 w-3 text-emerald-300" />;
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const item of selectableItems) {
        if (allVisibleSelected) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  };

  const downloadItemsIndividually = async (items: DisclosureListItem[]) => {
    const downloadable = items.filter((item) => item.downloadUrl);
    if (downloadable.length === 0) {
      setError('ダウンロード可能なPDFを選択してください。');
      return;
    }
    setError(null);
    setMessage(`${downloadable.length}件のPDFを個別ダウンロードします。`);
    for (const item of downloadable) {
      const anchor = document.createElement('a');
      anchor.href = item.downloadUrl || '';
      anchor.download = '';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
  };

  const runSummaries = async (ids: number[]) => {
    if (ids.length === 0) {
      setError('要約するPDFを選択してください。');
      return;
    }
    if (ids.length > 20) {
      setError('Gemini要約は一度に20件まで選択できます。');
      return;
    }
    setSummaryIds(new Set(ids));
    setError(null);
    setMessage(`${ids.length}件を順番にGeminiで要約しています。`);
    try {
      const result = await summarizeDisclosures(ids);
      const succeeded = result.results.filter((item) => item.text).map((item) => item.id);
      const failures = result.results.filter((item) => item.error);
      setExpandedIds((current) => new Set([...current, ...succeeded]));
      if (failures.length > 0) {
        setError(failures.map((item) => `${item.id}: ${item.error}`).join('\n'));
      }
      setMessage(`${succeeded.length}件のGemini要約が完了しました。`);
      await load();
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : 'Gemini要約に失敗しました。');
    } finally {
      setSummaryIds(new Set());
    }
  };

  const handleRowSummary = (item: DisclosureListItem) => {
    if (item.summaryText) {
      setExpandedIds((current) => {
        const next = new Set(current);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      return;
    }
    void runSummaries([item.id]);
  };

  const handleSync = async (source: DisclosureSyncAction) => {
    setSyncingSource(source);
    setError(null);
    const sourceLabel = source === 'tdnet-scrape'
      ? 'TDNET公式ページ'
      : source === 'tdnet'
        ? 'TDNET API'
        : 'EDINET・EDINET DB';
    setMessage(`${sourceLabel}から開示情報を取得しています…`);
    try {
      const result = source === 'tdnet-scrape'
        ? await synchronizeTdnetScrapedDisclosures()
        : source === 'tdnet'
          ? await synchronizeTdnetDisclosures()
          : await synchronizeEdinetDisclosures();
      const failures = result.sources.filter((source) => source.status === 'failed');
      if (result.added > 0) {
        const visibleSources: DisclosureSourceGroup[] = [
          ...(edinetEnabled || source === 'edinet' ? ['edinet' as const] : []),
          ...(tdnetEnabled || source === 'tdnet' || source === 'tdnet-scrape' ? ['tdnet' as const] : []),
        ];
        if (source === 'tdnet' || source === 'tdnet-scrape') setTdnetEnabled(true);
        else setEdinetEnabled(true);
        setSearchInput('');
        setQuery('');
        setLargeCapOnly(false);
        setTag('');
        setPage(1);
        setSort('publishedAt');
        setDirection('');
        await load({
          query: '',
          largeCapOnly: false,
          tag: '',
          page: 1,
          sort: 'publishedAt',
          direction: '',
          sourceGroups: visibleSources,
        });
        setMessage(`${result.message}\n絞り込みを解除し、追加情報をリスト先頭へ反映しました。`);
      } else {
        await load();
        setMessage(result.message);
      }
      if (failures.length > 0) {
        setError(`${result.message}\n${failures.map((failed) => `${failed.source === 'tdnet-scrape' ? 'TDスクレイピング' : failed.source === 'tdnet' ? 'TDNET' : failed.source === 'edinet' ? 'EDINET' : 'EDINET DB'}: ${failed.error}`).join('\n')}`);
      }
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : '同期に失敗しました。');
    } finally {
      setSyncingSource(null);
    }
  };

  const handleSearchRefresh = async () => {
    const targetQuery = searchInput.trim();
    if (!targetQuery || searchSyncing) return;
    setSearchSyncing(true);
    setError(null);
    const sourceGroups: DisclosureSourceGroup[] = [
      ...(edinetEnabled ? ['edinet' as const] : []),
      ...(tdnetEnabled ? ['tdnet' as const] : []),
    ];
    if (sourceGroups.length === 0) {
      setError('再取得する配信元をTDNETまたはEDINETから1つ以上選択してください。');
      setSearchSyncing(false);
      return;
    }
    setMessage(`${targetQuery}の開示情報を${sourceGroups.map((source) => source === 'tdnet' ? 'TDNET' : 'EDINET DB').join('・')}から再取得しています…`);
    setQuery(targetQuery);
    setLargeCapOnly(false);
    setTag('');
    setPage(1);
    setSort('publishedAt');
    setDirection('');
    try {
      const result = await refreshDisclosuresForSearch(targetQuery, sourceGroups);
      await load({
        query: targetQuery,
        largeCapOnly: false,
        tag: '',
        page: 1,
        sort: 'publishedAt',
        direction: '',
      });
      setMessage(`${result.message}\n検索結果を取得日時の新しい順に更新しました。`);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : '検索対象のAPI再取得に失敗しました。');
    } finally {
      setSearchSyncing(false);
    }
  };

  const openExternal = (url: string | null) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const toggleCompanyNotification = async (item: DisclosureListItem) => {
    if (!item.companyId) {
      setError('この行は企業情報に紐付いていないため、Discord通知対象を変更できません。');
      return;
    }
    setCompanyNotificationIds((current) => new Set(current).add(item.companyId as number));
    setError(null);
    try {
      const tdnet = item.source === 'tdnet' || item.source === 'tdnet-scrape';
      const currentlyEnabled = tdnet
        ? item.tdnetCompanyNotifyEnabled
        : item.edinetCompanyNotifyEnabled;
      const saved = await updateDisclosureCompany(item.companyId, {
        ...(tdnet
          ? { tdnetNotifyEnabled: !currentlyEnabled }
          : { notifyEnabled: !currentlyEnabled }),
      });
      setResponse((current) => ({
        ...current,
        items: current.items.map((candidate) => candidate.companyId === saved.id
          ? {
              ...candidate,
              companyNotifyEnabled: saved.edinetNotifyEnabled,
              edinetCompanyNotifyEnabled: saved.edinetNotifyEnabled,
              tdnetCompanyNotifyEnabled: saved.tdnetNotifyEnabled,
            }
          : candidate),
      }));
      announceDisclosureCompanyNotificationsChanged();
      const savedEnabled = tdnet ? saved.tdnetNotifyEnabled : saved.edinetNotifyEnabled;
      setMessage(`${saved.name}の${tdnet ? 'TDNET' : 'EDINET'} Discord通知対象を${savedEnabled ? 'ON' : 'OFF'}にしました。`);
    } catch (notificationError) {
      setError(notificationError instanceof Error ? notificationError.message : 'Discord通知対象を変更できませんでした。');
    } finally {
      setCompanyNotificationIds((current) => {
        const next = new Set(current);
        next.delete(item.companyId as number);
        return next;
      });
    }
  };

  const openNoiseEditor = async () => {
    setError(null);
    try {
      const settings = await fetchDisclosureSettings();
      setNoiseKeywordsText(settings.noiseFilterKeywords.join('\n'));
      setNoiseEditorOpen(true);
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : 'ノイズ除去設定を読み込めませんでした。');
    }
  };

  const saveNoiseKeywords = async () => {
    setSavingNoiseKeywords(true);
    setError(null);
    try {
      const settings = await fetchDisclosureSettings();
      const noiseFilterKeywords = Array.from(new Set<string>(
        noiseKeywordsText.split(/\r?\n/).map((keyword) => keyword.trim()).filter((keyword): keyword is string => Boolean(keyword)),
      ));
      await saveDisclosureSettings({ ...settings, noiseFilterKeywords });
      setNoiseKeywordsText(noiseFilterKeywords.join('\n'));
      setNoiseKeywordsTitle(noiseFilterKeywords.length > 0
        ? `除外キーワード: ${noiseFilterKeywords.join(' / ')}`
        : '除外キーワードは未登録です');
      setNoiseEditorOpen(false);
      await load();
      setMessage(`ノイズ除去キーワード${noiseFilterKeywords.length}件を保存し、既存データを再分類しました。`);
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : 'ノイズ除去設定を保存できませんでした。');
    } finally {
      setSavingNoiseKeywords(false);
    }
  };

  const showContextMenu = (event: React.MouseEvent, item: DisclosureListItem) => {
    event.preventDefault();
    setContextMenu({
      item,
      x: Math.min(event.clientX, Math.max(8, window.innerWidth - 238)),
      y: Math.min(event.clientY, Math.max(8, window.innerHeight - 292)),
    });
  };

  const moveColumn = (source: DisclosureColumnKey, target: DisclosureColumnKey) => {
    if (source === target) return;
    setColumnOrder((current) => {
      const next = current.filter((key) => key !== source);
      const targetIndex = next.indexOf(target);
      next.splice(targetIndex < 0 ? next.length : targetIndex, 0, source);
      return next;
    });
  };

  const SortableHeader = ({ sortKey, children }: { sortKey: SortKey; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => cycleSort(sortKey)}
      className="flex w-full items-center gap-1 text-left font-bold text-gray-300 hover:text-white"
      title="クリックで昇順・降順・デフォルトを切り替え"
    >
      <span>{children}</span>
      {sortIcon(sortKey)}
    </button>
  );

  const beginColumnResize = (
    event: React.PointerEvent<HTMLDivElement>,
    key: DisclosureColumnKey,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    columnResizeRef.current = {
      key,
      startX: event.clientX,
      startWidth: columnWidths[key],
    };
    setResizingColumn(key);
  };

  const adjustColumnWidth = (key: DisclosureColumnKey, delta: number) => {
    setColumnWidths((current) => ({
      ...current,
      [key]: Math.min(
        1_200,
        Math.max(MIN_DISCLOSURE_COLUMN_WIDTHS[key], current[key] + delta),
      ),
    }));
  };

  const ResizableHeader = ({
    columnKey,
    label,
    sortKey,
    children,
  }: {
    columnKey: DisclosureColumnKey;
    label: string;
    sortKey?: SortKey;
    children?: React.ReactNode;
  }) => (
    <th
      data-disclosure-column={columnKey}
      draggable={resizingColumn === null}
      onDragStart={(event) => {
        if (resizingColumn) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', columnKey);
        setDraggingColumn(columnKey);
      }}
      onDragOver={(event) => {
        if (!draggingColumn || draggingColumn === columnKey) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDragOverColumn(columnKey);
      }}
      onDrop={(event) => {
        event.preventDefault();
        const source = draggingColumn || event.dataTransfer.getData('text/plain') as DisclosureColumnKey;
        if (source) moveColumn(source, columnKey);
        setDraggingColumn(null);
        setDragOverColumn(null);
      }}
      onDragEnd={() => {
        setDraggingColumn(null);
        setDragOverColumn(null);
      }}
      className={`relative cursor-grab overflow-hidden whitespace-nowrap px-2 py-2.5 active:cursor-grabbing ${
        draggingColumn === columnKey ? 'opacity-45' : ''
      } ${dragOverColumn === columnKey ? 'bg-emerald-950/70 shadow-[inset_2px_0_0_#34d399]' : ''}`}
      style={{ width: columnWidths[columnKey] }}
      title="ヘッダーをドラッグして列順を変更"
    >
      <div className="flex min-w-0 items-center gap-0.5">
        <div className="min-w-0 flex-1">
          {sortKey ? <SortableHeader sortKey={sortKey}>{label}</SortableHeader> : children}
        </div>
      </div>
      <div
        role="separator"
        tabIndex={0}
        aria-label={`${label}列の幅を変更`}
        aria-orientation="vertical"
        aria-valuemin={MIN_DISCLOSURE_COLUMN_WIDTHS[columnKey]}
        aria-valuemax={1_200}
        aria-valuenow={columnWidths[columnKey]}
        data-column-resizer={columnKey}
        draggable={false}
        title="左右にドラッグして列幅変更・ダブルクリックで初期幅に戻す"
        onPointerDown={(event) => beginColumnResize(event, columnKey)}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setColumnWidths((current) => ({
            ...current,
            [columnKey]: DEFAULT_DISCLOSURE_COLUMN_WIDTHS[columnKey],
          }));
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.stopPropagation();
          const step = event.shiftKey ? 24 : 8;
          adjustColumnWidth(columnKey, event.key === 'ArrowRight' ? step : -step);
        }}
        className={`group absolute -right-1 top-0 z-20 h-full w-2 cursor-col-resize touch-none select-none outline-none ${
          resizingColumn === columnKey ? 'bg-emerald-400/25' : 'hover:bg-emerald-400/15 focus:bg-emerald-400/20'
        }`}
      >
        <span className={`absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 ${
          resizingColumn === columnKey ? 'bg-emerald-300' : 'bg-[#343434] group-hover:bg-emerald-500 group-focus:bg-emerald-400'
        }`} />
      </div>
    </th>
  );

  const renderHeader = (columnKey: DisclosureColumnKey) => {
    if (columnKey === 'select') {
      return (
        <React.Fragment key={columnKey}>
          <ResizableHeader columnKey={columnKey} label="選択">
            <button type="button" onClick={toggleAllVisible} aria-label="表示中のPDFをすべて選択" className="flex w-full items-center justify-center">
              {allVisibleSelected
                ? <CheckSquare className="h-4 w-4 text-emerald-300" />
                : <Square className="h-4 w-4 text-gray-500" />}
            </button>
          </ResizableHeader>
        </React.Fragment>
      );
    }
    const definitions: Record<Exclude<DisclosureColumnKey, 'select'>, { label: string; sortKey: SortKey }> = {
      publishedAt: { label: '日時', sortKey: 'publishedAt' },
      secCode: { label: 'コード', sortKey: 'secCode' },
      sourceRoute: { label: '経由', sortKey: 'sourceRoute' },
      tag: { label: 'タグ', sortKey: 'tag' },
      companyName: { label: '企業名', sortKey: 'companyName' },
      title: { label: '配信情報タイトル', sortKey: 'title' },
      summary: { label: '要約', sortKey: 'summaryUpdatedAt' },
      documentUrl: { label: '資料URL', sortKey: 'documentUrl' },
      irUrl: { label: 'EDINET DB', sortKey: 'irUrl' },
      buffettCodeUrl: { label: 'バフェット・コード', sortKey: 'buffettCodeUrl' },
    };
    const definition = definitions[columnKey];
    return (
      <React.Fragment key={columnKey}>
        <ResizableHeader
          columnKey={columnKey}
          label={definition.label}
          sortKey={definition.sortKey}
        />
      </React.Fragment>
    );
  };

  const renderCell = (item: DisclosureListItem, columnKey: DisclosureColumnKey) => {
    switch (columnKey) {
      case 'select':
        return (
          <td key={columnKey} className="px-2 py-2 text-center align-middle">
            <input
              type="checkbox"
              checked={selectedIds.has(item.id)}
              disabled={!item.pdfAvailable}
              onChange={() => toggleSelected(item.id)}
              className="mx-auto block accent-emerald-500 disabled:opacity-25"
              aria-label={`${item.companyName}の資料を選択`}
            />
          </td>
        );
      case 'publishedAt':
        return <td key={columnKey} className="truncate whitespace-nowrap px-2 py-1.5 align-middle font-mono text-gray-400" title={formatPublishedAt(item.publishedAt)}>{formatPublishedAt(item.publishedAt)}</td>;
      case 'secCode':
        return (
          <td key={columnKey} className="truncate whitespace-nowrap px-2 py-1.5 align-middle font-mono">
            <div className="text-cyan-300">{item.secCode || '—'}</div>
          </td>
        );
      case 'sourceRoute': {
        const tdnet = item.source === 'tdnet' || item.source === 'tdnet-scrape';
        return (
          <td key={columnKey} className="px-2 py-1.5 align-middle text-center">
            <span className={`inline-flex h-5 min-w-5 items-center justify-center border font-black ${tdnet ? 'border-blue-900 bg-blue-950/60 text-blue-300' : 'border-emerald-900 bg-emerald-950/60 text-emerald-300'}`}>{tdnet ? 'T' : 'E'}</span>
          </td>
        );
      }
      case 'tag':
        return (
          <td key={columnKey} className="truncate whitespace-nowrap px-2 py-1.5 align-middle">
            <span className={`inline-flex border px-1.5 py-0.5 font-bold ${tagClassName(item.tag)}`}>{item.tag}</span>
          </td>
        );
      case 'companyName':
        return <td key={columnKey} className="truncate whitespace-nowrap px-2 py-1.5 align-middle font-bold text-gray-100" title={item.companyName}>{item.companyName}</td>;
      case 'title':
        return <td key={columnKey} className="truncate whitespace-nowrap px-2 py-1.5 align-middle text-gray-200" title={item.title}>{item.title}</td>;
      case 'summary':
        return (
          <td key={columnKey} className="whitespace-nowrap px-2 py-1.5 align-middle">
            <button
              type="button"
              onClick={() => handleRowSummary(item)}
              disabled={!item.pdfAvailable || summaryIds.has(item.id)}
              className="flex h-7 items-center gap-1 border border-violet-900 bg-violet-950/35 px-2 font-bold text-violet-200 hover:bg-violet-900/50 disabled:opacity-30"
            >
              {summaryIds.has(item.id)
                ? <LoaderCircle className="h-3 w-3 animate-spin" />
                : <Bot className="h-3 w-3" />}
              {item.summaryText ? '表示' : '要約'}
            </button>
          </td>
        );
      case 'documentUrl':
        return (
          <td key={columnKey} className="px-1 py-2 align-top text-center">
            {item.documentUrl ? (
              <a href={item.documentUrl} target="_blank" rel="noreferrer" aria-label="資料URLを開く" title="資料URLを開く" className="inline-flex h-6 w-6 items-center justify-center text-cyan-300 hover:bg-cyan-950/50 hover:text-cyan-100">
                <Link2 className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </td>
        );
      case 'irUrl':
        return (
          <td key={columnKey} className="px-1 py-2 align-top">
            <div className="flex items-center justify-center gap-0.5">
              {item.edinetDbCompanyUrl && <a href={item.edinetDbCompanyUrl} target="_blank" rel="noreferrer" aria-label="EDINET DBを開く" title="EDINET DBを開く" className="inline-flex h-6 w-6 items-center justify-center text-emerald-300 hover:bg-emerald-950/50 hover:text-emerald-100"><Link2 className="h-3.5 w-3.5" /></a>}
              {item.irUrl && <a href={item.irUrl} target="_blank" rel="noreferrer" aria-label="企業IRサイトを開く" title="企業IRサイトを開く" className="inline-flex h-6 w-6 items-center justify-center text-cyan-300 hover:bg-cyan-950/50 hover:text-white"><Link2 className="h-3.5 w-3.5" /></a>}
            </div>
          </td>
        );
      case 'buffettCodeUrl':
        return (
          <td key={columnKey} className="px-1 py-2 align-top text-center">
            {item.buffettCodeUrl ? <a href={item.buffettCodeUrl} target="_blank" rel="noreferrer" aria-label="バフェット・コードを開く" title="バフェット・コードを開く" className="inline-flex h-6 w-6 items-center justify-center text-amber-300 hover:bg-amber-950/50 hover:text-amber-100"><Link2 className="h-3.5 w-3.5" /></a> : null}
          </td>
        );
      default:
        return null;
    }
  };

  return (
    <section
      data-disclosure-database="true"
      className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#050505] text-gray-200"
    >
      <div className="shrink-0 border-b border-[#242424] bg-[#0a0a0a] px-3 py-2.5 md:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto flex min-w-0 items-center gap-2">
            <FileText className="h-5 w-5 shrink-0 text-emerald-300" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-black tracking-wide text-white">企業開示DB</h1>
              <p className="text-[9px] text-gray-500">TDNET・EDINET・EDINET DBの開示情報を一覧化</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSync('tdnet-scrape')}
            disabled={syncingSource !== null}
            className="flex h-8 items-center gap-1.5 border border-[#343434] bg-[#121212] px-3 text-[10px] font-bold text-gray-300 hover:border-blue-800 hover:text-blue-200 disabled:opacity-50"
          >
            {syncingSource === 'tdnet-scrape' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {syncingSource === 'tdnet-scrape' ? '取得しています…' : 'TD Sync'}
          </button>
          <button
            type="button"
            onClick={() => void handleSync('tdnet')}
            disabled={syncingSource !== null}
            className="flex h-8 items-center gap-1.5 border border-[#343434] bg-[#121212] px-3 text-[10px] font-bold text-gray-300 hover:border-blue-800 hover:text-blue-200 disabled:opacity-50"
          >
            {syncingSource === 'tdnet' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {syncingSource === 'tdnet' ? '取得しています…' : 'TD API'}
          </button>
          <button
            type="button"
            onClick={() => void handleSync('edinet')}
            disabled={syncingSource !== null}
            className="flex h-8 items-center gap-1.5 border border-[#343434] bg-[#121212] px-3 text-[10px] font-bold text-gray-300 hover:border-emerald-800 hover:text-emerald-200 disabled:opacity-50"
          >
            {syncingSource === 'edinet' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {syncingSource === 'edinet' ? '取得しています…' : 'ED API'}
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <label className="relative min-w-[220px] flex-1 md:max-w-xl">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-500" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                void handleSearchRefresh();
              }}
              placeholder="企業名・類似社名・証券コード・7203.JP・タイトル"
              className="h-9 w-full border border-[#303030] bg-[#101010] pl-8 pr-10 text-[11px] text-gray-100 outline-none placeholder:text-gray-600 focus:border-emerald-700"
              aria-label="企業開示を検索"
            />
            <button
              type="button"
              onClick={() => void handleSearchRefresh()}
              disabled={!searchInput.trim() || searchSyncing}
              aria-label="検索企業の開示情報をAPIから再取得"
              title="入力した企業を選択中の配信元から再取得"
              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center text-emerald-300 hover:bg-emerald-950/50 disabled:text-gray-700"
            >
              {searchSyncing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </button>
          </label>
          <details ref={filterDetailsRef} className="group relative">
            <summary className="flex h-9 min-w-24 cursor-pointer list-none items-center gap-2 border border-[#303030] bg-[#101010] px-2 text-[10px] font-bold text-gray-300 outline-none hover:border-emerald-800 focus:border-emerald-700">
              フィルタ
              <ChevronDown className="ml-auto h-3.5 w-3.5 text-gray-500 transition group-open:rotate-180" />
            </summary>
            <div className="absolute left-0 top-full z-40 mt-1 min-w-44 border border-[#343434] bg-[#0c0c0c] p-1.5 shadow-2xl">
              <label className="flex h-8 cursor-pointer items-center gap-2 px-2 text-[10px] font-bold text-blue-300 hover:bg-[#171717]">
                <input type="checkbox" checked={tdnetEnabled} onChange={(event) => { setTdnetEnabled(event.target.checked); setPage(1); }} className="accent-blue-500" />
                TDNET
              </label>
              <label className="flex h-8 cursor-pointer items-center gap-2 px-2 text-[10px] font-bold text-emerald-300 hover:bg-[#171717]">
                <input type="checkbox" checked={edinetEnabled} onChange={(event) => { setEdinetEnabled(event.target.checked); setPage(1); }} className="accent-emerald-500" />
                EDINET
              </label>
              <label
                className="flex h-8 cursor-pointer items-center gap-2 px-2 text-[10px] font-bold text-gray-300 hover:bg-[#171717]"
                title={noiseKeywordsTitle}
                onContextMenu={(event) => { event.preventDefault(); void openNoiseEditor(); }}
              >
                <input type="checkbox" checked={excludeNoise} onChange={(event) => { setExcludeNoise(event.target.checked); setPage(1); }} className="accent-amber-500" />
                ノイズ除去
              </label>
              <label className="flex h-8 cursor-pointer items-center gap-2 px-2 text-[10px] font-bold text-gray-300 hover:bg-[#171717]">
                <input
                  type="checkbox"
                  checked={largeCapOnly}
                  onChange={(event) => {
                    setLargeCapOnly(event.target.checked);
                    setPage(1);
                  }}
                  className="accent-emerald-500"
                />
                大企業のみ
              </label>
            </div>
          </details>
          <select
            value={tag}
            onChange={(event) => {
              setTag(event.target.value as DisclosureTag | '');
              setPage(1);
            }}
            className="h-9 border border-[#303030] bg-[#101010] px-2 text-[10px] font-bold text-gray-300 outline-none focus:border-emerald-700"
            aria-label="開示タグで絞り込む"
          >
            <option value="">全タグ</option>
            {DISCLOSURE_TAGS.map((candidate) => <option key={candidate}>{candidate}</option>)}
          </select>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
          <span className="font-mono text-gray-500">
            {response.total.toLocaleString('ja-JP')}件 / 選択 {selectedIds.size.toLocaleString('ja-JP')}件
          </span>
          <button
            type="button"
            onClick={() => void downloadItemsIndividually(selectedItems)}
            disabled={selectedItems.length === 0}
            className="ml-auto flex h-8 items-center gap-1.5 border border-cyan-800 bg-cyan-950/40 px-3 font-bold text-cyan-200 hover:bg-cyan-900/50 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Download className="h-3.5 w-3.5" />
            選択PDFを個別ダウンロード
          </button>
          <button
            type="button"
            onClick={() => void runSummaries([...selectedIds])}
            disabled={selectedIds.size === 0 || summaryIds.size > 0}
            className="flex h-8 items-center gap-1.5 border border-violet-800 bg-violet-950/50 px-3 font-bold text-violet-200 hover:bg-violet-900/55 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {summaryIds.size > 0 ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
            選択PDFをGemini要約
          </button>
        </div>

        {(message || error) && (
          <div className={`mt-2 whitespace-pre-wrap border px-2.5 py-1.5 text-[10px] ${
            error
              ? 'border-red-900/70 bg-red-950/35 text-red-300'
              : 'border-emerald-900/70 bg-emerald-950/30 text-emerald-300'
          }`}>
            {error || message}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table
          data-disclosure-resizable-table="true"
          className="hidden table-fixed border-collapse text-[10px] md:table"
          style={{ width: tableWidth, minWidth: '100%' }}
        >
          <colgroup>
            {columnOrder.map((key) => (
              <col key={key} style={{ width: columnWidths[key] }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[#111111] shadow-[0_1px_0_#2b2b2b]">
            <tr className="text-left">
              {columnOrder.map(renderHeader)}
            </tr>
          </thead>
          <tbody>
            {response.items.map((item) => (
              <React.Fragment key={item.id}>
                <tr
                  data-disclosure-row={item.id}
                  onContextMenu={(event) => showContextMenu(event, item)}
                  className="border-b border-[#202020] bg-[#090909] hover:bg-[#111713]"
                  title="右クリックで企業リンク・PDF・要約・Discord通知メニューを表示"
                >
                  {columnOrder.map((columnKey) => renderCell(item, columnKey))}
                </tr>
                {expandedIds.has(item.id) && item.summaryText && (
                  <tr className="border-b border-violet-950 bg-[#0d0a13]">
                    <td colSpan={columnOrder.length} className="px-5 py-3">
                      <div className="mb-1 text-[9px] font-bold text-violet-300">
                        Gemini要約 {item.summaryModel ? `・${item.summaryModel}` : ''}
                      </div>
                      <div className="whitespace-pre-wrap text-[11px] leading-relaxed text-gray-200">{item.summaryText}</div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        <div className="space-y-2 p-2 md:hidden">
          {response.items.map((item) => (
            <article key={item.id} className="border border-[#282828] bg-[#0d0d0d] p-3">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  disabled={!item.pdfAvailable}
                  onChange={() => toggleSelected(item.id)}
                  className="mt-1 accent-emerald-500"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`border px-1.5 py-0.5 text-[9px] font-bold ${tagClassName(item.tag)}`}>{item.tag}</span>
                    <span className={`border px-1 text-[9px] font-black ${item.source === 'tdnet' || item.source === 'tdnet-scrape' ? 'border-blue-900 text-blue-300' : 'border-emerald-900 text-emerald-300'}`}>{item.source === 'tdnet' || item.source === 'tdnet-scrape' ? 'T' : 'E'}</span>
                    <span className="font-mono text-[9px] text-gray-500">{formatPublishedAt(item.publishedAt)}</span>
                  </div>
                  <div className="mt-1 text-xs font-black text-white">{item.companyName}</div>
                  <div className="font-mono text-[10px] text-cyan-300">{item.secCode || '—'}</div>
                  <div className="mt-2 text-[11px] leading-relaxed text-gray-200">{item.title}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                <button type="button" onClick={() => handleRowSummary(item)} disabled={!item.pdfAvailable || summaryIds.has(item.id)} className="flex h-7 items-center gap-1 border border-violet-900 px-2 text-violet-200 disabled:opacity-30">
                  <Bot className="h-3 w-3" />{item.summaryText ? '要約表示' : 'Gemini要約'}
                </button>
                {item.documentUrl && <a href={item.documentUrl} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1 border border-cyan-900 px-2 text-cyan-300"><ExternalLink className="h-3 w-3" />PDF</a>}
                {item.edinetDbCompanyUrl && <a href={item.edinetDbCompanyUrl} target="_blank" rel="noreferrer" className="flex h-7 items-center border border-emerald-900 px-2 text-emerald-300">EDINET DB</a>}
                {item.buffettCodeUrl && <a href={item.buffettCodeUrl} target="_blank" rel="noreferrer" className="flex h-7 items-center border border-amber-900 px-2 text-amber-300">バフェット・コード</a>}
              </div>
              {expandedIds.has(item.id) && item.summaryText && (
                <div className="mt-3 whitespace-pre-wrap border-t border-violet-950 pt-3 text-[11px] leading-relaxed text-gray-200">{item.summaryText}</div>
              )}
            </article>
          ))}
        </div>

        {!loading && response.items.length === 0 && (
          <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center">
            <FileText className="mb-3 h-10 w-10 text-gray-700" />
            <div className="text-sm font-bold text-gray-400">表示できる開示情報がありません</div>
            <div className="mt-1 max-w-lg text-[10px] leading-relaxed text-gray-600">
              APIキーが未設定の場合は設定後に同期してください。大企業フィルタを外すと全企業を表示できます。
            </div>
          </div>
        )}
        {loading && (
          <div className="flex h-full min-h-64 items-center justify-center gap-2 text-xs text-gray-500">
            <LoaderCircle className="h-5 w-5 animate-spin text-emerald-400" />企業開示DBを読み込み中
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          data-disclosure-context-menu="true"
          role="menu"
          aria-label={`${contextMenu.item.companyName}の操作`}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          className="fixed z-[120] w-56 border border-[#3a3a3a] bg-[#111111] p-1.5 text-[10px] shadow-2xl shadow-black/70"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button type="button" role="menuitem" disabled={!contextMenu.item.edinetDbCompanyUrl} onClick={() => { openExternal(contextMenu.item.edinetDbCompanyUrl); setContextMenu(null); }} className="flex h-8 w-full items-center gap-2 px-2 text-left text-emerald-300 hover:bg-[#202820] disabled:text-gray-700"><Building2 className="h-3.5 w-3.5" />EDINET DB</button>
          <button type="button" role="menuitem" disabled={!((contextMenu.item.source === 'tdnet' || contextMenu.item.source === 'tdnet-scrape') && contextMenu.item.documentUrl)} onClick={() => { openExternal(contextMenu.item.documentUrl); setContextMenu(null); }} className="flex h-8 w-full items-center gap-2 px-2 text-left text-blue-300 hover:bg-blue-950/40 disabled:text-gray-700"><ExternalLink className="h-3.5 w-3.5" />TDNET</button>
          <button type="button" role="menuitem" disabled={!contextMenu.item.buffettCodeUrl} onClick={() => { openExternal(contextMenu.item.buffettCodeUrl); setContextMenu(null); }} className="flex h-8 w-full items-center gap-2 px-2 text-left text-amber-300 hover:bg-[#2a2418] disabled:text-gray-700"><ExternalLink className="h-3.5 w-3.5" />バフェット・コード</button>
          <button type="button" role="menuitem" disabled={!contextMenu.item.documentUrl} onClick={() => { openExternal(contextMenu.item.documentUrl); setContextMenu(null); }} className="flex h-8 w-full items-center gap-2 px-2 text-left text-cyan-300 hover:bg-[#17262a] disabled:text-gray-700"><FileText className="h-3.5 w-3.5" />PDFを表示</button>
          <button type="button" role="menuitem" disabled={!contextMenu.item.downloadUrl} onClick={() => { const item = contextMenu.item; setContextMenu(null); void downloadItemsIndividually([item]); }} className="flex h-8 w-full items-center gap-2 px-2 text-left text-cyan-200 hover:bg-[#17262a] disabled:text-gray-700"><Download className="h-3.5 w-3.5" />PDFを個別ダウンロード</button>
          <button type="button" role="menuitem" disabled={!contextMenu.item.pdfAvailable || summaryIds.has(contextMenu.item.id)} onClick={() => { const item = contextMenu.item; setContextMenu(null); handleRowSummary(item); }} className="flex h-8 w-full items-center gap-2 px-2 text-left text-violet-300 hover:bg-[#251b30] disabled:text-gray-700"><Bot className="h-3.5 w-3.5" />Gemini要約</button>
          <div className="my-1 border-t border-[#2b2b2b]" />
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={contextMenu.item.source === 'tdnet' || contextMenu.item.source === 'tdnet-scrape' ? contextMenu.item.tdnetCompanyNotifyEnabled : contextMenu.item.edinetCompanyNotifyEnabled}
            disabled={!contextMenu.item.companyId || companyNotificationIds.has(contextMenu.item.companyId)}
            onClick={() => {
              const item = contextMenu.item;
              setContextMenu(null);
              void toggleCompanyNotification(item);
            }}
            className="flex h-8 w-full items-center gap-2 px-2 text-left text-gray-200 hover:bg-[#202020] disabled:text-gray-700"
          >
            {(contextMenu.item.source === 'tdnet' || contextMenu.item.source === 'tdnet-scrape' ? contextMenu.item.tdnetCompanyNotifyEnabled : contextMenu.item.edinetCompanyNotifyEnabled) ? <BellOff className="h-3.5 w-3.5 text-red-300" /> : <Bell className="h-3.5 w-3.5 text-emerald-300" />}
            {contextMenu.item.source === 'tdnet' || contextMenu.item.source === 'tdnet-scrape' ? 'TDNET' : 'EDINET'}通知対象を{(contextMenu.item.source === 'tdnet' || contextMenu.item.source === 'tdnet-scrape' ? contextMenu.item.tdnetCompanyNotifyEnabled : contextMenu.item.edinetCompanyNotifyEnabled) ? 'OFF' : 'ON'}
          </button>
        </div>
      )}

      {noiseEditorOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4" onMouseDown={() => setNoiseEditorOpen(false)}>
          <div className="w-full max-w-lg border border-[#3b3b3b] bg-[#101010] p-4 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <h2 className="text-sm font-black text-white">ノイズ除去キーワード</h2>
            <p className="mt-1 text-[10px] leading-relaxed text-gray-500">1行に1語を入力してください。保存時に既存のTDNET・EDINET情報も再分類します。</p>
            <textarea value={noiseKeywordsText} onChange={(event) => setNoiseKeywordsText(event.target.value)} rows={10} className="mt-3 w-full resize-y border border-[#333] bg-[#080808] p-2 font-mono text-[11px] leading-relaxed text-gray-200 outline-none focus:border-amber-700" />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setNoiseEditorOpen(false)} className="h-8 border border-[#343434] px-3 text-[10px] text-gray-400 hover:text-white">キャンセル</button>
              <button type="button" disabled={savingNoiseKeywords} onClick={() => void saveNoiseKeywords()} className="flex h-8 items-center gap-1.5 border border-amber-800 bg-amber-950/40 px-3 text-[10px] font-bold text-amber-200 disabled:opacity-50">
                {savingNoiseKeywords && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}保存
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-t border-[#242424] bg-[#0a0a0a] px-3 py-1 text-[10px]">
        <span className="text-gray-500">{response.total.toLocaleString('ja-JP')}件</span>
        <label className="ml-auto flex items-center gap-1.5 text-gray-500">
          1ページ
          <select
            value={String(pageSize)}
            onChange={(event) => {
              const value = event.target.value;
              setPageSize(value === 'all' ? 'all' : Number(value) as DisclosurePageSize);
              setPage(1);
            }}
            aria-label="1ページの表示件数"
            className="h-7 border border-[#303030] bg-[#101010] px-2 font-mono text-gray-200 outline-none focus:border-emerald-700"
          >
            <option value="50">50件</option>
            <option value="100">100件</option>
            <option value="200">200件</option>
            <option value="300">300件</option>
            <option value="all">全て</option>
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="flex h-7 w-7 items-center justify-center border border-[#303030] text-gray-300 disabled:opacity-25"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <span className="font-mono text-gray-400">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="flex h-7 w-7 items-center justify-center border border-[#303030] text-gray-300 disabled:opacity-25"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </section>
  );
}
