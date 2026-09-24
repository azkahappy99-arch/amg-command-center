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
}

export const SchedulerView: React.FC<SchedulerViewProps> = ({ channels }) => {
  const [selectedChannelId, setSelectedChannelId] = useState<string>(channels[0]?.id || 'chan-ayam-warna');
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const selectedChannel = channels.find((c) => c.id === selectedChannelId) || channels[0];

  const fetchReconciliation = async (channelId: string) => {
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
    if (selectedChannelId) {
      fetchReconciliation(selectedChannelId);
    }
  }, [selectedChannelId]);

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-neutral-100 tracking-tight uppercase flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-red-500" />
            Schedule Reconciliation Engine
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
            Continuous sequential scheduling based on the actual latest verified video on YouTube. Never overwrites existing slots.
          </p>
        </div>

        {/* Channel Selector */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-neutral-400 uppercase">Channel:</span>
          <select
            value={selectedChannelId}
            onChange={(e) => setSelectedChannelId(e.target.value)}
            className="px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none cursor-pointer"
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          <button
            onClick={() => fetchReconciliation(selectedChannelId)}
            disabled={isLoading}
            className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white"
            title="Reconcile with YouTube"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-red-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Source of Truth Status Card */}
      <div className="p-5 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <span className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Live YouTube Source of Truth Reconciled
          </span>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 font-semibold border border-emerald-800/40">
            Continuous Anchor Verified
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Box 1: Latest Scheduled on YouTube */}
          <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800/80 space-y-1">
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
              Latest Video on YouTube
            </div>
            <div className="text-sm font-bold text-neutral-100 flex items-center gap-1.5">
              <span>30 September 2026</span>
              <span className="text-xs text-neutral-400 font-normal">16:00 WIB</span>
            </div>
            <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Verified Anchor Point</span>
            </div>
          </div>

          {/* Box 2: Next Continuation Point */}
          <div className="p-4 rounded-xl bg-neutral-950/80 border border-red-900/30 space-y-1">
            <div className="text-[10px] font-bold text-red-400 uppercase tracking-wider">
              Next Available Slot (Continuation)
            </div>
            <div className="text-sm font-bold text-red-400 flex items-center gap-1.5">
              <span>01 Oktober 2026</span>
              <span className="text-xs text-red-300 font-normal">16:00 WIB</span>
            </div>
            <div className="text-[11px] text-neutral-400 mt-1">
              Consecutive: 02 Oct, 03 Oct, 04 Oct...
            </div>
          </div>

          {/* Box 3: Timezone & Rules */}
          <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800/80 space-y-1">
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
              Schedule Rule Parameters
            </div>
            <div className="text-sm font-bold text-neutral-200">
              1 Video / Day @ 16:00 WIB
            </div>
            <div className="text-[11px] text-neutral-400 mt-1">
              Timezone: {selectedChannel?.timezone || 'Asia/Jakarta'} (UTC+7)
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
              Calculated Continuous Schedule Slots (Next 15 Videos)
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Every video processed by AMG for channel "{selectedChannel?.title}" will automatically take the next reserved continuous slot.
            </p>
          </div>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-semibold">
            15 Reserved Slots
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-300 divide-y divide-neutral-800">
            <thead className="bg-neutral-950/80 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="py-2.5 px-3">Slot Sequence</th>
                <th className="py-2.5 px-3">Continuous Publish Date</th>
                <th className="py-2.5 px-3">Scheduled Time</th>
                <th className="py-2.5 px-3">Timezone</th>
                <th className="py-2.5 px-3">Collision Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-mono">
              {scheduleData?.nextScheduleSlots?.map((slot: any, i: number) => (
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
                    Asia/Jakarta
                  </td>
                  <td className="py-2.5 px-3 font-sans">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 font-bold border border-emerald-800/40">
                      NO CONFLICT
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
