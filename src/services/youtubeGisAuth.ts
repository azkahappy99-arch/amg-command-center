/**
 * YouTube Data API v3 Client-Side Authorization via Google Identity Services (GIS)
 * Client ID: 140483783524-8gqs0lc2p401mopm32hvrk1ej7kkqtof.apps.googleusercontent.com
 * Scope: https://www.googleapis.com/auth/youtube.readonly
 */

import { ManagedVideo, ManagementScope, VideoManagementStatus } from '../types/index.ts';

export const GIS_CONFIG = {
  CLIENT_ID: '140483783524-8gqs0lc2p401mopm32hvrk1ej7kkqtof.apps.googleusercontent.com',
  SCOPE:
    'https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
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
  allChannels?: YouTubeChannelSnippet[];
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
 * https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true
 * Returns ALL channels owned by the authenticated Google account.
 */
export async function fetchAllMyYouTubeChannels(accessToken: string): Promise<YouTubeChannelSnippet[]> {
  const url = 'https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true';

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
    throw new Error('Tidak ada channel YouTube yang ditemukan untuk akun Google ini. Pastikan Anda telah membuat channel di YouTube.');
  }

  const channelsList: YouTubeChannelSnippet[] = data.items.map((item: any) => {
    const snippet = item.snippet || {};
    const stats = item.statistics || {};
    const thumbnails = snippet.thumbnails || {};

    return {
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
  });

  try {
    if (channelsList.length > 0) {
      localStorage.setItem(GIS_CONFIG.STORAGE_KEY_CHANNEL, JSON.stringify(channelsList[0]));
      for (const ch of channelsList) {
        savePersistedConnectedChannel(ch);
      }
    }
  } catch (e) {
    console.warn('Could not cache channel data in localStorage:', e);
  }

  return channelsList;
}

/**
 * Fetches the primary/first authenticated YouTube channel
 */
export async function fetchMyYouTubeChannel(accessToken: string): Promise<YouTubeChannelSnippet> {
  const all = await fetchAllMyYouTubeChannels(accessToken);
  return all[0];
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
    const cleanId = channelId.startsWith('chan-') ? channelId.replace('chan-', '') : channelId;
    const list = getPersistedConnectedChannels().filter(
      (c) => c.id !== channelId && c.id !== cleanId && `chan-${c.id}` !== channelId
    );
    localStorage.setItem('amg_persistent_channels_list', JSON.stringify(list));

    const storedConnectedRaw = localStorage.getItem(GIS_CONFIG.STORAGE_KEY_CHANNEL);
    if (storedConnectedRaw) {
      try {
        const parsed = JSON.parse(storedConnectedRaw);
        if (parsed.id === channelId || parsed.id === cleanId || `chan-${parsed.id}` === channelId) {
          if (list.length > 0) {
            localStorage.setItem(GIS_CONFIG.STORAGE_KEY_CHANNEL, JSON.stringify(list[0]));
          } else {
            localStorage.removeItem(GIS_CONFIG.STORAGE_KEY_CHANNEL);
          }
        }
      } catch {}
    }
  } catch (e) {
    console.warn('Could not remove channel from localStorage:', e);
  }
}

export function markChannelAsUnlinked(channelId: string): void {
  try {
    if (!channelId) return;
    const cleanId = channelId.startsWith('chan-') ? channelId.replace('chan-', '') : channelId;
    const raw = localStorage.getItem('amg_unlinked_channel_ids');
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(channelId)) list.push(channelId);
    if (!list.includes(cleanId)) list.push(cleanId);
    if (!list.includes(`chan-${cleanId}`)) list.push(`chan-${cleanId}`);
    localStorage.setItem('amg_unlinked_channel_ids', JSON.stringify(list));
  } catch {}
}

export function unmarkChannelAsUnlinked(channelId: string): void {
  try {
    if (!channelId) return;
    const cleanId = channelId.startsWith('chan-') ? channelId.replace('chan-', '') : channelId;
    const raw = localStorage.getItem('amg_unlinked_channel_ids');
    if (!raw) return;
    const list: string[] = JSON.parse(raw);
    const filtered = list.filter((id) => id !== channelId && id !== cleanId && id !== `chan-${cleanId}`);
    localStorage.setItem('amg_unlinked_channel_ids', JSON.stringify(filtered));
  } catch {}
}

/**
 * Complete interactive flow:
 * 1. Opens GIS popup and obtains token
 * 2. Fetches ALL YouTube Channels belonging to the authenticated account
 * 3. Returns all channels for comprehensive sync
 */
