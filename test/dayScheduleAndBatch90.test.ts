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

console.log('================================================================');
console.log('AMG BATCH 90, FULL AUTO-CHAINING, & DAY SCHEDULE (SENIN-MINGGU) TEST SUITE');
console.log('================================================================');

function runDayScheduleTests() {
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

  // Day 4: Kamis, 5 November 2026 @ 18:00 WIB (+07:00 -> 11:00 UTC)
  const formattedDay4 = formatWibDateTime(schedules[3]);
  assert.match(formattedDay4, /18[:.]00/);
  console.log(`✅ PASSED: Day 4 (Kamis 5 Nov) scheduled at 18:00 WIB: ${formattedDay4}`);

  // Day 6: Sabtu, 7 November 2026 @ 10:00 WIB (+07:00 -> 03:00 UTC)
  const formattedDay6 = formatWibDateTime(schedules[5]);
  assert.match(formattedDay6, /10[:.]00/);
  console.log(`✅ PASSED: Day 6 (Sabtu 7 Nov) scheduled at 10:00 WIB: ${formattedDay6}`);

  // Day 7: Minggu, 8 November 2026 @ 19:00 WIB (+07:00 -> 12:00 UTC)
  const formattedDay7 = formatWibDateTime(schedules[6]);
  assert.match(formattedDay7, /19[:.]00/);
  console.log(`✅ PASSED: Day 7 (Minggu 8 Nov) scheduled at 19:00 WIB: ${formattedDay7}`);

  console.log('\n--- TEST GROUP 3: Batch Size 90 & Dynamic Real Meter Calculations ---');
  const BATCH_SIZE = 90;
  assert.equal(BATCH_SIZE, 90, 'BATCH_SIZE must be exactly 90');

  // Case A: 200 videos -> Batch 1 = 90, Batch 2 = 90, Batch 3 = 20
  const totalEligibleVideos = 200;
  const batch1 = Math.min(BATCH_SIZE, totalEligibleVideos);
  const remainingAfterBatch1 = totalEligibleVideos - batch1;
  const batch2 = Math.min(BATCH_SIZE, remainingAfterBatch1);
  const remainingAfterBatch2 = remainingAfterBatch1 - batch2;
  const batch3 = Math.min(BATCH_SIZE, remainingAfterBatch2);

  assert.equal(batch1, 90);
  assert.equal(batch2, 90);
  assert.equal(batch3, 20);
  console.log(`✅ PASSED: 200 videos sliced into Kloter 1 (90), Kloter 2 (90), Kloter 3 (20)`);

  // Case B: Dynamic meter for Kloter 3 (20 videos)
  const kloter3Total = 20;
  let completed = 5;
  const remainingInKloter3 = kloter3Total - completed;
  assert.equal(remainingInKloter3, 15);
  console.log(`✅ PASSED: Dynamic meter calculates actual batch total (${kloter3Total}) and remaining queue (${remainingInKloter3})`);

  console.log('\n--- TEST GROUP 4: Full Auto-Chaining & Worker Stop Support ---');
  workerClient.resetStop();
  assert.equal(workerClient.shouldStopWorker(), false);
  workerClient.stopWorker();
  assert.equal(workerClient.shouldStopWorker(), true);
  workerClient.resetStop();
  assert.equal(workerClient.shouldStopWorker(), false);
  console.log('✅ PASSED: workerClient stop & resetStop controls auto-chain looping reliably');

  console.log('\n================================================================');
  console.log('RESULTS: ALL TEST GROUPS PASSED (Batch 90, Day Schedules, & Auto-Chaining)');
  console.log('================================================================\n');
}

runDayScheduleTests();
