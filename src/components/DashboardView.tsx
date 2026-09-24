import React, { useMemo } from 'react';
import {
  Tv,
  Film,
  CheckCircle2,
  Clock,
  Calendar,
  AlertTriangle,
  PlayCircle,
  RefreshCw,
  ArrowUpRight,
  Sparkles,
  Activity,
  DollarSign,
  ChevronRight,
  Key,
} from 'lucide-react';
import { Channel, AutomationBatch, ActivityLog } from '../types/index.ts';
import { QueueMonitor } from './QueueMonitor';
import { formatIDR } from './MonetizationBadge';

export interface ActionRequiredItem {
  id: string;
  type: 'warning' | 'error' | 'info';
  title: string;
  description: string;
  link?: string;
  channelId?: string;
  channelTitle?: string;
  actionType?: string;
  bufferDays?: number;
  stockCount?: number;
  alertStatus?: 'SAFE' | 'LOW_STOCK' | 'CRITICAL';
  exhaustionDateFormatted?: string;
}

interface DashboardViewProps {
  metrics: {
    totalChannels: number;
    connectedChannels: number;
    newVideos: number;
    hdReady: number;
    processing: number;
    scheduled: number;
    completedVideos: number;
    automationJobs: number;
    errors: number;
  };
  actionRequired: ActionRequiredItem[];
  recentBatches: AutomationBatch[];
  recentActivity: ActivityLog[];
  channels: Channel[];
  onNavigate: (section: any) => void;
  onSyncAll: () => void;
  isSyncing: boolean;
  onOpenCandidateDetection?: (channel: Channel) => void;
  onGisAuthorize?: (channelId?: string) => Promise<void>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  metrics,
  actionRequired,
  channels,
  onNavigate,
  onSyncAll,
  isSyncing,
  onGisAuthorize,
}) => {
  // Master Revenue and Monetization Aggregation
  const revenueSummary = useMemo(() => {
    let totalRevenue = 0;
    let monetizedCount = 0;
    let almostMonetizedCount = 0;

    channels.forEach((c) => {
      if (c.revenue?.totalChannelRevenue) {
        totalRevenue += c.revenue.totalChannelRevenue;
      }
      if (c.monetizationStatus === 'MONETIZED') monetizedCount++;
      else if (c.monetizationStatus === 'ALMOST_MONETIZED') almostMonetizedCount++;
    });

    return { totalRevenue, monetizedCount, almostMonetizedCount };
  }, [channels]);

  // Compute count of channels that need replenishment
  const lowStockCount = useMemo(() => {
    const fromChannels = channels.filter(
      (c) => c.scheduleAlertStatus === 'LOW_STOCK' || c.scheduleAlertStatus === 'CRITICAL'
    ).length;
    const fromActions = actionRequired.filter(
      (a) => a.id.startsWith('act-buffer') || a.actionType === 'INSPECT_CANDIDATES'
    ).length;
    return Math.max(fromChannels, fromActions);
  }, [channels, actionRequired]);

  // Other critical items (such as OAuth authorization errors)
  const otherCriticalActions = useMemo(() => {
    return actionRequired.filter(
      (a) => !a.id.startsWith('act-buffer') && a.actionType !== 'INSPECT_CANDIDATES' && a.type === 'error'
    );
  }, [actionRequired]);

  return (
    <div className="space-y-6 overflow-x-hidden max-w-full w-full">
      {/* 1. Top Title & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-800/60 max-w-full">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-neutral-100 tracking-tight uppercase truncate">
              AMG COMMAND CENTER
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-red-950/80 text-red-400 border border-red-800/40 shrink-0">
              PROD
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs font-semibold text-red-400 tracking-wide shrink-0">
              Powered by Azka Maulana
            </span>
            <span className="text-neutral-600 hidden sm:inline">•</span>
            <p className="text-xs text-neutral-400">
              Pusat Otomasi Multi-Channel YouTube, Rotasi Master & Penyelarasan Jadwal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap sm:flex-nowrap shrink-0">
          <button
            onClick={() => {
              if (metrics.connectedChannels === 0 && onGisAuthorize) {
                onGisAuthorize(channels[0]?.id);
              } else {
                onSyncAll();
              }
            }}
            disabled={isSyncing}
            className="flex-1 sm:flex-none justify-center flex items-center gap-2 px-3 sm:px-3.5 py-2 text-xs font-semibold rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 transition active:scale-95 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-red-500' : ''}`} />
            <span>{isSyncing ? 'Mendeteksi...' : 'Sinkronkan Channel'}</span>
          </button>

          <button
            onClick={() => onNavigate('automation')}
            className="flex-1 sm:flex-none justify-center flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-red-900/30 transition active:scale-95 cursor-pointer"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Mulai Otomasi</span>
          </button>
        </div>
      </div>

      {/* 2. Kartu Total Akumulasi Pendapatan Global */}
      <div
        onClick={() => onNavigate('revenue')}
        className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-950 border border-emerald-900/50 hover:border-emerald-700/60 shadow-xl cursor-pointer transition group relative overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center text-emerald-400 shrink-0 group-hover:scale-105 transition shadow-lg shadow-emerald-950/40">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Total Akumulasi Pendapatan Seluruh Channel
                </span>
                <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/50 font-bold">
                  YPP MULTI-CHANNEL
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-neutral-100 font-mono tracking-tight mt-0.5">
                {formatIDR(revenueSummary.totalRevenue)}
              </div>
              <div className="text-[11px] text-neutral-400 mt-0.5">
                Total bruto seluruh stream (AdSense, Live Super Chat, YT Shopping, Membership) • {revenueSummary.monetizedCount} channel monetized
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <span className="text-xs font-bold text-emerald-400 group-hover:text-emerald-300 flex items-center gap-1">
              <span>Buka Pelacak Pendapatan Lengkap</span>
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      </div>

      {/* 3. Grid Metrik Utama (8 Primary Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* Total Channels */}
        <div
          onClick={() => onNavigate('channels')}
          className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 hover:border-neutral-700 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Channel</span>
            <Tv className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300" />
          </div>
          <div className="text-2xl font-bold text-neutral-100">{metrics.totalChannels}</div>
          <div className="text-[10px] text-emerald-400 mt-1 font-medium">
            {metrics.connectedChannels} Aktif
          </div>
        </div>

        {/* Connected Channels */}
        <div
          onClick={() => onNavigate('channels')}
          className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 hover:border-neutral-700 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Terhubung</span>
            {metrics.connectedChannels > 0 ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 shadow-[0_0_8px_#34d399,0_0_14px_#10b981]"></span>
              </span>
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-neutral-500" />
            )}
          </div>
          <div className="text-2xl font-bold text-emerald-400">{metrics.connectedChannels}</div>
          <div className="text-[10px] text-emerald-400 mt-1 font-medium flex items-center gap-1">
            {metrics.connectedChannels > 0 ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>Terotorisasi Aktif</span>
              </>
            ) : (
              <span className="text-neutral-500">Belum Terhubung</span>
            )}
          </div>
        </div>

        {/* New / Unmanaged Videos */}
        <div
          onClick={() => onNavigate('videos')}
          className="p-3.5 rounded-xl bg-neutral-900/70 border border-amber-900/40 hover:border-amber-700/60 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Video Baru</span>
            <Film className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400">{metrics.newVideos}</div>
          <div className="text-[10px] text-amber-300 mt-1 font-medium">Belum Dikelola</div>
        </div>

        {/* HD Ready */}
        <div
          onClick={() => onNavigate('videos')}
          className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 hover:border-neutral-700 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Siap HD</span>
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-neutral-100">{metrics.hdReady}</div>
          <div className="text-[10px] text-emerald-400 mt-1 font-medium">Diproses</div>
        </div>

        {/* Processing */}
        <div
          onClick={() => onNavigate('videos')}
          className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 hover:border-neutral-700 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Memproses</span>
            <Clock className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-neutral-100">{metrics.processing}</div>
          <div className="text-[10px] text-neutral-500 mt-1 font-medium">Transcoding</div>
        </div>

        {/* Scheduled */}
        <div
          onClick={() => onNavigate('scheduler')}
          className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 hover:border-neutral-700 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Terjadwal</span>
            <Calendar className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-neutral-100">{metrics.scheduled}</div>
          <div className="text-[10px] text-purple-400 mt-1 font-medium">Slot Masa Depan</div>
        </div>

        {/* Automation Jobs */}
        <div
          onClick={() => onNavigate('queue')}
          className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 hover:border-neutral-700 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Antrean</span>
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-neutral-100">{metrics.automationJobs}</div>
          <div className="text-[10px] text-cyan-400 mt-1 font-medium">Tercatat</div>
        </div>

        {/* Errors */}
        <div
          onClick={() => onNavigate('errors')}
          className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 hover:border-neutral-700 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Kendala</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className={`text-2xl font-bold ${metrics.errors > 0 ? 'text-rose-500' : 'text-neutral-100'}`}>
            {metrics.errors}
          </div>
          <div className="text-[10px] text-neutral-500 mt-1 font-medium">Perlu Tindakan</div>
        </div>
      </div>

      {/* Indikator Status Channel YouTube Data API v3 (GIS) */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 sm:px-4 py-2.5 rounded-2xl bg-neutral-900/60 border border-neutral-800/80 text-xs max-w-full overflow-hidden">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-wrap sm:flex-nowrap">
          <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider shrink-0">
            Status YouTube API:
          </span>
          {metrics.connectedChannels > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-950/90 text-emerald-300 border border-emerald-500/80 shadow-[0_0_14px_rgba(16,185,129,0.45)] shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_8px_#34d399,0_0_15px_#10b981]"></span>
              </span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              CONNECTED
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-neutral-900 text-neutral-400 border border-neutral-700 shrink-0">
              <span className="w-2 h-2 rounded-full bg-neutral-600"></span>
              DISCONNECTED
            </span>
          )}
          <span className="text-neutral-600 hidden sm:inline">•</span>
          <span className="text-neutral-400 text-[11px] truncate hidden sm:inline">
            {metrics.connectedChannels > 0
              ? `${metrics.connectedChannels} channel terhubung via Google Identity Services (YouTube Data API v3)`
              : 'Belum ada akun YouTube terhubung. Klik tombol untuk mengotorisasi.'}
          </span>
        </div>

        {metrics.connectedChannels === 0 && onGisAuthorize && (
          <button
            onClick={() => onGisAuthorize(channels[0]?.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition active:scale-95 shadow-md shadow-red-950/50 cursor-pointer shrink-0"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Otorisasi OAuth Google</span>
          </button>
        )}
      </div>

      {/* 4. Widget Ringkas Pemantau Antrean Worker Phase 3 */}
      <QueueMonitor onNavigateToAutomation={() => onNavigate('automation')} />

      {/* 5. Banner Ringkas Satu Baris: Peringatan Stok Menipis */}
      {lowStockCount > 0 && (
        <div
          onClick={() => onNavigate('channels')}
          className="px-4 py-3 rounded-2xl bg-gradient-to-r from-red-950/80 via-neutral-900 to-red-950/60 border border-red-500/50 hover:border-red-400 shadow-[0_0_14px_rgba(239,68,68,0.25)] flex items-center justify-between gap-3 text-xs cursor-pointer group transition-all"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444] shrink-0" />
            <span className="font-bold text-red-200 truncate">
              Perhatian: <strong className="text-white underline underline-offset-2">{lowStockCount} channel</strong> memerlukan video baru
            </span>
            <span className="hidden md:inline text-neutral-400 text-[11px]">
              • Cadangan jadwal publikasi menipis di bawah ambang batas minimal
            </span>
          </div>
          <div className="flex items-center gap-1 text-red-400 group-hover:text-red-300 font-bold shrink-0">
            <span>Buka di Menu Channel</span>
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      )}

      {/* Compact Secondary Notice for Other Critical Errors if any */}
      {otherCriticalActions.length > 0 && (
        <div
          onClick={() => onNavigate('errors')}
          className="px-4 py-2.5 rounded-xl bg-neutral-900/90 border border-amber-900/50 hover:border-amber-700/60 flex items-center justify-between gap-3 text-xs cursor-pointer transition"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-neutral-300 truncate">
              Terdapat {otherCriticalActions.length} kendala sistem/otorisasi yang memerlukan perhatian Anda.
            </span>
          </div>
          <span className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 shrink-0 flex items-center gap-1">
            <span>Periksa Kendala</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
      )}

      {/* 6. Footer Copyright */}
      <footer className="mt-8 pt-6 pb-2 border-t border-neutral-800/60 text-center">
        <p className="text-xs text-zinc-400 font-medium tracking-wide">
          Copyright © 2026 Azka Media Group. All Rights Reserved.
        </p>
      </footer>
    </div>
  );
};
