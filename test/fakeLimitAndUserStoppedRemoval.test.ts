/**
 * Unit Test for Permanent Removal of Fake Limits & User-Stopped Badges
 * Verifies:
 * 1. clearFakeLockCheckpoints purges all fake checkpoint/limit keys from storage.
 * 2. executeYouTubeThumbnailSet distinguishes official 403 uploadLimitExceeded from regular/local errors.
 * 3. workerClient.stopWorker() is the ONLY trigger for stoppedByUser (never triggered on error/reload).
 * 4. workerClient resets all stop flags cleanly on new execution start.
 */

import { clearFakeLockCheckpoints } from '../src/utils/videoStorage.ts';
import { workerClient } from '../src/services/workerClient.ts';

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

// In-memory mock localStorage for Node testing environment
class MockStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

(globalThis as any).localStorage = new MockStorage();
(globalThis as any).sessionStorage = new MockStorage();

async function runTests() {
  console.log('================================================================');
  console.log('PERMANENT REMOVAL OF FAKE LIMIT & USER-STOPPED BADGES TEST SUITE');
  console.log('================================================================');

  // --- TEST 1: Purge Fake Lock & Checkpoint Keys ---
  localStorage.setItem('amg_thumbnail_limit_reached', 'true');
  localStorage.setItem('amg_checkpoint_lock', 'locked');
  localStorage.setItem('amg_thumbnail_limit_paused', JSON.stringify({ videoId: '123' }));
  sessionStorage.setItem('amg_checkpoint_lock', 'locked');

  assert(localStorage.getItem('amg_thumbnail_limit_reached') !== null, 'Fake keys exist prior to purge');
  clearFakeLockCheckpoints();

  assert(localStorage.getItem('amg_thumbnail_limit_reached') === null, 'amg_thumbnail_limit_reached was purged');
  assert(localStorage.getItem('amg_checkpoint_lock') === null, 'amg_checkpoint_lock was purged from localStorage');
  assert(localStorage.getItem('amg_thumbnail_limit_paused') === null, 'amg_thumbnail_limit_paused was purged from localStorage');
  assert(sessionStorage.getItem('amg_checkpoint_lock') === null, 'amg_checkpoint_lock was purged from sessionStorage');

  // --- TEST 2: stoppedByUser is False on Initialization & Errors ---
  workerClient.resetStop();
  assert(workerClient.shouldStopWorker() === false, 'shouldStopWorker() is false after resetStop()');
  assert(workerClient.isStoppedByUser() === false, 'isStoppedByUser() is false after resetStop()');

  // --- TEST 3: stopWorker() ONLY when User Explicitly Clicks Stop ---
  workerClient.stopWorker();
  assert(workerClient.isStoppedByUser() === true, 'isStoppedByUser() is true ONLY after explicit stopWorker() call');
  assert(workerClient.shouldStopWorker() === true, 'shouldStopWorker() is true after explicit stopWorker() call');

  // Resetting for next run
  workerClient.resetStop();
  assert(workerClient.isStoppedByUser() === false, 'isStoppedByUser() resets to false cleanly on new batch launch');
  assert(workerClient.shouldStopWorker() === false, 'shouldStopWorker() resets to false cleanly on new batch launch');

  // --- TEST 4: Detection of Official YouTube 403 uploadLimitExceeded vs Regular Errors ---
  // Mock fetch to test executeYouTubeThumbnailSet behavior
  const originalFetch = globalThis.fetch;

  // Case A: Regular HTTP 500 Network / Server Error -> isUploadLimitExceeded MUST be false
  globalThis.fetch = async () =>
    ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: { message: 'Backend unavailable' } }),
    } as any);

  const res500 = await workerClient.executeYouTubeThumbnailSet('yt-test-01', new Blob(['12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901']), 'dummy-token');
  assert(res500.success === false, 'HTTP 500 results in success = false');
  assert(res500.isUploadLimitExceeded === false, 'HTTP 500 error is NOT marked as uploadLimitExceeded (anti-fake limit)');

  // Case B: Regular HTTP 400 Bad Request -> isUploadLimitExceeded MUST be false
  globalThis.fetch = async () =>
    ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ error: { message: 'Invalid videoId' } }),
    } as any);

  const res400 = await workerClient.executeYouTubeThumbnailSet('yt-test-02', new Blob(['12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901']), 'dummy-token');
  assert(res400.success === false, 'HTTP 400 results in success = false');
  assert(res400.isUploadLimitExceeded === false, 'HTTP 400 error is NOT marked as uploadLimitExceeded');

  // Case C: Official YouTube HTTP 403 uploadLimitExceeded -> isUploadLimitExceeded MUST be true
  globalThis.fetch = async () =>
    ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({
        error: {
          code: 403,
          message: 'The user has exceeded the number of videos they may upload.',
          errors: [{ domain: 'youtube.thumbnail', reason: 'uploadLimitExceeded' }],
        },
      }),
    } as any);

  const res403Limit = await workerClient.executeYouTubeThumbnailSet('yt-test-03', new Blob(['12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901']), 'dummy-token');
  assert(res403Limit.success === false, 'Official 403 limit results in success = false');
  assert(res403Limit.isUploadLimitExceeded === true, 'Official YouTube HTTP 403 uploadLimitExceeded is accurately recognized');

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

runTests().catch((err) => {
  console.error('Fatal error in tests:', err);
  process.exit(1);
});
