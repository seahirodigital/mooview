import React from 'react';
import { useApp } from '../context/AppContext';
import { TabType } from '../types';
import { TrendingUp, Coins, Landmark, Settings, Menu, RefreshCw } from 'lucide-react';

interface NavigationProps {
  onOpenSettings: (tab?: 'appearance' | 'sheets' | 'backup') => void;
  onOpenWorkspaceMenu?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({ onOpenSettings, onOpenWorkspaceMenu }) => {
  const { currentTab, setCurrentTab, dividendCoverageRate, theme, refreshCloudData, cloudSyncStatus } = useApp();
  const [refreshing, setRefreshing] = React.useState(false);

  const isDark = theme === 'dark';

  // Desktop tab order: 「資産管理」「配当」「試算」 (統合版)
  const desktopNavItems: { id: TabType; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'assets',
      label: '資産管理',
      icon: <Landmark className="w-4 h-4" />,
    },
    {
      id: 'dividend',
      label: '配当',
      icon: <Coins className="w-4 h-4" />,
      badge: `${dividendCoverageRate.toFixed(0)}%`,
    },
    {
      id: 'simulation',
      label: '試算',
      icon: <TrendingUp className="w-4 h-4" />,
      badge: 'S&P500',
    },
  ];

  // Mobile bottom footer order: 「試算」「配当」「資産管理」
  const mobileNavItems: { id: TabType; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'simulation',
      label: '試算',
      icon: <TrendingUp className="w-5 h-5" />,
    },
    {
      id: 'dividend',
      label: '配当',
      icon: <Coins className="w-5 h-5" />,
      badge: `${dividendCoverageRate.toFixed(0)}%`,
    },
    {
      id: 'assets',
      label: '資産管理',
      icon: <Landmark className="w-5 h-5" />,
    },
  ];

  return (
    <>
      {/* Desktop Apple-Style Minimal Glass Navigation */}
      <header className={`sticky top-0 z-30 w-full transition-colors border-b backdrop-blur-xl ${
        isDark
          ? 'bg-black/80 border-white/10 text-[#f5f5f7]'
          : 'bg-white/80 border-black/5 text-[#1d1d1f]'
      }`}>
        <div className="w-full px-4 h-16 flex items-center justify-between">
          {/* ブランド */}
          <div className="flex items-center gap-3">
            {onOpenWorkspaceMenu && (
              <button
                type="button"
                onClick={onOpenWorkspaceMenu}
                className="w-7 h-7 flex items-center justify-center border border-[#242424] bg-[#101010] text-gray-300 hover:text-white hover:bg-[#181818] transition"
                title="画面切替メニュー"
                aria-label="画面切替メニューを開く"
              >
                <Menu className="w-4 h-4" />
              </button>
            )}
            <div>
              <span className={`text-base font-semibold tracking-tight block ${
                isDark ? 'text-[#f5f5f7]' : 'text-[#1d1d1f]'
              }`}>
                Finance Simulation
              </span>
            </div>
          </div>

          {/* Desktop Navigation Tabs: Order: 資産管理, 配当, 試算 */}
          <nav className={`hidden md:flex items-center border ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-[#f5f5f7] border-black/5'
          }`}>
            {desktopNavItems.map((item) => {
              const active = currentTab === item.id || (item.id === 'assets' && currentTab === 'living');
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-medium transition-all whitespace-nowrap border-b-2 ${
                    active
                      ? isDark
                        ? 'bg-white/10 text-white font-bold border-[#2997ff]'
                        : 'bg-white text-[#1d1d1f] font-bold border-[#0071e3]'
                      : isDark
                        ? 'text-white/70 hover:text-white border-transparent hover:bg-white/5'
                        : 'text-[#1d1d1f]/70 hover:text-[#1d1d1f] border-transparent hover:bg-black/5'
                  }`}
                >
                  <span className={active ? (isDark ? 'text-[#2997ff]' : 'text-[#0071e3]') : 'opacity-70'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className={`text-[10px] px-1.5 py-0.5 font-mono ${
                      active
                        ? isDark ? 'bg-black/20 text-white' : 'bg-[#0071e3]/10 text-[#0071e3]'
                        : isDark ? 'bg-white/10 text-white/80' : 'bg-black/5 text-[#1d1d1f]/60'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Action: Single Unified Gear Settings Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                setRefreshing(true);
                try { await refreshCloudData(); } finally { setRefreshing(false); }
              }}
              title={cloudSyncStatus === 'synced' ? 'クラウド元帳を再読み込み' : 'クラウド元帳の再接続'}
              aria-label="クラウド元帳を再読み込み"
              className={`p-2 border transition-all ${
                isDark
                  ? 'bg-white/10 border-white/10 hover:bg-white/20 text-[#2997ff]'
                  : 'bg-[#f5f5f7] border-black/10 hover:bg-black/5 text-[#0071e3]'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => onOpenSettings()}
              title="設定 (外観・スプシ同期・データ管理)"
              className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-medium transition-all ${
                isDark
                  ? 'bg-white/10 border-white/10 hover:bg-white/20 text-[#f5f5f7]'
                  : 'bg-[#f5f5f7] border-black/10 hover:bg-black/5 text-[#1d1d1f]'
              }`}
            >
              <Settings className="w-4 h-4 text-[#0071e3]" />
              <span className="hidden sm:inline">設定</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar: Order: 試算, 配当, 資産管理 */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-xl border-t pb-safe transition-colors ${
        isDark
          ? 'bg-black/85 border-white/10 text-[#f5f5f7]'
          : 'bg-white/85 border-black/5 text-[#1d1d1f]'
      }`}>
        <div className="grid grid-cols-3 items-center h-14 max-w-md mx-auto">
          {mobileNavItems.map((item) => {
            const active = currentTab === item.id || (item.id === 'assets' && currentTab === 'living');
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className="flex flex-col items-center justify-center h-full min-h-[44px] min-w-[44px] relative active:opacity-70 transition-opacity"
              >
                <div
                  className={`p-1 transition-colors relative ${
                    active
                      ? isDark ? 'text-white' : 'text-[#0071e3]'
                      : isDark ? 'text-white/40' : 'text-black/40'
                  }`}
                >
                  {item.icon}
                  {item.badge && (
                    <span className="absolute -top-1 -right-2 text-[9px] font-mono px-1 bg-[#0071e3] text-white">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] tracking-tight mt-0.5 ${
                    active
                      ? isDark ? 'text-white font-medium' : 'text-[#0071e3] font-medium'
                      : isDark ? 'text-white/40' : 'text-black/40'
                  }`}
                >
                  {item.label}
                </span>
                {active && (
                  <span className="absolute bottom-0 w-8 h-0.5 bg-[#0071e3]" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
