import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_WEEKLY_SCHEDULE,
  GLOBAL_WEEKLY_SCHEDULE,
  DEFAULT_DAY_SCHEDULE,
  resolveTargetDayPublishTime,
  getWibTimeString,
  getWibCalendarComponents,
  createWibPublishAt,
  generateSequentialSchedulesWithDayConfig,
  getChannelDaySchedule,
  saveChannelDaySchedule,
} from '../src/utils/dayScheduleUtils.ts';
import { Channel } from '../src/types/index.ts';

// Setup minimal localStorage mock for Node.js test environment
const storageMock: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => storageMock[k] || null,
  setItem: (k: string, v: string) => { storageMock[k] = v; },
  removeItem: (k: string) => { delete storageMock[k]; },
  clear: () => { Object.keys(storageMock).forEach((k) => delete storageMock[k]); },
};
(globalThis as any).window = globalThis;

describe('Weekly Schedule Preset & Custom Channel Override System', () => {
  it('1. DEFAULT_WEEKLY_SCHEDULE matches exact analytics peak hours requirement', () => {
    assert.strictEqual(DEFAULT_WEEKLY_SCHEDULE[0], '15:00', 'Minggu must be 15:00 WIB');
    assert.strictEqual(DEFAULT_WEEKLY_SCHEDULE[1], '16:00', 'Senin must be 16:00 WIB');
    assert.strictEqual(DEFAULT_WEEKLY_SCHEDULE[2], '16:00', 'Selasa must be 16:00 WIB');
    assert.strictEqual(DEFAULT_WEEKLY_SCHEDULE[3], '16:00', 'Rabu must be 16:00 WIB');
    assert.strictEqual(DEFAULT_WEEKLY_SCHEDULE[4], '16:00', 'Kamis must be 16:00 WIB');
    assert.strictEqual(DEFAULT_WEEKLY_SCHEDULE[5], '14:30', 'Jumat must be 14:30 WIB');
    assert.strictEqual(DEFAULT_WEEKLY_SCHEDULE[6], '15:30', 'Sabtu must be 15:30 WIB');
    assert.strictEqual(GLOBAL_WEEKLY_SCHEDULE, DEFAULT_WEEKLY_SCHEDULE);
  });

  it('2. Opsi 1: Channel with useGlobalPreset = true (or undefined) strictly uses global preset', () => {
    const globalChannel: Partial<Channel> = {
      id: 'chan-alpha',
      title: 'Alpha Channel',
      useGlobalPreset: true,
      customWeeklySchedule: { 1: '09:00', 5: '08:00' }, // even if custom was previously stored, global takes precedence
    };

    assert.strictEqual(resolveTargetDayPublishTime(0, globalChannel as Channel), '15:00'); // Min
    assert.strictEqual(resolveTargetDayPublishTime(1, globalChannel as Channel), '16:00'); // Sen
    assert.strictEqual(resolveTargetDayPublishTime(2, globalChannel as Channel), '16:00'); // Sel
    assert.strictEqual(resolveTargetDayPublishTime(3, globalChannel as Channel), '16:00'); // Rab
    assert.strictEqual(resolveTargetDayPublishTime(4, globalChannel as Channel), '16:00'); // Kam
    assert.strictEqual(resolveTargetDayPublishTime(5, globalChannel as Channel), '14:30'); // Jum
    assert.strictEqual(resolveTargetDayPublishTime(6, globalChannel as Channel), '15:30'); // Sab

    const undefinedChannel: Partial<Channel> = {
      id: 'chan-beta',
      title: 'Beta Channel',
    };
    assert.strictEqual(resolveTargetDayPublishTime(5, undefinedChannel as Channel), '14:30');
    assert.strictEqual(resolveTargetDayPublishTime(6, undefinedChannel as Channel), '15:30');
  });

  it('3. Opsi 2: Channel with useGlobalPreset = false overrides hours per day independently', () => {
    const customChannel: Partial<Channel> = {
      id: 'chan-custom',
      title: 'Custom Override Channel',
      useGlobalPreset: false,
      customWeeklySchedule: {
        0: '19:00', // Min kustom
        1: '12:00', // Sen kustom
        2: '12:00', // Sel kustom
        3: '18:00', // Rab kustom
        4: '18:00', // Kam kustom
        5: '11:00', // Jum kustom
        6: '21:00', // Sab kustom
      },
    };

    assert.strictEqual(resolveTargetDayPublishTime(0, customChannel as Channel), '19:00');
    assert.strictEqual(resolveTargetDayPublishTime(1, customChannel as Channel), '12:00');
    assert.strictEqual(resolveTargetDayPublishTime(2, customChannel as Channel), '12:00');
    assert.strictEqual(resolveTargetDayPublishTime(3, customChannel as Channel), '18:00');
    assert.strictEqual(resolveTargetDayPublishTime(4, customChannel as Channel), '18:00');
    assert.strictEqual(resolveTargetDayPublishTime(5, customChannel as Channel), '11:00');
    assert.strictEqual(resolveTargetDayPublishTime(6, customChannel as Channel), '21:00');

    // Isolation check: another channel remains unaffected on global preset
    const otherChannel: Partial<Channel> = {
      id: 'chan-other',
      useGlobalPreset: true,
    };
    assert.strictEqual(resolveTargetDayPublishTime(1, otherChannel as Channel), '16:00');
    assert.strictEqual(resolveTargetDayPublishTime(5, otherChannel as Channel), '14:30');
  });

  it('4. ISO 8601 publishAt calculation and getWibTimeString accuracy', () => {
    // 2026-11-06 is a Friday
    const isoUtcStr = createWibPublishAt(2026, 10, 6, '14:30');
    // Offset WIB (+07:00) converted to UTC '...Z'
    assert.ok(isoUtcStr.endsWith('Z'), 'ISO string must end with Z');
    
    // In UTC, 14:30 WIB is 07:30 UTC
    assert.ok(isoUtcStr.includes('T07:30:00.000Z'), `Expected 07:30:00 UTC, got ${isoUtcStr}`);

    // getWibTimeString should extract 14:30
    assert.strictEqual(getWibTimeString(isoUtcStr), '14:30');

    // 2026-11-07 is a Saturday, 15:30 WIB -> 08:30 UTC
    const isoSat = createWibPublishAt(2026, 10, 7, '15:30');
    assert.ok(isoSat.includes('T08:30:00.000Z'), `Expected 08:30:00 UTC, got ${isoSat}`);
    assert.strictEqual(getWibTimeString(isoSat), '15:30');

    // 2026-11-08 is a Sunday, 15:00 WIB -> 08:00 UTC
    const isoSun = createWibPublishAt(2026, 10, 8, '15:00');
    assert.ok(isoSun.includes('T08:00:00.000Z'), `Expected 08:00:00 UTC, got ${isoSun}`);
    assert.strictEqual(getWibTimeString(isoSun), '15:00');
  });

  it('5. Sequential schedule generation respects day-specific hours', () => {
    // Anchor on Wednesday 2026-11-04T09:00:00.000Z (16:00 WIB)
    const anchor = '2026-11-04T09:00:00.000Z';
    const slots = generateSequentialSchedulesWithDayConfig(7, anchor, undefined, { useGlobalPreset: true } as Channel);

    assert.strictEqual(slots.length, 7);

    // Slot 0 should be Kamis (Day 4) -> 16:00 WIB
    assert.strictEqual(getWibTimeString(slots[0]), '16:00');

    // Slot 1 should be Jumat (Day 5) -> 14:30 WIB
    assert.strictEqual(getWibTimeString(slots[1]), '14:30');

    // Slot 2 should be Sabtu (Day 6) -> 15:30 WIB
    assert.strictEqual(getWibTimeString(slots[2]), '15:30');

    // Slot 3 should be Minggu (Day 0) -> 15:00 WIB
    assert.strictEqual(getWibTimeString(slots[3]), '15:00');

    // Slot 4 should be Senin (Day 1) -> 16:00 WIB
    assert.strictEqual(getWibTimeString(slots[4]), '16:00');
  });

  it('6. saveChannelDaySchedule & getChannelDaySchedule persistence test', () => {
    const channelId = 'chan-test-persistence';
    
    // Save as Opsi 1 (Global)
    saveChannelDaySchedule(channelId, DEFAULT_DAY_SCHEDULE, true, DEFAULT_WEEKLY_SCHEDULE, true);
    assert.strictEqual(storageMock[`amg_use_global_preset_test-persistence`], 'true');
    const readGlobal = getChannelDaySchedule(channelId);
    assert.strictEqual(readGlobal.jumat, '14:30');
    assert.strictEqual(readGlobal.sabtu, '15:30');
    assert.strictEqual(readGlobal.minggu, '15:00');

    // Save as Opsi 2 (Custom Override)
    const customConfig = {
      senin: '10:00',
      selasa: '11:00',
      rabu: '12:00',
      kamis: '13:00',
      jumat: '09:00',
      sabtu: '20:00',
      minggu: '22:00',
    };
    saveChannelDaySchedule(channelId, customConfig, false, undefined, false);
    assert.strictEqual(storageMock[`amg_use_global_preset_test-persistence`], 'false');
    const readCustom = getChannelDaySchedule(channelId);
    assert.strictEqual(readCustom.jumat, '09:00');
    assert.strictEqual(readCustom.sabtu, '20:00');
    assert.strictEqual(readCustom.minggu, '22:00');
  });
});
