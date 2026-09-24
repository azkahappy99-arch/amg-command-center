/**
 * Frontend API client communicating strictly with secure server-side endpoints.
 * Never performs direct YouTube OAuth or Firestore manipulation in the browser.
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

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

export const api = {
  // Stats & Dashboard
  getStats: () => fetchJson<{
    metrics: {
      totalChannels: number;
      connectedChannels: number;
      newVideos: number;
      hdReady: number;
      processing: number;
      scheduled: number;
      completedVideos: number;
      automationJobs: number;
      errors: number;
    };
    actionRequired: Array<{ id: string; type: 'warning' | 'error' | 'info'; title: string; description: string; link?: string }>;
    recentBatches: AutomationBatch[];
    recentActivity: ActivityLog[];
  }>('/stats'),

  // Channels
  getChannels: () => fetchJson<Channel[]>('/channels'),
  getChannel: (id: string) => fetchJson<Channel & { unmanagedVideoCount: number; recentVideos: ManagedVideo[]; recentJobs: AutomationJob[]; recentErrors: ErrorLog[] }>(`/channels/${id}`),
  addChannel: (data: Partial<Channel>) => fetchJson<Channel>('/channels', { method: 'POST', body: JSON.stringify(data) }),
  updateChannel: (id: string, data: Partial<Channel>) => fetchJson<Channel>(`/channels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteChannel: (id: string) => fetchJson<{ success: boolean }>(`/channels/${id}`, { method: 'DELETE' }),
  syncChannel: (id: string) => fetchJson<{
    success: boolean;
    readOnlyMode: boolean;
    channelId: string;
    channelTitle: string;
    youtubeChannelId: string;
    uploadPlaylistId?: string;
    syncTimestamp: string;
    detectedTotal: number;
    newUnmanaged: number;
    alreadyManaged: number;
    errors: number;
    hasLiveYouTubeApi: boolean;
    actualFetchedFromYouTube: number;
    sampleVideos?: Array<{
      id: string;
      title: string;
      privacyStatus: string;
      uploadStatus?: string;
      publishAt?: string;
      definition?: string;
      duration?: string;
      thumbnailUrl?: string;
    }>;
  }>(`/channels/${id}/sync`, { method: 'POST' }),

  testConnection: (id: string) => fetchJson<{
    channelId: string;
    channelTitle: string;
    youtubeChannelId: string;
    status: string;
    readOnlyMode: boolean;
    environment: {
      googleClientIdConfigured: boolean;
      googleClientSecretConfigured: boolean;
      youtubeApiKeyConfigured: boolean;
    };
    authStatus: {
      hasActiveOAuthToken: boolean;
      hasRefreshToken: boolean;
      accountEmail: string | null;
      expiresAt: string | null;
    };
    liveYouTubeProbe: {
      channelAccessible: boolean;
      liveVideosCount: number;
      error: string | null;
    };
  }>(`/channels/${id}/test-connection`),

  clearDemoData: () => fetchJson<{ success: boolean; message: string; report: any }>('/admin/clear-demo-data', { method: 'POST' }),

  // YouTube OAuth
  getYouTubeAuthUrl: (channelId: string, redirectUri?: string) =>
    fetchJson<{ url: string; configured: boolean; error?: string }>(
      `/auth/youtube/url?channelId=${encodeURIComponent(channelId)}${redirectUri ? `&redirectUri=${encodeURIComponent(redirectUri)}` : ''}`
    ),
  connectYouTubeCredentials: (data: { channelId: string; accessToken?: string; refreshToken?: string; accountEmail?: string }) =>
    fetchJson<{ success: boolean; message: string; channel?: any }>('/auth/youtube/connect-credentials', { method: 'POST', body: JSON.stringify(data) }),
  gisSyncChannel: (data: { channelId?: string; accessToken: string; channelData: any }) =>
    fetchJson<{ success: boolean; channel: Channel; message: string }>('/auth/youtube/gis-sync', { method: 'POST', body: JSON.stringify(data) }),

  // Content Profiles
  getContentProfiles: () => fetchJson<ContentProfile[]>('/content-profiles'),
  createContentProfile: (data: Partial<ContentProfile>) => fetchJson<ContentProfile>('/content-profiles', { method: 'POST', body: JSON.stringify(data) }),
  updateContentProfile: (id: string, data: Partial<ContentProfile>) => fetchJson<ContentProfile>(`/content-profiles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteContentProfile: (id: string) => fetchJson<{ success: boolean }>(`/content-profiles/${id}`, { method: 'DELETE' }),

  // Master Titles
  getMasterTitles: (profileId?: string) => fetchJson<MasterTitle[]>(`/master-titles${profileId ? `?profileId=${profileId}` : ''}`),
  createMasterTitle: (data: Partial<MasterTitle>) => fetchJson<MasterTitle>('/master-titles', { method: 'POST', body: JSON.stringify(data) }),
  updateMasterTitle: (id: string, data: Partial<MasterTitle>) => fetchJson<MasterTitle>(`/master-titles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMasterTitle: (id: string) => fetchJson<{ success: boolean }>(`/master-titles/${id}`, { method: 'DELETE' }),

  // Master Thumbnails
  getMasterThumbnails: (profileId?: string) => fetchJson<MasterThumbnail[]>(`/master-thumbnails${profileId ? `?profileId=${profileId}` : ''}`),
  createMasterThumbnail: (data: Partial<MasterThumbnail>) => fetchJson<MasterThumbnail>('/master-thumbnails', { method: 'POST', body: JSON.stringify(data) }),
  deleteMasterThumbnail: (id: string) => fetchJson<{ success: boolean }>(`/master-thumbnails/${id}`, { method: 'DELETE' }),

  // Dynamic Rotation Matrix Preview
  getRotationMatrix: (profileId?: string, count?: number) =>
    fetchJson<{
      titleCount: number;
      thumbnailCount: number;
      totalVideosPreviewed: number;
      matrix: Array<{
        videoIndex: number;
        titleIndex: number;
        thumbnailIndex: number;
        title: MasterTitle;
        thumbnail: MasterThumbnail;
      }>;
    }>(`/rotation/matrix?${profileId ? `profileId=${profileId}&` : ''}count=${count || 12}`),

  // Videos
  getVideos: (params?: { channelId?: string; status?: string; isManaged?: boolean; scope?: string }) => {
    const q = new URLSearchParams();
    if (params?.channelId) q.set('channelId', params.channelId);
    if (params?.status) q.set('status', params.status);
    if (params?.isManaged !== undefined) q.set('isManaged', String(params.isManaged));
    if (params?.scope) q.set('scope', params.scope);
    return fetchJson<ManagedVideo[]>(`/videos?${q.toString()}`);
  },

  updateVideoScope: (id: string, data: { managementScope: 'REGULAR' | 'EXCLUDED' | 'UNCLASSIFIED'; exclusionReason?: string }) =>
    fetchJson<{ success: boolean; video: ManagedVideo; message: string }>(`/videos/${id}/scope`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  bulkUpdateVideoScope: (data: { videoIds: string[]; managementScope: 'REGULAR' | 'EXCLUDED' | 'UNCLASSIFIED'; exclusionReason?: string }) =>
    fetchJson<{ success: boolean; updatedCount: number; videos: ManagedVideo[]; message: string }>('/videos/bulk-scope', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getChannelScopeSummary: (channelId: string) =>
    fetchJson<{ channelId: string; channelTitle: string; summary: { includedCount: number; excludedCount: number; needsScopeAssignmentCount: number; totalDetected: number } }>(
      `/channels/${channelId}/scope-summary`
    ),

  // Scheduler
  updateChannelScheduleConfig: (channelId: string, data: { scheduleConfig?: ScheduleConfig; useProfileSchedule?: boolean }) =>
    fetchJson<{ success: boolean; channel: Channel; resolvedScheduleConfig: ScheduleConfig; message: string }>(
      `/channels/${channelId}/schedule-config`,
      { method: 'PUT', body: JSON.stringify(data) }
    ),

  validateSchedule: (config: Partial<ScheduleConfig>) =>
    fetchJson<ScheduleValidationResult>('/schedule/validate', { method: 'POST', body: JSON.stringify({ config }) }),

  previewSchedule: (params: { count?: number; config?: ScheduleConfig; channelId?: string; profileId?: string }) =>
    fetchJson<{
      success: boolean;
      config: ScheduleConfig;
      latestScheduledPublishAt?: string;
      occupiedSlotsCount: number;
      slots: Array<{
        index: number;
        dateString: string;
        timeString: string;
        isoPublishAt: string;
        formattedDisplay: string;
        timezone: string;
        timezoneAbbreviation: string;
      }>;
    }>('/schedule/preview', { method: 'POST', body: JSON.stringify(params) }),

  getScheduleReconciliation: (channelId: string) => fetchJson<{
    channelId: string;
    channelTitle: string;
    timezone: string;
    storedCursorPublishAt?: string;
    verifiedYouTubePublishAt?: string;
    sourceOfTruthPublishAt?: string;
    nextScheduleSlots: Array<{
      index: number;
      dateString: string;
      timeString: string;
      isoPublishAt: string;
      formattedDisplay: string;
    }>;
  }>(`/scheduler/reconcile/${channelId}`),

  // Automation
  getAutomationPreview: (channelId: string, profileId?: string) =>
    fetchJson<{
      success: boolean;
      preview: AutomationPreviewItem[];
      channelTitle: string;
      profileName: string;
      unmanagedCount: number;
      scopeSummary?: AutomationScopeSummary;
    }>('/automation/preview', {
      method: 'POST',
      body: JSON.stringify({ channelId, profileId }),
    }),

  executeDryRun: (channelId: string, profileId?: string) =>
    fetchJson<{ success: boolean; batch: AutomationBatch }>('/automation/dry-run', {
      method: 'POST',
      body: JSON.stringify({ channelId, profileId }),
    }),

  startBatchAutomation: (channelId: string, profileId?: string) =>
    fetchJson<{ success: boolean; batch: AutomationBatch }>('/automation/start', {
      method: 'POST',
      body: JSON.stringify({ channelId, profileId }),
    }),

  getAutomationBatches: () => fetchJson<AutomationBatch[]>('/automation/batches'),

  // Queue
  getQueue: () => fetchJson<AutomationJob[]>('/queue'),
  pauseQueue: () => fetchJson<{ success: boolean; message: string }>('/queue/pause', { method: 'POST' }),
  resumeQueue: () => fetchJson<{ success: boolean; message: string }>('/queue/resume', { method: 'POST' }),

  // Errors
  getErrors: () => fetchJson<ErrorLog[]>('/errors'),
  retryError: (id: string) => fetchJson<{ success: boolean; message: string }>(`/errors/${id}/retry`, { method: 'POST' }),
  resolveError: (id: string) => fetchJson<{ success: boolean; message: string }>(`/errors/${id}/resolve`, { method: 'POST' }),

  // Logs & Notifications
  getActivityLogs: () => fetchJson<ActivityLog[]>('/activity-logs'),
  getNotifications: () => fetchJson<NotificationItem[]>('/notifications'),
  markNotificationRead: (id: string) => fetchJson<{ success: boolean }>(`/notifications/${id}/read`, { method: 'POST' }),

  // Settings
  getSettings: () => fetchJson<SystemSettings>('/settings'),
  updateSettings: (data: Partial<SystemSettings>) => fetchJson<SystemSettings>('/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // Phase 2: Safe Video Eligibility & Scope Isolation
  detectCandidates: (channelId: string) =>
    fetchJson<{
      channelId: string;
      candidates: ManagedVideo[];
      protectedOld: ManagedVideo[];
      protectedByCutoff: ManagedVideo[];
      unclassified: ManagedVideo[];
      enrolledEligible: ManagedVideo[];
      alreadyManaged: ManagedVideo[];
      excluded: ManagedVideo[];
      statistics: {
        totalEvaluated: number;
        newCandidates: number;
        enrolledEligible: number;
        protectedOld: number;
        protectedByCutoff: number;
        unclassified: number;
        alreadyManaged: number;
        excluded: number;
      };
      config: {
        eligibilityWindowDays: number;
        eligibleTitlePatterns: string[];
        latestManagedUploadAt: string | null;
        autoEnroll: boolean;
      };
    }>(`/channels/${channelId}/detect-candidates`, { method: 'POST' }),

  updateEligibilityConfig: (
    channelId: string,
    data: {
      eligibilityWindowDays?: number;
      eligibleTitlePatterns?: string[];
      autoEnroll?: boolean;
      latestManagedUploadAt?: string;
    }
  ) => fetchJson<{ success: boolean; channel: Channel; message: string }>(`/channels/${channelId}/eligibility-config`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  enrollCandidate: (videoId: string) =>
    fetchJson<{ success: boolean; video: ManagedVideo; message: string }>(`/videos/${videoId}/enroll`, {
      method: 'POST',
    }),

  rejectCandidate: (videoId: string, reason?: string) =>
    fetchJson<{ success: boolean; video: ManagedVideo; message: string }>(`/videos/${videoId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  enrollAllCandidates: (channelId: string) =>
    fetchJson<{ success: boolean; enrolledCount: number; enrolledVideos: ManagedVideo[]; message: string }>(
      `/channels/${channelId}/enroll-all-candidates`,
      { method: 'POST' }
    ),

  validateMutation: (videoId: string) =>
    fetchJson<{
      videoId: string;
      channelId: string;
      title: string;
      isValid: boolean;
      reason?: string;
      checks: {
        isPrivate: boolean;
        isNotHistorical: boolean;
        isAfterCutoff: boolean;
        titlePatternMatches: boolean;
        scopeIsRegular: boolean;
        isAmgEligible: boolean;
        isEnrolled: boolean;
        isNotAlreadyManaged: boolean;
        hdReady: boolean;
      };
    }>(`/videos/${videoId}/validate-mutation`, { method: 'POST' }),

  runPhase2AcceptanceTest: (channelId?: string) =>
    fetchJson<{
      allPassed: boolean;
      totalTests: number;
      passedCount: number;
      failedCount: number;
      timestamp: string;
      results: Array<{
        testId: string;
        title: string;
        requirement: string;
        passed: boolean;
        details: string;
        data?: any;
      }>;
    }>('/test/phase2-acceptance', {
      method: 'POST',
      body: JSON.stringify({ channelId }),
    }),

  // Phase 3 Worker & Rollback
  getPhase3QueueStatus: (batchId?: string) =>
    fetchJson<{
      success: boolean;
      total: number;
      pending: number;
      processing: number;
      completed: number;
      failed: number;
      retrying: number;
      jobs: any[];
    }>(`/phase3/queue-status${batchId ? `?batchId=${encodeURIComponent(batchId)}` : ''}`),

  queuePhase3Batch: (batchId: string, channelId: string, jobs: any[]) =>
    fetchJson<{ success: boolean; enqueued: number; jobs: any[] }>('/phase3/queue-batch', {
      method: 'POST',
      body: JSON.stringify({ batchId, channelId, jobs }),
    }),

  emergencyRollbackBatch: (batchId: string) =>
    fetchJson<{ success: boolean; message: string; restoredCount: number }>(`/phase3/rollback/${encodeURIComponent(batchId)}`, {
      method: 'POST',
    }),
};
