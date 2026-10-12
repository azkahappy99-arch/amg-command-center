import { phase3Engine } from '../../server/phase3Engine.js';
import { dbStore } from '../../server/db.js';

export default async function handler(req: any, res: any) {
  // Allow POST, DELETE, GET, OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const batchId =
      req.query?.batchId ||
      req.query?.id ||
      req.body?.batchId ||
      req.body?.id ||
      (req.url ? req.url.split('/').filter(Boolean).pop() : undefined);

    if (!batchId || batchId === 'rollback') {
      // Find latest running or failed batch
      let fallbackBatchId = '';
      for (const b of Array.from(dbStore.automationBatches.values()).reverse()) {
        if (b.status === 'running' || b.status === 'failed') {
          fallbackBatchId = b.id;
          break;
        }
      }
      if (!fallbackBatchId) {
        return res.status(200).json({ success: true, restoredCount: 0, message: 'Tidak ada batch untuk di-rollback.' });
      }
      const result = await phase3Engine.emergencyRollbackBatch(fallbackBatchId);
      return res.status(200).json(result);
    }

    const result = await phase3Engine.emergencyRollbackBatch(batchId as string);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[api/phase3/rollback Error]', err);
    return res.status(500).json({ success: false, error: err.message || 'Rollback failed' });
  }
}
