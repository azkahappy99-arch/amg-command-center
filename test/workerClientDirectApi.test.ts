import {
  workerClient,
  dataUrlToBlob,
} from '../src/services/workerClient.js';
import type { Channel, ManagedVideo, MasterTitle, MasterThumbnail } from '../src/types/index.js';

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
console.log('AMG CLIENT-SIDE DIRECT YOUTUBE API SERIAL WORKER TEST SUITE');
console.log('================================================================');

// Mock localStorage in Node environment
const mockStorage: Record<string, string> = {};
(global as any).localStorage = {
  getItem: (k: string) => mockStorage[k] || null,
  setItem: (k: string, v: string) => {
    mockStorage[k] = v;
  },
  removeItem: (k: string) => {
    delete mockStorage[k];
  },
  clear: () => {
    for (const k in mockStorage) delete mockStorage[k];
  },
};

(global as any).window = {
  dispatchEvent: () => {},
};
(global as any).CustomEvent = class {
  detail: any;
  constructor(_name: string, opts: any) {
    this.detail = opts?.detail;
  }
};

async function runTests() {
  // ============================================================================
  // TEST GROUP 1: DataURL to Binary Blob Conversion
  // ============================================================================
  console.log('\n--- TEST GROUP 1: DataURL to Binary Blob Conversion ---');

  // Minimal 1x1 pixel base64 jpeg
  const sampleDataUrl =
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

  const blob = dataUrlToBlob(sampleDataUrl);
  assert(blob instanceof Blob, 'dataUrlToBlob returns standard Blob instance');
  assert(blob.type === 'image/jpeg', 'Blob has Content-Type "image/jpeg"');
  assert(blob.size > 0, `Blob has binary byte size (${blob.size} bytes)`);

  // ============================================================================
  // TEST GROUP 2: Official Anchor Schedule Verification (Titik Acuan Terjauh)
  // ============================================================================
  console.log('\n--- TEST GROUP 2: Official Anchor Schedule Verification ---');

  const channelId = 'UCKJs5ZM4ruwDeuOfKOpJHHA';

  const mockVideos: ManagedVideo[] = [
    // Video A: Raw candidate (DILARANG jadi acuan)
    {
      id: 'vid-cand-1',
      youtubeVideoId: 'raw-01',
      channelId,
      titleBefore: 'Salinan dari A',
      titleAssigned: '',
      thumbnailBefore: '',
      thumbnailAssigned: '',
      originalUploadAt: '2026-10-15T00:00:00.000Z',
      processingStatus: 'processed',
      uploadStatus: 'processed',
      privacyStatus: 'private',
      publishAt: undefined, // belum terjadwal
      scheduledPublishAt: '2026-10-20T09:00:00.000Z',
      managementStatus: 'DISCOVERED',
      managementScope: 'REGULAR',
      isAmgEligible: true,
      isManaged: false,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    // Video B: Terjadwal resmi 25 Oktober 2026 16:00 WIB (09:00 UTC)
    {
      id: 'vid-sched-1',
      youtubeVideoId: 'sched-01',
      channelId,
      titleBefore: 'Master Suasana Hutan 01',
      titleAssigned: 'Master Suasana Hutan 01',
      thumbnailBefore: '',
      thumbnailAssigned: '',
      originalUploadAt: '2026-10-10T00:00:00.000Z',
      processingStatus: 'processed',
      uploadStatus: 'processed',
      privacyStatus: 'private',
      publishAt: '2026-10-25T09:00:00.000Z',
      managementStatus: 'SCHEDULED',
      managementScope: 'REGULAR',
      isAmgEligible: false,
      isManaged: true,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    // Video C: Terjadwal resmi TERJAUH: 31 Oktober 2026 16:00 WIB (09:00 UTC)
    {
      id: 'vid-sched-2',
      youtubeVideoId: 'sched-02',
      channelId,
      titleBefore: 'Master Suasana Hutan 02',
      titleAssigned: 'Master Suasana Hutan 02',
      thumbnailBefore: '',
      thumbnailAssigned: '',
      originalUploadAt: '2026-10-10T00:00:00.000Z',
      processingStatus: 'processed',
      uploadStatus: 'processed',
      privacyStatus: 'private',
      publishAt: '2026-10-31T09:00:00.000Z',
      managementStatus: 'SCHEDULED',
      managementScope: 'REGULAR',
      isAmgEligible: false,
      isManaged: true,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    // Video D: Copy of A (DILARANG jadi acuan)
    {
      id: 'vid-cand-2',
      youtubeVideoId: 'raw-02',
      channelId,
      titleBefore: 'Copy of A',
      titleAssigned: '',
      thumbnailBefore: '',
      thumbnailAssigned: '',
      originalUploadAt: '2026-10-15T00:00:00.000Z',
      processingStatus: 'processed',
      uploadStatus: 'processed',
      privacyStatus: 'private',
      publishAt: '2026-12-01T00:00:00.000Z', // fake unmanaged draft date
      managementStatus: 'DISCOVERED',
      managementScope: 'REGULAR',
      isAmgEligible: true,
      isManaged: false,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const anchor = workerClient.getChannelVerifiedAnchor(channelId, mockVideos);
  assert(
    anchor === '2026-10-31T09:00:00.000Z',
    'Titik acuan resmi terpilih tepat pada video terjauh (31 Oktober 2026 16:00 WIB)'
  );

  // ============================================================================
  // TEST GROUP 3: Sequential Scheduling Continuation (+1 Day @ 16:00 WIB)
  // ============================================================================
  console.log('\n--- TEST GROUP 3: Sequential Scheduling Continuation ---');

  const nextDates = workerClient.generateSequentialSchedules(3, anchor);
  assert(nextDates.length === 3, 'Dihasilkan tepat 3 jadwal berurutan');
  assert(
    nextDates[0] === '2026-11-01T09:00:00.000Z',
    'Slot 1 dimulai dari (Titik Acuan + 1 Hari): 1 November 2026 16:00 WIB (09:00 UTC)'
  );
  assert(
    nextDates[1] === '2026-11-02T09:00:00.000Z',
    'Slot 2 berlanjut bertahap +1 hari: 2 November 2026 16:00 WIB (09:00 UTC)'
  );
  assert(
    nextDates[2] === '2026-11-03T09:00:00.000Z',
    'Slot 3 berlanjut bertahap +1 hari: 3 November 2026 16:00 WIB (09:00 UTC)'
  );

  // ============================================================================
  // TEST GROUP 4: Direct YouTube API Serial Worker Execution & State Update
  // ============================================================================
  console.log('\n--- TEST GROUP 4: Direct YouTube API Serial Worker Execution ---');

  const testChannel: Channel = {
    id: `chan-${channelId}`,
    youtubeChannelId: channelId,
    title: 'Test Ambience Channel',
    publishFrequency: '1/day',
    publishTime: '16:00',
    timezone: 'Asia/Jakarta',
    status: 'CONNECTED',
    connectedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Seed localStorage videos
  const candidateForMutation: ManagedVideo = {
    id: 'vid-target-salinan-01',
    youtubeVideoId: 'yt-target-01',
    channelId,
    channelTitle: 'Test Ambience Channel',
    titleBefore: 'Salinan dari A',
    titleAssigned: '',
    thumbnailBefore: '',
    thumbnailAssigned: '',
    originalUploadAt: '2026-10-25T10:00:00.000Z',
    processingStatus: 'processed',
    uploadStatus: 'processed',
    privacyStatus: 'private',
    managementStatus: 'READY',
    managementScope: 'REGULAR',
    isAmgEligible: true,
    isManaged: false,
    retryCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  mockStorage['amg_videos'] = JSON.stringify([...mockVideos, candidateForMutation]);
  mockStorage['amg_youtube_access_token'] = 'ya29.test_valid_client_token';

  // Intercept global fetch for YouTube API
  const origFetch = global.fetch;
  const calls: { url: string; method: string; body: any; headers: any }[] = [];

  (global as any).fetch = async (url: string, opts: any) => {
    calls.push({
      url,
      method: opts?.method || 'GET',
      body: opts?.body,
      headers: opts?.headers,
    });

    if (url.includes('/videos?part=snippet,status')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ id: 'yt-target-01', snippet: { title: 'Master Ambience #1' } }),
      };
    }

    if (url.includes('/thumbnails/set')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ default: { url: 'https://i.ytimg.com/vi/yt-target-01/hqdefault.jpg' } }),
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({}),
    };
  };

  try {
    const titles: MasterTitle[] = [
      {
        id: 'title-1',
        profileId: 'prof-1',
        text: 'Master Ambience #1 - Hujan Penenang Jiwa',
        orderIndex: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ];

    const thumbnails: MasterThumbnail[] = [
      {
        id: 'thumb-1',
        profileId: 'prof-1',
        name: 'Cover Hujan Malam',
        url: sampleDataUrl,
        orderIndex: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ];

    let progressCallsCount = 0;
    let completedVideoCalled = false;
    let seenProcessingOne: boolean = false;

    const resultBatch = await workerClient.executeBatchSerial(
      testChannel,
      [candidateForMutation],
      titles,
      thumbnails,
      {
        onProgress: (p) => {
          progressCallsCount++;
          if (p.processingCount === 1) {
            seenProcessingOne = true;
          }
        },
        onVideoCompleted: (vid) => {
          completedVideoCalled = true;
          assert(
            vid.titleBefore === 'Master Ambience #1 - Hujan Penenang Jiwa',
            'Video titleBefore berhasil berganti dari "Salinan dari A" ke Master Judul'
          );
          assert(
            vid.publishAt === '2026-11-01T09:00:00.000Z',
            'Video publishAt berhasil terisi jadwal 1 Nov 2026 16:00 WIB'
          );
          assert(
            vid.managementStatus === 'SCHEDULED',
            'Status video berpindah ke SCHEDULED (Video Terjadwal)'
          );
        },
      }
    );

    assert(resultBatch.status === 'completed', 'Batch selesai dengan status "completed"');
    assert(Boolean(seenProcessingOne), 'UI Progress menampilkan "Memproses: 1"');
    assert(resultBatch.completedCount === 1, 'Counter "Selesai" bertambah menjadi 1');
    assert(progressCallsCount >= 2, 'Progress callback terpanggil secara real-time');
    assert(completedVideoCalled, 'onVideoCompleted callback dieksekusi');

    // Verify YouTube Data API PUT /videos request
    const putCall = calls.find((c) => c.method === 'PUT' && c.url.includes('/videos'));
    assert(putCall !== undefined, 'Direct PUT https://www.googleapis.com/youtube/v3/videos was called');
    const parsedBody = JSON.parse(putCall?.body);
    assert(
      parsedBody.snippet.title === 'Master Ambience #1 - Hujan Penenang Jiwa',
      'Snippet title dikirim dengan Master Judul terpilih'
    );
    assert(
      parsedBody.status.publishAt === '2026-11-01T09:00:00.000Z',
      'Snippet publishAt dikirim dengan target jadwal terhitung'
    );
    assert(
      putCall?.headers['Authorization'] === 'Bearer ya29.test_valid_client_token',
      'Authorization header Bearer access_token disertakan langsung'
    );

    // Verify local storage update
    const updatedStorageVids: ManagedVideo[] = JSON.parse(mockStorage['amg_videos']);
    const targetInStorage = updatedStorageVids.find((v) => v.id === candidateForMutation.id);
    assert(
      targetInStorage?.titleBefore === 'Master Ambience #1 - Hujan Penenang Jiwa',
      'State video di localStorage (amg_videos) terupdate nyata'
    );
    assert(
      targetInStorage?.publishAt === '2026-11-01T09:00:00.000Z',
      'Jadwal di amg_videos terisi nyata tanpa reload'
    );

    // Verify client queue sync for Pemantau Antrean Worker Phase 3
    const queueRaw = mockStorage['amg_phase3_client_queue'];
    assert(queueRaw !== undefined, 'amg_phase3_client_queue tersimpan di localStorage');
    const parsedQueue = JSON.parse(queueRaw);
    assert(parsedQueue.completed === 1, 'Counter antrean completed tersinkronisasi 1');
  } finally {
    global.fetch = origFetch;
  }
}

runTests().then(() => {
  console.log('================================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
});
