import React, { useState } from 'react';
import { History, Search, RefreshCw, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { ActivityLog } from '../types/index.ts';

interface ActivityLogsViewProps {
  logs: ActivityLog[];
  onRefresh: () => void;
}

export const ActivityLogsView: React.FC<ActivityLogsViewProps> = ({ logs, onRefresh }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = logs.filter((log) => {
    return (
      log.operation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.channelTitle && log.channelTitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.newValue && log.newValue.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-neutral-100 tracking-tight uppercase flex items-center gap-2">
            <History className="w-6 h-6 text-red-500" />
            LOG AKTIVITAS & RIWAYAT AUDIT
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
            Catatan log permanen untuk setiap sinkronisasi channel, rotasi judul, upload thumbnail, dan perubahan slot jadwal.
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 text-xs font-semibold"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Segarkan Log Aktivitas</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter log audit berdasarkan operasi, pengguna, atau channel..."
          className="w-full pl-10 pr-4 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none placeholder-neutral-500"
        />
      </div>

      {/* Logs Table */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <h3 className="text-sm font-bold text-neutral-100">
            Catatan Audit ({filteredLogs.length})
          </h3>
          <span className="text-xs text-neutral-500">Urutan Waktu Terbaru</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-300 divide-y divide-neutral-800">
            <thead className="bg-neutral-950/80 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="py-2.5 px-3">WAKTU</th>
                <th className="py-2.5 px-3">PENGGUNA / AKTOR</th>
                <th className="py-2.5 px-3">CHANNEL</th>
                <th className="py-2.5 px-3">OPERASI</th>
                <th className="py-2.5 px-3">PERUBAHAN DATA (SEBELUM → SESUDAH)</th>
                <th className="py-2.5 px-3">HASIL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-sans">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-neutral-800/30 transition">
                  <td className="py-3 px-3 text-neutral-400 whitespace-nowrap font-mono text-[11px]">
                    {new Date(log.timestamp).toLocaleString('id-ID', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td className="py-3 px-3 font-semibold text-neutral-200 whitespace-nowrap">
                    {log.user}
                  </td>
                  <td className="py-3 px-3 text-neutral-300 whitespace-nowrap">
                    {log.channelTitle || '—'}
                  </td>
                  <td className="py-3 px-3 font-mono font-bold text-neutral-100 whitespace-nowrap">
                    {log.operation}
                  </td>
                  <td className="py-3 px-3 max-w-md">
                    <div className="space-y-1">
                      {log.previousValue && (
                        <div className="text-[11px] text-neutral-500 line-through">
                          {log.previousValue}
                        </div>
                      )}
                      <div className="text-[11.5px] text-neutral-200 font-medium flex items-center gap-1.5">
                        {log.previousValue && <ArrowRight className="w-3 h-3 text-red-500 shrink-0" />}
                        <span>{log.newValue}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        log.result === 'SUCCESS'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                          : 'bg-rose-950 text-rose-400 border border-rose-800/40'
                      }`}
                    >
                      {log.result === 'SUCCESS' ? 'BERHASIL' : 'GAGAL'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
