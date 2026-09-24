import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  RotateCw,
  CheckCircle2,
  RefreshCw,
  Search,
  Filter,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { ErrorLog } from '../types/index.ts';
import { api } from '../services/api.ts';

export const ErrorCenterView: React.FC = () => {
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('open');
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchErrors = async () => {
    setIsLoading(true);
    try {
      const data = await api.getErrors();
      setErrors(data);
    } catch (err) {
      console.error('Failed to load error logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchErrors();
  }, []);

  const handleRetry = async (id: string) => {
    try {
      await api.retryError(id);
      setActionMessage(`Retry scheduled for error ${id}.`);
      fetchErrors();
    } catch (err: any) {
      alert(err.message || 'Failed to retry error');
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await api.resolveError(id);
      setActionMessage(`Error marked as resolved.`);
      fetchErrors();
    } catch (err: any) {
      alert(err.message || 'Failed to resolve error');
    }
  };

  const filteredErrors = errors.filter((e) => {
    if (filterStatus === 'ALL') return true;
    return e.status === filterStatus;
  });

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-neutral-100 tracking-tight uppercase flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-rose-500" />
            Pusat Kendala & Resolusi Kegagalan
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
            Pencatatan terstruktur batas kuota API, penundaan transcoding, masalah token otentikasi, dan penanganan coba ulang otomatis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer"
          >
            <option value="open">Kendala Terbuka</option>
            <option value="retried">Sedang Dicoba Ulang</option>
            <option value="resolved">Terselesaikan</option>
            <option value="ALL">Semua Kendala</option>
          </select>

          <button
            onClick={fetchErrors}
            disabled={isLoading}
            className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-red-500' : ''}`} />
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-emerald-400 flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-neutral-400 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* Errors Table */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            Kendala Terdata ({filteredErrors.length})
          </h3>
          <span className="text-xs text-neutral-400">Prinsip Nol Kegagalan Tersembunyi</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-300 divide-y divide-neutral-800">
            <thead className="bg-neutral-950/80 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="py-2.5 px-3">Tanggal / Waktu</th>
                <th className="py-2.5 px-3">Channel</th>
                <th className="py-2.5 px-3">Video Target</th>
                <th className="py-2.5 px-3">Operasi</th>
                <th className="py-2.5 px-3">Jenis Kendala</th>
                <th className="py-2.5 px-3">Pesan Kendala</th>
                <th className="py-2.5 px-3">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {filteredErrors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-neutral-500">
                    Tidak ada kendala pada kategori filter ini. Seluruh sistem berjalan optimal.
                  </td>
                </tr>
              ) : (
                filteredErrors.map((err) => (
                  <tr key={err.id} className="hover:bg-neutral-800/30 transition">
                    <td className="py-3 px-3 text-neutral-400 whitespace-nowrap">
                      {new Date(err.timestamp).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap font-medium text-neutral-200">
                      {err.channelTitle || 'Ayam Warna'}
                    </td>
                    <td className="py-3 px-3 max-w-[150px] truncate text-neutral-300">
                      {err.videoTitle || err.videoId || '—'}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-neutral-400">
                      {err.operation}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-800/40">
                        {err.errorType}
                      </span>
                    </td>
                    <td className="py-3 px-3 max-w-[280px] text-neutral-400">
                      {err.errorMessage}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleRetry(err.id)}
                          className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold text-[11px] flex items-center gap-1 transition cursor-pointer"
                        >
                          <RotateCw className="w-3 h-3" />
                          <span>Coba Lagi</span>
                        </button>
                        <button
                          onClick={() => handleResolve(err.id)}
                          className="px-2 py-1 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-300 font-semibold text-[11px] flex items-center gap-1 transition cursor-pointer"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Selesaikan</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
