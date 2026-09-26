import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DividendStock } from '../../types';

/** 資産管理タブと配当タブで共有する配当日程表示。 */
export const DividendTimeline: React.FC = () => {
  const { calculatedDividends, updateDividendStock, theme, totalMonthlyDividend } = useApp();
  const isDark = theme === 'dark';
  const [editingPayoutStockId, setEditingPayoutStockId] = useState<string | null>(null);

  const payoutsWithDay = calculatedDividends
    .map((item) => ({
      ...item,
      day: Math.min(31, Math.max(1, Number(item.stock.payoutDay) || 15)),
    }))
    .sort((a, b) => a.day - b.day);

  const renderEditor = (stock: DividendStock, day: number, compact = false) => (
    <div
      onClick={(event) => event.stopPropagation()}
      className={`z-20 grid grid-cols-2 gap-2 border p-2 text-xs ${
        compact ? 'col-span-3' : 'absolute top-8 left-1/2 w-44 -translate-x-1/2 p-3 shadow-xl'
      } ${isDark ? 'border-white/15 bg-[var(--color-finance-ink)] text-white' : 'border-black/10 bg-white text-[var(--color-finance-ink)]'}`}
    >
      <label className="space-y-1">
        <span className="block text-[10px] opacity-60">支払日</span>
        <input
          type="number"
          min="1"
          max="31"
          defaultValue={day}
          onBlur={(event) => updateDividendStock(stock.id, { payoutDay: Number(event.target.value) || 15 })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              updateDividendStock(stock.id, { payoutDay: Number(event.currentTarget.value) || 15 });
              setEditingPayoutStockId(null);
            }
          }}
          className="w-full border bg-transparent p-1.5 font-mono"
        />
      </label>
      <label className="space-y-1">
        <span className="block text-[10px] opacity-60">投資元本 (万円)</span>
        <input
          type="number"
          min="1"
          step="10"
          defaultValue={stock.investedAmount}
          onBlur={(event) => updateDividendStock(stock.id, { investedAmount: Number(event.target.value) || stock.investedAmount })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              updateDividendStock(stock.id, { investedAmount: Number(event.currentTarget.value) || stock.investedAmount });
              setEditingPayoutStockId(null);
            }
          }}
          className="w-full border bg-transparent p-1.5 font-mono"
        />
      </label>
      <span className="col-span-2 text-[9px] opacity-50">※ Enterで確定・全画面自動同期</span>
    </div>
  );

  return (
    <div className="-mt-4 bg-transparent p-0 transition-colors">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-[var(--color-finance-accent)]" />
        <h2 className={`text-sm font-semibold sm:text-base ${isDark ? 'text-[var(--color-finance-surface)]' : 'text-[var(--color-finance-ink)]'}`}>
          配当日程：合計: +{totalMonthlyDividend.toFixed(1)}万円/月
        </h2>
      </div>

      {/* 同じ日付の銘柄は同じ日付ノードの下で順番に積み重ねる。 */}
      <div className="hidden min-h-[140px] pt-2 sm:block">
        <div className="relative mx-2 h-full">
          <div className="h-1.5 w-full bg-black/10 dark:bg-white/10" />
          <div className="pointer-events-none absolute left-0 right-0 top-0">
            <div className="relative h-0 w-full">
              {payoutsWithDay.map(({ stock, monthlyNet, day }) => {
                const sameDayItems = payoutsWithDay.filter((item) => item.day === day);
                const stackIndex = sameDayItems.findIndex((item) => item.stock.id === stock.id);
                const isEditing = editingPayoutStockId === stock.id;
                const leftPercent = ((day - 1) / 30) * 100;
                return (
                  <div
                    key={stock.id}
                    style={{ left: `${Math.min(96, Math.max(4, leftPercent))}%`, top: `${stackIndex * 58}px` }}
                    className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                  >
                    {stackIndex === 0 ? (
                      <button
                        onClick={() => setEditingPayoutStockId(isEditing ? null : stock.id)}
                        title={`${stock.ticker}の支払日を変更 (現在: ${day}日)`}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-finance-accent)] text-[8px] font-bold text-white shadow-md"
                      >
                        {day}
                      </button>
                    ) : <div className="h-5 w-5" aria-hidden="true" />}
                    <div
                      onClick={() => setEditingPayoutStockId(isEditing ? null : stock.id)}
                      className="absolute left-1/2 top-7 flex -translate-x-1/2 cursor-pointer flex-col items-center whitespace-nowrap text-center"
                    >
                      <span className="max-w-28 truncate text-[10px] font-semibold text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)]" title={stock.name || stock.ticker}>
                        {stock.name || stock.ticker}
                      </span>
                      <span className="mt-0.5 font-mono text-base font-bold leading-none text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)]">
                        +{monthlyNet.toFixed(1)}万
                      </span>
                    </div>
                    {isEditing && renderEditor(stock, day)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2 sm:hidden">
        {payoutsWithDay.map(({ stock, monthlyNet, day }) => {
          const isEditing = editingPayoutStockId === stock.id;
          return (
            <div key={stock.id} className="relative grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-black/5 pb-2 dark:border-white/10">
              <button
                onClick={() => setEditingPayoutStockId(isEditing ? null : stock.id)}
                title={`${stock.ticker}の支払日を変更 (現在: ${day}日)`}
                className="flex h-7 w-7 items-center justify-center justify-self-center rounded-full bg-[var(--color-finance-accent)] text-[9px] font-bold text-white"
              >
                {day}
              </button>
              <span className="min-w-0 truncate text-xs font-semibold text-[var(--color-finance-ink)] dark:text-[var(--color-finance-surface)]" title={stock.name || stock.ticker}>
                {stock.name || stock.ticker}
              </span>
              <span className="whitespace-nowrap font-mono text-sm font-bold text-[var(--color-finance-accent)] dark:text-[var(--color-finance-accent-on-dark)]">+{monthlyNet.toFixed(1)}万</span>
              {isEditing && renderEditor(stock, day, true)}
            </div>
          );
        })}
      </div>
    </div>
  );
};
