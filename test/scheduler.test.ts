/**
 * AMG Custom Scheduling Rules & Reconciler Unit Test Suite
 * Covers Tests 1 through 8 as required by the specification.
 */

import {
  calculateNextSchedules,
  resolveScheduleConfig,
  validateScheduleConfig,
  localTimeToUtcDate,
  getDatePartsInTimezone,
  getTimezoneAbbreviation,
  formatDisplayDate,
  DEFAULT_AMG_SCHEDULE_CONFIG,
} from '../server/scheduleReconciliationService.js';
import { generateRotationMatrix, RotationTitle, RotationThumbnail } from '../server/rotationService.js';
import { ScheduleConfig } from '../src/types/index.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAILED: ${testName} ${detail ? `(${detail})` : ''}`);
    throw new Error(`Test failed: ${testName}`);
  } else {
    passedTests++;
    console.log(`✅ PASSED: ${testName}`);
  }
}

console.log('====================================================');
console.log('AMG SCHEDULER ENGINE & RULES TEST SUITE');
console.log('====================================================\n');

// ----------------------------------------------------
// TEST 1: 1 video/day @ 16:00 WIB
// ----------------------------------------------------
{
  const config: ScheduleConfig = {
    mode: 'DAILY',
    videosPerDay: 1,
    times: ['16:00'],
    timezone: 'Asia/Jakarta',
  };

  // Baseline: 2026-10-01 10:00:00 WIB
  const baselineDate = localTimeToUtcDate(2026, 10, 1, 10, 0, 'Asia/Jakarta');
  const slots = calculateNextSchedules(3, config, baselineDate.toISOString());

  assert(slots.length === 3, 'Test 1: Generates 3 daily slots');
  assert(slots[0].dateString === '2026-10-01' && slots[0].timeString === '16:00', 'Test 1: Slot 1 is 2026-10-01 @ 16:00');
  assert(slots[1].dateString === '2026-10-02' && slots[1].timeString === '16:00', 'Test 1: Slot 2 is 2026-10-02 @ 16:00');
  assert(slots[2].dateString === '2026-10-03' && slots[2].timeString === '16:00', 'Test 1: Slot 3 is 2026-10-03 @ 16:00');
  assert(slots[0].timezoneAbbreviation === 'WIB', 'Test 1: Timezone abbreviation is WIB');
}

// ----------------------------------------------------
// TEST 2: 2 videos/day @ 08:00, 20:00 WIB
// ----------------------------------------------------
{
  const config: ScheduleConfig = {
    mode: 'CUSTOM_DAILY_TIMES',
    videosPerDay: 2,
    times: ['08:00', '20:00'],
    timezone: 'Asia/Jakarta',
  };

  // Baseline: 2026-10-01 07:00:00 WIB (before 08:00)
  const baselineDate = localTimeToUtcDate(2026, 10, 1, 7, 0, 'Asia/Jakarta');
  const slots = calculateNextSchedules(4, config, baselineDate.toISOString());

  assert(slots.length === 4, 'Test 2: Generates 4 slots for 2 videos/day');
  assert(slots[0].dateString === '2026-10-01' && slots[0].timeString === '08:00', 'Test 2: Day 1 Slot 1 is 08:00');
  assert(slots[1].dateString === '2026-10-01' && slots[1].timeString === '20:00', 'Test 2: Day 1 Slot 2 is 20:00');
  assert(slots[2].dateString === '2026-10-02' && slots[2].timeString === '08:00', 'Test 2: Day 2 Slot 1 is 08:00');
  assert(slots[3].dateString === '2026-10-02' && slots[3].timeString === '20:00', 'Test 2: Day 2 Slot 2 is 20:00');
}

