import React, { useState, useEffect } from 'react';
import { Clock, Calendar, Check, X, Sparkles, CheckCircle2 } from 'lucide-react';
import { DayScheduleConfig, ScheduleTimeMode } from '../types/index.ts';
import {
  DEFAULT_DAY_SCHEDULE,
  getChannelDaySchedule,
  saveChannelDaySchedule,
} from '../utils/dayScheduleUtils.ts';

interface WeeklyScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
  channelTitle?: string;
  onScheduleSaved?: (newConfig: DayScheduleConfig) => void;
}

const DAYS_LIST: Array<{ key: keyof DayScheduleConfig; label: string; badge: string; color: string }> = [
  { key: 'senin', label: 'Senin', badge: 'Sen', color: 'border-blue-500/40 text-blue-300' },
  { key: 'selasa', label: 'Selasa', badge: 'Sel', color: 'border-sky-500/40 text-sky-300' },
  { key: 'rabu', label: 'Rabu', badge: 'Rab', color: 'border-emerald-500/40 text-emerald-300' },
  { key: 'kamis', label: 'Kamis', badge: 'Kam', color: 'border-amber-500/40 text-amber-300' },
  { key: 'jumat', label: 'Jumat', badge: 'Jum', color: 'border-orange-500/40 text-orange-300' },
  { key: 'sabtu', label: 'Sabtu', badge: 'Sab', color: 'border-purple-500/40 text-purple-300' },
  { key: 'minggu', label: 'Minggu', badge: 'Min', color: 'border-rose-500/40 text-rose-300' },
];

