import { dbStore } from '../server/db.js';
import { youtubeAuthService } from '../server/youtubeAuthService.js';
import { youtubeDataService } from '../server/youtubeDataService.js';
import { workerService } from '../server/workerService.js';
import { getChannelScheduledAnchor } from '../src/utils/scheduleAndUnmanagedUtils.js';
import { calculateNextSchedules } from '../server/scheduleReconciliationService.js';
import type { Channel, ManagedVideo, Phase3AutomationJob } from '../src/types/index.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    failed++;
  } else {
    console.log(`✅ PASSED: ${msg}`);
    passed++;
  }
}

console.log('================================================================');
console.log('AMG CHANNEL ID NORMALIZATION & ANCHOR SCHEDULE TEST SUITE');
console.log('================================================================');

// Save backup of original saveToDisk to avoid polluting amg-database.json during test
const origSaveToDisk = dbStore.saveToDisk;
(dbStore as any).saveToDisk = () => {};

try {
  // ============================================================================
  // TEST GROUP 1: Channel ID Normalization (Strip 'chan-') & Token Resolution
  // ============================================================================
  console.log('\n--- TEST GROUP 1: Channel ID Normalization (Strip "chan-") ---');

  const pureYtId = 'UCKJs5ZM4ruwDeuOfKOpJHHA';
  const chanPrefixedId = `chan-${pureYtId}`;

  // Store credentials under pure YouTube ID
  youtubeAuthService.storeCredentials(pureYtId, {
    channelId: pureYtId,
    accessToken: 'ya29.test_token_valid_pure_yt_id',
    refreshToken: '1//refresh_token_valid_pure_yt_id',
    tokenExpiresAt: Date.now() + 3600 * 1000,
    scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
  });

  // Test 1: Resolve credentials with both pure ID and chan- prefix
  const credsFromPure = youtubeAuthService.resolveStoredCredentials(pureYtId);
  const credsFromPrefixed = youtubeAuthService.resolveStoredCredentials(chanPrefixedId);

  assert(credsFromPure !== undefined, 'Credentials resolved via pure YouTube ID (UCKJs...)');
  assert(credsFromPrefixed !== undefined, 'Credentials resolved via chan- prefixed ID (chan-UCKJs...)');
  assert(credsFromPure?.accessToken === credsFromPrefixed?.accessToken, 'Both aliases point to the exact same OAuth access token');

  // Register channel in dbStore
  const channelRecord: Channel = {
    id: chanPrefixedId,
    youtubeChannelId: pureYtId,
    title: 'Channel Ambience Official',
    publishFrequency: '1/day',
    publishTime: '16:00',
    timezone: 'Asia/Jakarta',
    status: 'CONNECTED',
    connectedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dailyCapacityTarget: 70,
    maxDailyCapacity: 90,
  };
  dbStore.channels.set(chanPrefixedId, channelRecord);

  // Test 2: Channel lookup via dbStore
  const lookedUpByPure = dbStore.getChannelByYoutubeId(pureYtId);
  const lookedUpByTitle = dbStore.getChannelByIdOrTitle(pureYtId);
  const lookedUpByPrefixed = dbStore.getChannelByIdOrTitle(chanPrefixedId);

  assert(lookedUpByPure?.id === chanPrefixedId, 'Channel retrieved by pure YouTube ID in dbStore');
  assert(lookedUpByTitle?.youtubeChannelId === pureYtId, 'Channel retrieved by pure ID via getChannelByIdOrTitle');
  assert(lookedUpByPrefixed?.youtubeChannelId === pureYtId, 'Channel retrieved by prefixed ID via getChannelByIdOrTitle');

  // ============================================================================
  // TEST GROUP 2: Official Anchor Schedule Logic (publishAt)
  // ============================================================================
  console.log('\n--- TEST GROUP 2: Official Anchor Schedule Logic (publishAt) ---');

  // Video 1: Raw candidate 'Salinan dari A' (DILARANG menjadi titik acuan!)
  const rawVideo: ManagedVideo = {
    id: 'vid-raw-candidate-01',
    youtubeVideoId: 'raw-01',
    channelId: chanPrefixedId,
    channelTitle: 'Channel Ambience Official',
    titleBefore: 'Salinan dari A',
    titleAssigned: '',
    thumbnailBefore: '',
    thumbnailAssigned: '',
    originalUploadAt: '2026-10-01T10:00:00.000Z',
    processingStatus: 'processed',
    uploadStatus: 'processed',
    privacyStatus: 'private',
    publishAt: undefined, // belum terjadwal
    scheduledPublishAt: '2026-10-05T09:00:00.000Z', // draft tanggal yang tidak boleh jadi acuan
    managementStatus: 'READY',
    managementScope: 'REGULAR',
    isAmgEligible: true,
    isManaged: false,
    retryCount: 0,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  };

  // Video 2: Verified scheduled video from YouTube Studio: 28 Oktober 2026 @ 16:00 WIB (09:00 UTC)
  const scheduledVideo1: ManagedVideo = {
    id: 'vid-scheduled-01',
    youtubeVideoId: 'sched-01',
    channelId: pureYtId,
    channelTitle: 'Channel Ambience Official',
    titleBefore: 'Master Suasana Hujan 01',
    titleAssigned: 'Master Suasana Hujan 01',
    thumbnailBefore: '',
    thumbnailAssigned: '',
    originalUploadAt: '2026-09-01T10:00:00.000Z',
    processingStatus: 'processed',
    uploadStatus: 'processed',
    privacyStatus: 'private',
    publishAt: '2026-10-28T09:00:00.000Z', // 28 Oktober 16:00 WIB
    scheduledPublishAt: '2026-10-28T09:00:00.000Z',
    managementStatus: 'SCHEDULED',
    managementScope: 'EXCLUDED',
    isAmgEligible: false,
    isManaged: true,
    retryCount: 0,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  };

  // Video 3: Verified scheduled video furthest into future: 31 Oktober 2026 @ 16:00 WIB (09:00 UTC)
  const scheduledVideo2: ManagedVideo = {
    id: 'vid-scheduled-02',
    youtubeVideoId: 'sched-02',
    channelId: chanPrefixedId,
    channelTitle: 'Channel Ambience Official',
    titleBefore: 'Master Suasana Hutan 02',
    titleAssigned: 'Master Suasana Hutan 02',
    thumbnailBefore: '',
    thumbnailAssigned: '',
    originalUploadAt: '2026-09-02T10:00:00.000Z',
    processingStatus: 'processed',
    uploadStatus: 'processed',
    privacyStatus: 'private',
    publishAt: '2026-10-31T09:00:00.000Z', // 31 Oktober 16:00 WIB (Titik acuan terjauh!)
    scheduledPublishAt: '2026-10-31T09:00:00.000Z',
    managementStatus: 'SCHEDULED',
    managementScope: 'EXCLUDED',
    isAmgEligible: false,
    isManaged: true,
    retryCount: 0,
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
  };

  // Video 4: Another raw placeholder 'Copy of A' (DILARANG!)
  const rawVideo2: ManagedVideo = {
    id: 'vid-raw-candidate-02',
    youtubeVideoId: 'raw-02',
    channelId: pureYtId,
    channelTitle: 'Channel Ambience Official',
    titleBefore: 'Copy of A',
    titleAssigned: '',
    thumbnailBefore: '',
    thumbnailAssigned: '',
    originalUploadAt: '2026-10-02T10:00:00.000Z',
    processingStatus: 'processed',
    uploadStatus: 'processed',
    privacyStatus: 'private',
    publishAt: undefined,
    scheduledPublishAt: '2026-11-10T09:00:00.000Z',
    managementStatus: 'READY',
    managementScope: 'REGULAR',
    isAmgEligible: true,
    isManaged: false,
    retryCount: 0,
    createdAt: '2026-10-02T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
  };

  const testVideos = [rawVideo, scheduledVideo1, scheduledVideo2, rawVideo2];

  const anchorResult = getChannelScheduledAnchor(channelRecord, testVideos);

  assert(
    anchorResult.latestPublishAt === '2026-10-31T09:00:00.000Z',
    'Titik acuan terjauh terdeteksi tepat pada 31 Oktober 2026 (09:00 UTC = 16:00 WIB)'
  );
  assert(
    anchorResult.latestPublishAt !== '2026-10-05T09:00:00.000Z',
    'DILARANG: Tanggal dari video mentah "Salinan dari A" diabaikan sepenuhnya'
  );
  assert(
    anchorResult.latestPublishAt !== '2026-11-10T09:00:00.000Z',
    'DILARANG: Tanggal dari video mentah "Copy of A" diabaikan sepenuhnya'
  );
  assert(
    anchorResult.latestVideoTitle === 'Master Suasana Hutan 02',
    'Video acuan teridentifikasi benar sebagai Master Suasana Hutan 02'
  );

  // ============================================================================
  // TEST GROUP 3: Sequential Scheduling Continuation (+1 Day @ 16:00 WIB)
  // ============================================================================
  console.log('\n--- TEST GROUP 3: Sequential Scheduling Continuation (+1 Day @ 16:00 WIB) ---');

  const nextSlots = calculateNextSchedules(
    3,
    { mode: 'DAILY', times: ['16:00'], timezone: 'Asia/Jakarta' },
    anchorResult.latestPublishAt
  );

  assert(nextSlots.length === 3, 'Calculated exactly 3 consecutive schedule slots');
  assert(
    nextSlots[0].dateString === '2026-11-01' && nextSlots[0].timeString === '16:00',
    'Slot 1 dimulai tepat dari (Titik Acuan Terjauh + 1 Hari): 1 November 2026 16:00 WIB'
  );
  assert(
    nextSlots[1].dateString === '2026-11-02' && nextSlots[1].timeString === '16:00',
    'Slot 2 berlanjut bertahap +1 hari: 2 November 2026 16:00 WIB'
  );
  assert(
    nextSlots[2].dateString === '2026-11-03' && nextSlots[2].timeString === '16:00',
    'Slot 3 berlanjut bertahap +1 hari: 3 November 2026 16:00 WIB'
  );
  assert(
    nextSlots[0].isoPublishAt === '2026-11-01T09:00:00.000Z',
    'Slot 1 UTC timestamp is precisely 09:00:00.000Z (16:00 WIB)'
  );

  // ============================================================================
  // TEST GROUP 4: Real Worker Execution with Channel ID Normalization
  // ============================================================================
  console.log('\n--- TEST GROUP 4: Real Worker Execution with Channel ID Normalization ---');

  // Register a candidate video in dbStore for worker test
  const candidateForMutation: ManagedVideo = {
    id: 'vid-mut-candidate-real',
    youtubeVideoId: 'yt-mut-real-99',
    channelId: pureYtId, // pure ID in video
    channelTitle: 'Channel Ambience Official',
    titleBefore: 'Salinan dari A',
    titleAssigned: 'Master Judul Ambience #1',
    thumbnailBefore: '',
    thumbnailAssigned: '',
    originalUploadAt: '2026-10-25T10:00:00.000Z',
    processingStatus: 'processed',
    uploadStatus: 'processed',
    privacyStatus: 'private',
    managementStatus: 'READY',
    managementScope: 'REGULAR',
    isAmgEligible: true,
    isEnrolled: true,
    isManaged: false,
    retryCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  dbStore.videos.set(candidateForMutation.id, candidateForMutation);

  // Mock youtubeDataService methods for safe automated test environment
  const origUpdateTitleAndSched = youtubeDataService.updateVideoTitleAndSchedule;
  const callTracker = { putApiCalled: false };
  let putApiPayload: any = null;

  (youtubeDataService as any).updateVideoTitleAndSchedule = async (chanId: string, vidId: string, params: any) => {
    callTracker.putApiCalled = true;
    putApiPayload = { chanId, vidId, params };
    return { success: true, data: { id: vidId, status: { publishAt: params.publishAtIso } } };
  };

  // Job dispatched with chan- prefixed channelId
  const jobToExecute: Phase3AutomationJob = {
    id: 'job-test-real-mut-1',
    batchId: 'BAT-TEST-001',
    channelId: chanPrefixedId, // Prefixed ID sent from batch!
    videoId: candidateForMutation.id,
    payload: {
      title: 'Master Judul Ambience #1',
      description: 'Relaxing soundscape',
      tags: ['ambience', 'sleep'],
      scheduledPublishAt: nextSlots[0].isoPublishAt,
      thumbnailUrl: '',
    },
    snapshot: {
      videoId: candidateForMutation.id,
      youtubeVideoId: candidateForMutation.youtubeVideoId,
      titleBefore: 'Salinan dari A',
      thumbnailBefore: '',
      privacyStatusBefore: 'private',
      capturedAt: new Date().toISOString(),
      batchId: 'BAT-TEST-001',
    },
    status: 'PENDING',
    retryCount: 0,
    maxRetries: 3,
    nextRunAt: Date.now(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mutResult = await workerService.executeRealJobMutation(jobToExecute);

  assert(mutResult.success === true, 'Worker executed mutation successfully');
  assert(callTracker.putApiCalled === true, 'Real YouTube Data API v3 PUT /videos was called');
  assert(putApiPayload.params.title === 'Master Judul Ambience #1', 'Mutated title matches deterministic Master Judul');
  assert(putApiPayload.params.publishAtIso === '2026-11-01T09:00:00.000Z', 'Scheduled publishAt is strictly 1 Nov 2026 16:00 WIB (09:00 UTC)');

  // Verify local video state is updated immediately from 'Salinan dari A' to Master Judul
  const updatedVid = dbStore.videos.get(candidateForMutation.id);
  assert(updatedVid?.titleBefore === 'Master Judul Ambience #1', 'Local video title replaced from "Salinan dari A"');
  assert(updatedVid?.publishAt === '2026-11-01T09:00:00.000Z', 'Local video publishAt populated with target schedule');
  assert(updatedVid?.managementStatus === 'SCHEDULED', 'Local video moved to SCHEDULED');

  // Restore mocks and clean test data
  (youtubeDataService as any).updateVideoTitleAndSchedule = origUpdateTitleAndSched;
  dbStore.channels.delete(chanPrefixedId);
  dbStore.channels.delete(pureYtId);
  dbStore.videos.delete(candidateForMutation.id);
  youtubeAuthService.revokeCredentials(pureYtId);
  youtubeAuthService.revokeCredentials(chanPrefixedId);

} finally {
  (dbStore as any).saveToDisk = origSaveToDisk;
}

console.log('================================================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
}
