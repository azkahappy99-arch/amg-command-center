/**
 * Unit Test for IndexedDB Thumbnail Storage, Corruption Detection,
 * and Atomic Execution Validation ("Aset Gambar Hilang - Harap Unggah Ulang")
 */

import {
  idbSet,
  idbGet,
  getThumbnailDataById,
  validateThumbnailPayload,
  hydrateThumbnailsWithPayloads,
  validateThumbnailsRotation,
  appendThumbnailToIdb,
  getChannelThumbnailsFromIdb,
  safeLocalStorageSet,
  isValidThumbnailData,
} from '../src/utils/thumbnailStorage.ts';
import { MasterThumbnail } from '../src/types/index.ts';

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
  console.log('AMG THUMBNAIL STORAGE & CORRUPTION VALIDATION TESTS');
  console.log('================================================================');

  const sampleChannelId = 'chan-unit-test-thumbs-' + Date.now();
  const sampleValidDataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(500);

  // TEST 1: Data validation helper
  assert(!isValidThumbnailData(null), 'Null is invalid');
  assert(!isValidThumbnailData(''), 'Empty string is invalid');
  assert(!isValidThumbnailData('idb:thumb-123'), 'Unresolved idb pointer is invalid without payload');
  assert(!isValidThumbnailData('data:image/jpeg;base64,short'), 'Short corrupt string (<100 chars) is invalid');
  assert(isValidThumbnailData(sampleValidDataUrl), 'Full dataUrl is valid (>100 chars)');

  // TEST 2: Validation of missing or corrupt thumbnail
  const corruptThumb: MasterThumbnail = {
    id: 'thumb-corrupt-01',
    name: 'TH1 (Aset Hilang)',
    channelId: sampleChannelId,
    blockId: 'block-1',
    profileId: 'block-1',
    url: '', // Missing
    orderIndex: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const valCorrupt = await validateThumbnailPayload(corruptThumb);
  assert(valCorrupt.isValid === false, 'Corrupt/empty thumbnail is marked isValid = false');
  assert(valCorrupt.error === 'Aset Gambar Hilang - Harap Unggah Ulang', 'Corrupt thumbnail returns "Aset Gambar Hilang - Harap Unggah Ulang"');

  // TEST 3: Validation of valid thumbnail with IndexedDB persistence
  const validThumb: MasterThumbnail = {
    id: 'thumb-valid-01',
    name: 'TH2 (Valid)',
    channelId: sampleChannelId,
    blockId: 'block-1',
    profileId: 'block-1',
    url: sampleValidDataUrl,
    orderIndex: 1,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  await appendThumbnailToIdb(sampleChannelId, validThumb);
  const fetchedPayload = await getThumbnailDataById('thumb-valid-01');
  assert(fetchedPayload === sampleValidDataUrl, 'Thumbnail payload saved and fetched from IndexedDB');

  const valValid = await validateThumbnailPayload(validThumb);
  assert(valValid.isValid === true, 'Valid thumbnail is marked isValid = true');
  assert(valValid.url === sampleValidDataUrl, 'Valid thumbnail returns intact dataUrl');

  // TEST 4: Hydration of mixed batch (TH1-TH5 corrupt, TH6 valid)
  const mixedList: MasterThumbnail[] = [
    { ...corruptThumb, id: 'thumb-th1', name: 'TH1' },
    { ...corruptThumb, id: 'thumb-th2', name: 'TH2' },
    { ...corruptThumb, id: 'thumb-th3', name: 'TH3' },
    { ...corruptThumb, id: 'thumb-th4', name: 'TH4' },
    { ...corruptThumb, id: 'thumb-th5', name: 'TH5' },
    { ...validThumb, id: 'thumb-th6', name: 'TH6' },
  ];

  const hydrated = await hydrateThumbnailsWithPayloads(mixedList);
  assert(hydrated.length === 6, 'Hydration preserves all 6 items');
  assert(hydrated[0].isCorrupt === true, 'TH1 marked as corrupt');
  assert(hydrated[0].error === 'Aset Gambar Hilang - Harap Unggah Ulang', 'TH1 error says "Aset Gambar Hilang - Harap Unggah Ulang"');
  assert(hydrated[4].isCorrupt === true, 'TH5 marked as corrupt');
  assert(hydrated[5].isCorrupt === false, 'TH6 marked as NOT corrupt (valid payload)');
  assert(hydrated[5].url === sampleValidDataUrl, 'TH6 has valid intact url');

  // TEST 5: Rotation Matrix Validation Barrier
  const rotationCheck = await validateThumbnailsRotation(hydrated);
  assert(rotationCheck.allValid === false, 'Rotation check detects corrupt thumbnails and fails validation');
  assert(rotationCheck.corruptCount === 5, 'Rotation check counts exactly 5 corrupt thumbnails');
  assert(rotationCheck.corruptIds.includes('thumb-th1'), 'Corrupt IDs include thumb-th1');
  assert(rotationCheck.corruptNames.includes('TH5'), 'Corrupt names include TH5');

  // TEST 6: Channel Thumbnails retrieval with auto-hydration
  const fromChannel = await getChannelThumbnailsFromIdb(sampleChannelId);
  assert(Array.isArray(fromChannel) && fromChannel.length > 0, 'getChannelThumbnailsFromIdb returns array');
  const foundValid = fromChannel.find((t) => t.id === 'thumb-valid-01');
  assert(foundValid !== undefined, 'Found saved valid thumbnail');
  assert(foundValid?.url === sampleValidDataUrl, 'Found valid thumbnail has intact payload');

  // TEST 7: Safe localStorage strip (anti QuotaExceededError)
  const fakeLargeList = [
    { id: 'th-large-1', url: 'data:image/jpeg;base64,' + 'X'.repeat(500) },
  ];
  // In node environment without localStorage, safeLocalStorageSet safely returns true
  const safeRes = safeLocalStorageSet('amg_master_thumbnails_test', JSON.stringify(fakeLargeList));
  assert(safeRes === true, 'safeLocalStorageSet handles array without crashing');

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
