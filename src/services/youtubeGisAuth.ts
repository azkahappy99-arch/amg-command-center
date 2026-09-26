/**
 * YouTube Data API v3 Client-Side Authorization via Google Identity Services (GIS)
 * Client ID: 140483783524-8gqs0lc2p401mopm32hvrk1ej7kkqtof.apps.googleusercontent.com
 * Scope: https://www.googleapis.com/auth/youtube.readonly
 */

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
            console.error('[GIS] OAuth Error:', resp);
            reject(new Error(resp.error_description || resp.error || 'Google OAuth Authorization declined.'));
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
          console.error('[GIS] Token Client Error:', err);
          reject(new Error(err?.message || 'Google OAuth popup was closed or blocked.'));
        },
      });

      tokenClient.requestAccessToken({ prompt: promptConsent ? 'consent' : '' });


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
        `YouTube Data API error (${res.status}: ${res.statusText})`;
      alert("Gagal memuat channel YouTube: " + message);
      throw new Error(message);
    }

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
  } catch (e) {
    console.warn('Could not cache channel data:', e);
  

  return channelData;
}

/**
 * Complete interactive flow:
 * 1. Opens GIS popup and obtains token
 * 2. Fetches YouTube Channel details via YouTube Data API v3
 * 3. Persists to backend & localStorage
 */
export async function authorizeAndFetchYouTubeChannel(promptConsent: boolean = false): Promise<GisAuthResult> {
  const token = await requestGisAccessToken(promptConsent);
  const channel = await fetchMyYouTubeChannel(token);

  return {
    accessToken: token,
    expiresIn: 3600,
    channel,
  };
}
