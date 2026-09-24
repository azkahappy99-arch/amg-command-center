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

    // Update in-memory database store
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

    // Call live YouTube Data API if token is available
    const accessToken = await youtubeAuthService.getValidAccessToken(channel.id);
    if (accessToken && video.youtubeVideoId) {
      try {
        if (metadata.title) {
          await youtubeDataService.updateVideoTitle(channel.id, video.youtubeVideoId, metadata.title);
        }
        if (metadata.scheduledPublishAt) {
          await youtubeDataService.scheduleVideo(channel.id, video.youtubeVideoId, metadata.scheduledPublishAt);
        }
      } catch (err: any) {
        console.warn(`[YouTubeService] Live update warning for video ${videoId}:`, err.message);
      }
    }

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

    video.thumbnailAssigned = thumbnailUrl;
    video.updatedAt = new Date().toISOString();
    dbStore.videos.set(video.id, video);

    const accessToken = await youtubeAuthService.getValidAccessToken(channel.id);
    if (accessToken && video.youtubeVideoId) {
      try {
        await youtubeDataService.updateVideoThumbnail(channel.id, video.youtubeVideoId, thumbnailUrl);
      } catch (err: any) {
        console.warn(`[YouTubeService] Live thumbnail update warning for video ${videoId}:`, err.message);
      }
    }

    return { success: true };
  }
}

export const youtubeService = new YouTubeService();
