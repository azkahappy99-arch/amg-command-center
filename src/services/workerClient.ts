/**
 * AMG Command Center — Client-Side Serial Execution Worker (Direct YouTube API)
 * 
 * Bypasses Vercel Serverless cold-start, 4.5MB payload limit (Error 413), and disk absence.
 * Executes live YouTube Data API v3 mutations directly from the browser where valid
 * OAuth tokens and active channel credentials reside.
 */

import { Channel, ManagedVideo, MasterTitle, MasterThumbnail, AutomationBatch } from '../types/index.ts';
import { getThumbnailDataById } from '../utils/thumbnailStorage.ts';
import { requestGisAccessToken, GIS_CONFIG } from './youtubeGisAuth.ts';

export interface WorkerClientProgress {
  batchId: string;
  batchNumber: string;
  status: 'IDLE' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PAUSED';
  currentVideoIndex: number;
  currentVideoTitle: string;
  currentVideoId: string;
  processingCount: number;
  completedCount: number;
  remainingCount: number;
  totalCount: number;
  message: string;
  lastUpdatedVideo?: ManagedVideo;
}

export interface ClientBatchOptions {
  batchSize?: number;
  onProgress?: (progress: WorkerClientProgress) => void;
  onVideoCompleted?: (video: ManagedVideo) => void;
  onBatchFinished?: (batch: AutomationBatch) => void;
  onError?: (error: Error) => void;
}

// Convert DataURL (base64) to Blob for binary upload to YouTube API
export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binaryStr = atob(parts[1] || '');
  const len = binaryStr.length;
  const u8arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    u8arr[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([u8arr], { type: mime });
}

class WorkerClientService {
  private isRunning: boolean = false;
  private shouldStop: boolean = false;
  private currentProgress: WorkerClientProgress | null = null;

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public getCurrentProgress(): WorkerClientProgress | null {
    return this.currentProgress;
  }

  public stopWorker(): void {
    this.shouldStop = true;
    this.isRunning = false;
  }

  /**
   * Mengambil access token yang valid dari berbagai penyimpanan lokal.
   * Jika tidak ada atau sudah kedaluwarsa, memicu refresh otomatis via Google Identity Services.
   */
  public async getValidAccessToken(channel?: Channel, promptConsent = false): Promise<string> {
    // 1. Cek langsung dari channel object
    let token = (channel as any)?.accessToken || (channel as any)?.token;

    // 2. Cek dari localStorage keys
    if (!token && typeof window !== 'undefined') {
      token =
        localStorage.getItem(GIS_CONFIG.STORAGE_KEY_TOKEN) ||
        localStorage.getItem('amg_youtube_access_token') ||
        localStorage.getItem('amg_auth_token') ||
        localStorage.getItem('amg_oauth_token');
    }

    // 3. Cek dari daftar channel di localStorage
    if (!token && typeof window !== 'undefined') {
      try {
        const rawChannels = localStorage.getItem('amg_channels');
        if (rawChannels) {
          const parsed = JSON.parse(rawChannels);
          if (Array.isArray(parsed) && channel) {
            const cleanId = channel.youtubeChannelId || channel.id.replace(/^chan-/, '');
            const found = parsed.find(
              (c: any) =>
                c.id === channel.id ||
                c.youtubeChannelId === cleanId ||
                c.id === `chan-${cleanId}` ||
                c.youtubeChannelId === channel.youtubeChannelId
            );
            if (found && (found.accessToken || found.token)) {
              token = found.accessToken || found.token;
            }
          }
        }
      } catch {}
    }

    // 4. Jika masih belum ada atau diminta force prompt, panggil GIS request
    if (!token || promptConsent) {
      console.log('[WorkerClient] Memperbarui access token melalui Google Identity Services...');
      token = await requestGisAccessToken(promptConsent);
      if (token) {
        localStorage.setItem(GIS_CONFIG.STORAGE_KEY_TOKEN, token);
        localStorage.setItem('amg_youtube_access_token', token);
      }
    }

    if (!token) {
      throw new Error('Token otorisasi YouTube tidak ditemukan. Hubungkan kembali akun YouTube Anda.');
    }

    return token;
  }

