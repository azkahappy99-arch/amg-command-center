/**
 * YouTube Data API v3 Client-Side Authorization via Google Identity Services (GIS)
 * Client ID: 140483783524-8gqs0lc2p401mopm32hvrk1ej7kkqtof.apps.googleusercontent.com
 * Scope: https://www.googleapis.com/auth/youtube.readonly
 */

import { ManagedVideo } from '../types/index.ts';

export const GIS_CONFIG = {
  CLIENT_ID: '140483783524-8gqs0lc2p401mopm32hvrk1ej7kkqtof.apps.googleusercontent.com',
  SCOPE: 'https://www.googleapis.com/auth/youtube.readonly',
  STORAGE_KEY_TOKEN: 'amg_youtube_access_token',
  STORAGE_KEY_EXPIRES: 'amg_youtube_token_expires_at',
  STORAGE_KEY_CHANNEL: 'amg_youtube_connected_channel',
};

export interface YouTubeChannelSnippet {
  id: string;
  title: string;
  description?: string;
  customUrl?: string;
  thumbnailUrl?: string;
  subscriberCount: number;
  videoCount: number;
  viewCount?: number;
}

export interface GisAuthResult {
  accessToken: string;
  expiresIn: number;
  channel: YouTubeChannelSnippet;
}

// Global declaration for Google Identity Services
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: any) => void;
            error_callback?: (error: any) => void;
            prompt?: string;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

/**
 * Ensures Google Identity Services (GIS) script is loaded
 */
export async function ensureGsiScriptLoaded(): Promise<void> {
  if (window.google?.accounts?.oauth2) {
    return;
  }

  return new Promise<void>((resolve, reject) => {
    // Check if script tag already exists in DOM
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      const interval = setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          clearInterval(interval);
          resolve();
        }
      }, 50);

      setTimeout(() => {
        clearInterval(interval);
        if (window.google?.accounts?.oauth2) {
          resolve();
        } else {
          reject(new Error('GSI script load timed out. Please check your internet connection.'));
        }
      }, 7000);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const interval = setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          clearInterval(interval);
          resolve();
        }
      }, 50);

      setTimeout(() => {
        clearInterval(interval);
        if (window.google?.accounts?.oauth2) resolve();
        else reject(new Error('GSI library failed to initialize.'));
      }, 5000);
    };
    script.onerror = () => reject(new Error('Failed to load Google Identity Services library.'));
    document.head.appendChild(script);
  });
}

/**
 * Retrieves the stored GIS access token if not expired
 */
export function getStoredGisToken(): string | null {
  try {
    const token = localStorage.getItem(GIS_CONFIG.STORAGE_KEY_TOKEN);
    const expiresAt = localStorage.getItem(GIS_CONFIG.STORAGE_KEY_EXPIRES);
    if (!token) return null;

    if (expiresAt && Date.now() > parseInt(expiresAt, 10)) {
      // Token expired
      localStorage.removeItem(GIS_CONFIG.STORAGE_KEY_TOKEN);
      localStorage.removeItem(GIS_CONFIG.STORAGE_KEY_EXPIRES);
      return null;
    }

    return token;
  } catch {
    return null;
  }
}

/**
 * Stores token and metadata in localStorage
 */
export function storeGisToken(token: string, expiresInSeconds: number = 3600): void {
  try {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    localStorage.setItem(GIS_CONFIG.STORAGE_KEY_TOKEN, token);
    localStorage.setItem(GIS_CONFIG.STORAGE_KEY_EXPIRES, expiresAt.toString());
  } catch (err) {
    console.warn('Could not store token in localStorage:', err);
  }
}

/**
 * Clears stored GIS token
 */
export function clearStoredGisToken(): void {
  try {
    localStorage.removeItem(GIS_CONFIG.STORAGE_KEY_TOKEN);
    localStorage.removeItem(GIS_CONFIG.STORAGE_KEY_EXPIRES);
    localStorage.removeItem(GIS_CONFIG.STORAGE_KEY_CHANNEL);
  } catch (err) {
    console.warn('Could not clear token from localStorage:', err);
  }
}

/**
 * Prompts Google OAuth popup via GIS to request interactive access token
 */
