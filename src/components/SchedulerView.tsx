import React, { useState, useEffect } from 'react';
import {
  CalendarClock,
  Clock,
  ShieldCheck,
  CheckCircle,
  RefreshCw,
  Calendar as CalendarIcon,
  Tv,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Channel } from '../types/index.ts';
import { api } from '../services/api.ts';

interface SchedulerViewProps {
  channels: Channel[];
  selectedChannelId?: string;
  onSelectChannel?: (channelId: string) => void;
}

export const SchedulerView: React.FC<SchedulerViewProps> = ({
  channels,
  selectedChannelId = '',
  onSelectChannel,
}) => {
  const [internalChannelId, setInternalChannelId] = useState<string>(
    selectedChannelId || channels[0]?.id || ''
  );
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (selectedChannelId && selectedChannelId !== internalChannelId) {
      setInternalChannelId(selectedChannelId);
    }
  }, [selectedChannelId]);

  const activeChannelId = internalChannelId || selectedChannelId || channels[0]?.id || '';
  const selectedChannel = channels.find((c) => c.id === activeChannelId) || channels[0];

  const fetchReconciliation = async (channelId: string) => {
    if (!channelId) return;
    setIsLoading(true);
    try {
      const data = await api.getScheduleReconciliation(channelId);
      setScheduleData(data);
    } catch (err) {
      console.error('Failed to reconcile schedule:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeChannelId) {
      fetchReconciliation(activeChannelId);
    }
  }, [activeChannelId]);

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-neutral-100 tracking-tight uppercase flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-red-500" />
            MESIN PENYELARASAN JADWAL
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
            Penjadwalan berkelanjutan berdasarkan video terbaru yang terverifikasi di YouTube secara nyata. Tidak pernah menimpa slot jadwal yang sudah ada.
          </p>
        </div>

        {/* Channel Selector */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-neutral-400 uppercase">CHANNEL:</span>
          <select
            value={activeChannelId}
            onChange={(e) => {
              setInternalChannelId(e.target.value);
              onSelectChannel?.(e.target.value);
            }}
            className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer"
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          <button
            onClick={() => fetchReconciliation(activeChannelId)}
            disabled={isLoading}
            className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white cursor-pointer"
            title="Selaraskan dengan YouTube"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-red-500' : ''}`} />
          </button>
        </div>
      </div>

      {channels.length === 0 ? (
        <div className="p-12 text-center bg-neutral-900/40 rounded-2xl border border-neutral-800 space-y-3">
          <CalendarClock className="w-8 h-8 text-neutral-600 mx-auto" />
          <h3 className="text-sm font-bold text-neutral-200 uppercase tracking-wider">
            Belum ada channel terhubung
          </h3>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            Hubungkan akun YouTube Anda terlebih dahulu melalui otorisasi OAuth Google untuk menyelaraskan dan mengelola jadwal publikasi.
          </p>
        </div>
      ) : (
        <>
          {/* Source of Truth Status Card */}
          <div className="p-5 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <span className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                SUMBER DATA YOUTUBE ASLI TERSELARAS
              </span>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 font-semibold border border-emerald-800/40">
                Titik Acuan Terverifikasi
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Box 1: Latest Scheduled on YouTube */}
              <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800/80 space-y-1">
                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                  VIDEO TERAKHIR DI YOUTUBE
                </div>
                <div className="text-sm font-bold text-neutral-100 flex items-center gap-1.5">
                  {selectedChannel?.latestManagedScheduledAt ? (
                    <span>
                      {new Date(selectedChannel.latestManagedScheduledAt).toLocaleString('id-ID', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  ) : (
                    <span className="text-neutral-400 font-normal">Belum ada jadwal</span>
                  )}
                </div>
                <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>
                    {selectedChannel?.latestManagedScheduledAt ? 'Titik Acuan Terverifikasi' : 'Siap Menentukan Acuan'}
                  </span>
                </div>
              </div>

              {/* Box 2: Next Continuation Point */}
              <div className="p-4 rounded-xl bg-neutral-950/80 border border-red-900/30 space-y-1">
                <div className="text-[10px] font-bold text-red-400 uppercase tracking-wider">
                  SLOT TERSEDIA BERIKUTNYA (LANJUTAN)
                </div>
                <div className="text-sm font-bold text-red-400 flex items-center gap-1.5">
                  {scheduleData?.nextScheduleSlots && scheduleData.nextScheduleSlots.length > 0 ? (
                    <span>{scheduleData.nextScheduleSlots[0].formattedDisplay}</span>
                  ) : (
                    <span className="text-neutral-400 font-normal">Belum ada jadwal berikutnya</span>
                  )}
                </div>
                <div className="text-[11px] text-neutral-400 mt-1">
                  {scheduleData?.nextScheduleSlots && scheduleData.nextScheduleSlots.length > 1
                    ? `Berurutan: ${scheduleData.nextScheduleSlots.slice(1, 4).map((s: any) => s.formattedDisplay).join(', ')}...`
                    : 'Jadwal dihitung otomatis berdasarkan parameter channel'}
                </div>
              </div>

              {/* Box 3: Timezone & Rules */}
              <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800/80 space-y-1">
                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                  PARAMETER ATURAN JADWAL
                </div>
                <div className="text-sm font-bold text-neutral-200">
                  {selectedChannel?.publishFrequency || '1/day'} @ {selectedChannel?.publishTime || '16:00'} WIB
                </div>
                <div className="text-[11px] text-neutral-400 mt-1">
                  Zona Waktu: {selectedChannel?.timezone || 'Asia/Jakarta'} (WIB)
                </div>
              </div>
            </div>
          </div>

          {/* Upcoming Continuous Schedule Sequence Table */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div>
                <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-red-500" />
                  Kalkulasi Slot Jadwal Berkelanjutan
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Setiap video yang diproses oleh AMG untuk channel "{selectedChannel?.title || 'YouTube'}" akan secara otomatis menempati slot jadwal berkelanjutan berikutnya.
                </p>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-semibold">
                {scheduleData?.nextScheduleSlots?.length || 0} Slot Tersedia
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-300 divide-y divide-neutral-800">
                <thead className="bg-neutral-950/80 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  <tr>
                    <th className="py-2.5 px-3">Urutan Slot</th>
                    <th className="py-2.5 px-3">Tanggal Publikasi Berkelanjutan</th>
                    <th className="py-2.5 px-3">Jam Tayang Terjadwal</th>
                    <th className="py-2.5 px-3">Zona Waktu</th>
                    <th className="py-2.5 px-3">Status Konflik</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-mono">
                  {!scheduleData?.nextScheduleSlots || scheduleData.nextScheduleSlots.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-neutral-500 font-sans">
                        Belum ada jadwal yang dikalkulasi.
                      </td>
                    </tr>
                  ) : (
                    scheduleData.nextScheduleSlots.map((slot: any, i: number) => (
                      <tr key={i} className="hover:bg-neutral-800/30 transition">
                        <td className="py-2.5 px-3 text-neutral-400 font-bold">
                          Slot #{i + 1}
                        </td>
                        <td className="py-2.5 px-3 font-sans font-semibold text-neutral-100">
                          {slot.formattedDisplay}
                        </td>
                        <td className="py-2.5 px-3 text-neutral-300">
                          {slot.timeString} WIB
                        </td>
                        <td className="py-2.5 px-3 text-neutral-400 font-sans">
                          {selectedChannel?.timezone || 'Asia/Jakarta'}
                        </td>
                        <td className="py-2.5 px-3 font-sans">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 font-bold border border-emerald-800/40">
                            BEBAS KONFLIK
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
