import React, { useEffect, useState, useCallback } from 'react';
import {
  Layers,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  RotateCcw,
  Zap,
  Activity,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Lock,
} from 'lucide-react';
import { api } from '../services/api';

interface QueueMonitorProps {
  onNavigateToAutomation?: () => void;
  refreshIntervalMs?: number;
}

export const QueueMonitor: React.FC<QueueMonitorProps> = ({
  onNavigateToAutomation,
  refreshIntervalMs = 2500,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [queueData, setQueueData] = useState<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    retrying: number;
    remainingInQueue: number;
    waitingQuotaBesokCount: number;
    channelRemainingRawCount: number;
    quotaUsed24h: number;
    quotaLimit: number;
    jobs: any[];
    isProcessing?: boolean;
  }>({
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    retrying: 0,
    remainingInQueue: 0,
    waitingQuotaBesokCount: 0,
    channelRemainingRawCount: 0,
    quotaUsed24h: 0,
    quotaLimit: 70,
    jobs: [],
  });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.getPhase3QueueStatus();
      if (res && res.success) {
        const pending = res.pending ?? 0;
        const processing = res.processing ?? 0;
        const retrying = res.retrying ?? 0;
        const remaining = res.remainingInQueue ?? (pending + retrying);

        setQueueData({
          total: res.total ?? 0,
          pending,
          processing,
          completed: res.completed ?? 0,
          failed: res.failed ?? 0,
          retrying,
          remainingInQueue: remaining,
          waitingQuotaBesokCount: res.waitingQuotaBesokCount ?? 0,
          channelRemainingRawCount: res.channelRemainingRawCount ?? 0,
          quotaUsed24h: res.quotaUsed24h ?? 0,
          quotaLimit: res.quotaLimit ?? 70,
          jobs: res.jobs || [],
          isProcessing: res.isProcessing ?? false,
        });
        setErrorMsg(null);

        // Serverless compatibility: Proactively tick worker if jobs are waiting but idle
        if (pending > 0 && processing === 0) {
          api.workerTickPhase3().catch(() => {});
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Koneksi antrean sedang memulihkan diri...');
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [fetchStatus, refreshIntervalMs]);

  const handleManualRefresh = async () => {
    setLoading(true);
    await fetchStatus();
    setLoading(false);
  };

  const activeWorkCount = queueData.pending + queueData.processing + queueData.retrying;

  return (
    <div className="rounded-2xl bg-neutral-900/90 border border-neutral-800 shadow-xl overflow-hidden backdrop-blur-md">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-3 bg-neutral-950/70 border-b border-neutral-800/80 max-w-full">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative flex items-center justify-center shrink-0">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                activeWorkCount > 0 ? 'bg-amber-400 animate-ping' : 'bg-emerald-500'
              }`}
            />
            <span
              className={`absolute w-2 h-2 rounded-full ${
                activeWorkCount > 0 ? 'bg-amber-500' : 'bg-emerald-400'
              }`}
            />
          </div>
          <span className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-1.5 truncate">
            <Layers className="w-4 h-4 text-red-500 shrink-0" />
            <span className="truncate">Pemantau Antrean Worker Phase 3</span>
          </span>
          <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-neutral-800 text-neutral-300 border border-neutral-700 shrink-0">
            Auto-Chaining (50/Kloter)
          </span>
          <span className="hidden md:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-neutral-800 text-neutral-300 border border-neutral-700 shrink-0">
            Anti-Spam Throttling (2-4s)
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {errorMsg && (
            <span className="text-[10px] text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40 animate-pulse">
              Menyambung ulang...
            </span>
          )}
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            title="Segarkan status antrean"
            className="p-1.5 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-red-400' : ''}`} />
          </button>
          {onNavigateToAutomation && (
            <button
              onClick={onNavigateToAutomation}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-950/50 hover:bg-red-900/60 text-red-300 border border-red-800/60 transition cursor-pointer"
            >
              <span>Laman Otomasi</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Grid of Status Cards (Memproses, Selesai, Sisa Antrean Realtime) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-neutral-800/80 border-b border-neutral-800/60">
        {/* 1. Memproses */}
        <div className="p-3.5 flex flex-col justify-between bg-gradient-to-b from-blue-950/20 to-transparent">
          <div className="flex items-center justify-between text-blue-400 text-xs font-semibold mb-1">
            <span className="flex items-center gap-1">
              <Zap className={`w-3.5 h-3.5 text-blue-400 ${queueData.processing > 0 ? 'animate-pulse' : ''}`} />
              Memproses
            </span>
            <span className="text-[10px] text-blue-400/80 font-mono">
              {queueData.processing > 0 ? 'aktif' : 'siaga'}
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-neutral-100">
            {queueData.processing}
          </div>
          <div className="text-[10px] text-neutral-400 mt-1">Upload serial (2-4s delay)</div>
        </div>

        {/* 2. Selesai */}
        <div className="p-3.5 flex flex-col justify-between bg-gradient-to-b from-emerald-950/20 to-transparent">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold mb-1">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Selesai
            </span>
            <span className="text-[10px] text-emerald-400/80 font-mono">terverifikasi</span>
          </div>
          <div className="text-xl font-bold font-mono text-emerald-300">
            {queueData.completed}
          </div>
          <div className="text-[10px] text-neutral-400 mt-1">Mutasi YouTube sukses</div>
        </div>

        {/* 3. Sisa Antrean */}
        <div className="p-3.5 flex flex-col justify-between bg-gradient-to-b from-amber-950/20 to-transparent">
          <div className="flex items-center justify-between text-amber-400 text-xs font-semibold mb-1">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Sisa Antrean
            </span>
            <span className="text-[10px] text-amber-400/80 font-mono">kloter berjalan</span>
          </div>
          <div className="text-xl font-bold font-mono text-neutral-100">
            {queueData.remainingInQueue}
          </div>
          <div className="text-[10px] text-neutral-400 mt-1">
            {queueData.channelRemainingRawCount > 0
              ? `+${queueData.channelRemainingRawCount} video mentah siap auto-chain`
              : 'Menanti giliran pekerja'}
          </div>
        </div>

        {/* 4. Menunggu Kuota Besok / Batas 24 Jam */}
        <div className="p-3.5 flex flex-col justify-between bg-gradient-to-b from-purple-950/20 to-transparent">
          <div className="flex items-center justify-between text-purple-400 text-xs font-semibold mb-1">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-purple-400" />
              Kuota Besok
            </span>
            <span className="text-[10px] text-purple-400/80 font-mono">jeda 24h</span>
          </div>
          <div className={`text-xl font-bold font-mono ${queueData.waitingQuotaBesokCount > 0 ? 'text-amber-300' : 'text-neutral-300'}`}>
            {queueData.waitingQuotaBesokCount}
          </div>
          <div className="text-[10px] text-neutral-400 mt-1">
            {queueData.waitingQuotaBesokCount > 0
              ? 'Aman dari error 403 (uploadLimit)'
              : 'Tidak ada video tertahan'}
          </div>
        </div>

        {/* 5. Kuota YouTube Hari Ini */}
        <div className="p-3.5 flex flex-col justify-between bg-gradient-to-b from-rose-950/20 to-transparent">
          <div className="flex items-center justify-between text-rose-400 text-xs font-semibold mb-1">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
              Batas 24 Jam
            </span>
            <span className="text-[10px] text-rose-400/80 font-mono">
              {queueData.quotaUsed24h >= 70 ? 'BATAS PENUH' : 'AMAN'}
            </span>
          </div>
          <div className={`text-xl font-bold font-mono ${queueData.quotaUsed24h >= 70 ? 'text-rose-400' : 'text-neutral-200'}`}>
            {queueData.quotaUsed24h} <span className="text-xs font-normal text-neutral-400">/ {queueData.quotaLimit || 70}</span>
          </div>
          <div className="text-[10px] text-neutral-400 mt-1">Batas thumbnail aman 70-90</div>
        </div>
      </div>

      {/* Real-Time Queue Activity Strip / Recent Jobs List */}
      <div className="px-4 py-2.5 bg-neutral-950/40 text-xs">
        {queueData.jobs.length === 0 ? (
          <div className="flex items-center justify-between py-1 text-neutral-500">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500/80" />
              <span>
                Antrean pekerja siaga. Pemrosesan kloter per 50 video & auto-chaining siap dieksekusi.
              </span>
            </div>
            <span className="text-[11px] font-mono text-neutral-500">0 tugas aktif</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              <span>Aktivitas Kloter Pekerja (Menampilkan {Math.min(queueData.jobs.length, 3)} Tugas Terbaru)</span>
              <span className="font-mono text-neutral-400">Total Antrean: {queueData.total}</span>
            </div>
            <div className="divide-y divide-neutral-800/40">
              {queueData.jobs.slice(0, 3).map((job) => (
                <div key={job.id} className="py-1.5 flex items-center justify-between gap-3 text-[11px]">
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase font-mono ${
                        job.status === 'COMPLETED'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                          : job.status === 'PROCESSING'
                          ? 'bg-blue-950 text-blue-300 border border-blue-800/60 animate-pulse'
                          : job.status === 'RETRYING'
                          ? 'bg-purple-950 text-purple-300 border border-purple-800/60'
                          : job.status === 'RATE_LIMITED'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                          : job.status === 'FAILED'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800/60'
                          : 'bg-neutral-800 text-neutral-300 border border-neutral-700/60'
                      }`}
                    >
                      {job.status === 'RATE_LIMITED' ? 'MENUNGGU KUOTA' : job.status}
                    </span>
                    <span className="text-neutral-200 truncate max-w-xs sm:max-w-md font-medium">
                      {job.payload?.title || job.videoId}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 text-neutral-400 font-mono text-[10px]">
                    {job.retryCount > 0 && (
                      <span className="text-purple-300">
                        retry {job.retryCount}/{job.maxRetries}
                      </span>
                    )}
                    <span>{job.batchId}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
