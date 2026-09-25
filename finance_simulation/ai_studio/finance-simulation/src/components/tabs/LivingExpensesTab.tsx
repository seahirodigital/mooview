import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ExpenseItem, IncomeItem } from '../../types';
import { EditableCell } from '../common/EditableCell';
import { Plus, Trash2, X } from 'lucide-react';

export const LivingExpensesTab: React.FC = () => {
  const {
    expenses,
    totalExpenses,
    incomes,
    totalIncome,
    monthlySurplus,
    addExpense,
    updateExpense,
    deleteExpense,
    addIncome,
    updateIncome,
    deleteIncome,
    theme,
  } = useApp();

  const isDark = theme === 'dark';

  const [showAddExpenseModal, setShowAddExpenseModal] = useState<boolean>(false);
  const [newExpense, setNewExpense] = useState<Omit<ExpenseItem, 'id'>>({
    name: '',
    amount: 1.0,
    category: 'variable',
    note: '',
  });

  const [showAddIncomeModal, setShowAddIncomeModal] = useState<boolean>(false);
  const [newIncome, setNewIncome] = useState<Omit<IncomeItem, 'id'>>({
    name: '',
    amount: 10.0,
    isRecurring: true,
    note: '',
  });

  return (
    <div className="space-y-8">
      {/* Top Header: Pure Apple Typography */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div>
          <h1 className={`text-2xl sm:text-3xl font-semibold tracking-tight ${
            isDark ? 'text-[#f5f5f7]' : 'text-[#1d1d1f]'
          }`}>
            生活費・収支管理
          </h1>
          <p className="text-xs text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mt-1">
            月々の生活費内訳と実質キャッシュフロー余剰力
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddIncomeModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-full transition-colors bg-[#f5f5f7] hover:bg-black/5 dark:bg-white/10 dark:hover:bg-white/15 text-[#1d1d1f] dark:text-[#f5f5f7]"
          >
            <Plus className="w-3.5 h-3.5 text-[#34c759]" />
            <span>収入を追加</span>
          </button>
          <button
            onClick={() => setShowAddExpenseModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#0071e3] hover:bg-[#0077ed] rounded-full transition-all shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>支出を追加</span>
          </button>
        </div>
      </div>

      {/* KPI Minimal Ribbon (No card borders) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[#f5f5f7]/80 dark:bg-white/5 transition-colors">
          <span className="text-[11px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 block">月次合計生活費</span>
          <div className="text-2xl font-bold font-mono text-[#ff9500] tabular-nums mt-1">
            {totalExpenses.toFixed(1)} 万円
          </div>
          <span className="text-[10px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50 font-mono">
            年間換算 {(totalExpenses * 12).toFixed(1)} 万円/年
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-[#f5f5f7]/80 dark:bg-white/5 transition-colors">
          <span className="text-[11px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 block">月次実質収入</span>
          <div className="text-2xl font-bold font-mono text-[#0071e3] dark:text-[#2997ff] tabular-nums mt-1">
            {totalIncome.toFixed(1)} 万円
          </div>
          <span className="text-[10px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50 font-mono">
            年間換算 {(totalIncome * 12).toFixed(1)} 万円/年
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-[#f5f5f7]/80 dark:bg-white/5 transition-colors">
          <span className="text-[11px] text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 block">月次キャッシュフロー収支</span>
          <div className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
            monthlySurplus >= 0 ? 'text-[#34c759]' : 'text-[#ff3b30]'
          }`}>
            {monthlySurplus >= 0 ? `+${monthlySurplus.toFixed(1)}` : monthlySurplus.toFixed(1)} 万円
          </div>
          <span className="text-[10px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50 font-mono">
            {monthlySurplus >= 0 ? '投資積立可能余力' : '生活費超過（補填必要）'}
          </span>
        </div>
      </div>

      {/* Main Grid: Expenses & Incomes Minimal Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Living Expenses Table (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className={`text-base font-semibold ${isDark ? 'text-[#f5f5f7]' : 'text-[#1d1d1f]'}`}>
              生活費一覧 ({expenses.length}項目)
            </h2>
            <span className="text-[11px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50">
              ダブルクリックで編集
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl bg-[#f5f5f7]/50 dark:bg-white/5 p-2 sm:p-4">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-black/5 dark:border-white/10 text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50">
                  <th className="py-3 px-3 font-medium">項目名</th>
                  <th className="py-3 px-3 font-medium">分類</th>
                  <th className="py-3 px-3 font-medium text-right">月額 (万円)</th>
                  <th className="py-3 px-3 font-medium text-right">年間換算</th>
                  <th className="py-3 px-3 font-medium">備考</th>
                  <th className="py-3 px-3 font-medium text-center w-12">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5 font-mono">
                {expenses.map((item) => (
                  <tr key={item.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
                    {/* Name */}
                    <td className="py-2.5 px-3 font-sans">
                      <EditableCell
                        value={item.name}
                        onSave={(val) => updateExpense(item.id, { name: String(val) })}
                        textClassName={`font-medium ${isDark ? 'text-[#f5f5f7]' : 'text-[#1d1d1f]'}`}
                      />
                    </td>

                    {/* Category */}
                    <td className="py-2.5 px-3 font-sans">
                      <EditableCell
                        value={item.category}
                        type="select"
                        options={[
                          { value: 'fixed', label: '固定費' },
                          { value: 'variable', label: '変動費' },
                          { value: 'tax', label: '税金' },
                          { value: 'other', label: 'その他' },
                        ]}
                        onSave={(val) => updateExpense(item.id, { category: val })}
                        textClassName="text-[10px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-[#1d1d1f]/80 dark:text-[#f5f5f7]/80 font-medium"
                      />
                    </td>

                    {/* Monthly Amount */}
                    <td className="py-2.5 px-3 text-right">
                      <EditableCell
                        value={item.amount}
                        type="number"
                        step="0.1"
                        min={0}
                        align="right"
                        onSave={(val) => updateExpense(item.id, { amount: Number(val) || 0 })}
                        textClassName={`font-bold tabular-nums ${isDark ? 'text-[#f5f5f7]' : 'text-[#1d1d1f]'}`}
                      />
                    </td>

                    {/* Annual Amount */}
                    <td className="py-2.5 px-3 text-right text-[11px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50 tabular-nums">
                      {(item.amount * 12).toFixed(1)}
                    </td>

                    {/* Note */}
                    <td className="py-2.5 px-3 font-sans">
                      <EditableCell
                        value={item.note || '-'}
                        onSave={(val) => updateExpense(item.id, { note: String(val) })}
                        textClassName="text-[11px] text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50"
                      />
                    </td>

                    {/* Delete Action */}
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => deleteExpense(item.id)}
                        title="削除"
                        className="p-1 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Incomes Table (1 Col) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className={`text-base font-semibold ${isDark ? 'text-[#f5f5f7]' : 'text-[#1d1d1f]'}`}>
              月次収入内訳
            </h2>
            <span className="text-[11px] font-mono text-[#0071e3] dark:text-[#2997ff] font-semibold">
              計 {totalIncome.toFixed(1)} 万円
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl bg-[#f5f5f7]/50 dark:bg-white/5 p-2 sm:p-4">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-black/5 dark:border-white/10 text-[#1d1d1f]/50 dark:text-[#f5f5f7]/50">
                  <th className="py-3 px-3 font-medium">収入名</th>
                  <th className="py-3 px-3 font-medium text-right">月額 (万円)</th>
                  <th className="py-3 px-3 font-medium text-center w-12">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5 font-mono">
                {incomes.map((inc) => (
                  <tr key={inc.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
                    <td className="py-2.5 px-3 font-sans">
                      <EditableCell
                        value={inc.name}
                        onSave={(val) => updateIncome(inc.id, { name: String(val) })}
                        textClassName={`font-medium ${isDark ? 'text-[#f5f5f7]' : 'text-[#1d1d1f]'}`}
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <EditableCell
                        value={inc.amount}
                        type="number"
                        step="0.5"
                        align="right"
                        onSave={(val) => updateIncome(inc.id, { amount: Number(val) || 0 })}
                        textClassName="font-bold text-[#0071e3] dark:text-[#2997ff] tabular-nums"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => deleteIncome(inc.id)}
                        title="削除"
                        className="p-1 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Expense Modal */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 ${
            isDark ? 'bg-[#1d1d1f] text-[#f5f5f7]' : 'bg-white text-[#1d1d1f]'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/10">
              <h3 className="text-base font-semibold">生活費項目の追加</h3>
              <button onClick={() => setShowAddExpenseModal(false)} className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newExpense.name) return;
                addExpense(newExpense);
                setShowAddExpenseModal(false);
                setNewExpense({ name: '', amount: 1.0, category: 'variable', note: '' });
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mb-1">項目名 *</label>
                <input
                  type="text"
                  required
                  placeholder="例: 電気代, ガソリン, ペット"
                  value={newExpense.name}
                  onChange={(e) => setNewExpense(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full p-2.5 rounded-xl border ${
                    isDark ? 'bg-white/10 border-white/15 text-white' : 'bg-[#f5f5f7] border-transparent text-[#1d1d1f]'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mb-1">月額金額 (万円) *</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    min="0"
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense(prev => ({ ...prev, amount: Number(e.target.value) || 0 }))}
                    className={`w-full p-2.5 rounded-xl border font-mono ${
                      isDark ? 'bg-white/10 border-white/15 text-white' : 'bg-[#f5f5f7] border-transparent text-[#1d1d1f]'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mb-1">分類</label>
                  <select
                    value={newExpense.category}
                    onChange={(e) => setNewExpense(prev => ({ ...prev, category: e.target.value as any }))}
                    className={`w-full p-2.5 rounded-xl border ${
                      isDark ? 'bg-white/10 border-white/15 text-white' : 'bg-[#f5f5f7] border-transparent text-[#1d1d1f]'
                    }`}
                  >
                    <option value="fixed">固定費</option>
                    <option value="variable">変動費</option>
                    <option value="tax">税金</option>
                    <option value="other">その他</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mb-1">備考</label>
                <input
                  type="text"
                  placeholder="メモなど"
                  value={newExpense.note}
                  onChange={(e) => setNewExpense(prev => ({ ...prev, note: e.target.value }))}
                  className={`w-full p-2.5 rounded-xl border ${
                    isDark ? 'bg-white/10 border-white/15 text-white' : 'bg-[#f5f5f7] border-transparent text-[#1d1d1f]'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddExpenseModal(false)}
                  className="px-4 py-2 rounded-full text-xs hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full text-xs font-medium text-white bg-[#0071e3] hover:bg-[#0077ed] transition-colors shadow-xs"
                >
                  保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Income Modal */}
      {showAddIncomeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 ${
            isDark ? 'bg-[#1d1d1f] text-[#f5f5f7]' : 'bg-white text-[#1d1d1f]'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/10">
              <h3 className="text-base font-semibold">収入項目の追加</h3>
              <button onClick={() => setShowAddIncomeModal(false)} className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newIncome.name) return;
                addIncome(newIncome);
                setShowAddIncomeModal(false);
                setNewIncome({ name: '', amount: 10.0, isRecurring: true, note: '' });
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mb-1">収入名 *</label>
                <input
                  type="text"
                  required
                  placeholder="例: 給与, 副業収入"
                  value={newIncome.name}
                  onChange={(e) => setNewIncome(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full p-2.5 rounded-xl border ${
                    isDark ? 'bg-white/10 border-white/15 text-white' : 'bg-[#f5f5f7] border-transparent text-[#1d1d1f]'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mb-1">月額金額 (万円) *</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  min="0"
                  value={newIncome.amount}
                  onChange={(e) => setNewIncome(prev => ({ ...prev, amount: Number(e.target.value) || 0 }))}
                  className={`w-full p-2.5 rounded-xl border font-mono ${
                    isDark ? 'bg-white/10 border-white/15 text-white' : 'bg-[#f5f5f7] border-transparent text-[#1d1d1f]'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60 mb-1">メモ</label>
                <input
                  type="text"
                  placeholder="備考"
                  value={newIncome.note}
                  onChange={(e) => setNewIncome(prev => ({ ...prev, note: e.target.value }))}
                  className={`w-full p-2.5 rounded-xl border ${
                    isDark ? 'bg-white/10 border-white/15 text-white' : 'bg-[#f5f5f7] border-transparent text-[#1d1d1f]'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddIncomeModal(false)}
                  className="px-4 py-2 rounded-full text-xs hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full text-xs font-medium text-white bg-[#0071e3] hover:bg-[#0077ed] transition-colors shadow-xs"
                >
                  保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
