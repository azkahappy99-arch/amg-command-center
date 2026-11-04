import { Channel, DayScheduleConfig, ScheduleTimeMode } from '../types/index.ts';
import { safeSetItem } from './videoStorage.ts';

export type { DayScheduleConfig, ScheduleTimeMode };

export const DAY_KEYS = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'] as const;

export const DAY_NAMES_ID: Record<keyof DayScheduleConfig, string> = {
  senin: 'Senin',
  selasa: 'Selasa',
  rabu: 'Rabu',
  kamis: 'Kamis',
  jumat: 'Jumat',
  sabtu: 'Sabtu',
  minggu: 'Minggu',
};

export const DEFAULT_WEEKLY_SCHEDULE: Record<number, string> = {
  0: '15:00', // Minggu -> 15.00 WIB
  1: '16:00', // Senin  -> 16.00 WIB
  2: '16:00', // Selasa -> 16.00 WIB
  3: '16:00', // Rabu   -> 16.00 WIB
  4: '16:00', // Kamis  -> 16.00 WIB
  5: '14:30', // Jumat  -> 14.30 WIB
  6: '15:30', // Sabtu  -> 15.30 WIB
};

export const GLOBAL_WEEKLY_SCHEDULE: Record<number, string> = DEFAULT_WEEKLY_SCHEDULE;

export const DEFAULT_DAY_SCHEDULE: DayScheduleConfig = {
  minggu: '15:00',
  senin: '16:00',
  selasa: '16:00',
  rabu: '16:00',
  kamis: '16:00',
  jumat: '14:30',
  sabtu: '15:30',
};

/**
 * Logika Penentuan Jam PublishAt (Hierarki Fallback Cerdas):
 * const day = targetDate.getDay(); // 0 (Min) s/d 6 (Sab)
 * const isGlobal = activeChannel?.useGlobalPreset ?? true;
 * const finalPublishTime = (!isGlobal && activeChannel?.customWeeklySchedule?.[day])
 *   ? activeChannel.customWeeklySchedule[day]
 *   : DEFAULT_WEEKLY_SCHEDULE[day];
 */
export function resolveTargetDayPublishTime(
  targetDay: number,
  channel?: Channel | null,
  dayConfig?: DayScheduleConfig | null
): string {
  // 1. Jika channel eksplisit memilih Preset Standar Global
  if (channel?.useGlobalPreset === true) {
    return DEFAULT_WEEKLY_SCHEDULE[targetDay] || '16:00';
  }

  // 2. Jika channel eksplisit memilih Kustom Override Mandiri
  if (channel?.useGlobalPreset === false) {
    if (channel.customWeeklySchedule && channel.customWeeklySchedule[targetDay]) {
      return channel.customWeeklySchedule[targetDay];
    }
    const dayKey = DAY_KEYS[targetDay];
    if (channel.dayScheduleConfig && channel.dayScheduleConfig[dayKey]) {
      return channel.dayScheduleConfig[dayKey];
    }
    if (dayConfig && dayConfig[dayKey]) {
      return dayConfig[dayKey];
    }
    return DEFAULT_WEEKLY_SCHEDULE[targetDay] || '16:00';
  }

  // 3. Jika useGlobalPreset tidak eksplisit (fallback backward compatibility):
  // Cek kustomisasi spesifik pada channel atau parameter dayConfig
  if (channel?.customWeeklySchedule && channel.customWeeklySchedule[targetDay]) {
    return channel.customWeeklySchedule[targetDay];
  }
  const dayKey = DAY_KEYS[targetDay];
  if (channel?.dayScheduleConfig && channel.dayScheduleConfig[dayKey]) {
    return channel.dayScheduleConfig[dayKey];
  }
  if (dayConfig && dayConfig[dayKey] && dayConfig !== DEFAULT_DAY_SCHEDULE) {
    return dayConfig[dayKey];
  }

  // Standar Global Terkunci (Preset Analitik Penonton)
  return DEFAULT_WEEKLY_SCHEDULE[targetDay] || '16:00';
}

/**
 * Mengambil jam & menit dalam zona waktu Asia/Jakarta (WIB) berformat "HH:mm"
 */
