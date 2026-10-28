/**
 * Worker Service for AMG Phase 3 Real Automation
 * 
 * Enforces:
 * 1. Single Active Worker Instance per channel (Anti-Duplicate Batch Lock)
 * 2. Real YouTube Data API v3 Mutations (PUT /videos?part=snippet,status & POST /thumbnails/set)
 * 3. Immediate Local State Synchronization on 200 OK (Updates title, publishAt, moves to SCHEDULED)
 * 4. Real-time Queue and Job status synchronization
 */

import { dbStore } from './db.js';
import { youtubeService } from './youtubeService.js';
import { eligibilityService } from './eligibilityService.js';
import { Phase3AutomationJob, AutomationBatch, ManagedVideo } from '../src/types/index.js';

export interface WorkerJobResult {
  success: boolean;
  jobId: string;
  videoId: string;
  videoTitle: string;
  scheduledPublishAt?: string;
  thumbnailStatus?: string;
  error?: string;
}

export class WorkerService {
  // Active worker instances locked by channel ID
  private activeChannelWorkers: Map<string, { batchId: string; startedAt: number }> = new Map();

  /**
   * Checks if an active worker instance is currently processing for a given channel.
   */
  public isChannelWorkerActive(channelId: string): boolean {
    const cleanId = channelId.startsWith('chan-') ? channelId.replace(/^chan-/, '') : channelId;
    return this.activeChannelWorkers.has(channelId) || this.activeChannelWorkers.has(cleanId) || this.activeChannelWorkers.has(`chan-${cleanId}`);
  }

  /**
   * Acquires worker lock for a channel to ensure strictly ONE active worker instance per channel.
   */
  public acquireWorkerLock(channelId: string, batchId: string): boolean {
    if (this.isChannelWorkerActive(channelId)) {
      const active = this.activeChannelWorkers.get(channelId);
      // If lock is older than 20 minutes (timeout), allow reclaiming
      if (active && Date.now() - active.startedAt < 20 * 60 * 1000 && active.batchId !== batchId) {
        return false;
      }
    }
    const cleanId = channelId.startsWith('chan-') ? channelId.replace(/^chan-/, '') : channelId;
    const lockInfo = { batchId, startedAt: Date.now() };
    this.activeChannelWorkers.set(channelId, lockInfo);
    this.activeChannelWorkers.set(cleanId, lockInfo);
    this.activeChannelWorkers.set(`chan-${cleanId}`, lockInfo);
    return true;
  }

  /**
   * Releases worker lock when batch is completed or cancelled.
   */
  public releaseWorkerLock(channelId: string): void {
    const cleanId = channelId.startsWith('chan-') ? channelId.replace(/^chan-/, '') : channelId;
    this.activeChannelWorkers.delete(channelId);
    this.activeChannelWorkers.delete(cleanId);
    this.activeChannelWorkers.delete(`chan-${cleanId}`);
  }

