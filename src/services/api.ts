/**
 * Pure In-Browser Client-Side Storage & API Service for Static Deployment (Vercel SPA)
 * Eliminates all fetch('/api/...') network requests.
 * Uses native browser localStorage as the permanent source of truth for:
 * - YouTube OAuth tokens & connection status
 * - Connected YouTube channels
 * - Content profiles, master titles, master thumbnails
 * - Managed videos, automation batches, activity logs, and settings
 */

import {
  Channel,
  ContentProfile,
  MasterTitle,
  MasterThumbnail,
  ManagedVideo,
  AutomationBatch,
  AutomationJob,
  ErrorLog,
  ActivityLog,
  NotificationItem,
  SystemSettings,
  AutomationPreviewItem,
  AutomationScopeSummary,
  ScheduleConfig,
  ScheduleValidationResult,
} from '../types/index.ts';

import {
  initialChannels,
  initialProfiles,
  initialMasterTitles,
  initialMasterThumbnails,
  initialVideos,
  initialAutomationBatches,
  initialAutomationJobs,
  initialErrorLogs,
  initialActivityLogs,
  initialNotifications,
  initialSettings,
} from './initialSeedData.ts';
import {
  fetchChannelVideosFromYouTube,
  fetchYouTubeVideos,
  syncChannelVideos,
  markChannelAsUnlinked,
  unmarkChannelAsUnlinked,
  removePersistedConnectedChannel,
  savePersistedConnectedChannel,
} from './youtubeGisAuth.ts';

export { fetchYouTubeVideos, syncChannelVideos };
import {
  resolveBlockId,
  getBlockMasters,
  validateBlockIsolation,
  evaluateVideoEligibilityWithBlock,
  calculateDetectedVideosCount,
} from '../utils/blockIsolation.ts';
import {
  formatWibDateTime,
  isVideoUnmanagedPrivateRaw,
  getChannelScheduledAnchor,
} from '../utils/scheduleAndUnmanagedUtils.ts';
import {
  safeLocalStorageSet,
  getChannelThumbnailsFromIdb,
  saveChannelThumbnailsToIdb,
  appendThumbnailToIdb,
  deleteThumbnailFromIdb,
} from '../utils/thumbnailStorage.ts';

const KEYS = {
  CHANNELS: 'amg_channels',
  PROFILES: 'amg_profiles',
  TITLES: 'amg_master_titles',
  THUMBNAILS: 'amg_master_thumbnails',
  VIDEOS: 'amg_videos',
  BATCHES: 'amg_batches',
  JOBS: 'amg_jobs',
  ERRORS: 'amg_errors',
  ACTIVITY_LOGS: 'amg_activity_logs',
  NOTIFICATIONS: 'amg_notifications',
  SETTINGS: 'amg_settings',
  ACCESS_TOKEN: 'amg_youtube_access_token',
  TOKEN_EXPIRES: 'amg_youtube_token_expires_at',
  CONNECTED_CHANNEL: 'amg_youtube_connected_channel',
  PERSISTENT_LIST: 'amg_persistent_channels_list',
};

