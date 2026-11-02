/**
 * Unit Test for Elimination of Fake Limit Checkpoints & "User-Stopped" Badges
 */

import { workerClient } from '../src/services/workerClient.ts';
import { clearFakeLockCheckpoints } from '../src/utils/videoStorage.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✅ PASSED: ${msg}`);
    passed++;
  } else {
    console.error(`❌ FAILED: ${msg}`);
    failed++;
  }
}

// Mock localStorage & sessionStorage for testing
class MockStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const mockLocal = new MockStorage();
const mockSession = new MockStorage();
(globalThis as any).localStorage = mockLocal;
(globalThis as any).sessionStorage = mockSession;

async function runTestSuite() {
  console.log('================================================================');
  console.log('ELIMINATION OF FAKE LIMIT & USER-STOPPED BADGES TEST SUITE');
  console.log('================================================================');

  // TEST 1: Permanent Removal of Fake Lock & Checkpoint Keys
  mockLocal.setItem('amg_thumbnail_limit_reached', 'true');
  mockLocal.setItem('amg_checkpoint_lock', 'locked');
  mockLocal.setItem('amg_thumbnail_limit_paused', JSON.stringify({ reason: 'fake_limit' }));
  mockSession.setItem('amg_checkpoint_lock', 'locked');

  clearFakeLockCheckpoints();

  assert(mockLocal.getItem('amg_thumbnail_limit_reached') === null, 'amg_thumbnail_limit_reached is permanently removed');
  assert(mockLocal.getItem('amg_checkpoint_lock') === null, 'amg_checkpoint_lock is permanently removed from localStorage');
  assert(mockLocal.getItem('amg_thumbnail_limit_paused') === null, 'amg_thumbnail_limit_paused is permanently removed from localStorage');
  assert(mockSession.getItem('amg_checkpoint_lock') === null, 'amg_checkpoint_lock is permanently removed from sessionStorage');

  // TEST 2: Stopped By User Flag Discipline
  workerClient.resetStop();
  assert(!workerClient.isStoppedByUser(), 'Worker is NOT stopped by user on reset');
  assert(!workerClient.shouldStopWorker(), 'Worker shouldStopWorker is false on reset');

  // Simulate explicit user stop
  workerClient.stopWorker();
  assert(workerClient.isStoppedByUser(), 'Worker is marked stopped by user when stopWorker() is called');
  assert(workerClient.shouldStopWorker(), 'shouldStopWorker() is true when stopped by user');

  // Reset again
  workerClient.resetStop();
  assert(!workerClient.isStoppedByUser(), 'isStoppedByUser is cleared on reset');
  assert(!workerClient.shouldStopWorker(), 'shouldStopWorker is false on reset');

  // TEST 3: YouTube Thumbnail Limit Error Code Detection (Official 403 vs Local/Generic Errors)
  // Mock global fetch to test executeYouTubeThumbnailSet logic
  const originalFetch = globalThis.fetch;

  // 3a. Generic 400 Bad Request error
  globalThis.fetch = async () => {
    return {
      status: 400,
      ok: false,
      json: async () => ({
        error: { message: 'Invalid image dimensions', status: 'INVALID_ARGUMENT' },
      }),
    } as any;
  };

  const dummyBlob = new Blob(['A'.repeat(200)], { type: 'image/jpeg' });
  const genericErrRes = await workerClient.executeYouTubeThumbnailSet('vid-123', dummyBlob, 'fake-token');
  assert(genericErrRes.success === false, 'Generic error returns success: false');
  assert(genericErrRes.isUploadLimitExceeded === false, 'Generic 400 is NOT marked as uploadLimitExceeded');

  // 3b. Network error (fetch rejects)
  globalThis.fetch = async () => {
    throw new Error('Failed to fetch / network timeout');
  };

  const netErrRes = await workerClient.executeYouTubeThumbnailSet('vid-123', dummyBlob, 'fake-token');
  assert(netErrRes.success === false, 'Network error returns success: false');
  assert(netErrRes.isUploadLimitExceeded === false, 'Network error is NOT marked as uploadLimitExceeded');

  // 3c. Official YouTube HTTP 403 uploadLimitExceeded
  globalThis.fetch = async () => {
    return {
      status: 403,
      ok: false,
      json: async () => ({
        error: {
          code: 403,
          message: 'The user has exceeded the number of videos they may upload thumbnail to.',
          errors: [{ reason: 'uploadLimitExceeded', domain: 'youtube.thumbnail' }],
        },
      }),
    } as any;
  };

  const officialLimitRes = await workerClient.executeYouTubeThumbnailSet('vid-123', dummyBlob, 'fake-token');
  assert(officialLimitRes.success === false, 'Official limit returns success: false');
  assert(officialLimitRes.isUploadLimitExceeded === true, 'Official YouTube 403 uploadLimitExceeded is accurately detected');

  // Restore fetch
  globalThis.fetch = originalFetch;

  console.log('================================================================');
  console.log(`TOTAL PASSED: ${passed}`);
  console.log(`TOTAL FAILED: ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
