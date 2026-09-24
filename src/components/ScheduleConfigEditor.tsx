import React, { useState, useEffect } from 'react';
import { Clock, Calendar, Globe, Plus, Trash2, CheckCircle2, AlertTriangle, ArrowRight, Zap, Info } from 'lucide-react';
import { ScheduleConfig, ScheduleMode } from '../types/index.ts';

interface ScheduleConfigEditorProps {
  value: ScheduleConfig;
  onChange: (updated: ScheduleConfig) => void;
  disabled?: boolean;
  isProfileInherited?: boolean;
  onToggleUseProfile?: (useProfile: boolean) => void;
  profileScheduleConfig?: ScheduleConfig;
}

const COMMON_TIMEZONES = [
  { value: 'Asia/Jakarta', label: 'Asia/Jakarta (WIB — UTC+7)', badge: 'WIB' },
  { value: 'Asia/Makassar', label: 'Asia/Makassar (WITA — UTC+8)', badge: 'WITA' },
  { value: 'Asia/Jayapura', label: 'Asia/Jayapura (WIT — UTC+9)', badge: 'WIT' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT — UTC+8)', badge: 'SGT' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)', badge: 'UTC' },
  { value: 'America/New_York', label: 'America/New_York (US Eastern)', badge: 'EST/EDT' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)', badge: 'GMT' },
];

const PRESET_TIME_TEMPLATES: Record<number, string[][]> = {
  1: [['16:00'], ['19:00'], ['12:00']],
  2: [
    ['08:00', '20:00'],
    ['09:00', '18:00'],
    ['12:00', '21:00'],
  ],
  3: [
    ['08:00', '14:00', '20:00'],
    ['09:00', '15:00', '21:00'],
    ['07:00', '13:00', '19:00'],
  ],
  4: [
    ['08:00', '12:00', '16:00', '20:00'],
    ['07:00', '11:00', '15:00', '19:00'],
  ],
  5: [
    ['06:00', '10:00', '14:00', '18:00', '22:00'],
    ['07:00', '11:00', '15:00', '19:00', '23:00'],
  ],
  6: [
    ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'],
    ['08:00', '11:00', '14:00', '17:00', '20:00', '23:00'],
  ],
};

