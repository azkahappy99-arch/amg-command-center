import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  incrementQuota,
  getQuotaUsage,
  getQuotaUsageSync,
  resetDailyQuota,
  clearMemoryQuotaCache,
  getPstDateString,
  QUOTA_COST_PER_VIDEO,
  DEFAULT_DAILY_LIMIT,
} from '../src/utils/quotaTracker.ts';

// Setup minimal localStorage and CustomEvent mock for Node.js test environment
const storageMock: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => storageMock[k] || null,
  setItem: (k: string, v: string) => { storageMock[k] = v; },
  removeItem: (k: string) => { delete storageMock[k]; },
  clear: () => { Object.keys(storageMock).forEach((k) => delete storageMock[k]); },
};

let lastDispatchedEvent: any = null;
(globalThis as any).window = {
  localStorage: (globalThis as any).localStorage,
  dispatchEvent: (event: any) => {
    lastDispatchedEvent = event;
    return true;
  },
};
(globalThis as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, params: any = {}) {
    this.type = type;
    this.detail = params.detail;
  }
};

describe('YouTube Data API Quota Tracker & Realtime Sync Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    clearMemoryQuotaCache();
    lastDispatchedEvent = null;
  });

  it('1. Initial quota starts at 0 / 10000 units on clean state', async () => {
    const quota = await getQuotaUsage();
    assert.strictEqual(quota.usedQuota, 0);
    assert.strictEqual(quota.dailyLimit, DEFAULT_DAILY_LIMIT);
    assert.strictEqual(quota.lastDatePst, getPstDateString());
  });

  it('2. Increment quota adds exactly 100 units per video execution', async () => {
    await resetDailyQuota();
    
    // Video 1 succeeds
    const q1 = await incrementQuota(QUOTA_COST_PER_VIDEO);
    assert.strictEqual(q1.usedQuota, 100);
    assert.strictEqual(q1.dailyLimit, 10000);

    // Video 2 succeeds
    const q2 = await incrementQuota(QUOTA_COST_PER_VIDEO);
    assert.strictEqual(q2.usedQuota, 200);

    // Video 3 succeeds
    const q3 = await incrementQuota(QUOTA_COST_PER_VIDEO);
    assert.strictEqual(q3.usedQuota, 300);

    // Check localStorage persistence
    const rawStored = localStorage.getItem('amg_quota_tracker');
    assert.ok(rawStored, 'amg_quota_tracker must be stored');
    const parsed = JSON.parse(rawStored!);
    assert.strictEqual(parsed.usedQuota, 300);

    // Check amg_settings sync
    const rawSettings = localStorage.getItem('amg_settings');
    if (rawSettings) {
      const s = JSON.parse(rawSettings);
      assert.strictEqual(s.apiQuotaUsed, 300);
    }
  });

  it('3. Realtime event amg_quota_updated is broadcasted with updated detail', async () => {
    await resetDailyQuota();
    lastDispatchedEvent = null;

    const result = await incrementQuota(100);
    assert.ok(lastDispatchedEvent, 'Event should be dispatched');
    assert.strictEqual(lastDispatchedEvent.type, 'amg_quota_updated');
    assert.strictEqual(lastDispatchedEvent.detail.usedQuota, 100);
    assert.strictEqual(lastDispatchedEvent.detail.usedQuota, result.usedQuota);
  });

  it('4. Auto-Reset Harian (Midnight PST cycle) resets used quota when calendar day changes', async () => {
    // Simulate quota recorded yesterday in PST
    const yesterdayDate = new Date(Date.now() - 26 * 60 * 60 * 1000);
    const yesterdayPst = getPstDateString(yesterdayDate);
    const todayPst = getPstDateString();

    // Verify yesterday and today PST are different
    assert.notStrictEqual(yesterdayPst, todayPst, 'Dates should differ across 26 hours');

    // Store stale yesterday usage of 9500 units
    localStorage.setItem(
      'amg_quota_tracker',
      JSON.stringify({
        usedQuota: 9500,
        dailyLimit: 10000,
        lastDatePst: yesterdayPst,
        updatedAt: yesterdayDate.toISOString(),
      })
    );

    // Fetch quota today: Should automatically detect Midnight PST passed and reset to 0
    const freshTodayQuota = await getQuotaUsage();
    assert.strictEqual(freshTodayQuota.usedQuota, 0, 'Used quota must reset to 0 for the new PST day');
    assert.strictEqual(freshTodayQuota.lastDatePst, todayPst, 'lastDatePst must be updated to today PST');

    // Next increment starts fresh from 100
    const postReset = await incrementQuota(100);
    assert.strictEqual(postReset.usedQuota, 100);
  });

  it('5. Synchronous fallback getQuotaUsageSync reads without delay', () => {
    const todayPst = getPstDateString();
    localStorage.setItem(
      'amg_quota_tracker',
      JSON.stringify({
        usedQuota: 4500,
        dailyLimit: 10000,
        lastDatePst: todayPst,
        updatedAt: new Date().toISOString(),
      })
    );

    const syncResult = getQuotaUsageSync();
    assert.strictEqual(syncResult.usedQuota, 4500);
    assert.strictEqual(syncResult.dailyLimit, 10000);
  });
});