  /**
   * Executes real YouTube Data API v3 mutations for a single video job:
   * 1. Hard safety gate check (validateBeforeMutation)
   * 2. PUT https://www.googleapis.com/youtube/v3/videos?part=snippet,status
   * 3. POST https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={videoId}
   * 4. Synchronizes memory & persistent state on 200 OK
   */
  public async executeRealJobMutation(job: Phase3AutomationJob): Promise<WorkerJobResult> {
    const cleanVidId = job.videoId.replace(/^yt-vid-|^yt-/, '');
    const video =
      dbStore.getVideoById(job.videoId) ||
      dbStore.videos.get(job.videoId) ||
      dbStore.getVideoById(cleanVidId) ||
      dbStore.videos.get(cleanVidId) ||
      Array.from(dbStore.videos.values()).find(
        (v) => v.youtubeVideoId === cleanVidId || v.id === job.videoId || v.youtubeVideoId === job.videoId
      );
    if (!video) {
      throw new Error(`Video ID ${job.videoId} tidak ditemukan di database.`);
    }

    const cleanChannelId = job.channelId.replace(/^chan-/, '');
    const channel =
      dbStore.getChannelByYoutubeId(cleanChannelId) ||
      dbStore.getChannelByIdOrTitle(cleanChannelId) ||
      dbStore.channels.get(cleanChannelId) ||
      dbStore.channels.get(`chan-${cleanChannelId}`) ||
      dbStore.getChannelByIdOrTitle(job.channelId) ||
      dbStore.getChannelByYoutubeId(job.channelId);
    if (!channel) {
      throw new Error(`Channel ID ${cleanChannelId} tidak ditemukan atau belum terhubung.`);
    }

    if (channel.status !== 'CONNECTED' && channel.status !== 'Connected') {
      throw new Error(`Worker execution rejected: Channel "${channel.title}" is not in CONNECTED state.`);
    }

    // 1. Hard Safety Gate
    const validation = eligibilityService.validateBeforeMutation(video.id, channel.id);
    if (!validation.isValid) {
      throw new Error(`Hard Safety Gate Blocked: ${validation.reason}`);
    }

    const targetTitle = job.payload.title || video.titleAssigned || video.titleBefore;
    const targetScheduleIso = job.payload.scheduledPublishAt || video.scheduledPublishAt;

    if (!targetTitle) {
      throw new Error('Master title tidak boleh kosong untuk mutasi YouTube API.');
    }
    if (!targetScheduleIso) {
      throw new Error('Jadwal publikasi (publishAt) tidak boleh kosong untuk mutasi YouTube API.');
    }

    console.log(
      `[WorkerService] Memulai mutasi riil YouTube Data API v3 untuk video: "${video.titleBefore}" -> "${targetTitle}" | Jadwal: ${targetScheduleIso}`
    );

    // 2. Real YouTube Metadata Mutation (PUT https://www.googleapis.com/youtube/v3/videos?part=snippet,status)
    const metaRes = await youtubeService.updateVideoMetadata(video.id, {
      title: targetTitle,
      description: job.payload.description,
      tags: job.payload.tags,
      scheduledPublishAt: targetScheduleIso,
    });

    if (!metaRes.success) {
      throw new Error(metaRes.error || 'Gagal memutasi judul & jadwal video di YouTube Data API v3.');
    }

    // 3. Real YouTube Thumbnail Mutation (POST https://www.googleapis.com/upload/youtube/v3/thumbnails/set)
    let thumbStatus = 'SKIPPED';
    if (job.payload.thumbnailUrl) {
      // Check 24h capacity
      const rlCheck = dbStore.isChannelThumbnailRateLimited(channel.id);
      if (rlCheck.isLimited || rlCheck.usedLast24h >= 70) {
        console.warn(`[WorkerService] Thumbnail upload ditahan karena batas kuota 24 jam untuk channel ${channel.id}.`);
        thumbStatus = 'RATE_LIMITED';
      } else {
        const thumbRes = await youtubeService.setThumbnail(video.id, job.payload.thumbnailUrl);
        if (thumbRes.success) {
          thumbStatus = 'SUCCESS';
          dbStore.logThumbnailAction({
            channelId: channel.id,
            videoId: video.id,
            action: 'THUMBNAIL_SET',
            timestamp: new Date().toISOString(),
            status: 'SUCCESS',
            response: 'OK',
            batchId: job.batchId,
            jobId: job.id,
          });
        } else {
          thumbStatus = 'FAILED';
          console.warn(`[WorkerService] Thumbnail upload notice: ${thumbRes.error}`);
        }
      }
    }

    // 4. Update and Persist Local Video Record immediately
    video.titleBefore = targetTitle;
    (video as any).title = targetTitle;
    video.titleAssigned = targetTitle;
    video.publishAt = targetScheduleIso;
    video.scheduledPublishAt = targetScheduleIso;
    video.privacyStatus = 'private';
    video.managementStatus = 'SCHEDULED';
    video.managementScope = 'EXCLUDED'; // Scheduled videos are moved from candidate pool
    video.isManaged = true;
    video.isAmgManaged = true;
    video.automationBatchId = job.batchId;
    video.taskStatus = {
      title: 'SUCCESS',
      schedule: 'SUCCESS',
      thumbnail: thumbStatus === 'SUCCESS' ? 'SUCCESS' : (thumbStatus === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'SKIPPED'),
    };
    video.updatedAt = new Date().toISOString();
    dbStore.videos.set(video.id, video);

    // Update or create persistent job record
    const existingPJob = dbStore.automationJobs.get(job.id);
    const pJob = existingPJob || {
      id: job.id,
      batchId: job.batchId,
      videoId: video.id,
      videoTitle: targetTitle,
      channelId: channel.id,
      channelTitle: channel.title,
      jobType: 'apply_title' as const,
      status: 'completed' as const,
      startedAt: job.createdAt || new Date().toISOString(),
      retryCount: job.retryCount || 0,
    };
    pJob.status = 'completed';
    pJob.completedAt = new Date().toISOString();
    pJob.videoTitle = targetTitle;
    if (channel.title) pJob.channelTitle = channel.title;
    dbStore.automationJobs.set(job.id, pJob);

    // Update channel schedule anchor
    channel.lastScheduledPublishAt = targetScheduleIso;
    channel.latestManagedScheduledAt = targetScheduleIso;
    channel.lastScheduledVideoTitle = targetTitle;
    channel.lastScheduledVideoId = video.youtubeVideoId || video.id;
    dbStore.channels.set(channel.id, channel);
    dbStore.saveToDisk();

    console.log(
      `[WorkerService] SUKSES: Mutasi riil YouTube API v3 selesai untuk video "${targetTitle}" [${video.youtubeVideoId}].`
    );

    return {
      success: true,
      jobId: job.id,
      videoId: video.id,
      videoTitle: targetTitle,
      scheduledPublishAt: targetScheduleIso,
      thumbnailStatus: thumbStatus,
    };
  }
}

export const workerService = new WorkerService();