export async function requestGisAccessToken(promptConsent: boolean = false): Promise<string> {
  await ensureGsiScriptLoaded();

  return new Promise<string>((resolve, reject) => {
    try {
      const tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: GIS_CONFIG.CLIENT_ID,
        scope: GIS_CONFIG.SCOPE,
        callback: (resp: any) => {
          if (resp.error) {
            const isUserCancel =
              resp.error === 'access_denied' ||
              resp.error === 'user_cancelled' ||
              resp.error === 'popup_closed';
            if (isUserCancel) {
              console.warn('[GIS] OAuth Authorization cancelled or dismissed by user:', resp.error);
            } else {
              console.warn('[GIS] OAuth notice:', resp);
            }
            const errObj = new Error(resp.error_description || resp.error || 'Google OAuth Authorization declined.');
            if (isUserCancel) (errObj as any).isPopupClosed = true;
            reject(errObj);
            return;
          }

          if (!resp.access_token) {
            reject(new Error('No access token returned from Google Identity Services.'));
            return;
          }

          const expiresIn = parseInt(resp.expires_in || '3600', 10);
          storeGisToken(resp.access_token, expiresIn);
          resolve(resp.access_token);
        },
        error_callback: (err: any) => {
          const errMsg = typeof err?.message === 'string' ? err.message : '';
          const errType = err?.type || '';
          const isClosed =
            errType === 'popup_closed' ||
            errType === 'popup_failed_to_open' ||
            errMsg.toLowerCase().includes('popup window closed') ||
            errMsg.toLowerCase().includes('closed') ||
            errMsg.toLowerCase().includes('cancel') ||
            errMsg.toLowerCase().includes('dismiss');

          if (isClosed) {
            console.warn('[GIS] Token Client: Popup window closed by user.');
          } else {
            console.warn('[GIS] Token Client notice:', err);
          }

          const errorObj = new Error(errMsg || (isClosed ? 'Popup window closed' : 'Google OAuth popup was closed or blocked.'));
          (errorObj as any).isPopupClosed = isClosed;
          (errorObj as any).type = errType;
          reject(errorObj);
        },
      });

      tokenClient.requestAccessToken(promptConsent ? { prompt: 'consent' } : undefined);
    } catch (err: any) {
      reject(new Error(err.message || 'Failed to initialize Google Identity Services client.'));
    }
  });
}

/**
 * Directly calls YouTube Data API v3 endpoint:
 * https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true
 */
export async function fetchMyYouTubeChannel(accessToken: string): Promise<YouTubeChannelSnippet> {
  const url = 'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true';

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const message =
      errorBody?.error?.message ||
      `YouTube Data API v3 error (${res.status}: ${res.statusText})`;
    throw new Error(message);
  }

  const data = await res.json();
  if (!data.items || data.items.length === 0) {
    throw new Error('No YouTube channel found for this Google account. Please create a channel first on YouTube.');
  }

  const item = data.items[0];
  const snippet = item.snippet || {};
  const stats = item.statistics || {};
  const thumbnails = snippet.thumbnails || {};

  const channelData: YouTubeChannelSnippet = {
    id: item.id,
    title: snippet.title || 'Untitled Channel',
    description: snippet.description || '',
    customUrl: snippet.customUrl || `@${item.id}`,
    thumbnailUrl:
      thumbnails.high?.url ||
      thumbnails.medium?.url ||
      thumbnails.default?.url ||
      '',
    subscriberCount: parseInt(stats.subscriberCount || '0', 10),
    videoCount: parseInt(stats.videoCount || '0', 10),
    viewCount: parseInt(stats.viewCount || '0', 10),
  };

  try {
    localStorage.setItem(GIS_CONFIG.STORAGE_KEY_CHANNEL, JSON.stringify(channelData));
    savePersistedConnectedChannel(channelData);

    // Also directly ensure amg_channels has this channel marked as CONNECTED in localStorage
    const rawChannels = localStorage.getItem('amg_channels');
    if (rawChannels) {
      const parsed = JSON.parse(rawChannels);
      if (Array.isArray(parsed)) {
        const idx = parsed.findIndex(
          (c: any) =>
            c.youtubeChannelId === channelData.id ||
            c.id === channelData.id ||
            c.id === `chan-${channelData.id}`
        );
        if (idx >= 0) {
          parsed[idx].title = channelData.title || parsed[idx].title;
          parsed[idx].thumbnailUrl = channelData.thumbnailUrl || parsed[idx].thumbnailUrl;
          parsed[idx].status = 'CONNECTED';
          parsed[idx].connectedAt = parsed[idx].connectedAt || new Date().toISOString();
          parsed[idx].isSeeded = false;
        } else {
          parsed.unshift({
            id: `chan-${channelData.id}`,
            youtubeChannelId: channelData.id,
            title: channelData.title,
            thumbnailUrl: channelData.thumbnailUrl || '',
            status: 'CONNECTED',
            connectedAt: new Date().toISOString(),
            subscriberCount: channelData.subscriberCount || 0,
            videoCount: channelData.videoCount || 0,
            isSeeded: false,
          });
        }
        localStorage.setItem('amg_channels', JSON.stringify(parsed));
      }
    }
  } catch (e) {
    console.warn('Could not cache channel data in localStorage:', e);
  }

  return channelData;
}