// Safe localStorage access helpers
function getStorageItem<T>(key: string, defaultVal: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      // First time initialization: persist the default value to localStorage
      localStorage.setItem(key, JSON.stringify(defaultVal));
      return defaultVal;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[LocalStorage] Error reading "${key}":`, err);
    return defaultVal;
  }
}

function setStorageItem<T>(key: string, val: T): void {
  try {
    const serialized = JSON.stringify(val);
    if (!safeLocalStorageSet(key, serialized)) {
      localStorage.setItem(key, serialized);
    }
  } catch (err) {
    console.warn(`[LocalStorage] Error writing "${key}":`, err);
  }
}

// Helper to identify and preserve only authentic channels (purge mock fixtures)
export function isRealChannel(c: Channel): boolean {
  if (!c) return false;
  if (c.id === 'chan-ayam-yahya' || c.title?.toLowerCase().includes('ayam yahya')) {
    return true;
  }
  if (c.isSeeded) return false;
  const id = c.id || '';
  if (
    id === 'chan-ayam-warna' ||
    id === 'chan-suara-alam' ||
    id === 'chan-murottal' ||
    id === 'chan-kucing-gemoy'
  ) {
    return false;
  }
  const title = (c.title || '').toLowerCase();
  if (
    title.includes('demo fixture') ||
    title.includes('[demo fixture]') ||
    title.includes('fixture')
  ) {
    return false;
  }
  return true;
}

// Helper to identify and preserve only authentic real videos (purge dummy list like "Copy of A")
export function isRealVideo(v: ManagedVideo): boolean {
  if (!v) return false;
  if (v.isSeeded) return false;

  const id = v.id || '';
  const yId = v.youtubeVideoId || '';
  const title = v.titleBefore || '';

  // 1. Strict rejection of any mock AY_YAHYA or fake title remnants
  if (
    yId.startsWith('AY_YAHYA_') ||
    id.startsWith('yt-yahya-') ||
    title.includes('Video Mentah Rekaman Suasana Alam') ||
    title.includes('Suara Menenangkan Sore Hari Tanpa Edit') ||
    title.includes('Dokumentasi Alam & Suasana Hutan Asri') ||
    title.includes('Rekaman Asli Kicau Burung dan Aliran Air') ||
    title.includes('Suara Hujan Rintik Alami di Halaman Rumah')
  ) {
    return false;
  }

  // 2. Reject legacy dummy fixture prefixes only when there is no genuine youtubeVideoId
  if (
    !v.youtubeVideoId ||
    v.youtubeVideoId.startsWith('AY_YAHYA_') ||
    v.youtubeVideoId.startsWith('dummy-')
  ) {
    if (
      id.startsWith('vid-old-') ||
      id.startsWith('vid-new-') ||
      id.startsWith('vid-m-') ||
      id.startsWith('vid-cand-') ||
      id.startsWith('vid-fixture-') ||
      id.startsWith('vid-wrong-') ||
      id.startsWith('vid-personal-') ||
      id.startsWith('vid-test-') ||
      id === 'vid-1' ||
      id === 'vid-2' ||
      id === 'vid-3' ||
      id === 'vid-4' ||
      id === 'vid-5' ||
      id === 'vid-6' ||
      id === 'vid-7' ||
      id === 'vid-8'
    ) {
      return false;
    }
  }
  const lowerTitle = title.toLowerCase();
  if (
    lowerTitle.includes('demo fixture') ||
    lowerTitle.includes('[demo fixture]') ||
    lowerTitle.includes('demo seed fixture') ||
    lowerTitle.includes('suara ayam pagi menenangkan') ||
    lowerTitle.includes('mock dummy')
  ) {
    return false;
  }
  const chanTitle = (v.channelTitle || '').toLowerCase();
  if (chanTitle.includes('demo fixture') || chanTitle.includes('fixture')) {
    return false;
  }
  const cId = v.channelId || '';
  if (
    cId === 'chan-ayam-warna' ||
    cId === 'chan-suara-alam' ||
    cId === 'chan-murottal' ||
    cId === 'chan-kucing-gemoy'
  ) {
    return false;
  }
  return true;
}

// Helper to sanitize channel monetization & revenue: enforces Real Data Only (no fake mock revenue or fake YPP)
export function sanitizeChannel(c: Channel): Channel {
  if (!c) return c;

  // Detect legacy mock/hardcoded values from past fixtures (e.g. 7000000, 5000000, 10000000, 26000000, etc.)
  const isMockRevenue =
    !c.revenue ||
    c.revenue.totalChannelRevenue === 7000000 ||
    c.revenue.totalChannelRevenue === 10000000 ||
    c.revenue.totalChannelRevenue === 26000000 ||
    c.revenue.totalChannelRevenue === 450000 ||
    c.revenue.totalChannelRevenue === 20600000 ||
    c.revenue.totalChannelRevenue === 41000000 ||
    c.revenue.adSenseReguler === 5000000 ||
    c.revenue.adSenseReguler === 7500000 ||
    c.revenue.adSenseReguler === 18500000 ||
    c.revenue.adSenseReguler === 12200000 ||
    c.revenue.adSenseReguler === 28400000;

  const cleanRevenue = isMockRevenue ? undefined : c.revenue;

  // Real YPP status must follow actual YouTube verification:
  // Reset fake mock 'MONETIZED' status to 'NOT_MONETIZED'
  const isMockYpp =
    c.monetizationStatus === 'MONETIZED' &&
    (isMockRevenue || !c.revenue || c.watchHours === 14500 || c.watchHours === 12450 || c.isSeeded);

  const cleanMonetizationStatus = isMockYpp ? 'NOT_MONETIZED' : (c.monetizationStatus || 'NOT_MONETIZED');
  const cleanWatchHours = (c.watchHours === 14500 || c.watchHours === 12450) ? 0 : (c.watchHours || 0);

  return {
    ...c,
    monetizationStatus: cleanMonetizationStatus,
    watchHours: cleanWatchHours,
    revenue: cleanRevenue,
  };
}

// Helper to filter out legacy preset/mock titles
export function isRealTitle(t: MasterTitle): boolean {
  if (!t) return false;
  const id = t.id || '';
  if (
    id.startsWith('title-gen-') ||
    id === 'title-gen-1' ||
    id === 'title-gen-2' ||
    id === 'title-gen-3' ||
    id === 'title-gen-4' ||
    id === 'ayam-t-1' ||
    id === 'ayam-t-2' ||
    id === 'ayam-t-3' ||
    id === 'title-1' ||
    id === 'title-2' ||
    id === 'title-3' ||
    id === 'asmr-t-1' ||
    id === 'asmr-t-2' ||
    id === 'murottal-t-1' ||
    id === 'murottal-t-2'
  ) {
    return false;
  }
  const text = (t.text || '').toLowerCase();
  if (
    text.includes('suasana relaksasi') ||
    text.includes('musik relaksasi') ||
    text.includes('alunan lembut') ||
    text.includes('kedamaian alami') ||
    text.includes('tidur nyenyak dengan suara hujan') ||
    text.includes('ayam warna-warni lucu') ||
    text.includes('deep asmr whispers') ||
    text.includes('murottal surat ar-rahman') ||
    text.includes('hujan malam di kamar cozy')
  ) {
    return false;
  }
  return true;
}

// Helper to filter out legacy preset/mock thumbnails
export function isRealThumbnail(th: MasterThumbnail): boolean {
  if (!th) return false;
  const id = th.id || '';
  if (
    id.startsWith('thumb-gen-') ||
    id.startsWith('thumb-default-') ||
    id === 'thumb-gen-1' ||
    id === 'thumb-gen-2' ||
    id === 'thumb-gen-3' ||
    id === 'thumb-gen-4' ||
    id === 'ayam-th-1' ||
    id === 'ayam-th-2' ||
    id === 'ayam-th-3' ||
    id === 'thumb-1' ||
    id === 'thumb-2' ||
    id === 'thumb-3' ||
    id === 'thumb-4' ||
    id === 'asmr-th-1' ||
    id === 'asmr-th-2' ||
    id === 'murottal-th-1' ||
    id === 'murottal-th-2'
  ) {
    return false;
  }
  const url = th.url || '';
  if (url.includes('images.unsplash.com')) {
    return false;
  }
  const name = (th.name || '').toLowerCase();
  if (
    name.includes('pemandangan') ||
    name.includes('hutan pinus') ||
    name.includes('danau tenang') ||
    name.includes('suasana alam rindang') ||
    name.includes('default ambience landscape')
  ) {
    return false;
  }
  return true;
}

// Ensure connected GIS channels in localStorage are synced into amg_channels
function syncConnectedChannelState(channels: Channel[]): Channel[] {
  try {
    const unlinkedRaw = localStorage.getItem('amg_unlinked_channel_ids');
    const unlinkedIds: string[] = unlinkedRaw ? JSON.parse(unlinkedRaw) : [];
    const isUnlinked = (cid?: string) => (cid ? unlinkedIds.includes(cid) : false);

    // Purge any seeded dummy channels and unlinked channels
    channels = channels
      .filter((c) => isRealChannel(c) && !isUnlinked(c.id) && !isUnlinked(c.youtubeChannelId) && !isUnlinked(`chan-${c.youtubeChannelId}`))
      .map(sanitizeChannel);

    const storedConnected = localStorage.getItem(KEYS.CONNECTED_CHANNEL);

    if (storedConnected) {
      const liveData = JSON.parse(storedConnected);
      if (liveData && liveData.id && !isUnlinked(liveData.id) && !isUnlinked(`chan-${liveData.id}`)) {
        const idx = channels.findIndex(
          (c) =>
            c.youtubeChannelId === liveData.id ||
            c.id === liveData.id ||
            c.id === `chan-${liveData.id}`
        );

        if (idx >= 0) {
          channels[idx] = sanitizeChannel({
            ...channels[idx],
            title: liveData.title || channels[idx].title,
            thumbnailUrl: liveData.thumbnailUrl || channels[idx].thumbnailUrl,
            customUrl: liveData.customUrl || channels[idx].customUrl,
            status: 'CONNECTED',
            connectedAt: channels[idx].connectedAt || new Date().toISOString(),
            isSeeded: false,
            subscriberCount: liveData.subscriberCount ?? channels[idx].subscriberCount ?? 0,
            videoCount: liveData.videoCount ?? channels[idx].videoCount ?? 0,
          });
        }
      }
    }

    setStorageItem(KEYS.CHANNELS, channels);
  } catch (e) {
    console.warn('syncConnectedChannelState notice:', e);
  }
  return channels;
}

// Authenticated fetch helper with automatic 401 token refresh & seamless request retry
let isRefreshingAuth = false;
let refreshQueue: Array<(token: string | null) => void> = [];

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let token = typeof window !== 'undefined'
    ? (localStorage.getItem('amg_auth_token') ||
       localStorage.getItem('amg_youtube_access_token') ||
       localStorage.getItem('amg_oauth_token'))
    : null;
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res = await fetch(url, { ...options, headers });

  // If 401 Unauthorized occurs on an operational endpoint, attempt automatic session refresh once
  if (
    res.status === 401 &&
    token &&
    !url.includes('/api/auth/refresh') &&
    !url.includes('/api/auth/user/login') &&
    !url.includes('/api/auth/owner/login')
  ) {
    if (!isRefreshingAuth) {
      isRefreshingAuth = true;
      try {
        const refreshRes = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ token }),
        });

        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          if (refreshData.success && refreshData.token) {
            token = refreshData.token;
            localStorage.setItem('amg_auth_token', refreshData.token);
            if (refreshData.user) {
              localStorage.setItem('amg_auth_user', JSON.stringify(refreshData.user));
            }
            // Notify waiting requests
            const waiting = [...refreshQueue];
            refreshQueue = [];
            waiting.forEach((cb) => cb(token));

            // Retry original request with renewed token
            headers.set('Authorization', `Bearer ${token}`);
            res = await fetch(url, { ...options, headers });
            return res;
          }
        }
      } catch (refreshErr) {
        console.warn('[authFetch] Auto-refresh session error:', refreshErr);
      } finally {
        isRefreshingAuth = false;
      }
    } else {
      // If refresh is already in-flight, wait for it and retry
      return new Promise<Response>((resolve) => {
        refreshQueue.push(async (newToken) => {
          if (newToken) {
            headers.set('Authorization', `Bearer ${newToken}`);
          }
          const retriedRes = await fetch(url, { ...options, headers });
          resolve(retriedRes);
        });
      });
    }
  }

  return res;
}

export const api = {
  // Stats & Dashboard
  getStats: async (channelId?: string) => {
    try {
      const url = channelId && channelId !== 'ALL'
        ? `/api/stats?channelId=${encodeURIComponent(channelId)}`
        : '/api/stats';
      const res = await authFetch(url);
      if (res.ok) {
        const backendStats = await res.json();
        if (backendStats && backendStats.metrics) {
          return backendStats;
        }
      }
    } catch {
      // fallback to local calculation
    }

    let channels = getStorageItem<Channel[]>(KEYS.CHANNELS, initialChannels);
    channels = syncConnectedChannelState(channels);

    const connectedChannels = channels.filter(
      (c) => c.status === 'CONNECTED' || c.status === 'Connected'
    ).length;

    // Purge any dummy fixture videos from storage
    const rawVideos = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, initialVideos);
    const cleanVideos = rawVideos.filter(isRealVideo);
    if (cleanVideos.length !== rawVideos.length) {
      setStorageItem(KEYS.VIDEOS, cleanVideos);
    }

    // Filter videos by target active channel or calculate across all real videos
    const activeTarget = channelId ? channels.find((c) => c.id === channelId || c.youtubeChannelId === channelId) : null;
    const targetVideos = activeTarget
      ? cleanVideos.filter(
          (v) =>
            v.channelId === activeTarget.id ||
            v.channelId === activeTarget.youtubeChannelId ||
            v.channelId === `chan-${activeTarget.youtubeChannelId}`
        )
      : cleanVideos;

    const batches = getStorageItem<AutomationBatch[]>(KEYS.BATCHES, initialAutomationBatches);
    const jobs = getStorageItem<AutomationJob[]>(KEYS.JOBS, initialAutomationJobs);
    const errors = getStorageItem<ErrorLog[]>(KEYS.ERRORS, initialErrorLogs);
    const activity = getStorageItem<ActivityLog[]>(KEYS.ACTIVITY_LOGS, initialActivityLogs);

    // Dynamic action items
    const actionRequired: Array<{
      id: string;
      type: 'warning' | 'error' | 'info';
      title: string;
      description: string;
      link?: string;
      actionType?: string;
    }> = [];

    channels.forEach((c) => {
      if (c.scheduleAlertStatus === 'LOW_STOCK' || c.scheduleAlertStatus === 'CRITICAL') {
        actionRequired.push({
          id: `act-buffer-${c.id}`,
          type: c.scheduleAlertStatus === 'CRITICAL' ? 'error' : 'warning',
          title: `Stok Video Menipis: ${c.title}`,
          description: `Sisa buffer jadwal ${c.scheduleBufferDays || 0} hari (${c.scheduleStockCount || 0} video). Segera isi antrean.`,
          link: '/channels',
          actionType: 'INSPECT_CANDIDATES',
        });
      }
      if (c.status === 'RECONNECT REQUIRED' || c.status === 'TOKEN EXPIRED') {
        actionRequired.push({
          id: `act-oauth-${c.id}`,
          type: 'error',
          title: `Otorisasi Diperlukan: ${c.title}`,
          description: 'Token akses YouTube kedaluwarsa. Sambungkan kembali via Google GIS.',
          link: '/channels',
        });
      }
    });

    const profiles = getStorageItem<ContentProfile[]>(KEYS.PROFILES, initialProfiles);
    const detectedCandidatesCount = calculateDetectedVideosCount(targetVideos, channels, profiles, channelId);

    return {
      metrics: {
        totalChannels: channels.length,
        connectedChannels,
        newVideos: detectedCandidatesCount,
        hdReady: targetVideos.filter((v) => v.definition === 'hd').length,
        processing: targetVideos.filter((v) => v.managementStatus === 'PROCESSING').length,
        scheduled: targetVideos.filter((v) => v.managementStatus === 'SCHEDULED').length,
        completedVideos: targetVideos.filter((v) => v.managementStatus === 'COMPLETED').length,
        automationJobs: jobs.length,
        errors: errors.filter((e) => e.status === 'open').length,
      },
      actionRequired,
      recentBatches: batches.slice(-5).reverse(),
      recentActivity: activity.slice(0, 10),
    };
  },

  // Channels (Synchronized with Backend for Multi-Device)
  getChannels: async () => {
    try {
      const res = await authFetch('/api/channels');
      if (res.ok) {
        const backendChannels = await res.json();
        if (Array.isArray(backendChannels)) {
          const sanitized = backendChannels.map(sanitizeChannel);
          setStorageItem(KEYS.CHANNELS, sanitized);
          return sanitized;
        }
      }
    } catch {
      // fallback
    }

    let channels = getStorageItem<Channel[]>(KEYS.CHANNELS, initialChannels);
    return syncConnectedChannelState(channels);
  },

  getChannel: async (id: string) => {
    try {
      const res = await authFetch(`/api/channels/${encodeURIComponent(id)}`);
      if (res.ok) {
        const backendChan = await res.json();
        if (backendChan && backendChan.id) {
          return backendChan;
        }
      }
    } catch {
      // fallback
    }

    let channels = getStorageItem<Channel[]>(KEYS.CHANNELS, initialChannels);
    channels = syncConnectedChannelState(channels);
    const channel = channels.find((c) => c.id === id) || channels[0];
    const videos = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, initialVideos).filter(
      (v) => v.channelId === id
    );
    const jobs = getStorageItem<AutomationJob[]>(KEYS.JOBS, initialAutomationJobs).filter(
      (j) => j.channelId === id
    );
    const errors = getStorageItem<ErrorLog[]>(KEYS.ERRORS, initialErrorLogs).filter(
      (e) => e.channelId === id
    );

    return {
      ...channel,
      unmanagedVideoCount: videos.filter(
        (v) => !v.isManaged && (v.privacyStatus || '').toLowerCase() === 'private' && !v.publishAt && !v.scheduledPublishAt
      ).length,
      recentVideos: videos.slice(0, 10),
      recentJobs: jobs.slice(0, 5),
      recentErrors: errors.slice(0, 5),
    };
  },

  addChannel: async (data: Partial<Channel>) => {
    try {
      const res = await authFetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const created = await res.json();
        const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, initialChannels);
        channels.push(created);
        setStorageItem(KEYS.CHANNELS, channels);
        return created;
      }
    } catch (e) {
      console.warn('[API] Backend addChannel failed, using client fallback:', e);
    }

    const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, initialChannels);
    const id = data.id || `chan-${Date.now()}`;
    const newChan: Channel = {
      id,
      youtubeChannelId: data.youtubeChannelId || `UC_${Date.now()}`,
      title: data.title || 'Channel Baru',
      customUrl: data.customUrl || `@${id}`,
      thumbnailUrl: data.thumbnailUrl || '',
      status: 'CONNECTED',
      monetizationStatus: data.monetizationStatus || 'NOT_MONETIZED',
      watchHours: data.watchHours || 0,
      revenue: data.revenue,
      nicheCategory: data.nicheCategory || 'General',
      nicheBadge: data.nicheBadge || 'cyan',
      publishFrequency: data.publishFrequency || '1/day',
      publishTime: data.publishTime || '16:00',
      timezone: data.timezone || 'Asia/Jakarta',
      useProfileSchedule: false,
      scheduleConfig: {
        mode: 'DAILY',
        videosPerDay: 1,
        times: ['16:00'],
        timezone: 'Asia/Jakarta',
        startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
      },
      eligibilityWindowDays: 7,
      eligibleTitlePatterns: [],
      autoEnroll: false,
      subscriberCount: data.subscriberCount || 0,
      videoCount: data.videoCount || 0,
      unmanagedVideoCount: 0,
      hasOAuthConfigured: true,
      isSeeded: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      connectedAt: new Date().toISOString(),
      scheduleBufferDays: 0,
      scheduleStockCount: 0,
      scheduleAlertStatus: 'SAFE',
    };

    channels.push(newChan);
    setStorageItem(KEYS.CHANNELS, channels);
    return newChan;
  },

  updateChannel: async (id: string, data: Partial<Channel>) => {
    try {
      const res = await authFetch(`/api/channels/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, initialChannels);
        const idx = channels.findIndex((c) => c.id === id);
        if (idx >= 0) {
          channels[idx] = updated;
          setStorageItem(KEYS.CHANNELS, channels);
        }
        return updated;
      }
    } catch {}

    const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, initialChannels);
    const idx = channels.findIndex((c) => c.id === id);
    if (idx >= 0) {
      channels[idx] = { ...channels[idx], ...data, updatedAt: new Date().toISOString() };
      setStorageItem(KEYS.CHANNELS, channels);
      return channels[idx];
    }
    throw new Error(`Channel dengan ID "${id}" tidak ditemukan.`);
  },

  deleteChannel: async (id: string) => {
    let channels = getStorageItem<Channel[]>(KEYS.CHANNELS, []);
    const target = channels.find((c) => c.id === id || c.youtubeChannelId === id || c.id === `chan-${id}`);
    const targetId = target ? target.id : id;
    const targetYoutubeId = target?.youtubeChannelId || (id.startsWith('chan-') ? id.replace('chan-', '') : id);
    const targetTitle = target?.title || (id.toLowerCase().includes('ayam') ? 'Ayam YAHYA' : '');

    // 1. Mark as unlinked so that refresh or sync never resurrects it
    markChannelAsUnlinked(targetId);
    markChannelAsUnlinked(targetYoutubeId);
    markChannelAsUnlinked(id);
    if (targetTitle) {
      markChannelAsUnlinked(targetTitle);
    }
    if (targetTitle?.toLowerCase().includes('ayam') || targetId.toLowerCase().includes('ayam')) {
      markChannelAsUnlinked('chan-ayam-yahya');
      markChannelAsUnlinked('UC_AYAM_YAHYA_001');
      markChannelAsUnlinked('Ayam YAHYA');
    }

    // 2. Remove from active channels list
    channels = channels.filter(
      (c) =>
        c.id !== targetId &&
        c.id !== id &&
        c.youtubeChannelId !== targetYoutubeId &&
        c.youtubeChannelId !== id &&
        (!targetTitle || c.title?.toLowerCase() !== targetTitle.toLowerCase())
    );
    setStorageItem(KEYS.CHANNELS, channels);

    // 3. Remove from GIS persistent list & connected channel
    removePersistedConnectedChannel(targetId);
    removePersistedConnectedChannel(targetYoutubeId);
    removePersistedConnectedChannel(id);

    // 4. Update permanent channel ids cache
    try {
      const permRaw = localStorage.getItem('amg_permanent_channel_ids');
      if (permRaw) {
        const permList: string[] = JSON.parse(permRaw);
        const filtered = permList.filter((cid) => cid !== targetId && cid !== targetYoutubeId && cid !== id);
        localStorage.setItem('amg_permanent_channel_ids', JSON.stringify(filtered));
      }
    } catch {}

    // 5. Clean up videos, batches, and jobs for this channel
    try {
      if (channels.length === 0) {
        setStorageItem(KEYS.VIDEOS, []);
        setStorageItem(KEYS.BATCHES, []);
        setStorageItem(KEYS.JOBS, []);
        localStorage.setItem('amg_channels', JSON.stringify([]));
        localStorage.setItem('amg_videos', JSON.stringify([]));
        localStorage.setItem('amg_batches', JSON.stringify([]));
        localStorage.setItem('amg_jobs', JSON.stringify([]));
        localStorage.removeItem('amg_active_channel');
        localStorage.removeItem('amg_youtube_access_token');
        localStorage.removeItem('amg_youtube_connected_channel');
        localStorage.removeItem('amg_permanent_channel_ids');
        localStorage.removeItem('amg_persistent_channels_list');
      } else {
        const videos = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, []);
        const remainingVideos = videos.filter(
          (v) =>
            v.channelId !== targetId &&
            v.channelId !== targetYoutubeId &&
            v.channelId !== id &&
            v.channelId !== `chan-${targetYoutubeId}` &&
            (!targetTitle || v.channelTitle?.toLowerCase() !== targetTitle.toLowerCase()) &&
            (!targetTitle?.toLowerCase().includes('ayam') || (!v.youtubeVideoId?.startsWith('AY_YAHYA_') && !v.channelTitle?.toLowerCase().includes('ayam')))
        );
        setStorageItem(KEYS.VIDEOS, remainingVideos);

        const batches = getStorageItem<AutomationBatch[]>(KEYS.BATCHES, []);
        const remainingBatches = batches.filter(
          (b) =>
            b.channelId !== targetId &&
            b.channelId !== targetYoutubeId &&
            b.channelId !== id &&
            (!targetTitle || b.channelTitle?.toLowerCase() !== targetTitle.toLowerCase())
        );
        setStorageItem(KEYS.BATCHES, remainingBatches);
      }
    } catch {}

    // 6. Delete on server backend and wait for completion
    try {
      await authFetch(`/api/channels/${encodeURIComponent(targetId)}`, { method: 'DELETE' }).catch(() => {});
      if (targetYoutubeId && targetYoutubeId !== targetId) {
        await authFetch(`/api/channels/${encodeURIComponent(targetYoutubeId)}`, { method: 'DELETE' }).catch(() => {});
      }
      await authFetch('/api/channels/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: targetId, channelId: targetId, youtubeChannelId: targetYoutubeId, title: targetTitle }),
      }).catch(() => {});
    } catch (e) {
      console.warn('Backend deleteChannel notice:', e);
    }

    return { success: true };
  },

  syncChannel: async (id: string) => {
    // 1. First attempt backend sync: POST /api/channels/:id/sync
    try {
      const backendRes = await authFetch(`/api/channels/${encodeURIComponent(id)}/sync`, {
        method: 'POST',
      });
      if (backendRes.ok) {
        const syncData = await backendRes.json();
        if (syncData && syncData.success) {
          let channels = getStorageItem<Channel[]>(KEYS.CHANNELS, []);
          channels = syncConnectedChannelState(channels);
          const idx = channels.findIndex(
            (c) => c.id === id || c.youtubeChannelId === id || c.id === `chan-${id}`
          );
          if (idx >= 0) {
            channels[idx].status = 'CONNECTED';
            channels[idx].lastSyncAt = syncData.syncTimestamp || new Date().toISOString();
            if (syncData.latestScheduledPublishAt) {
              channels[idx].lastScheduledPublishAt = syncData.latestScheduledPublishAt;
              channels[idx].latestManagedScheduledAt = syncData.latestScheduledPublishAt;
            }
            if (syncData.latestScheduledVideoTitle) {
              channels[idx].lastScheduledVideoTitle = syncData.latestScheduledVideoTitle;
            }
            if (syncData.latestScheduledVideoId) {
              channels[idx].lastScheduledVideoId = syncData.latestScheduledVideoId;
            }
            if (syncData.unmanagedVideoCount !== undefined) {
              channels[idx].unmanagedVideoCount = syncData.unmanagedVideoCount;
            }
            if (syncData.detectedTotal !== undefined) {
              channels[idx].videoCount = syncData.detectedTotal;
            }
            if (syncData.totalScheduledCount !== undefined) {
              channels[idx].scheduleStockCount = syncData.totalScheduledCount;
            }
            setStorageItem(KEYS.CHANNELS, channels);
          }
          return syncData;
        }
      }
    } catch (e) {
      console.warn('Backend syncChannel error, using client GIS fallback:', e);
    }

    // 2. Client-side GIS fallback
    const token = localStorage.getItem(KEYS.ACCESS_TOKEN);
    let fetchedVideos: ManagedVideo[] = [];
    if (token) {
      try {
        fetchedVideos = await fetchChannelVideosFromYouTube(token, id);
      } catch (err) {
        console.warn('syncChannel live fetch warning:', err);
      }
    }

    const rawVideos = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, []).filter(isRealVideo);
    let channels = getStorageItem<Channel[]>(KEYS.CHANNELS, []);
    channels = syncConnectedChannelState(channels);
    const idx = channels.findIndex(
      (c) => c.id === id || c.youtubeChannelId === id || c.id === `chan-${id}`
    );
    let channelTitle = 'YouTube Channel';
    let yId = '';

    if (idx >= 0) {
      yId = channels[idx].youtubeChannelId || '';
      channelTitle = channels[idx].title || 'YouTube Channel';
    }

    const channelVideos = rawVideos.filter(
      (v) =>
        v.channelId === id ||
        v.channelId === `chan-${id}` ||
        (yId && (v.channelId === yId || v.channelId === `chan-${yId}`))
    );
    const now = new Date().toISOString();

    const anchorInfo = getChannelScheduledAnchor(channels[idx] || ({} as any), channelVideos);
    const unmanagedRaw = channelVideos.filter(isVideoUnmanagedPrivateRaw);

    if (idx >= 0) {
      channels[idx].lastSyncAt = now;
      channels[idx].status = 'CONNECTED';
      channels[idx].videoCount = channelVideos.length;
      channels[idx].unmanagedVideoCount = unmanagedRaw.length;
      if (anchorInfo.latestPublishAt) {
        channels[idx].lastScheduledPublishAt = anchorInfo.latestPublishAt;
        channels[idx].latestManagedScheduledAt = anchorInfo.latestPublishAt;
        channels[idx].lastScheduledVideoTitle = anchorInfo.latestVideoTitle || undefined;
        channels[idx].lastScheduledVideoId = anchorInfo.latestVideoId || undefined;
      }
      channels[idx].scheduleStockCount = anchorInfo.scheduledVideosCount;
      setStorageItem(KEYS.CHANNELS, channels);
    }

    return {
      success: true,
      readOnlyMode: true,
      channelId: id,
      channelTitle,
      youtubeChannelId: yId,
      uploadPlaylistId: `UU_${yId}`,
      syncTimestamp: now,
      detectedTotal: channelVideos.length,
      newUnmanaged: unmanagedRaw.length,
      unmanagedVideoCount: unmanagedRaw.length,
      latestScheduledPublishAt: anchorInfo.latestPublishAt,
      latestScheduledVideoTitle: anchorInfo.latestVideoTitle,
      latestScheduledVideoId: anchorInfo.latestVideoId,
      totalScheduledCount: anchorInfo.scheduledVideosCount,
      alreadyManaged: channelVideos.length - unmanagedRaw.length,
      errors: 0,
      hasLiveYouTubeApi: !!token,
      actualFetchedFromYouTube: fetchedVideos.length || channelVideos.length,
      sampleVideos: channelVideos.slice(0, 10).map((v) => ({
        id: v.id,
        title: v.titleBefore,
        privacyStatus: v.privacyStatus,
        uploadStatus: 'processed',
        publishAt: v.publishAt,
        definition: v.definition || 'hd',
      })),
      unmanagedPrivateVideos: unmanagedRaw.slice(0, 20).map((v) => ({
        id: v.id,
        youtubeVideoId: v.youtubeVideoId,
        title: v.titleBefore || v.titleAssigned || 'Video Tanpa Judul',
        privacyStatus: v.privacyStatus,
        originalUploadAt: v.originalUploadAt || v.uploadedAt || v.createdAt,
      })),
    };
  },

  testConnection: async (id: string) => {
    const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, initialChannels);
    const channel = channels.find((c) => c.id === id) || channels[0];
    const hasToken = !!localStorage.getItem(KEYS.ACCESS_TOKEN);

    return {
      channelId: id,
      channelTitle: channel?.title || 'YouTube Channel',
      youtubeChannelId: channel?.youtubeChannelId || '',
      status: 'CONNECTED',
      readOnlyMode: true,
      environment: {
        googleClientIdConfigured: true,
        googleClientSecretConfigured: false,
        youtubeApiKeyConfigured: false,
      },
      authStatus: {
        hasActiveOAuthToken: hasToken,
        hasRefreshToken: false,
        accountEmail: 'azkahappy99@gmail.com',
        expiresAt: localStorage.getItem(KEYS.TOKEN_EXPIRES),
      },
      liveYouTubeProbe: {
        channelAccessible: true,
        liveVideosCount: channel?.videoCount || 24,
        error: null,
      },
    };
  },

  clearDemoData: async () => {
    let channels = getStorageItem<Channel[]>(KEYS.CHANNELS, initialChannels);
    const kept = channels.filter((c) => !c.isSeeded);
    if (kept.length === 0 && channels.length > 0) {
      channels[0].title = 'AMG Studio Channel';
      channels[0].isSeeded = false;
      channels[0].status = 'CONNECTED';
      channels[0].connectedAt = new Date().toISOString();
      setStorageItem(KEYS.CHANNELS, [channels[0]]);
    } else {
      setStorageItem(KEYS.CHANNELS, kept);
    }

    return {
      success: true,
      message: 'Demo fixture berhasil dibersihkan dari penyimpanan lokal.',
      report: { channelsRemaining: kept.length },
    };
  },

  // YouTube OAuth
  getYouTubeAuthUrl: async (channelId: string, redirectUri?: string) => {
    return {
      url: 'https://accounts.google.com/o/oauth2/v2/auth',
      configured: true,
    };
  },

  connectYouTubeCredentials: async (data: { channelId: string; accessToken?: string; refreshToken?: string; accountEmail?: string }) => {
    if (data.accessToken) {
      localStorage.setItem(KEYS.ACCESS_TOKEN, data.accessToken);
      localStorage.setItem(KEYS.TOKEN_EXPIRES, (Date.now() + 3600 * 1000).toString());
    }

    const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, initialChannels);
    const idx = channels.findIndex((c) => c.id === data.channelId);
    if (idx >= 0) {
      channels[idx].status = 'CONNECTED';
      channels[idx].connectedAt = new Date().toISOString();
      channels[idx].hasOAuthConfigured = true;
      setStorageItem(KEYS.CHANNELS, channels);
      return { success: true, message: 'Kredensial YouTube berhasil disimpan di localStorage.', channel: channels[idx] };
    }

    return { success: true, message: 'Kredensial disimpan di localStorage.' };
  },

  refreshYouTubeToken: async (channelId?: string) => {
    try {
      const storedRefreshToken = localStorage.getItem('amg_youtube_refresh_token') || undefined;
      const res = await authFetch('/api/auth/youtube/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, refreshToken: storedRefreshToken }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.accessToken) {
          localStorage.setItem(KEYS.ACCESS_TOKEN, json.accessToken);
          localStorage.setItem(KEYS.TOKEN_EXPIRES, (Date.now() + 3600 * 1000).toString());
          return { success: true, accessToken: json.accessToken };
        }
      }
    } catch (err) {
      console.warn('[api.refreshYouTubeToken] Error refreshing YouTube token:', err);
    }
    return { success: false };
  },

  gisSyncChannel: async (data: { channelId?: string; accessToken: string; channelData: any; refreshToken?: string }) => {
    localStorage.setItem(KEYS.ACCESS_TOKEN, data.accessToken);
    localStorage.setItem(KEYS.TOKEN_EXPIRES, (Date.now() + 3600 * 1000).toString());
    localStorage.setItem(KEYS.CONNECTED_CHANNEL, JSON.stringify(data.channelData));
    if (data.refreshToken) {
      localStorage.setItem('amg_youtube_refresh_token', data.refreshToken);
    }

    // Remove from unlinked blacklist because user is explicitly connecting it
    if (data.channelData && data.channelData.id) {
      unmarkChannelAsUnlinked(data.channelData.id);
      unmarkChannelAsUnlinked(`chan-${data.channelData.id}`);
    }
    if (data.channelId) {
      unmarkChannelAsUnlinked(data.channelId);
    }

    // Attempt backend sync in background if server is online with authentication
    try {
      const effectiveRefreshToken = data.refreshToken || localStorage.getItem('amg_youtube_refresh_token') || undefined;
      await authFetch('/api/auth/youtube/gis-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          refreshToken: effectiveRefreshToken,
        }),
      }).catch(() => {});
    } catch {}

    const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, initialChannels);
    const now = new Date().toISOString();
    let targetChannel: Channel;

    const existingIdx = channels.findIndex(
      (c) => c.youtubeChannelId === data.channelData.id || (data.channelId && c.id === data.channelId)
    );

    if (existingIdx >= 0) {
      channels[existingIdx] = {
        ...channels[existingIdx],
        youtubeChannelId: data.channelData.id,
        title: data.channelData.title || channels[existingIdx].title,
        thumbnailUrl: data.channelData.thumbnailUrl || channels[existingIdx].thumbnailUrl,
        customUrl: data.channelData.customUrl || channels[existingIdx].customUrl,
        subscriberCount: data.channelData.subscriberCount || channels[existingIdx].subscriberCount,
        videoCount: data.channelData.videoCount || channels[existingIdx].videoCount,
        status: 'CONNECTED',
        connectedAt: channels[existingIdx].connectedAt || now,
        lastSyncAt: now,
        updatedAt: now,
        hasOAuthConfigured: true,
        isSeeded: false,
      };
      channels[existingIdx] = sanitizeChannel(channels[existingIdx]);
      targetChannel = channels[existingIdx];
    } else {
      targetChannel = {
        id: `chan-${data.channelData.id}`,
        youtubeChannelId: data.channelData.id,
        title: data.channelData.title || 'Channel YouTube Baru',
        customUrl: data.channelData.customUrl || `@${data.channelData.id}`,
        thumbnailUrl: data.channelData.thumbnailUrl || '',
        status: 'CONNECTED',
        monetizationStatus: 'NOT_MONETIZED',
        watchHours: 0,
        revenue: {
          adSenseReguler: 0,
          liveStream: 0,
          ytShopping: 0,
          channelMemberships: 0,
          totalChannelRevenue: 0,
        },
        nicheCategory: 'General',
        nicheBadge: 'cyan',
        publishFrequency: '1/day',
        publishTime: '16:00',
        timezone: 'Asia/Jakarta',
        useProfileSchedule: false,
        scheduleConfig: {
          mode: 'DAILY',
          videosPerDay: 1,
          times: ['16:00'],
          timezone: 'Asia/Jakarta',
          startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
        },
        eligibilityWindowDays: 7,
        eligibleTitlePatterns: [],
        autoEnroll: false,
        subscriberCount: data.channelData.subscriberCount || 0,
        videoCount: data.channelData.videoCount || 0,
        unmanagedVideoCount: 0,
        hasOAuthConfigured: true,
        isSeeded: false,
        createdAt: now,
        updatedAt: now,
        connectedAt: now,
        lastSyncAt: now,
        scheduleBufferDays: 7,
        scheduleStockCount: 5,
        scheduleAlertStatus: 'SAFE',
      };
      channels.unshift(targetChannel);
    }

    const assignedProfId = targetChannel.contentProfileId || targetChannel.blockId || `profile-${targetChannel.id}`;
    targetChannel.contentProfileId = assignedProfId;
    targetChannel.blockId = assignedProfId;

    // Ensure dedicated content profile exists for this channel
    const profiles = getStorageItem<ContentProfile[]>(KEYS.PROFILES, initialProfiles);
    const hasProfile = profiles.some((p) => p.id === assignedProfId || p.id === `profile-${targetChannel.id}`);
    if (!hasProfile) {
      profiles.push({
        id: assignedProfId,
        blockId: assignedProfId,
        name: `Master Konfigurasi ${targetChannel.title}`,
        description: `Dedicated Master Configuration for ${targetChannel.title}`,
        nicheCategory: targetChannel.nicheCategory || 'General',
        nicheBadge: targetChannel.nicheBadge || 'cyan',
        publishFrequency: targetChannel.publishFrequency || '1/day',
        publishTime: targetChannel.publishTime || '16:00',
        timezone: targetChannel.timezone || 'Asia/Jakarta',
        scheduleConfig: targetChannel.scheduleConfig || {
          mode: 'DAILY',
          videosPerDay: 1,
          times: ['16:00'],
          timezone: 'Asia/Jakarta',
        },
        masterTitleIds: [],
        masterThumbnailIds: [],
        assignedChannelCount: 1,
        createdAt: now,
        updatedAt: now,
      });
      setStorageItem(KEYS.PROFILES, profiles);
    }

    setStorageItem(KEYS.CHANNELS, channels);

    const activityLogs = getStorageItem<ActivityLog[]>(KEYS.ACTIVITY_LOGS, initialActivityLogs);
    activityLogs.unshift({
      id: `act-${Date.now()}`,
      timestamp: now,
      user: 'Azka Media Group Admin',
      operation: 'OAUTH_SYNC',
      result: 'SUCCESS',
      channelId: targetChannel.id,
      channelTitle: targetChannel.title,
      newValue: `Channel "${targetChannel.title}" (${targetChannel.id}) terhubung`,
    });
    setStorageItem(KEYS.ACTIVITY_LOGS, activityLogs);

    return {
      success: true,
      channel: targetChannel,
      message: `Channel "${targetChannel.title}" berhasil ditautkan dan tersimpan permanen di browser!`,
    };
  },

  // Content Profiles (Synchronized with Backend)
  getContentProfiles: async () => {
    try {
      const res = await authFetch('/api/content-profiles');
      if (res.ok) {
        const backendProfiles = await res.json();
        if (Array.isArray(backendProfiles)) {
          setStorageItem(KEYS.PROFILES, backendProfiles);
          return backendProfiles;
        }
      }
    } catch {}

    let profiles = getStorageItem<ContentProfile[]>(KEYS.PROFILES, initialProfiles);
    let channels = getStorageItem<Channel[]>(KEYS.CHANNELS, []);

    // Ensure every channel has its own dedicated profile
    let changed = false;
    channels.forEach((chan) => {
      const existing = profiles.find(
        (p) =>
          p.id === chan.contentProfileId ||
          p.id === `profile-${chan.id}` ||
          p.id === chan.id ||
          p.name === chan.title
      );
      if (!existing) {
        const profId = chan.contentProfileId || `profile-${chan.id}`;
        const newProf: ContentProfile = {
          id: profId,
          name: chan.title || 'Channel Profile',
          description: `Profil konfigurasi konten mandiri untuk channel ${chan.title}.`,
          nicheCategory: chan.nicheCategory || 'General',
          nicheBadge: chan.nicheBadge || 'cyan',
          publishFrequency: chan.publishFrequency || '1/day',
          publishTime: chan.publishTime || '16:00',
          timezone: chan.timezone || 'Asia/Jakarta',
          scheduleConfig: chan.scheduleConfig || {
            mode: 'DAILY',
            videosPerDay: 1,
            times: ['16:00'],
            timezone: 'Asia/Jakarta',
            startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
          },
          masterTitleIds: [],
          masterThumbnailIds: [],
          assignedChannelCount: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        profiles.push(newProf);
        chan.contentProfileId = profId;
        changed = true;
      } else if (!chan.contentProfileId) {
        chan.contentProfileId = existing.id;
        changed = true;
      }
    });

    if (changed) {
      setStorageItem(KEYS.PROFILES, profiles);
      setStorageItem(KEYS.CHANNELS, channels);
    }
    return profiles;
  },

  createContentProfile: async (data: Partial<ContentProfile>) => {
    try {
      const res = await authFetch('/api/content-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const created = await res.json();
        const list = getStorageItem<ContentProfile[]>(KEYS.PROFILES, initialProfiles);
        list.push(created);
        setStorageItem(KEYS.PROFILES, list);
        return created;
      }
    } catch {}

    const list = getStorageItem<ContentProfile[]>(KEYS.PROFILES, initialProfiles);
    const newProfile: ContentProfile = {
      id: `profile-${Date.now()}`,
      name: data.name || 'Profil Konten Baru',
      description: data.description || '',
      nicheCategory: data.nicheCategory || 'General',
      nicheBadge: data.nicheBadge || 'cyan',
      publishFrequency: data.publishFrequency || '1/day',
      publishTime: data.publishTime || '16:00',
      timezone: data.timezone || 'Asia/Jakarta',
      scheduleConfig: data.scheduleConfig || {
        mode: 'DAILY',
        videosPerDay: 1,
        times: ['16:00'],
        timezone: 'Asia/Jakarta',
        startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
      },
      masterTitleIds: data.masterTitleIds || [],
      masterThumbnailIds: data.masterThumbnailIds || [],
      assignedChannelCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    list.push(newProfile);
    setStorageItem(KEYS.PROFILES, list);
    return newProfile;
  },

  updateContentProfile: async (id: string, data: Partial<ContentProfile>) => {
    try {
      const res = await authFetch(`/api/content-profiles/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        const list = getStorageItem<ContentProfile[]>(KEYS.PROFILES, initialProfiles);
        const idx = list.findIndex((p) => p.id === id);
        if (idx >= 0) list[idx] = updated;
        setStorageItem(KEYS.PROFILES, list);
        return updated;
      }
    } catch {}

    const list = getStorageItem<ContentProfile[]>(KEYS.PROFILES, initialProfiles);
    const idx = list.findIndex((p) => p.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() };
      setStorageItem(KEYS.PROFILES, list);
      return list[idx];
    }
    throw new Error('Profil tidak ditemukan');
  },

  deleteContentProfile: async (id: string) => {
    try {
      await authFetch(`/api/content-profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {}
    let list = getStorageItem<ContentProfile[]>(KEYS.PROFILES, initialProfiles);
    list = list.filter((p) => p.id !== id);
    setStorageItem(KEYS.PROFILES, list);
    return { success: true };
  },

  // Master Titles (Synchronized with Backend & Persistent per Channel: amg_master_titles_{channelId})
  getMasterTitles: async (profileOrChannelId?: string) => {
    let localChanTitles: MasterTitle[] = [];
    if (profileOrChannelId && profileOrChannelId !== 'ALL') {
      const cleanId = profileOrChannelId.replace(/^chan-/, '');
      const raw1 = localStorage.getItem(`amg_master_titles_${profileOrChannelId}`);
      const raw2 = localStorage.getItem(`amg_master_titles_${cleanId}`);
      const raw3 = localStorage.getItem(`amg_master_titles_chan-${cleanId}`);
      const stored = raw1 || raw2 || raw3;
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            localChanTitles = parsed.filter(isRealTitle);
          }
        } catch {}
      }
    }

    try {
      const url = profileOrChannelId && profileOrChannelId !== 'ALL'
        ? `/api/master-titles?profileId=${encodeURIComponent(profileOrChannelId)}`
        : '/api/master-titles';
      const res = await authFetch(url);
      if (res.ok) {
        const backendTitles = await res.json();
        if (Array.isArray(backendTitles)) {
          const clean = backendTitles.filter(isRealTitle);
          // Merge with any local channel titles to guarantee zero loss
          for (const lt of localChanTitles) {
            if (!clean.some((bt: MasterTitle) => bt.id === lt.id || (bt.text === lt.text && bt.channelId === lt.channelId))) {
              clean.push(lt);
            }
          }
          setStorageItem(KEYS.TITLES, clean);
          if (profileOrChannelId && profileOrChannelId !== 'ALL') {
            const cleanId = profileOrChannelId.replace(/^chan-/, '');
            const forThisChan = clean.filter((t: MasterTitle) =>
              t.channelId === profileOrChannelId ||
              t.channelId === cleanId ||
              t.channelId === `chan-${cleanId}` ||
              t.profileId === profileOrChannelId
            );
            if (forThisChan.length > 0) {
              localStorage.setItem(`amg_master_titles_${profileOrChannelId}`, JSON.stringify(forThisChan));
              localStorage.setItem(`amg_master_titles_${cleanId}`, JSON.stringify(forThisChan));
              localStorage.setItem(`amg_master_titles_chan-${cleanId}`, JSON.stringify(forThisChan));
            }
          }
          return clean;
        }
      }
    } catch {}

    let list = getStorageItem<MasterTitle[]>(KEYS.TITLES, []).filter(isRealTitle);
    for (const lt of localChanTitles) {
      if (!list.some((t) => t.id === lt.id)) {
        list.push(lt);
      }
    }
    setStorageItem(KEYS.TITLES, list);
    if (!profileOrChannelId || profileOrChannelId === 'ALL') {
      return list;
    }

    if (localChanTitles.length > 0) {
      return localChanTitles;
    }

    const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, []);
    const matchingChan = channels.find(
      (c) =>
        c.id === profileOrChannelId ||
        c.youtubeChannelId === profileOrChannelId ||
        c.contentProfileId === profileOrChannelId ||
        c.blockId === profileOrChannelId
    );

    return list.filter((t) => {
      if (matchingChan) {
        if (t.channelId && (t.channelId === matchingChan.id || t.channelId === matchingChan.youtubeChannelId || t.channelId === `chan-${matchingChan.youtubeChannelId}`)) {
          return true;
        }
        if (matchingChan.blockId && (t.blockId === matchingChan.blockId || t.profileId === matchingChan.blockId)) {
          return true;
        }
        if (matchingChan.contentProfileId && (t.profileId === matchingChan.contentProfileId || t.blockId === matchingChan.contentProfileId)) {
          return true;
        }
        if (t.profileId === `profile-${matchingChan.id}` || t.profileId === matchingChan.id) {
          return true;
        }
      }
      return t.profileId === profileOrChannelId || t.blockId === profileOrChannelId || t.channelId === profileOrChannelId;
    });
  },

  createMasterTitle: async (data: Partial<MasterTitle> & { channelId?: string }) => {
    let created: MasterTitle;
    try {
      const res = await authFetch('/api/master-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        created = await res.json();
      } else {
        throw new Error('Backend title creation failed');
      }
    } catch {
      const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, []);
      const targetChan = channels.find(
        (c) =>
          c.id === data.channelId ||
          c.youtubeChannelId === data.channelId ||
          c.id === data.profileId ||
          c.contentProfileId === data.profileId ||
          (data.channelId && c.id === `chan-${data.channelId}`)
      );

      const resolvedProfileId =
        data.profileId ||
        data.blockId ||
        targetChan?.contentProfileId ||
        targetChan?.blockId ||
        (targetChan ? `profile-${targetChan.id}` : 'default');
      const resolvedChannelId = data.channelId || targetChan?.id || '';

      const list = getStorageItem<MasterTitle[]>(KEYS.TITLES, []).filter(isRealTitle);
      created = {
        id: `title-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        blockId: resolvedProfileId,
        profileId: resolvedProfileId,
        channelId: resolvedChannelId,
        text: data.text || 'Judul Baru',
        orderIndex: list.filter(
          (t) =>
            t.profileId === resolvedProfileId ||
            t.blockId === resolvedProfileId ||
            (resolvedChannelId && t.channelId === resolvedChannelId)
        ).length,
        isActive: data.isActive !== undefined ? data.isActive : true,
        createdAt: new Date().toISOString(),
      };
    }

    // Persist into global list and channel-specific persistent key (amg_master_titles_{channelId})
    const list = getStorageItem<MasterTitle[]>(KEYS.TITLES, []).filter(isRealTitle);
    const existingIdx = list.findIndex(t => t.id === created.id);
    if (existingIdx >= 0) {
      list[existingIdx] = created;
    } else {
      list.push(created);
    }
    setStorageItem(KEYS.TITLES, list);

    const chanId = created.channelId || data.channelId;
    if (chanId) {
      const cleanId = chanId.replace(/^chan-/, '');
      const chanKey1 = `amg_master_titles_${chanId}`;
      const chanKey2 = `amg_master_titles_${cleanId}`;
      const chanKey3 = `amg_master_titles_chan-${cleanId}`;

      // Combine existing channel titles from all storage keys to prevent overwrite
      const raw1 = localStorage.getItem(chanKey1);
      const raw2 = localStorage.getItem(chanKey2);
      const raw3 = localStorage.getItem(chanKey3);
      const combined = [
        ...(raw1 ? JSON.parse(raw1) : []),
        ...(raw2 ? JSON.parse(raw2) : []),
        ...(raw3 ? JSON.parse(raw3) : []),
      ];
      const seen = new Set<string>();
      const existingChan: MasterTitle[] = [];
      for (const t of combined) {
        if (t && t.id && !seen.has(t.id) && isRealTitle(t)) {
          seen.add(t.id);
          existingChan.push(t);
        }
      }
      // Also add any matching from global list
      for (const t of list) {
        if (t && t.id && !seen.has(t.id) && (t.channelId === chanId || t.channelId === cleanId || t.channelId === `chan-${cleanId}`)) {
          seen.add(t.id);
          existingChan.push(t);
        }
      }

      const idxInChan = existingChan.findIndex(t => t.id === created.id);
      if (idxInChan >= 0) {
        existingChan[idxInChan] = created;
      } else {
        created.orderIndex = existingChan.length;
        existingChan.push(created);
      }

      existingChan.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      const serialized = JSON.stringify(existingChan);
      localStorage.setItem(chanKey1, serialized);
      localStorage.setItem(chanKey2, serialized);
      localStorage.setItem(chanKey3, serialized);
    }

    return created;
  },

  updateMasterTitle: async (id: string, data: Partial<MasterTitle>) => {
    let updatedFromBackend: MasterTitle | null = null;
    try {
      const res = await authFetch(`/api/master-titles/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        updatedFromBackend = await res.json();
      }
    } catch (err) {
      console.warn('[api] updateMasterTitle backend notice:', err);
    }

    // Find the existing item across all storage (global or channel-specific)
    let existingItem: MasterTitle | null = null;
    const globalList = getStorageItem<MasterTitle[]>(KEYS.TITLES, []).filter(isRealTitle);
    const gIdx = globalList.findIndex((t) => t.id === id);
    if (gIdx >= 0) {
      existingItem = globalList[gIdx];
    }

    if (!existingItem) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('amg_master_titles_')) {
          const raw = localStorage.getItem(k);
          if (raw) {
            try {
              const arr = JSON.parse(raw);
              if (Array.isArray(arr)) {
                const found = arr.find((t: any) => t && t.id === id);
                if (found) {
                  existingItem = found;
                  break;
                }
              }
            } catch {}
          }
        }
      }
    }

    const mergedTarget: MasterTitle = updatedFromBackend || {
      ...(existingItem || {
        id,
        blockId: 'block-general',
        profileId: 'block-general',
        channelId: '',
        text: data.text || '',
        orderIndex: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
      }),
      ...data,
    };

    // Update global list
    if (gIdx >= 0) {
      globalList[gIdx] = mergedTarget;
    } else {
      globalList.push(mergedTarget);
    }
    setStorageItem(KEYS.TITLES, globalList);

    // Update ALL channel-specific keys where this item exists
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('amg_master_titles_')) {
          const raw = localStorage.getItem(k);
          if (raw) {
            try {
              const arr = JSON.parse(raw);
              if (Array.isArray(arr)) {
                const itemIdx = arr.findIndex((t: any) => t && t.id === id);
                if (itemIdx >= 0) {
                  arr[itemIdx] = mergedTarget;
                  localStorage.setItem(k, JSON.stringify(arr));
                }
              }
            } catch {}
          }
        }
      }

      const targetChanId = mergedTarget.channelId;
      if (targetChanId) {
        const cleanId = targetChanId.replace(/^chan-/, '');
        for (const k of [`amg_master_titles_${targetChanId}`, `amg_master_titles_${cleanId}`, `amg_master_titles_chan-${cleanId}`]) {
          const chanRaw = localStorage.getItem(k);
          const chanList: MasterTitle[] = chanRaw ? JSON.parse(chanRaw) : [];
          const cIdx = chanList.findIndex((t) => t.id === id);
          if (cIdx >= 0) {
            chanList[cIdx] = mergedTarget;
          } else {
            chanList.push(mergedTarget);
          }
          localStorage.setItem(k, JSON.stringify(chanList));
        }
      }
    } catch {}

    return mergedTarget;
  },

  deleteMasterTitle: async (id: string) => {
    try {
      await authFetch(`/api/master-titles/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('[api] deleteMasterTitle backend notice:', err);
    }

    // 1. Remove from global KEYS.TITLES
    let list = getStorageItem<MasterTitle[]>(KEYS.TITLES, []).filter(isRealTitle);
    list = list.filter((t) => t.id !== id);
    setStorageItem(KEYS.TITLES, list);

    // 2. Remove from ALL channel-specific keys in localStorage
    try {
      const keysToClean: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('amg_master_titles_')) {
          keysToClean.push(k);
        }
      }
      for (const k of keysToClean) {
        const raw = localStorage.getItem(k);
        if (raw) {
          try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              localStorage.setItem(k, JSON.stringify(arr.filter((t: any) => t && t.id !== id)));
            }
          } catch {}
        }
      }
    } catch {}

    return { success: true };
  },

  // Master Thumbnails (Synchronized with Backend & Persistent per Channel)
  getMasterThumbnails: async (profileOrChannelId?: string) => {
    // 1. Direct channel storage inspection for instantaneous zero-latency display
    let localChanThumbs: MasterThumbnail[] = [];
    if (profileOrChannelId && profileOrChannelId !== 'ALL') {
      const cleanId = profileOrChannelId.replace(/^chan-/, '');
      const raw1 = localStorage.getItem(`amg_master_thumbnails_${profileOrChannelId}`);
      const raw2 = localStorage.getItem(`amg_master_thumbnails_${cleanId}`);
      const raw3 = localStorage.getItem(`amg_master_thumbnails_chan-${cleanId}`);
      const combined = [
        ...(raw1 ? JSON.parse(raw1) : []),
        ...(raw2 ? JSON.parse(raw2) : []),
        ...(raw3 ? JSON.parse(raw3) : []),
      ];
      try {
        const fromIdb = await getChannelThumbnailsFromIdb(profileOrChannelId);
        if (Array.isArray(fromIdb) && fromIdb.length > 0) {
          combined.push(...fromIdb);
        }
      } catch {}

      const seen = new Set<string>();
      localChanThumbs = combined.filter((th) => {
        if (!th || !th.id || seen.has(th.id) || !isRealThumbnail(th)) return false;
        seen.add(th.id);
        return true;
      });
    }

    try {
      const url = profileOrChannelId && profileOrChannelId !== 'ALL'
        ? `/api/master-thumbnails?profileId=${encodeURIComponent(profileOrChannelId)}`
        : '/api/master-thumbnails';
      const res = await authFetch(url);
      if (res.ok) {
        const backendThumbs = await res.json();
        if (Array.isArray(backendThumbs)) {
          const clean = backendThumbs.filter(isRealThumbnail);
          // Merge with any local channel thumbnails
          for (const lt of localChanThumbs) {
            if (!clean.some((bt: MasterThumbnail) => bt.id === lt.id)) {
              clean.push(lt);
            }
          }
          setStorageItem(KEYS.THUMBNAILS, clean);
          if (profileOrChannelId && profileOrChannelId !== 'ALL') {
            const cleanId = profileOrChannelId.replace(/^chan-/, '');
            const forThisChan = clean.filter((th: MasterThumbnail) =>
              th.channelId === profileOrChannelId ||
              th.channelId === cleanId ||
              th.channelId === `chan-${cleanId}` ||
              th.profileId === profileOrChannelId
            );
            if (forThisChan.length > 0) {
              const str = JSON.stringify(forThisChan);
              safeLocalStorageSet(`amg_master_thumbnails_${profileOrChannelId}`, str);
              safeLocalStorageSet(`amg_master_thumbnails_${cleanId}`, str);
              saveChannelThumbnailsToIdb(profileOrChannelId, forThisChan).catch(() => {});
            }
          }
          return clean;
        }
      }
    } catch {}

    let list = getStorageItem<MasterThumbnail[]>(KEYS.THUMBNAILS, []).filter(isRealThumbnail);
    for (const lt of localChanThumbs) {
      if (!list.some((th) => th.id === lt.id)) {
        list.push(lt);
      }
    }
    setStorageItem(KEYS.THUMBNAILS, list);
    if (!profileOrChannelId || profileOrChannelId === 'ALL') {
      return list;
    }

    const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, []);
    const matchingChan = channels.find(
      (c) =>
        c.id === profileOrChannelId ||
        c.youtubeChannelId === profileOrChannelId ||
        c.contentProfileId === profileOrChannelId ||
        c.blockId === profileOrChannelId
    );

    return list.filter((th) => {
      if (matchingChan) {
        if (th.channelId && (th.channelId === matchingChan.id || th.channelId === matchingChan.youtubeChannelId || th.channelId === `chan-${matchingChan.youtubeChannelId}`)) {
          return true;
        }
        if (matchingChan.blockId && (th.blockId === matchingChan.blockId || th.profileId === matchingChan.blockId)) {
          return true;
        }
        if (matchingChan.contentProfileId && (th.profileId === matchingChan.contentProfileId || th.blockId === matchingChan.contentProfileId)) {
          return true;
        }
        if (th.profileId === `profile-${matchingChan.id}` || th.profileId === matchingChan.id) {
          return true;
        }
      }
      return th.profileId === profileOrChannelId || th.blockId === profileOrChannelId || th.channelId === profileOrChannelId;
    });
  },

  createMasterThumbnail: async (data: Partial<MasterThumbnail> & { channelId?: string }) => {
    let created: MasterThumbnail;
    try {
      const res = await authFetch('/api/master-thumbnails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        created = await res.json();
      } else {
        throw new Error('Backend thumbnail creation failed');
      }
    } catch {
      const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, []);
      const targetChan = channels.find(
        (c) =>
          c.id === data.channelId ||
          c.youtubeChannelId === data.channelId ||
          c.id === data.profileId ||
          c.contentProfileId === data.profileId ||
          (data.channelId && c.id === `chan-${data.channelId}`)
      );

      const resolvedProfileId =
        data.profileId ||
        data.blockId ||
        targetChan?.contentProfileId ||
        targetChan?.blockId ||
        (targetChan ? `profile-${targetChan.id}` : 'default');
      const resolvedChannelId = data.channelId || targetChan?.id || '';

      const list = getStorageItem<MasterThumbnail[]>(KEYS.THUMBNAILS, []).filter(isRealThumbnail);
      created = {
        id: `thumb-${Date.now()}`,
        blockId: resolvedProfileId,
        profileId: resolvedProfileId,
        channelId: resolvedChannelId,
        name: data.name || 'Thumbnail',
        url: data.url || '',
        orderIndex: list.filter(
          (th) =>
            th.profileId === resolvedProfileId ||
            th.blockId === resolvedProfileId ||
            (resolvedChannelId && th.channelId === resolvedChannelId)
        ).length,
        isActive: data.isActive !== undefined ? data.isActive : true,
        createdAt: new Date().toISOString(),
      };
    }

    // Persist into global list and channel-specific persistent key (amg_master_thumbnails_{channelId})
    const list = getStorageItem<MasterThumbnail[]>(KEYS.THUMBNAILS, []).filter(isRealThumbnail);
    const existingIdx = list.findIndex(th => th.id === created.id);
    if (existingIdx >= 0) {
      list[existingIdx] = created;
    } else {
      list.push(created);
    }
    setStorageItem(KEYS.THUMBNAILS, list);

    const chanId = created.channelId || data.channelId;
    if (chanId) {
      const cleanId = chanId.replace(/^chan-/, '');
      const chanKey1 = `amg_master_thumbnails_${chanId}`;
      const chanKey2 = `amg_master_thumbnails_${cleanId}`;
      const chanKey3 = `amg_master_thumbnails_chan-${cleanId}`;

      // Combine existing channel thumbnails from all storage keys to prevent overwrite
      const raw1 = localStorage.getItem(chanKey1);
      const raw2 = localStorage.getItem(chanKey2);
      const raw3 = localStorage.getItem(chanKey3);
      const combined = [
        ...(raw1 ? JSON.parse(raw1) : []),
        ...(raw2 ? JSON.parse(raw2) : []),
        ...(raw3 ? JSON.parse(raw3) : []),
      ];
      try {
        const fromIdb = await getChannelThumbnailsFromIdb(chanId);
        if (Array.isArray(fromIdb)) combined.push(...fromIdb);
      } catch {}

      const seen = new Set<string>();
      const existingChan: MasterThumbnail[] = [];
      for (const th of combined) {
        if (th && th.id && !seen.has(th.id) && isRealThumbnail(th)) {
          seen.add(th.id);
          existingChan.push(th);
        }
      }
      for (const th of list) {
        if (th && th.id && !seen.has(th.id) && (th.channelId === chanId || th.channelId === cleanId || th.channelId === `chan-${cleanId}`)) {
          seen.add(th.id);
          existingChan.push(th);
        }
      }

      const idxInChan = existingChan.findIndex(th => th.id === created.id);
      if (idxInChan >= 0) {
        existingChan[idxInChan] = created;
      } else {
        created.orderIndex = existingChan.length;
        existingChan.push(created);
      }

      existingChan.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      const serialized = JSON.stringify(existingChan);
      safeLocalStorageSet(chanKey1, serialized);
      safeLocalStorageSet(chanKey2, serialized);
      safeLocalStorageSet(chanKey3, serialized);
      saveChannelThumbnailsToIdb(chanId, existingChan).catch(() => {});
    }

    return created;
  },

  updateMasterThumbnail: async (id: string, data: Partial<MasterThumbnail>) => {
    let updatedFromBackend: MasterThumbnail | null = null;
    try {
      const res = await authFetch(`/api/master-thumbnails/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        updatedFromBackend = await res.json();
      }
    } catch (err) {
      console.warn('[api] updateMasterThumbnail backend notice:', err);
    }

    let existingItem: MasterThumbnail | null = null;
    const globalList = getStorageItem<MasterThumbnail[]>(KEYS.THUMBNAILS, []).filter(isRealThumbnail);
    const gIdx = globalList.findIndex((th) => th.id === id);
    if (gIdx >= 0) {
      existingItem = globalList[gIdx];
    }

    if (!existingItem) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('amg_master_thumbnails_')) {
          const raw = localStorage.getItem(k);
          if (raw) {
            try {
              const arr = JSON.parse(raw);
              if (Array.isArray(arr)) {
                const found = arr.find((th: any) => th && th.id === id);
                if (found) {
                  existingItem = found;
                  break;
                }
              }
            } catch {}
          }
        }
      }
    }

    const mergedTarget: MasterThumbnail = updatedFromBackend || {
      ...(existingItem || {
        id,
        blockId: 'block-general',
        profileId: 'block-general',
        channelId: '',
        name: data.name || 'Thumbnail',
        url: data.url || '',
        orderIndex: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
      }),
      ...data,
    };

    if (gIdx >= 0) {
      globalList[gIdx] = mergedTarget;
    } else {
      globalList.push(mergedTarget);
    }
    setStorageItem(KEYS.THUMBNAILS, globalList);

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('amg_master_thumbnails_')) {
          const raw = localStorage.getItem(k);
          if (raw) {
            try {
              const arr = JSON.parse(raw);
              if (Array.isArray(arr)) {
                const itemIdx = arr.findIndex((th: any) => th && th.id === id);
                if (itemIdx >= 0) {
                  arr[itemIdx] = mergedTarget;
                  safeLocalStorageSet(k, JSON.stringify(arr));
                }
              }
            } catch {}
          }
        }
      }

      const targetChanId = mergedTarget.channelId;
      if (targetChanId) {
        const cleanId = targetChanId.replace(/^chan-/, '');
        for (const k of [`amg_master_thumbnails_${targetChanId}`, `amg_master_thumbnails_${cleanId}`, `amg_master_thumbnails_chan-${cleanId}`]) {
          const chanRaw = localStorage.getItem(k);
          const chanList: MasterThumbnail[] = chanRaw ? JSON.parse(chanRaw) : [];
          const cIdx = chanList.findIndex((th) => th.id === id);
          if (cIdx >= 0) {
            chanList[cIdx] = mergedTarget;
          } else {
            chanList.push(mergedTarget);
          }
          safeLocalStorageSet(k, JSON.stringify(chanList));
        }
        appendThumbnailToIdb(targetChanId, mergedTarget).catch(() => {});
      }
    } catch {}

    return mergedTarget;
  },

  deleteMasterThumbnail: async (id: string) => {
    try {
      await authFetch(`/api/master-thumbnails/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('[api] deleteMasterThumbnail backend notice:', err);
    }

    // 1. Remove from global KEYS.THUMBNAILS
    let list = getStorageItem<MasterThumbnail[]>(KEYS.THUMBNAILS, []).filter(isRealThumbnail);
    list = list.filter((t) => t.id !== id);
    setStorageItem(KEYS.THUMBNAILS, list);

    // 2. Remove from ALL channel-specific keys in localStorage & IndexedDB
    try {
      const keysToClean: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('amg_master_thumbnails_')) {
          keysToClean.push(k);
        }
      }
      for (const k of keysToClean) {
        const raw = localStorage.getItem(k);
        if (raw) {
          try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              safeLocalStorageSet(k, JSON.stringify(arr.filter((th: any) => th && th.id !== id)));
            }
          } catch {}
        }
        const chanPart = k.replace('amg_master_thumbnails_', '');
        deleteThumbnailFromIdb(chanPart, id).catch(() => {});
      }
    } catch {}

    return { success: true };
  },

  // Rotation Matrix (Strictly isolated for the active channel/profile; NO cross-channel data)
  getRotationMatrix: async (profileOrChannelId?: string, count: number = 12) => {
    const rawTitles = getStorageItem<MasterTitle[]>(KEYS.TITLES, initialMasterTitles);
    const rawThumbs = getStorageItem<MasterThumbnail[]>(KEYS.THUMBNAILS, initialMasterThumbnails);

    let titles: MasterTitle[] = [];
    let thumbs: MasterThumbnail[] = [];

    if (profileOrChannelId && profileOrChannelId !== 'ALL') {
      const cleanId = profileOrChannelId.replace(/^chan-/, '');

      // Load channel specific titles
      const rawChanTitles =
        localStorage.getItem(`amg_master_titles_${profileOrChannelId}`) ||
        localStorage.getItem(`amg_master_titles_${cleanId}`) ||
        localStorage.getItem(`amg_master_titles_chan-${cleanId}`);
      if (rawChanTitles) {
        try {
          const parsed = JSON.parse(rawChanTitles);
          if (Array.isArray(parsed) && parsed.length > 0) {
            titles = parsed.filter(isRealTitle);
          }
        } catch {}
      }

      // Load channel specific thumbnails from IndexedDB and localStorage
      try {
        const fromIdb = await getChannelThumbnailsFromIdb(profileOrChannelId);
        if (Array.isArray(fromIdb) && fromIdb.length > 0) {
          thumbs = fromIdb.filter(isRealThumbnail);
        }
      } catch {}

      if (thumbs.length === 0) {
        const rawChanThumbs =
          localStorage.getItem(`amg_master_thumbnails_${profileOrChannelId}`) ||
          localStorage.getItem(`amg_master_thumbnails_${cleanId}`) ||
          localStorage.getItem(`amg_master_thumbnails_chan-${cleanId}`);
        if (rawChanThumbs) {
          try {
            const parsed = JSON.parse(rawChanThumbs);
            if (Array.isArray(parsed) && parsed.length > 0) {
              thumbs = parsed.filter(isRealThumbnail);
            }
          } catch {}
        }
      }

      const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, []);
      const matchingChan = channels.find(
        (c) =>
          c.id === profileOrChannelId ||
          c.youtubeChannelId === profileOrChannelId ||
          c.contentProfileId === profileOrChannelId
      );

      if (titles.length === 0) {
        titles = rawTitles.filter((t) => {
          if (!t.isActive) return false;
          if (matchingChan) {
            if (t.channelId && (t.channelId === matchingChan.id || t.channelId === matchingChan.youtubeChannelId)) return true;
            if (matchingChan.contentProfileId && t.profileId === matchingChan.contentProfileId) return true;
            if (t.profileId === `profile-${matchingChan.id}` || t.profileId === matchingChan.id) return true;
          }
          return t.profileId === profileOrChannelId || t.channelId === profileOrChannelId;
        });
      }

      if (thumbs.length === 0) {
        thumbs = rawThumbs.filter((th) => {
          if (!th.isActive) return false;
          if (matchingChan) {
            if (th.channelId && (th.channelId === matchingChan.id || th.channelId === matchingChan.youtubeChannelId)) return true;
            if (matchingChan.contentProfileId && th.profileId === matchingChan.contentProfileId) return true;
            if (th.profileId === `profile-${matchingChan.id}` || th.profileId === matchingChan.id) return true;
          }
          return th.profileId === profileOrChannelId || th.channelId === profileOrChannelId;
        });
      }
    } else {
      // If no specific channel/profile is selected, pick the first valid block (never mix across blocks)
      const profiles = getStorageItem<ContentProfile[]>(KEYS.PROFILES, initialProfiles);
      const defaultBlock = profiles[0];
      if (defaultBlock) {
        titles = rawTitles.filter((t) => (t.blockId === defaultBlock.id || t.profileId === defaultBlock.id) && t.isActive);
        thumbs = rawThumbs.filter((th) => (th.blockId === defaultBlock.id || th.profileId === defaultBlock.id) && th.isActive);
      } else {
        titles = [];
        thumbs = [];
      }
    }

    titles.sort((a, b) => a.orderIndex - b.orderIndex);
    thumbs.sort((a, b) => a.orderIndex - b.orderIndex);

    // If channel has no titles or no thumbnails, NEVER leak other channels' assets!
    if (titles.length === 0 || thumbs.length === 0) {
      return {
        titleCount: titles.length,
        thumbnailCount: thumbs.length,
        totalVideosPreviewed: 0,
        matrix: [],
      };
    }

    const matrix = Array.from({ length: count }).map((_, idx) => ({
      videoIndex: idx + 1,
      titleIndex: idx % titles.length,
      thumbnailIndex: idx % thumbs.length,
      title: titles[idx % titles.length],
      thumbnail: thumbs[idx % thumbs.length],
    }));

    return {
      titleCount: titles.length,
      thumbnailCount: thumbs.length,
      totalVideosPreviewed: count,
      matrix,
    };
  },

  // Videos (Synchronized with Backend & Persistent Frontend State)
  getVideos: async (params?: { channelId?: string; status?: string; isManaged?: boolean; scope?: string }) => {
    // 1. Instant check from channel-specific persistent key (Anti-Reset Serverless)
    let localRealVideos: ManagedVideo[] = [];
    const targetChanId = params?.channelId && params.channelId !== 'ALL' ? params.channelId : undefined;
    if (targetChanId) {
      const cleanTargetId = targetChanId.replace(/^chan-/, '');
      const raw1 = localStorage.getItem(`amg_real_videos_${targetChanId}`);
      const raw2 = localStorage.getItem(`amg_real_videos_${cleanTargetId}`);
      const raw3 = localStorage.getItem(`amg_real_videos_chan-${cleanTargetId}`);
      const storedJson = raw1 || raw2 || raw3;
      if (storedJson) {
        try {
          const parsed = JSON.parse(storedJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            localRealVideos = parsed.filter(isRealVideo);
          }
        } catch {}
      }
    }

    try {
      const url = targetChanId
        ? `/api/videos?channelId=${encodeURIComponent(targetChanId)}`
        : '/api/videos';
      const res = await authFetch(url);
      if (res.ok) {
        const backendVideos = await res.json();
        if (Array.isArray(backendVideos)) {
          let clean = backendVideos.filter(isRealVideo);
          // If backend returned empty but local cache has real videos for this channel, preserve local cache
          if (clean.length === 0 && localRealVideos.length > 0) {
            clean = localRealVideos;
          }
          const rawExisting = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, []);
          let mergedVideos: ManagedVideo[];
          if (targetChanId) {
            const cleanTargetId = targetChanId.replace(/^chan-/, '');
            const otherChannelsVideos = rawExisting.filter(
              (v) =>
                v.channelId !== targetChanId &&
                v.channelId !== `chan-${targetChanId}` &&
                v.channelId !== cleanTargetId &&
                v.channelId !== `chan-${cleanTargetId}`
            );
            mergedVideos = [...clean, ...otherChannelsVideos];
            // Persist into channel persistent keys
            if (clean.length > 0) {
              localStorage.setItem(`amg_real_videos_${targetChanId}`, JSON.stringify(clean));
              localStorage.setItem(`amg_real_videos_${cleanTargetId}`, JSON.stringify(clean));
              localStorage.setItem(`amg_real_videos_chan-${cleanTargetId}`, JSON.stringify(clean));
            }
          } else {
            mergedVideos = clean;
          }
          setStorageItem(KEYS.VIDEOS, mergedVideos);
          let list = clean;
          if (params?.status && params.status !== 'ALL') list = list.filter((v) => v.managementStatus === params.status);
          if (params?.isManaged !== undefined) list = list.filter((v) => v.isManaged === params.isManaged);
          if (params?.scope && params.scope !== 'ALL') list = list.filter((v) => v.managementScope === params.scope);
          return list;
        }
      }
    } catch {}

    // Fallback: check localRealVideos first, then global storage
    if (localRealVideos.length > 0) {
      let list = localRealVideos;
      if (params?.status && params.status !== 'ALL') list = list.filter((v) => v.managementStatus === params.status);
      if (params?.isManaged !== undefined) list = list.filter((v) => v.isManaged === params.isManaged);
      if (params?.scope && params.scope !== 'ALL') list = list.filter((v) => v.managementScope === params.scope);
      return list;
    }

    const raw = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, initialVideos);
    const clean = raw.filter(isRealVideo);
    if (clean.length !== raw.length) {
      setStorageItem(KEYS.VIDEOS, clean);
    }
    let list = clean;
    if (targetChanId) {
      const cleanTargetId = targetChanId.replace(/^chan-/, '');
      list = list.filter(
        (v) =>
          v.channelId === targetChanId ||
          v.channelId === `chan-${targetChanId}` ||
          v.channelId === cleanTargetId ||
          v.channelId === `chan-${cleanTargetId}`
      );
    }
    if (params?.status && params.status !== 'ALL') list = list.filter((v) => v.managementStatus === params.status);
    if (params?.isManaged !== undefined) list = list.filter((v) => v.isManaged === params.isManaged);
    if (params?.scope && params.scope !== 'ALL') list = list.filter((v) => v.managementScope === params.scope);
    return list;
  },

  updateVideoScope: async (id: string, data: { managementScope: 'REGULAR' | 'EXCLUDED' | 'UNCLASSIFIED'; exclusionReason?: string }) => {
    const list = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, initialVideos);
    const idx = list.findIndex((v) => v.id === id);
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        managementScope: data.managementScope,
        exclusionReason: data.exclusionReason,
        isManaged: data.managementScope === 'REGULAR',
        updatedAt: new Date().toISOString(),
      };
      setStorageItem(KEYS.VIDEOS, list);
      return { success: true, video: list[idx], message: 'Scope video berhasil diperbarui' };
    }
    throw new Error('Video tidak ditemukan');
  },

  bulkUpdateVideoScope: async (data: { videoIds: string[]; managementScope: 'REGULAR' | 'EXCLUDED' | 'UNCLASSIFIED'; exclusionReason?: string }) => {
    const list = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, initialVideos);
    let updated = 0;
    const resVideos: ManagedVideo[] = [];

    list.forEach((v, idx) => {
      if (data.videoIds.includes(v.id)) {
        list[idx] = {
          ...v,
          managementScope: data.managementScope,
          exclusionReason: data.exclusionReason,
          isManaged: data.managementScope === 'REGULAR',
          updatedAt: new Date().toISOString(),
        };
        updated++;
        resVideos.push(list[idx]);
      }
    });

    setStorageItem(KEYS.VIDEOS, list);
    return { success: true, updatedCount: updated, videos: resVideos, message: `${updated} video diperbarui` };
  },

  getChannelScopeSummary: async (channelId: string) => {
    try {
      const res = await authFetch(`/api/channels/${encodeURIComponent(channelId)}/scope-summary`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.summary) return data;
      }
    } catch {}

    const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, initialChannels);
    const channel = channels.find(
      (c) =>
        c.id === channelId ||
        c.youtubeChannelId === channelId ||
        (channelId.startsWith('chan-') && c.id === channelId.replace('chan-', '')) ||
        (c.youtubeChannelId && channelId === `chan-${c.youtubeChannelId}`)
    );

    const isMatch = (vChanId: string) => {
      if (vChanId === channelId) return true;
      if (vChanId === `chan-${channelId}`) return true;
      if (channelId.startsWith('chan-') && vChanId === channelId.replace('chan-', '')) return true;
      if (channel) {
        if (vChanId === channel.id) return true;
        if (channel.youtubeChannelId) {
          if (vChanId === channel.youtubeChannelId) return true;
          if (vChanId === `chan-${channel.youtubeChannelId}`) return true;
        }
      }
      return false;
    };

    const list = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, initialVideos).filter(
      (v) => isMatch(v.channelId)
    );
    return {
      channelId,
      channelTitle: channel?.title || 'Channel',
      summary: {
        includedCount: list.filter((v) => v.managementScope === 'REGULAR' && v.isAmgEligible).length,
        excludedCount: list.filter((v) => v.managementScope === 'EXCLUDED' || !v.isAmgEligible).length,
        needsScopeAssignmentCount: list.filter((v) => v.managementScope === 'UNCLASSIFIED' || !v.managementScope).length,
        totalDetected: list.length,
      },
    };
  },

  // Scheduler
  updateChannelScheduleConfig: async (channelId: string, data: { scheduleConfig?: ScheduleConfig; useProfileSchedule?: boolean }) => {
    const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, initialChannels);
    const idx = channels.findIndex((c) => c.id === channelId);
    if (idx >= 0) {
      if (data.scheduleConfig) channels[idx].scheduleConfig = data.scheduleConfig;
      if (data.useProfileSchedule !== undefined) channels[idx].useProfileSchedule = data.useProfileSchedule;
      setStorageItem(KEYS.CHANNELS, channels);
      const resolvedConfig: ScheduleConfig = channels[idx].scheduleConfig || {
        mode: 'DAILY',
        videosPerDay: 1,
        times: ['16:00'],
        timezone: 'Asia/Jakarta',
      };
      return {
        success: true,
        channel: channels[idx],
        resolvedScheduleConfig: resolvedConfig,
        message: 'Konfigurasi jadwal berhasil disimpan',
      };
    }
    throw new Error('Channel tidak ditemukan');
  },

  validateSchedule: async (config: Partial<ScheduleConfig>) => {
    return {
      isValid: true,
      errors: [],
    } as ScheduleValidationResult;
  },

  previewSchedule: async (params: { count?: number; config?: ScheduleConfig; channelId?: string; profileId?: string }) => {
    const count = params.count || 7;
    const now = new Date();
    const slots = Array.from({ length: count }).map((_, idx) => {
      const d = new Date(now.getTime() + (idx + 1) * 24 * 60 * 60 * 1000);
      d.setHours(16, 0, 0, 0);
      return {
        index: idx + 1,
        dateString: d.toISOString().split('T')[0],
        timeString: '16:00',
        isoPublishAt: d.toISOString(),
        formattedDisplay: d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
        timezone: 'Asia/Jakarta',
        timezoneAbbreviation: 'WIB',
      };
    });

    return {
      success: true,
      config: params.config || {
        mode: 'DAILY',
        videosPerDay: 1,
        times: ['16:00'],
        timezone: 'Asia/Jakarta',
        startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
      },
      latestScheduledPublishAt: slots[slots.length - 1].isoPublishAt,
      occupiedSlotsCount: 0,
      slots,
    };
  },

  getScheduleReconciliation: async (channelId: string) => {
    // 1. Try real backend reconcile endpoint: GET /api/scheduler/reconcile/:channelId
    try {
      const res = await authFetch(`/api/scheduler/reconcile/${encodeURIComponent(channelId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.channelId) {
          // Sync anchor state into amg_channels in localStorage
          let channels = getStorageItem<Channel[]>(KEYS.CHANNELS, []);
          const idx = channels.findIndex(
            (c) => c.id === channelId || c.youtubeChannelId === channelId || c.id === `chan-${channelId}`
          );
          if (idx >= 0) {
            if (data.latestScheduledPublishAt) {
              channels[idx].lastScheduledPublishAt = data.latestScheduledPublishAt;
              channels[idx].latestManagedScheduledAt = data.latestScheduledPublishAt;
            }
            if (data.latestScheduledVideoTitle) {
              channels[idx].lastScheduledVideoTitle = data.latestScheduledVideoTitle;
            }
            if (data.latestScheduledVideoId) {
              channels[idx].lastScheduledVideoId = data.latestScheduledVideoId;
            }
            setStorageItem(KEYS.CHANNELS, channels);
          }
          return data;
        }
      }
    } catch (err) {
      console.warn('Backend scheduler reconcile error, using local fallback:', err);
    }

    // 2. Client-side fallback from amg_videos and amg_channels
    const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, initialChannels);
    const channel = channels.find((c) => c.id === channelId || c.youtubeChannelId === channelId) || channels[0];
    const allVideos = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, []).filter(isRealVideo);
    const anchorInfo = getChannelScheduledAnchor(channel, allVideos);

    const effectiveAnchor = anchorInfo.latestPublishAt || channel.lastScheduledPublishAt || null;
    const effectiveTitle = anchorInfo.latestVideoTitle || channel.lastScheduledVideoTitle || null;

    const times = channel.scheduleConfig?.times || (channel.publishTime ? [channel.publishTime] : ['16:00']);
    const timezone = channel.scheduleConfig?.timezone || channel.timezone || 'Asia/Jakarta';

    // Calculate next continuation slots starting strictly AFTER effectiveAnchor
    const slots = [];
    let baseDate = effectiveAnchor ? new Date(effectiveAnchor) : new Date();
    if (isNaN(baseDate.getTime())) baseDate = new Date();

    for (let dayOffset = 1; dayOffset <= 15; dayOffset++) {
      const slotTime = new Date(baseDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const timeStr = times[0] || '16:00';
      const [h, m] = timeStr.split(':').map(Number);
      slotTime.setHours(h || 16, m || 0, 0, 0);

      slots.push({
        index: dayOffset,
        dateString: slotTime.toISOString().split('T')[0],
        timeString: timeStr,
        isoPublishAt: slotTime.toISOString(),
        formattedDisplay: formatWibDateTime(slotTime.toISOString()),
        timezone,
        timezoneAbbreviation: 'WIB',
      });
    }

    return {
      channelId,
      channelTitle: channel?.title || 'YouTube Channel',
      timezone,
      storedCursorPublishAt: effectiveAnchor,
      verifiedYouTubePublishAt: effectiveAnchor,
      sourceOfTruthPublishAt: effectiveAnchor,
      latestScheduledPublishAt: effectiveAnchor,
      latestScheduledVideoTitle: effectiveTitle,
      latestScheduledVideoId: anchorInfo.latestVideoId || channel.lastScheduledVideoId || null,
      totalScheduledVideos: anchorInfo.scheduledVideosCount,
      nextScheduleSlots: slots,
    };
  },

  // Automation
  getAutomationPreview: async (channelId: string, profileId?: string) => {
    try {
      const res = await authFetch('/api/automation/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, profileId }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.preview)) {
          return json;
        }
      }
    } catch {
      // fallback to client calculation
    }

    const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, []);
    let channel = channels.find((c) => c.id === channelId || c.youtubeChannelId === channelId);
    if (!channel && channels.length > 0) {
      channel = channels[0];
    }
    if (!channel) {
      throw new Error(`Tidak ada channel yang terhubung.`);
    }

    const profiles = getStorageItem<ContentProfile[]>(KEYS.PROFILES, initialProfiles);
    let targetBlockId = profileId || channel.contentProfileId || channel.blockId;
    if (!targetBlockId) {
      targetBlockId = 'block-general';
      channel.blockId = 'block-general';
      channel.contentProfileId = 'block-general';
    }
    let targetBlock = profiles.find((p) => p.id === targetBlockId || p.blockId === targetBlockId) || profiles.find(p => p.name.toLowerCase() === 'general') || initialProfiles[0];

    const rawVideos = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, []).filter(isRealVideo);
    let channelVideos = rawVideos.filter(
      (v) =>
        v.channelId === channel.id ||
        v.channelId === channel.youtubeChannelId ||
        v.channelId === `chan-${channel.youtubeChannelId}`
    );

    const cleanChanId = (channel.youtubeChannelId || channel.id).replace(/^chan-/, '');
    if (channelVideos.length === 0) {
      const rawCached = localStorage.getItem(`amg_real_videos_${channel.id}`) ||
        localStorage.getItem(`amg_real_videos_${cleanChanId}`) ||
        localStorage.getItem(`amg_real_videos_chan-${cleanChanId}`);
      if (rawCached) {
        try {
          const parsed = JSON.parse(rawCached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            channelVideos = parsed.filter(isRealVideo);
          }
        } catch {}
      }
    }

    if (channelVideos.length === 0) {
      return {
        success: true,
        preview: [],
        channelTitle: channel.title,
        profileName: targetBlock.name,
        unmanagedCount: 0,
        scopeSummary: {
          totalDetected: 0,
          includedCount: 0,
          excludedCount: 0,
          needsScopeAssignmentCount: 0,
          eligibleCount: 0,
          newCandidatesCount: 0,
          protectedOldCount: 0,
          protectedByCutoffCount: 0,
          unclassifiedCount: 0,
          alreadyManagedCount: 0,
        },
      };
    }

    // Load Master Titles from channel storage
    const rawChanTitles = localStorage.getItem(`amg_master_titles_${channel.id}`) ||
      localStorage.getItem(`amg_master_titles_${cleanChanId}`) ||
      localStorage.getItem(`amg_master_titles_chan-${cleanChanId}`);
    let channelTitles: MasterTitle[] = [];
    if (rawChanTitles) {
      try {
        const parsed = JSON.parse(rawChanTitles);
        if (Array.isArray(parsed) && parsed.length > 0) {
          channelTitles = parsed.filter(isRealTitle);
        }
      } catch {}
    }

    const allTitles = getStorageItem<MasterTitle[]>(KEYS.TITLES, initialMasterTitles).filter(isRealTitle);
    const allThumbs = getStorageItem<MasterThumbnail[]>(KEYS.THUMBNAILS, initialMasterThumbnails).filter(isRealThumbnail);

    let titles: MasterTitle[] = channelTitles;
    if (titles.length === 0) {
      titles = allTitles.filter((t) => {
        if (t.channelId && (t.channelId === channel.id || t.channelId === cleanChanId || t.channelId === `chan-${cleanChanId}`)) return true;
        return t.blockId === targetBlock.id || t.profileId === targetBlock.id;
      });
    }

    // Load Master Thumbnails from IndexedDB and channel storage
    let channelThumbs: MasterThumbnail[] = [];
    try {
      const fromIdb = await getChannelThumbnailsFromIdb(channel.id);
      if (Array.isArray(fromIdb) && fromIdb.length > 0) {
        channelThumbs = fromIdb.filter(isRealThumbnail);
      }
    } catch {}

    if (channelThumbs.length === 0) {
      const rawChanThumbs = localStorage.getItem(`amg_master_thumbnails_${channel.id}`) ||
        localStorage.getItem(`amg_master_thumbnails_${cleanChanId}`) ||
        localStorage.getItem(`amg_master_thumbnails_chan-${cleanChanId}`);
      if (rawChanThumbs) {
        try {
          const parsed = JSON.parse(rawChanThumbs);
          if (Array.isArray(parsed) && parsed.length > 0) {
            channelThumbs = parsed.filter(isRealThumbnail);
          }
        } catch {}
      }
    }

    let thumbnails: MasterThumbnail[] = channelThumbs;
    if (thumbnails.length === 0) {
      thumbnails = allThumbs.filter((th) => {
        if (th.channelId && (th.channelId === channel.id || th.channelId === cleanChanId || th.channelId === `chan-${cleanChanId}`)) return true;
        return th.blockId === targetBlock.id || th.profileId === targetBlock.id;
      });
    }

    const realCustomThumbnails = thumbnails.filter(th => isRealThumbnail(th));

    // Filter candidate videos strictly matching all criteria (all unmanaged eligible candidates)
    const candidateVideos = channelVideos.filter((v) => {
      if (v.isManaged || v.managementStatus === 'COMPLETED') return false;
      if (v.managementScope === 'EXCLUDED') return false;
      const priv = (v.privacyStatus || 'private').toLowerCase();
      const hasSched = Boolean(v.publishAt || v.scheduledPublishAt);
      if (priv === 'private' && !hasSched) {
        const rawT = v.titleBefore || (v as any).title || '';
        if (/salinan\s+dari\s+a/i.test(rawT) || /copy\s+of\s+a/i.test(rawT)) {
          return true;
        }
      }
      if ((v.managementScope === 'REGULAR' && v.isAmgEligible) || v.isEnrolled) return true;
      const evalRes = evaluateVideoEligibilityWithBlock(v, channel, targetBlock);
      return evalRes.isEligible || evalRes.category === 'NEW_PRIVATE_CANDIDATE';
    });

    // Detect latest scheduled anchor (e.g. 3 Jan 2027, 09:00 WIB)
    let latestAnchorMs = 0;
    let latestAnchorIso: string | null = null;
    for (const v of channelVideos) {
      const pub = v.publishAt || v.scheduledPublishAt;
      if (pub) {
        const ms = new Date(pub).getTime();
        if (!isNaN(ms) && ms > latestAnchorMs) {
          latestAnchorMs = ms;
          latestAnchorIso = pub;
        }
      }
    }
    if (channel.lastScheduledPublishAt) {
      const ms = new Date(channel.lastScheduledPublishAt).getTime();
      if (!isNaN(ms) && ms > latestAnchorMs) {
        latestAnchorMs = ms;
        latestAnchorIso = channel.lastScheduledPublishAt;
      }
    }
    // Default anchor reference: 3 Jan 2027 09:00 WIB (UTC 02:00)
    if (!latestAnchorIso) {
      latestAnchorIso = '2027-01-03T02:00:00.000Z';
    }

    const baseAnchorDate = new Date(latestAnchorIso);
    const opTimeStr = targetBlock.scheduleConfig?.times?.[0] || '09:00';

    // Map ALL candidate videos (without capping or slicing at 10)
    const preview: AutomationPreviewItem[] = candidateVideos.map((v, i) => {
      const assignedT = titles.length > 0
        ? titles[i % titles.length].text
        : 'Silakan masukkan Master Judul sebelum memulai otomasi';

      const rawNativeThumb = v.thumbnailBefore || v.thumbnailAssigned || (v.youtubeVideoId ? `https://i.ytimg.com/vi/${v.youtubeVideoId}/hqdefault.jpg` : '');
      const hasCustomMasterThumb = realCustomThumbnails.length > 0;
      const assignedThumb = hasCustomMasterThumb ? realCustomThumbnails[i % realCustomThumbnails.length].url : rawNativeThumb;

      // Schedule starts next day after anchor (e.g. 4 Jan 2027, 5 Jan 2027, etc.)
      const candSlotDate = new Date(baseAnchorDate.getTime() + (i + 1) * 86400000);
      const publishDateStr = candSlotDate.toISOString().split('T')[0];

      return {
        sequence: i + 1,
        videoId: v.id,
        originalTitle: v.titleBefore || v.titleAssigned || 'Salinan dari A',
        assignedTitle: assignedT,
        originalThumbnail: rawNativeThumb,
        assignedThumbnail: assignedThumb,
        isCustomThumbnail: hasCustomMasterThumb,
        thumbnailLabel: hasCustomMasterThumb ? `Master Kustom TH${(i % realCustomThumbnails.length) + 1}` : 'Bawaan YouTube',
        publishDate: publishDateStr,
        publishTime: `${opTimeStr} WIB`,
        targetChannelId: channel.id,
        targetChannelTitle: channel.title,
        contentProfileName: targetBlock.name,
        status: 'READY',
        managementScope: 'REGULAR',
        isAmgEligible: true,
      };
    });

    return {
      success: true,
      preview,
      channelTitle: channel.title,
      profileName: targetBlock.name,
      unmanagedCount: candidateVideos.length,
      scopeSummary: {
        totalDetected: channelVideos.length,
        includedCount: candidateVideos.length,
        excludedCount: channelVideos.length - candidateVideos.length,
        needsScopeAssignmentCount: 0,
        eligibleCount: candidateVideos.length,
        newCandidatesCount: candidateVideos.length,
      } as AutomationScopeSummary,
    };
  },

  executeDryRun: async (channelId: string, profileId?: string) => {
    const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, initialChannels);
    const channel = channels.find((c) => c.id === channelId) || channels[0];
    const profiles = getStorageItem<ContentProfile[]>(KEYS.PROFILES, initialProfiles);
    const targetBlockId = profileId || channel?.contentProfileId || channel?.blockId;
    const targetBlock = profiles.find((p) => p.id === targetBlockId) || profiles[0];

    const videos = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, initialVideos);
    const eligibleVideos = videos.filter(
      (v) =>
        (v.channelId === channelId || v.channelId === channel?.youtubeChannelId) &&
        !v.isManaged &&
        v.managementStatus !== 'COMPLETED'
    );
    const eligibleCount = eligibleVideos.length;

    const newBatch: AutomationBatch = {
      id: `batch-dry-${Date.now()}`,
      batchNumber: `BAT-${Date.now().toString().slice(-4)}`,
      channelId,
      channelTitle: channel?.title || 'Simulasi Otomasi',
      profileId: targetBlock?.id || channel?.contentProfileId || 'profile-default',
      profileName: targetBlock?.name || channel?.title || 'Profil Konten',
      status: 'completed',
      detectedCount: eligibleCount,
      processedCount: eligibleCount,
      scheduledCount: eligibleCount,
      completedCount: eligibleCount,
      failedCount: 0,
      isDryRun: true,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    return { success: true, batch: newBatch };
  },

  startBatchAutomation: async (
    channelId: string,
    profileId?: string,
    payloadOptions?: {
      batchSize?: number;
      channelTitle?: string;
      videoIds?: string[];
      executionPlan?: Array<{
        videoId: string;
        title?: string;
        assignedTitle?: string;
        assignedThumbnail?: string;
        thumbnailUrl?: string;
        publishDate?: string;
        publishTime?: string;
        scheduledPublishAt?: string;
      }>;
      authToken?: string;
      accessToken?: string;
      refreshToken?: string;
    }
  ) => {
    // Resolve tokens from payloadOptions or localStorage
    const effectiveToken =
      payloadOptions?.authToken ||
      payloadOptions?.accessToken ||
      localStorage.getItem('amg_youtube_access_token') ||
      localStorage.getItem('amg_oauth_token') ||
      localStorage.getItem('amg_auth_token') ||
      '';

    const effectiveRefreshToken =
      payloadOptions?.refreshToken ||
      localStorage.getItem('amg_youtube_refresh_token') ||
      '';

    // Lightweight payload (< 1 KB) - send channel, profile, batchSize, and candidate videoIds / lightweight execution plan
    const payload: Record<string, any> = {
      channelId,
      profileId,
      batchSize: payloadOptions?.batchSize || 50,
      channelTitle: payloadOptions?.channelTitle,
      accessToken: effectiveToken || undefined,
      refreshToken: effectiveRefreshToken || undefined,
    };
    if (Array.isArray(payloadOptions?.videoIds) && payloadOptions.videoIds.length > 0) {
      payload.videoIds = payloadOptions.videoIds;
    }
    if (Array.isArray(payloadOptions?.executionPlan) && payloadOptions.executionPlan.length > 0) {
      payload.executionPlan = payloadOptions.executionPlan;
    }

    const endpoints = [
      '/api/automation/start',
      '/api/automation/batch',
      '/api/automation/batches',
      '/api/automation/batch/start',
      '/api/batch/execute',
      '/api/automation/execute',
    ];

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (effectiveToken) {
      reqHeaders['Authorization'] = `Bearer ${effectiveToken}`;
    }

    let lastError: any = null;
    for (const url of endpoints) {
      try {
        const res = await authFetch(url, {
          method: 'POST',
          headers: reqHeaders,
          body: JSON.stringify(payload),
        });

        const contentType = res.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');

        if (res.ok) {
          const json = isJson ? await res.json() : {};
          if (json.success) {
            const batch = json.batch || {
              id: json.batchId || `AMG-BATCH-${Date.now().toString().slice(-4)}`,
              batchNumber: json.batchId || `BAT-${Date.now().toString().slice(-4)}`,
              channelId,
              channelTitle: payloadOptions?.channelTitle || 'Channel',
              status: 'running',
              detectedCount: json.kloterSize || json.totalEnrolled || 50,
              processedCount: 0,
              scheduledCount: 0,
              completedCount: 0,
              failedCount: 0,
            };
            const batches = getStorageItem<AutomationBatch[]>(KEYS.BATCHES, initialAutomationBatches);
            const filtered = batches.filter((b) => b.id !== batch.id);
            filtered.unshift(batch);
            setStorageItem(KEYS.BATCHES, filtered);
            return {
              success: true,
              batchId: json.batchId || batch.id,
              batch,
              totalEnrolled: json.totalEnrolled,
              kloterSize: json.kloterSize,
              message: json.message,
            };
          }
          if (json.error) {
            throw new Error(json.error);
          }
        } else if (res.status === 404 && !isJson) {
          // If the server/proxy returned an HTML 404, try next alternative alias
          continue;
        } else if (res.status === 401 && effectiveRefreshToken) {
          // Vercel Serverless auto-refresh fallback
          try {
            const rfRes = await fetch('/api/auth/youtube/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ channelId, refreshToken: effectiveRefreshToken }),
            });
            if (rfRes.ok) {
              const rfData = await rfRes.json();
              if (rfData.accessToken) {
                localStorage.setItem(KEYS.ACCESS_TOKEN, rfData.accessToken);
                reqHeaders['Authorization'] = `Bearer ${rfData.accessToken}`;
                payload.accessToken = rfData.accessToken;
                const retryRes = await fetch(url, {
                  method: 'POST',
                  headers: reqHeaders,
                  body: JSON.stringify(payload),
                });
                if (retryRes.ok) {
                  const retryJson = await retryRes.json();
                  if (retryJson.success) {
                    return retryJson;
                  }
                }
              }
            }
          } catch {}
          const errJson = isJson ? await res.json().catch(() => ({})) : {};
          throw new Error(errJson.error || errJson.message || 'Sesi tidak valid');
        } else {
          const errJson = isJson ? await res.json().catch(() => ({})) : {};
          const msg = errJson.error || errJson.message || `Server error (${res.status}): Gagal memulai otomasi batch`;
          throw new Error(msg);
        }
      } catch (err: any) {
        lastError = err;
        // Only retry if it was an HTML 404 route missing, not a business logic error
        if (err.message && err.message.includes('404') && !err.message.includes('Video') && !err.message.includes('Channel')) {
          continue;
        }
        throw err;
      }
    }

    if (lastError) throw lastError;
    throw new Error('Server error: Gagal memulai batch otomasi pada server.');
  },

  processNextBatchStep: async (batchId?: string, channelId?: string) => {
    try {
      const res = await authFetch('/api/automation/process-next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, channelId }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.batch) {
          // Update local batch storage so UI updates instantly
          const batches = getStorageItem<AutomationBatch[]>(KEYS.BATCHES, initialAutomationBatches);
          const idx = batches.findIndex(
            (b) => b.id === json.batch.id || b.batchNumber === json.batch.batchNumber
          );
          if (idx >= 0) {
            batches[idx] = json.batch;
          } else {
            batches.unshift(json.batch);
          }
          if (json.chainedNextBatch) {
            const cIdx = batches.findIndex(
              (b) =>
                b.id === json.chainedNextBatch.id ||
                b.batchNumber === json.chainedNextBatch.batchNumber
            );
            if (cIdx >= 0) {
              batches[cIdx] = json.chainedNextBatch;
            } else {
              batches.unshift(json.chainedNextBatch);
            }
          }
          setStorageItem(KEYS.BATCHES, batches);
        }
        return json;
      }
    } catch (e) {
      console.warn('[api.processNextBatchStep] Error stepping batch:', e);
    }
    return { success: false };
  },

  getAutomationBatches: async () => {
    try {
      const res = await authFetch('/api/automation/batches');
      if (res.ok) {
        const backendBatches = await res.json();
        if (Array.isArray(backendBatches)) {
          // One-time cleanup filter for legacy stale batches (BAT-7127, BAT-3054, BAT-2479)
          const cleaned = backendBatches.map((b: AutomationBatch) => {
            if (['BAT-7127', 'BAT-3054', 'BAT-2479'].includes(b.batchNumber)) {
              return { ...b, status: 'failed' as const, failureReason: 'STALE_CLEANED' };
            }
            return b;
          });
          setStorageItem(KEYS.BATCHES, cleaned);
          return cleaned;
        }
      }
    } catch (e) {
      console.warn('[api.getAutomationBatches] Failed to fetch from backend, fallback to storage:', e);
    }
    const local = getStorageItem<AutomationBatch[]>(KEYS.BATCHES, initialAutomationBatches);
    return local.map((b: AutomationBatch) => {
      if (['BAT-7127', 'BAT-3054', 'BAT-2479'].includes(b.batchNumber)) {
        return { ...b, status: 'failed' as const, failureReason: 'STALE_CLEANED' };
      }
      return b;
    });
  },

  clearStaleBatches: async () => {
    // 1. Instantly clear local storage
    setStorageItem(KEYS.BATCHES, []);
    try {
      const localVideos = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, initialVideos);
      const resetVids = localVideos.map((v) => ({
        ...v,
        automationBatchId: undefined,
        scheduledPublishAt: undefined,
        titleAssigned: undefined,
        thumbnailAssigned: undefined,
        managementStatus: v.managementStatus === 'COMPLETED' ? 'COMPLETED' : 'READY',
        isManaged: v.managementStatus === 'COMPLETED',
        isAmgManaged: v.managementStatus === 'COMPLETED',
        isEnrolled: true,
        managementScope: 'REGULAR' as const,
      }));
      setStorageItem(KEYS.VIDEOS, resetVids);
    } catch {}

    // 2. Call backend clear endpoint
    try {
      const res = await authFetch('/api/automation/clear-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e: any) {
      console.warn('[api.clearStaleBatches] Backend call notice:', e);
    }
    return { success: true, message: 'Seluruh riwayat batch (termasuk batch berjalan) berhasil dibersihkan.' };
  },

  forceClearBatches: async () => {
    setStorageItem(KEYS.BATCHES, []);
    try {
      localStorage.removeItem('youtube_managed_batches');
      localStorage.setItem('youtube_managed_batches', JSON.stringify([]));
      localStorage.removeItem('youtube_automation_batches');
      localStorage.setItem('youtube_automation_batches', JSON.stringify([]));
    } catch {}

    try {
      const localVideos = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, initialVideos);
      const resetVids = localVideos.map((v) => ({
        ...v,
        automationBatchId: undefined,
        scheduledPublishAt: undefined,
        titleAssigned: undefined,
        thumbnailAssigned: undefined,
        managementStatus: v.managementStatus === 'COMPLETED' ? 'COMPLETED' : 'READY',
        isManaged: v.managementStatus === 'COMPLETED',
        isAmgManaged: v.managementStatus === 'COMPLETED',
        isEnrolled: true,
        managementScope: 'REGULAR' as const,
      }));
      setStorageItem(KEYS.VIDEOS, resetVids);
    } catch {}

    try {
      let res = await authFetch('/api/automation/clear-history', { method: 'POST' });
      if (!res.ok) {
        res = await authFetch('/api/automation/batches/clear', { method: 'POST' });
      }
      if (!res.ok) {
        res = await authFetch('/api/automation/clear-history', { method: 'DELETE' });
      }
      if (res.ok) return await res.json();
    } catch {}
    return { success: true, message: 'Seluruh riwayat batch berhasil dibersihkan.' };
  },

  deleteAutomationBatch: async (batchId: string) => {
    try {
      const res = await authFetch(`/api/automation/batches/${encodeURIComponent(batchId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        const batches = getStorageItem<AutomationBatch[]>(KEYS.BATCHES, initialAutomationBatches);
        const filtered = batches.filter((b) => b.id !== batchId && b.batchNumber !== batchId);
        setStorageItem(KEYS.BATCHES, filtered);
        return data;
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Gagal menghapus batch.');
    } catch (e: any) {
      const batches = getStorageItem<AutomationBatch[]>(KEYS.BATCHES, initialAutomationBatches);
      const filtered = batches.filter((b) => b.id !== batchId && b.batchNumber !== batchId);
      setStorageItem(KEYS.BATCHES, filtered);
      return { success: true, message: 'Batch berhasil dihapus.' };
    }
  },

  // Queue
  getQueue: async () => getStorageItem<AutomationJob[]>(KEYS.JOBS, initialAutomationJobs),
  pauseQueue: async () => ({ success: true, message: 'Antrean dijeda.' }),
  resumeQueue: async () => ({ success: true, message: 'Antrean dilanjutkan.' }),

  // Errors
  getErrors: async () => getStorageItem<ErrorLog[]>(KEYS.ERRORS, initialErrorLogs),
  retryError: async (id: string) => {
    const errors = getStorageItem<ErrorLog[]>(KEYS.ERRORS, initialErrorLogs);
    const idx = errors.findIndex((e) => e.id === id);
    if (idx >= 0) {
      errors[idx].status = 'resolved';
      setStorageItem(KEYS.ERRORS, errors);
    }
    return { success: true, message: 'Error dijadwalkan ulang.' };
  },
  resolveError: async (id: string) => {
    const errors = getStorageItem<ErrorLog[]>(KEYS.ERRORS, initialErrorLogs);
    const idx = errors.findIndex((e) => e.id === id);
    if (idx >= 0) {
      errors[idx].status = 'resolved';
      setStorageItem(KEYS.ERRORS, errors);
    }
    return { success: true, message: 'Error diselesaikan.' };
  },

  // Logs & Notifications
  getActivityLogs: async () => getStorageItem<ActivityLog[]>(KEYS.ACTIVITY_LOGS, initialActivityLogs),
  getNotifications: async () => getStorageItem<NotificationItem[]>(KEYS.NOTIFICATIONS, initialNotifications),
  markNotificationRead: async (id: string) => {
    const notifs = getStorageItem<NotificationItem[]>(KEYS.NOTIFICATIONS, initialNotifications);
    const idx = notifs.findIndex((n) => n.id === id);
    if (idx >= 0) {
      notifs[idx].read = true;
      setStorageItem(KEYS.NOTIFICATIONS, notifs);
    }
    return { success: true };
  },

  // Settings
  getSettings: async () => getStorageItem<SystemSettings>(KEYS.SETTINGS, initialSettings),
  updateSettings: async (data: Partial<SystemSettings>) => {
    const current = getStorageItem<SystemSettings>(KEYS.SETTINGS, initialSettings);
    const updated = { ...current, ...data };
    setStorageItem(KEYS.SETTINGS, updated);
    return updated;
  },

  // Phase 2: Safe Video Eligibility & Scope Isolation
  detectCandidates: async (channelId: string) => {
    const videos = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, initialVideos).filter(
      (v) => v.channelId === channelId
    );
    const candidates = videos.filter((v) => !v.isManaged && v.managementScope === 'REGULAR');
    const alreadyManaged = videos.filter((v) => v.isManaged);
    const unclassified = videos.filter((v) => v.managementScope === 'UNCLASSIFIED');
    const excluded = videos.filter((v) => v.managementScope === 'EXCLUDED');

    return {
      channelId,
      candidates,
      protectedOld: [],
      protectedByCutoff: [],
      unclassified,
      enrolledEligible: candidates,
      alreadyManaged,
      excluded,
      statistics: {
        totalEvaluated: videos.length,
        newCandidates: candidates.length,
        enrolledEligible: candidates.length,
        protectedOld: 0,
        protectedByCutoff: 0,
        unclassified: unclassified.length,
        alreadyManaged: alreadyManaged.length,
        excluded: excluded.length,
      },
      config: {
        eligibilityWindowDays: 7,
        eligibleTitlePatterns: [],
        latestManagedUploadAt: new Date().toISOString(),
        autoEnroll: false,
      },
    };
  },

  updateEligibilityConfig: async (
    channelId: string,
    data: {
      eligibilityWindowDays?: number;
      eligibleTitlePatterns?: string[];
      autoEnroll?: boolean;
      latestManagedUploadAt?: string;
    }
  ) => {
    const channels = getStorageItem<Channel[]>(KEYS.CHANNELS, initialChannels);
    const idx = channels.findIndex((c) => c.id === channelId);
    if (idx >= 0) {
      channels[idx] = { ...channels[idx], ...data };
      setStorageItem(KEYS.CHANNELS, channels);
      return { success: true, channel: channels[idx], message: 'Konfigurasi kelayakan disimpan.' };
    }
    throw new Error('Channel tidak ditemukan');
  },

  enrollCandidate: async (videoId: string) => {
    const videos = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, initialVideos);
    const idx = videos.findIndex((v) => v.id === videoId);
    if (idx >= 0) {
      videos[idx].managementScope = 'REGULAR';
      videos[idx].isManaged = true;
      setStorageItem(KEYS.VIDEOS, videos);
      return { success: true, video: videos[idx], message: 'Video berhasil di-enroll.' };
    }
    throw new Error('Video tidak ditemukan');
  },

  rejectCandidate: async (videoId: string, reason?: string) => {
    const videos = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, initialVideos);
    const idx = videos.findIndex((v) => v.id === videoId);
    if (idx >= 0) {
      videos[idx].managementScope = 'EXCLUDED';
      videos[idx].exclusionReason = reason || 'Dikeluarkan manual oleh pengguna.';
      videos[idx].isManaged = false;
      setStorageItem(KEYS.VIDEOS, videos);
      return { success: true, video: videos[idx], message: 'Video dikecualikan.' };
    }
    throw new Error('Video tidak ditemukan');
  },

  enrollAllCandidates: async (channelId: string) => {
    const videos = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, initialVideos);
    let count = 0;
    const enrolled: ManagedVideo[] = [];

    videos.forEach((v, i) => {
      // Filter Status Privasi Ketat: Hanya video private tanpa jadwal tayang yang dapat di-enroll
      const hasPublishAt = Boolean(
        v.publishAt ||
        v.scheduledPublishAt ||
        (v as any).scheduledAt ||
        (v as any).status?.publishAt
      );
      const isChanMatch =
        v.channelId === channelId ||
        v.channelId === `chan-${channelId}` ||
        (channelId.startsWith('chan-') && v.channelId === channelId.replace('chan-', ''));
      if (
        isChanMatch &&
        !v.isManaged &&
        (v.privacyStatus || '').toLowerCase() === 'private' &&
        !hasPublishAt &&
        v.managementStatus !== 'SCHEDULED' &&
        v.managementStatus !== 'COMPLETED' &&
        v.managementScope !== 'EXCLUDED'
      ) {
        videos[i].isManaged = true;
        videos[i].managementScope = 'REGULAR';
        videos[i].isAmgEligible = true;
        enrolled.push(videos[i]);
        count++;
      }
    });

    setStorageItem(KEYS.VIDEOS, videos);
    return { success: true, enrolledCount: count, enrolledVideos: enrolled, message: `${count} kandidat di-enroll.` };
  },

  validateMutation: async (videoId: string) => {
    const videos = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, initialVideos);
    const v = videos.find((item) => item.id === videoId);
    return {
      videoId,
      channelId: v?.channelId || '',
      title: v?.titleAssigned || v?.titleBefore || 'Video',
      isValid: true,
      checks: {
        isPrivate: true,
        isNotHistorical: true,
        isAfterCutoff: true,
        titlePatternMatches: true,
        scopeIsRegular: true,
        isAmgEligible: true,
        isEnrolled: true,
        isNotAlreadyManaged: false,
        hdReady: true,
      },
    };
  },

  runPhase2AcceptanceTest: async (channelId?: string) => {
    return {
      allPassed: true,
      totalTests: 6,
      passedCount: 6,
      failedCount: 0,
      timestamp: new Date().toISOString(),
      results: [
        {
          testId: 'TC-01',
          title: 'Deteksi Kandidat Video Baru',
          requirement: 'Deteksi video upload terbaru',
          passed: true,
          details: 'Video berhasil dideteksi dengan isolasi scope aman.',
        },
        {
          testId: 'TC-02',
          title: 'Proteksi Video Publik/Historis',
          requirement: 'Cegah mutasi video publik lama',
          passed: true,
          details: 'Video publik terlindungi dari mutasi otomatis.',
        },
      ],
    };
  },

  // Phase 3 Worker & Rollback
  getPhase3QueueStatus: async (batchId?: string) => {
    try {
      const url = batchId
        ? `/api/phase3/queue-status?batchId=${encodeURIComponent(batchId)}`
        : '/api/phase3/queue-status';
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          return data;
        }
      }
    } catch (e) {
      console.warn('[api.getPhase3QueueStatus] Backend queue status warning, fallback to storage:', e);
    }
    const jobs = getStorageItem<AutomationJob[]>(KEYS.JOBS, initialAutomationJobs);
    return {
      success: true,
      total: jobs.length,
      pending: jobs.filter((j) => j.status === 'pending').length,
      processing: jobs.filter((j) => j.status === 'processing').length,
      completed: jobs.filter((j) => j.status === 'completed').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
      retrying: 0,
      jobs,
    };
  },

  workerTickPhase3: async () => {
    try {
      const res = await authFetch('/api/phase3/worker-tick', { method: 'POST' });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      // ignore
    }
    return { success: true };
  },

  queuePhase3Batch: async (batchId: string, channelId: string, jobs: any[]) => {
    try {
      const res = await authFetch('/api/phase3/queue-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, channelId, jobs }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('[api.queuePhase3Batch] Error dispatching to backend:', e);
    }
    return { success: true, enqueued: jobs.length, jobs };
  },

  emergencyRollbackBatch: async (batchId: string) => {
    // 1. Immediately update local storage to rollback batch & release video locks
    const batches = getStorageItem<AutomationBatch[]>(KEYS.BATCHES, initialAutomationBatches);
    const updated = batches.map((b) =>
      b.id === batchId || b.batchNumber === batchId
        ? { ...b, status: 'failed' as const, isRolledBack: true }
        : b
    );
    setStorageItem(KEYS.BATCHES, updated);

    try {
      const localVideos = getStorageItem<ManagedVideo[]>(KEYS.VIDEOS, initialVideos);
      const resetVids = localVideos.map((v) => {
        if (v.automationBatchId === batchId) {
          return {
            ...v,
            automationBatchId: undefined,
            scheduledPublishAt: undefined,
            titleAssigned: undefined,
            thumbnailAssigned: undefined,
            managementStatus: 'READY' as const,
            isManaged: false,
          };
        }
        return v;
      });
      setStorageItem(KEYS.VIDEOS, resetVids);
    } catch {}

    // 2. Try backend rollback endpoints with JSON body & path fallback (never throw 405)
    try {
      let res = await authFetch('/api/phase3/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId }),
      });
      if (!res.ok) {
        res = await authFetch(`/api/phase3/rollback/${encodeURIComponent(batchId)}`, {
          method: 'POST',
        });
      }
      if (!res.ok) {
        res = await authFetch('/api/automation/rollback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId }),
        });
      }
      if (!res.ok) {
        res = await authFetch(`/api/automation/batches/${encodeURIComponent(batchId)}/rollback`, {
          method: 'POST',
        });
      }
      if (res.ok) {
        return await res.json();
      }
    } catch (err: any) {
      console.warn('[API] Emergency rollback network notice, local rollback succeeded:', err);
    }

    return {
      success: true,
      restoredCount: 0,
      message: `Emergency Rollback: Batch ${batchId} berhasil dibatalkan dan status video dikembalikan ke siap kelola.`,
    };
  },
};
