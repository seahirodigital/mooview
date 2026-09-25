import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navigation } from './components/Navigation';
import { SimulationTab } from './components/tabs/SimulationTab';
import { DividendTab } from './components/tabs/DividendTab';
import { AssetManagementTab } from './components/tabs/AssetManagementTab';
import { UnifiedSettingsModal } from './components/modals/UnifiedSettingsModal';

interface FinanceSimulationAppProps {
  onOpenWorkspaceMenu?: () => void;
}

const MainContent: React.FC<FinanceSimulationAppProps> = ({ onOpenWorkspaceMenu }) => {
  const { currentTab, theme } = useApp();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'appearance' | 'sheets' | 'backup'>('appearance');

  const isDark = theme === 'dark';

  // MooView本体はモバイルでチャート領域を固定するが、財務表は縦に全行を読める必要がある。
  useEffect(() => {
    document.documentElement.classList.add('finance-simulation-scroll');
    document.body.classList.add('finance-simulation-scroll');
    return () => {
      document.documentElement.classList.remove('finance-simulation-scroll');
      document.body.classList.remove('finance-simulation-scroll');
    };
  }, []);

  const handleOpenSettings = (tab: 'appearance' | 'sheets' | 'backup' = 'appearance') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };

  return (
    <div className={`min-h-screen flex flex-col antialiased transition-colors duration-200 ${
      isDark ? 'bg-black text-[#f5f5f7]' : 'bg-white text-[#1d1d1f]'
    }`}>
      {/* Top Header & Navigation */}
      <Navigation onOpenSettings={handleOpenSettings} onOpenWorkspaceMenu={onOpenWorkspaceMenu} />

      {/* Main Body (Apple Japan Max Content Width 1260px) */}
      <main className="flex-1 max-w-[1260px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 md:pb-16">
        <div className="transition-opacity duration-200">
          {(currentTab === 'assets' || currentTab === 'living') && <AssetManagementTab />}
          {currentTab === 'dividend' && <DividendTab />}
          {currentTab === 'simulation' && <SimulationTab />}
        </div>
      </main>

      {/* Desktop Apple-Style Minimal Footer */}
      <footer className={`hidden md:block border-t py-6 text-xs transition-colors ${
        isDark ? 'border-white/10 bg-black text-white/50' : 'border-black/5 bg-[#f5f5f7] text-[#1d1d1f]/60'
      }`}>
        <div className="max-w-[1260px] mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`font-semibold ${isDark ? 'text-white' : 'text-[#1d1d1f]'}`}>
              Finance Simulation
            </span>
            <span>·</span>
            <span>資産管理・配当・家計・将来シミュレーション統合エンジン</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <button
              onClick={() => handleOpenSettings('sheets')}
              className="text-[#0071e3] hover:underline"
            >
              Googleスプレッドシート連携
            </button>
            <span>·</span>
            <button
              onClick={() => handleOpenSettings('backup')}
              className="text-[#0071e3] hover:underline"
            >
              データ管理・設定
            </button>
          </div>
        </div>
      </footer>

      {/* Unified Settings Modal (Appearance, Google Sheets, Backup/Data) */}
      <UnifiedSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialTab={settingsTab}
      />
    </div>
  );
};

export default function App({ onOpenWorkspaceMenu }: FinanceSimulationAppProps = {}) {
  return (
    <AppProvider>
      <MainContent onOpenWorkspaceMenu={onOpenWorkspaceMenu} />
    </AppProvider>
  );
}