export function getWibTimeString(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '16:00';
    const wibDate = new Date(d.getTime() + 7 * 60 * 60 * 1000);
    const hh = String(wibDate.getUTCHours()).padStart(2, '0');
    const mm = String(wibDate.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '16:00';
  }
}

/**
 * Mengambil konfigurasi jadwal harian untuk channel tertentu
 * - Jika channel.useGlobalPreset !== false (default): Merujuk ke DEFAULT_DAY_SCHEDULE / DEFAULT_WEEKLY_SCHEDULE
 * - Jika channel.useGlobalPreset === false: Merujuk ke customWeeklySchedule atau dayScheduleConfig channel
 */
export function getChannelDaySchedule(channelOrId?: Channel | string | null): DayScheduleConfig {
  if (!channelOrId) return { ...DEFAULT_DAY_SCHEDULE };

  // 1. Cek dari objek channel langsung
  if (typeof channelOrId === 'object') {
    const isGlobal = channelOrId.useGlobalPreset === true
      ? true
      : channelOrId.useGlobalPreset === false
      ? false
      : !(channelOrId.customWeeklySchedule || channelOrId.dayScheduleConfig);
    if (isGlobal) {
      return { ...DEFAULT_DAY_SCHEDULE };
    }

    if (channelOrId.customWeeklySchedule) {
      return {
        minggu: channelOrId.customWeeklySchedule[0] || DEFAULT_DAY_SCHEDULE.minggu,
        senin: channelOrId.customWeeklySchedule[1] || DEFAULT_DAY_SCHEDULE.senin,
        selasa: channelOrId.customWeeklySchedule[2] || DEFAULT_DAY_SCHEDULE.selasa,
        rabu: channelOrId.customWeeklySchedule[3] || DEFAULT_DAY_SCHEDULE.rabu,
        kamis: channelOrId.customWeeklySchedule[4] || DEFAULT_DAY_SCHEDULE.kamis,
        jumat: channelOrId.customWeeklySchedule[5] || DEFAULT_DAY_SCHEDULE.jumat,
        sabtu: channelOrId.customWeeklySchedule[6] || DEFAULT_DAY_SCHEDULE.sabtu,
      };
    }

    if (channelOrId.dayScheduleConfig) {
      return { ...DEFAULT_DAY_SCHEDULE, ...channelOrId.dayScheduleConfig };
    }
    if (channelOrId.scheduleConfig?.dayScheduleConfig) {
      return { ...DEFAULT_DAY_SCHEDULE, ...channelOrId.scheduleConfig.dayScheduleConfig };
    }
  }

  // 2. Cek dari localStorage berdasarkan ID
  const chanId = typeof channelOrId === 'string' ? channelOrId : channelOrId?.id || channelOrId?.youtubeChannelId || '';
  if (chanId && typeof window !== 'undefined') {
    try {
      const cleanId = chanId.replace(/^chan-/, '');
      const rawGlobal = localStorage.getItem(`amg_use_global_preset_${cleanId}`);
      if (rawGlobal === 'true') {
        return { ...DEFAULT_DAY_SCHEDULE };
      }

      if (rawGlobal === 'false') {
        const rawCustom = localStorage.getItem(`amg_custom_weekly_${cleanId}`);
        if (rawCustom) {
          const parsed = JSON.parse(rawCustom);
          if (parsed && typeof parsed === 'object') {
            return {
              minggu: parsed[0] || DEFAULT_DAY_SCHEDULE.minggu,
              senin: parsed[1] || DEFAULT_DAY_SCHEDULE.senin,
              selasa: parsed[2] || DEFAULT_DAY_SCHEDULE.selasa,
              rabu: parsed[3] || DEFAULT_DAY_SCHEDULE.rabu,
              kamis: parsed[4] || DEFAULT_DAY_SCHEDULE.kamis,
              jumat: parsed[5] || DEFAULT_DAY_SCHEDULE.jumat,
              sabtu: parsed[6] || DEFAULT_DAY_SCHEDULE.sabtu,
            };
          }
        }
      }

      const raw =
        localStorage.getItem(`amg_day_schedule_${chanId}`) ||
        localStorage.getItem(`amg_day_schedule_${cleanId}`) ||
        localStorage.getItem(`amg_day_schedule_chan-${cleanId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_DAY_SCHEDULE, ...parsed };
        }
      }
    } catch {}
  }

  return { ...DEFAULT_DAY_SCHEDULE };
}

/**
 * Menyimpan konfigurasi jadwal harian ke localStorage dan channel
 * Menyelaraskan opsi Preset Global (useGlobalPreset = true) vs Kustom Override Mandiri (useGlobalPreset = false)
 */
export function saveChannelDaySchedule(
  channelId: string,
  config: DayScheduleConfig,
  modeOrUseGlobal: ScheduleTimeMode | boolean = true,
  customWeeklyParam?: Record<number, string>,
  explicitUseGlobal?: boolean
): void {
  if (!channelId || typeof window === 'undefined') return;
  const cleanId = channelId.replace(/^chan-/, '');

  const useGlobal: boolean =
    typeof explicitUseGlobal === 'boolean'
      ? explicitUseGlobal
      : typeof modeOrUseGlobal === 'boolean'
      ? modeOrUseGlobal
      : false;

  const mode: ScheduleTimeMode =
    typeof modeOrUseGlobal === 'string'
      ? modeOrUseGlobal
      : useGlobal
      ? 'SAME_ALL_DAYS'
      : 'DIFFERENT_PER_DAY';

  // Siapkan customWeekly mapping (0=Min .. 6=Sab)
  const customWeekly: Record<number, string> =
    customWeeklyParam || {
      0: config.minggu,
      1: config.senin,
      2: config.selasa,
      3: config.rabu,
      4: config.kamis,
      5: config.jumat,
      6: config.sabtu,
    };

  try {
    const configStr = JSON.stringify(useGlobal ? DEFAULT_DAY_SCHEDULE : config);
    const customWeeklyStr = JSON.stringify(useGlobal ? DEFAULT_WEEKLY_SCHEDULE : customWeekly);

    safeSetItem(`amg_day_schedule_${channelId}`, configStr);
    safeSetItem(`amg_day_schedule_${cleanId}`, configStr);
    safeSetItem(`amg_day_schedule_chan-${cleanId}`, configStr);
    safeSetItem(`amg_day_schedule_mode_${cleanId}`, mode);
    safeSetItem(`amg_use_global_preset_${cleanId}`, String(useGlobal));
    safeSetItem(`amg_custom_weekly_${cleanId}`, customWeeklyStr);

    // Update juga di amg_persistent_channels dan amg_channels
    const keys = ['amg_persistent_channels', 'amg_channels'];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const channels = JSON.parse(raw);
          if (Array.isArray(channels)) {
            const idx = channels.findIndex(
              (c: Channel) =>
                c.id === channelId ||
                c.youtubeChannelId === cleanId ||
                c.id === `chan-${cleanId}`
            );
            if (idx >= 0) {
              channels[idx].useGlobalPreset = useGlobal;
              channels[idx].dayScheduleConfig = useGlobal ? { ...DEFAULT_DAY_SCHEDULE } : config;
              channels[idx].customWeeklySchedule = useGlobal ? { ...DEFAULT_WEEKLY_SCHEDULE } : customWeekly;
              channels[idx].scheduleTimeMode = mode;
              if (channels[idx].scheduleConfig) {
                channels[idx].scheduleConfig!.dayScheduleConfig = channels[idx].dayScheduleConfig;
                channels[idx].scheduleConfig!.scheduleTimeMode = mode;
              }
              // Set display publishTime
              channels[idx].publishTime = useGlobal
                ? 'Preset Standar Global (Analitik)'
                : 'Kustom Harian';

              safeSetItem(key, JSON.stringify(channels));
            }
          }
        } catch {}
      }
    }
  } catch (err) {
    console.warn('[DayScheduleUtils] Error saving day schedule:', err);
  }
}

/**
 * Mengambil komponen tanggal (Tahun, Bulan 0-index, Tanggal) dalam zona waktu WIB (UTC+7)
 */
export function getWibCalendarComponents(isoOrDate: string | Date): { year: number; month: number; day: number } {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  // Tambah 7 jam ke timestamp UTC untuk menyelaraskan dengan WIB
  const wibTime = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return {
    year: wibTime.getUTCFullYear(),
    month: wibTime.getUTCMonth(),
    day: wibTime.getUTCDate(),
  };
}

/**
 * Menghitung ISO string resmi publishAt YouTube API untuk tanggal target tertentu dengan jam hari tersebut
 */
export function createWibPublishAt(
  year: number,
  month: number,
  day: number,
  timeHhMm: string
): string {
  const [hhStr, mmStr] = (timeHhMm || '16:00').split(':');
  const hh = (hhStr || '16').padStart(2, '0');
  const mm = (mmStr || '00').padStart(2, '0');
  const yyyy = String(year);
  const MM = String(month + 1).padStart(2, '0');
  const DD = String(day).padStart(2, '0');

  // Format ISO dengan offset +07:00 (WIB)
  const isoLocalWib = `${yyyy}-${MM}-${DD}T${hh}:${mm}:00+07:00`;
  return new Date(isoLocalWib).toISOString();
}

/**
 * Menghasilkan deretan slot jadwal berurutan bertahap +1 hari:
 * - Titik awal: (Titik Acuan Terjauh + 1 Hari) atau Besok jika belum ada jadwal.
 * - Hari target: Dapatkan hari dari tanggal target jadwal (0 = Minggu, 1 = Senin, dst.).
 * - Jam tayang: Hierarki cerdas (Kustom per channel -> Preset Global).
 * - ISO string: Dihasilkan sesuai zona waktu Asia/Jakarta (WIB) berakhiran 'Z' UTC.
 */
export function generateSequentialSchedulesWithDayConfig(
  count: number,
  anchorIsoDate: string | null,
  daySchedule?: DayScheduleConfig,
  channel?: Channel | null
): string[] {
  const schedule = daySchedule || (channel ? getChannelDaySchedule(channel) : DEFAULT_DAY_SCHEDULE);
  const results: string[] = [];

  let startYear: number;
  let startMonth: number;
  let startDay: number;

  if (anchorIsoDate) {
    const anchorDate = new Date(anchorIsoDate);
    if (!isNaN(anchorDate.getTime())) {
      // Dapatkan tanggal WIB dari titik acuan terjauh
      const anchorComp = getWibCalendarComponents(anchorDate);
      // Mulai dari (Titik Acuan Terjauh + 1 Hari)
      const startDate = new Date(Date.UTC(anchorComp.year, anchorComp.month, anchorComp.day + 1));
      startYear = startDate.getUTCFullYear();
      startMonth = startDate.getUTCMonth();
      startDay = startDate.getUTCDate();
    } else {
      const nowComp = getWibCalendarComponents(new Date());
      const startDate = new Date(Date.UTC(nowComp.year, nowComp.month, nowComp.day + 1));
      startYear = startDate.getUTCFullYear();
      startMonth = startDate.getUTCMonth();
      startDay = startDate.getUTCDate();
    }
  } else {
    // TIDAK ADA video terjadwal: Jadwalkan video pertama mulai BESOK (Hari Ini + 1 Hari)
    const nowComp = getWibCalendarComponents(new Date());
    const startDate = new Date(Date.UTC(nowComp.year, nowComp.month, nowComp.day + 1));
    startYear = startDate.getUTCFullYear();
    startMonth = startDate.getUTCMonth();
    startDay = startDate.getUTCDate();
  }

  for (let i = 0; i < count; i++) {
    // Kalender hari ke-i
    const currentCalendarDate = new Date(Date.UTC(startYear, startMonth, startDay + i));
    const targetDay = currentCalendarDate.getUTCDay(); // 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
    const timeForDay = resolveTargetDayPublishTime(targetDay, channel, schedule);

    const y = currentCalendarDate.getUTCFullYear();
    const m = currentCalendarDate.getUTCMonth();
    const d = currentCalendarDate.getUTCDate();

    const isoPublishAt = createWibPublishAt(y, m, d, timeForDay);
    results.push(isoPublishAt);
  }

  return results;
}

/**
 * Memformat ISO date string ke representasi tanggal & jam WIB
 */
export function formatWibDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' WIB';
  } catch {
    return isoString;
  }
}

