import React, { useState, useRef } from 'react';
import { ExternalLink, Square, RefreshCw, Upload, Sliders, Info, CheckCircle2, AlertTriangle, Menu, Settings } from 'lucide-react';
import { formatDateStr } from '../utils/calc';
import type {
  HighDividendAutomationSettings,
  HighDividendAutomationState,
} from '../../../highDividend';

interface HeaderProps {
  onOpenWorkspaceMenu: () => void;
  latestDate: string;
  dataCount: number;
  lastUpdatedTime?: string | null;
  isFetching: boolean;
  onStartFetch: () => void;
  onStopFetch: () => void;
  onResetData: () => void;
  onUploadCsv: (file: File) => void;
  targetYield: number;
  onTargetYieldChange: (val: number) => void;
  statusMessage: string | null;
  errorMessage: string | null;
  automationSettings: HighDividendAutomationSettings;
  automationState: HighDividendAutomationState | null;
  webhookConfigured: boolean;
  automationSaving: boolean;
  automationMessage: string | null;
  onAutomationSettingsChange: (settings: HighDividendAutomationSettings) => void;
  onSaveAutomationSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenWorkspaceMenu,
  latestDate,
  dataCount,
  lastUpdatedTime,
  isFetching,
  onStartFetch,
  onStopFetch,
  onResetData,
  onUploadCsv,
  targetYield,
  onTargetYieldChange,
  statusMessage,
  errorMessage,
  automationSettings,
  automationState,
  webhookConfigured,
  automationSaving,
  automationMessage,
  onAutomationSettingsChange,
  onSaveAutomationSettings,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showAutomationSettings, setShowAutomationSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadCsv(e.target.files[0]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <header className="bg-[#F9F7F2] border-b-2 border-[#1A1A1A] sticky top-0 z-30 shadow-none backdrop-blur-xs bg-[#F9F7F2]/95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Masthead Branding & Compact Title */}
          <div className="flex items-start gap-2.5">
            <button
              type="button"
              onClick={onOpenWorkspaceMenu}
              className="mt-0.5 w-7 h-7 shrink-0 flex items-center justify-center border border-[#242424] bg-[#101010] text-gray-300 hover:text-white hover:bg-[#181818] transition"
              title="画面切替メニュー"
              aria-label="画面切替メニューを開く"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] uppercase tracking-widest font-sans font-bold text-orange-600 bg-orange-50 px-1.5 py-0.2 border border-orange-200">
                東証: 563A
              </span>
              <span className="text-black/30">•</span>
              <a
                href="https://globalxetfs.co.jp/funds/563A/index.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-sans text-orange-700 hover:text-orange-900 inline-flex items-center gap-0.5 font-semibold underline decoration-orange-300 underline-offset-2 transition-colors"
              >
                公式詳細 <ExternalLink className="w-2.5 h-2.5" />
              </a>
              <span className="text-black/30">•</span>
              <a
                href="https://x.com/GlobalXETFsJPN/status/2085557369803767985?s=20"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-sans text-orange-700 hover:text-orange-900 inline-flex items-center gap-0.5 font-semibold underline decoration-orange-300 underline-offset-2 transition-colors"
              >
                希薄化解説 <ExternalLink className="w-2.5 h-2.5" />
              </a>
              </div>

              {/* 563A Dividend Forecast */}
              <h1 className="text-lg sm:text-xl lg:text-2xl font-black tracking-tight leading-tight uppercase italic font-serif text-[#1A1A1A]">
                563A Dividend Forecast
              </h1>