// ----------------------------------------------------
// TEST 3: 3 videos/day @ 08:00, 14:00, 20:00 WIB
// ----------------------------------------------------
{
  const config: ScheduleConfig = {
    mode: 'CUSTOM_DAILY_TIMES',
    videosPerDay: 3,
    times: ['08:00', '14:00', '20:00'],
    timezone: 'Asia/Jakarta',
  };

  // Baseline: 2026-10-01 07:00:00 WIB
  const baselineDate = localTimeToUtcDate(2026, 10, 1, 7, 0, 'Asia/Jakarta');
  const slots = calculateNextSchedules(6, config, baselineDate.toISOString());

  assert(slots.length === 6, 'Test 3: Generates 6 slots for 3 videos/day over 2 days');
  assert(slots[0].dateString === '2026-10-01' && slots[0].timeString === '08:00', 'Test 3: Day 1 Slot 1 @ 08:00');
  assert(slots[1].dateString === '2026-10-01' && slots[1].timeString === '14:00', 'Test 3: Day 1 Slot 2 @ 14:00');
  assert(slots[2].dateString === '2026-10-01' && slots[2].timeString === '20:00', 'Test 3: Day 1 Slot 3 @ 20:00');
  assert(slots[3].dateString === '2026-10-02' && slots[3].timeString === '08:00', 'Test 3: Day 2 Slot 1 @ 08:00');
  assert(slots[4].dateString === '2026-10-02' && slots[4].timeString === '14:00', 'Test 3: Day 2 Slot 2 @ 14:00');
  assert(slots[5].dateString === '2026-10-02' && slots[5].timeString === '20:00', 'Test 3: Day 2 Slot 3 @ 20:00');
}

// ----------------------------------------------------
// TEST 4: 5 videos/day @ 06:00, 10:00, 14:00, 18:00, 22:00 WIB
// ----------------------------------------------------
{
  const config: ScheduleConfig = {
    mode: 'CUSTOM_DAILY_TIMES',
    videosPerDay: 5,
    times: ['06:00', '10:00', '14:00', '18:00', '22:00'],
    timezone: 'Asia/Jakarta',
  };

  const baselineDate = localTimeToUtcDate(2026, 10, 1, 5, 0, 'Asia/Jakarta');
  const slots = calculateNextSchedules(10, config, baselineDate.toISOString());

  assert(slots.length === 10, 'Test 4: Generates 10 slots for 5 videos/day over 2 days');
  assert(slots[0].timeString === '06:00' && slots[0].dateString === '2026-10-01', 'Test 4: Day 1 06:00');
  assert(slots[1].timeString === '10:00' && slots[1].dateString === '2026-10-01', 'Test 4: Day 1 10:00');
  assert(slots[2].timeString === '14:00' && slots[2].dateString === '2026-10-01', 'Test 4: Day 1 14:00');
  assert(slots[3].timeString === '18:00' && slots[3].dateString === '2026-10-01', 'Test 4: Day 1 18:00');
  assert(slots[4].timeString === '22:00' && slots[4].dateString === '2026-10-01', 'Test 4: Day 1 22:00');
  assert(slots[5].timeString === '06:00' && slots[5].dateString === '2026-10-02', 'Test 4: Day 2 06:00');
  assert(slots[9].timeString === '22:00' && slots[9].dateString === '2026-10-02', 'Test 4: Day 2 22:00');
}

// ----------------------------------------------------
// TEST 5: Continue from latest scheduled (1 Oct 14:00 -> Next is 1 Oct 20:00)
// ----------------------------------------------------
{
  const config: ScheduleConfig = {
    mode: 'CUSTOM_DAILY_TIMES',
    videosPerDay: 3,
    times: ['08:00', '14:00', '20:00'],
    timezone: 'Asia/Jakarta',
  };

  // Latest scheduled video is exactly 1 October 2026 14:00 WIB
  const latestScheduledUtc = localTimeToUtcDate(2026, 10, 1, 14, 0, 'Asia/Jakarta');
  const slots = calculateNextSchedules(4, config, latestScheduledUtc.toISOString());

  assert(slots.length === 4, 'Test 5: Calculates 4 continuous slots');
  assert(
    slots[0].dateString === '2026-10-01' && slots[0].timeString === '20:00',
    'Test 5: Expected next slot after 1 Oct 14:00 is 1 Oct 20:00 (NOT 1 Oct 08:00 or 14:00, and NOT blindly next day)',
    `Got ${slots[0].dateString} ${slots[0].timeString}`
  );
  assert(slots[1].dateString === '2026-10-02' && slots[1].timeString === '08:00', 'Test 5: Next slot is 2 Oct 08:00');
  assert(slots[2].dateString === '2026-10-02' && slots[2].timeString === '14:00', 'Test 5: Next slot is 2 Oct 14:00');
  assert(slots[3].dateString === '2026-10-02' && slots[3].timeString === '20:00', 'Test 5: Next slot is 2 Oct 20:00');
}

