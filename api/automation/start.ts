import { dbStore } from '../../server/db.js';
import { automationEngine } from '../../server/automationEngine.js';
import { phase3Engine } from '../../server/phase3Engine.js';
import type { AutomationBatch } from '../../src/types/index.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { channelId, profileId, videoIds, executionPlan, channelTitle } = req.body || {};
    if (!channelId) {
      return res.status(400).json({ error: 'channelId is required.' });
    }

    let channel = dbStore.getChannelByIdOrTitle(channelId) || dbStore.getChannelByYoutubeId(channelId);
    if (!channel) {
      const norm = channelId.trim().toLowerCase();
      for (const c of dbStore.channels.values()) {
        if (
          c.title?.toLowerCase() === norm ||
          c.id.toLowerCase() === norm ||
          c.youtubeChannelId?.toLowerCase() === norm
        ) {
          channel = c;
          break;
        }
      }
    }

    const effectiveTitle =
      channelTitle ||
      channel?.title ||
      (channelId.startsWith('chan-') ? 'Ayam YAHYA' : channelId);

    if (!channel) {
      channel = dbStore.upsertChannel({
        id: channelId.startsWith('chan-') ? channelId : `chan-${Date.now()}`,
        title: effectiveTitle,
        youtubeChannelId: channelId.startsWith('UC') ? channelId : `UC_${Date.now()}`,
        status: 'CONNECTED',
        connectedAt: new Date().toISOString(),
        contentProfileId: profileId || 'profile-default',
        thumbnailUrl: 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=150',
        videoCount: Array.isArray(videoIds) ? videoIds.length : 8,
        unmanagedVideoCount: Array.isArray(videoIds) ? videoIds.length : 8,
        publishFrequency: '1/day',
        publishTime: '16:00',
        timezone: 'Asia/Jakarta',
        lastScheduledPublishAt: '2026-10-03T09:00:00.000Z',
        latestManagedScheduledAt: '2026-10-03T09:00:00.000Z',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    if (Array.isArray(executionPlan) && executionPlan.length > 0) {
      const batchId = `AMG-BATCH-${Date.now().toString().slice(-4)}`;
      const batch: AutomationBatch = {
        id: batchId,
        batchNumber: batchId,
        channelId: channel.id,
        channelTitle: channel.title,
        profileId: profileId || channel.contentProfileId || 'profile-default',
        profileName: 'Standard AMG Schedule',
        isDryRun: false,
        status: 'running',
        startedAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        detectedCount: executionPlan.length,
        processedCount: 0,
        scheduledCount: 0,
        completedCount: 0,
        failedCount: 0,
      };

      dbStore.automationBatches.set(batchId, batch);

      const phase3Jobs = [];
      for (let idx = 0; idx < executionPlan.length; idx++) {
        const item = executionPlan[idx];
        let video = dbStore.getVideoById(item.videoId) || dbStore.videos.get(item.videoId);
        if (!video) {
          return res.status(404).json({
            error: `Video "${item.videoId}" tidak ditemukan dalam database. Sinkronisasikan video resmi dari YouTube Data API terlebih dahulu. Dilarang menggunakan mock/dummy video.`,
          });
        }

        video.managementScope = 'REGULAR';
        video.isAmgEligible = true;
        video.isEnrolled = true;
        video.managementStatus = 'READY';
        video.privacyStatus = 'private';
        video.channelId = channel.id;
        dbStore.videos.set(video.id, video);

        let isoPublishAt = item.scheduledPublishAt;
        if (!isoPublishAt) {
          if (item.publishDate && item.publishTime) {
            let [hours, minutes] = item.publishTime.split(' ')[0].split(':');
            let [y, m, d] = item.publishDate.split('-').map(Number);
            const slotDate = new Date(Date.UTC(y, m - 1, d, Number(hours) - 7, Number(minutes), 0));
            isoPublishAt = slotDate.toISOString();
          } else {
            const baseDate = new Date(Date.UTC(2026, 9, 4 + idx, 9, 0, 0));
            isoPublishAt = baseDate.toISOString();
          }
        }

        phase3Jobs.push({
          videoId: video.id,
          payload: {
            title: item.title || item.assignedTitle || video.titleBefore,
            description: item.description || 'Continuous relaxing ambience published by AMG.',
            tags: item.tags || ['ambience', 'relaxing', 'sleep', 'music'],
            scheduledPublishAt: isoPublishAt,
            thumbnailUrl: item.thumbnailUrl || item.assignedThumbnail,
          },
        });
      }

      await phase3Engine.enqueueBatchJobs(batchId, channel.id, phase3Jobs);
      dbStore.saveToDisk();

      return res.status(200).json({
        success: true,
        batchId: batch.id,
        batch,
        message: `Batch ${batch.batchNumber} launched into Phase 3 Worker Queue with ${phase3Jobs.length} videos.`,
      });
    }

    const result = await automationEngine.startBatchAutomation(channel.id, profileId);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json({
      success: true,
      batchId: result.batch?.id,
      batch: result.batch,
      message: 'Batch automation started successfully',
    });
  } catch (err: any) {
    console.error('[API Handler Error]', err);
    return res.status(500).json({ error: err.message || 'Internal server error starting batch' });
  }
}
