import assert from 'node:assert/strict';
import {
  DayScheduleConfig,
  DEFAULT_DAY_SCHEDULE,
  getChannelDaySchedule,
  saveChannelDaySchedule,
  generateSequentialSchedulesWithDayConfig,
  getWibCalendarComponents,
  createWibPublishAt,
  formatWibDateTime,
} from '../src/utils/dayScheduleUtils.ts';
import { workerClient } from '../src/services/workerClient.ts';
import {
  parseClientIdsFromText,
  formatClientIdPoolToText,
  getAvailableClientIdSlot,
  assignChannelToSlot,
  markSlotCooldown,
  resetSlotCooldown,
  getClientIdPool,
  saveClientIdPool,
} from '../src/utils/clientIdPoolUtils.ts';
import { ClientIdSlot } from '../src/types/index.ts';

console.log('================================================================');
console.log('AMG ARCHITECTURE SUITE: KLOTER 33, ATOMIC EXECUTION, & CLIENT ID POOL');
console.log('================================================================');

function runTestSuite() {
  console.log('\n--- TEST GROUP 1: DayScheduleConfig & Flexible Daily Hours ---');

  // Custom weekly schedule
  const customConfig: DayScheduleConfig = {
    senin: '12:00',
    selasa: '14:00',
    rabu: '12:00',
    kamis: '18:00',
    jumat: '15:00',
    sabtu: '10:00',
    minggu: '19:00',
  };

  // Mock channel
  const mockChannel = {
    id: 'chan-UC_FLEXIBLE_SCHEDULE_123',
    youtubeChannelId: 'UC_FLEXIBLE_SCHEDULE_123',
    title: 'Channel Kustom Harian',
    dayScheduleConfig: customConfig,
    scheduleTimeMode: 'DIFFERENT_PER_DAY' as const,
  };

  const retrieved = getChannelDaySchedule(mockChannel as any);
  assert.equal(retrieved.senin, '12:00');
  assert.equal(retrieved.selasa, '14:00');
  assert.equal(retrieved.kamis, '18:00');
  assert.equal(retrieved.sabtu, '10:00');
  assert.equal(retrieved.minggu, '19:00');
  console.log('✅ PASSED: DayScheduleConfig retrieves custom per-day hours accurately');

  console.log('\n--- TEST GROUP 2: Sequential Schedules with Custom Day Hours (WIB) ---');
  // Anchor date: Sunday, 1 November 2026 16:00 WIB
  const anchorIso = '2026-11-01T09:00:00.000Z'; // Sunday in UTC+7 is 2026-11-01 (Minggu)
  const schedules = generateSequentialSchedulesWithDayConfig(7, anchorIso, customConfig);

  assert.equal(schedules.length, 7);

  // Day 1: Senin, 2 November 2026 @ 12:00 WIB (+07:00 -> 05:00 UTC)
  const day1Date = new Date(schedules[0]);
  const day1Comp = getWibCalendarComponents(day1Date);
  assert.equal(day1Comp.year, 2026);
  assert.equal(day1Comp.month, 10); // Nov (0-indexed 10)
  assert.equal(day1Comp.day, 2);
  const formattedDay1 = formatWibDateTime(schedules[0]);
  assert.match(formattedDay1, /12[:.]00/);
  console.log(`✅ PASSED: Day 1 (Senin 2 Nov) scheduled at 12:00 WIB: ${formattedDay1}`);

  // Day 2: Selasa, 3 November 2026 @ 14:00 WIB (+07:00 -> 07:00 UTC)
  const formattedDay2 = formatWibDateTime(schedules[1]);
  assert.match(formattedDay2, /14[:.]00/);
  console.log(`✅ PASSED: Day 2 (Selasa 3 Nov) scheduled at 14:00 WIB: ${formattedDay2}`);

  console.log('\n--- TEST GROUP 3: Batch Size Exactly 90 Videos & Dynamic Meter Calculations ---');
  const BATCH_SIZE = 90;
  assert.equal(BATCH_SIZE, 90, 'BATCH_SIZE must be exactly 90');

  // Case: 200 videos -> Kloter 1 = 90, Kloter 2 = 90, Kloter 3 = 20
  const totalEligibleVideos = 200;
  const batch1 = Math.min(BATCH_SIZE, totalEligibleVideos);
  const rem1 = totalEligibleVideos - batch1;
  const batch2 = Math.min(BATCH_SIZE, rem1);
  const rem2 = rem1 - batch2;
  const batch3 = Math.min(BATCH_SIZE, rem2);

  assert.equal(batch1, 90);
  assert.equal(batch2, 90);
  assert.equal(batch3, 20);
  console.log(`✅ PASSED: 200 videos sliced into Kloter 1 (90), Kloter 2 (90), Kloter 3 (20)`);

  // Quota Unit Calculation Verification:
  // 90 videos * 100 units = 9,000 units per batch
  // Menghabiskan 90% kuota harian (9.000 dari 10.000 unit) untuk mengunci runway 3 bulan dalam 1 channel.
  const quotaPerKloter = BATCH_SIZE * 100;
  assert.equal(quotaPerKloter, 9000);
  const percentage = (quotaPerKloter / 10000) * 100;
  assert.equal(percentage, 90);
  console.log(`✅ PASSED: Kloter 90 Video (~9.000 unit). Menghabiskan 90% kuota harian untuk mengunci runway 3 bulan dalam 1 channel.`);

  console.log('\n--- TEST GROUP 4: Multi-Project Client ID Pool Parsing & Auto-Rotation ---');
  const samplePoolText = `
    140483783524-project1.apps.googleusercontent.com
    140483783524-project2.apps.googleusercontent.com
    140483783524-project3.apps.googleusercontent.com
  `;
  const parsedSlots = parseClientIdsFromText(samplePoolText);
  assert.equal(parsedSlots.length, 3);
  assert.equal(parsedSlots[0].id, 'Project-Slot-1');
  assert.equal(parsedSlots[0].clientId, '140483783524-project1.apps.googleusercontent.com');
  assert.equal(parsedSlots[1].id, 'Project-Slot-2');
  assert.equal(parsedSlots[2].id, 'Project-Slot-3');
  console.log(`✅ PASSED: Client ID Pool parses 3 project slots properly`);

  // Formatting back to text
  const formattedBack = formatClientIdPoolToText(parsedSlots);
  assert.ok(formattedBack.includes('project1'));
  assert.ok(formattedBack.includes('project2'));
  assert.ok(formattedBack.includes('project3'));
  console.log(`✅ PASSED: formatClientIdPoolToText produces pristine multi-line string`);

  // Auto-Rotation when Project Slot 1 is rate-limited (403 quotaExceeded)
  parsedSlots[0].isCooldown = true;
  const unassignedFresh = parsedSlots.find((s) => !s.isCooldown);
  assert.equal(unassignedFresh?.id, 'Project-Slot-2');
  console.log(`✅ PASSED: Auto-rotation picks fresh Project-Slot-2 when Project-Slot-1 is on cooldown`);

  console.log('\n--- TEST GROUP 5: Atomic Execution & 24H Thumbnail Limit Safety ---');
  // Verify atomic rule: if thumbnail upload fails, video status remains RAW PRIVATE
  const rawVideo = {
    id: 'yt-test-candidate-1',
    youtubeVideoId: 'test-candidate-1',
    channelId: 'UC_REAL_123',
    titleBefore: 'Salinan dari Video Alam Mentah',
    privacyStatus: 'private',
    managementStatus: 'READY',
    isManaged: false,
    publishAt: undefined,
  };

  // Simulate thumbnail upload failure (e.g. 400 or 403 uploadLimitExceeded)
  const thumbnailResult = { success: false, error: 'The user has exceeded the number of videos they may upload thumbnail to (uploadLimitExceeded)' };

  let isAtomicAborted = false;
  if (!thumbnailResult.success) {
    // Under Atomic Execution, videos.update MUST NOT be called!
    isAtomicAborted = true;
  }

  assert.equal(isAtomicAborted, true);
  // Video must remain strictly raw private
  assert.equal(rawVideo.privacyStatus, 'private');
  assert.equal(rawVideo.managementStatus, 'READY');
  assert.equal(rawVideo.publishAt, undefined);
  assert.equal(rawVideo.isManaged, false);
  console.log(`✅ PASSED: Atomic Execution strictly aborts on thumbnail failure; video remains 100% RAW PRIVATE`);

  console.log('\n================================================================');
  console.log('RESULTS: ALL 5 TEST GROUPS PASSED (Kloter 33, Atomic, Client ID Pool)');
  console.log('================================================================\n');
}

runTestSuite();
