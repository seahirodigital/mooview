import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Bot,
  Check,
  CheckSquare,
  ChevronDown,
  Database,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Square,
  X,
} from 'lucide-react';

import {
  DEFAULT_DISCLOSURE_GEMINI_PROMPT,
  DEFAULT_TDNET_GEMINI_PROMPT,
  type DisclosureApiSettings,
  type DisclosureCompany,
  type DisclosureSettings,
  type DisclosureSourceGroup,
  type DisclosureSyncStatus,
} from '../../disclosureTypes';
import { GEMINI_CHART_MODELS, normalizeGeminiChartModelId } from '../../geminiModels';
import {
  announceDisclosureCompanyNotificationsChanged,
  createDisclosureCompany,
  DISCLOSURE_COMPANY_NOTIFICATIONS_CHANGED_EVENT,
  fetchDisclosureCompanies,
  fetchDisclosureSettings,
  fetchDisclosureStatus,
  saveDisclosureSettings,
  setAllDisclosureCompanyNotifications,
  synchronizeEdinetDisclosures,
  synchronizeTdnetScrapedDisclosures,
  synchronizeTdnetDisclosures,
  updateDisclosureCompany,
} from '../disclosureApi';

interface CompanyFormState {
  name: string;
  secCode: string;
  edinetCode: string;
  irUrl: string;
}

const EMPTY_FORM: CompanyFormState = { name: '', secCode: '', edinetCode: '', irUrl: '' };
type DisclosureSyncAction = DisclosureSourceGroup | 'tdnet-scrape';

function StatusBadge({ configured, label }: { configured: boolean; label: string }) {
  return (
    <span className={`border px-1.5 py-0.5 text-[9px] font-bold ${configured
      ? 'border-emerald-900 bg-emerald-950/60 text-emerald-300'
      : 'border-amber-900 bg-amber-950/50 text-amber-300'}`}>
      {label}: {configured ? '設定済' : '未設定'}
    </span>
  );
}