export const WeeklyScheduleModal: React.FC<WeeklyScheduleModalProps> = ({
  isOpen,
  onClose,
  channelId,
  channelTitle,
  onScheduleSaved,
}) => {
  const [scheduleMode, setScheduleMode] = useState<ScheduleTimeMode>('SAME_ALL_DAYS');
  const [singleTime, setSingleTime] = useState<string>('16:00');
  const [daySchedule, setDaySchedule] = useState<DayScheduleConfig>({ ...DEFAULT_DAY_SCHEDULE });
  const [isSavedSuccess, setIsSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen && channelId) {
      setIsSavedSuccess(false);
      const cleanId = channelId.replace(/^chan-/, '');
      const existing = getChannelDaySchedule(channelId);
      setDaySchedule(existing);

      // Check stored mode
      const storedMode = localStorage.getItem(`amg_schedule_time_mode_${cleanId}`) as ScheduleTimeMode | null;
      if (storedMode) {
        setScheduleMode(storedMode);
      } else {
        // If all days have same time, default to SAME_ALL_DAYS
        const vals = Object.values(existing);
        const allSame = vals.every((v) => v === vals[0]);
        setScheduleMode(allSame ? 'SAME_ALL_DAYS' : 'DIFFERENT_PER_DAY');
      }

      setSingleTime(existing.senin || '16:00');
    }
  }, [isOpen, channelId]);

  if (!isOpen) return null;

  const handleApplySingleTimeToAll = (timeVal: string) => {
    setSingleTime(timeVal);
    setDaySchedule({
      senin: timeVal,
      selasa: timeVal,
      rabu: timeVal,
      kamis: timeVal,
      jumat: timeVal,
      sabtu: timeVal,
      minggu: timeVal,
    });
  };

  const handleDayTimeChange = (dayKey: keyof DayScheduleConfig, val: string) => {
    setDaySchedule((prev) => ({
      ...prev,
      [dayKey]: val,
    }));
  };

  const handleSave = () => {
    const finalSchedule: DayScheduleConfig =
      scheduleMode === 'SAME_ALL_DAYS'
        ? {
            senin: singleTime,
            selasa: singleTime,
            rabu: singleTime,
            kamis: singleTime,
            jumat: singleTime,
            sabtu: singleTime,
            minggu: singleTime,
          }
        : daySchedule;

    saveChannelDaySchedule(channelId, finalSchedule, scheduleMode);
    setIsSavedSuccess(true);
    onScheduleSaved?.(finalSchedule);

    setTimeout(() => {
      setIsSavedSuccess(false);
      onClose();
    }, 600);
  };

  const PRESET_HOURS = ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '21:00'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-4 bg-neutral-950 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-950/60 border border-red-800/60 text-red-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                <span>Pengaturan Jam Tayang Mingguan</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                  WIB (UTC+7)
                </span>
              </h3>
              <p className="text-xs text-neutral-400 truncate max-w-sm">
                Channel: <span className="font-semibold text-neutral-200">{channelTitle || channelId}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Mode Selector Radio Cards */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Pilih Metode Pengaturan Jam Tayang
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setScheduleMode('SAME_ALL_DAYS');
                  handleApplySingleTimeToAll(singleTime);
                }}
                className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  scheduleMode === 'SAME_ALL_DAYS'
                    ? 'bg-red-950/40 border-red-600/70 text-white shadow-md shadow-red-950/30 ring-1 ring-red-500/50'
                    : 'bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs">Opsi 1: Jam Sama ke Semua Hari</span>
                  {scheduleMode === 'SAME_ALL_DAYS' && (
                    <span className="w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-bold">
                      ✓
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">
                  1 input jam otomatis berlaku seragam dari Senin sampai Minggu.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setScheduleMode('DIFFERENT_PER_DAY')}
                className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  scheduleMode === 'DIFFERENT_PER_DAY'
                    ? 'bg-red-950/40 border-red-600/70 text-white shadow-md shadow-red-950/30 ring-1 ring-red-500/50'
                    : 'bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs">Opsi 2: Atur Jam Berbeda Per Hari</span>
                  {scheduleMode === 'DIFFERENT_PER_DAY' && (
                    <span className="w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-bold">
                      ✓
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Kustomisasi jam tayang bebas dan spesifik untuk masing-masing hari.
                </p>
              </button>
            </div>
          </div>

          {/* Opsi 1: Single Time Input with Presets */}
          {scheduleMode === 'SAME_ALL_DAYS' && (
            <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800/80 space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-red-400" />
                  <span>Tentukan Jam Tayang Harian (WIB)</span>
                </label>
                <span className="text-[11px] font-mono text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                  Asia/Jakarta (UTC+7)
                </span>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="time"
                  value={singleTime}
                  onChange={(e) => handleApplySingleTimeToAll(e.target.value)}
                  className="bg-neutral-900 text-neutral-100 font-mono font-bold text-base px-3 py-2 rounded-xl border border-neutral-700 focus:border-red-500 focus:outline-none"
                />
                <span className="text-xs text-neutral-400">
                  Berlaku untuk video yang dijadwalkan pada hari apapun.
                </span>
              </div>

              {/* Shortcut Quick Presets */}
              <div className="pt-2 border-t border-neutral-800/60 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-neutral-500 font-medium">Pilihan Cepat:</span>
                {PRESET_HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => handleApplySingleTimeToAll(h)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-mono transition cursor-pointer border ${
                      singleTime === h
                        ? 'bg-red-600 text-white border-red-500 font-bold'
                        : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-neutral-800'
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Opsi 2: 7 Separate Day Inputs (Senin - Minggu) */}
          {scheduleMode === 'DIFFERENT_PER_DAY' && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-red-400" />
                  <span>Atur Jam Tayang Spesifik Tiap Hari (Senin – Minggu)</span>
                </label>
                <span className="text-[11px] text-neutral-500">Zona Waktu: WIB</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {DAYS_LIST.map((day) => (
                  <div
                    key={day.key}
                    className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800/80 hover:border-neutral-700 flex items-center justify-between transition"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${day.color}`}>
                        {day.badge}
                      </span>
                      <span className="text-xs font-bold text-neutral-200">{day.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="time"
                        value={daySchedule[day.key] || '16:00'}
                        onChange={(e) => handleDayTimeChange(day.key, e.target.value)}
                        className="bg-neutral-900 text-neutral-100 font-mono font-semibold text-xs px-2.5 py-1.5 rounded-lg border border-neutral-700 focus:border-red-500 focus:outline-none"
                      />
                      <span className="text-[10px] font-bold text-neutral-500 font-mono">WIB</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matrix Preview */}
          <div className="p-3.5 rounded-xl bg-neutral-950/40 border border-neutral-800/60">
            <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Matriks Jam Tayang Aktif yang Akan Dikirim ke YouTube API</span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {DAYS_LIST.map((day) => {
                const hourVal = scheduleMode === 'SAME_ALL_DAYS' ? singleTime : daySchedule[day.key] || '16:00';
                return (
                  <div key={day.key} className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800">
                    <div className="text-[10px] font-bold text-neutral-400">{day.badge}</div>
                    <div className="text-[11px] font-mono font-bold text-red-400 mt-0.5">{hourVal}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 z-20 flex items-center justify-between px-5 py-3.5 bg-neutral-950 border-t border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSavedSuccess}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-900/40 transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {isSavedSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>Tersimpan!</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 text-white" />
                <span>Simpan Konfigurasi Jam</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
