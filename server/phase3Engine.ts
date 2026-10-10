import { dbStore } from './db.js';
import { eligibilityService } from './eligibilityService.js';
import { youtubeService } from './youtubeService.js';
import { youtubeDataService } from './youtubeDataService.js';
import { Phase3AutomationJob, MetadataSnapshot, AutomationJob, AutomationBatch } from '../src/types/index.js';

export class Phase3Engine {
  private queue: Phase3AutomationJob[] = [];
  private isProcessing: boolean = false;
  private snapshots: Map<string, MetadataSnapshot[]> = new Map();
  private lastHeartbeatAt: number = Date.now();
  private retryTimer: NodeJS.Timeout | null = null;
  private lastActiveChannelId?: string;

  public async enqueueBatchJobs(
    batchId: string,
    channelId: string,
    jobPayloads: Array<{ videoId: string; payload: any }>
  ): Promise<{ enqueued: number; jobs: Phase3AutomationJob[] }> {
    const batchSnapshots: MetadataSnapshot[] = [];
    const createdJobs: Phase3AutomationJob[] = [];

    // Update batch heartbeat immediately on enqueue
    const batch = dbStore.automationBatches.get(batchId);
    if (batch) {
      batch.lastHeartbeatAt = new Date().toISOString();
      dbStore.automationBatches.set(batchId, batch);
    }

    for (const item of jobPayloads) {
      const video = dbStore.getVideoById(item.videoId) || dbStore.videos.get(item.videoId);
      if (!video) {
        console.warn(`[Phase3Engine] Skipping video ${item.videoId} — not found in database.`);
        continue;
      }

      const snapshot: MetadataSnapshot = {
        videoId: video.id,
        youtubeVideoId: video.youtubeVideoId,
        titleBefore: video.titleBefore || video.titleAssigned || 'Video Tanpa Judul',
        thumbnailBefore: video.thumbnailBefore || video.thumbnailAssigned || '',
        privacyStatusBefore: video.privacyStatus || 'private',
        capturedAt: new Date().toISOString(),
        batchId: batchId,
      };
      batchSnapshots.push(snapshot);

      const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const job: Phase3AutomationJob = {
        id: jobId,
        batchId,
        channelId,
        videoId: video.id,
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

      // Persist in dbStore.automationJobs
      const persistentJob: AutomationJob = {
        id: jobId,
        batchId,
        videoId: video.id,
        videoTitle: item.payload?.title || video.titleBefore,
        channelId,
        jobType: 'apply_title',
        status: 'pending',
        startedAt: job.createdAt,
        retryCount: 0,
      };
      dbStore.automationJobs.set(jobId, persistentJob);
    }

    this.snapshots.set(batchId, batchSnapshots);
    dbStore.saveToDisk();

    console.log(
      `[Phase3Engine] Enqueued ${createdJobs.length} jobs for batch ${batchId} on channel ${channelId}. Starting worker dispatcher...`
    );

    // Trigger worker immediately (non-blocking)
    this.triggerWorker().catch((err) => {
      console.error('[Phase3Engine] Worker trigger error:', err);
    });

    return { enqueued: createdJobs.length, jobs: createdJobs };
  }

  public async triggerWorker(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.lastHeartbeatAt = Date.now();

    try {
      while (
        this.queue.some(
          (j) => (j.status === 'PENDING' || j.status === 'RETRYING') && j.nextRunAt <= Date.now()
        )
      ) {
        const jobIndex = this.queue.findIndex(
          (j) => (j.status === 'PENDING' || j.status === 'RETRYING') && j.nextRunAt <= Date.now()
        );
        if (jobIndex === -1) break;

        const job = this.queue[jobIndex];
        job.status = 'PROCESSING';
        job.updatedAt = new Date().toISOString();
        this.lastHeartbeatAt = Date.now();

        // Update persistent automationJob status
        const pJob = dbStore.automationJobs.get(job.id);
        if (pJob) {
          pJob.status = 'processing';
          dbStore.automationJobs.set(job.id, pJob);
        }

        // Record worker heartbeat on the batch
        const currentBatch = dbStore.automationBatches.get(job.batchId);
        if (currentBatch) {
          currentBatch.lastHeartbeatAt = new Date().toISOString();
          dbStore.automationBatches.set(currentBatch.id, currentBatch);
        }

        console.log(
          `[Phase3Engine Worker] Processing job ${job.id} | Batch: ${job.batchId} | Video: ${job.videoId} | Attempt: ${job.retryCount + 1}`
        );

        this.lastActiveChannelId = job.channelId;

        // Safety Delay & Throttling (Anti-Spam / Anti-Blokir YouTube)
        // Jeda acak 2 hingga 4 detik di antara setiap pemrosesan video
        const safetyDelayMs = Math.floor(Math.random() * 2001) + 2000; // 2000 - 4000 ms (2-4 detik)
        console.log(`[Phase3Engine Worker] Safety throttle: jeda ${safetyDelayMs}ms sebelum memproses video ${job.videoId}...`);
        await new Promise((res) => setTimeout(res, safetyDelayMs));

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

          // 2. YouTube Thumbnail Upload Mutation & Rate-Limit Gate (Fix #1 & Batas Aman 70-90 / 24 Jam)
          let thumbSuccess = true;
          let thumbSkippedDueToRateLimit = false;

          if (job.payload.thumbnailUrl) {
            const rlCheck = dbStore.isChannelThumbnailRateLimited(job.channelId);
            if (rlCheck.isLimited || rlCheck.usedLast24h >= 70) {
              console.warn(
                `[Phase3Engine Worker] Thumbnail rate limited (70/24h) for channel ${job.channelId}: ${rlCheck.reason || 'Batas harian 70 video tercapai'}`
              );
              thumbSkippedDueToRateLimit = true;
              thumbSuccess = false;
              dbStore.logThumbnailAction({
                channelId: job.channelId,
                videoId: job.videoId,
                action: 'THUMBNAIL_SET',
                timestamp: new Date().toISOString(),
                status: 'RATE_LIMITED',
                error: rlCheck.reason || 'Batas aman harian 70 thumbnail dalam 24 jam tercapai',
                batchId: job.batchId,
                jobId: job.id,
              });

              // Ubah status sisa video menjadi 'Menunggu Kuota Besok' (jeda 24 jam)
              this.markRemainingVideosWaitingQuota(
                job.channelId,
                'Menunggu Kuota Besok (Batas harian 70 video/24 jam tercapai. Jeda 24 jam aman dari error 403 uploadLimitExceeded).'
              );

              throw new Error(`THUMBNAIL_RATE_LIMITED: ${rlCheck.reason || 'Batas aman 70/24 jam tercapai'}`);
            }

            await new Promise((res) => setTimeout(res, 800));
            const thumbRes = await youtubeService.setThumbnail(job.videoId, job.payload.thumbnailUrl);

            if (thumbRes.success) {
              dbStore.logThumbnailAction({
                channelId: job.channelId,
                videoId: job.videoId,
                action: 'THUMBNAIL_SET',
                timestamp: new Date().toISOString(),
                status: 'SUCCESS',
                response: 'OK',
                batchId: job.batchId,
                jobId: job.id,
              });
            } else {
              thumbSuccess = false;
              const errMsg = thumbRes.error || 'Failed to upload thumbnail to YouTube API';

              // If YouTube API indicates quota or rate limit, record it on the channel
              if (
                errMsg.toLowerCase().includes('quota') ||
                errMsg.toLowerCase().includes('rate limit') ||
                errMsg.toLowerCase().includes('limit') ||
                errMsg.toLowerCase().includes('exceeded') ||
                errMsg.toLowerCase().includes('uploadlimitexceeded') ||
                errMsg.includes('403')
              ) {
                const chan = dbStore.channels.get(job.channelId);
                if (chan) {
                  chan.thumbnailRateLimitReachedAt = new Date().toISOString();
                  dbStore.channels.set(chan.id, chan);
                }
                this.markRemainingVideosWaitingQuota(
                  job.channelId,
                  'Menunggu Kuota Besok (YouTube 403 uploadLimitExceeded terdeteksi. Jeda 24 jam aman aktif).'
                );
              }

              dbStore.logThumbnailAction({
                channelId: job.channelId,
                videoId: job.videoId,
                action: 'THUMBNAIL_SET',
                timestamp: new Date().toISOString(),
                status: 'FAILED',
                error: errMsg,
                batchId: job.batchId,
                jobId: job.id,
              });

              // CRITICAL NO FAKE SUCCESS: Do not swallow thumbnail failure!
              throw new Error(`Thumbnail upload failed: ${errMsg}`);
            }
          }

          // 3. READ-AFTER-WRITE VERIFICATION
          const video = dbStore.getVideoById(job.videoId) || dbStore.videos.get(job.videoId);
          if (video && video.youtubeVideoId) {
            const verifyRes = await youtubeDataService.verifyVideoState(
              job.channelId,
              video.youtubeVideoId,
              job.payload.title,
              job.payload.scheduledPublishAt
            );
            if (!verifyRes.verified) {
              console.warn(`[Phase3Engine Worker] Verification notice: ${verifyRes.error || 'Metadata read check'}`);
            }
          }

          job.status = 'COMPLETED';
          job.updatedAt = new Date().toISOString();
          this.lastHeartbeatAt = Date.now();

          // Mark video as managed & completed in database
          if (video) {
            video.managementStatus = 'COMPLETED';
            video.amgStatus = 'COMPLETED';
            video.isManaged = true;
            video.isAmgManaged = true;
            video.automationBatchId = job.batchId;
            video.scheduledPublishAt = job.payload.scheduledPublishAt;
            video.taskStatus = {
              title: 'SUCCESS',
              schedule: 'SUCCESS',
              thumbnail: job.payload.thumbnailUrl ? (thumbSuccess ? 'SUCCESS' : 'FAILED') : 'SKIPPED',
            };
            video.updatedAt = new Date().toISOString();
            dbStore.videos.set(video.id, video);
          }

          // Update persistent job
          if (pJob) {
            pJob.status = 'completed';
            pJob.completedAt = new Date().toISOString();
            dbStore.automationJobs.set(job.id, pJob);
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
              dbStore.automationBatches.set(batch.id, batch);

              // Dynamic Batch Chaining (Requirement 1):
              // Lanjut otomatis ke kloter berikutnya per 50 video tanpa klik konfirmasi ulang
              this.checkAndChainNextBatch(job.channelId, batch.id).catch((chainErr) => {
                console.error('[Phase3Engine] Error auto-chaining next batch:', chainErr);
              });
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

          console.log(`[Phase3Engine Worker] SUCCESS: Job ${job.id} completed for video ${job.videoId}`);
        } catch (err: any) {
          const errorMessage = err.message || 'Unknown execution error';
          job.lastError = errorMessage;
          job.retryCount += 1;
          this.lastHeartbeatAt = Date.now();

          const isRateLimitErr = errorMessage.includes('THUMBNAIL_RATE_LIMITED');

          console.warn(
            `[Phase3Engine Worker] WARNING: Job ${job.id} failed (attempt ${job.retryCount}): ${errorMessage}`
          );

          if (isRateLimitErr) {
            // Keep job for when rolling 24h or YouTube limit clears; don't burn retries rapidly
            job.status = 'RATE_LIMITED';
            job.nextRunAt = Date.now() + 60 * 60 * 1000; // recheck in 1 hour
            if (pJob) {
              pJob.status = 'retry_pending';
              pJob.lastError = errorMessage;
              dbStore.automationJobs.set(job.id, pJob);
            }
            const video = dbStore.getVideoById(job.videoId) || dbStore.videos.get(job.videoId);
            if (video) {
              video.taskStatus = {
                title: 'SUCCESS',
                schedule: 'SUCCESS',
                thumbnail: 'RATE_LIMITED',
              };
              dbStore.videos.set(video.id, video);
            }
          } else if (job.retryCount <= job.maxRetries) {
            job.status = 'RETRYING';
            const backoffTimesMs = [0, 5_000, 15_000, 30_000];
            job.nextRunAt = Date.now() + (backoffTimesMs[job.retryCount] || 30_000);
            if (pJob) {
              pJob.status = 'retry_pending';
              pJob.retryCount = job.retryCount;
              pJob.lastError = errorMessage;
              dbStore.automationJobs.set(job.id, pJob);
            }
          } else {
            job.status = 'FAILED';
            if (pJob) {
              pJob.status = 'failed';
              pJob.retryCount = job.retryCount;
              pJob.lastError = errorMessage;
              pJob.completedAt = new Date().toISOString();
              dbStore.automationJobs.set(job.id, pJob);
            }

            const video = dbStore.getVideoById(job.videoId) || dbStore.videos.get(job.videoId);
            if (video) {
              video.taskStatus = {
                title: 'SUCCESS',
                schedule: 'SUCCESS',
                thumbnail: 'FAILED',
              };
              dbStore.videos.set(video.id, video);
            }

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
              errorMessage: `Job failed after ${job.retryCount} retries: ${errorMessage}`,
              retryCount: job.retryCount,
              status: 'open',
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    } finally {
      this.isProcessing = false;
      this.lastHeartbeatAt = Date.now();
      dbStore.saveToDisk();

      // Dynamic Batch Chaining: If queue is now empty, check if active channel has remaining raw videos
      if (
        this.lastActiveChannelId &&
        !this.queue.some((j) => (j.status === 'PENDING' || j.status === 'RETRYING') && j.nextRunAt <= Date.now())
      ) {
        this.checkAndChainNextBatch(this.lastActiveChannelId).catch((err) => {
          console.error('[Phase3Engine] Error in finally auto-chaining check:', err);
        });
      }

      // Check if retries remain and schedule timer
      const nextPendingRetry = this.queue.find((j) => j.status === 'RETRYING');
      if (nextPendingRetry && !this.retryTimer) {
        const delay = Math.max(1000, nextPendingRetry.nextRunAt - Date.now());
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.triggerWorker().catch(console.error);
        }, delay);
      }
    }
  }

  public workerTick(): { processing: boolean; remaining: number } {
    const hasWork = this.queue.some(
      (j) => (j.status === 'PENDING' || j.status === 'RETRYING') && j.nextRunAt <= Date.now()
    );
    if (hasWork && !this.isProcessing) {
      this.triggerWorker().catch(console.error);
    }
    const remaining = this.queue.filter((j) => j.status === 'PENDING' || j.status === 'RETRYING' || j.status === 'PROCESSING').length;
    return { processing: this.isProcessing, remaining };
  }

  /**
   * Stale Batch Cleaner: cleans batches with no heartbeat for > 15 minutes (Requirement 10)
   */
  public cleanStaleBatches(): { cleanedCount: number; cleanedBatches: string[] } {
    const now = Date.now();
    const fifteenMinutesMs = 15 * 60 * 1000;
    const cleanedBatches: string[] = [];

    for (const batch of dbStore.automationBatches.values()) {
      if (batch.status === 'running') {
        const lastActive = batch.lastHeartbeatAt
          ? new Date(batch.lastHeartbeatAt).getTime()
          : new Date(batch.startedAt).getTime();

        const hasActiveJobs = this.queue.some(
          (j) => j.batchId === batch.id && (j.status === 'PROCESSING' || j.status === 'PENDING')
        );

        if (now - lastActive > fifteenMinutesMs || !hasActiveJobs) {
          batch.status = 'failed';
          (batch as any).failureReason = 'BATCH_TIMEOUT: Worker heartbeat stale (>15m inactive or worker finished)';
          batch.completedAt = new Date().toISOString();
          dbStore.automationBatches.set(batch.id, batch);
          cleanedBatches.push(batch.batchNumber || batch.id);

          // Release video locks for this stale batch
          for (const v of dbStore.videos.values()) {
            if (v.automationBatchId === batch.id && v.managementStatus !== 'COMPLETED') {
              v.managementStatus = 'READY';
              v.isManaged = false;
              v.isAmgManaged = false;
              v.automationBatchId = undefined;
              dbStore.videos.set(v.id, v);
            }
          }
        }
      }
    }

    if (cleanedBatches.length > 0) {
      console.log(`[Phase3Engine] Cleaned ${cleanedBatches.length} stale batches:`, cleanedBatches);
      dbStore.saveToDisk();
    }
    return { cleanedCount: cleanedBatches.length, cleanedBatches };
  }

  /**
   * Clears batch logs: cleans stale batches and optionally removes terminal batch records.
   */
  public clearBatchLogs(options: { removeTerminal?: boolean } = {}): {
    staleCleaned: number;
    terminalRemoved: number;
  } {
    const { cleanedCount } = this.cleanStaleBatches();
    let removed = 0;

    if (options.removeTerminal) {
      for (const [id, batch] of dbStore.automationBatches.entries()) {
        const isTerminal =
          batch.status === 'failed' ||
          batch.status === 'completed' ||
          (batch as any).isRolledBack ||
          (batch as any).status === 'cancelled';
        if (isTerminal) {
          dbStore.automationBatches.delete(id);
          removed++;

          // Clean associated persistent jobs
          for (const [jobId, job] of dbStore.automationJobs.entries()) {
            if (job.batchId === batch.id || job.batchId === batch.batchNumber) {
              dbStore.automationJobs.delete(jobId);
            }
          }
        }
      }
    }

    if (cleanedCount > 0 || removed > 0) {
      dbStore.saveToDisk();
    }
    return { staleCleaned: cleanedCount, terminalRemoved: removed };
  }

  /**
   * Emergency Rollback: restores mutated videos and cleanly cancels batch (Requirements 12 & 13)
   */
  public async emergencyRollbackBatch(
    batchId: string
  ): Promise<{ restoredCount: number; message: string; success: boolean }> {
    let snapshots = this.snapshots.get(batchId) || [];
    let count = 0;

    // Fallback: If snapshots map is empty in memory, reconstruct from videos associated with batch
    if (snapshots.length === 0) {
      for (const v of dbStore.videos.values()) {
        if (v.automationBatchId === batchId) {
          snapshots.push({
            videoId: v.id,
            youtubeVideoId: v.youtubeVideoId,
            titleBefore: v.titleBefore || 'Video Tanpa Judul',
            thumbnailBefore: v.thumbnailBefore || '',
            privacyStatusBefore: v.privacyStatus || 'private',
            capturedAt: new Date().toISOString(),
            batchId: batchId,
          });
        }
      }
    }

    // Cancel pending / processing jobs in queue for this batch immediately
    for (const job of this.queue) {
      if (
        job.batchId === batchId &&
        (job.status === 'PENDING' || job.status === 'RETRYING' || job.status === 'PROCESSING')
      ) {
        job.status = 'FAILED';
        job.lastError = 'Emergency rollback initiated by user.';
        job.updatedAt = new Date().toISOString();
      }
    }

    for (const j of dbStore.automationJobs.values()) {
      if (j.batchId === batchId && (j.status === 'pending' || j.status === 'processing')) {
        j.status = 'failed';
        j.lastError = 'Emergency rollback initiated by user.';
      }
    }

    // Rollback snapshots to YouTube if mutated
    for (const snap of snapshots) {
      try {
        await youtubeService.updateVideoMetadata(snap.videoId, {
          title: snap.titleBefore,
          privacyStatus: snap.privacyStatusBefore,
        });
        const video = dbStore.getVideoById(snap.videoId) || dbStore.videos.get(snap.videoId);
        if (video) {
          video.titleAssigned = '';
          video.thumbnailAssigned = '';
          video.privacyStatus = (snap.privacyStatusBefore as any) || 'private';
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
        console.warn(`[Phase3Engine Rollback] Notice for video ${snap.videoId}:`, error);
      }
    }

    // Release any videos tied to this batch that had no snapshot
    for (const v of dbStore.videos.values()) {
      if (v.automationBatchId === batchId) {
        v.managementStatus = 'READY';
        v.amgStatus = 'ENROLLED';
        v.isManaged = false;
        v.isAmgManaged = false;
        v.automationBatchId = undefined;
        v.scheduledPublishAt = undefined;
        v.updatedAt = new Date().toISOString();
        dbStore.videos.set(v.id, v);
      }
    }

    // Update batch record to terminal ROLLED_BACK / failed status
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
      (batch as any).failureReason = 'ROLLED_BACK: Emergency rollback executed by user';
      batch.completedAt = new Date().toISOString();
      dbStore.automationBatches.set(batch.id, batch);

      dbStore.logActivity({
        user: 'Administrator',
        channelId: batch.channelId,
        channelTitle: batch.channelTitle,
        operation: 'Emergency Batch Rollback Executed',
        previousValue: `Batch ${batch.batchNumber}`,
        newValue: `Restored ${count} videos to original metadata and privacyStatus. Batch marked as rolled back.`,
        result: 'SUCCESS',
      });
    }

    dbStore.saveToDisk();

    return {
      success: true,
      restoredCount: count,
      message:
        count > 0
          ? `Emergency Rollback: ${count} video berhasil dikembalikan ke status awal dan jadwal dibatalkan.`
          : 'Rollback darurat selesai. Batch telah dibatalkan (0 mutasi terdeteksi).',
    };
  }

  /**
   * Mark remaining raw videos as 'Menunggu Kuota Besok' when YouTube 24h thumbnail quota is reached.
   */
  public markRemainingVideosWaitingQuota(channelId: string, reason?: string): number {
    const channel = dbStore.getChannelByIdOrTitle(channelId) || dbStore.getChannelByYoutubeId(channelId);
    const cId = channel ? channel.id : channelId;
    const yId = channel?.youtubeChannelId;
    let count = 0;

    const waitReason =
      reason ||
      'Menunggu Kuota Besok (Batas aman harian 70-90 video/24 jam YouTube tercapai. Jeda 24 jam aktif).';

    for (const v of dbStore.videos.values()) {
      const belongs = v.channelId === cId || (yId && (v.channelId === yId || v.channelId === `chan-${yId}`));
      if (
        belongs &&
        v.managementScope === 'REGULAR' &&
        v.isAmgEligible &&
        !v.isManaged &&
        v.managementStatus !== 'COMPLETED'
      ) {
        v.managementStatus = 'RETRY_PENDING';
        v.exclusionReason = waitReason;
        v.updatedAt = new Date().toISOString();
        dbStore.videos.set(v.id, v);
        count++;
      }
    }

    // Update in-memory queue jobs for this channel to prevent hammering YouTube API
    for (const job of this.queue) {
      if ((job.channelId === cId || (yId && job.channelId === yId)) && (job.status === 'PENDING' || job.status === 'RETRYING')) {
        job.status = 'RATE_LIMITED';
        job.lastError = waitReason;
        job.nextRunAt = Date.now() + 24 * 60 * 60 * 1000;
        job.updatedAt = new Date().toISOString();
        const pJob = dbStore.automationJobs.get(job.id);
        if (pJob) {
          pJob.status = 'retry_pending';
          pJob.lastError = waitReason;
          dbStore.automationJobs.set(job.id, pJob);
        }
      }
    }

    if (count > 0) {
      dbStore.saveToDisk();
      console.log(`[Phase3Engine] Ditandai ${count} video sisa sebagai "${waitReason}" untuk channel ${cId}.`);
    }
    return count;
  }

  /**
   * Dynamic Batch Chaining (Requirement 1 & 3):
   * Otomatis lanjut kloter berikutnya (chunk per 50 video) tanpa mengharuskan pengguna klik tombol konfirmasi ulang,
   * sampai semua video habis atau menyentuh batas aman kuota 70-90 / 24 jam.
   */
  public async checkAndChainNextBatch(
    channelId: string,
    finishedBatchId?: string
  ): Promise<{ chained: boolean; batchId?: string; videoCount?: number }> {
    const channel = dbStore.getChannelByIdOrTitle(channelId) || dbStore.getChannelByYoutubeId(channelId);
    if (!channel) return { chained: false };

    // 1. Quota Gate: Batas aman 70-90 / 24 Jam (Requirement 3)
    const targetQuota = Math.min(channel.dailyCapacityTarget || 70, 90);
    const usedLast24h = dbStore.getSuccessfulThumbnailCountLast24h(channel.id);
    const rlCheck = dbStore.isChannelThumbnailRateLimited(channel.id);

    if (usedLast24h >= 70 || rlCheck.isLimited) {
      console.warn(
        `[Phase3Engine Auto-Chain] Kuota harian channel "${channel.title}" tercapai (${usedLast24h}/${targetQuota} video dlm 24 jam). Menghentikan auto-chain secara elegan (Menunggu Kuota Besok).`
      );
      this.markRemainingVideosWaitingQuota(
        channel.id,
        `Menunggu Kuota Besok (Batas harian ${usedLast24h}/${targetQuota} video tercapai. Jeda 24 jam aman dari error 403 uploadLimitExceeded).`
      );
      return { chained: false };
    }

    // 2. Cari video mentah berstatus INCLUDED / REGULAR yang belum dikelola pada channel ini
    const cId = channel.id;
    const yId = channel.youtubeChannelId;
    const remainingVideos: any[] = [];

    for (const v of dbStore.videos.values()) {
      const belongs = v.channelId === cId || (yId && (v.channelId === yId || v.channelId === `chan-${yId}`));
      if (
        belongs &&
        v.managementScope === 'REGULAR' &&
        v.isAmgEligible &&
        !v.isManaged &&
        v.managementStatus !== 'COMPLETED' &&
        v.managementStatus !== 'PROCESSING' &&
        (v.privacyStatus || '').toLowerCase() === 'private' &&
        !v.publishAt
      ) {
        // Pastikan belum ada di queue aktif in-memory
        const inQueue = this.queue.some(
          (j) => j.videoId === v.id && (j.status === 'PENDING' || j.status === 'PROCESSING')
        );
        if (!inQueue) {
          remainingVideos.push(v);
        }
      }
    }

    if (remainingVideos.length === 0) {
      console.log(
        `[Phase3Engine Auto-Chain] Semua video INCLUDED pada channel "${channel.title}" telah selesai diproses! Auto-chaining selesai sempurna.`
      );
      return { chained: false };
    }

    // 3. Ambil kloter berikutnya per 50 video (kapasitas 1 kloter = 50 video, Requirement 1)
    const quotaLeft = Math.max(0, Math.min(70, targetQuota) - usedLast24h);
    const chunkSize = Math.min(50, quotaLeft);

    if (chunkSize <= 0) {
      this.markRemainingVideosWaitingQuota(channel.id);
      return { chained: false };
    }

    const nextChunk = remainingVideos.slice(0, chunkSize);
    const nextBatchId = `AMG-BATCH-${Date.now().toString().slice(-4)}`;

    console.log(
      `[Phase3Engine Auto-Chain] Memulai Kloter Berikutnya [${nextBatchId}]: Menarik ${nextChunk.length} video berikutnya secara otomatis tanpa konfirmasi ulang...`
    );

    // Daftarkan batch kloter berikutnya
    const nextBatch: AutomationBatch = {
      id: nextBatchId,
      batchNumber: nextBatchId,
      channelId: channel.id,
      channelTitle: channel.title,
      profileId: channel.contentProfileId || 'profile-default',
      profileName: 'Standard AMG Schedule (Kloter Berantai)',
      isDryRun: false,
      status: 'running',
      startedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      detectedCount: nextChunk.length,
      processedCount: 0,
      scheduledCount: 0,
      completedCount: 0,
      failedCount: 0,
    };
    dbStore.automationBatches.set(nextBatchId, nextBatch);

    // Penjadwalan kontinu deterministik dari jangkar kursor terakhir
    let anchorPublishAt = channel.lastScheduledPublishAt || channel.latestManagedScheduledAt;
    let anchorTime = anchorPublishAt ? new Date(anchorPublishAt).getTime() : Date.now();
    if (isNaN(anchorTime) || anchorTime <= Date.now()) {
      anchorTime = Date.now() + 24 * 60 * 60 * 1000;
    }

    const jobs = [];
    for (let idx = 0; idx < nextChunk.length; idx++) {
      const v = nextChunk[idx];
      v.managementStatus = 'READY';
      v.isEnrolled = true;
      v.automationBatchId = nextBatchId;

      const title = v.titleAssigned || v.titleBefore || 'Video YouTube';
      const thumb = v.thumbnailAssigned || v.thumbnailBefore || '';

      // Slot berurutan kontinu harian
      const nextSlotDate = new Date(anchorTime + (idx + 1) * 24 * 60 * 60 * 1000);
      const isoSlot = v.scheduledPublishAt || nextSlotDate.toISOString();

      jobs.push({
        videoId: v.id,
        payload: {
          title,
          description: 'Continuous relaxing ambience published by AMG.',
          tags: ['ambience', 'relaxing', 'sleep', 'music'],
          scheduledPublishAt: isoSlot,
          thumbnailUrl: thumb,
        },
      });

      dbStore.videos.set(v.id, v);
    }

    await this.enqueueBatchJobs(nextBatchId, channel.id, jobs);
    dbStore.saveToDisk();

    return { chained: true, batchId: nextBatchId, videoCount: jobs.length };
  }

  public getQueueStatus(batchId?: string): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    retrying: number;
    remainingInQueue: number;
    jobs: Phase3AutomationJob[];
    isProcessing: boolean;
    activeChannelId?: string;
    waitingQuotaBesokCount: number;
    channelRemainingRawCount: number;
    quotaUsed24h: number;
    quotaLimit: number;
  } {
    const filtered = batchId ? this.queue.filter((j) => j.batchId === batchId) : this.queue;
    let waitingQuotaBesok = 0;
    let totalUnmanagedRaw = 0;

    for (const v of dbStore.videos.values()) {
      if (
        v.managementStatus === 'RETRY_PENDING' ||
        v.exclusionReason?.includes('Menunggu Kuota Besok')
      ) {
        waitingQuotaBesok++;
      } else if (
        v.managementScope === 'REGULAR' &&
        v.isAmgEligible &&
        !v.isManaged &&
        v.managementStatus !== 'COMPLETED' &&
        !v.publishAt
      ) {
        totalUnmanagedRaw++;
      }
    }

    const channelId = this.lastActiveChannelId;
    let quotaUsed24h = 0;
    let quotaLimit = 70;
    if (channelId) {
      const channel = dbStore.getChannelByIdOrTitle(channelId) || dbStore.getChannelByYoutubeId(channelId);
      if (channel) {
        quotaUsed24h = dbStore.getSuccessfulThumbnailCountLast24h(channel.id);
        quotaLimit = Math.min(channel.dailyCapacityTarget || 70, 90);
      }
    }

    const pending = filtered.filter((j) => j.status === 'PENDING').length;
    const retrying = filtered.filter((j) => j.status === 'RETRYING').length;

    return {
      total: filtered.length,
      pending,
      processing: filtered.filter((j) => j.status === 'PROCESSING').length,
      completed: filtered.filter((j) => j.status === 'COMPLETED').length,
      failed: filtered.filter((j) => j.status === 'FAILED').length,
      retrying,
      remainingInQueue: pending + retrying,
      jobs: filtered,
      isProcessing: this.isProcessing,
      activeChannelId: this.lastActiveChannelId,
      waitingQuotaBesokCount: waitingQuotaBesok,
      channelRemainingRawCount: totalUnmanagedRaw,
      quotaUsed24h,
      quotaLimit,
    };
  }

  public getBatchSnapshots(batchId: string): MetadataSnapshot[] {
    return this.snapshots.get(batchId) || [];
  }
}

export const phase3Engine = new Phase3Engine();
