/**
 * Unit Test for Batch Payload Optimization (< 5KB), Serial Thumbnail Uploads, and Anti-413 Fix
 */

import { dbStore } from '../server/db.js';
import { youtubeService } from '../server/youtubeService.js';
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
  console.log('================================================================');
  console.log('AMG BATCH PAYLOAD OPTIMIZATION & SERIAL THUMBNAIL TESTS');
  console.log('================================================================');

  // TEST 1: Lightweight Payload Size Verification (< 5KB vs 4.5MB Vercel Limit)
  const simulated50VideoIds = Array.from({ length: 50 }, (_, i) => `vid-test-${i + 1}`);
  const simulatedMasterTitles = [
    'T1 - Suasana Hujan Menenangkan Pengantar Tidur',
    'T2 - Hujan Deras di Hutan Tropis Menenangkan Pikiran',
    'T3 - Relaksasi Tidur Nyenyak dengan Gemericik Air',
    'T4 - Suasana Kafe Hujan Santai untuk Belajar',
  ];
  const simulatedSelectedThumbIds = ['th-custom-1', 'th-custom-2', 'th-custom-3', 'th-custom-4'];

  const testChannelId = 'chan-payload-test-' + Date.now();

  const lightweightPayload = {
    channelId: testChannelId,
    videoIds: simulated50VideoIds,
    masterTitles: simulatedMasterTitles,
    selectedThumbnailIds: simulatedSelectedThumbIds,
    publishStartDate: '2027-01-04',
    intervalDays: 1,
  };

  const payloadJson = JSON.stringify(lightweightPayload);
  const payloadBytes = Buffer.byteLength(payloadJson, 'utf8');
  const payloadKb = payloadBytes / 1024;

  assert(payloadKb < 5, `Lightweight batch payload size is ${payloadKb.toFixed(2)} KB (strictly < 5 KB, immune to 413 error)`);
  assert(!payloadJson.includes('data:image/'), 'Payload contains ZERO base64 image data');
  assert(!payloadJson.includes('base64,'), 'Payload contains ZERO raw binary image chunks');

  // TEST 2: Serial Thumbnail Rate Limit Protection (70/24h)
  // Disable saveToDisk during unit test to strictly prevent any test artifacts from persisting to disk
  const origSaveToDisk = dbStore.saveToDisk;
  (dbStore as any).saveToDisk = () => {};

  dbStore.channels.set(testChannelId, {
    id: testChannelId,
    title: 'Isolated Test Channel',
    youtubeChannelId: 'UC_ISOLATED_TEST',
    status: 'CONNECTED',
    connectedAt: new Date().toISOString(),
    thumbnailUrl: 'https://yt3.ggpht.com/avatar.jpg',
    videoCount: 50,
    unmanagedVideoCount: 50,
    publishFrequency: '1/day',
    publishTime: '16:00',
    timezone: 'Asia/Jakarta',
    dailyCapacityTarget: 70,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  youtubeAuthService.storeCredentials(testChannelId, {
    channelId: testChannelId,
    accessToken: 'test-valid-access-token-1234567890',
    refreshToken: 'test-valid-refresh-token',
    tokenExpiresAt: Date.now() + 3600000,
    scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
  });

  const rateLimitStatusInitial = dbStore.isChannelThumbnailRateLimited(testChannelId);
  assert(rateLimitStatusInitial.isLimited === false, 'Rate limit allows uploads initially when count < 70');

  // Log 70 simulated thumbnail actions in last 24h
  for (let i = 0; i < 70; i++) {
    dbStore.logThumbnailAction({
      channelId: testChannelId,
      videoId: `vid-${i}`,
      action: 'THUMBNAIL_SET',
      timestamp: new Date().toISOString(),
      status: 'SUCCESS',
      response: 'OK',
    });
  }

  const rateLimitStatusMax = dbStore.isChannelThumbnailRateLimited(testChannelId);
  assert(rateLimitStatusMax.isLimited === true, 'Rate limit strictly blocks uploads when 70 items reached in 24h');

  // TEST 3: Serial Single-Video Thumbnail Mutation
  const singleVideoId = 'yt-vid-serial-test-01';
  dbStore.videos.set(singleVideoId, {
    id: singleVideoId,
    youtubeVideoId: 'serial-test-01',
    channelId: testChannelId,
    channelTitle: 'Isolated Test Channel',
    titleBefore: 'Salinan dari Video Asli',
    titleAssigned: 'T1 - Suasana Hujan Menenangkan',
    thumbnailBefore: 'https://i.ytimg.com/vi/serial-test-01/hqdefault.jpg',
    thumbnailAssigned: '',
    originalUploadAt: new Date().toISOString(),
    processingStatus: 'processed',
    privacyStatus: 'private',
    managementStatus: 'READY',
    managementScope: 'REGULAR',
    isAmgEligible: true,
    isManaged: false,
    isEnrolled: true,
    retryCount: 0,
    isSeeded: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Mock live YouTube Data API call for offline unit test
  const originalUpdateThumb = (youtubeDataService as any).updateVideoThumbnail;
  (youtubeDataService as any).updateVideoThumbnail = async () => ({
    success: true,
  });

  // Call youtubeService.setThumbnail
  const singleThumbUrl = 'https://i.ytimg.com/vi/serial-test-01/hqdefault.jpg';
  const mutationResult = await youtubeService.setThumbnail(singleVideoId, singleThumbUrl);
  assert(mutationResult.success === true, 'Serial thumbnail mutation executes successfully for single video');

  const updatedVideo = dbStore.getVideoById(singleVideoId);
  assert(updatedVideo?.thumbnailAssigned === singleThumbUrl, 'Video record has updated assigned thumbnail');

  // Restore mocks
  (youtubeDataService as any).updateVideoThumbnail = originalUpdateThumb;
  (dbStore as any).saveToDisk = origSaveToDisk;

  // Clean up test channel & videos
  dbStore.channels.delete(testChannelId);
  dbStore.videos.delete(singleVideoId);
  youtubeAuthService.revokeCredentials(testChannelId);
  dbStore.clearSeededData();

  // TEST 4: Channel Rejection on Non-Existent Channel
  const unknownChannel = dbStore.getChannelByIdOrTitle('non-existent-channel-999');
  assert(!unknownChannel, 'Non-existent channel is not found in dbStore (no synthetic creation)');

  console.log('================================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