              <div className="flex items-center gap-3 text-[11px] text-gray-500 font-sans mt-0.5">
                <span>基準日: <strong className="text-[#1A1A1A]">{formatDateStr(latestDate)}</strong> ({dataCount}件)</span>
                {lastUpdatedTime && (
                  <>
                    <span className="text-black/20">|</span>
                    <span>最終同期: <strong className="text-emerald-800">{lastUpdatedTime}</strong></span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right Header Control Actions */}
          <div className="flex flex-col items-start lg:items-end gap-2">
            <div className="flex items-center flex-wrap gap-2">
              {/* Main Toggle Button: 抽出 / 停止 */}
              {!isFetching ? (
                <button
                  onClick={onStartFetch}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#1A1A1A] hover:bg-orange-600 text-white font-sans text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border border-[#1A1A1A]"
                >
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                  <span>データ抽出を実行</span>
                </button>
              ) : (
                <button
                  onClick={onStopFetch}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-sans text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border border-red-700 animate-pulse"
                >
                  <Square className="w-3 h-3 fill-white" />
                  <span>⏹ 抽出を停止</span>
                </button>
              )}

              {/* Upload CSV */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#F9F7F2] text-[#1A1A1A] border border-black/20 font-sans text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                title="公式サイトのCSVファイルをアップロード"
              >
                <Upload className="w-3.5 h-3.5 text-gray-600" />
                <span>CSVインポート</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".csv,.txt"
                className="hidden"
              />

              {/* Reset Baseline Data */}
              <button
                onClick={onResetData}
                className="inline-flex items-center gap-1 px-3 py-2 bg-white hover:bg-[#F9F7F2] text-[#1A1A1A] border border-black/20 font-sans text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                title="初期データセット (2026/04/21〜2026/08/24) にリセット"
              >
                <RefreshCw className="w-3.5 h-3.5 text-gray-600" />
                <span>初期データ復元</span>
              </button>

              {/* Yield Settings Toggle */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 font-sans text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border ${
                  showSettings
                    ? 'bg-orange-50 border-orange-500 text-orange-900'
                    : 'bg-white hover:bg-[#F9F7F2] border-black/20 text-[#1A1A1A]'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-orange-600" />
                <span>目標年利: {(targetYield * 100).toFixed(1)}%</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAutomationSettings((open) => !open)}
                className={`inline-flex items-center justify-center w-9 h-9 font-sans transition-colors cursor-pointer border ${
                  showAutomationSettings
                    ? 'bg-orange-50 border-orange-500 text-orange-900'
                    : 'bg-white hover:bg-[#F9F7F2] border-black/20 text-[#1A1A1A]'
                }`}
                title="自動抽出設定"
                aria-label="自動抽出設定を開く"
              >
                <Settings className="w-4 h-4 text-orange-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Target Yield Slider Box */}
        {showSettings && (
          <div className="mt-3 pt-3 border-t border-black/10 grid grid-cols-1 md:grid-cols-3 gap-4 items-center bg-[#FDFCFB] p-3.5 border border-black/15 shadow-xs">
            <div className="md:col-span-2">
              <div className="flex justify-between items-center mb-1 text-xs font-sans font-bold text-[#1A1A1A]">
                <span className="flex items-center gap-1">
                  ファンド設計上の目標利回り (オプションプレミアム年間想定)
                  <Info className="w-3.5 h-3.5 text-gray-500" />
                </span>
                <span className="text-orange-600 font-mono font-bold text-sm">{(targetYield * 100).toFixed(1)}% / 年</span>
              </div>
              <input
                type="range"
                min="8"
                max="25"
                step="0.5"
                value={targetYield * 100}
                onChange={(e) => onTargetYieldChange(parseFloat(e.target.value) / 100)}
                className="w-full h-1.5 bg-gray-300 appearance-none cursor-pointer accent-orange-600"
              />
            </div>
            <div className="flex items-center gap-1.5 justify-start md:justify-end flex-wrap">
              <span className="text-[10px] uppercase font-sans font-bold text-gray-500">クイック設定:</span>
              {[0.12, 0.14, 0.15, 0.16, 0.18].map((val) => (
                <button
                  key={val}
                  onClick={() => onTargetYieldChange(val)}
                  className={`text-xs px-2.5 py-1 font-mono font-bold cursor-pointer transition-colors border ${
                    Math.abs(targetYield - val) < 0.001
                      ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                      : 'bg-white text-[#1A1A1A] border-black/20 hover:bg-[#F9F7F2]'
                  }`}
                >
                  {(val * 100).toFixed(0)}%
                </button>
              ))}
            </div>
          </div>
        )}

        {showAutomationSettings && (
          <div className="mt-3 bg-[#FDFCFB] p-3.5 border border-black/15 shadow-xs font-sans">
            <div className="flex flex-col lg:flex-row lg:items-end gap-3 lg:gap-5">
              <label className="inline-flex items-center gap-2 text-xs font-bold text-[#1A1A1A]">
                <input
                  type="checkbox"
                  checked={automationSettings.enabled}
                  onChange={(event) => onAutomationSettingsChange({
                    ...automationSettings,
                    enabled: event.target.checked,
                  })}
                  className="w-4 h-4 accent-orange-600"
                />
                自動抽出を有効にする
              </label>
              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider font-bold text-gray-600">
                実行時刻（日本時間）
                <input
                  type="time"
                  value={automationSettings.time}
                  onChange={(event) => onAutomationSettingsChange({
                    ...automationSettings,
                    time: event.target.value,
                  })}
                  className="h-9 px-3 bg-white border border-black/20 text-sm font-mono text-[#1A1A1A]"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-bold text-[#1A1A1A] lg:h-9">
                <input
                  type="checkbox"
                  checked={automationSettings.weekdaysOnly}
                  onChange={(event) => onAutomationSettingsChange({
                    ...automationSettings,
                    weekdaysOnly: event.target.checked,
                  })}
                  className="w-4 h-4 accent-orange-600"
                />
                平日のみ（月〜金）
              </label>
              <button
                type="button"
                onClick={onSaveAutomationSettings}
                disabled={automationSaving || !automationSettings.time}
                className="h-9 px-4 bg-[#1A1A1A] hover:bg-orange-600 disabled:bg-gray-400 text-white text-xs font-bold uppercase tracking-wider transition-colors"
              >
                {automationSaving ? '保存中…' : '設定を保存'}
              </button>
            </div>
            <div className="mt-3 pt-2.5 border-t border-black/10 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-gray-600">
              <span>
                送信先: <strong className={webhookConfigured ? 'text-emerald-800' : 'text-amber-700'}>
                  {webhookConfigured ? 'Discord設定済み' : 'Discord未設定'}
                </strong>
              </span>
              <span>
                前回実行: <strong className="text-[#1A1A1A]">
                  {automationState?.lastRunAt
                    ? new Date(automationState.lastRunAt).toLocaleString('ja-JP')
                    : '未実行'}
                </strong>
              </span>
              {automationState?.lastRunMessage && <span>{automationState.lastRunMessage}</span>}
              {automationMessage && <span className="font-bold text-orange-700">{automationMessage}</span>}
            </div>
          </div>
        )}

        {/* Status & Error Feedback alerts */}
        {statusMessage && (
          <div className="mt-2.5 p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-sans font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mt-2.5 p-2.5 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-sans font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    </header>
  );
};
