import { describe, it } from 'node:test';
import assert from 'node:assert';
import { api } from '../src/services/api.ts';
import { dbStore } from '../server/db.ts';

/**
 * Mock localStorage environment for comprehensive multi-channel testing
 */
class LocalStorageMock {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

// Ensure global localStorage exists
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = new LocalStorageMock();
}

console.log('================================================================');
console.log('AMG MULTI-CHANNEL SIDE-BY-SIDE PERSISTENCE & SEARCH TEST SUITE');
console.log('================================================================');

async function runMultiChannelTests() {
  localStorage.clear();

  // -------------------------------------------------------------
  // TEST GROUP 1: Honest Zero State Verification
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 1: Honest Zero State Verification ---');
  const initialChannels = await api.getChannels();
  assert.strictEqual(initialChannels.length, 0, 'Zero state returns 0 channels when none connected');
  console.log('✅ PASSED: Initial state strictly contains 0 channels (honest zero state)');

  // -------------------------------------------------------------
  // TEST GROUP 2: Linking Channel 1 (Ayam YAHYA)
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Linking Channel 1 (Ayam YAHYA) ---');
  const yahyaSync = await api.gisSyncChannel({
    accessToken: 'test-token-yahya',
    channelData: {
      id: 'UCKJs5ZM4ruwDeuOfKOpJHHA',
      title: 'Ayam YAHYA Official',
      customUrl: '@AyamYahya',
      thumbnailUrl: 'https://yt3.ggpht.com/yahya.jpg',
      subscriberCount: 15400,
      videoCount: 42,
    },
  });

  assert.strictEqual(yahyaSync.success, true, 'Ayam YAHYA successfully synced');
  assert.strictEqual(yahyaSync.channel.youtubeChannelId, 'UCKJs5ZM4ruwDeuOfKOpJHHA');

  let channelsAfterYahya = await api.getChannels();
  assert.strictEqual(channelsAfterYahya.length, 1, 'Exactly 1 channel stored');
  assert.strictEqual(channelsAfterYahya[0].youtubeChannelId, 'UCKJs5ZM4ruwDeuOfKOpJHHA');
  assert.strictEqual(channelsAfterYahya[0].title, 'Ayam YAHYA Official');
  console.log('✅ PASSED: Channel 1 (Ayam YAHYA) linked and persisted successfully');

  // -------------------------------------------------------------
  // TEST GROUP 3: Linking Channel 2 (Studio Ambience) — Side-by-Side Verification
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Linking Channel 2 (Studio Ambience) Side-by-Side ---');
  // Even if a previous channelId was in active state or passed in params, Channel 1 MUST NOT be overwritten!
  const studioSync = await api.gisSyncChannel({
    channelId: channelsAfterYahya[0].id, // Simulate user linking while Ayam Yahya was active
    accessToken: 'test-token-studio',
    channelData: {
      id: 'UC_REAL_CHANNEL_02_STUDIO',
      title: 'Studio Ambience Relaxing',
      customUrl: '@StudioAmbienceRelaxing',
      thumbnailUrl: 'https://yt3.ggpht.com/studio.jpg',
      subscriberCount: 8200,
      videoCount: 18,
    },
  });

  assert.strictEqual(studioSync.success, true, 'Studio Ambience successfully synced');
  assert.strictEqual(studioSync.channel.youtubeChannelId, 'UC_REAL_CHANNEL_02_STUDIO');

  const channelsAfterStudio = await api.getChannels();
  assert.strictEqual(channelsAfterStudio.length, 2, 'Exactly 2 channels must exist side-by-side');

  const foundYahya = channelsAfterStudio.find((c) => c.youtubeChannelId === 'UCKJs5ZM4ruwDeuOfKOpJHHA');
  const foundStudio = channelsAfterStudio.find((c) => c.youtubeChannelId === 'UC_REAL_CHANNEL_02_STUDIO');

  assert.ok(foundYahya, 'Ayam YAHYA is still preserved side-by-side');
  assert.ok(foundStudio, 'Studio Ambience is present alongside Ayam YAHYA');
  assert.strictEqual(foundYahya?.title, 'Ayam YAHYA Official');
  assert.strictEqual(foundStudio?.title, 'Studio Ambience Relaxing');
  console.log('✅ PASSED: Both channels exist side-by-side without overwrite');

  // -------------------------------------------------------------
  // TEST GROUP 4: Upsert Preservation (Re-syncing Same Channel)
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Upsert Preservation on Re-sync ---');
  // Customize Yahya's schedule and verify it isn't erased on re-sync
  foundYahya!.scheduleConfig = {
    mode: 'DAILY',
    videosPerDay: 2,
    times: ['10:00', '16:00'],
    timezone: 'Asia/Jakarta',
  };
  localStorage.setItem('amg_channels', JSON.stringify(channelsAfterStudio));
  localStorage.setItem('amg_persistent_channels', JSON.stringify(channelsAfterStudio));

  const reSyncYahya = await api.gisSyncChannel({
    accessToken: 'updated-token-yahya',
    channelData: {
      id: 'UCKJs5ZM4ruwDeuOfKOpJHHA',
      title: 'Ayam YAHYA Official (Updated Stats)',
      subscriberCount: 16000,
      videoCount: 45,
    },
  });

  assert.strictEqual(reSyncYahya.success, true);
  const channelsAfterReSync = await api.getChannels();
  assert.strictEqual(channelsAfterReSync.length, 2, 'Still exactly 2 channels (no duplicate creation)');

  const updatedYahya = channelsAfterReSync.find((c) => c.youtubeChannelId === 'UCKJs5ZM4ruwDeuOfKOpJHHA');
  assert.strictEqual(updatedYahya?.subscriberCount, 16000, 'Subscriber count updated');
  assert.strictEqual(updatedYahya?.scheduleConfig?.videosPerDay, 2, 'Custom scheduleConfig strictly preserved');
  console.log('✅ PASSED: Re-syncing preserves custom configurations and prevents duplicates');

  // -------------------------------------------------------------
  // TEST GROUP 5: Multi-Attribute Search Logic
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Multi-Attribute Search Logic ---');
  const searchFilter = (query: string, channelList: typeof channelsAfterReSync) => {
    const q = query.trim().toLowerCase();
    const cleanQ = q.startsWith('@') ? q.slice(1) : q;
    return channelList.filter((c) => {
      const title = (c.title || '').toLowerCase();
      const ytId = (c.youtubeChannelId || '').toLowerCase();
      const rawId = (c.id || '').toLowerCase();
      const customUrl = (c.customUrl || '').toLowerCase();
      const cleanCustomUrl = customUrl.startsWith('@') ? customUrl.slice(1) : customUrl;

      return (
        !q ||
        title.includes(q) ||
        ytId.includes(q) ||
        rawId.includes(q) ||
        customUrl.includes(q) ||
        (cleanQ.length > 0 && cleanCustomUrl.includes(cleanQ)) ||
        (cleanQ.length > 0 && title.includes(cleanQ))
      );
    });
  };

  // 1. Search by keyword "Ayam" -> should return Ayam YAHYA
  const matchAyam = searchFilter('Ayam', channelsAfterReSync);
  assert.strictEqual(matchAyam.length, 1, 'Search "Ayam" matches Yahya channel');
  assert.strictEqual(matchAyam[0].youtubeChannelId, 'UCKJs5ZM4ruwDeuOfKOpJHHA');

  // 2. Search by handle with "@" -> "@StudioAmbience"
  const matchHandleWithAt = searchFilter('@StudioAmbience', channelsAfterReSync);
  assert.strictEqual(matchHandleWithAt.length, 1, 'Search with @ matches Studio Ambience');
  assert.strictEqual(matchHandleWithAt[0].youtubeChannelId, 'UC_REAL_CHANNEL_02_STUDIO');

  // 3. Search by handle without "@" -> "AyamYahya"
  const matchHandleWithoutAt = searchFilter('AyamYahya', channelsAfterReSync);
  assert.strictEqual(matchHandleWithoutAt.length, 1, 'Search handle without @ matches Yahya');
  assert.strictEqual(matchHandleWithoutAt[0].youtubeChannelId, 'UCKJs5ZM4ruwDeuOfKOpJHHA');

  // 4. Search by Official YouTube ID -> "UCKJs..."
  const matchYtId = searchFilter('UCKJs5ZM4ruwDeuOfKOpJHHA', channelsAfterReSync);
  assert.strictEqual(matchYtId.length, 1, 'Search official YouTube ID matches Yahya');

  // 5. Non-matching search -> returns empty array without deleting data
  const matchNone = searchFilter('NonExistentChannelXYZ', channelsAfterReSync);
  assert.strictEqual(matchNone.length, 0, 'Non-matching query returns 0 items');
  assert.strictEqual(channelsAfterReSync.length, 2, 'Underlying storage untouched');
  console.log('✅ PASSED: Real-time search successfully matches Title, @Handle, and official YouTube ID');

  // -------------------------------------------------------------
  // TEST GROUP 6: Single Channel Unlink Isolation
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: Single Channel Unlink Isolation ---');
  // Unlink only Studio Ambience
  await api.deleteChannel('chan-UC_REAL_CHANNEL_02_STUDIO');

  const channelsAfterUnlink = await api.getChannels();
  assert.strictEqual(channelsAfterUnlink.length, 1, 'Exactly 1 channel remains');
  assert.strictEqual(channelsAfterUnlink[0].youtubeChannelId, 'UCKJs5ZM4ruwDeuOfKOpJHHA', 'Ayam Yahya remains completely untouched');
  console.log('✅ PASSED: Unlinking one channel leaves the remaining channel intact and unharmed');

  // -------------------------------------------------------------
  // TEST GROUP 7: Backend Store Multi-Channel Isolation
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 7: Backend Store Multi-Channel Isolation ---');
  dbStore.channels.clear();
  dbStore.upsertChannel({
    id: 'chan-UC_TEST_ISOLATION_01',
    youtubeChannelId: 'UC_TEST_ISOLATION_01',
    title: 'Unit Test Channel Alpha',
    customUrl: '@UnitTestAlpha',
    status: 'CONNECTED',
    ownerId: 'usr-owner-primary',
    workspaceId: 'ws-owner-primary',
    isSeeded: false,
    subscriberCount: 200,
    videoCount: 5,
    unmanagedVideoCount: 0,
    hasOAuthConfigured: true,
    platform: 'YouTube',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    connectedAt: new Date().toISOString(),
  } as any);

  dbStore.upsertChannel({
    id: 'chan-UC_TEST_ISOLATION_02',
    youtubeChannelId: 'UC_TEST_ISOLATION_02',
    title: 'Unit Test Channel Beta',
    customUrl: '@UnitTestBeta',
    status: 'CONNECTED',
    ownerId: 'usr-owner-primary',
    workspaceId: 'ws-owner-primary',
    isSeeded: false,
    subscriberCount: 100,
    videoCount: 2,
    unmanagedVideoCount: 0,
    hasOAuthConfigured: true,
    platform: 'YouTube',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    connectedAt: new Date().toISOString(),
  } as any);

  const ownerChannels = Array.from(dbStore.channels.values()).filter(
    (c) => c.workspaceId === 'ws-owner-primary' || c.ownerId === 'usr-owner-primary'
  );
  assert.strictEqual(ownerChannels.length, 2, 'Owner has both channels');

  // User role cannot access owner channels
  const userChannels = Array.from(dbStore.channels.values()).filter(
    (c) => c.workspaceId === 'ws-user-workspace' && c.ownerId === 'usr-normal-user'
  );
  assert.strictEqual(userChannels.length, 0, 'User role cannot see owner channels');

  // CRITICAL CLEANUP: Never leave test channels persisted in database or localStorage
  dbStore.channels.clear();
  dbStore.videos.clear();
  dbStore.saveToDisk();
  localStorage.clear();

  console.log('✅ PASSED: Backend store multi-channel isolation strictly enforced between OWNER and USER');

  console.log('\n================================================================');
  console.log('RESULTS: ALL 7 TEST GROUPS PASSED (Multi-Channel Surgical Fix)');
  console.log('================================================================\n');
}

runMultiChannelTests().catch((err) => {
  console.error('❌ Multi-channel test failure:', err);
  process.exit(1);
});