export function getPersistedConnectedChannels(): YouTubeChannelSnippet[] {
  try {
    const raw = localStorage.getItem('amg_persistent_channels_list');
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function savePersistedConnectedChannel(channel: YouTubeChannelSnippet): void {
  try {
    const list = getPersistedConnectedChannels();
    const existingIdx = list.findIndex((c) => c.id === channel.id);
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...channel };
    } else {
      list.push(channel);
    }
    localStorage.setItem('amg_persistent_channels_list', JSON.stringify(list));
  } catch (e) {
    console.warn('Could not persist channel list to localStorage:', e);
  }
}

export function removePersistedConnectedChannel(channelId: string): void {
  try {
    const list = getPersistedConnectedChannels().filter((c) => c.id !== channelId);
    localStorage.setItem('amg_persistent_channels_list', JSON.stringify(list));
  } catch (e) {
    console.warn('Could not remove channel from localStorage:', e);
  }
}

/**
 * Complete interactive flow:
 * 1. Opens GIS popup and obtains token
 * 2. Fetches YouTube Channel details via YouTube Data API v3
 * 3. Fetches live videos and persists to localStorage
 */
export async function authorizeAndFetchYouTubeChannel(promptConsent: boolean = false): Promise<GisAuthResult> {
  const token = await requestGisAccessToken(promptConsent);
  const channel = await fetchMyYouTubeChannel(token);

  try {
    await fetchChannelVideosFromYouTube(token, `chan-${channel.id}`);
  } catch (videoErr) {
    console.warn('Initial YouTube videos sync warning:', videoErr);
  }

  return {
    accessToken: token,
    expiresIn: 3600,
    channel,
  };
}

/**
 * Fetches real uploaded videos for the active/connected YouTube channel using YouTube Data API v3
 * Uses contentDetails.relatedPlaylists.uploads -> playlistItems and videos endpoints
 * Caches results into localStorage under 'amg_videos'
 */
