import React, { useState } from 'react';
import { Play, Square, RefreshCw, Upload, Sliders, Info, CheckCircle2, AlertTriangle } from 'lucide-react';

interface DataExtractionBarProps {
  isFetching: boolean;
  onStartFetch: () => void;
  onStopFetch: () => void;
  onResetData: () => void;
  onUploadCsv: (file: File) => void;
  targetYield: number;
  onTargetYieldChange: (val: number) => void;
  statusMessage: string | null;
  errorMessage: string | null;
}

export const DataExtractionBar: React.FC<DataExtractionBarProps> = ({
  isFetching,
  onStartFetch,
  onStopFetch,
  onResetData,
  onUploadCsv,
  targetYield,
  onTargetYieldChange,
  statusMessage,
  errorMessage,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadCsv(e.target.files[0]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white border border-black/15 shadow-xs p-4 sm:p-5 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left: Action Buttons */}
        <div className="flex items-center flex-wrap gap-2.5 sm:gap-3">
          {/* Main Toggle Button: 抽出 / 停止 */}
          {!isFetching ? (
            <button
              onClick={onStartFetch}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-[#1A1A1A] hover:bg-orange-600 text-white font-sans text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer min-w-[190px] border border-[#1A1A1A]"
            >
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
              <span>データ抽出を実行</span>
            </button>
          ) : (
            <button
              onClick={onStopFetch}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-red-700 hover:bg-red-800 text-white font-sans text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer min-w-[190px] border border-red-700 animate-pulse"
            >
              <Square className="w-3.5 h-3.5 fill-white" />
              <span>⏹ 抽出を停止 (キャンセル)</span>
            </button>
          )}

          {/* Upload CSV */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-[#F9F7F2] text-[#1A1A1A] border border-black/20 font-sans text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
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
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-[#F9F7F2] text-[#1A1A1A] border border-black/20 font-sans text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            title="初期データセット (2026/04/21〜2026/08/24) にリセット"
          >
            <RefreshCw className="w-3.5 h-3.5 text-gray-600" />
            <span>初期データ復元</span>
          </button>

          {/* Yield Settings Toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border ${
              showSettings
                ? 'bg-orange-50 border-orange-500 text-orange-900'
                : 'bg-white hover:bg-[#F9F7F2] border-black/20 text-[#1A1A1A]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-orange-600" />
            <span>目標年利: {(targetYield * 100).toFixed(1)}%</span>
          </button>
        </div>

        {/* Right: Source & Status Tag */}
        <div className="flex items-center gap-2 text-xs font-sans text-gray-600">
          <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
          <span className="text-[11px] uppercase tracking-wide">
            大和アセット / Global X 公式時系列ソース (コード: 1165 / 563A)
          </span>
        </div>
      </div>

      {/* Target Yield Slider Box (Expandable) */}
      {showSettings && (
        <div className="mt-4 pt-4 border-t border-black/10 grid grid-cols-1 md:grid-cols-3 gap-4 items-center bg-[#FDFCFB] p-4 border border-black/10">
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

      {/* Status & Error Feedback alerts */}
      {statusMessage && (
        <div className="mt-4 p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-sans font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-sans font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
