import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { DividendStock } from '../../types';
import { EditableCell } from '../common/EditableCell';
import { isJapaneseMutualFundCode, lookupYahooFinanceTicker } from '../../services/yahooFinance';
import { Plus, Calendar, Sparkles, X } from 'lucide-react';

export const DividendTab: React.FC = () => {
  const {
    calculatedDividends,
    totalMonthlyDividend,
    totalAnnualDividend,
    overallNetYield,
    dividendCoverageRate,
    addDividendStock,
    updateDividendStock,
    deleteDividendStock,
    customDividendFrequencies,
    registerCustomDividendFrequency,
    theme,
  } = useApp();

  const isDark = theme === 'dark';

  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [autoResolvedNotice, setAutoResolvedNotice] = useState<string | null>(null);
  const [editingPayoutStockId, setEditingPayoutStockId] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; stockId: string; label: string } | null>(null);
  const [sortState, setSortState] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const originalOrderRef = useRef<string[]>([]);

  useEffect(() => {
    calculatedDividends.forEach(({ stock }) => {
      if (!originalOrderRef.current.includes(stock.id)) originalOrderRef.current.push(stock.id);
    });
    originalOrderRef.current = originalOrderRef.current.filter((id) =>
      calculatedDividends.some(({ stock }) => stock.id === id),
    );
  }, [calculatedDividends]);

  useEffect(() => {
    const closeMenu = () => setRowMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const displayedDividends = useMemo(() => {
    if (!sortState) {
      return [...calculatedDividends].sort((left, right) =>
        originalOrderRef.current.indexOf(left.stock.id) - originalOrderRef.current.indexOf(right.stock.id),
      );
    }
    const valueFor = (item: typeof calculatedDividends[number]) => {
      const { stock, netYield, monthlyNet, annualNet } = item;
      switch (sortState.key) {
        case 'ticker': return stock.ticker;
        case 'name': return stock.name;
        case 'market': return stock.market;
        case 'frequency': return stock.customFrequencyLabel || stock.frequency || 'monthly';
        case 'investedAmount': return stock.investedAmount;
        case 'estimatedYield': return stock.estimatedYield;
        case 'netYield': return netYield;
        case 'monthlyNet': return monthlyNet;
        case 'annualNet': return annualNet;
        default: return '';
      }
    };
    return [...calculatedDividends].sort((left, right) => {
      const leftValue = valueFor(left);
      const rightValue = valueFor(right);
      const result = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'ja');
      return sortState.direction === 'asc' ? result : -result;
    });
  }, [calculatedDividends, sortState]);

  const cycleSort = (key: string) => {
    setSortState((current) => {
      if (!current || current.key !== key) return { key, direction: 'asc' };
      if (current.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };

  const sortMark = (key: string) => sortState?.key === key
    ? (sortState.direction === 'asc' ? ' ▲' : ' ▼')
    : '';

  const createCustomFrequency = (stockId: string) => {
    const label = window.prompt('分配頻度の名前（例: 年3回・2/6/10月）を入力してください。');
    if (!label?.trim()) return;
    const monthsInput = window.prompt('分配月を1〜12のカンマ区切りで入力してください（例: 2,6,10）。');
    const payoutMonths = (monthsInput || '')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12);
    if (payoutMonths.length === 0) {
      window.alert('分配月は1〜12の整数を1つ以上入力してください。');
      return;
    }
    registerCustomDividendFrequency({ label: label.trim(), payoutMonths });
    updateDividendStock(stockId, {
      frequency: 'custom',
      customFrequencyLabel: label.trim(),
      payoutMonths,
    });
  };

  // New stock form state
  const [newStock, setNewStock] = useState<Omit<DividendStock, 'id'>>({
    ticker: '',
    name: '',
    market: 'US',
    investedAmount: 100,
    estimatedYield: 10.0,
    usTaxRate: 10,
    jpTaxRate: 20,
    payoutDay: 15,
    note: '',
  });

  const handleTickerChange = (tickerVal: string) => {
    const uppercase = tickerVal.toUpperCase();
    const resolved = lookupYahooFinanceTicker(uppercase);
    if (resolved) {
      setNewStock(prev => ({
        ...prev,
        ticker: uppercase,
        name: resolved.name,
        estimatedYield: resolved.dividendYield,
        market: resolved.market,
        payoutDay: resolved.payoutDay || prev.payoutDay,
        usTaxRate: resolved.market === 'US' ? 10 : 0,
        note: resolved.note || prev.note,
      }));
      setAutoResolvedNotice(`Yahoo Finance 自動解決: ${resolved.name} (配当利回り ${resolved.dividendYield}%, 支払日 ${resolved.payoutDay || 15}日)`);
    } else {
      const isFund = isJapaneseMutualFundCode(uppercase);
      setNewStock(prev => ({
        ...prev,
        ticker: uppercase,
        ...(isFund ? { market: 'JP_TRUST' as const, usTaxRate: 0 } : {}),
      }));
      setAutoResolvedNotice(isFund ? 'Yahoo Finance Japanの投信コードとして、基準価額を自動取得します。' : null);
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStock.name || !newStock.ticker) return;
    addDividendStock(newStock);
    setShowAddModal(false);
    setNewStock({
      ticker: '',
      name: '',
      market: 'US',
      investedAmount: 100,
      estimatedYield: 10.0,
      usTaxRate: 10,
      jpTaxRate: 20,
      payoutDay: 15,
      note: '',
    });
    setAutoResolvedNotice(null);
  };

  // Distinct sorted payouts with positive day (1..31)
  const payoutsWithDay = calculatedDividends
    .map(c => ({
      ...c,
      day: Math.min(31, Math.max(1, Number(c.stock.payoutDay) || 15)),
    }))
    .sort((a, b) => a.day - b.day);

  return (
    <div className="space-y-8">
      {/* Top Header: Apple Pure Typography */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div>
          <h1 className={`text-2xl sm:text-3xl font-semibold tracking-tight ${
            isDark ? 'text-[#f5f5f7]' : 'text-[#1d1d1f]'
          }`}>
            配当ポートフォリオ
          </h1>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="self-start sm:self-auto flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#0071e3] hover:bg-[#0077ed] transition-all shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>銘柄を追加</span>
        </button>
      </div>

      {/* KPI Minimal Ribbon (Flat Spreadsheet Style - No rounded cards) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-2">
        <div className="p-3.5 border border-black/10 dark:border-white/10 bg-[#f5f5f7]/80 dark:bg-white/5 transition-colors">
          <span className="text-[11px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 block font-medium">月額受取配当 (手取り・2563込)</span>
          <div className="text-xl sm:text-2xl font-bold font-mono text-[#34c759] tabular-nums mt-1">
            {totalMonthlyDividend.toFixed(1)} 万円
          </div>
          <span className="text-[10px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50 font-mono">配当入金合計</span>
        </div>

        <div className="p-3.5 border border-black/10 dark:border-white/10 bg-[#f5f5f7]/80 dark:bg-white/5 transition-colors">
          <span className="text-[11px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 block font-medium">税引後 加重平均利回り</span>
          <div className="text-xl sm:text-2xl font-bold font-mono text-[#0071e3] dark:text-[#2997ff] tabular-nums mt-1">
            {overallNetYield.toFixed(2)} %
          </div>
          <span className="text-[10px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50">手取りベース実質利回り</span>
        </div>

        <div className="p-3.5 border border-black/10 dark:border-white/10 bg-[#f5f5f7]/80 dark:bg-white/5 transition-colors">
          <span className="text-[11px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 block font-medium">年間受取配当 (手取り・2563込)</span>
          <div className="text-xl sm:text-2xl font-bold font-mono text-[#1d1d1f] dark:text-[#f5f5f7] tabular-nums mt-1">
            {totalAnnualDividend.toFixed(1)} 万円
          </div>
          <span className="text-[10px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50 font-mono">年額キャッシュイン</span>
        </div>

        <div className="p-3.5 border border-black/10 dark:border-white/10 bg-[#f5f5f7]/80 dark:bg-white/5 transition-colors">
          <span className="text-[11px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 block font-medium">カバー率</span>
          <div className="text-xl sm:text-2xl font-bold font-mono text-[#0071e3] dark:text-[#2997ff] tabular-nums mt-1">
            {dividendCoverageRate.toFixed(1)}%
          </div>
        </div>

      </div>

      {/* 月間配当タイムライン: 線上の日付を基準に、下へ銘柄名と配当金額を配置する。 */}
      <div className="hidden border border-black/10 dark:border-white/10 bg-[#f5f5f7]/80 dark:bg-white/5 p-6 sm:p-8 space-y-6 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#0071e3]" />
              <h2 className={`text-sm sm:text-base font-semibold ${isDark ? 'text-[#f5f5f7]' : 'text-[#1d1d1f]'}`}>
                配当日程：合計: +{totalMonthlyDividend.toFixed(1)}万円/月
              </h2>
            </div>
          </div>
        </div>

        {/* Graphical Month Timeline Track (1日〜31日) */}
        <div className="hidden sm:block min-h-[170px] pt-5 pb-24 px-2 sm:px-4">
          <div className="relative w-full">
            {/* Horizontal Line Bar */}
            <div className="h-1.5 w-full bg-black/10 dark:bg-white/10" />

            {/* Payout Nodes along the timeline */}
            <div className="absolute top-0 left-0 right-0 pointer-events-none">
              <div className="relative w-full h-0">
                {payoutsWithDay.map(({ stock, monthlyNet, day }) => {
                  // Position percentage across 1..31
                  const leftPercent = ((day - 1) / 30) * 100;
                  const sameDayItems = payoutsWithDay.filter((item) => item.day === day);
                  const stackIndex = sameDayItems.findIndex((item) => item.stock.id === stock.id);
                  const isEditing = editingPayoutStockId === stock.id;

                  return (
                    <div
                      key={stock.id}
                      style={{
                        left: `${Math.min(96, Math.max(4, leftPercent))}%`,
                        top: `${stackIndex * 58}px`,
                      }}
                      className="absolute top-0 -translate-x-1/2 -translate-y-1/2 pointer-events-auto group cursor-pointer"
                    >
                      {/* 線上の小さな青丸が支払日。 */}
                      {stackIndex === 0 ? (
                        <button
                          onClick={() => setEditingPayoutStockId(isEditing ? null : stock.id)}
                          title={`${stock.ticker}の支払日を変更 (現在: ${day}日)`}
                          className="h-5 w-5 rounded-full flex items-center justify-center bg-[#0071e3] text-white text-[8px] font-bold font-mono shadow-md transition-transform group-hover:scale-110 active:scale-95"
                        >
                          {day}
                        </button>
                      ) : (
                        <div className="h-5 w-5" aria-hidden="true" />
                      )}

                      {/* 日付の直下に銘柄名、その下に強調した配当金額。 */}
                      <div
                        onClick={() => setEditingPayoutStockId(isEditing ? null : stock.id)}
                        className="absolute top-7 left-1/2 -translate-x-1/2 flex flex-col items-center whitespace-nowrap text-center transition-transform group-hover:scale-105 cursor-pointer"
                      >
                        <span className="max-w-28 truncate text-[10px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]" title={stock.name || stock.ticker}>
                          {stock.name || stock.ticker}
                        </span>
                        <span className="mt-0.5 text-base leading-none font-mono font-bold text-[#0071e3] dark:text-[#2997ff]">
                          +{monthlyNet.toFixed(1)}万
                        </span>
                      </div>

                      {/* Interactive Day / Amount Editor Popover */}
                      {isEditing && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className={`absolute top-8 left-1/2 -translate-x-1/2 z-20 p-3 shadow-xl border w-44 text-xs space-y-2 ${
                            isDark ? 'bg-[#1d1d1f] border-white/15 text-white' : 'bg-white border-black/10 text-[#1d1d1f]'
                          }`}
                        >
                          <div className="flex items-center justify-between pb-1 border-b border-black/5 dark:border-white/10">
                            <span className="font-semibold text-[11px]">{stock.ticker} 支払日</span>
                            <button
                              onClick={() => setEditingPayoutStockId(null)}
                              className="text-slate-400 hover:text-white"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div>
                            <label className="text-[10px] block opacity-60">支払日 (毎月 n日)</label>
                            <input
                              type="number"
                              min="1"
                              max="31"
                              defaultValue={day}
                              onBlur={(e) => {
                                const newDay = Number(e.target.value) || 15;
                                updateDividendStock(stock.id, { payoutDay: newDay });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const newDay = Number((e.target as HTMLInputElement).value) || 15;
                                  updateDividendStock(stock.id, { payoutDay: newDay });
                                  setEditingPayoutStockId(null);
                                }
                              }}
                              className="w-full p-1.5 text-xs font-mono font-bold border bg-transparent mt-0.5"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] block opacity-60">投資元本 (万円)</label>
                            <input
                              type="number"
                              min="1"
                              step="10"
                              defaultValue={stock.investedAmount}
                              onBlur={(e) => {
                                const newAmount = Number(e.target.value) || stock.investedAmount;
                                updateDividendStock(stock.id, { investedAmount: newAmount });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const newAmount = Number((e.target as HTMLInputElement).value) || stock.investedAmount;
                                  updateDividendStock(stock.id, { investedAmount: newAmount });
                                  setEditingPayoutStockId(null);
                                }
                              }}
                              className="w-full p-1.5 text-xs font-mono font-bold border bg-transparent mt-0.5"
                            />
                          </div>

                          <div className="text-[9px] opacity-50">
                            ※ Enterで確定・全画面自動同期
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 狭い画面では絶対配置を使わず、各銘柄を縦に並べて重なりを防ぐ。 */}
        <div className="sm:hidden space-y-2">
          {payoutsWithDay.map(({ stock, monthlyNet, day }) => {
            const isEditing = editingPayoutStockId === stock.id;
            return (
              <div
                key={`mobile-${stock.id}`}
                className={`relative grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-black/5 dark:border-white/10 pb-2 ${isEditing ? 'pb-3' : ''}`}
              >
                <button
                  onClick={() => setEditingPayoutStockId(isEditing ? null : stock.id)}
                  title={`${stock.ticker}の支払日を変更 (現在: ${day}日)`}
                  className="h-7 w-7 rounded-full justify-self-center flex items-center justify-center bg-[#0071e3] text-white text-[9px] font-bold font-mono shadow-sm active:scale-95"
                >
                  {day}
                </button>
                <span className="min-w-0 truncate text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]" title={stock.name || stock.ticker}>
                  {stock.name || stock.ticker}
                </span>
                <span className="whitespace-nowrap text-sm font-mono font-bold text-[#0071e3] dark:text-[#2997ff]">
                  +{monthlyNet.toFixed(1)}万
                </span>
                {isEditing && (
                  <div
                    onClick={(event) => event.stopPropagation()}
                    className={`col-span-3 grid grid-cols-2 gap-2 p-2 border text-xs ${
                      isDark ? 'bg-[#1d1d1f] border-white/15 text-white' : 'bg-white border-black/10 text-[#1d1d1f]'
                    }`}
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
                        className="w-full p-1.5 font-mono border bg-transparent"
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
                        className="w-full p-1.5 font-mono border bg-transparent"
                      />
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Stock Table with Universal Double-Click Editing */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className={`text-base font-semibold ${isDark ? 'text-[#f5f5f7]' : 'text-[#1d1d1f]'}`}>
            保有高配当銘柄一覧
          </h2>
        </div>

        <div className="overflow-x-auto border border-black/10 dark:border-white/10 bg-[#f5f5f7]/50 dark:bg-white/5 p-2 sm:p-4">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-black/5 dark:border-white/10 text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50">
                {[
                  ['ticker', 'ティッカー', ''],
                  ['name', '銘柄名称', ''],
                  ['market', '市場 / 支払日', ''],
                  ['frequency', '分配頻度', ''],
                  ['investedAmount', '投資額 (万円)', 'text-center'],
                  ['estimatedYield', '想定利回り', 'text-center'],
                  ['netYield', '税引後実質', 'text-center'],
                  ['monthlyNet', '月平均手取り', 'text-center'],
                  ['annualNet', '年額手取り', 'text-center'],
                ].map(([key, label, className]) => (
                  <th
                    key={key}
                    onDoubleClick={() => cycleSort(key)}
                    title="ダブルクリックで 昇順 → 降順 → 元順"
                    className={`py-3 px-3 font-medium cursor-pointer select-none hover:text-[#0071e3] ${className}`}
                  >
                    {label}{sortMark(key)}
                  </th>
                ))}
                <th className="py-3 px-3 text-center font-medium" title="ONにすると円グラフと投資額集計から除外（配当金額は含む）">
                  ポートフォリオ除外
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5 font-mono">
              {displayedDividends.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    登録されている銘柄がありません
                  </td>
                </tr>
              ) : (
                displayedDividends.map(({ stock, netYield, monthlyNet, annualNet }) => (
                  <tr
                    key={stock.id}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setRowMenu({ x: event.clientX, y: event.clientY, stockId: stock.id, label: stock.ticker || stock.name });
                    }}
                    className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
                  >
                    {/* Ticker */}
                    <td className="py-2.5 px-3">
                      <EditableCell
                        value={stock.ticker}
                        type="text"
                        onSave={(val) => {
                          const tickerUpper = String(val).toUpperCase();
                          const resolved = lookupYahooFinanceTicker(tickerUpper);
                          if (resolved) {
                            updateDividendStock(stock.id, {
                              ticker: tickerUpper,
                              name: resolved.name,
                              estimatedYield: resolved.dividendYield,
                              market: resolved.market,
                              payoutDay: resolved.payoutDay || stock.payoutDay,
                              usTaxRate: resolved.market === 'US' ? 10 : 0,
                            });
                          } else {
                            const isFund = isJapaneseMutualFundCode(tickerUpper);
                            updateDividendStock(stock.id, {
                              ticker: tickerUpper,
                              ...(isFund ? { market: 'JP_TRUST', usTaxRate: 0 } : {}),
                            });
                          }
                        }}
                        textClassName="font-mono font-bold text-[#0071e3] dark:text-[#2997ff]"
                      />
                    </td>

                    {/* Name */}
                    <td className="py-2.5 px-3 font-sans">
                      <EditableCell
                        value={stock.name}
                        type="text"
                        onSave={(val) => updateDividendStock(stock.id, { name: String(val) })}
                        textClassName={`font-medium ${isDark ? 'text-[#f5f5f7]' : 'text-[#1d1d1f]'}`}
                      />
                    </td>

                    {/* Market & Payout Day */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-sans px-1.5 py-0.5 border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/10 text-[#1d1d1f]/70 dark:text-[#f5f5f7]/70">
                          {stock.market}
                        </span>
                        <div className="flex items-center">
                          <EditableCell
                            value={stock.payoutDay || 15}
                            type="number"
                            min={1}
                            max={31}
                            suffix="日"
                            onSave={(val) => updateDividendStock(stock.id, { payoutDay: Number(val) || 15 })}
                            textClassName="text-[11px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7]"
                          />
                        </div>
                      </div>
                    </td>

                    {/* Payout Frequency (毎月型 / 年2回型 / 四半期 / 年1回) */}
                    <td className="py-2.5 px-3 font-sans">
                      <select
                        value={stock.frequency === 'custom' && stock.customFrequencyLabel
                          ? `custom:${stock.customFrequencyLabel}`
                          : (stock.frequency || 'monthly')}
                        onChange={(e) => {
                          const selected = e.target.value;
                          if (selected === '__new_custom__') {
                            createCustomFrequency(stock.id);
                            return;
                          }
                          if (selected.startsWith('custom:')) {
                            const custom = customDividendFrequencies.find((item) => `custom:${item.label}` === selected);
                            if (custom) {
                              updateDividendStock(stock.id, {
                                frequency: 'custom',
                                customFrequencyLabel: custom.label,
                                payoutMonths: custom.payoutMonths,
                              });
                            }
                            return;
                          }
                          const freq = selected as 'monthly' | 'semi_annual' | 'quarterly' | 'annual';
                          let months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
                          if (freq === 'semi_annual') months = [6, 12];
                          if (freq === 'quarterly') months = [3, 6, 9, 12];
                          if (freq === 'annual') months = [12];
                          updateDividendStock(stock.id, {
                            frequency: freq,
                            customFrequencyLabel: undefined,
                            payoutMonths: months,
                          });
                        }}
                        className="text-[11px] py-1 px-2 border border-black/15 dark:border-white/15 bg-transparent font-medium cursor-pointer transition-colors text-[#1d1d1f] dark:text-[#f5f5f7]"
                      >
                        <option value="monthly" className="text-black">毎月型 (年12回)</option>
                        <option value="semi_annual" className="text-black">年2回型 (6月・12月)</option>
                        <option value="quarterly" className="text-black">四半期型 (3/6/9/12月)</option>
                        <option value="annual" className="text-black">年1回型 (12月)</option>
                        {customDividendFrequencies.map((custom) => (
                          <option key={custom.label} value={`custom:${custom.label}`} className="text-black">
                            {custom.label} ({custom.payoutMonths.join('/')}月)
                          </option>
                        ))}
                        <option value="__new_custom__" className="text-black">＋ 自由記載を追加...</option>
                      </select>
                    </td>

                    {/* Invested Amount */}
                    <td className="py-2.5 px-3 text-center">
                      <EditableCell
                        value={stock.investedAmount}
                        type="number"
                        step="10"
                        align="center"
                        onSave={(val) => updateDividendStock(stock.id, { investedAmount: Number(val) || 0 })}
                        textClassName={`font-bold tabular-nums ${isDark ? 'text-[#f5f5f7]' : 'text-[#1d1d1f]'}`}
                      />
                    </td>

                    {/* Gross yield */}
                    <td className="py-2.5 px-3 text-center">
                      <EditableCell
                        value={stock.estimatedYield}
                        type="number"
                        step="0.1"
                        suffix="%"
                        align="center"
                        onSave={(val) => updateDividendStock(stock.id, { estimatedYield: Number(val) || 0 })}
                        textClassName="text-[#1d1d1f]/70 dark:text-[#f5f5f7]/70 font-medium"
                      />
                    </td>

                    {/* Net Yield */}
                    <td className="py-2.5 px-3 text-center text-[#0071e3] dark:text-[#2997ff] font-bold tabular-nums">
                      {netYield.toFixed(2)}%
                    </td>

                    {/* Monthly Net */}
                    <td className="py-2.5 px-3 text-center text-xs font-bold text-[#1d1d1f] dark:text-[#f5f5f7] tabular-nums">
                      +{monthlyNet.toFixed(1)}
                    </td>

                    {/* Annual Net */}
                    <td className="py-2.5 px-3 text-center tabular-nums text-[#1d1d1f]/80 dark:text-[#f5f5f7]/80">
                      +{annualNet.toFixed(1)}
                    </td>

                    {/* 円グラフ・高配当投資額からの除外設定。配当金額は除外しない。 */}
                    <td className="py-2.5 px-3 text-center">
                      <label className="inline-flex items-center justify-center gap-1.5 cursor-pointer select-none" title="ONにすると円グラフと投資額集計から除外します（配当金額は含みます）">
                        <input
                          type="checkbox"
                          checked={Boolean(stock.excludeFromPortfolio)}
                          onChange={(event) => updateDividendStock(stock.id, { excludeFromPortfolio: event.target.checked })}
                          className="h-4 w-4 accent-[#0071e3]"
                          aria-label={`${stock.ticker || stock.name}を高配当ポートフォリオから除外`}
                        />
                      </label>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 保有高配当銘柄の月額手取り・投資額・年間試算 */}
      <div className="border border-black/10 dark:border-white/10 bg-[#f5f5f7]/50 dark:bg-white/5 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className={`text-sm sm:text-base font-semibold ${isDark ? 'text-[#f5f5f7]' : 'text-[#1d1d1f]'}`}>
            高配当ポートフォリオ集計
          </h3>
          <span className="text-[10px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50">手取りベース</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="border border-black/10 dark:border-white/10 p-3">
            <div className="text-[10px] opacity-60">合計投資額（円グラフ対象）</div>
            <div className="font-mono font-bold text-lg tabular-nums">{calculatedDividends.filter((item) => !item.stock.excludeFromPortfolio).reduce((sum, item) => sum + item.stock.investedAmount, 0).toFixed(1)} 万円</div>
          </div>
          <div className="border border-black/10 dark:border-white/10 p-3">
            <div className="text-[10px] opacity-60">合計月額手取り（2563込）</div>
            <div className="font-mono font-bold text-lg text-[#0071e3] dark:text-[#2997ff] tabular-nums">{totalMonthlyDividend.toFixed(1)} 万円/月</div>
          </div>
          <div className="border border-black/10 dark:border-white/10 p-3">
            <div className="text-[10px] opacity-60">年間手取り試算（2563込）</div>
            <div className="font-mono font-bold text-lg text-[#0071e3] dark:text-[#2997ff] tabular-nums">{totalAnnualDividend.toFixed(1)} 万円/年</div>
          </div>
        </div>
      </div>

      {rowMenu && (
        <div
          className={`fixed z-[60] min-w-44 border shadow-xl p-1 text-xs ${
            isDark ? 'bg-[#1d1d1f] border-white/15 text-white' : 'bg-white border-black/15 text-[#1d1d1f]'
          }`}
          style={{ left: Math.min(rowMenu.x, window.innerWidth - 190), top: Math.min(rowMenu.y, window.innerHeight - 90) }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="px-2 py-1 text-[10px] text-slate-400 border-b border-black/10 dark:border-white/10">{rowMenu.label}</div>
          <button
            onClick={() => {
              deleteDividendStock(rowMenu.stockId);
              setRowMenu(null);
            }}
            className="w-full text-left px-2 py-2 text-[#ff3b30] hover:bg-[#ff3b30]/10"
          >
            この銘柄を削除
          </button>
        </div>
      )}

      {/* Add Stock Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`p-6 w-full max-w-md border border-black/10 dark:border-white/10 shadow-2xl space-y-4 ${
            isDark ? 'bg-[#1d1d1f] text-[#f5f5f7]' : 'bg-white text-[#1d1d1f]'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/10">
              <h3 className="text-base font-semibold">高配当銘柄の追加</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-black/5 dark:hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
            </div>

            {autoResolvedNotice && (
              <div className="p-2.5 border border-[#0071e3]/30 text-xs bg-[#0071e3]/10 text-[#0071e3] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>{autoResolvedNotice}</span>
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mb-1">
                  ティッカーコード (例: QQQI, IWMI, JEPI, SPY, 1489) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="QQQI"
                  value={newStock.ticker}
                  onChange={(e) => handleTickerChange(e.target.value)}
                  className={`w-full p-2.5 border ${
                    isDark ? 'bg-white/10 border-white/15 text-white' : 'bg-[#f5f5f7] border-black/10 text-[#1d1d1f]'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mb-1">銘柄名 *</label>
                <input
                  type="text"
                  required
                  value={newStock.name}
                  onChange={(e) => setNewStock(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full p-2.5 border ${
                    isDark ? 'bg-white/10 border-white/15 text-white' : 'bg-[#f5f5f7] border-black/10 text-[#1d1d1f]'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mb-1">市場区分</label>
                  <select
                    value={newStock.market}
                    onChange={(e) => {
                      const val = e.target.value as 'US' | 'JP_ETF' | 'JP_TRUST' | 'OTHER';
                      setNewStock(prev => ({
                        ...prev,
                        market: val,
                        usTaxRate: val === 'US' ? 10 : 0,
                      }));
                    }}
                    className={`w-full p-2.5 border ${
                      isDark ? 'bg-white/10 border-white/15 text-white' : 'bg-[#f5f5f7] border-black/10 text-[#1d1d1f]'
                    }`}
                  >
                    <option value="US">米国株・ETF (US)</option>
                    <option value="JP_ETF">日本高配当ETF (JP_ETF)</option>
                    <option value="JP_TRUST">毎月分配投信 (JP_TRUST)</option>
                    <option value="OTHER">その他 (OTHER)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mb-1">毎月支払日 (日)</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={newStock.payoutDay || 15}
                    onChange={(e) => setNewStock(prev => ({ ...prev, payoutDay: Number(e.target.value) || 15 }))}
                    className={`w-full p-2.5 border ${
                      isDark ? 'bg-white/10 border-white/15 text-white' : 'bg-[#f5f5f7] border-black/10 text-[#1d1d1f]'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mb-1">投資額 (万円) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="10"
                    value={newStock.investedAmount}
                    onChange={(e) => setNewStock(prev => ({ ...prev, investedAmount: Number(e.target.value) || 0 }))}
                    className={`w-full p-2.5 border ${
                      isDark ? 'bg-white/10 border-white/15 text-white' : 'bg-[#f5f5f7] border-black/10 text-[#1d1d1f]'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mb-1">想定利回り (%) *</label>
                  <input
                    type="number"
                    required
                    step="0.1"
                    value={newStock.estimatedYield}
                    onChange={(e) => setNewStock(prev => ({ ...prev, estimatedYield: Number(e.target.value) || 0 }))}
                    className={`w-full p-2.5 border ${
                      isDark ? 'bg-white/10 border-white/15 text-white' : 'bg-[#f5f5f7] border-black/10 text-[#1d1d1f]'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mb-1">備考</label>
                <input
                  type="text"
                  placeholder="メモ等"
                  value={newStock.note || ''}
                  onChange={(e) => setNewStock(prev => ({ ...prev, note: e.target.value }))}
                  className={`w-full p-2.5 border ${
                    isDark ? 'bg-white/10 border-white/15 text-white' : 'bg-[#f5f5f7] border-black/10 text-[#1d1d1f]'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-black/10 dark:border-white/10 text-xs hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-medium text-white bg-[#0071e3] hover:bg-[#0077ed] transition-colors shadow-xs"
                >
                  登録する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
