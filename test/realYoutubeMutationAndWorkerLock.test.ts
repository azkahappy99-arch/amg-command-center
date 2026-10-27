/**
 * Unit Test for Real YouTube Mutation & Single-Queue Worker Lock
 */

import { workerService } from '../server/workerService.js';
import { dbStore } from '../server/db.js';
import { youtubeDataService } from '../server/youtubeDataService.js';
import { youtubeAuthService } from '../server/youtubeAuthService.js';

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

async function runTests() {
  console.log('====================================================');
  console.log('AMG REAL YOUTUBE MUTATION & SINGLE WORKER LOCK TESTS');
  console.log('====================================================');

  // TEST 1: Single Active Worker Lock per channel
  const testChannelId = 'chan-test-worker-01';
  const lockAcquired1 = workerService.acquireWorkerLock(testChannelId, 'AMG-BATCH-0001');
  assert(lockAcquired1 === true, 'Worker lock acquired for first batch on channel');
  assert(workerService.isChannelWorkerActive(testChannelId) === true, 'Channel is marked as having active worker');

  // Attempting second lock on same channel with different batch ID must fail
  const lockAcquired2 = workerService.acquireWorkerLock(testChannelId, 'AMG-BATCH-0002');
  assert(lockAcquired2 === false, 'Second worker lock attempt on same channel is BLOCKED (Single Worker Lock)');

  // Release lock
  workerService.releaseWorkerLock(testChannelId);
  assert(workerService.isChannelWorkerActive(testChannelId) === false, 'Channel worker lock released successfully');

  // TEST 2: Local Video State Synchronization on 200 OK
  const testVideoId = 'yt-vid-mut-test-101';
  dbStore.videos.set(testVideoId, {
    id: testVideoId,
    youtubeVideoId: 'vid-mut-test-101',
    channelId: testChannelId,
    channelTitle: 'Test Ambience Channel',
    titleBefore: 'Salinan dari A',
    titleAssigned: '',
    thumbnailBefore: 'https://i.ytimg.com/vi/vid-mut-test-101/hqdefault.jpg',
    thumbnailAssigned: '',
    originalUploadAt: '2026-10-01T10:00:00.000Z',
    processingStatus: 'processed',
    privacyStatus: 'private',
    managementStatus: 'READY',
    managementScope: 'REGULAR',
    isAmgEligible: true,
    isManaged: false,
    isEnrolled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  dbStore.channels.set(testChannelId, {
    id: testChannelId,
    title: 'Test Ambience Channel',
    youtubeChannelId: 'UC_TEST_WORKER_01',
    status: 'CONNECTED',
    contentProfileId: 'profile-test',
    lastScheduledPublishAt: '2027-01-03T09:00:00.000Z',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  youtubeAuthService.storeCredentials(testChannelId, {
    channelId: testChannelId,
    accessToken: 'test-oauth-access-token-1234567890',
    tokenExpiresAt: Date.now() + 3600 * 1000,
    scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
  });

  // Mock real API call internally to simulate 200 OK
  const originalUpdate = (youtubeDataService as any).updateVideoTitleAndSchedule;
  (youtubeDataService as any).updateVideoTitleAndSchedule = async () => ({
    success: true,
    data: { id: 'vid-mut-test-101' },
  });

  const targetMasterTitle = 'T1 - Suasana Hujan Menenangkan Pengantar Tidur';
  const targetIsoSchedule = '2027-01-04T09:00:00.000Z'; // 4 Jan 2027 16:00 WIB

  const job = {
    id: 'job-test-101',
    batchId: 'AMG-BATCH-0001',
    channelId: testChannelId,
    videoId: testVideoId,
    status: 'PENDING' as const,
    snapshot: {
      videoId: testVideoId,
      youtubeVideoId: 'vid-mut-test-101',
      titleBefore: 'Salinan dari A',
      thumbnailBefore: '',
      privacyStatusBefore: 'private',
      capturedAt: new Date().toISOString(),
      batchId: 'AMG-BATCH-0001',
    },
    retryCount: 0,
    maxRetries: 3,
    nextRunAt: Date.now(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    payload: {
      title: targetMasterTitle,
      description: 'Relaxing sleep soundscape',
      tags: ['ambience', 'sleep'],
      scheduledPublishAt: targetIsoSchedule,
      thumbnailUrl: '',
    },
  };

  const result = await workerService.executeRealJobMutation(job);
  assert(result.success === true, 'Worker successfully executed mutation');

  const mutatedVideo = dbStore.videos.get(testVideoId)!;
  assert(mutatedVideo.titleBefore === targetMasterTitle, 'Video titleBefore changed from "Salinan dari A" to Master Title');
  assert(mutatedVideo.titleAssigned === targetMasterTitle, 'Video titleAssigned updated to Master Title');
  assert(mutatedVideo.publishAt === targetIsoSchedule, 'Video publishAt updated to target schedule');
  assert(mutatedVideo.managementStatus === 'SCHEDULED', 'Video moved to SCHEDULED (moved to "Video Terjadwal")');
  assert(mutatedVideo.isManaged === true, 'Video is marked as managed');

  // Verify persistent job created/completed
  const pJob = dbStore.automationJobs.get(job.id);
  assert(pJob !== undefined && pJob.status === 'completed', 'Persistent job marked as COMPLETED in dbStore.automationJobs');

  // Restore
  (youtubeDataService as any).updateVideoTitleAndSchedule = originalUpdate;

  console.log('====================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test runner failure:', err);
  process.exit(1);
});
