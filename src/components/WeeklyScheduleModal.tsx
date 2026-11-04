import React, { useState, useEffect } from 'react';
import { Clock, Calendar, Check, X, Sparkles, CheckCircle2, ShieldCheck, Settings2 } from 'lucide-react';
import { Channel, DayScheduleConfig } from '../types/index.ts';
import {
  DEFAULT_DAY_SCHEDULE,
  DEFAULT_WEEKLY_SCHEDULE,
  DAY_KEYS,
  getChannelDaySchedule,
  saveChannelDaySchedule,
} from '../utils/dayScheduleUtils.ts';

export interface WeeklyScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
  channelTitle?: string;
  channel?: Channel;
  onScheduleSaved?: (newConfig: DayScheduleConfig, useGlobal: boolean) => void;
}

const DAYS_LIST: Array<{ key: keyof DayScheduleConfig; dayIndex: number; label: string; badge: string; color: string }> = [
  { key: 'senin', dayIndex: 1, label: 'Senin', badge: 'Sen', color: 'border-blue-500/40 text-blue-300' },
  { key: 'selasa', dayIndex: 2, label: 'Selasa', badge: 'Sel', color: 'border-sky-500/40 text-sky-300' },
  { key: 'rabu', dayIndex: 3, label: 'Rabu', badge: 'Rab', color: 'border-emerald-500/40 text-emerald-300' },
  { key: 'kamis', dayIndex: 4, label: 'Kamis', badge: 'Kam', color: 'border-amber-500/40 text-amber-300' },
  { key: 'jumat', dayIndex: 5, label: 'Jumat', badge: 'Jum', color: 'border-orange-500/40 text-orange-300' },
  { key: 'sabtu', dayIndex: 6, label: 'Sabtu', badge: 'Sab', color: 'border-purple-500/40 text-purple-300' },
  { key: 'minggu', dayIndex: 0, label: 'Minggu', badge: 'Min', color: 'border-rose-500/40 text-rose-300' },
];

