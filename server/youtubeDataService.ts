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

// AMG_READ_ONLY_MODE: Defaults to false to allow live YouTube Data API mutations
export const AMG_READ_ONLY_MODE = process.env.AMG_READ_ONLY_MODE === 'true';

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
   * Fetches uploaded videos from the channel's uploads playlist with full scan pagination.
   * Scans both existing historical videos and newly uploaded videos.
   */
  public async getChannelUploads(
    channelId: string,
    uploadPlaylistId: string,
    maxResults = 2500
  ): Promise<{ success: boolean; data?: YouTubeVideoItem[]; error?: string }> {
    const accessToken = await youtubeAuthService.getValidAccessToken(channelId);
    const headers: Record<string, string> = {};

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else if (this.apiKey) {
      // API Key mode
    } else {
      return {
        success: false,
        error: 'No active OAuth access token or YOUTUBE_API_KEY configured for this channel.',
      };
    }

    const videoIds: string[] = [];
    const SAFE_MAX_VIDEOS = Math.min(Math.max(maxResults, 200), 2500); // Full scan up to 2500 videos (50 pages)
    const MAX_PAGES = Math.ceil(SAFE_MAX_VIDEOS / 50);

    try {
      // 1. Full pagination scan on Uploads playlist (UU...)
      let pageToken: string | undefined = undefined;
      let pagesFetched = 0;

      do {
        let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,status,contentDetails&playlistId=${encodeURIComponent(
          uploadPlaylistId
        )}&maxResults=50`;

        if (pageToken) {
          url += `&pageToken=${encodeURIComponent(pageToken)}`;
        }
        if (!accessToken && this.apiKey) {
          url += `&key=${this.apiKey}`;
        }

        const res = await fetch(url, { headers });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const errMsg = errBody?.error?.message || `YouTube API responded with status ${res.status}`;
          console.error(`[youtubeDataService] playlistItems error: ${errMsg}`);
          return {
            success: false,
            error: `Gagal membaca playlist video YouTube (${res.status}): ${errMsg}`,
          };
        }

        const json = await res.json();
        const items = json.items || [];
        for (const it of items) {
          const vidId = it.contentDetails?.videoId || it.snippet?.resourceId?.videoId;
          if (vidId && !videoIds.includes(vidId)) {
            videoIds.push(vidId);
          }
        }

        pageToken = json.nextPageToken;
        pagesFetched++;
      } while (pageToken && pagesFetched < MAX_PAGES && videoIds.length < SAFE_MAX_VIDEOS);

      // 2. Scan Shorts playlist (UUSH...) if uploads playlist starts with UU
      if (uploadPlaylistId.startsWith('UU') && videoIds.length < SAFE_MAX_VIDEOS) {
        const shortsPlaylistId = 'UUSH' + uploadPlaylistId.slice(2);
        let shortsPageToken: string | undefined = undefined;
        let shortsPages = 0;
        try {
          do {
            let sUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,status,contentDetails&playlistId=${encodeURIComponent(
              shortsPlaylistId
            )}&maxResults=50`;
            if (shortsPageToken) sUrl += `&pageToken=${encodeURIComponent(shortsPageToken)}`;
            if (!accessToken && this.apiKey) sUrl += `&key=${this.apiKey}`;

            const sRes = await fetch(sUrl, { headers });
            if (!sRes.ok) break;

            const sJson = await sRes.json();
            const sItems = sJson.items || [];
            for (const it of sItems) {
              const vidId = it.contentDetails?.videoId || it.snippet?.resourceId?.videoId;
              if (vidId && !videoIds.includes(vidId)) {
                videoIds.push(vidId);
              }
            }

            shortsPageToken = sJson.nextPageToken;
            shortsPages++;
          } while (shortsPageToken && shortsPages < MAX_PAGES && videoIds.length < SAFE_MAX_VIDEOS);
        } catch {
          // Shorts playlist optional
        }
      }

      // 3. Scan search.list with loop pagination (forMine=true captures private raw uploads)
      if (videoIds.length < SAFE_MAX_VIDEOS) {
        let searchPageToken: string | undefined = undefined;
        let searchPages = 0;
        try {
          do {
            let searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50`;
            if (accessToken) {
              searchUrl += `&forMine=true`;
            } else {
              const rawChanId = channelId.replace(/^chan-/, '');
              searchUrl += `&channelId=${encodeURIComponent(rawChanId)}`;
            }

            if (searchPageToken) {
              searchUrl += `&pageToken=${encodeURIComponent(searchPageToken)}`;
            }
            if (!accessToken && this.apiKey) {
              searchUrl += `&key=${this.apiKey}`;
            }

            const searchRes = await fetch(searchUrl, { headers });
            if (!searchRes.ok) break;

            const searchJson = await searchRes.json();
            const searchItems = searchJson.items || [];
            for (const it of searchItems) {
              const vidId = it.id?.videoId || it.snippet?.resourceId?.videoId;
              if (vidId && !videoIds.includes(vidId)) {
                videoIds.push(vidId);
              }
            }

            searchPageToken = searchJson.nextPageToken;
            searchPages++;
          } while (searchPageToken && searchPages < MAX_PAGES && videoIds.length < SAFE_MAX_VIDEOS);
        } catch (sErr) {
          console.warn('[youtubeDataService] search.list fallback warning:', sErr);
        }
      }

      if (videoIds.length === 0) {
        return { success: true, data: [] };
      }

      // Fetch full video details in batches of 50
      return await this.getVideoDetailsBatch(channelId, videoIds);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch playlist items' };
    }
  }

  /**
   * Fetches detailed video status in batches of up to 50 items.
   */
  public async getVideoDetailsBatch(
    channelId: string,
    videoIds: string[]
  ): Promise<{ success: boolean; data?: YouTubeVideoItem[]; error?: string }> {
    const accessToken = await youtubeAuthService.getValidAccessToken(channelId);
    const headers: Record<string, string> = {};

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else if (this.apiKey) {
      // API Key mode
    } else {
      return {
        success: false,
        error: 'No active OAuth access token or YOUTUBE_API_KEY configured for this channel.',
      };
    }

    const allVideoItems: YouTubeVideoItem[] = [];

    try {
      // Chunk into batches of 50
      for (let i = 0; i < videoIds.length; i += 50) {
        const chunk = videoIds.slice(i, i + 50);
        let url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,status,processingDetails,contentDetails&id=${chunk.join(',')}`;

        if (!accessToken && this.apiKey) {
          url += `&key=${this.apiKey}`;
        }

        const res = await fetch(url, { headers });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          const errMsg = errJson?.error?.message || `YouTube API responded with status ${res.status}`;
          console.error(`[youtubeDataService] Video chunk batch fetch failed (${res.status}): ${errMsg}`);
          return {
            success: false,
            error: `Gagal mengambil metadata detail video YouTube (${res.status}): ${errMsg}`,
          };
        }

        const json = await res.json();
        const items: YouTubeVideoItem[] = (json.items || []).map((v: any) => ({
          id: v.id,
          title: v.snippet?.title || '',
          description: v.snippet?.description || '',
          publishedAt: v.snippet?.publishedAt || '',
          thumbnailUrl: v.snippet?.thumbnails?.maxres?.url || v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || '',
          privacyStatus: v.status?.privacyStatus || 'public',
          uploadStatus: v.status?.uploadStatus || 'processed',
          publishAt: v.status?.publishAt || null,
          duration: v.contentDetails?.duration,
          definition: v.contentDetails?.definition,
        }));
        allVideoItems.push(...items);
      }

      return { success: true, data: allVideoItems };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch video details' };
    }
  }

  /**
   * Queries existing scheduled videos on the YouTube channel to determine latest scheduled publishAt anchor,
   * scanning all uploaded playlist items via nextPageToken.
   * Filters videos with privacyStatus === 'private' and a valid publishAt timestamp.
   * Returns the furthest/latest scheduled video in the future as the anchor.
   */
  public async getScheduledVideosAnchor(
    channelId: string,
    uploadPlaylistId: string
  ): Promise<{
    latestPublishAt: string | null;
    latestVideoTitle: string | null;
    latestVideoId: string | null;
    totalScheduledCount: number;
    scheduledVideos: Array<{
      id: string;
      title: string;
      publishAt: string;
      privacyStatus: string;
      thumbnailUrl?: string;
    }>;
  }> {
    const uploadsResult = await this.getChannelUploads(channelId, uploadPlaylistId, 2500);
    if (!uploadsResult.success || !uploadsResult.data) {
      return {
        latestPublishAt: null,
        latestVideoTitle: null,
        latestVideoId: null,
        totalScheduledCount: 0,
        scheduledVideos: [],
      };
    }

    // Filter scheduled videos: privacyStatus === 'private' and valid ISO publishAt
    const scheduledList = uploadsResult.data.filter((v) => {
      const isPrivate = (v.privacyStatus || '').toLowerCase() === 'private';
      if (!isPrivate) return false;
      if (!v.publishAt) return false;
      const time = new Date(v.publishAt).getTime();
      return !isNaN(time) && time > 0;
    });

    let maxTimestamp = 0;
    let furthestItem: YouTubeVideoItem | null = null;

    for (const v of scheduledList) {
      const time = new Date(v.publishAt!).getTime();
      if (time > maxTimestamp) {
        maxTimestamp = time;
        furthestItem = v;
      }
    }

    return {
      latestPublishAt: furthestItem?.publishAt || null,
      latestVideoTitle: furthestItem?.title || null,
      latestVideoId: furthestItem?.id || null,
      totalScheduledCount: scheduledList.length,
      scheduledVideos: scheduledList.map((s) => ({
        id: s.id,
        title: s.title,
        publishAt: s.publishAt!,
        privacyStatus: s.privacyStatus,
        thumbnailUrl: s.thumbnailUrl,
      })),
    };
  }

  /**
   * Queries existing scheduled videos on the YouTube channel to determine latest scheduled publishAt.
   */
  public async getLatestScheduledDate(
    channelId: string,
    uploadPlaylistId: string,
    _isEligibleVideoId?: (videoId: string) => boolean
  ): Promise<string | null> {
    const anchor = await this.getScheduledVideosAnchor(channelId, uploadPlaylistId);
    return anchor.latestPublishAt;
  }

  /**
   * Executes a YouTube Data API request with automatic 401 token refresh & retry.
   */
  public async executeWithAuthRetry<T>(
    channelId: string,
    operationName: string,
    operation: (token: string) => Promise<{ res: Response; data?: any; error?: string }>
  ): Promise<{ success: boolean; data?: T; error?: string; status?: number }> {
    let token = await youtubeAuthService.getValidAccessToken(channelId);
    if (!token) {
      token = await youtubeAuthService.refreshAccessToken(channelId);
    }
    if (!token) {
      return {
        success: false,
        status: 401,
        error: `Authorization required to perform "${operationName}". Silakan hubungkan kembali channel melalui Google OAuth.`,
      };
    }

    let result = await operation(token);
    if (result.res && result.res.status === 401) {
      console.warn(`[youtubeDataService] YouTube Data API returned 401 for "${operationName}" (channel: ${channelId}). Refreshing token and retrying...`);
      const newToken = await youtubeAuthService.refreshAccessToken(channelId);
      if (newToken) {
        console.log(`[youtubeDataService] Google OAuth token refreshed. Retrying "${operationName}" now...`);
        result = await operation(newToken);
      } else {
        console.error(`[youtubeDataService] Failed to refresh token for channel ${channelId}.`);
      }
    }

    if (!result.res.ok) {
      const errJson = result.data || await result.res.json().catch(() => ({}));
      const errMsg = errJson?.error?.message || errJson?.error || result.error || `YouTube API error (${result.res.status})`;
      return {
        success: false,
        status: result.res.status,
        error: errMsg,
      };
    }

    const data = result.data !== undefined ? result.data : await result.res.json().catch(() => ({}));
    return {
      success: true,
      data,
    };
  }

  /**
   * Updates video title via YouTube Data API v3 with automatic 401 auto-refresh & retry.
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

    try {
      const retryResult = await this.executeWithAuthRetry(channelId, `updateVideoTitle(${videoId})`, async (token) => {
        // First get current snippet to preserve categoryId and description
        const getRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!getRes.ok) {
          const errJson = await getRes.json().catch(() => ({}));
          return { res: getRes, data: errJson, error: 'Failed to retrieve current video snippet before update.' };
        }
        const getJson = await getRes.json();
        if (!getJson.items || getJson.items.length === 0) {
          return { res: getRes, error: 'Video not found on YouTube.' };
        }

        const snippet = getJson.items[0].snippet;
        snippet.title = newTitle;

        const updateRes = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: videoId,
            snippet,
          }),
        });

        const updateJson = await updateRes.json().catch(() => ({}));
        return { res: updateRes, data: updateJson };
      });

      if (!retryResult.success) {
        return { success: false, error: retryResult.error || 'Failed to update video title' };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error updating title' };
    }
  }

  /**
   * Sets video thumbnail via YouTube Data API v3 with automatic 401 auto-refresh & retry.
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

    // Extract image buffer (supports both data URLs and remote URLs)
    let buffer: Buffer;
    try {
      if (thumbnailUrl.startsWith('data:image/')) {
        const base64Data = thumbnailUrl.split(',')[1];
        buffer = Buffer.from(base64Data, 'base64');
      } else {
        const imgRes = await fetch(thumbnailUrl);
        if (!imgRes.ok) {
          return { success: false, error: `Failed to download master thumbnail from ${thumbnailUrl}` };
        }
        const arrayBuffer = await imgRes.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      }
    } catch (readErr: any) {
      return { success: false, error: `Failed to read thumbnail data: ${readErr.message}` };
    }

    try {
      const retryResult = await this.executeWithAuthRetry(channelId, `updateVideoThumbnail(${videoId})`, async (token) => {
        const uploadRes = await fetch(
          `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'image/jpeg',
            },
            body: new Uint8Array(buffer) as any,
          }
        );

        const uploadJson = await uploadRes.json().catch(() => ({}));
        return { res: uploadRes, data: uploadJson };
      });

      if (!retryResult.success) {
        return { success: false, error: retryResult.error || 'Failed to upload thumbnail' };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error uploading thumbnail' };
    }
  }

  /**
   * Sets scheduled publishing time (publishAt) on YouTube with automatic 401 auto-refresh & retry.
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

    try {
      const retryResult = await this.executeWithAuthRetry(channelId, `scheduleVideo(${videoId})`, async (token) => {
        const updateRes = await fetch('https://www.googleapis.com/youtube/v3/videos?part=status', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
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

        const updateJson = await updateRes.json().catch(() => ({}));
        return { res: updateRes, data: updateJson };
      });

      if (!retryResult.success) {
        return { success: false, error: retryResult.error || 'Failed to schedule video' };
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
