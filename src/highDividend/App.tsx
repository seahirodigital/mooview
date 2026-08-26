import React, { useState, useEffect, useRef } from 'react';
import { ETFDataRow, PredictionAnalysis } from './types';
import { RAW_INITIAL_DATA } from './data/initialData';
import { calculatePrediction, enrichETFData } from './utils/calc';
import { Header } from './components/Header';
import { KeyMetricsGrid } from './components/KeyMetricsGrid';
import { ChartsSection } from './components/ChartsSection';
import { ProjectedHeroBanner } from './components/ProjectedHeroBanner';
import { ScenarioTable } from './components/ScenarioTable';
import { CustomSimulator } from './components/CustomSimulator';
import { HistoricalTable } from './components/HistoricalTable';
import { DilutionGuideModal } from './components/DilutionGuideModal';
import {
  DEFAULT_HIGH_DIVIDEND_AUTOMATION_SETTINGS,
  type HighDividendAutomationPayload,
  type HighDividendAutomationSettings,
} from '../../highDividend';
import './index.css';

const STORAGE_KEY = 'etf_563a_data_v1';
const YIELD_KEY = 'etf_563a_target_yield';

interface HighDividendAppProps {
  onOpenWorkspaceMenu: () => void;
}

export function HighDividendApp({ onOpenWorkspaceMenu }: HighDividendAppProps) {
  // State for dataset
  const [data, setData] = useState<ETFDataRow[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return enrichETFData(parsed);
        }
      }
    } catch {
      // ignore
    }
    return enrichETFData(RAW_INITIAL_DATA);
  });

  const [targetYield, setTargetYield] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(YIELD_KEY);
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val > 0) return val;
      }
    } catch {
      // ignore
    }
    return 0.15; // default 15%
  });

  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('A');
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string | null>(null);
  const [automationPayload, setAutomationPayload] = useState<HighDividendAutomationPayload | null>(null);
  const [automationDraft, setAutomationDraft] = useState<HighDividendAutomationSettings>(
    DEFAULT_HIGH_DIVIDEND_AUTOMATION_SETTINGS,
  );
  const [automationSaving, setAutomationSaving] = useState(false);
  const [automationMessage, setAutomationMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSnapshotFetchedAtRef = useRef<string | null>(null);

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save to localStorage', e);
    }
  }, [data]);

  useEffect(() => {
    try {
      localStorage.setItem(YIELD_KEY, targetYield.toString());
    } catch (e) {
      console.warn('Failed to save target yield', e);
    }
  }, [targetYield]);

  useEffect(() => {
    let active = true;
    const loadSnapshot = async () => {
      try {
        const dataResponse = await fetch('/api/high-dividend/data');
        if (dataResponse.ok) {
          const snapshot = await dataResponse.json();
          if (
            active
            && Array.isArray(snapshot.data)
            && snapshot.data.length > 0
            && snapshot.fetchedAt !== lastSnapshotFetchedAtRef.current
          ) {
            lastSnapshotFetchedAtRef.current = snapshot.fetchedAt || null;
            setData(enrichETFData(snapshot.data));
            if (snapshot.fetchedAt) {
              setLastUpdatedTime(new Date(snapshot.fetchedAt).toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
              }));
            }
          }
        }
      } catch {
        // サーバー保存値を取得できない場合も、元リポジトリの初期データで動作を継続する。
      }
    };
    const loadAutomation = async () => {
      try {
        const automationResponse = await fetch('/api/high-dividend/automation');
        if (automationResponse.ok) {
          const payload = await automationResponse.json() as HighDividendAutomationPayload;
          if (active) {
            setAutomationPayload(payload);
            setAutomationDraft(payload.settings);
          }
        }
      } catch {
        // サーバー保存値を取得できない場合も、元リポジトリの初期データで動作を継続する。
      }
    };
    void loadSnapshot();
    void loadAutomation();
    const snapshotTimer = window.setInterval(() => {
      void loadSnapshot();
    }, 60_000);
    return () => {
      active = false;
      window.clearInterval(snapshotTimer);
    };
  }, []);

  // Calculate prediction results whenever data or yield changes
  const analysis: PredictionAnalysis | null = calculatePrediction(data, targetYield);

  // Start data extraction
  const handleStartFetch = async () => {
    setIsFetching(true);
    setStatusMessage(null);
    setErrorMessage(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // 1.2s visual feedback / cancellation window
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 1200);
        controller.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('ユーザにより抽出処理が停止されました'));
        });
      });

      const response = await fetch('/api/fetch-etf-data', {
        signal: controller.signal,
      });

      const json = await response.json();

      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const enriched = enrichETFData(json.data);
        setData(enriched);
        setStatusMessage(
          `最新データの抽出・更新が完了しました (${json.data.length}件、最新日: ${json.data[json.data.length - 1].date})`
        );
        setLastUpdatedTime(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
      } else {
        throw new Error(json.message || 'データ取得に失敗しました');
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('停止')) {
        setStatusMessage('データの抽出処理を中断しました');
      } else {
        setErrorMessage(`抽出エラー: ${err.message || 'ネットワークエラー'}`);
      }
    } finally {
      setIsFetching(false);
      abortControllerRef.current = null;
    }
  };

  // Stop / Abort fetching
  const handleStopFetch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsFetching(false);
  };

  // Reset to initial baseline
  const handleResetData = () => {
    const enriched = enrichETFData(RAW_INITIAL_DATA);
    setData(enriched);
    setStatusMessage('データを初期データセット（2026年8月24日時点）へ復元しました');
    setErrorMessage(null);
    setLastUpdatedTime(null);
  };

  const handleSaveAutomationSettings = async () => {
    setAutomationSaving(true);
    setAutomationMessage(null);
    try {
      const response = await fetch('/api/high-dividend/automation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: automationDraft }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || '自動抽出設定を保存できませんでした');
      }
      setAutomationPayload(payload as HighDividendAutomationPayload);
      setAutomationDraft((payload as HighDividendAutomationPayload).settings);
      setAutomationMessage('自動抽出設定を保存しました');
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : '自動抽出設定を保存できませんでした');
    } finally {
      setAutomationSaving(false);
    }
  };

  // Handle uploaded CSV file
  const handleUploadCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        if (!content) throw new Error('ファイルが空です');

        const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) throw new Error('有効なCSV行データが見つかりません');

        const parsedRows: ETFDataRow[] = [];

        // Parse lines skipping header
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',').map((p) => p.replace(/^["']|["']$/g, '').trim());
          if (parts.length >= 3) {
            const date = parts[0].replace(/\//g, '');
            const nav = parseFloat(parts[1]);
            const change = parseFloat(parts[2]) || 0;
            const net_assets = parseFloat(parts[3]) || 0;
            const last_div_date = parts[4] || '';
            const last_div = parseFloat(parts[5]) || 0;
            const reinv_nav = parseFloat(parts[6]) || nav;

            if (date && !isNaN(nav) && nav > 0) {
              parsedRows.push({
                date,
                nav,
                change,
                net_assets: net_assets > 100000 ? net_assets : net_assets * 100000000,
                last_div_date,
                last_div,
                reinv_nav,
                total_units: 0,
              });
            }
          }
        }

        if (parsedRows.length === 0) {
          throw new Error('有効なETFデータ行が検出されませんでした');
        }

        // Sort chronologically
        parsedRows.sort((a, b) => a.date.localeCompare(b.date));
        const enriched = enrichETFData(parsedRows);
        setData(enriched);
        setStatusMessage(`CSVファイルから ${enriched.length} 件の時系列データを正常に取り込みました`);
        setErrorMessage(null);
      } catch (err: any) {
        setErrorMessage(`CSV読み込みエラー: ${err.message}`);
      }
    };
    reader.readAsText(file, 'Shift_JIS'); // or UTF-8
  };

  const latestRow = data[data.length - 1] || RAW_INITIAL_DATA[RAW_INITIAL_DATA.length - 1];

  return (
    <div className="high-dividend-page h-[100dvh] min-h-0 overflow-y-auto bg-[#F9F7F2] text-[#1A1A1A] flex flex-col font-sans selection:bg-orange-600 selection:text-white md:h-auto md:min-h-screen md:overflow-visible">
      {/* Top Header with Embedded Right-Top Controls */}
      <Header
        onOpenWorkspaceMenu={onOpenWorkspaceMenu}
        latestDate={latestRow.date}
        dataCount={data.length}
        lastUpdatedTime={lastUpdatedTime}
        isFetching={isFetching}
        onStartFetch={handleStartFetch}
        onStopFetch={handleStopFetch}
        onResetData={handleResetData}
        onUploadCsv={handleUploadCsv}
        targetYield={targetYield}
        onTargetYieldChange={setTargetYield}
        statusMessage={statusMessage}
        errorMessage={errorMessage}
        automationSettings={automationDraft}
        automationState={automationPayload?.state || null}
        webhookConfigured={automationPayload?.webhookConfigured === true}
        automationSaving={automationSaving}
        automationMessage={automationMessage}
        onAutomationSettingsChange={setAutomationDraft}
        onSaveAutomationSettings={handleSaveAutomationSettings}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex-1 w-full space-y-6">
        {/* 1. Interactive Charts Section (データ推移と可視化チャート - 左:基準価額, 右:総発行口数/シナリオ/増減率) */}
        <ChartsSection
          data={data}
          scenarios={analysis ? analysis.scenarios : []}
          targetYield={targetYield}
        />

        {/* 2. Key Metrics 4-Card Grid (基準価額(NAV)、総発行口数、Dilution Factor、Theoretical Monthly) */}
        {analysis && (
          <KeyMetricsGrid
            analysis={analysis}
            targetYield={targetYield}
            onOpenDilutionGuide={() => setIsGuideOpen(true)}
          />
        )}

        {/* 3. Custom Simulator (カスタム分配金 & 受取額シミュレーター) */}
        {analysis && (
          <CustomSimulator
            currentNav={latestRow.nav}
            currentR={analysis.rValue}
            targetYield={targetYield}
          />
        )}

        {/* 4. Projected Decision Hero Banner (次回分配金 予測レンジ: ¥1,270 〜 ¥1,291 / 100口) */}
        {analysis && (
          <ProjectedHeroBanner
            analysis={analysis}
            selectedScenarioId={selectedScenarioId}
            onOpenDilutionGuide={() => setIsGuideOpen(true)}
          />
        )}

        {/* 5. 4 Scenario Table & Cards (次回分配金 予測シナリオ（目標年利 15% 割返しモデル）) */}
        {analysis && (
          <ScenarioTable
            scenarios={analysis.scenarios}
            targetYield={targetYield}
            selectedScenarioId={selectedScenarioId}
            onSelectScenario={setSelectedScenarioId}
          />
        )}

        {/* 6. Historical Archive Table (563A 時系列生データ & 算出指標一覧) */}
        <HistoricalTable data={data} />
      </main>

      {/* Dilution Mechanics Modal */}
      <DilutionGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

      {/* Editorial Footer */}
      <footer className="bg-[#F9F7F2] border-t-2 border-[#1A1A1A] py-6 text-xs text-gray-600 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <span className="text-[10px] font-sans font-bold uppercase tracking-widest text-[#1A1A1A] italic">
              563A Distribution Model Terminal v2.4
            </span>
            <span className="hidden sm:inline text-black/20">•</span>
            <span className="text-[11px] font-sans text-gray-500">
              Yield Target: {(targetYield * 100).toFixed(0)}% Per Annum / NASDAQ100 Daily Covered Call
            </span>
          </div>
          <div className="text-[10px] font-mono text-gray-500 text-center sm:text-right">
            &copy; 2026 ETF Projection Terminal // ※本モデルは数理推計であり確定数値を保証するものではありません
          </div>
        </div>
      </footer>
    </div>
  );
}

export default HighDividendApp;
