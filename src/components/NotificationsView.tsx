import React, { useState } from 'react';
import { Bell, CheckCircle2, AlertTriangle, Info, ShieldCheck, Check, Sparkles, AlertCircle } from 'lucide-react';
import { NotificationItem, Channel } from '../types/index.ts';
import { api } from '../services/api.ts';
import { CandidateDetectionModal } from './CandidateDetectionModal';

interface NotificationsViewProps {
  notifications: NotificationItem[];
  channels?: Channel[];
  onNotificationsUpdated: () => void;
  onOpenCandidateDetection?: (channel: Channel) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  channels = [],
  onNotificationsUpdated,
  onOpenCandidateDetection,
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [selectedCandidateChannel, setSelectedCandidateChannel] = useState<Channel | null>(null);

  const filteredNotifs = notifications.filter((n) => {
    if (filterType === 'ALL') return true;
    if (filterType === 'ALERT') return n.type === 'ALERT' || n.type === 'error';
    if (filterType === 'WARNING') return n.type === 'WARNING' || n.type === 'warning';
    return n.type === filterType;
  });

  const handleMarkRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      onNotificationsUpdated();
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenCandidateModal = (chanId?: string) => {
    if (!chanId) return;
    const targetChannel = channels.find((c) => c.id === chanId);
    if (targetChannel) {
      if (onOpenCandidateDetection) {
        onOpenCandidateDetection(targetChannel);
      } else {
        setSelectedCandidateChannel(targetChannel);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-neutral-100 tracking-tight uppercase flex items-center gap-2">
            <Bell className="w-6 h-6 text-red-500" />
            Notifikasi & Peringatan Sistem
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
            Pemberitahuan real-time untuk pemantau stok jadwal buffer, penemuan video baru, status transcode HD, dan kuota API.
          </p>
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer"
        >
          <option value="ALL">Semua Jenis</option>
          <option value="ALERT">Peringatan Kritis (ALERT)</option>
          <option value="WARNING">Peringatan Stok (WARNING)</option>
          <option value="info">Informasi</option>
          <option value="success">Sukses</option>
          <option value="error">Kendala</option>
        </select>
      </div>

      <div className="space-y-3">
        {filteredNotifs.length === 0 ? (
          <div className="p-8 rounded-2xl bg-neutral-900/40 border border-neutral-800 text-center text-neutral-500 text-xs">
            Tidak ada notifikasi saat ini.
          </div>
        ) : (
          filteredNotifs.map((n) => {
            const isAlert = n.type === 'ALERT' || n.type === 'error';
            const isWarning = n.type === 'WARNING' || n.type === 'warning';
            const hasChannel = !!n.channelId && channels.some((c) => c.id === n.channelId);

            return (
              <div
                key={n.id}
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-start justify-between gap-4 transition ${
                  n.read
                    ? 'bg-neutral-900/40 border-neutral-800 text-neutral-400'
                    : isAlert
                    ? 'bg-neutral-900/90 border-rose-900/60 text-neutral-200 shadow-md shadow-rose-950/20'
                    : isWarning
                    ? 'bg-neutral-900/90 border-amber-900/50 text-neutral-200'
                    : 'bg-neutral-900/90 border-neutral-700/80 text-neutral-200'
                }`}
              >
                <div className="flex items-start space-x-3.5">
                  <div className="mt-0.5 shrink-0">
                    {isAlert ? (
                      <AlertCircle className="w-5 h-5 text-rose-500" />
                    ) : isWarning ? (
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                    ) : n.type === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Info className="w-5 h-5 text-blue-400" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="font-bold text-xs flex flex-wrap items-center gap-2">
                      <span className={isAlert ? 'text-rose-200' : 'text-neutral-100'}>{n.title}</span>
                      {isAlert && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          ALERT
                        </span>
                      )}
                      {isWarning && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          WARNING
                        </span>
                      )}
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed max-w-2xl">{n.message}</p>
                    <div className="text-[10px] text-neutral-500 pt-1">
                      {new Date(n.createdAt).toLocaleString('id-ID', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-start shrink-0 pt-2 sm:pt-0">
                  {hasChannel && (
                    <button
                      onClick={() => handleOpenCandidateModal(n.channelId)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/30 flex items-center gap-1.5 transition cursor-pointer"
                      title="Buka modal deteksi kandidat untuk channel ini"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Periksa Kandidat</span>
                    </button>
                  )}

                  {!n.read && (
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium flex items-center gap-1 cursor-pointer transition"
                    >
                      <Check className="w-3 h-3" />
                      <span>Tandai dibaca</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Candidate Detection Modal if triggered from notification */}
      {selectedCandidateChannel && (
        <CandidateDetectionModal
          isOpen={!!selectedCandidateChannel}
          onClose={() => setSelectedCandidateChannel(null)}
          channel={selectedCandidateChannel}
          onCandidatesUpdated={() => {
            setSelectedCandidateChannel(null);
            onNotificationsUpdated();
          }}
        />
      )}
    </div>
  );
};
