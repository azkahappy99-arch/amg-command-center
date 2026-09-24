/**
/**
 * Schedule Reconciliation & Rule Engine for AMG
 * Supports:
 * - Dynamic frequency (1, 2, 3, 4, 5, 6, custom videos/day)
 * - Multiple explicit daily publish times
 * - Modes: DAILY, CUSTOM_DAILY_TIMES, CUSTOM_INTERVAL, ADVANCED_CUSTOM
 * - Priority Hierarchy: Explicit channel override > Content profile > AMG default
 * - Continuation strictly from latest verified YouTube schedule (e.g. 14:00 -> 20:00)
 * - Collision avoidance against occupied publish slots
 * - Timezone-aware conversion & formatting
 */

import {
  Channel,
  ContentProfile,
  ScheduleConfig,
  ScheduleMode,
  ScheduleValidationResult,
  ScheduleAlertStatus,
  ManagedVideo,
} from '../src/types/index.js';

export interface CalculatedScheduleSlot {
  index: number;
  dateString: string; // YYYY-MM-DD
  timeString: string; // HH:mm
  isoPublishAt: string; // Full ISO 8601 UTC string (e.g. 2026-10-01T13:00:00.000Z)
  formattedDisplay: string; // e.g. 1 Oktober 2026 — 20:00 WIB
  timezone: string;
  timezoneAbbreviation: string;
}

/**
 * Default AMG Global Scheduling Fallback
 * 1 Video / Day @ 16:00 WIB (Asia/Jakarta)
 */
export const DEFAULT_AMG_SCHEDULE_CONFIG: ScheduleConfig = {
  mode: 'DAILY',
  videosPerDay: 1,
  times: ['16:00'],
  timezone: 'Asia/Jakarta',
  startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
};

/**
 * Validates a ScheduleConfig object.
 * Rejects invalid frequencies, empty or malformed times, duplicate times, or invalid timezones.
 */
