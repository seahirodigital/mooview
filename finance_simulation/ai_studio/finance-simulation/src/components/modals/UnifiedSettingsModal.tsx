import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Settings,
  Moon,
  Sun,
  Sheet,
  Database,
  Upload,
  Download,
  Link,
  RotateCcw,
  Check,
  AlertTriangle,
  X,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { formatDataForGoogleSheets } from '../../services/googleSheets';

interface UnifiedSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  oauthAccessToken?: string | null;
  initialTab?: 'appearance' | 'sheets' | 'backup';
}

export const UnifiedSettingsModal: React.FC<UnifiedSettingsModalProps> = ({
  isOpen,
  onClose,
  oauthAccessToken,
  initialTab = 'appearance',
}) => {
  const {
    theme,
    toggleTheme,
    sheetsConfig,
    updateSheetsConfig,
    refreshCloudData,
    cloudSyncStatus,
    assets,
    dividendStocks,
    expenses,
    simulationConfig,
    exportJSON,
    importJSON,
    resetToDefaults,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'appearance' | 'sheets' | 'backup'>(initialTab);
  const isDark = theme === 'dark';

  // Google Sheets state
  const [inputUrl, setInputUrl] = useState(sheetsConfig.spreadsheetId);
  const [sheetsStatus, setSheetsStatus] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState(false);

  // Backup & Import state
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  if (!isOpen) return null;

  const extractId = (urlOrId: string) => {
    const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : urlOrId.trim();
  };

  const handleSaveId = () => {
    const id = extractId(inputUrl);
    updateSheetsConfig({ spreadsheetId: id });
    setSheetsStatus({ text: `スプレッドシートID (${id}) を設定しました。`, type: 'info' });
  };

  const handleRefreshCloud = async () => {
    setIsSyncing(true);
    setSheetsStatus({ text: 'クラウド元帳を確認中...', type: 'info' });
    const res = await refreshCloudData();
    setIsSyncing(false);
    if (res.success) {
      setSheetsStatus({ text: 'クラウド元帳の最新状態を反映しました。', type: 'success' });
    } else {
      setSheetsStatus({ text: res.message, type: 'error' });
    }
  };

  const handleCopyClipboardForSheets = () => {
    const { assetsRows, dividendRows, expensesRows } = formatDataForGoogleSheets({
      assets,
      dividendStocks,
      expenses,
      simulationConfig,
    });

    const formatTsv = (rows: any[][]) => rows.map(r => r.join('\t')).join('\n');
    const fullText = `=== 資産一覧 ===\n${formatTsv(assetsRows)}\n\n=== 配当一覧 ===\n${formatTsv(dividendRows)}\n\n=== 生活費一覧 ===\n${formatTsv(expensesRows)}`;

    navigator.clipboard.writeText(fullText);
    setCopiedFormat(true);
    setTimeout(() => setCopiedFormat(false), 3000);
  };

  const handleImportSubmit = () => {
    if (!importText.trim()) return;
    const success = importJSON(importText);
    if (success) {
      setSuccessMessage('データを正常に復元しました！');
      setImportText('');
      setImportError(null);
      setTimeout(() => setSuccessMessage(null), 3000);
    } else {
      setImportError('JSON形式が正しくありません。ファイルの内容をご確認ください。');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setImportText(text);
      };
      reader.readAsText(file);
    }
  };

  const handleCreateShareUrl = async () => {
    const url = `${window.location.origin}/share/finance-simulation.json`;
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 3000);
    } catch {
      setShareCopied(false);
    }
  };

  const handleResetExecute = () => {
    resetToDefaults();
    setConfirmReset(false);
    setSuccessMessage('初期データにリセットしました。');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className={`p-6 sm:p-7 w-full max-w-lg border border-black/10 dark:border-white/10 shadow-2xl space-y-5 transition-colors ${
        isDark ? 'bg-[#1d1d1f] text-[#f5f5f7]' : 'bg-white text-[#1d1d1f]'
      }`}>
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#0071e3]" />
            <h3 className="text-base font-semibold">アプリ設定</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-[#1d1d1f] dark:hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className={`grid grid-cols-3 border text-xs font-medium ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-[#f5f5f7] border-black/10'
        }`}>
          <button
            onClick={() => setActiveTab('appearance')}
            className={`py-2 flex items-center justify-center gap-1.5 transition-all border-b-2 ${
              activeTab === 'appearance'
                ? isDark ? 'bg-white/10 text-white font-bold border-[#2997ff]' : 'bg-white text-[#1d1d1f] font-bold border-[#0071e3]'
                : 'border-transparent opacity-70 hover:opacity-100'
            }`}
          >
            {isDark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
            <span>外観・表示</span>
          </button>

          <button
            onClick={() => setActiveTab('sheets')}
            className={`py-2 flex items-center justify-center gap-1.5 transition-all border-b-2 ${
              activeTab === 'sheets'
                ? isDark ? 'bg-white/10 text-white font-bold border-[#2997ff]' : 'bg-white text-[#1d1d1f] font-bold border-[#0071e3]'
                : 'border-transparent opacity-70 hover:opacity-100'
            }`}
          >
            <Sheet className="w-3.5 h-3.5 text-emerald-500" />
            <span>スプシ同期</span>
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`py-2 flex items-center justify-center gap-1.5 transition-all border-b-2 ${
              activeTab === 'backup'
                ? isDark ? 'bg-white/10 text-white font-bold border-[#2997ff]' : 'bg-white text-[#1d1d1f] font-bold border-[#0071e3]'
                : 'border-transparent opacity-70 hover:opacity-100'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-[#0071e3]" />
            <span>データ管理</span>
          </button>
        </div>

        {/* Status Alerts */}
        {sheetsStatus && activeTab === 'sheets' && (
          <div className={`p-3 border text-xs flex items-center gap-2 ${
            sheetsStatus.type === 'success'
              ? 'bg-[#34c759]/15 border-[#34c759]/30 text-[#34c759]'
              : sheetsStatus.type === 'error'
              ? 'bg-[#ff3b30]/15 border-[#ff3b30]/30 text-[#ff3b30]'
              : 'bg-[#0071e3]/15 border-[#0071e3]/30 text-[#0071e3]'
          }`}>
            {sheetsStatus.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <Check className="w-4 h-4 shrink-0" />
            )}
            <span>{sheetsStatus.text}</span>
          </div>
        )}

        {successMessage && activeTab === 'backup' && (
          <div className="p-3 border border-[#34c759]/30 bg-[#34c759]/15 text-[#34c759] text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Tab 1: Appearance / Theme */}
        {activeTab === 'appearance' && (
          <div className="space-y-4 py-2">
            <div className="p-4 border border-black/10 dark:border-white/10 bg-[#f5f5f7] dark:bg-white/5 space-y-3">
              <label className="text-xs font-semibold block text-[#1d1d1f] dark:text-[#f5f5f7]">
                カラーテーマ設定
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => theme !== 'light' && toggleTheme()}
                  className={`p-3 border text-xs flex flex-col items-center gap-2 transition-all ${
                    !isDark
                      ? 'border-[#0071e3] bg-white text-[#1d1d1f] font-semibold ring-1 ring-[#0071e3]'
                      : 'border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 opacity-70 hover:opacity-100'
                  }`}
                >
                  <Sun className="w-5 h-5 text-amber-500" />
                  <span>ライトモード (白背景)</span>
                  <span className="text-[10px] opacity-60">高コントラスト黒文字</span>
                </button>

                <button
                  onClick={() => theme !== 'dark' && toggleTheme()}
                  className={`p-3 border text-xs flex flex-col items-center gap-2 transition-all ${
                    isDark
                      ? 'border-[#0071e3] bg-[#2c2c2e] text-[#f5f5f7] font-semibold ring-1 ring-[#0071e3]'
                      : 'border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 opacity-70 hover:opacity-100'
                  }`}
                >
                  <Moon className="w-5 h-5 text-slate-300" />
                  <span>ダークモード (黒背景)</span>
                  <span className="text-[10px] opacity-60">有機ELピュアブラック</span>
                </button>
              </div>
            </div>

            <div className="p-4 border border-black/10 dark:border-white/10 bg-[#f5f5f7] dark:bg-white/5 text-xs text-[#1d1d1f]/70 dark:text-[#f5f5f7]/70 space-y-1">
              <div className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Apple Japan デザイン原則</div>
              <p className="text-[11px] leading-relaxed">
                SF Pro JPフォントスタック、負のトラッキング、純黒（#000）とオフホワイト（#f5f5f7）のクリーンな余白を採用しています。
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: Google Sheets Sync */}
        {activeTab === 'sheets' && (
          <div className="space-y-4 py-2">
            <div className="p-4 border border-black/10 dark:border-white/10 bg-[#f5f5f7] dark:bg-white/5 space-y-2">
              <label className="text-xs font-semibold block text-[#1d1d1f] dark:text-[#f5f5f7]">
                連携スプレッドシートURLまたはID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://docs.google.com/spreadsheets/d/xxx/edit..."
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  className="flex-1 p-2 text-xs border border-black/10 dark:border-white/10 bg-transparent font-mono text-[#1d1d1f] dark:text-white"
                />
                <button
                  onClick={handleSaveId}
                  className="px-4 py-2 bg-[#1d1d1f] dark:bg-white text-white dark:text-black text-xs font-medium shrink-0 shadow-xs"
                >
                  設定保存
                </button>
              </div>
              <span className="text-[11px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 block">
                このスプレッドシートが唯一の元帳です。Web・スマホ・シートの編集は自動で同じ状態へ反映されます。
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button
                disabled={isSyncing}
                onClick={handleRefreshCloud}
                className="p-3 border border-[#0071e3] bg-[#0071e3] hover:bg-[#0077ed] text-white flex flex-col items-center justify-center gap-1 transition-colors shadow-xs"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="text-xs font-medium">クラウド元帳を再確認</span>
                <span className="text-[10px] opacity-80">通常は自動同期です</span>
              </button>
            </div>

            <div className="pt-2 border-t border-black/5 dark:border-white/10 flex items-center justify-between">
              <div className="text-[11px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60">
                {cloudSyncStatus === 'synced' ? 'クラウド接続中' : cloudSyncStatus === 'connecting' ? 'クラウド確認中' : 'オフライン表示中'}
                {sheetsConfig.lastSyncedAt ? ` ・ 最終同期: ${sheetsConfig.lastSyncedAt}` : ''}
              </div>
              <button
                onClick={handleCopyClipboardForSheets}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-black/10 dark:border-white/10 text-xs bg-black/5 dark:bg-white/10 hover:bg-black/10 transition-colors"
              >
                {copiedFormat ? <Check className="w-3.5 h-3.5 text-[#34c759]" /> : <RefreshCw className="w-3.5 h-3.5 text-[#0071e3]" />}
                <span>{copiedFormat ? 'コピー完了！' : '全データをTSV形式コピー'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Data Management & Backup */}
        {activeTab === 'backup' && (
          <div className="space-y-4 py-2">
            {/* Export JSON */}
            <div className="p-4 border border-black/10 dark:border-white/10 bg-[#f5f5f7] dark:bg-white/5 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">JSONバックアップ保存</h4>
                <p className="text-[11px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60">
                  資産・生活費・配当・試算設定をファイル保存
                </p>
              </div>
              <button
                onClick={exportJSON}
                className="px-4 py-2 bg-[#0071e3] hover:bg-[#0077ed] text-white text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0 shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ダウンロード</span>
              </button>
            </div>

            {/* Dynamic share URL */}
            <div className="p-4 border border-black/10 dark:border-white/10 bg-[#f5f5f7] dark:bg-white/5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">全データ共有URL</h4>
                  <p className="text-[11px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60">
                    資産・配当・収支・未来の月次値・並び順を最新状態でJSON公開
                  </p>
                </div>
                <button
                  onClick={handleCreateShareUrl}
                  className="px-4 py-2 bg-[#0071e3] hover:bg-[#0077ed] text-white text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0 shadow-xs"
                >
                  {shareCopied ? <Check className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
                  <span>{shareCopied ? 'URLをコピーしました' : '共有URLを発行'}</span>
                </button>
              </div>
              {shareUrl && (
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className="w-full border border-black/10 dark:border-white/10 bg-transparent px-2 py-1.5 text-[10px] font-mono text-[#1d1d1f] dark:text-[#f5f5f7]"
                  aria-label="全データ共有URL"
                />
              )}
            </div>

            {/* Import JSON */}
            <div className="p-4 border border-black/10 dark:border-white/10 bg-[#f5f5f7] dark:bg-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">バックアップ復元 (インポート)</h4>
                  <p className="text-[11px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60">
                    JSONファイルを読み込んでデータを復元
                  </p>
                </div>
                <label className="px-3.5 py-1.5 border border-black/10 dark:border-white/10 text-xs font-medium bg-black/5 dark:bg-white/10 hover:bg-black/10 cursor-pointer flex items-center gap-1.5 transition-colors shrink-0">
                  <Upload className="w-3.5 h-3.5 text-[#0071e3]" />
                  <span>ファイル選択</span>
                  <input type="file" accept=".json" onChange={handleFileChange} className="hidden" />
                </label>
              </div>

              {importText && (
                <div className="space-y-2 pt-1">
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder="JSON文字列..."
                    rows={2}
                    className="w-full p-2 text-[10px] font-mono border border-black/10 dark:border-white/10 bg-transparent"
                  />
                  {importError && (
                    <p className="text-[11px] text-[#ff3b30] flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {importError}
                    </p>
                  )}
                  <button
                    onClick={handleImportSubmit}
                    className="px-4 py-1.5 bg-[#34c759] hover:opacity-90 text-white text-xs font-medium shadow-xs"
                  >
                    復元を実行する
                  </button>
                </div>
              )}
            </div>

            {/* Reset Defaults */}
            <div className="p-4 border border-[#ff3b30]/20 bg-[#ff3b30]/5 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-[#ff3b30]">初期データリセット</h4>
                <p className="text-[11px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60">
                  S&P500コア・高配当・生活費を標準値に戻す
                </p>
              </div>
              {!confirmReset ? (
                <button
                  onClick={() => setConfirmReset(true)}
                  className="px-3.5 py-1.5 border border-[#ff3b30]/30 text-xs font-medium text-[#ff3b30] bg-[#ff3b30]/10 hover:bg-[#ff3b30]/20 transition-colors shrink-0"
                >
                  リセット
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfirmReset(false)}
                    className="px-3 py-1.5 border border-black/10 dark:border-white/10 text-xs hover:bg-black/5"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleResetExecute}
                    className="px-3.5 py-1.5 bg-[#ff3b30] text-white text-xs font-medium shadow-xs"
                  >
                    初期化確定
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