// ----------------------------------------------------
// TEST 6: Existing occupied slots must be skipped without collision
// ----------------------------------------------------
{
  const config: ScheduleConfig = {
    mode: 'CUSTOM_DAILY_TIMES',
    videosPerDay: 3,
    times: ['08:00', '14:00', '20:00'],
    timezone: 'Asia/Jakarta',
  };

  // Latest scheduled is 1 Oct 14:00 WIB
  const latestScheduledUtc = localTimeToUtcDate(2026, 10, 1, 14, 0, 'Asia/Jakarta');

  // Suppose 1 Oct 20:00 WIB is ALREADY occupied by another scheduled video!
  const occupiedSlotUtc = localTimeToUtcDate(2026, 10, 1, 20, 0, 'Asia/Jakarta');
  const occupiedSlots = [occupiedSlotUtc.toISOString()];

  const slots = calculateNextSchedules(3, config, latestScheduledUtc.toISOString(), occupiedSlots);

  assert(slots.length === 3, 'Test 6: Returns 3 slots skipping occupied');
  // Slot 0 should SKIP 1 Oct 20:00 and take 2 Oct 08:00!
  assert(
    slots[0].dateString === '2026-10-02' && slots[0].timeString === '08:00',
    'Test 6: Successfully skipped occupied 1 Oct 20:00 and assigned 2 Oct 08:00',
    `Got ${slots[0].dateString} ${slots[0].timeString}`
  );
  assert(slots[1].dateString === '2026-10-02' && slots[1].timeString === '14:00', 'Test 6: Slot 1 is 2 Oct 14:00');
  assert(slots[2].dateString === '2026-10-02' && slots[2].timeString === '20:00', 'Test 6: Slot 2 is 2 Oct 20:00');
}

// ----------------------------------------------------
// TEST 7: Timezone conversion (Asia/Makassar WITA vs Asia/Jakarta WIB vs UTC)
// ----------------------------------------------------
{
  // 1. Asia/Makassar (WITA, UTC+8)
  const configMakassar: ScheduleConfig = {
    mode: 'DAILY',
    videosPerDay: 1,
    times: ['09:00'],
    timezone: 'Asia/Makassar',
  };
  const baselineMakassar = localTimeToUtcDate(2026, 10, 1, 8, 0, 'Asia/Makassar');
  const slotsMakassar = calculateNextSchedules(1, configMakassar, baselineMakassar.toISOString());

  assert(slotsMakassar[0].timezoneAbbreviation === 'WITA', 'Test 7: Makassar tz abbreviation is WITA');
  assert(slotsMakassar[0].timeString === '09:00', 'Test 7: Makassar local time is 09:00');
  // 09:00 WITA (UTC+8) is 01:00 UTC
  const utcDate = new Date(slotsMakassar[0].isoPublishAt);
  assert(utcDate.getUTCHours() === 1, 'Test 7: 09:00 WITA converts to 01:00 UTC', `Got UTC hour ${utcDate.getUTCHours()}`);

  // 2. Asia/Jakarta (WIB, UTC+7)
  const configJakarta: ScheduleConfig = {
    mode: 'DAILY',
    videosPerDay: 1,
    times: ['16:00'],
    timezone: 'Asia/Jakarta',
  };
  const baselineJakarta = localTimeToUtcDate(2026, 10, 1, 12, 0, 'Asia/Jakarta');
  const slotsJakarta = calculateNextSchedules(1, configJakarta, baselineJakarta.toISOString());
  assert(slotsJakarta[0].timezoneAbbreviation === 'WIB', 'Test 7: Jakarta tz abbreviation is WIB');
  // 16:00 WIB (UTC+7) is 09:00 UTC
  const utcJakarta = new Date(slotsJakarta[0].isoPublishAt);
  assert(utcJakarta.getUTCHours() === 9, 'Test 7: 16:00 WIB converts to 09:00 UTC', `Got UTC hour ${utcJakarta.getUTCHours()}`);
}