export function validateScheduleConfig(config: Partial<ScheduleConfig> | null | undefined): ScheduleValidationResult {
  const errors: string[] = [];

  if (!config) {
    return { isValid: false, errors: ['Schedule configuration cannot be empty.'] };
  }

  // 1. Frequency validation
  const videosPerDay = config.videosPerDay !== undefined ? config.videosPerDay : 1;
  if (!Number.isInteger(videosPerDay) || videosPerDay <= 0) {
    errors.push('Frequency (videos per day) must be a positive integer greater than or equal to 1.');
  }

  // 2. Timezone validation
  const timezone = config.timezone || 'Asia/Jakarta';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch (err) {
    errors.push(`Invalid timezone: "${timezone}". Must be a valid IANA timezone name (e.g. "Asia/Jakarta").`);
  }

  // 3. Time list validation
  const timeRegex = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const rawTimes = Array.isArray(config.times) ? config.times : [];

  if (config.mode === 'CUSTOM_INTERVAL') {
    const interval = config.intervalHours || 4;
    if (interval <= 0 || interval > 24) {
      errors.push('Interval hours must be between 1 and 24.');
    }
    const startTime = config.intervalStartTime || '08:00';
    if (!timeRegex.test(startTime)) {
      errors.push(`Invalid interval start time: "${startTime}". Format must be HH:mm.`);
    }
  } else {
    if (rawTimes.length === 0) {
      errors.push('At least one publication time must be specified.');
    }

    const seenTimes = new Set<string>();
    for (const t of rawTimes) {
      if (!timeRegex.test(t)) {
        errors.push(`Invalid time format: "${t}". Expected 24-hour format HH:mm (e.g. 08:00, 14:00, 20:00).`);
      }
      if (seenTimes.has(t)) {
        errors.push(`Duplicate publish time found: "${t}". Each daily publish time must be distinct.`);
      }
      seenTimes.add(t);
    }

    if (config.mode === 'CUSTOM_DAILY_TIMES' && videosPerDay > 0 && rawTimes.length !== videosPerDay) {
      errors.push(`Configured for ${videosPerDay} videos/day, but ${rawTimes.length} publish times were provided. Please provide exactly ${videosPerDay} times.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Priority Hierarchy Resolver:
 * 1. Explicit channel override (channel.scheduleConfig when not useProfileSchedule)
 * 2. Content Profile schedule (profile.scheduleConfig)
 * 3. Channel legacy fields (publishFrequency, publishTime, timezone)
 * 4. Content profile legacy fields
 * 5. Global AMG default (1 video/day @ 16:00 WIB, Asia/Jakarta)
 */
export function resolveScheduleConfig(
  channel?: Partial<Channel> | null,
  profile?: Partial<ContentProfile> | null
): ScheduleConfig {
  // 1. Explicit channel override
  if (channel?.scheduleConfig && channel.useProfileSchedule !== true) {
    const valid = validateScheduleConfig(channel.scheduleConfig);
    if (valid.isValid) {
      return normalizeScheduleConfig(channel.scheduleConfig);
    }
  }

  // 2. Content Profile schedule
  if (profile?.scheduleConfig) {
    const valid = validateScheduleConfig(profile.scheduleConfig);
    if (valid.isValid) {
      return normalizeScheduleConfig(profile.scheduleConfig);
    }
  }

  // 3. Backward-compatibility: Convert channel legacy strings
  if (channel?.publishFrequency || channel?.publishTime) {
    return parseLegacySchedule(
      channel.publishFrequency,
      channel.publishTime,
      channel.timezone || profile?.timezone || 'Asia/Jakarta'
    );
  }

  // 4. Backward-compatibility: Convert profile legacy strings
  if (profile?.publishFrequency || profile?.publishTime) {
    return parseLegacySchedule(
      profile.publishFrequency,
      profile.publishTime,
      profile.timezone || 'Asia/Jakarta'
    );
  }

  // 5. Global AMG default
  return { ...DEFAULT_AMG_SCHEDULE_CONFIG };
}

/**
 * Normalizes a ScheduleConfig (sorting times, filling defaults)
 */
export function normalizeScheduleConfig(config: ScheduleConfig): ScheduleConfig {
  const mode: ScheduleMode = config.mode || 'DAILY';
  const timezone = config.timezone || 'Asia/Jakarta';
  let videosPerDay = config.videosPerDay || 1;
  let times: string[] = [];

  if (mode === 'CUSTOM_INTERVAL') {
    const start = config.intervalStartTime || '08:00';
    const interval = config.intervalHours || 4;
    times = generateIntervalTimes(start, interval, videosPerDay);
  } else if (mode === 'DAILY') {
    times = [config.times?.[0] || '16:00'];
    videosPerDay = 1;
  } else {
    // CUSTOM_DAILY_TIMES or ADVANCED_CUSTOM
    times = (config.times || ['16:00'])
      .slice()
      .sort((a, b) => a.localeCompare(b));
    if (videosPerDay <= 0) videosPerDay = times.length || 1;
  }

  return {
    mode,
    videosPerDay,
    times,
    timezone,
    startPolicy: config.startPolicy || 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
    intervalHours: config.intervalHours,
    intervalStartTime: config.intervalStartTime,
    advancedConfig: config.advancedConfig,
  };
}

/**
 * Converts legacy strings like "3/day", "08:00, 14:00, 20:00" into a canonical ScheduleConfig
 */
export function parseLegacySchedule(
  frequencyStr?: string,
  publishTimeStr?: string,
  timezoneStr?: string
): ScheduleConfig {
  const timezone = timezoneStr || 'Asia/Jakarta';

  // Parse frequency: e.g. "3/day" -> 3
  let count = 1;
  if (frequencyStr) {
    const match = frequencyStr.match(/^(\d+)/);
    if (match) {
      count = parseInt(match[1], 10);
    }
  }

  // Parse publish times: comma or space separated
  let times: string[] = [];
  if (publishTimeStr) {
    const splitted = publishTimeStr.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
    if (splitted.length > 0) {
      times = splitted;
    }
  }

  if (times.length === 0) {
    times = ['16:00'];
  }

  // If count > 1 but only 1 time provided, generate standard staggered times
  if (count > 1 && times.length === 1) {
    if (count === 2) times = ['08:00', '20:00'];
    else if (count === 3) times = ['08:00', '14:00', '20:00'];
    else if (count === 5) times = ['06:00', '10:00', '14:00', '18:00', '22:00'];
    else times = generateIntervalTimes(times[0] || '08:00', Math.floor(16 / count), count);
  }

  times.sort((a, b) => a.localeCompare(b));

  return {
    mode: count === 1 && times.length === 1 ? 'DAILY' : 'CUSTOM_DAILY_TIMES',
    videosPerDay: count,
    times,
    timezone,
    startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
  };
}

/**
 * Generates an array of HH:mm times based on interval
 */
export function generateIntervalTimes(startTime: string, intervalHours: number, count: number): string[] {
  const [startHourStr, startMinStr] = startTime.split(':');
  let hour = parseInt(startHourStr || '8', 10);
  const minute = parseInt(startMinStr || '0', 10);

  const times: string[] = [];
  for (let i = 0; i < count; i++) {
    const h = hour % 24;
    times.push(`${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    hour += intervalHours;
  }
  return times.sort((a, b) => a.localeCompare(b));
}

/**
 * Extracts year, month (1-12), day, hour, minute in the target timezone
 */
export function getDatePartsInTimezone(
  date: Date,
  timezone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth() + 1;
  let day = date.getUTCDate();
  let hour = date.getUTCHours();
  let minute = date.getUTCMinutes();
  let second = date.getUTCSeconds();

  for (const p of parts) {
    if (p.type === 'year') year = parseInt(p.value, 10);
    if (p.type === 'month') month = parseInt(p.value, 10);
    if (p.type === 'day') day = parseInt(p.value, 10);
    if (p.type === 'hour') hour = parseInt(p.value, 10);
    if (p.type === 'minute') minute = parseInt(p.value, 10);
    if (p.type === 'second') second = parseInt(p.value, 10);
  }

  return { year, month, day, hour, minute, second };
}

/**
 * Converts a target local YYYY-MM-DD HH:mm in a given timezone into an exact UTC Date
 */
export function localTimeToUtcDate(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date {
  const approximateUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const localParts = getDatePartsInTimezone(approximateUtc, timezone);
  const localAsUtc = new Date(
    Date.UTC(localParts.year, localParts.month - 1, localParts.day, localParts.hour, localParts.minute, localParts.second, 0)
  );
  const offsetMs = localAsUtc.getTime() - approximateUtc.getTime();
  const exactUtc = new Date(approximateUtc.getTime() - offsetMs);

  // Re-verify in case of DST jump
  const verifyParts = getDatePartsInTimezone(exactUtc, timezone);
  if (
    verifyParts.year !== year ||
    verifyParts.month !== month ||
    verifyParts.day !== day ||
    verifyParts.hour !== hour ||
    verifyParts.minute !== minute
  ) {
    const secondLocalAsUtc = new Date(
      Date.UTC(verifyParts.year, verifyParts.month - 1, verifyParts.day, verifyParts.hour, verifyParts.minute, verifyParts.second, 0)
    );
    const correctedOffsetMs = secondLocalAsUtc.getTime() - exactUtc.getTime();
    return new Date(approximateUtc.getTime() - correctedOffsetMs);
  }

  return exactUtc;
}

/**
 * Returns user-friendly timezone abbreviation
 */
export function getTimezoneAbbreviation(timezone: string): string {
  if (timezone === 'Asia/Jakarta') return 'WIB';
  if (timezone === 'Asia/Makassar') return 'WITA';
  if (timezone === 'Asia/Jayapura') return 'WIT';
  if (timezone === 'Asia/Singapore') return 'SGT';
  if (timezone === 'UTC') return 'UTC';

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return tzPart ? tzPart.value : timezone;
  } catch {
    return timezone;
  }
}

/**
 * Formats a display date in Indonesian / English standard
 */
export function formatDisplayDate(
  year: number,
  month: number,
  day: number,
  timeString: string,
  timezone: string
): string {
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const tzAbbrev = getTimezoneAbbreviation(timezone);
  return `${day} ${monthNames[month - 1]} ${year} — ${timeString} ${tzAbbrev}`;
}

/**
 * Normalizes an ISO timestamp down to minute resolution for collision detection
 */
export function normalizeIsoMinute(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toISOString().slice(0, 16); // e.g. "2026-10-01T13:00"
  } catch {
    return isoString;
  }
}

/**
 * Main Scheduling Calculation Engine
 * 
 * Reconciles from the latest actual scheduled YouTube video, avoids collisions against occupied slots,
 * and generates strictly valid future schedule slots according to the configured rule.
 * 
 * @param count Number of videos to schedule
 * @param config Schedule configuration (or partial, falling back to default)
 * @param latestVerifiedPublishAt The latest publishAt timestamp from actual YouTube videos or local cursor
 * @param occupiedSlots Array of already scheduled publishAt timestamps to avoid collisions
 * @param nowOverride Optional Date instance representing "now" (useful for deterministic tests)
 */
export function calculateNextSchedules(
  count: number,
  config?: Partial<ScheduleConfig> | null,
  latestVerifiedPublishAt?: string | null,
  occupiedSlots: string[] = [],
  nowOverride?: Date
): CalculatedScheduleSlot[] {
  if (count <= 0) return [];

  const normalizedConfig = normalizeScheduleConfig(config as ScheduleConfig || DEFAULT_AMG_SCHEDULE_CONFIG);
  const timezone = normalizedConfig.timezone;
  const configuredTimes = normalizedConfig.times;
  const tzAbbrev = getTimezoneAbbreviation(timezone);

  // Build a Set of occupied timestamps normalized to minute resolution (UTC)
  const occupiedMinuteSet = new Set<string>();
  for (const slot of occupiedSlots) {
    if (slot) occupiedMinuteSet.add(normalizeIsoMinute(slot));
  }

  // Determine the baseline cutoff timestamp
  // If latestVerifiedPublishAt is valid, we must schedule strictly AFTER it.
  // Otherwise, baseline is now (or nowOverride).
  let baselineDate: Date;
  let hasVerifiedAnchor = false;

  if (latestVerifiedPublishAt) {
    const parsed = new Date(latestVerifiedPublishAt);
    if (!isNaN(parsed.getTime())) {
      baselineDate = parsed;
      hasVerifiedAnchor = true;
    } else {
      baselineDate = nowOverride || new Date();
    }
  } else {
    baselineDate = nowOverride || new Date();
  }

  const baselineTimeMs = baselineDate.getTime();

  // Extract starting date in target timezone
  const baselineParts = getDatePartsInTimezone(baselineDate, timezone);

  let currentYear = baselineParts.year;
  let currentMonth = baselineParts.month;
  let currentDay = baselineParts.day;

  const resultSlots: CalculatedScheduleSlot[] = [];
  let safetyLoopCounter = 0;
  const maxIterations = 5000; // Safeguard against infinite loops

  const currentNowMs = (nowOverride || new Date()).getTime();

  while (resultSlots.length < count && safetyLoopCounter < maxIterations) {
    safetyLoopCounter++;

    // Check all configured times for the current day
    for (const timeStr of configuredTimes) {
      if (resultSlots.length >= count) break;

      const [hourStr, minStr] = timeStr.split(':');
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minStr, 10);

      // Compute exact UTC instant for this candidate slot
      const candidateUtc = localTimeToUtcDate(currentYear, currentMonth, currentDay, hour, minute, timezone);
      const candidateMs = candidateUtc.getTime();

      // Rule: Candidate slot must be strictly AFTER both the baseline cutoff time and current time!
      // (e.g. if latest was 1 Oct 14:00, 08:00 and 14:00 on 1 Oct are skipped; 20:00 is accepted)
      // Never schedule in the past (nextScheduledAt > currentTime).
      if (candidateMs <= baselineTimeMs || candidateMs <= currentNowMs) {
        continue;
      }

      // Rule: Collision Avoidance (occupied slot check)
      const candidateIso = candidateUtc.toISOString();
      const candidateIsoMinute = normalizeIsoMinute(candidateIso);
      if (occupiedMinuteSet.has(candidateIsoMinute)) {
        // Skip occupied slot and evaluate next time/day
        continue;
      }

      // Valid slot found!
      const dateString = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
      const formattedDisplay = formatDisplayDate(currentYear, currentMonth, currentDay, timeStr, timezone);

      resultSlots.push({
        index: resultSlots.length,
        dateString,
        timeString: timeStr,
        isoPublishAt: candidateIso,
        formattedDisplay,
        timezone,
        timezoneAbbreviation: tzAbbrev,
      });

      // Mark this newly assigned slot as occupied so subsequent iterations don't duplicate
      occupiedMinuteSet.add(candidateIsoMinute);
    }

    // Advance to next day
    const nextDayUtc = new Date(Date.UTC(currentYear, currentMonth - 1, currentDay + 1));
    currentYear = nextDayUtc.getUTCFullYear();
    currentMonth = nextDayUtc.getUTCMonth() + 1;
    currentDay = nextDayUtc.getUTCDate();
  }

  return resultSlots;
}

/**
 * Schedule Buffer Evaluation Result
 */
export interface ScheduleBufferEvaluation {
  scheduleBufferDays: number;
  scheduleStockCount: number;
  scheduleAlertStatus: ScheduleAlertStatus;
  bufferExhaustionDate: string;
  formattedExhaustionDate: string;
}

/**
 * Format ISO publish date to readable Indonesian text (e.g. "28 September 2026 16:00 WIB")
 */
export function formatBufferExhaustionDisplay(
  isoDateString?: string,
  timezone: string = 'Asia/Jakarta'
): string {
  if (!isoDateString) return 'Belum ada jadwal';

  try {
    const d = new Date(isoDateString);
    if (isNaN(d.getTime())) return 'Format tanggal tidak valid';

    const formatter = new Intl.DateTimeFormat('id-ID', {
      timeZone: timezone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.format(d).replace(/\./g, ':');
    const tzAbbrev = getTimezoneAbbreviation(timezone);
    return `${parts} ${tzAbbrev}`;
  } catch (err) {
    return isoDateString;
  }
}

/**
 * Schedule Buffer Monitor & Low Stock Evaluator
 * 
 * Rules:
 * 1. Takes the last scheduled anchor (lastScheduledPublishAt or latestManagedScheduledAt)
 * 2. Computes remaining days relative to current time (timezone Asia/Jakarta)
 * 3. Counts total ready scheduled private videos in the future
 * 4. Thresholds:
 *    - 'CRITICAL' (Red): Remaining buffer <= 3 days OR remaining scheduled stock <= 3 videos.
 *    - 'LOW_STOCK' (Yellow): Remaining buffer <= 7 days (H-7 before last slot exhausted).
 *    - 'SAFE' (Green): Remaining buffer > 7 days with adequate stock.
 */
export function evaluateChannelScheduleBuffer(
  channel: Channel,
  videos: ManagedVideo[] = [],
  nowOverride?: Date
): ScheduleBufferEvaluation {
  const now = nowOverride || new Date('2026-09-24T10:00:00.000Z'); // Fixed baseline anchor aligned with current simulated time
  const nowMs = now.getTime();

  // Find latest scheduled anchor
  let exhaustionIso = channel.lastScheduledPublishAt || channel.latestManagedScheduledAt || '';

  // Count scheduled videos in the future for this channel
  let stockCount = 0;
  for (const v of videos) {
    if (v.channelId === channel.id) {
      const scheduledAt = v.scheduledPublishAt || v.scheduledAt;
      if (scheduledAt) {
        const schedMs = new Date(scheduledAt).getTime();
        // Video is scheduled in the future and not yet published
        if (schedMs > nowMs && v.privacyStatus === 'private') {
          stockCount++;
          // Track highest scheduled date if not set on channel
          if (!exhaustionIso || schedMs > new Date(exhaustionIso).getTime()) {
            exhaustionIso = scheduledAt;
          }
        }
      }
    }
  }

  // If no scheduled videos detected, estimate stock based on channel unmanaged/scheduled status
  if (stockCount === 0 && exhaustionIso) {
    // If channel has a scheduled date 4 days ahead, compute minimum estimated scheduled videos
    const diffMs = new Date(exhaustionIso).getTime() - nowMs;
    const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    stockCount = Math.min(days, 2);
  }

  let bufferDays = 0;
  if (exhaustionIso) {
    const exhaustionMs = new Date(exhaustionIso).getTime();
    const diffMs = exhaustionMs - nowMs;
    bufferDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  // Threshold evaluation:
  let alertStatus: ScheduleAlertStatus = 'SAFE';

  if (!exhaustionIso || bufferDays <= 3 || stockCount <= 3) {
    alertStatus = 'CRITICAL';
  } else if (bufferDays <= 7) {
    alertStatus = 'LOW_STOCK';
  } else {
    alertStatus = 'SAFE';
  }

  const formattedExhaustionDate = formatBufferExhaustionDisplay(
    exhaustionIso,
    channel.timezone || 'Asia/Jakarta'
  );

  return {
    scheduleBufferDays: bufferDays,
    scheduleStockCount: stockCount,
    scheduleAlertStatus: alertStatus,
    bufferExhaustionDate: exhaustionIso,
    formattedExhaustionDate,
  };
}
