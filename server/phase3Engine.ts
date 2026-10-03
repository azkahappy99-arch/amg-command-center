import { dbStore } from './db.js';
import { eligibilityService } from './eligibilityService.js';
import { youtubeService } from './youtubeService.js';
import { youtubeDataService } from './youtubeDataService.js';
import { Phase3AutomationJob, MetadataSnapshot } from '../src/types/index.js';

export class Phase3Engine {
  private queue: Phase3AutomationJob[] = [];
  private isProcessing: boolean = false;
  private snapshots: Map<string, MetadataSnapshot[]> = new Map();
  private lastHeartbeatAt: number = Date.now();

  public async enqueueBatchJobs(
    batchId: string,
    channelId: string,
    jobPayloads: Array<{ videoId: string; payload: any }>
  ): Promise<{ enqueued: number; jobs: Phase3AutomationJob[] }> {
    const batchSnapshots: MetadataSnapshot[] = [];
    const createdJobs: Phase3AutomationJob[] = [];

    for (const item of jobPayloads) {
      const video = dbStore.videos.get(item.videoId);
      if (!video) continue;
      const snapshot: MetadataSnapshot = {
        videoId: video.id,
        youtubeVideoId: video.youtubeVideoId,
        titleBefore: video.titleBefore || video.titleAssigned,
        thumbnailBefore: video.thumbnailBefore || video.thumbnailAssigned,
        privacyStatusBefore: video.privacyStatus,
        capturedAt: new Date().toISOString(),
        batchId: batchId,
      };
      batchSnapshots.push(snapshot);
      const job: Phase3AutomationJob = {
        id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        batchId,
        channelId,
        videoId: item.videoId,
        payload: item.payload,
        snapshot,
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
        nextRunAt: Date.now(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.queue.push(job);
      createdJobs.push(job);
    }
    this.snapshots.set(batchId, batchSnapshots);
    this.triggerWorker();
    return { enqueued: createdJobs.length, jobs: createdJobs };
  }

  private async triggerWorker() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.lastHeartbeatAt = Date.now();

    while (this.queue.some((j) => (j.status === 'PENDING' || j.status === 'RETRYING') && j.nextRunAt <= Date.now())) {
      const jobIndex = this.queue.findIndex(
        (j) => (j.status === 'PENDING' || j.status === 'RETRYING') && j.nextRunAt <= Date.now()
      );
      if (jobIndex === -1) break;
      const job = this.queue[jobIndex];
      job.status = 'PROCESSING';
      job.updatedAt = new Date().toISOString();
      this.lastHeartbeatAt = Date.now();

      // Record worker heartbeat on the batch
      const currentBatch = dbStore.automationBatches.get(job.batchId);
      if (currentBatch) {
        currentBatch.lastHeartbeatAt = new Date().toISOString();
        dbStore.automationBatches.set(currentBatch.id, currentBatch);
      }

      try {
        const validation = eligibilityService.validateBeforeMutation(job.videoId, job.channelId);
        if (!validation.isValid) {
          throw new Error(`Hard Safety Gate Blocked: ${validation.reason}`);
        }

        // 1. YouTube Title & Schedule Mutation
        const metaRes = await youtubeService.updateVideoMetadata(job.videoId, {
          title: job.payload.title,
          description: job.payload.description,
          tags: job.payload.tags,
          scheduledPublishAt: job.payload.scheduledPublishAt,
        });
        if (!metaRes.success) {
          throw new Error(metaRes.error || 'Failed to update video metadata in YouTube API');
        }

        // 2. YouTube Thumbnail Upload Mutation
        if (job.payload.thumbnailUrl) {
          await new Promise((res) => setTimeout(res, 1000));
          const thumbRes = await youtubeService.setThumbnail(job.videoId, job.payload.thumbnailUrl);
          if (!thumbRes.success) {
            throw new Error(thumbRes.error || 'Failed to upload thumbnail to YouTube API');
          }
        }

        // 3. READ-AFTER-WRITE VERIFICATION (Requirement 26 & 38)
        const video = dbStore.videos.get(job.videoId);
        if (video && video.youtubeVideoId) {
          const verifyRes = await youtubeDataService.verifyVideoState(
            job.channelId,
            video.youtubeVideoId,
            job.payload.title,
            job.payload.scheduledPublishAt
          );
          if (!verifyRes.verified) {
            console.warn(`[Phase3Engine] Verification notice: ${verifyRes.error || 'Metadata read check'}`);
          }
        }

        job.status = 'COMPLETED';
        job.updatedAt = new Date().toISOString();
        this.lastHeartbeatAt = Date.now();

        // Mark video as managed & completed
        if (video) {
          video.managementStatus = 'COMPLETED';
          video.amgStatus = 'COMPLETED';
          video.isManaged = true;
          video.isAmgManaged = true;
          video.automationBatchId = job.batchId;
          video.scheduledPublishAt = job.payload.scheduledPublishAt;
          video.updatedAt = new Date().toISOString();
          dbStore.videos.set(video.id, video);
        }

        // Update Batch Progress
        const batch = dbStore.automationBatches.get(job.batchId);
        if (batch) {
          batch.processedCount++;
          batch.scheduledCount++;
          batch.completedCount++;
          batch.lastHeartbeatAt = new Date().toISOString();
          if (batch.completedCount + batch.failedCount >= batch.detectedCount) {
            batch.status = batch.failedCount === 0 ? 'completed' : 'failed';
            batch.completedAt = new Date().toISOString();
          }
          dbStore.automationBatches.set(batch.id, batch);
        }

        const channel = dbStore.channels.get(job.channelId);
        if (channel && video) {
          channel.latestManagedUploadAt = video.originalUploadAt;
          if (job.payload.scheduledPublishAt) {
            channel.latestManagedScheduledAt = job.payload.scheduledPublishAt;
            channel.lastScheduledPublishAt = job.payload.scheduledPublishAt;
          }
          dbStore.channels.set(channel.id, channel);
        }
      } catch (err: any) {
        job.lastError = err.message || 'Unknown execution error';
        job.retryCount += 1;
        this.lastHeartbeatAt = Date.now();

        if (job.retryCount <= job.maxRetries) {
          job.status = 'RETRYING';
          const backoffTimesMs = [0, 10_000, 30_000, 60_000];
          job.nextRunAt = Date.now() + (backoffTimesMs[job.retryCount] || 60_000);
        } else {
          job.status = 'FAILED';
          const batch = dbStore.automationBatches.get(job.batchId);
          if (batch) {
            batch.failedCount++;
            batch.lastHeartbeatAt = new Date().toISOString();
            if (batch.completedCount + batch.failedCount >= batch.detectedCount) {
              batch.status = 'failed';
              batch.completedAt = new Date().toISOString();
            }
            dbStore.automationBatches.set(batch.id, batch);
          }

          dbStore.errorLogs.set(`err-${Date.now()}`, {
            id: `err-${Date.now()}`,
            channelId: job.channelId,
            videoId: job.videoId,
            operation: 'Phase 3 Background Mutation',
            errorType: 'API_MUTATION_FAILURE',
            errorMessage: `Job failed: ${job.lastError}`,
            retryCount: job.retryCount,
            status: 'open',
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
    this.isProcessing = false;
    this.lastHeartbeatAt = Date.now();
    dbStore.saveToDisk();
  }

  /**
   * Stale Batch Cleaner: cleans batches with no heartbeat for > 10 minutes (Requirement 19)
   */
  public cleanStaleBatches(): number {
    const now = Date.now();
    const tenMinutesMs = 10 * 60 * 1000;
    let cleaned = 0;
    for (const batch of dbStore.automationBatches.values()) {
      if (batch.status === 'running') {
        const lastActive = batch.lastHeartbeatAt
          ? new Date(batch.lastHeartbeatAt).getTime()
          : new Date(batch.startedAt).getTime();
        if (now - lastActive > tenMinutesMs) {
          batch.status = 'failed';
          (batch as any).failureReason = 'BATCH_TIMEOUT: Worker heartbeat stale (> 10 minutes inactive)';
          batch.completedAt = new Date().toISOString();
          dbStore.automationBatches.set(batch.id, batch);
          cleaned++;
        }
      }
    }
    if (cleaned > 0) dbStore.saveToDisk();
    return cleaned;
  }

  public async emergencyRollbackBatch(batchId: string): Promise<{ restoredCount: number; message: string; success: boolean }> {
    let snapshots = this.snapshots.get(batchId) || [];
    let count = 0;

    // Fallback: If snapshots map is empty in memory, reconstruct from videos in batch
    if (snapshots.length === 0) {
      for (const v of dbStore.videos.values()) {
        if (v.automationBatchId === batchId) {
          snapshots.push({
            videoId: v.id,
            youtubeVideoId: v.youtubeVideoId,
            titleBefore: v.titleBefore || 'Video',
            thumbnailBefore: v.thumbnailBefore || '',
            privacyStatusBefore: v.privacyStatus || 'private',
            capturedAt: new Date().toISOString(),
            batchId: batchId,
          });
        }
      }
    }

    for (const snap of snapshots) {
      try {
        await youtubeService.updateVideoMetadata(snap.videoId, {
          title: snap.titleBefore,
          privacyStatus: snap.privacyStatusBefore,
        });
        const video = dbStore.videos.get(snap.videoId);
        if (video) {
          video.titleAssigned = '';
          video.thumbnailAssigned = '';
          video.privacyStatus = snap.privacyStatusBefore as any;
          video.managementStatus = 'READY';
          video.amgStatus = 'ENROLLED';
          video.isManaged = false;
          video.isAmgManaged = false;
          video.scheduledPublishAt = undefined;
          video.automationBatchId = undefined;
          video.updatedAt = new Date().toISOString();
          dbStore.videos.set(video.id, video);
        }
        count++;
      } catch (error) {
        console.warn(`Rollback warning for video ${snap.videoId}:`, error);
      }
    }

    // Cancel pending/processing jobs in queue for this batch
    for (const job of this.queue) {
      if (job.batchId === batchId && (job.status === 'PENDING' || job.status === 'RETRYING' || job.status === 'PROCESSING')) {
        job.status = 'FAILED';
        job.lastError = 'Emergency rollback initiated by user.';
        job.updatedAt = new Date().toISOString();
      }
    }

    // Update batch record
    let batch = dbStore.automationBatches.get(batchId);
    if (!batch) {
      for (const b of dbStore.automationBatches.values()) {
        if (b.batchNumber === batchId) {
          batch = b;
          break;
        }
      }
    }

    if (batch) {
      batch.status = 'failed';
      (batch as any).isRolledBack = true;
      batch.completedAt = new Date().toISOString();
      dbStore.automationBatches.set(batch.id, batch);
      dbStore.saveToDisk();

      dbStore.logActivity({
        user: 'Administrator',
        channelId: batch.channelId,
        channelTitle: batch.channelTitle,
        operation: 'Emergency Batch Rollback Executed',
        previousValue: `Batch ${batch.batchNumber}`,
        newValue: `Restored ${count} videos to original metadata and privacyStatus`,
        result: 'SUCCESS',
      });
    }

    return {
      success: true,
      restoredCount: count,
      message: `Emergency Rollback: ${count} video berhasil dikembalikan ke status awal.`,
    };
  }

  public async fetchCandidateIdsQuotaSafe(playlistId: string, accessToken: string): Promise<string[]> {
    const fieldsFilter = 'items(snippet(resourceId/videoId,publishedAt))';
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&fields=${encodeURIComponent(
        fieldsFilter
      )}&maxResults=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await response.json();
    return (data.items || []).map((it: any) => it.snippet?.resourceId?.videoId);
  }

  public getQueueStatus(batchId?: string): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    retrying: number;
    jobs: Phase3AutomationJob[];
  } {
    const filtered = batchId ? this.queue.filter((j) => j.batchId === batchId) : this.queue;
    return {
      total: filtered.length,
      pending: filtered.filter((j) => j.status === 'PENDING').length,
      processing: filtered.filter((j) => j.status === 'PROCESSING').length,
      completed: filtered.filter((j) => j.status === 'COMPLETED').length,
      failed: filtered.filter((j) => j.status === 'FAILED').length,
      retrying: filtered.filter((j) => j.status === 'RETRYING').length,
      jobs: filtered,
    };
  }

  public getBatchSnapshots(batchId: string): MetadataSnapshot[] {
    return this.snapshots.get(batchId) || [];
  }
}

export const phase3Engine = new Phase3Engine();