// ----------------------------------------------------
// TEST 8: 3 Master Titles + 4 Master Thumbnails + 5 videos/day independent rotation
// ----------------------------------------------------
{
  const titles: RotationTitle[] = [
    { id: 'T1', text: 'Master Title 1', orderIndex: 0 },
    { id: 'T2', text: 'Master Title 2', orderIndex: 1 },
    { id: 'T3', text: 'Master Title 3', orderIndex: 2 },
  ];

  const thumbnails: RotationThumbnail[] = [
    { id: 'TH1', name: 'Thumb 1', url: 'https://example.com/th1.jpg', orderIndex: 0 },
    { id: 'TH2', name: 'Thumb 2', url: 'https://example.com/th2.jpg', orderIndex: 1 },
    { id: 'TH3', name: 'Thumb 3', url: 'https://example.com/th3.jpg', orderIndex: 2 },
    { id: 'TH4', name: 'Thumb 4', url: 'https://example.com/th4.jpg', orderIndex: 3 },
  ];

  const rotationMatrix = generateRotationMatrix(titles, thumbnails, 7, 0);

  // Check Title rotation (period 3): T1, T2, T3, T1, T2, T3, T1
  assert(rotationMatrix[0].title.id === 'T1', 'Test 8: Video 1 gets T1');
  assert(rotationMatrix[1].title.id === 'T2', 'Test 8: Video 2 gets T2');
  assert(rotationMatrix[2].title.id === 'T3', 'Test 8: Video 3 gets T3');
  assert(rotationMatrix[3].title.id === 'T1', 'Test 8: Video 4 gets T1 (cycle repeats)');
  assert(rotationMatrix[4].title.id === 'T2', 'Test 8: Video 5 gets T2');

  // Check Thumbnail rotation (period 4): TH1, TH2, TH3, TH4, TH1, TH2, TH3
  assert(rotationMatrix[0].thumbnail.id === 'TH1', 'Test 8: Video 1 gets TH1');
  assert(rotationMatrix[1].thumbnail.id === 'TH2', 'Test 8: Video 2 gets TH2');
  assert(rotationMatrix[2].thumbnail.id === 'TH3', 'Test 8: Video 3 gets TH3');
  assert(rotationMatrix[3].thumbnail.id === 'TH4', 'Test 8: Video 4 gets TH4');
  assert(rotationMatrix[4].thumbnail.id === 'TH1', 'Test 8: Video 5 gets TH1 (cycle repeats)');

  // Now schedule 5 videos/day (independently of title/thumbnail counts):
  const config: ScheduleConfig = {
    mode: 'CUSTOM_DAILY_TIMES',
    videosPerDay: 5,
    times: ['08:00', '11:00', '14:00', '17:00', '20:00'],
    timezone: 'Asia/Jakarta',
  };

  const baseline = localTimeToUtcDate(2026, 10, 1, 7, 0, 'Asia/Jakarta');
  const scheduleSlots = calculateNextSchedules(7, config, baseline.toISOString());

  // Day 1 gets 5 videos scheduled at 08, 11, 14, 17, 20
  assert(scheduleSlots[0].timeString === '08:00' && scheduleSlots[0].dateString === '2026-10-01', 'Test 8: Slot 1 is 1 Oct 08:00');
  assert(scheduleSlots[1].timeString === '11:00' && scheduleSlots[1].dateString === '2026-10-01', 'Test 8: Slot 2 is 1 Oct 11:00');
  assert(scheduleSlots[2].timeString === '14:00' && scheduleSlots[2].dateString === '2026-10-01', 'Test 8: Slot 3 is 1 Oct 14:00');
  assert(scheduleSlots[3].timeString === '17:00' && scheduleSlots[3].dateString === '2026-10-01', 'Test 8: Slot 4 is 1 Oct 17:00');
  assert(scheduleSlots[4].timeString === '20:00' && scheduleSlots[4].dateString === '2026-10-01', 'Test 8: Slot 5 is 1 Oct 20:00');
  // Day 2 gets remaining 2 videos
  assert(scheduleSlots[5].timeString === '08:00' && scheduleSlots[5].dateString === '2026-10-02', 'Test 8: Slot 6 is 2 Oct 08:00');
  assert(scheduleSlots[6].timeString === '11:00' && scheduleSlots[6].dateString === '2026-10-02', 'Test 8: Slot 7 is 2 Oct 11:00');
}

