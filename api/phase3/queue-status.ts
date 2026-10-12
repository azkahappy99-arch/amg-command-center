import { phase3Engine } from '../../server/phase3Engine.js';

export default async function handler(req: any, res: any) {
  try {
    const batchId = req.query?.batchId as string | undefined;
    const status = phase3Engine.getQueueStatus(batchId);
    return res.status(200).json({ success: true, ...status });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Error getting queue status' });
  }
}
