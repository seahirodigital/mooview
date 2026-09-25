import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Download, Upload, RotateCcw, X, Check, AlertTriangle, FileText } from 'lucide-react';

interface DataManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DataManagementModal: React.FC<DataManagementModalProps> = ({ isOpen, onClose }) => {
  const { resetToDefaults, exportJSON, importJSON, theme } = useApp();
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const isDark = theme === 'dark';

  if (!isOpen) return null;

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

  const handleResetExecute = () => {
    resetToDefaults();
    setConfirmReset(false);
    setSuccessMessage('初期データにリセットしました。');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className={`rounded-3xl p-6 sm:p-7 w-full max-w-lg shadow-2xl space-y-5 transition-colors ${
        isDark ? 'bg-[#1d1d1f] text-[#f5f5f7]' : 'bg-white text-[#1d1d1f]'
      }`}>
        <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/10">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#0071e3]" />
            <h3 className="text-base font-semibold">データ管理・バックアップ & リセット</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-[#1d1d1f] dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {successMessage && (
          <div className="p-3 rounded-2xl bg-[#34c759]/15 text-[#34c759] text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Section 1: Export */}
        <div className="p-4 rounded-2xl bg-[#f5f5f7] dark:bg-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold">JSONバックアップのエクスポート</h4>
              <p className="text-[11px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50">
                現在の資産・生活費・配当・試算設定の全データをJSONファイルとして保存します。
              </p>
            </div>
            <button
              onClick={exportJSON}
              className="px-4 py-2 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0 shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ダウンロード</span>
            </button>
          </div>
        </div>

        {/* Section 2: Import */}
        <div className="p-4 rounded-2xl bg-[#f5f5f7] dark:bg-white/5 space-y-3">
          <div>
            <h4 className="text-xs font-semibold">バックアップの復元 (インポート)</h4>
            <p className="text-[11px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50">
              エクスポートしたJSONファイルを読み込み、別端末や復元用データを取り込みます。
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-black/5 dark:bg-white/10 hover:bg-black/10 cursor-pointer flex items-center gap-1.5 transition-colors">
              <Upload className="w-3.5 h-3.5 text-[#0071e3]" />
              <span>ファイルを選択</span>
              <input type="file" accept=".json" onChange={handleFileChange} className="hidden" />
            </label>
            <span className="text-[11px] opacity-60 truncate">
              {importText ? 'ファイル読込完了 (復元可能)' : '選択されていません'}
            </span>
          </div>

          {importText && (
            <div className="space-y-2 pt-1">
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="またはJSON文字列を直接ここに貼り付け..."
                rows={3}
                className="w-full p-2.5 text-[11px] font-mono rounded-xl border bg-transparent"
              />
              {importError && (
                <p className="text-[11px] text-[#ff3b30] flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {importError}
                </p>
              )}
              <button
                onClick={handleImportSubmit}
                className="px-4 py-1.5 bg-[#34c759] hover:opacity-90 text-white rounded-full text-xs font-medium"
              >
                復元を実行する
              </button>
            </div>
          )}
        </div>

        {/* Section 3: Reset */}
        <div className="p-4 rounded-2xl bg-[#ff3b30]/5 border border-[#ff3b30]/15 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-[#ff3b30]">初期データへのリセット</h4>
              <p className="text-[11px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60">
                初期状態（S&P500コア・高配当・生活費サンプル）にリセットします。
              </p>
            </div>
            {!confirmReset ? (
              <button
                onClick={() => setConfirmReset(true)}
                className="px-3.5 py-1.5 rounded-full text-xs font-medium text-[#ff3b30] bg-[#ff3b30]/10 hover:bg-[#ff3b30]/20 transition-colors shrink-0"
              >
                リセット
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-1.5 rounded-full text-xs hover:bg-black/5"
                >
                  取消
                </button>
                <button
                  onClick={handleResetExecute}
                  className="px-3.5 py-1.5 bg-[#ff3b30] text-white rounded-full text-xs font-medium shadow-xs"
                >
                  本当に初期化
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