// ----------------------------------------------------
// TEST 9: Priority Hierarchy Resolution
// ----------------------------------------------------
{
  const channelWithOverride = {
    id: 'c1',
    useProfileSchedule: false,
    scheduleConfig: {
      mode: 'CUSTOM_DAILY_TIMES' as const,
      videosPerDay: 4,
      times: ['07:00', '11:00', '15:00', '19:00'],
      timezone: 'Asia/Jayapura',
    },
  };

  const profile = {
    id: 'p1',
    scheduleConfig: {
      mode: 'CUSTOM_DAILY_TIMES' as const,
      videosPerDay: 2,
      times: ['09:00', '21:00'],
      timezone: 'Asia/Makassar',
    },
  };

  // 1. Channel override wins
  const res1 = resolveScheduleConfig(channelWithOverride, profile);
  assert(res1.videosPerDay === 4 && res1.timezone === 'Asia/Jayapura', 'Test 9: Explicit channel override takes top priority');

  // 2. Channel with useProfileSchedule = true inherits profile
  const channelUsingProfile = {
    id: 'c2',
    useProfileSchedule: true,
    scheduleConfig: channelWithOverride.scheduleConfig,
  };
  const res2 = resolveScheduleConfig(channelUsingProfile, profile);
  assert(res2.videosPerDay === 2 && res2.timezone === 'Asia/Makassar', 'Test 9: Channel using profile inherits profile schedule');

  // 3. Fallback to global AMG default when neither is provided
  const res3 = resolveScheduleConfig({}, {});
  assert(res3.videosPerDay === 1 && res3.times[0] === '16:00' && res3.timezone === 'Asia/Jakarta', 'Test 9: Fallback to Global AMG default');
}

// ----------------------------------------------------
// TEST 10: Validation logic
// ----------------------------------------------------
{
  const invalid0Freq = validateScheduleConfig({ mode: 'DAILY', videosPerDay: 0, times: ['16:00'] });
  assert(!invalid0Freq.isValid, 'Test 10: 0 frequency rejected');

  const invalidEmptyTimes = validateScheduleConfig({ mode: 'CUSTOM_DAILY_TIMES', videosPerDay: 2, times: [] });
  assert(!invalidEmptyTimes.isValid, 'Test 10: Empty times rejected');

  const invalidTimeFormat = validateScheduleConfig({ mode: 'DAILY', videosPerDay: 1, times: ['25:00'] });
  assert(!invalidTimeFormat.isValid, 'Test 10: Malformed 25:00 rejected');

  const duplicateTimes = validateScheduleConfig({ mode: 'CUSTOM_DAILY_TIMES', videosPerDay: 2, times: ['08:00', '08:00'] });
  assert(!duplicateTimes.isValid, 'Test 10: Duplicate times rejected');

  const validConfig = validateScheduleConfig({ mode: 'CUSTOM_DAILY_TIMES', videosPerDay: 3, times: ['08:00', '14:00', '20:00'], timezone: 'Asia/Jakarta' });
  assert(validConfig.isValid, 'Test 10: Valid 3-time config passes');
}

console.log(`\n====================================================`);
console.log(`ALL ${totalTests} TESTS PASSED SUCCESSFULLY! (${passedTests}/${totalTests})`);
console.log(`====================================================\n`);
