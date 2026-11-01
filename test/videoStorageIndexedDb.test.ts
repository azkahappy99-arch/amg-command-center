/**
 * Unit Test for AMG Dedicated Video Storage & Quota-Exceeded Protection
 * Database Name: 'amg_system_db'
 * Object Store: 'amg_cached_videos'
 */

import {
  safeSetItem,
  safeGetItem,
  safeRemoveItem,
  saveCachedVideosToIdb,
  getCachedVideosFromIdb,
  deleteCachedVideosFromIdb,
  purgeLegacyVideoLocalStorageKeys,
} from '../src/utils/videoStorage.ts';
import { ManagedVideo } from '../src/types/index.ts';

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
class MockLocalStorage {
  private store: Map<string, string> = new Map();
  public shouldThrowQuotaError = false;

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.shouldThrowQuotaError) {
      const err = new Error('QuotaExceededError: Setting the value exceeded the quota.');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }
}

const mockStorage = new MockLocalStorage();
(globalThis as any).localStorage = mockStorage;

async function runTests() {
  console.log('================================================================');
  console.log('AMG VIDEO STORAGE & INDEXEDDB ENGINE TESTS');
  console.log('================================================================');

  const testChannelId = 'UC_REAL_TEST_CHANNEL_9000';
  const cleanChanId = testChannelId.replace(/^chan-/, '');

  // 1. safeSetItem Normal Operation
  mockStorage.shouldThrowQuotaError = false;
  const resSuccess = safeSetItem('test_key_1', JSON.stringify({ ok: true }));
  assert(resSuccess === true, 'safeSetItem succeeds on normal storage write');
  assert(mockStorage.getItem('test_key_1') !== null, 'Value exists in storage');

  // 2. safeSetItem QuotaExceededError Resilience (Anti-Crash)
  mockStorage.shouldThrowQuotaError = true;
  let didCrash = false;
  try {
    const resBlocked = safeSetItem('heavy_key', 'A'.repeat(1000));
    assert(resBlocked === false, 'safeSetItem caught QuotaExceededError and returned false gracefully');
  } catch {
    didCrash = true;
  }
  assert(!didCrash, 'safeSetItem NEVER throws uncaught exception when quota is exceeded');
  mockStorage.shouldThrowQuotaError = false;

  // 3. safeGetItem & safeRemoveItem
  safeSetItem('test_key_2', JSON.stringify({ hello: 'world' }));
  const retrieved = safeGetItem('test_key_2', { hello: 'fallback' });
  assert(retrieved.hello === 'world', 'safeGetItem parses stored JSON correctly');
  const fallbackVal = safeGetItem('non_existent_key', { fallback: 123 });
  assert(fallbackVal.fallback === 123, 'safeGetItem returns fallback when key does not exist');

  safeRemoveItem('test_key_2');
  assert(mockStorage.getItem('test_key_2') === null, 'safeRemoveItem successfully removes key');

  // 4. Save and Retrieve Real ManagedVideo records in Video Cache Store
  const sampleVideos = Array.from({ length: 90 }, (_, i) => ({
    id: `vid-real-${i + 1}`,
    youtubeVideoId: `yt-vid-${i + 1}`,
    channelId: testChannelId,
    title: `Tutorial YouTube Real Automation Kloter 90 Part ${i + 1}`,
    titleBefore: `Video Mentah ${i + 1}`,
    thumbnailUrl: `https://i.ytimg.com/vi/yt-vid-${i + 1}/hqdefault.jpg`,
    status: 'PRIVATE',
    managementStatus: 'SCHEDULED' as const,
    privacyStatus: 'private',
    uploadDate: new Date(Date.now() - i * 86400000).toISOString(),
    isRealYouTube: true,
  })) as unknown as ManagedVideo[];

  await saveCachedVideosToIdb(testChannelId, sampleVideos);

  // Retrieve by original ID
  const fetchedByExact = await getCachedVideosFromIdb(testChannelId);
  assert(Array.isArray(fetchedByExact) && fetchedByExact.length === 90, 'Successfully retrieved 90 videos by exact channel ID');
  assert(fetchedByExact[0].id === 'vid-real-1', 'First video ID matches expected');

  // Retrieve by clean ID
  const fetchedByClean = await getCachedVideosFromIdb(cleanChanId);
  assert(Array.isArray(fetchedByClean) && fetchedByClean.length === 90, 'Successfully retrieved 90 videos by clean ID');

  // Retrieve by chan- prefixed ID
  const fetchedByPrefixed = await getCachedVideosFromIdb(`chan-${cleanChanId}`);
  assert(Array.isArray(fetchedByPrefixed) && fetchedByPrefixed.length === 90, 'Successfully retrieved 90 videos by chan- prefixed ID');

  // 5. Delete Cached Videos
  await deleteCachedVideosFromIdb(testChannelId);
  const fetchedAfterDelete = await getCachedVideosFromIdb(testChannelId);
  assert(fetchedAfterDelete.length === 0, 'Cached videos deleted cleanly on deleteCachedVideosFromIdb');

  // 6. Purge Legacy amg_real_videos_* keys and Auto-Migrate
  const legacyChan = 'UC_LEGACY_MIGRATION_CHAN';
  const legacyVideos = [
    {
      id: 'legacy-vid-01',
      youtubeVideoId: 'legacy-yt-01',
      channelId: legacyChan,
      title: 'Legacy Video Migrated',
      status: 'PRIVATE',
      managementStatus: 'SCHEDULED' as const,
      privacyStatus: 'private',
      isRealYouTube: true,
    },
  ] as unknown as ManagedVideo[];

  mockStorage.setItem(`amg_real_videos_${legacyChan}`, JSON.stringify(legacyVideos));
  assert(mockStorage.getItem(`amg_real_videos_${legacyChan}`) !== null, 'Legacy key exists prior to purge');

  purgeLegacyVideoLocalStorageKeys();

  assert(mockStorage.getItem(`amg_real_videos_${legacyChan}`) === null, 'Legacy key was purged from localStorage');
  const migratedVideos = await getCachedVideosFromIdb(legacyChan);
  assert(migratedVideos.length === 1 && migratedVideos[0].id === 'legacy-vid-01', 'Legacy videos auto-migrated into video cache store');

  console.log('================================================================');
  console.log(`TOTAL PASSED: ${passed}`);
  console.log(`TOTAL FAILED: ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
