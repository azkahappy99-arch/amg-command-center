import { Channel, DayScheduleConfig, ScheduleTimeMode } from '../types/index.ts';

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

export const GLOBAL_WEEKLY_SCHEDULE: Record<number, string> = {
  0: '15:00', // Minggu (Day 0)
  1: '16:00', // Senin  (Day 1)
  2: '16:00', // Selasa (Day 2)
  3: '16:00', // Rabu   (Day 3)
  4: '16:00', // Kamis  (Day 4)
  5: '14:30', // Jumat  (Day 5)
  6: '15:30', // Sabtu  (Day 6)
};

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
 * 1. Cek prioritas konfigurasi jam: channelCustomTime (customWeeklySchedule?.[targetDay] atau dayScheduleConfig)
 * 2. Fallback cerdas: GLOBAL_WEEKLY_SCHEDULE[targetDay]
 */
export function resolveTargetDayPublishTime(
  targetDay: number,
  channel?: Channel | null,
  dayConfig?: DayScheduleConfig | null
): string {
  // 1. Cek customWeeklySchedule per day index (0-6)
  if (channel?.customWeeklySchedule && channel.customWeeklySchedule[targetDay]) {
    return channel.customWeeklySchedule[targetDay];
  }

  // 2. Cek dayScheduleConfig (dari parameter atau channel)
  const dayKey = DAY_KEYS[targetDay];
  if (dayConfig && dayConfig[dayKey]) {
    return dayConfig[dayKey];
  }
  if (channel?.dayScheduleConfig && channel.dayScheduleConfig[dayKey]) {
    return channel.dayScheduleConfig[dayKey];
  }

  // 3. Fallback cerdas ke Preset Jadwal Global
  return GLOBAL_WEEKLY_SCHEDULE[targetDay] || '16:00';
}

/**
 * Mengambil konfigurasi jadwal harian untuk channel tertentu
 * Prioritas: channel.dayScheduleConfig -> localStorage('amg_day_schedule_{id}') -> DEFAULT_DAY_SCHEDULE
 */
export function getChannelDaySchedule(channelOrId?: Channel | string | null): DayScheduleConfig {
  if (!channelOrId) return { ...DEFAULT_DAY_SCHEDULE };

  // 1. Cek dari objek channel langsung
  if (typeof channelOrId === 'object') {
    if (channelOrId.dayScheduleConfig) {
      return { ...DEFAULT_DAY_SCHEDULE, ...channelOrId.dayScheduleConfig };
    }
    if (channelOrId.scheduleConfig?.dayScheduleConfig) {
      return { ...DEFAULT_DAY_SCHEDULE, ...channelOrId.scheduleConfig.dayScheduleConfig };
    }
    // Jika channel memiliki publishTime tunggal (misal '14:00')
    if (channelOrId.publishTime && /^\d{2}:\d{2}$/.test(channelOrId.publishTime)) {
      const t = channelOrId.publishTime;
      return {
        senin: t,
        selasa: t,
        rabu: t,
        kamis: t,
        jumat: t,
        sabtu: t,
        minggu: t,
      };
    }
  }

  // 2. Cek dari localStorage berdasarkan ID
  const chanId = typeof channelOrId === 'string' ? channelOrId : channelOrId?.id || channelOrId?.youtubeChannelId || '';
  if (chanId && typeof window !== 'undefined') {
    try {
      const cleanId = chanId.replace(/^chan-/, '');
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
 */
export function saveChannelDaySchedule(
  channelId: string,
  config: DayScheduleConfig,
  mode: ScheduleTimeMode = 'SAME_ALL_DAYS'
): void {
  if (!channelId || typeof window === 'undefined') return;
  const cleanId = channelId.replace(/^chan-/, '');

  try {
    const configStr = JSON.stringify(config);
    localStorage.setItem(`amg_day_schedule_${channelId}`, configStr);
    localStorage.setItem(`amg_day_schedule_${cleanId}`, configStr);
    localStorage.setItem(`amg_day_schedule_chan-${cleanId}`, configStr);
    localStorage.setItem(`amg_day_schedule_mode_${cleanId}`, mode);

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
              channels[idx].dayScheduleConfig = config;
              channels[idx].scheduleTimeMode = mode;
              if (channels[idx].scheduleConfig) {
                channels[idx].scheduleConfig!.dayScheduleConfig = config;
                channels[idx].scheduleConfig!.scheduleTimeMode = mode;
              }
              // Set display publishTime
              if (mode === 'SAME_ALL_DAYS') {
                channels[idx].publishTime = config.senin;
              } else {
                channels[idx].publishTime = 'Kustom Harian';
              }
              const customWeekly: Record<number, string> = {};
              DAY_KEYS.forEach((key, idxDay) => {
                customWeekly[idxDay] = config[key];
              });
              channels[idx].customWeeklySchedule = customWeekly;
              localStorage.setItem(key, JSON.stringify(channels));
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