  /**
   * Refresh Google OAuth Token secara otomatis saat menerima HTTP 401
   */
  public async refreshTokenGoogle(promptConsent = false): Promise<string> {
    console.log('[WorkerClient] Token 401 terdeteksi, merefresh token Google...');
    try {
      const newToken = await requestGisAccessToken(promptConsent);
      if (newToken) {
        localStorage.setItem(GIS_CONFIG.STORAGE_KEY_TOKEN, newToken);
        localStorage.setItem('amg_youtube_access_token', newToken);
        return newToken;
      }
    } catch (e: any) {
      console.warn('[WorkerClient] Refresh token gagal:', e);
      throw new Error('Sesi YouTube kedaluwarsa. Silakan tautkan ulang channel YouTube.');
    }
    throw new Error('Gagal mendapatkan access token baru dari Google.');
  }

  /**
   * Menghitung titik acuan jadwal terakhir terverifikasi dari YouTube Studio.
   * DILARANG mengambil dari video mentah/private yang belum terjadwal (seperti 'Salinan dari A').
   * Filter: status.uploadStatus === 'processed' && status.publishAt != null
   * Urutkan publishAt secara descending (terjauh ke masa depan).
   */
  public getChannelVerifiedAnchor(channelId: string, allVideos: ManagedVideo[]): string | null {
    const cleanChanId = channelId.replace(/^chan-/, '');

    const channelVideos = allVideos.filter((v) => {
      const isMatch =
        v.channelId === channelId ||
        v.channelId === cleanChanId ||
        v.channelId === `chan-${cleanChanId}`;
      return isMatch;
    });

    // Cek seluruh video channel yang memiliki status.publishAt (terjadwal ke depan)
    const scheduledVideos = channelVideos.filter((v) => {
      const pub = (v as any).status?.publishAt || v.publishAt || v.scheduledPublishAt;
      if (!pub) return false;
      const title = (v.titleBefore || v.titleAssigned || (v as any).title || '').toLowerCase();
      if (title.startsWith('salinan dari') || title.startsWith('copy of')) {
        return false;
      }
      const t = new Date(pub).getTime();
      return !isNaN(t) && t > 0;
    });

    if (scheduledVideos.length === 0) {
      return null;
    }

    // Ambil tanggal publishAt terjauh/terakhir sebagai titik acuan riil
    const latestScheduledDate = new Date(
      Math.max(
        ...scheduledVideos.map((v) => {
          const pub = (v as any).status?.publishAt || v.publishAt || v.scheduledPublishAt;
          return new Date(pub).getTime();
        })
      )
    );

    return latestScheduledDate.toISOString();
  }

  /**
   * Menghasilkan deretan slot tanggal jadwal berurutan bertahap +1 hari pada jam 16:00 WIB (09:00 UTC).
   * Jadwal dimulai dari (Titik Acuan Terjauh + 1 Hari).
   */
  public generateSequentialSchedules(count: number, anchorIsoDate: string | null): string[] {
    const results: string[] = [];
    let start: Date;

    if (anchorIsoDate) {
      const latestScheduledDate = new Date(anchorIsoDate);
      if (!isNaN(latestScheduledDate.getTime())) {
        // Mulai dari (latestScheduledDate + 1 Hari)
        start = new Date(latestScheduledDate.getTime());
        start.setUTCDate(start.getUTCDate() + 1);
      } else {
        start = new Date();
        start.setUTCDate(start.getUTCDate() + 1);
      }
    } else {
      // TIDAK ADA video terjadwal: Jadwalkan video pertama mulai BESOK (Hari Ini + 1 Hari) jam 16:00 WIB
      start = new Date();
      start.setUTCDate(start.getUTCDate() + 1);
    }

    for (let i = 0; i < count; i++) {
      const current = new Date(start.getTime());
      current.setUTCDate(current.getUTCDate() + i);

      // 16:00 WIB = 09:00 UTC
      current.setUTCHours(9, 0, 0, 0);
      results.push(current.toISOString());
    }

    return results;
  }

