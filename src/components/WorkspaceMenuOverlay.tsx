import React from 'react';

import type { AppView } from '../appView';

interface WorkspaceMenuOverlayProps {
  isOpen: boolean;
  currentView: AppView;
  onClose: () => void;
  onSelect: (view: AppView) => void;
}

const MENU_ITEMS: Array<{ view: AppView; label: string }> = [
  { view: 'charts', label: 'チャートビュー' },
  { view: 'value-chain', label: 'バリューチェーンマップ' },
  { view: 'macro-flow', label: 'マクロ資金フロー' },
  { view: 'disclosures', label: '企業開示DB' },
  { view: 'high-dividend', label: '高配当シミュレーター' },
];

export function WorkspaceMenuOverlay({
  isOpen,
  currentView,
  onClose,
  onSelect,
}: WorkspaceMenuOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      <div
        className="absolute left-4 top-11 w-64 bg-[#080808] border border-[#303030] shadow-2xl py-2 text-xs"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-3 pb-2 border-b border-[#242424]">
          <div className="font-bold text-white">MooView メニュー</div>
          <div className="text-[10px] text-gray-500 mt-0.5">分析画面を切り替えます</div>
        </div>
        {MENU_ITEMS.map((item) => {
          const selected = currentView === item.view;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => {
                onSelect(item.view);
                onClose();
              }}
              className={`w-full px-3 py-2.5 text-left flex items-center justify-between hover:bg-[#171717] ${selected ? 'text-emerald-300 bg-[#10251f]' : 'text-gray-200'}`}
            >
              <span>{item.label}</span>
              {selected && <span className="text-[9px]">表示中</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
