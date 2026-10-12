import { phase3Engine } from '../../server/phase3Engine.js';
import { dbStore } from '../../server/db.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { batchId, channelId } = req.body || req.query || {};
    const result = await phase3Engine.processNextStep(batchId as string, channelId as string);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[api/automation/process-next Error]', err);
    return res.status(500).json({ success: false, error: err.message || 'Error processing next step' });
  }
}
