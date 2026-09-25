import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Sheet, Upload, Download, Check, X, RefreshCw, AlertCircle } from 'lucide-react';
import { formatDataForGoogleSheets } from '../../services/googleSheets';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  oauthAccessToken?: string | null;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  oauthAccessToken,
}) => {
  const {
    sheetsConfig,
    updateSheetsConfig,
    refreshCloudData,
    cloudSyncStatus,
    assets,
    dividendStocks,
    expenses,
    simulationConfig,
    theme,
  } = useApp();

  const [inputUrl, setInputUrl] = useState(sheetsConfig.spreadsheetId);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState(false);

  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const extractId = (urlOrId: string) => {
    const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : urlOrId.trim();
  };

  const handleSaveId = () => {
    const id = extractId(inputUrl);
    updateSheetsConfig({ spreadsheetId: id });
    setStatusMsg({ text: `スプレッドシートID (${id}) を設定しました。`, type: 'info' });
  };

  const handleRefreshCloud = async () => {
    setIsSyncing(true);
    setStatusMsg({ text: 'クラウド元帳を確認中...', type: 'info' });
    const res = await refreshCloudData();
    setIsSyncing(false);
    if (res.success) {
      setStatusMsg({ text: 'クラウド元帳の最新状態を反映しました。', type: 'success' });
    } else {
      setStatusMsg({ text: res.message, type: 'error' });
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className={`rounded-3xl p-6 sm:p-7 w-full max-w-lg shadow-2xl space-y-5 transition-colors ${
        isDark ? 'bg-[#1d1d1f] text-[#f5f5f7]' : 'bg-white text-[#1d1d1f]'
      }`}>
        <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Sheet className="w-5 h-5 text-emerald-500" />
            <h3 className="text-base font-semibold">Google スプレッドシート双方向連携</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-[#1d1d1f] dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {statusMsg && (
          <div className={`p-3 rounded-2xl text-xs flex items-center gap-2 ${
            statusMsg.type === 'success'
              ? 'bg-[#34c759]/15 text-[#34c759]'
              : statusMsg.type === 'error'
              ? 'bg-[#ff3b30]/15 text-[#ff3b30]'
              : 'bg-[#0071e3]/15 text-[#0071e3]'
          }`}>
            {statusMsg.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <Check className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Setup spreadsheet URL/ID */}
        <div className="p-4 rounded-2xl bg-[#f5f5f7] dark:bg-white/5 space-y-2">
          <label className="text-xs font-semibold block">連携スプレッドシートURLまたはID</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="https://docs.google.com/spreadsheets/d/xxx/edit..."
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className="flex-1 p-2 text-xs rounded-xl border bg-transparent font-mono"
            />
            <button
              onClick={handleSaveId}
              className="px-4 py-2 bg-[#1d1d1f] dark:bg-white text-white dark:text-black rounded-full text-xs font-medium shrink-0"
            >
              設定保存
            </button>
          </div>
          <span className="text-[11px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50 block">
            このスプレッドシートが唯一の元帳です。Web・スマホ・シートの編集は自動で同じ状態へ反映されます。
          </span>
        </div>

        {/* Sync Controls */}
        <div className="grid grid-cols-1 gap-3">
          <button
            disabled={isSyncing}
            onClick={handleRefreshCloud}
            className="p-3.5 rounded-2xl bg-[#0071e3] hover:bg-[#0077ed] text-white flex flex-col items-center justify-center gap-1.5 transition-colors shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="text-xs font-medium">クラウド元帳を再確認</span>
            <span className="text-[10px] opacity-80">通常は自動同期です</span>
          </button>
        </div>

        {/* Quick TSV Copy */}
        <div className="pt-2 border-t border-black/5 dark:border-white/10 flex items-center justify-between">
          <div className="text-[11px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60">
            {cloudSyncStatus === 'synced' ? 'クラウド接続中' : cloudSyncStatus === 'connecting' ? 'クラウド確認中' : 'オフライン表示中'}
            {sheetsConfig.lastSyncedAt ? ` ・ 最終同期: ${sheetsConfig.lastSyncedAt}` : ''}
          </div>
          <button
            onClick={handleCopyClipboardForSheets}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-black/5 dark:bg-white/10 hover:bg-black/10 transition-colors"
          >
            {copiedFormat ? <Check className="w-3.5 h-3.5 text-[#34c759]" /> : <RefreshCw className="w-3.5 h-3.5 text-[#0071e3]" />}
            <span>{copiedFormat ? 'コピー完了！' : '全データをクリップボード貼付用コピー'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