export async function fetchChannelVideosFromYouTube(
  accessToken: string,
  targetChannelId?: string
): Promise<ManagedVideo[]> {
  try {
    // 1. Fetch channel's uploads playlist ID and stats
    const chanRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    if (!chanRes.ok) {
      const err = await chanRes.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Gagal mengambil profil YouTube channel (${chanRes.status})`);
    }

    const chanData = await chanRes.json();
    if (!chanData.items || chanData.items.length === 0) {
      return [];
    }

    const channelItem = chanData.items[0];
    const chanId = channelItem.id;
    const chanTitle = channelItem.snippet?.title || 'YouTube Channel';
    const uploadsPlaylistId =
      channelItem.contentDetails?.relatedPlaylists?.uploads ||
      (chanId.startsWith('UC') ? 'UU' + chanId.slice(2) : '');

    let videoIds: string[] = [];

    // 2. Fetch playlist items from the Uploads playlist
    if (uploadsPlaylistId) {
      try {
        const plRes = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails,status&playlistId=${uploadsPlaylistId}&maxResults=50`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
            },
          }
        );
        if (plRes.ok) {
          const plData = await plRes.json();
          if (Array.isArray(plData.items)) {
            videoIds = plData.items
              .map((it: any) => it.contentDetails?.videoId || it.snippet?.resourceId?.videoId)
              .filter(Boolean);
          }
        }
      } catch (plErr) {
        console.warn('PlaylistItems fetch error, trying search fallback:', plErr);
      }
    }

    // Fallback: If playlist was empty or unavailable, try search
    if (videoIds.length === 0) {
      try {
        const searchRes = await fetch(
          'https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=50',
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
            },
          }
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (Array.isArray(searchData.items)) {
            videoIds = searchData.items.map((it: any) => it.id?.videoId).filter(Boolean);
          }
        }
      } catch (sErr) {
        console.warn('Search fallback notice:', sErr);
      }
    }

    const assignedChanId = targetChannelId || `chan-${chanId}`;

    if (videoIds.length === 0) {
      // Channel has 0 videos uploaded yet
      updateChannelVideosInStorage(assignedChanId, chanId, chanTitle, []);
      return [];
    }

    // 3. Fetch detailed video metrics (definition for HD, status, durations)
    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status,statistics&id=${videoIds.slice(0, 50).join(',')}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    let detailedItems: any[] = [];
    if (videosRes.ok) {
      const vData = await videosRes.json();
      detailedItems = vData.items || [];
    }

    const managedVideos: ManagedVideo[] = detailedItems.map((v: any) => {
      const isHd = v.contentDetails?.definition === 'hd';
      const privacy = (v.status?.privacyStatus || 'public') as any;
      const thumb =
        v.snippet?.thumbnails?.high?.url ||
        v.snippet?.thumbnails?.medium?.url ||
        v.snippet?.thumbnails?.default?.url ||
        '';

      return {
        id: `yt-vid-${v.id}`,
        youtubeVideoId: v.id,
        channelId: assignedChanId,
        channelTitle: chanTitle,
        titleBefore: v.snippet?.title || 'Video Tanpa Judul',
        titleAssigned: '',
        thumbnailBefore: thumb,
        thumbnailAssigned: '',
        originalUploadAt: v.snippet?.publishedAt || new Date().toISOString(),
        uploadedAt: v.snippet?.publishedAt,
        processingStatus: 'processed',
        privacyStatus: privacy,
        managementStatus: 'DISCOVERED',
        managementScope: 'REGULAR',
        isAmgEligible: true,
        isManaged: false, // Counts towards "VIDEO BARU"
        retryCount: 0,
        definition: isHd ? 'hd' : 'sd', // Counts towards "SIAP HD" if 'hd'
        duration: v.contentDetails?.duration,
        isSeeded: false,
        createdAt: v.snippet?.publishedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    updateChannelVideosInStorage(assignedChanId, chanId, chanTitle, managedVideos);
    return managedVideos;
  } catch (err) {
    console.warn('fetchChannelVideosFromYouTube error:', err);
    throw err;
  }
}

function updateChannelVideosInStorage(
  channelId: string,
  youtubeChannelId: string,
  channelTitle: string,
  newVideos: ManagedVideo[]
) {
  try {
    const rawVideos = localStorage.getItem('amg_videos');
    let existing: ManagedVideo[] = [];
    if (rawVideos) {
      try {
        existing = JSON.parse(rawVideos);
      } catch {
        existing = [];
      }
    }
    // Clean out any seeded dummy videos
    const cleanExisting = Array.isArray(existing)
      ? existing.filter(
          (v: any) =>
            !v.isSeeded &&
            !v.id?.startsWith('vid-old-') &&
            !v.id?.startsWith('vid-new-') &&
            !v.titleBefore?.includes('Copy of A') &&
            !v.titleBefore?.includes('[DEMO FIXTURE]') &&
            !v.titleBefore?.includes('Demo Fixture') &&
            v.channelId !== 'chan-ayam-warna' &&
            v.channelId !== 'chan-suara-alam' &&
            v.channelId !== 'chan-murottal' &&
            v.channelId !== 'chan-kucing-gemoy'
        )
      : [];

    // Keep videos for other channels
    const otherChannelsVideos = cleanExisting.filter(
      (v) =>
        v.channelId !== channelId &&
        v.channelId !== youtubeChannelId &&
        v.channelId !== `chan-${youtubeChannelId}`
    );

    const mergedVideos = [...newVideos, ...otherChannelsVideos];
    localStorage.setItem('amg_videos', JSON.stringify(mergedVideos));

    // Also update channel's videoCount in amg_channels
    const rawChannels = localStorage.getItem('amg_channels');
    if (rawChannels) {
      const parsedChannels = JSON.parse(rawChannels);
      if (Array.isArray(parsedChannels)) {
        const cIdx = parsedChannels.findIndex(
          (c: any) =>
            c.id === channelId ||
            c.youtubeChannelId === youtubeChannelId ||
            c.id === `chan-${youtubeChannelId}` ||
            c.youtubeChannelId === channelId
        );
        if (cIdx >= 0) {
          parsedChannels[cIdx].videoCount = newVideos.length;
          parsedChannels[cIdx].unmanagedVideoCount = newVideos.filter((v) => !v.isManaged).length;
          parsedChannels[cIdx].lastSyncAt = new Date().toISOString();
          localStorage.setItem('amg_channels', JSON.stringify(parsedChannels));
        }
      }
    }
  } catch (e) {
    console.warn('Could not updateChannelVideosInStorage:', e);
  }
}


