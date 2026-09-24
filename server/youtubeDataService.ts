/**
 * YouTube Data API v3 Service (Server-side)
 * Makes official YouTube Data API v3 requests using stored OAuth access tokens or API key.
 * Never executes mock operations if real credentials are provided.
 */

import { youtubeAuthService } from './youtubeAuthService.js';

export interface YouTubeChannelInfo {
  id: string;
  title: string;
  description: string;
  customUrl?: string;
  thumbnailUrl?: string;
  uploadPlaylistId: string;
  subscriberCount?: number;
  videoCount?: number;
}

export interface YouTubeVideoItem {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  privacyStatus: string;
  uploadStatus?: string; // 'uploaded' | 'processed' | 'failed' | 'rejected'
  processingProgress?: any;
  publishAt?: string; // scheduled publish date ISO
  duration?: string;
  definition?: 'hd' | 'sd';
}

// STRICT READ-ONLY SAFETY LOCK: Enforces no modifications to YouTube content during audit & connection testing
export const AMG_READ_ONLY_MODE = true;

export class YouTubeDataService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.YOUTUBE_API_KEY || '';
  }

  /**
   * Fetches the authenticated user's YouTube channel using the OAuth access token.
   */
  public async getMyChannel(accessToken: string): Promise<{ success: boolean; data?: YouTubeChannelInfo; error?: string }> {
    try {
      const res = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return {
          success: false,
          error: err.error?.message || `YouTube API error (${res.status}): Failed to query authenticated channel.`,
        };
      }

      const json = await res.json();
      if (!json.items || json.items.length === 0) {
        return {
          success: false,
          error: 'No YouTube channel found for the authenticated Google account.',
        };
      }

      const item = json.items[0];
      const channelInfo: YouTubeChannelInfo = {
        id: item.id,
        title: item.snippet?.title || 'YouTube Channel',
        description: item.snippet?.description || '',
        customUrl: item.snippet?.customUrl,
        thumbnailUrl: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
        uploadPlaylistId: item.contentDetails?.relatedPlaylists?.uploads || '',
        subscriberCount: parseInt(item.statistics?.subscriberCount || '0', 10),
        videoCount: parseInt(item.statistics?.videoCount || '0', 10),
      };

      return { success: true, data: channelInfo };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch authenticated channel' };
    }
  }

  /**
   * Fetches channel details by ID or for the authenticated user.
   */
  public async getChannelDetails(channelId: string): Promise<{ success: boolean; data?: YouTubeChannelInfo; error?: string }> {
    const accessToken = await youtubeAuthService.getValidAccessToken(channelId);
    const headers: Record<string, string> = {};

    let url = 'https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics';

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      url += `&id=${encodeURIComponent(channelId)}`;
    } else if (this.apiKey) {
      url += `&id=${encodeURIComponent(channelId)}&key=${this.apiKey}`;
    } else {
      return {
        success: false,
        error: 'No active OAuth access token or YOUTUBE_API_KEY configured for this channel.',
      };
    }

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const err = await res.json();
        return {
          success: false,
          error: err.error?.message || `YouTube API error (${res.status})`,
        };
      }

      const json = await res.json();
      if (!json.items || json.items.length === 0) {
        return {
          success: false,
          error: `Channel not found with ID: ${channelId}`,
        };
      }

      const item = json.items[0];
      const channelInfo: YouTubeChannelInfo = {
        id: item.id,
        title: item.snippet?.title || 'YouTube Channel',
        description: item.snippet?.description || '',
        customUrl: item.snippet?.customUrl,
        thumbnailUrl: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
        uploadPlaylistId: item.contentDetails?.relatedPlaylists?.uploads || '',
        subscriberCount: parseInt(item.statistics?.subscriberCount || '0', 10),
        videoCount: parseInt(item.statistics?.videoCount || '0', 10),
      };

      return { success: true, data: channelInfo };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to reach YouTube Data API' };
    }
  }

  /**
   * Fetches latest uploaded videos from the channel's uploads playlist.
   */
  public async getChannelUploads(
    channelId: string,
    uploadPlaylistId: string,
    maxResults = 50
  ): Promise<{ success: boolean; data?: YouTubeVideoItem[]; error?: string }> {
    const accessToken = await youtubeAuthService.getValidAccessToken(channelId);
    const headers: Record<string, string> = {};

    let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,status,contentDetails&playlistId=${encodeURIComponent(
      uploadPlaylistId
    )}&maxResults=${maxResults}`;

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else if (this.apiKey) {
      url += `&key=${this.apiKey}`;
    } else {
      return {
        success: false,
        error: 'No active OAuth access token or YOUTUBE_API_KEY configured for this channel.',
      };
    }

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const err = await res.json();
        return { success: false, error: err.error?.message || `YouTube API error (${res.status})` };
      }

      const json = await res.json();
      const items = json.items || [];
      const videoIds = items.map((it: any) => it.contentDetails?.videoId).filter(Boolean);

      if (videoIds.length === 0) {
        return { success: true, data: [] };
      }

      // Fetch full video details (status, processingDetails, contentDetails)
      return await this.getVideoDetailsBatch(channelId, videoIds);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch playlist items' };
    }
  }

  /**
   * Fetches detailed video status including upload status (processing vs processed) and scheduled publishAt.
   */
  public async getVideoDetailsBatch(
    channelId: string,
    videoIds: string[]
  ): Promise<{ success: boolean; data?: YouTubeVideoItem[]; error?: string }> {
    const accessToken = await youtubeAuthService.getValidAccessToken(channelId);
    const headers: Record<string, string> = {};

    let url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,status,processingDetails,contentDetails&id=${encodeURIComponent(
      videoIds.join(',')
    )}`;

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else if (this.apiKey) {
      url += `&key=${this.apiKey}`;
    } else {
      return {
        success: false,
        error: 'No active OAuth access token or YOUTUBE_API_KEY configured for this channel.',
      };
    }

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const err = await res.json();
        return { success: false, error: err.error?.message || `YouTube API error (${res.status})` };
      }

      const json = await res.json();
      const videoItems: YouTubeVideoItem[] = (json.items || []).map((v: any) => ({
        id: v.id,
        title: v.snippet?.title || '',
        description: v.snippet?.description || '',
        publishedAt: v.snippet?.publishedAt || '',
        thumbnailUrl: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || '',
        privacyStatus: v.status?.privacyStatus || 'private',
        uploadStatus: v.status?.uploadStatus || 'processed',
        publishAt: v.status?.publishAt,
        duration: v.contentDetails?.duration,
        definition: v.contentDetails?.definition,
      }));

      return { success: true, data: videoItems };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch video details' };
    }
  }

  /**
   * Queries existing scheduled videos on the YouTube channel to determine latest scheduled publishAt,
   * strictly filtering by AMG REGULAR scope eligibility. Excluded / personal videos are ignored.
   */
  public async getLatestScheduledDate(
    channelId: string,
    uploadPlaylistId: string,
    isEligibleVideoId?: (videoId: string) => boolean
  ): Promise<string | null> {
    const uploadsResult = await this.getChannelUploads(channelId, uploadPlaylistId, 50);
    if (!uploadsResult.success || !uploadsResult.data) {
      return null;
    }

    let latestTimestamp = 0;
    let latestIsoString: string | null = null;

    for (const v of uploadsResult.data) {
      if (v.publishAt) {
        // If an eligibility filter is provided, strictly enforce that video is AMG REGULAR eligible
        if (isEligibleVideoId && !isEligibleVideoId(v.id)) {
          continue; // Skip personal / excluded / unclassified videos!
        }

        const time = new Date(v.publishAt).getTime();
        if (time > latestTimestamp) {
          latestTimestamp = time;
          latestIsoString = v.publishAt;
        }
      }
    }

    return latestIsoString;
  }

  /**
   * Updates video title via YouTube Data API v3.
   */
  public async updateVideoTitle(
    channelId: string,
    videoId: string,
    newTitle: string
  ): Promise<{ success: boolean; error?: string }> {
    if (AMG_READ_ONLY_MODE) {
      return {
        success: false,
        error: 'AMG READ-ONLY SAFETY LOCK: Modifying YouTube video title is strictly prohibited during Phase 1 testing.',
      };
    }

    const accessToken = await youtubeAuthService.getValidAccessToken(channelId);
    if (!accessToken) {
      return { success: false, error: 'Authorization required to update video title.' };
    }

    try {
      // First get current snippet to preserve categoryId and description
      const getRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!getRes.ok) {
        return { success: false, error: 'Failed to retrieve current video snippet before update.' };
      }
      const getJson = await getRes.json();
      if (!getJson.items || getJson.items.length === 0) {
        return { success: false, error: 'Video not found on YouTube.' };
      }

      const snippet = getJson.items[0].snippet;
      snippet.title = newTitle;

      const updateRes = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: videoId,
          snippet,
        }),
      });

      if (!updateRes.ok) {
        const errJson = await updateRes.json();
        return { success: false, error: errJson.error?.message || 'Failed to update video title' };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error updating title' };
    }
  }

  /**
   * Sets video thumbnail via YouTube Data API v3.
   */
  public async updateVideoThumbnail(
    channelId: string,
    videoId: string,
    thumbnailUrl: string
  ): Promise<{ success: boolean; error?: string }> {
    if (AMG_READ_ONLY_MODE) {
      return {
        success: false,
        error: 'AMG READ-ONLY SAFETY LOCK: Overwriting YouTube thumbnail is strictly prohibited during Phase 1 testing.',
      };
    }

    const accessToken = await youtubeAuthService.getValidAccessToken(channelId);
    if (!accessToken) {
      return { success: false, error: 'Authorization required to set video thumbnail.' };
    }

    try {
      // Fetch thumbnail image buffer
      const imgRes = await fetch(thumbnailUrl);
      if (!imgRes.ok) {
        return { success: false, error: `Failed to download master thumbnail from ${thumbnailUrl}` };
      }
      const arrayBuffer = await imgRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const uploadRes = await fetch(
        `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'image/jpeg',
          },
          body: buffer,
        }
      );

      if (!uploadRes.ok) {
        const errJson = await uploadRes.json();
        return { success: false, error: errJson.error?.message || 'Failed to upload thumbnail' };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error uploading thumbnail' };
    }
  }

  /**
   * Sets scheduled publishing time (publishAt) on YouTube.
   */
  public async scheduleVideo(
    channelId: string,
    videoId: string,
    publishAtIso: string
  ): Promise<{ success: boolean; error?: string }> {
    if (AMG_READ_ONLY_MODE) {
      return {
        success: false,
        error: 'AMG READ-ONLY SAFETY LOCK: Scheduling or altering publication dates on YouTube is strictly prohibited during Phase 1 testing.',
      };
    }

    const accessToken = await youtubeAuthService.getValidAccessToken(channelId);
    if (!accessToken) {
      return { success: false, error: 'Authorization required to schedule video.' };
    }

    try {
      const updateRes = await fetch('https://www.googleapis.com/youtube/v3/videos?part=status', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: videoId,
          status: {
            privacyStatus: 'private',
            publishAt: publishAtIso,
          },
        }),
      });

      if (!updateRes.ok) {
        const errJson = await updateRes.json();
        return { success: false, error: errJson.error?.message || 'Failed to schedule video' };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error scheduling video' };
    }
  }

  /**
   * Verification step: Queries YouTube to verify updated title, thumbnail, or publishAt.
   */
  public async verifyVideoState(
    channelId: string,
    videoId: string,
    expectedTitle?: string,
    expectedPublishAt?: string
  ): Promise<{ verified: boolean; currentTitle?: string; currentPublishAt?: string; error?: string }> {
    const details = await this.getVideoDetailsBatch(channelId, [videoId]);
    if (!details.success || !details.data || details.data.length === 0) {
      return { verified: false, error: details.error || 'Video could not be verified' };
    }

    const video = details.data[0];
    let titleMatches = true;
    let scheduleMatches = true;

    if (expectedTitle && video.title !== expectedTitle) {
      titleMatches = false;
    }

    if (expectedPublishAt && video.publishAt !== expectedPublishAt) {
      scheduleMatches = false;
    }

    return {
      verified: titleMatches && scheduleMatches,
      currentTitle: video.title,
      currentPublishAt: video.publishAt,
    };
  }
}

export const youtubeDataService = new YouTubeDataService();
