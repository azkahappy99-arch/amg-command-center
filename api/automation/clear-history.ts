import { dbStore } from '../../server/db.js';
import { phase3Engine } from '../../server/phase3Engine.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Allow POST, DELETE, GET for maximum compatibility
  try {
    const totalBatches = dbStore.automationBatches.size;

    // 1. Clear in-memory queue & halt running worker loop
    phase3Engine.clearAllJobs();
    phase3Engine.isProcessing = false;

    // 2. Clear all batches and automation jobs in dbStore
    dbStore.automationBatches.clear();
    dbStore.automationJobs.clear();
    (dbStore as any).batchHistory = [];

    // 3. Release video locks and reset uncompleted / stuck videos to READY
    let releasedVideos = 0;
    for (const v of dbStore.videos.values()) {
      if (v.automationBatchId || v.managementStatus !== 'COMPLETED') {
        v.automationBatchId = undefined;
        v.scheduledPublishAt = undefined;
        v.titleAssigned = '';
        v.thumbnailAssigned = '';
        v.isManaged = false;
        v.isAmgManaged = false;
        v.isEnrolled = true;
        v.managementScope = 'REGULAR';
        v.managementStatus = 'READY';
        v.safetyCategory = 'ELIGIBLE';
        v.isProtected = false;
        releasedVideos++;
      }
    }

    dbStore.saveToDisk();

    return res.status(200).json({
      success: true,
      message: `Seluruh riwayat batch (${totalBatches} batch) berhasil dibersihkan dan ${releasedVideos} video direset ke status siap kelola.`,
      clearedBatches: totalBatches,
      releasedVideos,
    });
  } catch (err: any) {
    console.error('[api/automation/clear-history Error]', err);
    return res.status(500).json({ success: false, error: err.message || 'Gagal membersihkan riwayat batch.' });
  }
}