  /**
   * Eksekusi mutasi judul dan penjadwalan resmi ke YouTube Data API v3
   * PUT https://www.googleapis.com/youtube/v3/videos?part=snippet,status
   */
  public async executeYouTubeTitleAndSchedule(
    videoId: string,
    title: string,
    publishAtIso: string,
    accessToken: string,
    categoryId = '22'
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const cleanId = videoId.replace(/^yt-vid-|^yt-/, '');
    const url = 'https://www.googleapis.com/youtube/v3/videos?part=snippet,status';

    const body = {
      id: cleanId,
      snippet: {
        title,
        categoryId,
      },
      status: {
        privacyStatus: 'private',
        publishAt: publishAtIso,
      },
    };

    let tokenToUse = accessToken;
    let res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${tokenToUse}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    // Otomatis tangani 401 Unauthorized
    if (res.status === 401) {
      console.warn('[WorkerClient] PUT /videos 401, mencoba refresh token...');
      tokenToUse = await this.refreshTokenGoogle();
      res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${tokenToUse}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });
    }

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const errMsg = errJson?.error?.message || `YouTube API error: ${res.status} ${res.statusText}`;
      return { success: false, error: errMsg };
    }

    const data = await res.json();
    return { success: true, data };
  }

  /**
   * Eksekusi mutasi thumbnail resmi ke YouTube Data API v3
   * POST https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${cleanId}
   */
  public async executeYouTubeThumbnailSet(
    videoId: string,
    thumbnailBlob: Blob,
    accessToken: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const cleanId = videoId.replace(/^yt-vid-|^yt-/, '');
    const uploadUrl = `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${cleanId}`;
    const standardUrl = `https://www.googleapis.com/youtube/v3/thumbnails/set?videoId=${cleanId}`;

    let tokenToUse = accessToken;

    // 1. Coba upload URL terlebih dahulu (resmi untuk media)
    try {
      let res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenToUse}`,
          'Content-Type': thumbnailBlob.type || 'image/jpeg',
        },
        body: thumbnailBlob,
      });

      if (res.status === 401) {
        tokenToUse = await this.refreshTokenGoogle();
        res = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
            'Content-Type': thumbnailBlob.type || 'image/jpeg',
          },
          body: thumbnailBlob,
        });
      }

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: true, data };
      }

      // Fallback ke standard endpoint jika upload endpoint 404/menolak
      if (res.status === 404 || res.status === 400) {
        const fallbackRes = await fetch(standardUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenToUse}`,
            'Content-Type': thumbnailBlob.type || 'image/jpeg',
          },
          body: thumbnailBlob,
        });
        if (fallbackRes.ok) {
          const fbData = await fallbackRes.json().catch(() => ({}));
          return { success: true, data: fbData };
        }
      }

      const errJson = await res.json().catch(() => ({}));
      return { success: false, error: errJson?.error?.message || `Thumbnail upload failed (${res.status})` };
    } catch (e: any) {
      return { success: false, error: e.message || 'Network error during thumbnail upload' };
    }
  }

  /**
   * Loop Utama Eksekusi Batch di Sisi Browser (Client-Side Serial Worker)
   * Memproses satu per satu kandidat dengan jeda 2.5 detik anti-throttling.
   */
  public async executeBatchSerial(
    channel: Channel,
    candidates: ManagedVideo[],
    masterTitles: MasterTitle[] | string[],
    masterThumbnails: MasterThumbnail[],
    options: ClientBatchOptions = {}
  ): Promise<AutomationBatch> {
    if (this.isRunning) {
      throw new Error('Worker sedang aktif memproses antrean.');
    }

    this.isRunning = true;
    this.shouldStop = false;

    const pureChannelId = channel.youtubeChannelId || channel.id.replace(/^chan-/, '');
    const batchSize = options.batchSize || 70;
    const itemsToProcess = candidates.slice(0, batchSize);
    const totalCount = itemsToProcess.length;

    const batchNumber = `AMG-BATCH-${Date.now().toString().slice(-4)}`;
    const batchId = batchNumber;

    const batchRecord: AutomationBatch = {
      id: batchId,
      batchNumber,
      channelId: pureChannelId,
      channelTitle: channel.title,
      profileId: channel.contentProfileId || 'profile-default',
      profileName: 'Direct Client Serial Execution',
      isDryRun: false,
      status: 'running',
      startedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      detectedCount: totalCount,
      processedCount: 0,
      scheduledCount: 0,
      completedCount: 0,
      failedCount: 0,
    };

    // Ambil token otorisasi yang valid
    let token = await this.getValidAccessToken(channel);

    // Ambil semua video lokal untuk kalkulasi titik acuan resmi
    let localVideos: ManagedVideo[] = [];
    try {
      const raw = localStorage.getItem('amg_videos');
      if (raw) localVideos = JSON.parse(raw);
    } catch {}

    const anchorDate = this.getChannelVerifiedAnchor(pureChannelId, localVideos);
    const calculatedSchedules = this.generateSequentialSchedules(totalCount, anchorDate);

    // Siapkan daftar judul & thumbnail yang siap dipakai
    const titleStrings: string[] = masterTitles
      .map((t) => (typeof t === 'string' ? t : t.text))
      .filter((t) => Boolean(t && t.trim()));
    if (titleStrings.length === 0) {
      titleStrings.push('Relaxing Ambient Soundscape');
    }

    console.log(
      `[WorkerClient] Memulai eksekusi serial ${totalCount} video untuk channel "${channel.title}" (${pureChannelId})... Titik acuan jadwal: ${anchorDate || 'Baru'}`
    );

    let completedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < itemsToProcess.length; i++) {
      if (this.shouldStop) {
        console.log('[WorkerClient] Eksekusi dihentikan oleh pengguna.');
        break;
      }

      const video = itemsToProcess[i];
      const assignedTitle = titleStrings[i % titleStrings.length];
      const assignedSchedule = calculatedSchedules[i];
      const assignedThumb = masterThumbnails.length > 0 ? masterThumbnails[i % masterThumbnails.length] : null;

      // Update state progress UI: "Memproses: 1"
      const currentProgress: WorkerClientProgress = {
        batchId,
        batchNumber,
        status: 'PROCESSING',
        currentVideoIndex: i + 1,
        currentVideoTitle: assignedTitle,
        currentVideoId: video.id,
        processingCount: 1,
        completedCount,
        remainingCount: totalCount - completedCount,
        totalCount,
        message: `[Worker Phase 3] Memproses ${i + 1}/${totalCount}: "${assignedTitle}"...`,
      };
      this.currentProgress = currentProgress;
      options.onProgress?.(currentProgress);

      // Perbarui status antrean di localStorage agar Pemantau Antrean Worker Phase 3 sinkron real-time
      this.syncQueueStateToStorage({
        total: totalCount,
        processing: 1,
        completed: completedCount,
        remainingInQueue: totalCount - completedCount,
        currentTitle: assignedTitle,
        batchId,
      });

      try {
        // STEP A: UPDATE JUDUL & PENJADWALAN RESMI YOUTUBE
        const titleRes = await this.executeYouTubeTitleAndSchedule(
          video.id,
          assignedTitle,
          assignedSchedule,
          token
        );

        if (!titleRes.success) {
          console.error(`[WorkerClient] Gagal mengubah judul/jadwal video ${video.id}:`, titleRes.error);
          failedCount++;
          batchRecord.failedCount = failedCount;
          continue;
        }

        // STEP B: UPDATE THUMBNAIL RESMI DARI INDEXEDDB
        if (assignedThumb && assignedThumb.id) {
          try {
            const rawThumbData = await getThumbnailDataById(assignedThumb.id);
            if (rawThumbData) {
              const thumbBlob = rawThumbData.startsWith('data:')
                ? dataUrlToBlob(rawThumbData)
                : await fetch(rawThumbData).then((r) => r.blob());

              const thumbRes = await this.executeYouTubeThumbnailSet(video.id, thumbBlob, token);
              if (thumbRes.success) {
                console.log(`[WorkerClient] Thumbnail berhasil diunggah untuk video ${video.id}`);
              } else {
                console.warn(`[WorkerClient] Peringatan upload thumbnail video ${video.id}:`, thumbRes.error);
              }
            }
          } catch (thumbErr) {
            console.warn(`[WorkerClient] Gagal memuat thumbnail dari IndexedDB:`, thumbErr);
          }
        }

        // STEP C: JIKA GOOGLE MENGEMBALIKAN 200 OK -> UPDATE STATE LOKAL SECARA INSTAN
        completedCount++;
        batchRecord.completedCount = completedCount;
        batchRecord.processedCount = completedCount;
        batchRecord.scheduledCount = completedCount;

        const updatedVideo = this.updateLocalVideoSuccess(
          video.id,
          pureChannelId,
          assignedTitle,
          assignedSchedule,
          assignedThumb?.url || ''
        );

        if (updatedVideo) {
          options.onVideoCompleted?.(updatedVideo);
        }

        // Update progress callback realtime
        currentProgress.completedCount = completedCount;
        currentProgress.remainingCount = totalCount - completedCount;
        currentProgress.processingCount = 0;
        currentProgress.lastUpdatedVideo = updatedVideo;
        currentProgress.message = `[Worker Phase 3] Selesai ${completedCount}/${totalCount}: Video "${assignedTitle}" dijadwalkan jam 16:00 WIB.`;
        options.onProgress?.(currentProgress);

        this.syncQueueStateToStorage({
          total: totalCount,
          processing: 0,
          completed: completedCount,
          remainingInQueue: totalCount - completedCount,
          currentTitle: assignedTitle,
          batchId,
        });

        // Trigger global event agar view lain mendeteksi update video
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('amg_videos_updated', { detail: { videoId: video.id } }));
        }

        // STEP D: JEDA AMAN 2.5 DETIK (ANTI-THROTTLING) SEBELUM VIDEO BERIKUTNYA
        if (i < itemsToProcess.length - 1 && !this.shouldStop) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
      } catch (err: any) {
        console.error(`[WorkerClient] Error mutasi video ${video.id}:`, err);
        failedCount++;
        batchRecord.failedCount = failedCount;
      }
    }

    batchRecord.status = completedCount >= totalCount ? 'completed' : 'failed';
    batchRecord.completedAt = new Date().toISOString();
    this.isRunning = false;

    // Bersihkan status aktif antrean
    this.syncQueueStateToStorage({
      total: totalCount,
      processing: 0,
      completed: completedCount,
      remainingInQueue: 0,
      currentTitle: '',
      batchId,
    });

    options.onBatchFinished?.(batchRecord);
    return batchRecord;
  }

  /**
   * Perbarui entri video lokal di amg_videos seketika
   */
  private updateLocalVideoSuccess(
    videoId: string,
    channelId: string,
    assignedTitle: string,
    assignedSchedule: string,
    assignedThumbnailUrl: string
  ): ManagedVideo | undefined {
    try {
      const cleanChanId = channelId.replace(/^chan-/, '');
      const cleanVidId = videoId.replace(/^yt-vid-|^yt-/, '');
      const raw = localStorage.getItem('amg_videos');
      if (!raw) return undefined;

      const videos: ManagedVideo[] = JSON.parse(raw);
      if (!Array.isArray(videos)) return undefined;

      const idx = videos.findIndex(
        (v) =>
          v.id === videoId ||
          v.id === cleanVidId ||
          v.youtubeVideoId === videoId ||
          v.youtubeVideoId === cleanVidId
      );

      if (idx >= 0) {
        videos[idx] = {
          ...videos[idx],
          titleBefore: assignedTitle,
          titleAssigned: assignedTitle,
          thumbnailAssigned: assignedThumbnailUrl || videos[idx].thumbnailAssigned,
          publishAt: assignedSchedule,
          scheduledPublishAt: assignedSchedule,
          managementStatus: 'SCHEDULED',
          managementScope: 'REGULAR',
          isManaged: true,
          isAmgEligible: false,
          updatedAt: new Date().toISOString(),
        };

        localStorage.setItem('amg_videos', JSON.stringify(videos));

        // Update juga cache per-channel
        const chanKey = `amg_real_videos_${cleanChanId}`;
        const chanRaw = localStorage.getItem(chanKey);
        if (chanRaw) {
          const chanVids: ManagedVideo[] = JSON.parse(chanRaw);
          if (Array.isArray(chanVids)) {
            const cIdx = chanVids.findIndex((v) => v.id === videoId || v.youtubeVideoId === videoId);
            if (cIdx >= 0) {
              chanVids[cIdx] = videos[idx];
              localStorage.setItem(chanKey, JSON.stringify(chanVids));
            }
          }
        }

        return videos[idx];
      }
    } catch (e) {
      console.warn('[WorkerClient] Error memperbarui video lokal:', e);
    }
    return undefined;
  }

  /**
   * Menyinkronkan counter antrean ke localStorage agar Pemantau Antrean Worker Phase 3 sinkron real-time
   */
  private syncQueueStateToStorage(state: {
    total: number;
    processing: number;
    completed: number;
    remainingInQueue: number;
    currentTitle: string;
    batchId: string;
  }) {
    try {
      localStorage.setItem('amg_phase3_client_queue', JSON.stringify({
        ...state,
        updatedAt: Date.now(),
      }));
    } catch {}
  }
}

export const workerClient = new WorkerClientService();
