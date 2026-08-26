import React, { useState, useMemo } from 'react';
import { ETFDataRow } from '../types';
import { formatCurrency, formatDateStr } from '../utils/calc';
import { Table, Download, Search, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';

interface HistoricalTableProps {
  data: ETFDataRow[];
}

export const HistoricalTable: React.FC<HistoricalTableProps> = ({ data }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof ETFDataRow>('date');
  const [sortAsc, setSortAsc] = useState(false); // Default latest first
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [onlyDividends, setOnlyDividends] = useState(false);

  // Filter & sort
  const filteredData = useMemo(() => {
    return data
      .filter((row) => {
        if (onlyDividends && row.last_div <= 0) return false;
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return (
          row.date.includes(s) ||
          formatDateStr(row.date).includes(s) ||
          row.last_div_date.includes(s)
        );
      })
      .sort((a, b) => {
        const valA = a[sortField] ?? 0;
        const valB = b[sortField] ?? 0;
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return sortAsc ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
      });
  }, [data, searchTerm, sortField, sortAsc, onlyDividends]);

  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;
  const paginatedRows = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (field: keyof ETFDataRow) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const exportCsv = () => {
    const headers = [
      '基準日',
      '基準価額(円)',
      '前日比(円)',
      '純資産総額(円)',
      '直近決算日',
      '直近分配金(円)',
      '分配金再投資基準価額',
      '総発行口数(口)',
      '前日比口数増減率(%)',
      '前回決算比累積増加率(R)',
    ];

    const rows = data.map((d) => [
      d.date,
      d.nav,
      d.change,
      d.net_assets,
      d.last_div_date || '',
      d.last_div || 0,
      d.reinv_nav,
      d.total_units.toFixed(4),
      d.daily_unit_change_rate ? d.daily_unit_change_rate.toFixed(2) + '%' : '',
      d.r_cumulative ? d.r_cumulative.toFixed(4) : '',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `563A_etf_data_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <section className="bg-white border border-black/15 p-5 sm:p-6 mb-6 shadow-xs">
      {/* Table Header Controls */}
      <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-3 mb-4 pb-3 border-b border-black/10">
        <div>
          <h2 className="text-xl sm:text-2xl font-serif font-black tracking-tight text-[#1A1A1A]">
            563A 時系列生データ & 算出指標一覧
          </h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="日付検索 (例: 202608)"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-8 pr-3 py-1.5 text-xs bg-[#F9F7F2] border border-black/20 focus:outline-hidden focus:border-black w-36 sm:w-44 font-mono"
            />
          </div>

          {/* Filter dividends only */}
          <button
            onClick={() => {
              setOnlyDividends(!onlyDividends);
              setCurrentPage(1);
            }}
            className={`text-xs px-3 py-1.5 font-sans font-bold transition-colors cursor-pointer border ${
              onlyDividends
                ? 'bg-orange-600 text-white border-orange-600'
                : 'bg-[#F9F7F2] text-gray-700 border-black/20 hover:bg-black/5'
            }`}
          >
            決算日のみ
          </button>

          {/* Export CSV */}
          <button
            onClick={exportCsv}
            className="flex items-center gap-1 text-xs px-3 py-1.5 font-sans font-bold bg-[#1A1A1A] hover:bg-orange-600 text-white transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV出力</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto border border-black/10">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-[#1A1A1A] bg-[#1A1A1A] text-white font-sans uppercase tracking-wider text-[11px]">
              <th
                onClick={() => handleSort('date')}
                className="py-3 px-3 cursor-pointer hover:bg-white/10"
              >
                <div className="flex items-center gap-1">
                  <span>基準日</span>
                  <ArrowUpDown className="w-3 h-3 text-gray-400" />
                </div>
              </th>
              <th
                onClick={() => handleSort('nav')}
                className="py-3 px-3 text-right cursor-pointer hover:bg-white/10"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>基準価額</span>
                  <ArrowUpDown className="w-3 h-3 text-gray-400" />
                </div>
              </th>
              <th className="py-3 px-3 text-right">前日比</th>
              <th
                onClick={() => handleSort('net_assets')}
                className="py-3 px-3 text-right cursor-pointer hover:bg-white/10"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>純資産 (億円)</span>
                  <ArrowUpDown className="w-3 h-3 text-gray-400" />
                </div>
              </th>
              <th
                onClick={() => handleSort('total_units')}
                className="py-3 px-3 text-right cursor-pointer hover:bg-white/10 text-orange-400 font-bold"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>総発行口数 (口)</span>
                  <ArrowUpDown className="w-3 h-3 text-orange-400" />
                </div>
              </th>
              <th className="py-3 px-3 text-right">前日比口数(%)</th>
              <th className="py-3 px-3 text-right text-orange-400 font-bold">決算比R</th>
              <th className="py-3 px-3 text-right">分配金 (円)</th>
              <th className="py-3 px-3 text-right">再投資NAV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10">
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-gray-500 font-sans text-xs">
                  該当するデータがありません
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, idx) => {
                const isDivDay = row.last_div > 0;
                const isLatest = idx === 0 && currentPage === 1;
                return (
                  <tr
                    key={row.date}
                    className={`transition-colors font-mono ${
                      isDivDay
                        ? 'bg-orange-50/80 font-bold'
                        : isLatest
                        ? 'bg-[#F9F7F2]'
                        : 'bg-white hover:bg-[#F9F7F2]'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-semibold text-[#1A1A1A]">
                      <div className="flex items-center gap-1.5 font-sans">
                        <span>{formatDateStr(row.date)}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-[#1A1A1A]">
                      ¥{formatCurrency(row.nav)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-semibold ${
                        row.change > 0
                          ? 'text-emerald-700'
                          : row.change < 0
                          ? 'text-red-600'
                          : 'text-gray-400'
                      }`}
                    >
                      {row.change > 0 ? '+' : ''}
                      {formatCurrency(row.change)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-800">
                      {(row.net_assets / 100000000).toFixed(2)} 億
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-[#1A1A1A] bg-orange-50/30">
                      {formatCurrency(Math.round(row.total_units))}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right ${
                        row.daily_unit_change_rate && row.daily_unit_change_rate > 100.5
                          ? 'text-orange-700 font-bold'
                          : row.daily_unit_change_rate && row.daily_unit_change_rate < 99.5
                          ? 'text-blue-700'
                          : 'text-gray-500'
                      }`}
                    >
                      {row.daily_unit_change_rate
                        ? `${(row.daily_unit_change_rate - 100).toFixed(2)}%`
                        : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-orange-800 bg-orange-50/40">
                      {row.r_cumulative ? `${row.r_cumulative.toFixed(3)}x` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {row.last_div > 0 ? (
                        <span className="text-orange-700 font-serif font-black text-sm">
                          ¥{formatCurrency(row.last_div)}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-700">
                      ¥{formatCurrency(Math.round(row.reinv_nav))}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 pt-3 border-t border-black/10 text-xs font-sans text-gray-500">
        <div>
          全 {filteredData.length} 件中 {(currentPage - 1) * pageSize + 1} 〜{' '}
          {Math.min(currentPage * pageSize, filteredData.length)} 件を表示
        </div>

        <div className="flex items-center gap-1 self-start sm:self-auto">
          <button
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
            className="p-1.5 border border-black/20 bg-white hover:bg-[#F9F7F2] disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4 text-black" />
          </button>
          <span className="px-3 font-mono font-bold text-[#1A1A1A]">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="p-1.5 border border-black/20 bg-white hover:bg-[#F9F7F2] disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
          >
            <ChevronRight className="w-4 h-4 text-black" />
          </button>
        </div>
      </div>
    </section>
  );
};
