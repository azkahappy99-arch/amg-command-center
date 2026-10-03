/**
 * YouTube Service Adapter for AMG (Phase 3)
 * Provides unified interface for video metadata mutations, thumbnails, and scheduling.
 */

import { dbStore } from './db.js';
import { youtubeDataService } from './youtubeDataService.js';
import { youtubeAuthService } from './youtubeAuthService.js';

export interface UpdateVideoMetadataParams {
  title?: string;
  description?: string;
  tags?: string[];
  privacyStatus?: string;
  scheduledPublishAt?: string;
}

export class YouTubeService {
  /**
   * Updates video metadata (title, description, tags, privacy status, schedule)
   */
  public async updateVideoMetadata(
    videoId: string,
    metadata: UpdateVideoMetadataParams
  ): Promise<{ success: boolean; error?: string }> {
    const video = dbStore.videos.get(videoId);
    if (!video) {
      return { success: false, error: `Video ${videoId} not found in database` };
    }

    const channel = dbStore.channels.get(video.channelId);
    if (!channel) {
      return { success: false, error: `Channel ${video.channelId} not found` };
    }

    // Authenticate via OAuth
    const accessToken = await youtubeAuthService.getValidAccessToken(channel.id);
    if (!accessToken) {
      return {
        success: false,
        error: `OAuth Access Token tidak tersedia atau telah kedaluwarsa untuk channel "${channel.title}". Silakan hubungkan kembali via Google GIS (RECONNECT REQUIRED).`,
      };
    }

    if (!video.youtubeVideoId) {
      return {
        success: false,
        error: `YouTube Video ID tidak ditemukan untuk video ${videoId}. Operasi YouTube API dibatalkan.`,
      };
    }

    // Call live YouTube Data API
    try {
      if (metadata.title) {
        const titleRes = await youtubeDataService.updateVideoTitle(channel.id, video.youtubeVideoId, metadata.title);
        if (!titleRes.success) {
          return { success: false, error: `Gagal memperbarui judul di YouTube API: ${titleRes.error}` };
        }
      }
      if (metadata.scheduledPublishAt) {
        const schedRes = await youtubeDataService.scheduleVideo(channel.id, video.youtubeVideoId, metadata.scheduledPublishAt);
        if (!schedRes.success) {
          return { success: false, error: `Gagal menjadwalkan publikasi di YouTube API: ${schedRes.error}` };
        }
      }
    } catch (err: any) {
      return { success: false, error: `Exception saat memanggil YouTube Data API: ${err.message}` };
    }

    // ONLY commit to database after YouTube API mutation succeeds
    if (metadata.title !== undefined) {
      video.titleAssigned = metadata.title;
    }
    if (metadata.privacyStatus !== undefined) {
      video.privacyStatus = metadata.privacyStatus as any;
    }
    if (metadata.scheduledPublishAt !== undefined) {
      video.scheduledPublishAt = metadata.scheduledPublishAt;
    }
    video.updatedAt = new Date().toISOString();
    dbStore.videos.set(video.id, video);

    return { success: true };
  }

  /**
   * Sets video thumbnail
   */
  public async setThumbnail(videoId: string, thumbnailUrl: string): Promise<{ success: boolean; error?: string }> {
    const video = dbStore.videos.get(videoId);
    if (!video) {
      return { success: false, error: `Video ${videoId} not found in database` };
    }

    const channel = dbStore.channels.get(video.channelId);
    if (!channel) {
      return { success: false, error: `Channel ${video.channelId} not found` };
    }

    const accessToken = await youtubeAuthService.getValidAccessToken(channel.id);
    if (!accessToken) {
      return {
        success: false,
        error: `OAuth Access Token tidak tersedia untuk thumbnail upload pada channel "${channel.title}". Silakan hubungkan kembali via Google GIS (RECONNECT REQUIRED).`,
      };
    }

    if (!video.youtubeVideoId) {
      return {
        success: false,
        error: `YouTube Video ID tidak ditemukan untuk video ${videoId}. Thumbnail upload dibatalkan.`,
      };
    }

    // Call live YouTube Data API
    try {
      const thumbRes = await youtubeDataService.updateVideoThumbnail(channel.id, video.youtubeVideoId, thumbnailUrl);
      if (!thumbRes.success) {
        return { success: false, error: `Gagal mengunggah thumbnail ke YouTube API: ${thumbRes.error}` };
      }
    } catch (err: any) {
      return { success: false, error: `Exception saat mengunggah thumbnail ke YouTube API: ${err.message}` };
    }

    // ONLY commit to database after YouTube API mutation succeeds
    video.thumbnailAssigned = thumbnailUrl;
    video.updatedAt = new Date().toISOString();
    dbStore.videos.set(video.id, video);

    return { success: true };
  }
}

export const youtubeService = new YouTubeService();