export const WeeklyScheduleModal: React.FC<WeeklyScheduleModalProps> = ({
  isOpen,
  onClose,
  channelId,
  channelTitle,
  channel,
  onScheduleSaved,
}) => {
  const [useGlobalPreset, setUseGlobalPreset] = useState<boolean>(true);
  const [daySchedule, setDaySchedule] = useState<DayScheduleConfig>({ ...DEFAULT_DAY_SCHEDULE });
  const [isSavedSuccess, setIsSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen && channelId) {
      setIsSavedSuccess(false);
      const cleanId = channelId.replace(/^chan-/, '');

      // 1. Tentukan apakah channel memakai Preset Global atau Kustom Override
      let isGlobal = true;
      if (channel && typeof channel.useGlobalPreset === 'boolean') {
        isGlobal = channel.useGlobalPreset;
      } else if (typeof window !== 'undefined') {
        const storedGlobal = localStorage.getItem(`amg_use_global_preset_${cleanId}`);
        if (storedGlobal === 'false') {
          isGlobal = false;
        } else if (storedGlobal === 'true') {
          isGlobal = true;
        }
      }
      setUseGlobalPreset(isGlobal);

      // 2. Ambil jadwal harian yang tersimpan
      const existing = getChannelDaySchedule(channel || channelId);
      setDaySchedule(existing);
    }
  }, [isOpen, channelId, channel]);

  if (!isOpen) return null;

  const handleDayTimeChange = (dayKey: keyof DayScheduleConfig, val: string) => {
    setDaySchedule((prev) => ({
      ...prev,
      [dayKey]: val,
    }));
  };

  const handleApplyTimeToAll = (val: string) => {
    setDaySchedule({
      senin: val,
      selasa: val,
      rabu: val,
      kamis: val,
      jumat: val,
      sabtu: val,
      minggu: val,
    });
  };

  const handleSave = () => {
    const finalSchedule: DayScheduleConfig = useGlobalPreset
      ? { ...DEFAULT_DAY_SCHEDULE }
      : daySchedule;

    const customWeekly: Record<number, string> = useGlobalPreset
      ? { ...DEFAULT_WEEKLY_SCHEDULE }
      : {
          0: daySchedule.minggu,
          1: daySchedule.senin,
          2: daySchedule.selasa,
          3: daySchedule.rabu,
          4: daySchedule.kamis,
          5: daySchedule.jumat,
          6: daySchedule.sabtu,
        };

    saveChannelDaySchedule(
      channelId,
      finalSchedule,
      useGlobalPreset ? 'SAME_ALL_DAYS' : 'DIFFERENT_PER_DAY',
      customWeekly,
      useGlobalPreset
    );

    setIsSavedSuccess(true);
    onScheduleSaved?.(finalSchedule, useGlobalPreset);

    setTimeout(() => {
      setIsSavedSuccess(false);
      onClose();
    }, 600);
  };

  const QUICK_TIMES = ['10:00', '12:00', '14:00', '14:30', '15:00', '15:30', '16:00', '18:00', '20:00'];

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
                Channel: <span className="font-semibold text-neutral-200">{channelTitle || channel?.title || channelId}</span>
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
          <div className="space-y-2.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Pilih Metode Pengaturan Jam Tayang
            </label>
            <div className="grid grid-cols-1 gap-3">
              {/* Opsi 1: Preset Standar Global (Otomatis Analitik) */}
              <button
                type="button"
                onClick={() => setUseGlobalPreset(true)}
                className={`p-4 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  useGlobalPreset
                    ? 'bg-red-950/40 border-red-600/70 text-white shadow-md shadow-red-950/30 ring-1 ring-red-500/50'
                    : 'bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs sm:text-sm text-neutral-100">
                      Opsi 1: Gunakan Preset Standar Global (Direkomendasikan)
                    </span>
                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                      Otomatis Analitik
                    </span>
                  </div>
                  {useGlobalPreset && (
                    <span className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      ✓
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-400 mt-2 leading-relaxed">
                  Otomatis menggunakan jam puncak analitik penonton: <strong className="text-neutral-200">Min (15.00) | Sen-Kam (16.00) | Jum (14.30) | Sab (15.30) WIB</strong>.
                </p>
                {useGlobalPreset && (
                  <div className="mt-3 pt-2.5 border-t border-neutral-800/80 flex items-center gap-2 text-[11px] text-emerald-400">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Preset Global Aktif: Jam tayang terkunci pada jam analitik optimal penonton. Form input manual disembunyikan.</span>
                  </div>
                )}
              </button>

              {/* Opsi 2: Atur Jam Berbeda Per Hari (Kustom Override Mandiri) */}
              <button
                type="button"
                onClick={() => setUseGlobalPreset(false)}
                className={`p-4 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  !useGlobalPreset
                    ? 'bg-red-950/40 border-red-600/70 text-white shadow-md shadow-red-950/30 ring-1 ring-red-500/50'
                    : 'bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs sm:text-sm text-neutral-100">
                      Opsi 2: Atur Jam Berbeda Per Hari (Kustom Override)
                    </span>
                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800/60">
                      Kustom Override
                    </span>
                  </div>
                  {!useGlobalPreset && (
                    <span className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      ✓
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-400 mt-2 leading-relaxed">
                  Kustomisasi jam tayang bebas dan spesifik untuk masing-masing hari pada channel ini.
                </p>
                {!useGlobalPreset && (
                  <div className="mt-3 pt-2.5 border-t border-neutral-800/80 flex items-center gap-2 text-[11px] text-amber-400">
                    <Settings2 className="w-4 h-4 shrink-0" />
                    <span>Kustom Override Mandiri: Nilai terisolasi murni untuk channel ini dan tidak mengubah channel lain.</span>
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Perilaku Saat Opsi 1 Aktif: Sembunyikan form input jam manual! */}
          {/* Perilaku Saat Opsi 2 Aktif: Tampilkan form input jam Senin s/d Minggu */}
          {!useGlobalPreset && (
            <div className="space-y-3.5 p-4 rounded-xl bg-neutral-950/80 border border-neutral-800/80 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-red-400" />
                  <span>Input Jam Tayang Bebas (Senin – Minggu)</span>
                </label>
                <span className="text-[11px] font-mono text-neutral-400">Zona Waktu: WIB (UTC+7)</span>
              </div>

              {/* Quick apply toolbar */}
              <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800/80 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-neutral-400 font-medium mr-1">Terapkan ke Semua Hari:</span>
                {QUICK_TIMES.map((qt) => (
                  <button
                    key={qt}
                    type="button"
                    onClick={() => handleApplyTimeToAll(qt)}
                    className="px-2 py-0.5 rounded text-[11px] font-mono bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700/60 transition cursor-pointer"
                  >
                    {qt}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {DAYS_LIST.map((day) => (
                  <div
                    key={day.key}
                    className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700 flex items-center justify-between transition"
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
                        className="bg-neutral-950 text-neutral-100 font-mono font-semibold text-xs px-2.5 py-1.5 rounded-lg border border-neutral-700 focus:border-red-500 focus:outline-none"
                      />
                      <span className="text-[10px] font-bold text-neutral-500 font-mono">WIB</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matriks Jam Tayang Aktif yang Akan Dikirim ke YouTube API */}
          <div className="p-4 rounded-xl bg-neutral-950/60 border border-neutral-800/80 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Matriks Jam Tayang Aktif yang Akan Dikirim ke YouTube API</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                useGlobalPreset
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                  : 'bg-amber-950/80 text-amber-300 border-amber-800/60'
              }`}>
                {useGlobalPreset ? 'Preset Standar Global' : 'Kustom Override Channel'}
              </span>
            </div>

            <div className="grid grid-cols-7 gap-1.5 text-center pt-1">
              {DAYS_LIST.map((day) => {
                const hourVal = useGlobalPreset
                  ? DEFAULT_WEEKLY_SCHEDULE[day.dayIndex]
                  : daySchedule[day.key] || '16:00';

                return (
                  <div key={day.key} className="p-2 rounded-lg bg-neutral-900 border border-neutral-800">
                    <div className="text-[10px] font-bold text-neutral-400">{day.badge}</div>
                    <div className="text-xs font-mono font-bold text-red-400 mt-0.5">{hourVal}</div>
                    <div className="text-[9px] text-neutral-500 font-mono">WIB</div>
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
