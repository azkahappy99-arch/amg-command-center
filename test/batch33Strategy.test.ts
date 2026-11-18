import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  BATCH_SIZE,
  QUOTA_UNIT_PER_VIDEO,
  ESTIMATED_QUOTA_PER_BATCH,
  MAX_CHANNELS_PER_DAY,
  sliceEligibleBatch,
} from '../src/utils/batchConfig.ts';
import { BATCH_SIZE as WORKER_BATCH_SIZE } from '../src/services/workerClient.ts';

describe('Strategi Kloter 33 Video (3 Channel / Bulan) Suite', () => {
  it('1. BATCH_SIZE is strictly 33 and synced across batchConfig & workerClient', () => {
    assert.strictEqual(BATCH_SIZE, 33);
    assert.strictEqual(WORKER_BATCH_SIZE, 33);
    assert.strictEqual(QUOTA_UNIT_PER_VIDEO, 100);
    assert.strictEqual(ESTIMATED_QUOTA_PER_BATCH, 3300);
    assert.strictEqual(MAX_CHANNELS_PER_DAY, 3);
    assert.ok(ESTIMATED_QUOTA_PER_BATCH * 3 <= 10000, '3 channels x 3300 = 9900 <= 10000 daily quota');
  });

  it('2. sliceEligibleBatch slices up to 33 videos for Kloter 1 and leaves remaining safely', () => {
    const eligible = Array.from({ length: 80 }, (_, idx) => ({ id: `vid-${idx + 1}` }));

    const kloter1 = sliceEligibleBatch(eligible, 1, BATCH_SIZE);
    assert.strictEqual(kloter1.batchVideos.length, 33);
    assert.strictEqual(kloter1.batchVideos[0].id, 'vid-1');
    assert.strictEqual(kloter1.batchVideos[32].id, 'vid-33');
    assert.strictEqual(kloter1.remainingVideos.length, 47);

    const kloter2 = sliceEligibleBatch(eligible, 2, BATCH_SIZE);
    assert.strictEqual(kloter2.batchVideos.length, 33);
    assert.strictEqual(kloter2.batchVideos[0].id, 'vid-34');
    assert.strictEqual(kloter2.batchVideos[32].id, 'vid-66');
    assert.strictEqual(kloter2.remainingVideos.length, 14);

    const kloter3 = sliceEligibleBatch(eligible, 3, BATCH_SIZE);
    assert.strictEqual(kloter3.batchVideos.length, 14);
    assert.strictEqual(kloter3.batchVideos[0].id, 'vid-67');
    assert.strictEqual(kloter3.batchVideos[13].id, 'vid-80');
    assert.strictEqual(kloter3.remainingVideos.length, 0);
  });

  it('3. AutomationView.tsx & QueueMonitor.tsx reflect Kloter 33 Video & ~3.300 unit copy cleanly', () => {
    const automationViewPath = path.resolve(process.cwd(), 'src/components/AutomationView.tsx');
    const automationViewSrc = fs.readFileSync(automationViewPath, 'utf-8');

    assert.ok(automationViewSrc.includes('Kloter {BATCH_SIZE} Video (~3.300 unit)'), 'Quota info card updated to 33 videos / ~3.300 unit');
    assert.ok(automationViewSrc.includes('Mengamankan runway 1 bulan penuh untuk 1 channel (Mendukung hingga 3 channel/hari)'), 'Runway 1 bulan / 3 channel copy present');
    assert.ok(automationViewSrc.includes('Konfirmasi & Mulai Otomasi (Kloter: {jumlahVideoKloterN} Video)'), 'Execution button label updated');
    assert.ok(automationViewSrc.includes('Pratinjau Otomasi Pra-Eksekusi (Kloter {effectivePage}: {currentKloterItems.length} Video)'), 'Preview section title intact');
    assert.ok(!automationViewSrc.includes('Kloter 90 Video'), 'No stale Kloter 90 Video label in AutomationView');
    assert.ok(!automationViewSrc.includes('9.000 unit'), 'No stale 9.000 unit label in AutomationView');

    const queueMonitorPath = path.resolve(process.cwd(), 'src/components/QueueMonitor.tsx');
    const queueMonitorSrc = fs.readFileSync(queueMonitorPath, 'utf-8');
    assert.ok(queueMonitorSrc.includes('Auto-Chaining ({BATCH_SIZE}/Kloter)'), 'QueueMonitor uses BATCH_SIZE/Kloter');
    assert.ok(queueMonitorSrc.includes('Antrean pekerja siaga: Pemrosesan kloter per {BATCH_SIZE} video & auto-chaining siap dieksekusi (Aman untuk 3 channel/hari).'), 'QueueMonitor footer reflects 33 video & 3 channels/day');
    assert.ok(queueMonitorSrc.includes('Batas thumbnail aman per kloter {BATCH_SIZE} video'), 'QueueMonitor 24h badge reflects 33 video limit');
    assert.ok(queueMonitorSrc.includes('quotaLimit: BATCH_SIZE'), 'QueueMonitor default quotaLimit uses BATCH_SIZE');
    assert.ok(!queueMonitorSrc.includes('90/Kloter'), 'No stale 90/Kloter in QueueMonitor');
    assert.ok(!queueMonitorSrc.includes('kloter per 90 video'), 'No stale kloter per 90 video in QueueMonitor');
    assert.ok(!queueMonitorSrc.includes('70-90'), 'No stale 70-90 in QueueMonitor');
  });
});