export async function authorizeAndFetchYouTubeChannel(promptConsent: boolean = false): Promise<GisAuthResult> {
  const token = await requestGisAccessToken(promptConsent);
  const allChannels = await fetchAllMyYouTubeChannels(token);
  const channel = allChannels[0];

  for (const ch of allChannels) {
    try {
      await fetchChannelVideosFromYouTube(token, ch.id);
    } catch (videoErr) {
      console.warn(`Initial YouTube videos sync warning for channel ${ch.title}:`, videoErr);
    }
  }

  return {
    accessToken: token,
    expiresIn: 3600,
    channel,
    allChannels,
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

    const cleanChanId = targetChannelId ? targetChannelId.replace(/^chan-/, '') : '';
    let channelItem = chanData.items[0];
    if (cleanChanId) {
      const matched = chanData.items.find((it: any) => it.id === cleanChanId);
      if (matched) {
        channelItem = matched;
      } else if (cleanChanId.startsWith('UC')) {
        try {
          const directRes = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&id=${cleanChanId}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
              },
            }
          );
          if (directRes.ok) {
            const directData = await directRes.json();
            if (directData.items && directData.items.length > 0) {
              channelItem = directData.items[0];
            }
          }
        } catch {}
      }
    }

    const chanId = channelItem.id;
    const chanTitle = channelItem.snippet?.title || 'YouTube Channel';
    const uploadsPlaylistId =
      channelItem.contentDetails?.relatedPlaylists?.uploads ||
      (chanId.startsWith('UC') ? 'UU' + chanId.slice(2) : '');

    let videoIds: string[] = [];

    // 2. Full Channel Scan: Fetch playlist items with pagination from the Uploads playlist
    if (uploadsPlaylistId) {
      let pageToken: string | undefined = undefined;
      let pagesCount = 0;
      const MAX_PAGES = 60; // Supports up to 3000 videos for exhaustive scan across all pages

      try {
        do {
          const pageParam: string = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
          const plRes: Response = await fetch(
            `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails,status&playlistId=${encodeURIComponent(
              uploadsPlaylistId
            )}&maxResults=50${pageParam}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
              },
            }
          );
          if (!plRes.ok) break;

          const plData: any = await plRes.json();
          if (Array.isArray(plData.items)) {
            for (const it of plData.items) {
              const vidId = it.contentDetails?.videoId || it.snippet?.resourceId?.videoId;
              if (vidId && !videoIds.includes(vidId)) {
                videoIds.push(vidId);
              }
            }
          }

          pageToken = plData.nextPageToken;
          pagesCount++;
        } while (pageToken && pagesCount < MAX_PAGES);
      } catch (plErr) {
        console.warn('PlaylistItems fetch error, trying search fallback:', plErr);
      }
    }

    // Also check Shorts playlist if uploadPlaylistId starts with UU
    if (uploadsPlaylistId && uploadsPlaylistId.startsWith('UU') && videoIds.length < 500) {
      const shortsPlaylistId = 'UUSH' + uploadsPlaylistId.slice(2);
      let shortsPageToken: string | undefined = undefined;
      let shortsPages = 0;
      try {
        do {
          const pageParam: string = shortsPageToken ? `&pageToken=${encodeURIComponent(shortsPageToken)}` : '';
          const sPlRes: Response = await fetch(
            `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails,status&playlistId=${encodeURIComponent(
              shortsPlaylistId
            )}&maxResults=50${pageParam}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
              },
            }
          );
          if (!sPlRes.ok) break;
          const sPlData: any = await sPlRes.json();
          if (Array.isArray(sPlData.items)) {
            for (const it of sPlData.items) {
              const vidId = it.contentDetails?.videoId || it.snippet?.resourceId?.videoId;
              if (vidId && !videoIds.includes(vidId)) {
                videoIds.push(vidId);
              }
            }
          }
          shortsPageToken = sPlData.nextPageToken;
          shortsPages++;
        } while (shortsPageToken && shortsPages < 10 && videoIds.length < 500);
      } catch {
        // Shorts playlist optional
      }
    }

    // Comprehensive scan: query search.list with pagination to discover all remaining private/raw uploads
    if (videoIds.length < 500) {
      try {
        let searchPageToken: string | undefined = undefined;
        let searchPages = 0;
        do {
          const pageParam: string = searchPageToken ? `&pageToken=${encodeURIComponent(searchPageToken)}` : '';
          const searchRes: Response = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=50${pageParam}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
              },
            }
          );
          if (!searchRes.ok) break;
          const searchData: any = await searchRes.json();
          if (Array.isArray(searchData.items)) {
            for (const it of searchData.items) {
              const vidId = it.id?.videoId || it.snippet?.resourceId?.videoId;
              if (vidId && !videoIds.includes(vidId)) {
                videoIds.push(vidId);
              }
            }
          }
          searchPageToken = searchData.nextPageToken;
          searchPages++;
        } while (searchPageToken && searchPages < 10 && videoIds.length < 500);
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

    // 3. Fetch detailed video metrics in chunks of 50
    const detailedItems: any[] = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      const chunk = videoIds.slice(i, i + 50);
      try {
        const videosRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status,statistics&id=${chunk.join(',')}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
            },
          }
        );
        if (videosRes.ok) {
          const vData = await videosRes.json();
          if (Array.isArray(vData.items)) {
            detailedItems.push(...vData.items);
          }
        }
      } catch (chunkErr) {
        console.warn('Video chunk fetch error:', chunkErr);
      }
    }

    // Existing videos lookup map for IDEMPOTENCY (preserve existing assigned title, thumbnail, schedule, scope)
    const rawExisting = localStorage.getItem('amg_videos');
    const existingMap = new Map<string, ManagedVideo>();
    if (rawExisting) {
      try {
        const parsed = JSON.parse(rawExisting);
        if (Array.isArray(parsed)) {
          for (const ev of parsed) {
            if (ev.youtubeVideoId) existingMap.set(ev.youtubeVideoId, ev);
            if (ev.id) existingMap.set(ev.id, ev);
          }
        }
      } catch {
        // ignore
      }
    }

    const managedVideos: ManagedVideo[] = detailedItems.map((v: any) => {
      const existing = existingMap.get(v.id) || existingMap.get(`yt-vid-${v.id}`);
      const isHd = v.contentDetails?.definition === 'hd';
      const privacy = (v.status?.privacyStatus || 'public') as any;
      const publishAt = v.status?.publishAt || null;
      const thumb =
        v.snippet?.thumbnails?.high?.url ||
        v.snippet?.thumbnails?.medium?.url ||
        v.snippet?.thumbnails?.default?.url ||
        '';

      const isPrivate = privacy === 'private';
      const isScheduled = Boolean(publishAt);

      let managementScope: ManagementScope = existing ? (existing.managementScope || 'REGULAR') : 'REGULAR';
      let isAmgEligible = existing ? !!existing.isAmgEligible : true;
      let isManaged = existing ? existing.isManaged : false;
      let managementStatus: VideoManagementStatus = existing ? existing.managementStatus : 'DISCOVERED';
      let exclusionReason: string | undefined = existing?.exclusionReason;

      // STRICT PRIVACY FILTER:
      // Hanya video berstatus private DAN belum memiliki jadwal publikasi (publishAt kosong/null)
      if (!isPrivate) {
        // Video yang statusnya public atau unlisted otomatis dikecualikan/diabaikan dari pipeline otomasi
        managementScope = 'EXCLUDED';
        isAmgEligible = false;
        isManaged = true; // Dikecualikan dari kandidat mentah
        managementStatus = 'EXCLUDED';
        exclusionReason = `Status Privasi: ${(privacy || 'PUBLIC').toUpperCase()}. Video public dan unlisted otomatis dikecualikan; hanya video private mentah tanpa jadwal yang diproses otomatis AMG.`;
      } else if (isScheduled) {
        // Video yang sudah berstatus scheduled (sudah terjadwal) tidak boleh masuk ke video terdeteksi/antrean baru
        managementScope = 'EXCLUDED';
        isAmgEligible = false;
        isManaged = true; // Dikecualikan karena sudah terjadwal di YouTube
        managementStatus = 'SCHEDULED';
        exclusionReason = `Video sudah memiliki jadwal publikasi YouTube (${publishAt}). Dikecualikan dari video terdeteksi/antrean baru.`;
      } else {
        // Raw private video mentah TANPA jadwal publikasi (privacyStatus === 'private' && !publishAt)
        // Langsung masuk ke kategori AMG Reguler / INCLUDED
        const isAlreadyCompleted = existing?.managementStatus === 'COMPLETED';
        managementScope = 'REGULAR';
        isAmgEligible = true;
        isManaged = isAlreadyCompleted ? true : false;
        managementStatus = isAlreadyCompleted
          ? 'COMPLETED'
          : (existing?.managementStatus === 'PROCESSING' || existing?.managementStatus === 'ENROLLED'
            ? existing.managementStatus
            : 'DISCOVERED');
        exclusionReason = undefined;
      }

      return {
        id: existing?.id || `yt-vid-${v.id}`,
        youtubeVideoId: v.id,
        channelId: assignedChanId,
        channelTitle: chanTitle,
        titleBefore: v.snippet?.title || 'Video Tanpa Judul',
        titleAssigned: existing?.titleAssigned || '',
        thumbnailBefore: thumb,
        thumbnailAssigned: existing?.thumbnailAssigned || '',
        originalUploadAt: v.snippet?.publishedAt || new Date().toISOString(),
        uploadedAt: v.snippet?.publishedAt,
        processingStatus: 'processed',
        privacyStatus: privacy,
        publishAt: publishAt || undefined,
        scheduledPublishAt: publishAt || existing?.scheduledPublishAt || undefined,
        managementStatus,
        managementScope,
        isAmgEligible,
        isManaged,
        retryCount: existing?.retryCount || 0,
        exclusionReason,
        definition: isHd ? 'hd' : 'sd',
        duration: v.contentDetails?.duration,
        isSeeded: false,
        createdAt: existing?.createdAt || v.snippet?.publishedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    updateChannelVideosInStorage(assignedChanId, chanId, chanTitle, managedVideos);

    // Sync to backend store asynchronously
    try {
      fetch('/api/videos/batch-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: assignedChanId,
          youtubeChannelId: chanId,
          channelTitle: chanTitle,
          videos: managedVideos,
        }),
      }).catch((e) => console.warn('Backend video batch-sync notice:', e));
    } catch {
      // ignore
    }

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
            !v.id?.startsWith('vid-') &&
            !v.titleBefore?.toLowerCase().includes('suara ayam pagi menenangkan') &&
            !v.titleBefore?.toLowerCase().includes('dummy') &&
            !v.titleBefore?.toLowerCase().includes('mock') &&
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
          // Identify furthest scheduled anchor in future
          let maxSched = 0;
          let latestPubAt: string | null = null;
          let latestTitle: string | null = null;
          let latestId: string | null = null;
          let scheduledCount = 0;

          for (const nv of newVideos) {
            const isPriv = (nv.privacyStatus || '').toLowerCase() === 'private';
            if (!isPriv) continue;
            const pub = nv.publishAt || (nv as any).status?.publishAt || nv.scheduledPublishAt;
            if (pub) {
              const t = new Date(pub).getTime();
              if (!isNaN(t) && t > 0) {
                scheduledCount++;
                if (t > maxSched) {
                  maxSched = t;
                  latestPubAt = pub;
                  latestTitle = nv.titleBefore || nv.titleAssigned || nv.id;
                  latestId = nv.youtubeVideoId || nv.id;
                }
              }
            }
          }

          if (latestPubAt) {
            parsedChannels[cIdx].lastScheduledPublishAt = latestPubAt;
            parsedChannels[cIdx].latestManagedScheduledAt = latestPubAt;
            parsedChannels[cIdx].lastScheduledVideoTitle = latestTitle || parsedChannels[cIdx].lastScheduledVideoTitle;
            parsedChannels[cIdx].lastScheduledVideoId = latestId || parsedChannels[cIdx].lastScheduledVideoId;
          }
          parsedChannels[cIdx].scheduleStockCount = scheduledCount;
          parsedChannels[cIdx].videoCount = newVideos.length;

          // Strict 5-exclusion filter for unmanaged private raw videos
          parsedChannels[cIdx].unmanagedVideoCount = newVideos.filter((v) => {
            const priv = (v.privacyStatus || '').toLowerCase();
            if (priv !== 'private') return false;
            const pub = v.publishAt || v.scheduledPublishAt;
            if (pub) {
              const t = new Date(pub).getTime();
              if (!isNaN(t) && t > 0) return false;
            }
            if (v.isManaged === true) return false;
            const st = (v.managementStatus || '').toUpperCase();
            if (
              st === 'MANAGED' ||
              st === 'PROCESSED' ||
              st === 'COMPLETED' ||
              st === 'SCHEDULED' ||
              st === 'EXCLUDED' ||
              st === 'QUEUED' ||
              st === 'PROCESSING' ||
              st === 'RETRY'
            ) {
              return false;
            }
            if (v.automationBatchId && v.automationBatchId.trim() !== '') return false;
            if (v.titleAssigned && v.titleAssigned.trim() !== '' && v.titleAssigned !== v.titleBefore) return false;
            if (v.thumbnailAssigned && v.thumbnailAssigned.trim() !== '' && v.thumbnailAssigned !== v.thumbnailBefore) return false;
            return true;
          }).length;
          parsedChannels[cIdx].lastSyncAt = new Date().toISOString();
          localStorage.setItem('amg_channels', JSON.stringify(parsedChannels));
        }
      }
    }
  } catch (e) {
    console.warn('Could not updateChannelVideosInStorage:', e);
  }
}


