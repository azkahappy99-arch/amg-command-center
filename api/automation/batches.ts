import { dbStore } from '../../server/db.js';
import { phase3Engine } from '../../server/phase3Engine.js';
import startHandler from './start.js';

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    const batches = Array.from(dbStore.automationBatches.values()).reverse();
    return res.status(200).json(batches);
  }

  if (req.method === 'DELETE') {
    // Clear batches or delete batch
    const { id, batchId } = req.query || req.body || {};
    const targetId = id || batchId;

    if (!targetId || targetId === 'all') {
      dbStore.automationBatches.clear();
      dbStore.automationJobs.clear();
      phase3Engine.clearAllJobs();
      for (const v of dbStore.videos.values()) {
        if (v.managementStatus !== 'COMPLETED') {
          v.automationBatchId = undefined;
          v.scheduledPublishAt = undefined;
          v.titleAssigned = '';
          v.thumbnailAssigned = '';
          v.managementStatus = 'READY';
          v.isManaged = false;
        }
      }
      dbStore.saveToDisk();
      return res.status(200).json({ success: true, message: 'Seluruh riwayat batch dibersihkan.' });
    }

    let batch = dbStore.automationBatches.get(targetId);
    let batchKey = targetId;
    if (!batch) {
      for (const [k, b] of dbStore.automationBatches.entries()) {
        if (b.batchNumber === targetId || b.id === targetId) {
          batch = b;
          batchKey = k;
          break;
        }
      }
    }

    if (batch) {
      phase3Engine.cancelBatchJobs(batch.id);
      phase3Engine.cancelBatchJobs(batch.batchNumber);
      dbStore.automationBatches.delete(batchKey);
      for (const v of dbStore.videos.values()) {
        if (v.automationBatchId === batch.id || v.automationBatchId === batch.batchNumber) {
          if (v.managementStatus !== 'COMPLETED') {
            v.managementStatus = 'READY';
            v.isManaged = false;
            v.automationBatchId = undefined;
            v.scheduledPublishAt = undefined;
          }
        }
      }
      dbStore.saveToDisk();
      return res.status(200).json({ success: true, message: `Batch ${batch.batchNumber} berhasil dihapus.` });
    }

    return res.status(404).json({ error: `Batch ${targetId} tidak ditemukan.` });
  }

  // If POST, delegate to startHandler
  return startHandler(req, res);
}