export const ScheduleConfigEditor: React.FC<ScheduleConfigEditorProps> = ({
  value,
  onChange,
  disabled = false,
  isProfileInherited = false,
  onToggleUseProfile,
  profileScheduleConfig,
}) => {
  const [mode, setMode] = useState<ScheduleMode>(value.mode || 'CUSTOM_DAILY_TIMES');
  const [videosPerDay, setVideosPerDay] = useState<number>(value.videosPerDay || (value.times?.length || 1));
  const [times, setTimes] = useState<string[]>(value.times?.length ? value.times : ['16:00']);
  const [timezone, setTimezone] = useState<string>(value.timezone || 'Asia/Jakarta');
  const [intervalHours, setIntervalHours] = useState<number>(value.intervalHours || 4);
  const [intervalStartTime, setIntervalStartTime] = useState<string>(value.intervalStartTime || '08:00');
  const [activeDays, setActiveDays] = useState<number[]>(value.advancedConfig?.activeDaysOfWeek || [1, 2, 3, 4, 5, 6, 0]);

  // Keep state synchronized with prop changes
  useEffect(() => {
    setMode(value.mode || 'CUSTOM_DAILY_TIMES');
    setVideosPerDay(value.videosPerDay || (value.times?.length || 1));
    setTimes(value.times?.length ? value.times : ['16:00']);
    setTimezone(value.timezone || 'Asia/Jakarta');
    if (value.intervalHours) setIntervalHours(value.intervalHours);
    if (value.intervalStartTime) setIntervalStartTime(value.intervalStartTime);
    if (value.advancedConfig?.activeDaysOfWeek) setActiveDays(value.advancedConfig.activeDaysOfWeek);
  }, [value]);

  const emitChange = (updates: Partial<ScheduleConfig>) => {
    const updated: ScheduleConfig = {
      mode: updates.mode !== undefined ? updates.mode : mode,
      videosPerDay: updates.videosPerDay !== undefined ? updates.videosPerDay : videosPerDay,
      times: updates.times !== undefined ? updates.times : times,
      timezone: updates.timezone !== undefined ? updates.timezone : timezone,
      startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
      intervalHours: updates.intervalHours !== undefined ? updates.intervalHours : intervalHours,
      intervalStartTime: updates.intervalStartTime !== undefined ? updates.intervalStartTime : intervalStartTime,
      advancedConfig: {
        activeDaysOfWeek: activeDays,
      },
    };
    onChange(updated);
  };

  const handleFrequencyChange = (freq: number) => {
    const newFreq = Math.max(1, Math.min(24, freq));
    setVideosPerDay(newFreq);

    // Adjust times array
    let newTimes = [...times];
    if (PRESET_TIME_TEMPLATES[newFreq]?.[0]) {
      newTimes = [...PRESET_TIME_TEMPLATES[newFreq][0]];
    } else if (newTimes.length < newFreq) {
      // Add more times staggered
      while (newTimes.length < newFreq) {
        const last = newTimes[newTimes.length - 1] || '08:00';
        const [h, m] = last.split(':').map(Number);
        const nextH = (h + 3) % 24;
        newTimes.push(`${String(nextH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    } else if (newTimes.length > newFreq) {
      newTimes = newTimes.slice(0, newFreq);
    }

    newTimes.sort();
    setTimes(newTimes);

    const newMode: ScheduleMode = newFreq === 1 ? 'DAILY' : 'CUSTOM_DAILY_TIMES';
    setMode(newMode);

    emitChange({
      mode: newMode,
      videosPerDay: newFreq,
      times: newTimes,
    });
  };

  const handleAddTime = () => {
    const last = times[times.length - 1] || '12:00';
    const [h, m] = last.split(':').map(Number);
    const nextH = (h + 2) % 24;
    const newTime = `${String(nextH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const newTimes = [...times, newTime].sort();
    const newFreq = newTimes.length;
    setTimes(newTimes);
    setVideosPerDay(newFreq);
    emitChange({
      times: newTimes,
      videosPerDay: newFreq,
      mode: 'CUSTOM_DAILY_TIMES',
    });
  };

  const handleRemoveTime = (index: number) => {
    if (times.length <= 1) return;
    const newTimes = times.filter((_, i) => i !== index);
    const newFreq = newTimes.length;
    setTimes(newTimes);
    setVideosPerDay(newFreq);
    emitChange({
      times: newTimes,
      videosPerDay: newFreq,
      mode: newFreq === 1 ? 'DAILY' : 'CUSTOM_DAILY_TIMES',
    });
  };

  const handleTimeChange = (index: number, newTimeValue: string) => {
    const newTimes = [...times];
    newTimes[index] = newTimeValue;
    setTimes(newTimes);
    emitChange({ times: newTimes });
  };

  const handleApplyPreset = (preset: string[]) => {
    setTimes(preset);
    setVideosPerDay(preset.length);
    emitChange({
      times: preset,
      videosPerDay: preset.length,
      mode: preset.length === 1 ? 'DAILY' : 'CUSTOM_DAILY_TIMES',
    });
  };

  // Validation
  const hasDuplicateTimes = new Set(times).size !== times.length;
  const hasEmptyTimes = times.some((t) => !t || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t));
  const isValid = !hasDuplicateTimes && !hasEmptyTimes && times.length > 0;

  // Day of week labels
  const daysOfWeek = [
    { id: 1, label: 'Sen' },
    { id: 2, label: 'Sel' },
    { id: 3, label: 'Rab' },
    { id: 4, label: 'Kam' },
    { id: 5, label: 'Jum' },
    { id: 6, label: 'Sab' },
    { id: 0, label: 'Min' },
  ];

  return (
    <div className="space-y-6">
      {/* Informative Note regarding customization */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-semibold text-amber-300">
            "1 Video / Hari @ 16:00 WIB" hanyalah contoh bawaan.
          </p>
          <p className="text-zinc-400">
            AMG mendukung kustomisasi penuh: pilih frekuensi penerbitan apa pun (1 hingga 6+ video/hari), atur waktu publikasi presisi yang berbeda, dan tetapkan zona waktu per channel.
          </p>
        </div>
      </div>

      {/* Profile Inheritance Switch (if channel context) */}
      {onToggleUseProfile && profileScheduleConfig && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-zinc-200">Pewarisan Jadwal Profil Konten</h4>
            <p className="text-xs text-zinc-400">
              {isProfileInherited
                ? `Saat ini menggunakan jadwal Profil (${profileScheduleConfig.videosPerDay} video/hari @ ${profileScheduleConfig.times?.join(', ')} ${profileScheduleConfig.timezone})`
                : 'Mengesampingkan profil dengan aturan jadwal khusus channel.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onToggleUseProfile(!isProfileInherited)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              isProfileInherited
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30'
            }`}
          >
            {isProfileInherited ? 'GUNAKAN STANDAR PROFIL' : 'KUSTOMISASI JADWAL KHUSUS'}
          </button>
        </div>
      )}

      {(!isProfileInherited || !onToggleUseProfile) && (
        <>
          {/* Mode Selector */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Mode Jadwal
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'DAILY', label: 'Harian (1x)', desc: '1 video per hari' },
                { id: 'CUSTOM_DAILY_TIMES', label: 'Multi Jam Harian', desc: 'Beberapa jam eksplisit' },
                { id: 'CUSTOM_INTERVAL', label: 'Interval Berkala', desc: 'Setiap X jam sekali' },
                { id: 'ADVANCED_CUSTOM', label: 'Tingkat Lanjut', desc: 'Pilihan hari & jeda' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const newMode = m.id as ScheduleMode;
                    setMode(newMode);
                    if (newMode === 'DAILY') {
                      handleFrequencyChange(1);
                    } else if (newMode === 'CUSTOM_DAILY_TIMES' && videosPerDay === 1) {
                      handleFrequencyChange(3);
                    } else {
                      emitChange({ mode: newMode });
                    }
                  }}
                  className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                    mode === m.id
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-200 ring-1 ring-rose-500/30'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
                  }`}
                >
                  <div className="text-xs font-bold">{m.label}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Frequency (Videos per Day) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Frekuensi Publikasi (Video / Hari)
              </label>
              <span className="text-xs font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                {videosPerDay} Video per Hari
              </span>
            </div>

            {/* Quick Frequency Buttons */}
            <div className="flex flex-wrap gap-2 mb-3">
              {[1, 2, 3, 4, 5, 6].map((freq) => (
                <button
                  key={freq}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleFrequencyChange(freq)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                    videosPerDay === freq
                      ? 'bg-rose-600 text-white border-rose-500 shadow-sm shadow-rose-900/40'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  <span>{freq} / hari</span>
                </button>
              ))}

              {/* Custom Number input */}
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 focus-within:border-rose-500">
                <span className="text-xs text-zinc-400">Kustom:</span>
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={videosPerDay}
                  onChange={(e) => handleFrequencyChange(parseInt(e.target.value, 10) || 1)}
                  disabled={disabled}
                  className="w-12 bg-transparent text-xs text-zinc-100 font-bold focus:outline-none"
                />
                <span className="text-xs text-zinc-500">/hari</span>
              </div>
            </div>
          </div>

          {/* Timezone Configuration */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              <Globe className="w-3.5 h-3.5 inline mr-1 text-zinc-400" />
              Zona Waktu Channel Target
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={timezone}
                onChange={(e) => {
                  setTimezone(e.target.value);
                  emitChange({ timezone: e.target.value });
                }}
                disabled={disabled}
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-xl px-3 py-2.5 text-xs focus:border-rose-500 focus:outline-none cursor-pointer"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                {COMMON_TIMEZONES.slice(0, 3).map((tz) => (
                  <button
                    key={tz.value}
                    type="button"
                    onClick={() => {
                      setTimezone(tz.value);
                      emitChange({ timezone: tz.value });
                    }}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      timezone === tz.value
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {tz.badge}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mode-Specific: CUSTOM_INTERVAL */}
          {mode === 'CUSTOM_INTERVAL' && (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-semibold text-zinc-300">Pengaturan Interval</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Waktu Mulai (Video Pertama Hari Itu)</label>
                  <input
                    type="time"
                    value={intervalStartTime}
                    onChange={(e) => {
                      setIntervalStartTime(e.target.value);
                      emitChange({ intervalStartTime: e.target.value });
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Interval Antar Video</label>
                  <select
                    value={intervalHours}
                    onChange={(e) => {
                      const h = parseInt(e.target.value, 10);
                      setIntervalHours(h);
                      emitChange({ intervalHours: h });
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg px-3 py-2 text-xs cursor-pointer"
                  >
                    {[2, 3, 4, 5, 6, 8, 12].map((h) => (
                      <option key={h} value={h}>
                        Setiap {h} Jam
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Explicit Daily Publish Times List */}
          {mode !== 'CUSTOM_INTERVAL' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Jam Tayang Harian Dikonfigurasi ({times.length} {times.length === 1 ? 'slot' : 'slot'})
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddTime}
                    disabled={disabled}
                    className="text-xs flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1 rounded-lg border border-zinc-700 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Tambah Jam</span>
                  </button>
                </div>
              </div>

              {/* Time Slots Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {times.map((t, index) => (
                  <div
                    key={index}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between group hover:border-zinc-700 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-400 flex items-center justify-center">
                        {index + 1}
                      </span>
                      <input
                        type="time"
                        value={t}
                        onChange={(e) => handleTimeChange(index, e.target.value)}
                        disabled={disabled}
                        className="bg-zinc-800 text-zinc-100 font-mono font-semibold text-sm px-2 py-1 rounded border border-zinc-700 focus:border-rose-500 focus:outline-none"
                      />
                      <span className="text-[10px] font-bold text-zinc-500">
                        {timezone === 'Asia/Jakarta' ? 'WIB' : timezone === 'Asia/Makassar' ? 'WITA' : timezone === 'Asia/Jayapura' ? 'WIT' : timezone}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={disabled || times.length <= 1}
                      onClick={() => handleRemoveTime(index)}
                      className="text-zinc-500 hover:text-rose-400 disabled:opacity-20 p-1 transition-colors cursor-pointer"
                      title="Hapus jam tayang"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Preset Templates Shortcut */}
              {PRESET_TIME_TEMPLATES[videosPerDay] && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[11px] text-zinc-500">Preset untuk {videosPerDay}/hari:</span>
                  {PRESET_TIME_TEMPLATES[videosPerDay].map((tpl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleApplyPreset(tpl)}
                      className="text-[11px] bg-zinc-900 hover:bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-zinc-800 transition-colors font-mono cursor-pointer"
                    >
                      {tpl.join(', ')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Validation Warnings */}
          {!isValid && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-300">
                {hasDuplicateTimes && <p>• Terdeteksi duplikasi jam tayang. Setiap jam publikasi harian harus unik.</p>}
                {hasEmptyTimes && <p>• Harap tentukan jam publikasi 24 jam yang valid (JJ:mm).</p>}
              </div>
            </div>
          )}

          {/* Dynamic Schedule Preview (Weekly Matrix) */}
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-rose-400" />
                <span>Pratinjau Pola Jadwal Mingguan</span>
              </h4>
              <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                Melanjutkan mulus setelah video terjadwal YouTube terkini
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {daysOfWeek.map((day) => {
                const isActive = activeDays.includes(day.id);
                return (
                  <div
                    key={day.id}
                    className={`rounded-lg p-2 text-center border transition-all ${
                      isActive ? 'bg-zinc-800/60 border-zinc-700/60' : 'bg-zinc-900/40 border-zinc-800/40 opacity-40'
                    }`}
                  >
                    <div className="text-[11px] font-bold text-zinc-300 mb-1.5">{day.label}</div>
                    <div className="space-y-1">
                      {times.map((t, idx) => (
                        <div
                          key={idx}
                          className="text-[10px] font-mono bg-zinc-900/90 text-rose-300 border border-rose-500/20 rounded px-1 py-0.5"
                        >
                          {t}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