function SettingsSection({
  title,
  icon,
  children,
  tone = 'border-[#2b2b2b] bg-[#101010]',
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <details className={`group border ${tone}`}>
      <summary className="flex h-10 cursor-pointer list-none items-center gap-1.5 px-3 font-bold text-gray-100">
        {icon}{title}
        <ChevronDown className="ml-auto h-4 w-4 text-gray-500 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-[#292929] p-3">{children}</div>
    </details>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border border-[#292929] bg-[#0b0b0b] p-2.5">
      <div className="min-w-0">
        <div className="text-[11px] font-bold text-gray-200">{label}</div>
        <div className="mt-0.5 text-[9px] leading-relaxed text-gray-500">{description}</div>
      </div>
      <button type="button" aria-pressed={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${checked ? 'bg-emerald-500' : 'bg-gray-700'} disabled:opacity-40`}>
        <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

function NumericInput({
  label,
  value,
  minimum,
  maximum,
  onChange,
}: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [focused, value]);

  const commit = () => {
    const numeric = Number(draft);
    const next = Number.isFinite(numeric)
      ? Math.min(maximum, Math.max(minimum, Math.round(numeric)))
      : value;
    setDraft(String(next));
    onChange(next);
  };

  return (
    <label className="block text-[9px] text-gray-500">
      {label}
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        onFocus={(event) => { setFocused(true); event.currentTarget.select(); }}
        onChange={(event) => {
          const next = event.target.value.replace(/[^0-9]/g, '');
          setDraft(next);
          if (next !== '') onChange(Number(next));
        }}
        onBlur={() => { setFocused(false); commit(); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') { setDraft(String(value)); event.currentTarget.blur(); }
        }}
        aria-label={`${label}を数値入力`}
        title={`${minimum}～${maximum}の整数を入力`}
        className="mt-1 h-8 w-full border border-[#303030] bg-[#080808] px-2 font-mono text-gray-200 outline-none focus:border-emerald-700"
      />
    </label>
  );
}

export function DisclosureSettingsPanel() {
  const [settings, setSettings] = useState<DisclosureApiSettings | null>(null);
  const [status, setStatus] = useState<DisclosureSyncStatus | null>(null);
  const [companies, setCompanies] = useState<DisclosureCompany[]>([]);
  const [companyQuery, setCompanyQuery] = useState('');
  const [addForm, setAddForm] = useState<CompanyFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<CompanyFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingSource, setSyncingSource] = useState<DisclosureSyncAction | null>(null);
  const [bulkUpdatingSource, setBulkUpdatingSource] = useState<DisclosureSourceGroup | null>(null);
  const [promptSource, setPromptSource] = useState<DisclosureSourceGroup>('edinet');
  const [savedBackfillDays, setSavedBackfillDays] = useState(100);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCompanies = useCallback(async (query = companyQuery) => {
    setCompanies(await fetchDisclosureCompanies(query));
  }, [companyQuery]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSettings, nextStatus, nextCompanies] = await Promise.all([
        fetchDisclosureSettings(),
        fetchDisclosureStatus(),
        fetchDisclosureCompanies(companyQuery),
      ]);
      setSettings(nextSettings);
      setSavedBackfillDays(nextSettings.backfillDays);
      setStatus(nextStatus);
      setCompanies(nextCompanies);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '企業開示DB設定を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [companyQuery]);

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadCompanies().catch((loadError) => setError(loadError instanceof Error ? loadError.message : '大企業リストを検索できませんでした。'));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [companyQuery, loadCompanies]);

  useEffect(() => {
    const handleNotificationChange = () => { void loadCompanies().catch(() => undefined); };
    window.addEventListener(DISCLOSURE_COMPANY_NOTIFICATIONS_CHANGED_EVENT, handleNotificationChange);
    return () => window.removeEventListener(DISCLOSURE_COMPANY_NOTIFICATIONS_CHANGED_EVENT, handleNotificationChange);
  }, [loadCompanies]);

  const persistSettings = async (next: DisclosureSettings, successMessage: string) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveDisclosureSettings(next);
      setSettings((current) => current ? { ...current, ...saved } : null);
      setSavedBackfillDays(saved.backfillDays);
      setMessage(successMessage);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '企業開示DB設定を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <Key extends keyof DisclosureSettings>(key: Key, value: DisclosureSettings[Key]) => {
    setSettings((current) => current ? { ...current, [key]: value } : current);
  };

  const toggleNotification = (
    key: 'newDisclosureNotificationsEnabled' | 'tdnetDisclosureNotificationsEnabled' | 'summaryNotificationsEnabled',
    value: boolean,
  ) => {
    if (!settings) return;
    const next = { ...settings, [key]: value };
    setSettings(next);
    void persistSettings(next, value ? 'Discord通知をONにしました。' : 'Discord通知をOFFにしました。');
  };

  const toggleCompanyNotification = async (company: DisclosureCompany, source: DisclosureSourceGroup) => {
    setError(null);
    try {
      const saved = await updateDisclosureCompany(company.id, source === 'tdnet'
        ? { tdnetNotifyEnabled: !company.tdnetNotifyEnabled }
        : { notifyEnabled: !company.edinetNotifyEnabled });
      setCompanies((current) => current.map((candidate) => candidate.id === saved.id ? saved : candidate));
      announceDisclosureCompanyNotificationsChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '通知対象を更新できませんでした。');
    }
  };

  const setAllNotifications = async (source: DisclosureSourceGroup, enabled: boolean) => {
    setBulkUpdatingSource(source);
    setError(null);
    try {
      const result = await setAllDisclosureCompanyNotifications(source, enabled);
      await loadCompanies();
      announceDisclosureCompanyNotificationsChanged();
      setMessage(`${result.updated.toLocaleString('ja-JP')}社の${source === 'tdnet' ? 'TDNET' : 'EDINET'}通知チェックを${enabled ? 'ON' : 'OFF'}にしました。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '通知対象を一括更新できませんでした。');
    } finally {
      setBulkUpdatingSource(null);
    }
  };

  const runSync = async (source: DisclosureSyncAction) => {
    if (syncingSource) return;
    setSyncingSource(source);
    setError(null);
    const sourceLabel = source === 'tdnet-scrape'
      ? 'TDスクレイピング'
      : source === 'tdnet'
        ? 'TDNET API'
        : 'EDINET・EDINET DB';
    const isBackfill = status
      ? source === 'tdnet-scrape'
        ? !status.sources.tdnetScrape.baselineComplete
        : source === 'tdnet'
          ? !status.sources.tdnet.baselineComplete
          : !status.sources.edinet.baselineComplete || !status.sources.edinetDb.baselineComplete
      : false;
    setMessage(isBackfill
      ? `${sourceLabel}から過去${settings?.backfillDays ?? 100}日分の開示情報を取得しています…`
      : `${sourceLabel}の更新情報を取得しています…`);
    try {
      const result = source === 'tdnet-scrape'
        ? await synchronizeTdnetScrapedDisclosures()
        : source === 'tdnet'
          ? await synchronizeTdnetDisclosures()
          : await synchronizeEdinetDisclosures();
      setMessage(result.message);
      const failures = result.sources.filter((item) => item.status === 'failed');
      if (failures.length > 0) {
        setError(`${result.message}\n${failures.map((failed) => `${failed.source === 'tdnet-scrape' ? 'TDスクレイピング' : failed.source === 'tdnet' ? 'TDNET API' : failed.source === 'edinet' ? 'EDINET' : 'EDINET DB'}: ${failed.error}`).join('\n')}`);
      }
      setStatus(await fetchDisclosureStatus());
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : '同期に失敗しました。');
    } finally {
      setSyncingSource(null);
    }
  };

  const beginEdit = (company: DisclosureCompany) => {
    setEditingId(company.id);
    setEditForm({
      name: company.name,
      secCode: company.secCode || '',
      edinetCode: company.edinetCode || '',
      irUrl: company.irUrl || '',
    });
  };

  const saveCompanyEdit = async (company: DisclosureCompany) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await updateDisclosureCompany(company.id, editForm);
      setCompanies((current) => current.map((candidate) => candidate.id === saved.id ? saved : candidate));
      setEditingId(null);
      setMessage(`${saved.name}を更新しました。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '企業情報を更新できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  const addCompany = async () => {
    if (!addForm.name.trim()) {
      setError('追加する企業名を入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await createDisclosureCompany({
        ...addForm,
        notifyEnabled: true,
        tdnetNotifyEnabled: true,
      });
      setAddForm(EMPTY_FORM);
      await loadCompanies();
      setMessage(`${saved.name}を大企業通知リストへ追加しました。`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '企業を追加できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !settings) {
    return <div className="flex flex-1 items-center justify-center gap-2 text-xs text-gray-500"><LoaderCircle className="h-4 w-4 animate-spin text-emerald-400" />企業開示DB設定を読み込み中</div>;
  }

  const promptKey = promptSource === 'tdnet' ? 'tdnetGeminiPrompt' : 'geminiPrompt';
  const promptText = settings?.[promptKey] || '';

  return (
    <div data-disclosure-settings="true" className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2 text-xs">
      <SettingsSection title="企業開示DB" icon={<Database className="h-4 w-4 text-emerald-300" />}>
        <div className="flex justify-end"><button type="button" onClick={() => void load()} className="flex h-7 w-7 items-center justify-center border border-[#303030] text-gray-400 hover:text-white" aria-label="企業開示DB設定を再読込"><RefreshCw className="h-3.5 w-3.5" /></button></div>
        <div className="mt-2 flex flex-wrap gap-1">
          <StatusBadge configured={settings?.apiConfigured.tdnet === true} label="TDNET" />
          <StatusBadge configured={settings?.apiConfigured.edinet === true} label="EDINET" />
          <StatusBadge configured={settings?.apiConfigured.edinetDb === true} label="EDINET DB" />
          <StatusBadge configured={settings?.apiConfigured.gemini === true} label="Gemini" />
          <StatusBadge configured={settings?.apiConfigured.discord === true} label="Discord" />
        </div>
        {status && <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-[9px] text-gray-500"><span>開示 {status.disclosureCount.toLocaleString('ja-JP')}件</span><span>大企業 {status.largeCapCount.toLocaleString('ja-JP')}社</span></div>}
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => void runSync('edinet')} disabled={syncingSource !== null} className="flex h-8 items-center justify-center gap-1 border border-emerald-900 bg-emerald-950/35 text-[10px] font-bold text-emerald-200 disabled:opacity-45">{syncingSource === 'edinet' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{syncingSource === 'edinet' ? '取得中…' : 'EDINET同期'}</button>
          <button type="button" onClick={() => void runSync('tdnet-scrape')} disabled={syncingSource !== null} className="flex h-8 items-center justify-center gap-1 border border-cyan-900 bg-cyan-950/35 text-[10px] font-bold text-cyan-200 disabled:opacity-45">{syncingSource === 'tdnet-scrape' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{syncingSource === 'tdnet-scrape' ? '取得中…' : 'TDスクレイピング'}</button>
          <button type="button" onClick={() => void runSync('tdnet')} disabled={syncingSource !== null} className="flex h-8 items-center justify-center gap-1 border border-blue-900 bg-blue-950/35 text-[10px] font-bold text-blue-200 disabled:opacity-45">{syncingSource === 'tdnet' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{syncingSource === 'tdnet' ? '取得中…' : 'TDNET API'}</button>
        </div>
      </SettingsSection>

      {settings && (
        <>
          <SettingsSection title="同期間隔">
            <div className="grid grid-cols-2 gap-2">
              <NumericInput label="TDスクレイピング（分）" value={settings.tdnetScrapePollMinutes} minimum={1} maximum={60} onChange={(value) => updateSetting('tdnetScrapePollMinutes', value)} />
              <NumericInput label="TDNET API（分）" value={settings.tdnetPollMinutes} minimum={1} maximum={180} onChange={(value) => updateSetting('tdnetPollMinutes', value)} />
              <NumericInput label="EDINET（分）" value={settings.edinetPollMinutes} minimum={1} maximum={180} onChange={(value) => updateSetting('edinetPollMinutes', value)} />
              <NumericInput label="EDINET DB（分）" value={settings.edinetDbPollMinutes} minimum={5} maximum={720} onChange={(value) => updateSetting('edinetDbPollMinutes', value)} />
            </div>
            <div className="mt-2"><NumericInput label="初回取得日数" value={settings.backfillDays} minimum={1} maximum={365} onChange={(value) => updateSetting('backfillDays', value)} /></div>
            <div className="mt-2 text-[9px] leading-relaxed text-gray-500">取得日数を変更して保存すると、次回同期で指定日数分を重複排除しながら再取得します。</div>
            <button type="button" onClick={() => void persistSettings(settings, settings.backfillDays !== savedBackfillDays ? `同期設定を保存しました。次回同期で過去${settings.backfillDays}日分を再取得します。` : '同期設定を保存しました。')} disabled={saving} className="mt-2 flex h-8 w-full items-center justify-center gap-1 border border-[#3a3a3a] bg-[#171717] text-[10px] font-bold text-gray-200 disabled:opacity-40"><Save className="h-3 w-3" />同期設定を保存</button>
          </SettingsSection>

          <SettingsSection title="Discord通知" icon={<Bell className="h-4 w-4 text-violet-300" />}>
            <div className="space-y-2">
              <Toggle checked={settings.newDisclosureNotificationsEnabled} onChange={(value) => toggleNotification('newDisclosureNotificationsEnabled', value)} label="EDINET新着通知" description="EDINET列にチェックした大企業の新着開示を通知します。" disabled={saving} />
              <Toggle checked={settings.tdnetDisclosureNotificationsEnabled} onChange={(value) => toggleNotification('tdnetDisclosureNotificationsEnabled', value)} label="TDNET新着通知" description="TDNET列にチェックした大企業の新着開示を通知します。" disabled={saving} />
              <Toggle checked={settings.summaryNotificationsEnabled} onChange={(value) => toggleNotification('summaryNotificationsEnabled', value)} label="Gemini要約通知" description="手動要約が完了したとき、要約結果をDiscordへ通知します。" disabled={saving} />
            </div>
          </SettingsSection>

          <SettingsSection title="Gemini要約設定" icon={<Bot className="h-4 w-4 text-violet-300" />} tone="border-[#332943] bg-[#100d15]">
            <label className="block"><span className="mb-1 block text-[10px] font-bold text-gray-400">使用モデル</span><select value={settings.geminiModel} onChange={(event) => updateSetting('geminiModel', normalizeGeminiChartModelId(event.target.value))} className="h-8 w-full border border-[#493b66] bg-[#0a0a0a] px-2 text-[10px] text-violet-100 outline-none">{GEMINI_CHART_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select></label>
            <label className="mt-2 block"><span className="mb-1 block text-[10px] font-bold text-gray-400">プロンプト種別</span><select value={promptSource} onChange={(event) => setPromptSource(event.target.value as DisclosureSourceGroup)} className="h-8 w-full border border-[#493b66] bg-[#0a0a0a] px-2 text-[10px] text-violet-100 outline-none"><option value="edinet">EDINET用プロンプト</option><option value="tdnet">TDNET用プロンプト</option></select></label>
            <label className="mt-2 block"><span className="mb-1 block text-[10px] font-bold text-gray-400">要約プロンプト</span><textarea value={promptText} onChange={(event) => updateSetting(promptKey, event.target.value)} maxLength={30_000} spellCheck={false} className="h-60 w-full resize-y border border-[#493b66] bg-[#080808] p-2 font-mono text-[10px] leading-relaxed text-gray-200 outline-none focus:border-violet-500" /><span className="mt-1 block text-right font-mono text-[9px] text-gray-600">{promptText.length.toLocaleString('ja-JP')} / 30,000</span></label>
            <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => updateSetting(promptKey, promptSource === 'tdnet' ? DEFAULT_TDNET_GEMINI_PROMPT : DEFAULT_DISCLOSURE_GEMINI_PROMPT)} className="flex h-8 items-center justify-center gap-1 border border-[#343434] text-[10px] text-gray-300"><RotateCcw className="h-3 w-3" />初期値</button><button type="button" onClick={() => void persistSettings(settings, 'Gemini要約設定を保存しました。')} disabled={saving} className="flex h-8 items-center justify-center gap-1 border border-violet-800 bg-violet-950/45 text-[10px] font-bold text-violet-200 disabled:opacity-40"><Save className="h-3 w-3" />保存</button></div>
          </SettingsSection>
        </>
      )}

      <SettingsSection title="Discord通知用大企業リスト">
        <input value={companyQuery} onChange={(event) => setCompanyQuery(event.target.value)} placeholder="企業名・証券コードで検索" className="h-8 w-full border border-[#303030] bg-[#080808] px-2 text-[10px] text-gray-200 outline-none focus:border-emerald-700" />
        <details className="mt-2 border border-[#2a2a2a] bg-[#0a0a0a] p-2">
          <summary className="cursor-pointer text-[10px] font-bold text-emerald-300">企業を追加</summary>
          <div className="mt-2 grid gap-1.5">
            <input value={addForm.name} onChange={(event) => setAddForm((current) => ({ ...current, name: event.target.value }))} placeholder="企業名（必須）" className="h-8 border border-[#303030] bg-[#080808] px-2 text-[10px]" />
            <div className="grid grid-cols-2 gap-1.5"><input value={addForm.secCode} onChange={(event) => setAddForm((current) => ({ ...current, secCode: event.target.value }))} placeholder="証券コード" className="h-8 border border-[#303030] bg-[#080808] px-2 text-[10px]" /><input value={addForm.edinetCode} onChange={(event) => setAddForm((current) => ({ ...current, edinetCode: event.target.value }))} placeholder="EDINETコード" className="h-8 border border-[#303030] bg-[#080808] px-2 text-[10px]" /></div>
            <input value={addForm.irUrl} onChange={(event) => setAddForm((current) => ({ ...current, irUrl: event.target.value }))} placeholder="IRサイトURL（任意）" className="h-8 border border-[#303030] bg-[#080808] px-2 text-[10px]" />
            <button type="button" onClick={() => void addCompany()} disabled={saving} className="flex h-8 items-center justify-center gap-1 bg-emerald-700 text-[10px] font-bold text-white disabled:opacity-40"><Plus className="h-3 w-3" />通知対象として追加</button>
          </div>
        </details>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_72px_72px_28px] items-center border border-[#242424] bg-[#080808] px-1 text-[9px] text-gray-500">
          <div className="px-1">企業名・証券コード</div>
          <div className="flex items-center justify-center gap-0.5"><span>ED</span><button type="button" onClick={() => void setAllNotifications('edinet', false)} disabled={bulkUpdatingSource !== null} title="EDINETを全て外す" aria-label="EDINET通知を全て外す" className="flex h-6 w-6 items-center justify-center"><Square className="h-3 w-3" /></button><button type="button" onClick={() => void setAllNotifications('edinet', true)} disabled={bulkUpdatingSource !== null} title="EDINETを全てチェック" aria-label="EDINET通知を全てチェック" className="flex h-6 w-6 items-center justify-center text-emerald-300"><CheckSquare className="h-3 w-3" /></button></div>
          <div className="flex items-center justify-center gap-0.5"><span>TD</span><button type="button" onClick={() => void setAllNotifications('tdnet', false)} disabled={bulkUpdatingSource !== null} title="TDNETを全て外す" aria-label="TDNET通知を全て外す" className="flex h-6 w-6 items-center justify-center"><Square className="h-3 w-3" /></button><button type="button" onClick={() => void setAllNotifications('tdnet', true)} disabled={bulkUpdatingSource !== null} title="TDNETを全てチェック" aria-label="TDNET通知を全てチェック" className="flex h-6 w-6 items-center justify-center text-blue-300"><CheckSquare className="h-3 w-3" /></button></div>
          <span />
        </div>
        <div className="h-80 min-h-32 max-h-[70vh] resize-y overflow-auto border border-[#242424]" title="下端をドラッグして一覧の高さを変更できます">
          {companies.map((company) => (
            <div key={company.id} className="border-b border-[#222] bg-[#0b0b0b] px-1 py-0.5 last:border-b-0">
              {editingId === company.id ? (
                <div className="grid gap-1.5 p-1">
                  <input value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} className="h-7 border border-[#303030] bg-[#080808] px-2 text-[10px]" />
                  <div className="grid grid-cols-2 gap-1.5"><input value={editForm.secCode} onChange={(event) => setEditForm((current) => ({ ...current, secCode: event.target.value }))} className="h-7 border border-[#303030] bg-[#080808] px-2 font-mono text-[10px]" /><input value={editForm.edinetCode} onChange={(event) => setEditForm((current) => ({ ...current, edinetCode: event.target.value }))} className="h-7 border border-[#303030] bg-[#080808] px-2 font-mono text-[10px]" /></div>
                  <input value={editForm.irUrl} onChange={(event) => setEditForm((current) => ({ ...current, irUrl: event.target.value }))} placeholder="IRサイトURL" className="h-7 border border-[#303030] bg-[#080808] px-2 text-[10px]" />
                  <div className="grid grid-cols-2 gap-1.5"><button type="button" onClick={() => setEditingId(null)} className="flex h-7 items-center justify-center gap-1 border border-[#333] text-[10px] text-gray-400"><X className="h-3 w-3" />取消</button><button type="button" onClick={() => void saveCompanyEdit(company)} className="flex h-7 items-center justify-center gap-1 border border-emerald-800 text-[10px] text-emerald-300"><Check className="h-3 w-3" />保存</button></div>
                </div>
              ) : (
                <div className="grid h-7 grid-cols-[minmax(0,1fr)_72px_72px_28px] items-center">
                  <div className="truncate px-1 text-[10px] font-bold text-gray-200" title={`${company.name} ${company.secCode || ''}`}>{company.name} <span className="font-mono font-normal text-gray-500">{company.secCode || '—'}</span></div>
                  <div className="flex justify-center"><input type="checkbox" checked={company.edinetNotifyEnabled} onChange={() => void toggleCompanyNotification(company, 'edinet')} className="accent-emerald-500" aria-label={`${company.name}のEDINET通知を切り替える`} /></div>
                  <div className="flex justify-center"><input type="checkbox" checked={company.tdnetNotifyEnabled} onChange={() => void toggleCompanyNotification(company, 'tdnet')} className="accent-blue-500" aria-label={`${company.name}のTDNET通知を切り替える`} /></div>
                  <button type="button" onClick={() => beginEdit(company)} className="flex h-6 w-6 items-center justify-center text-gray-500 hover:text-white" aria-label={`${company.name}を編集`}><Pencil className="h-3 w-3" /></button>
                </div>
              )}
            </div>
          ))}
          {companies.length === 0 && <div className="p-4 text-center text-[10px] text-gray-600">該当企業がありません</div>}
        </div>
      </SettingsSection>

      {(message || error) && <div className={`sticky bottom-0 whitespace-pre-wrap border p-2 text-[10px] ${error ? 'border-red-900 bg-red-950 text-red-200' : 'border-emerald-900 bg-emerald-950 text-emerald-200'}`}>{error || message}</div>}
    </div>
  );
}
