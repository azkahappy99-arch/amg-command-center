import React, { useState, useEffect } from 'react';
import {
  ListOrdered,
  Pause,
  Play,
  RotateCw,
  Clock,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Layers,
  Activity,
} from 'lucide-react';
import { AutomationJob } from '../types/index.ts';
import { api } from '../services/api.ts';

export const QueueView: React.FC = () => {
  const [jobs, setJobs] = useState<AutomationJob[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchJobs = async () => {
    setIsLoading(true);
    try {
      const data = await api.getQueue();
      if (Array.isArray(data)) {
        setJobs(data);
      }
    } catch (err: any) {
      // Graceful fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleTogglePause = async () => {
    try {
      if (isPaused) {
        await api.resumeQueue();
        setIsPaused(false);
        setActionMessage('Antrean dilanjutkan.');
      } else {
        await api.pauseQueue();
        setIsPaused(true);
        setActionMessage('Antrean dijeda.');
      }
    } catch (err: any) {
      alert(err.message || 'Gagal mengubah status antrean');
    }
  };

  const pendingCount = jobs.filter((j) => j.status === 'pending').length;
  const processingCount = jobs.filter((j) => j.status === 'processing').length;
  const completedCount = jobs.filter((j) => j.status === 'completed').length;
  const failedCount = jobs.filter((j) => j.status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-neutral-100 tracking-tight uppercase flex items-center gap-2">
            <ListOrdered className="w-6 h-6 text-red-500" />
            Antrean Tugas Asinkron (Queue)
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
            Eksekusi antrean atomik untuk pembaruan judul YouTube, perubahan thumbnail, dan konfirmasi jadwal.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchJobs}
            disabled={isLoading}
            title="Segarkan antrean"
            className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-red-500' : ''}`} />
          </button>

          <button
            onClick={handleTogglePause}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs transition cursor-pointer ${
              isPaused
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
            }`}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            <span>{isPaused ? 'Lanjutkan Antrean' : 'Jeda Antrean'}</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-neutral-300">
          {actionMessage}
        </div>
      )}

      {/* Queue Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
          <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
            Memproses
          </div>
          <div className="text-2xl font-bold text-cyan-400 mt-1">{processingCount}</div>
        </div>
        <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
          <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
            Menunggu (Pending)
          </div>
          <div className="text-2xl font-bold text-neutral-200 mt-1">{pendingCount}</div>
        </div>
        <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
          <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
            Selesai
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{completedCount}</div>
        </div>
        <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
          <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
            Gagal
          </div>
          <div className="text-2xl font-bold text-rose-500 mt-1">{failedCount}</div>
        </div>
      </div>

      {/* Live Jobs Table */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-red-500" />
            Daftar Antrean Eksekusi ({jobs.length})
          </h3>
          <span className="text-xs text-neutral-400 font-mono">Pembaruan otomatis tiap 5 dtk</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-300 divide-y divide-neutral-800">
            <thead className="bg-neutral-950/80 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="py-2.5 px-3">ID Tugas</th>
                <th className="py-2.5 px-3">Channel</th>
                <th className="py-2.5 px-3">Video Target</th>
                <th className="py-2.5 px-3">Operasi</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Percobaan</th>
                <th className="py-2.5 px-3">Waktu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-neutral-500">
                    Tidak ada tugas aktif di antrean. Jalankan batch otomasi untuk memproses.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-neutral-800/30 transition">
                    <td className="py-3 px-3 font-mono font-bold text-neutral-200">
                      {job.id}
                    </td>
                    <td className="py-3 px-3">{job.channelTitle || 'Ayam Warna'}</td>
                    <td className="py-3 px-3 max-w-[200px] truncate text-neutral-300 font-medium">
                      {job.videoTitle || job.videoId}
                    </td>
                    <td className="py-3 px-3 font-mono uppercase text-[11px] text-neutral-400">
                      {job.jobType}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          job.status === 'completed'
                            ? 'bg-emerald-950 text-emerald-400'
                            : job.status === 'processing'
                            ? 'bg-cyan-950 text-cyan-400 animate-pulse'
                            : job.status === 'failed'
                            ? 'bg-rose-950 text-rose-400'
                            : 'bg-neutral-800 text-neutral-400'
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-neutral-400">
                      {job.retryCount}
                    </td>
                    <td className="py-3 px-3 text-neutral-400">
                      {job.startedAt
                        ? new Date(job.startedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : '—'}
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
