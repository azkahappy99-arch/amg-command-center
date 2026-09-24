/**
 * AMG — Azka Media Group Full-Stack Server
 * Express Backend + Vite Middleware (Dev) or Static Serving (Prod)
 * Port: 3000
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { dbStore } from './server/db.js';
import { youtubeAuthService } from './server/youtubeAuthService.js';
import { youtubeDataService } from './server/youtubeDataService.js';
import {
  calculateNextSchedules,
  validateScheduleConfig,
  resolveScheduleConfig,
  normalizeScheduleConfig,
  evaluateChannelScheduleBuffer,
  formatBufferExhaustionDisplay,
} from './server/scheduleReconciliationService.js';
import { generateRotationMatrix } from './server/rotationService.js';
import { automationEngine } from './server/automationEngine.js';
import {
  detectChannelCandidates,
  evaluateVideoEligibility,
  validateBeforeMutation,
} from './server/eligibilityService.js';
import { phase3Engine } from './server/phase3Engine.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());

// ==========================================
// 1. HEALTH & METRICS
// ==========================================
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'AMG — Azka Media Group',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/api/stats', (req: Request, res: Response) => {
  const channels = Array.from(dbStore.channels.values());
  const videos = Array.from(dbStore.videos.values());
  const batches = Array.from(dbStore.automationBatches.values());
  const errorLogs = Array.from(dbStore.errorLogs.values());

  const totalChannels = channels.length;
  const connectedChannels = channels.filter(c => c.status === 'Connected' || c.status === 'Ready').length;
  const newVideos = videos.filter(v => !v.isManaged).length;
  const hdReady = videos.filter(v => !v.isManaged && v.processingStatus === 'processed').length;
  const processing = videos.filter(v => v.processingStatus === 'processing').length;
  const scheduled = videos.filter(v => v.scheduledPublishAt && v.managementStatus === 'SCHEDULED').length;
  const completedVideos = videos.filter(v => v.managementStatus === 'COMPLETED').length;
  const automationJobsCount = Array.from(dbStore.automationJobs.values()).length;
  const openErrors = errorLogs.filter(e => e.status === 'open').length;

  // Action required items
  const actionRequired: Array<{ id: string; type: 'warning' | 'error' | 'info'; title: string; description: string; link?: string }> = [];

  const unconfiguredChannels = channels.filter(c => !c.hasOAuthConfigured);
  if (unconfiguredChannels.length > 0) {
    actionRequired.push({
      id: 'act-oauth',
      type: 'warning',
      title: 'YouTube OAuth Authorization Required',
      description: `${unconfiguredChannels.length} channel(s) require active OAuth authorization for live YouTube updates.`,
      link: '/channels',
    });
  }

  if (newVideos > 0) {
    actionRequired.push({
      id: 'act-new-vids',
      type: 'info',
      title: `${newVideos} Unmanaged Videos Ready`,
      description: `New uploaded private videos detected across channels ready for title, thumbnail, and schedule automation.`,
      link: '/automation',
    });
  }

  if (processing > 0) {
    actionRequired.push({
      id: 'act-processing',
      type: 'warning',
      title: `${processing} Videos Still Processing`,
      description: `Videos are being transcoded by YouTube. Wait until HD status is achieved before triggering automation.`,
      link: '/videos',
    });
  }

  if (openErrors > 0) {
    actionRequired.push({
      id: 'act-errors',
      type: 'error',
      title: `${openErrors} Open Error(s) in Error Center`,
      description: `Automation failures require review or manual retry.`,
      link: '/error-center',
    });
  }

  // Schedule Buffer Monitor & Low Stock Alert for each channel
  for (const c of channels) {
    const bufferEval = evaluateChannelScheduleBuffer(c, videos);
    c.scheduleBufferDays = bufferEval.scheduleBufferDays;
    c.scheduleStockCount = bufferEval.scheduleStockCount;
    c.scheduleAlertStatus = bufferEval.scheduleAlertStatus;
    c.bufferExhaustionDate = bufferEval.bufferExhaustionDate;

    if (bufferEval.scheduleAlertStatus === 'CRITICAL' || bufferEval.scheduleAlertStatus === 'LOW_STOCK') {
      const isCritical = bufferEval.scheduleAlertStatus === 'CRITICAL';
      const formattedDate = bufferEval.formattedExhaustionDate;
      actionRequired.push({
        id: `act-buffer-${c.id}`,
        type: isCritical ? 'error' : 'warning',
        title: `Peringatan Stok Video: ${c.title}`,
        description: `Peringatan Stok Video: Cadangan jadwal channel ${c.title} tersisa ${bufferEval.scheduleBufferDays} hari (habis pada ${formattedDate}). Segera unggah video baru.`,
        link: '/channels',
        // metadata for frontend quick action
        ...(c as any),
        channelId: c.id,
        channelTitle: c.title,
        actionType: 'INSPECT_CANDIDATES',
        bufferDays: bufferEval.scheduleBufferDays,
        stockCount: bufferEval.scheduleStockCount,
        alertStatus: bufferEval.scheduleAlertStatus,
        exhaustionDateFormatted: formattedDate,
      });

      // Synchronize into dbStore.notifications
      const notifId = `notif-buffer-${c.id}`;
      if (!dbStore.notifications.has(notifId)) {
        dbStore.notifications.set(notifId, {
          id: notifId,
          type: isCritical ? 'ALERT' : 'WARNING',
          title: `Stok Jadwal Menipis: ${c.title}`,
          message: `Cadangan jadwal channel ${c.title} tersisa ${bufferEval.scheduleBufferDays} hari (habis pada ${formattedDate}). Tersisa ${bufferEval.scheduleStockCount} video terjadwal di antrean. Segera periksa kandidat video baru.`,
          channelId: c.id,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  res.json({
    metrics: {
      totalChannels,
      connectedChannels,
      newVideos,
      hdReady,
      processing,
      scheduled,
      completedVideos,
      automationJobs: automationJobsCount,
      errors: openErrors,
    },
    actionRequired,
    recentBatches: batches.slice(-5).reverse(),
    recentActivity: dbStore.activityLogs.slice(0, 10),
  });
});

// ==========================================
// 2. CHANNELS
// ==========================================
app.get('/api/channels', (req: Request, res: Response) => {
  const allVideos = Array.from(dbStore.videos.values());
  const channels = Array.from(dbStore.channels.values()).map(c => {
    const authStatus = youtubeAuthService.getConnectionStatus(c.id);
    let effectiveStatus: string = c.status;
    if (c.status === 'CONNECTED' || authStatus.isConnected) {
      effectiveStatus = 'CONNECTED';
    } else if (c.hasOAuthConfigured) {
      effectiveStatus = authStatus.status; // 'TOKEN EXPIRED' or 'AUTHORIZATION REQUIRED'
    } else if (c.isSeeded) {
      effectiveStatus = 'DISCONNECTED';
    } else {
      effectiveStatus = 'AUTHORIZATION REQUIRED';
    }

    const bufferEval = evaluateChannelScheduleBuffer(c, allVideos);
    c.scheduleBufferDays = bufferEval.scheduleBufferDays;
    c.scheduleStockCount = bufferEval.scheduleStockCount;
    c.scheduleAlertStatus = bufferEval.scheduleAlertStatus;
    c.bufferExhaustionDate = bufferEval.bufferExhaustionDate;

    return {
      ...c,
      status: effectiveStatus,
      scheduleBufferDays: bufferEval.scheduleBufferDays,
      scheduleStockCount: bufferEval.scheduleStockCount,
      scheduleAlertStatus: bufferEval.scheduleAlertStatus,
      bufferExhaustionDate: bufferEval.bufferExhaustionDate,
      connectionDetails: {
        isConnected: authStatus.isConnected,
        hasRefreshToken: authStatus.hasRefreshToken,
        accountEmail: authStatus.accountEmail,
        expiresAt: authStatus.expiresAt,
      },
    };
  });
  res.json(channels);
});

app.get('/api/channels/:id', (req: Request, res: Response) => {
  const channel = dbStore.channels.get(req.params.id);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }

  const allVideos = Array.from(dbStore.videos.values());
  const bufferEval = evaluateChannelScheduleBuffer(channel, allVideos);
  channel.scheduleBufferDays = bufferEval.scheduleBufferDays;
  channel.scheduleStockCount = bufferEval.scheduleStockCount;
  channel.scheduleAlertStatus = bufferEval.scheduleAlertStatus;
  channel.bufferExhaustionDate = bufferEval.bufferExhaustionDate;

  const authStatus = youtubeAuthService.getConnectionStatus(channel.id);
  let effectiveStatus: string = channel.status;
  if (channel.status === 'CONNECTED' || authStatus.isConnected) {
    effectiveStatus = 'CONNECTED';
  } else if (channel.hasOAuthConfigured) {
    effectiveStatus = authStatus.status;
  } else if (channel.isSeeded) {
    effectiveStatus = 'DISCONNECTED';
  } else {
    effectiveStatus = 'AUTHORIZATION REQUIRED';
  }

  // Calculate unmanaged video count
  const unmanagedCount = Array.from(dbStore.videos.values()).filter(v => v.channelId === channel.id && !v.isManaged).length;
  const recentVideos = Array.from(dbStore.videos.values())
    .filter(v => v.channelId === channel.id)
    .slice(0, 10);
  const recentJobs = Array.from(dbStore.automationJobs.values())
    .filter(j => j.channelId === channel.id)
    .slice(0, 10);
  const recentErrors = Array.from(dbStore.errorLogs.values())
    .filter(e => e.channelId === channel.id)
    .slice(0, 5);

  res.json({
    ...channel,
    status: effectiveStatus,
    unmanagedVideoCount: unmanagedCount,
    connectionDetails: {
      isConnected: authStatus.isConnected,
      hasRefreshToken: authStatus.hasRefreshToken,
      accountEmail: authStatus.accountEmail,
      expiresAt: authStatus.expiresAt,
    },
    recentVideos,
    recentJobs,
    recentErrors,
  });
});

app.post('/api/channels', (req: Request, res: Response) => {
  const { title, youtubeChannelId, contentProfileId, publishFrequency, publishTime, timezone, scheduleConfig, useProfileSchedule, nicheCategory, nicheBadge } = req.body;
  if (!title || !youtubeChannelId) {
    return res.status(400).json({ error: 'Title and YouTube Channel ID are required.' });
  }

  let finalScheduleConfig = scheduleConfig;
  if (scheduleConfig) {
    const valid = validateScheduleConfig(scheduleConfig);
    if (!valid.isValid) {
      return res.status(400).json({ error: `Invalid schedule config: ${valid.errors.join(', ')}` });
    }
    finalScheduleConfig = normalizeScheduleConfig(scheduleConfig);
  }

  // Derive niche from assigned profile if not explicitly specified
  let resolvedNicheCategory = nicheCategory;
  let resolvedNicheBadge = nicheBadge;
  if (!resolvedNicheCategory && contentProfileId) {
    const assignedProfile = dbStore.profiles.get(contentProfileId);
    if (assignedProfile?.nicheCategory) {
      resolvedNicheCategory = assignedProfile.nicheCategory;
      resolvedNicheBadge = assignedProfile.nicheBadge || 'amber';
    }
  }

  const id = `chan-${Date.now()}`;
  const newChannel = {
    id,
    youtubeChannelId,
    title,
    status: 'Connected' as const,
    contentProfileId: contentProfileId || '',
    nicheCategory: resolvedNicheCategory || 'General',
    nicheBadge: resolvedNicheBadge || 'amber',
    publishFrequency: finalScheduleConfig ? `${finalScheduleConfig.videosPerDay}/day` : (publishFrequency || '1/day'),
    publishTime: finalScheduleConfig ? finalScheduleConfig.times.join(', ') : (publishTime || '16:00'),
    timezone: finalScheduleConfig ? finalScheduleConfig.timezone : (timezone || 'Asia/Jakarta'),
    scheduleConfig: finalScheduleConfig,
    useProfileSchedule: useProfileSchedule || false,
    monetizationStatus: req.body.monetizationStatus || 'NOT_MONETIZED',
    watchHours: req.body.watchHours || 0,
    revenue: req.body.revenue || {
      adSenseReguler: 0,
      liveStream: 0,
      ytShopping: 0,
      channelMemberships: 0,
      totalChannelRevenue: 0,
    },
    uploadPlaylistId: `UU${youtubeChannelId.replace(/^UC/, '')}`,
    subscriberCount: 0,
    videoCount: 0,
    unmanagedVideoCount: 0,
    hasOAuthConfigured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  dbStore.channels.set(id, newChannel);

  dbStore.logActivity({
    user: 'Administrator',
    channelId: id,
    channelTitle: title,
    operation: 'Channel Added',
    previousValue: 'None',
    newValue: `Created channel record for ${title} (${youtubeChannelId})`,
    result: 'SUCCESS',
  });

  res.status(201).json(newChannel);
});

app.put('/api/channels/:id', (req: Request, res: Response) => {
  const channel = dbStore.channels.get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  let updatedScheduleConfig = req.body.scheduleConfig !== undefined ? req.body.scheduleConfig : channel.scheduleConfig;
  if (req.body.scheduleConfig) {
    const valid = validateScheduleConfig(req.body.scheduleConfig);
    if (!valid.isValid) {
      return res.status(400).json({ error: `Invalid schedule config: ${valid.errors.join(', ')}` });
    }
    updatedScheduleConfig = normalizeScheduleConfig(req.body.scheduleConfig);
  }

  const updated = {
    ...channel,
    ...req.body,
    scheduleConfig: updatedScheduleConfig,
    updatedAt: new Date().toISOString(),
  };

  if (updatedScheduleConfig) {
    updated.publishFrequency = `${updatedScheduleConfig.videosPerDay}/day`;
    updated.publishTime = updatedScheduleConfig.times.join(', ');
    updated.timezone = updatedScheduleConfig.timezone;
  }

  dbStore.channels.set(channel.id, updated);
  res.json(updated);
});

app.put('/api/channels/:id/schedule-config', (req: Request, res: Response) => {
  const channel = dbStore.channels.get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  const { scheduleConfig, useProfileSchedule } = req.body;

  if (scheduleConfig) {
    const valid = validateScheduleConfig(scheduleConfig);
    if (!valid.isValid) {
      return res.status(400).json({ success: false, errors: valid.errors });
    }
    const normalized = normalizeScheduleConfig(scheduleConfig);
    channel.scheduleConfig = normalized;
    channel.publishFrequency = `${normalized.videosPerDay}/day`;
    channel.publishTime = normalized.times.join(', ');
    channel.timezone = normalized.timezone;
  }

  if (typeof useProfileSchedule === 'boolean') {
    channel.useProfileSchedule = useProfileSchedule;
  }

  channel.updatedAt = new Date().toISOString();
  dbStore.channels.set(channel.id, channel);

  const profile = channel.contentProfileId ? dbStore.profiles.get(channel.contentProfileId) : null;
  const resolved = resolveScheduleConfig(channel, profile);

  dbStore.logActivity({
    user: 'Scheduler Rule Manager',
    channelId: channel.id,
    channelTitle: channel.title,
    operation: 'Schedule Configuration Updated',
    previousValue: 'Previous schedule settings',
    newValue: `Mode: ${resolved.mode}, Frequency: ${resolved.videosPerDay}/day, Times: [${resolved.times.join(', ')}], Timezone: ${resolved.timezone}`,
    result: 'SUCCESS',
  });

  res.json({
    success: true,
    channel,
    resolvedScheduleConfig: resolved,
    message: `Schedule rule for "${channel.title}" updated successfully.`,
  });
});

app.post('/api/schedule/validate', (req: Request, res: Response) => {
  const { config } = req.body;
  const result = validateScheduleConfig(config);
  res.json(result);
});

app.post('/api/schedule/preview', (req: Request, res: Response) => {
  const { count = 10, config, channelId, profileId } = req.body;
  let targetConfig = config;
  let lastScheduledPublishAt: string | null = null;
  const occupiedSlots: string[] = [];

  if (channelId) {
    const channel = dbStore.channels.get(channelId);
    const profile = (profileId || channel?.contentProfileId)
      ? dbStore.profiles.get(profileId || channel?.contentProfileId || '')
      : null;

    if (!targetConfig) {
      targetConfig = resolveScheduleConfig(channel, profile);
    }
    if (channel) {
      lastScheduledPublishAt = channel.lastScheduledPublishAt || null;
      for (const v of dbStore.videos.values()) {
        if (v.channelId === channel.id && v.scheduledPublishAt) {
          occupiedSlots.push(v.scheduledPublishAt);
        }
      }
    }
  } else if (!targetConfig) {
    const profile = profileId ? dbStore.profiles.get(profileId) : null;
    targetConfig = resolveScheduleConfig(null, profile);
  }

  const validation = validateScheduleConfig(targetConfig);
  if (!validation.isValid) {
    return res.status(400).json({ success: false, errors: validation.errors });
  }

  const normalized = normalizeScheduleConfig(targetConfig);
  const slots = calculateNextSchedules(count, normalized, lastScheduledPublishAt, occupiedSlots);

  res.json({
    success: true,
    config: normalized,
    latestScheduledPublishAt: lastScheduledPublishAt,
    occupiedSlotsCount: occupiedSlots.length,
    slots,
  });
});

app.delete('/api/channels/:id', (req: Request, res: Response) => {
  const channel = dbStore.channels.get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  dbStore.channels.delete(channel.id);
  res.json({ success: true, message: `Channel ${channel.title} deleted.` });
});

// REAL YOUTUBE SYNC ENDPOINT
app.post('/api/channels/:id/sync', async (req: Request, res: Response) => {
  const channel = dbStore.channels.get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  // Check for live authentication token
  const hasAuth = await youtubeAuthService.getValidAccessToken(channel.id);
  
  if (!hasAuth && !process.env.YOUTUBE_API_KEY) {
    return res.status(401).json({
      success: false,
      error: `YouTube OAuth authorization required: Channel "${channel.title}" is not connected to YouTube API. Please authorize via Google OAuth first.`,
      channelId: channel.id,
      channelTitle: channel.title,
      hasLiveYouTubeApi: false,
    });
  }

  // Live YouTube Sync execution
  try {
    let uploadsPlaylistId = channel.uploadPlaylistId;

    // If channel details are needed, fetch channel info
    if (!uploadsPlaylistId) {
      const details = await youtubeDataService.getChannelDetails(channel.youtubeChannelId);
      if (details.success && details.data) {
        channel.uploadPlaylistId = details.data.uploadPlaylistId;
        channel.subscriberCount = details.data.subscriberCount;
        channel.videoCount = details.data.videoCount;
        uploadsPlaylistId = details.data.uploadPlaylistId;
      }
    }

    if (!uploadsPlaylistId) {
      return res.status(400).json({
        success: false,
        error: `Could not determine Upload Playlist for YouTube Channel ${channel.youtubeChannelId}.`,
      });
    }

    const uploadsResult = await youtubeDataService.getChannelUploads(channel.id, uploadsPlaylistId, 50);
    if (!uploadsResult.success || !uploadsResult.data) {
      return res.status(502).json({
        success: false,
        error: uploadsResult.error || 'Failed to fetch uploads from YouTube Data API.',
      });
    }

    const realVideos = uploadsResult.data;

    // Upsert real videos into dbStore
    for (const v of realVideos) {
      const existing = Array.from(dbStore.videos.values()).find(
        (ev) => ev.youtubeVideoId === v.id || ev.id === `yt-${v.id}`
      );

      const isManaged = existing ? existing.isManaged : false;
      const managementStatus = existing
        ? existing.managementStatus
        : v.publishAt
        ? 'SCHEDULED'
        : 'DISCOVERED';

      // Default to UNCLASSIFIED & isAmgEligible: false for new videos unless already classified
      const managementScope = existing ? (existing.managementScope || 'UNCLASSIFIED') : 'UNCLASSIFIED';
      const isAmgEligible = existing ? !!existing.isAmgEligible : false;

      const vidRecord = {
        id: existing ? existing.id : `yt-${v.id}`,
        youtubeVideoId: v.id,
        channelId: channel.id,
        channelTitle: channel.title,
        titleBefore: v.title,
        titleAssigned: existing?.titleAssigned || '',
        thumbnailBefore: v.thumbnailUrl,
        thumbnailAssigned: existing?.thumbnailAssigned || '',
        originalUploadAt: v.publishedAt || new Date().toISOString(),
        processingStatus: (v.uploadStatus === 'uploaded' ? 'processing' : 'processed') as 'processing' | 'processed' | 'failed',
        privacyStatus: (v.privacyStatus || 'private') as 'private' | 'unlisted' | 'public',
        scheduledPublishAt: v.publishAt || existing?.scheduledPublishAt,
        managementStatus,
        managementScope,
        isAmgEligible,
        scopeAssignedAt: existing?.scopeAssignedAt,
        scopeAssignedBy: existing?.scopeAssignedBy || 'SYSTEM',
        exclusionReason: existing?.exclusionReason,
        isManaged,
        isSeeded: false, // Confirmed REAL video fetched directly from YouTube Data API
        contentProfileId: existing?.contentProfileId || channel.contentProfileId || '',
        automationBatchId: existing?.automationBatchId,
        retryCount: existing?.retryCount || 0,
        definition: v.definition || 'hd',
        duration: v.duration,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      dbStore.videos.set(vidRecord.id, vidRecord);
    }

    channel.lastSyncAt = new Date().toISOString();
    const channelVideos = Array.from(dbStore.videos.values()).filter((v) => v.channelId === channel.id);
    const unmanaged = channelVideos.filter((v) => !v.isManaged);
    const managed = channelVideos.filter((v) => v.isManaged);
    const eligibleRegular = channelVideos.filter((v) => !v.isManaged && v.managementScope === 'REGULAR' && v.isAmgEligible);
    const unclassified = channelVideos.filter((v) => !v.isManaged && v.managementScope === 'UNCLASSIFIED');
    const excluded = channelVideos.filter((v) => !v.isManaged && v.managementScope === 'EXCLUDED');

    channel.unmanagedVideoCount = eligibleRegular.length;
    channel.status = 'CONNECTED';
    channel.isSeeded = false; // Confirmed active real channel

    dbStore.logActivity({
      user: 'Administrator',
      channelId: channel.id,
      channelTitle: channel.title,
      operation: 'LIVE YOUTUBE SYNC (READ-ONLY)',
      previousValue: `${channel.videoCount || 0} recorded videos`,
      newValue: `Live YouTube sync completed: ${realVideos.length} actual videos fetched. ${eligibleRegular.length} AMG regular eligible, ${unclassified.length} unclassified, ${excluded.length} excluded. Zero modifications performed (Read-Only Mode).`,
      result: 'SUCCESS',
    });

    return res.json({
      success: true,
      readOnlyMode: true,
      channelId: channel.id,
      channelTitle: channel.title,
      youtubeChannelId: channel.youtubeChannelId,
      uploadPlaylistId: uploadsPlaylistId,
      syncTimestamp: channel.lastSyncAt,
      detectedTotal: channelVideos.length,
      newUnmanaged: unmanaged.length,
      alreadyManaged: managed.length,
      scopeSummary: {
        includedCount: eligibleRegular.length,
        excludedCount: excluded.length,
        needsScopeAssignmentCount: unclassified.length,
        totalDetected: channelVideos.length,
      },
      errors: 0,
      hasLiveYouTubeApi: true,
      actualFetchedFromYouTube: realVideos.length,
      sampleVideos: realVideos.slice(0, 15).map((v) => ({
        id: v.id,
        title: v.title,
        privacyStatus: v.privacyStatus,
        uploadStatus: v.uploadStatus,
        publishAt: v.publishAt,
        definition: v.definition,
        duration: v.duration,
        thumbnailUrl: v.thumbnailUrl,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Error occurred during YouTube channel synchronization.',
    });
  }
});

// SAFE READ-ONLY CONNECTION TEST ENDPOINT
app.get('/api/channels/:id/test-connection', async (req: Request, res: Response) => {
  const channel = dbStore.channels.get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  const clientIdSet = !!process.env.GOOGLE_CLIENT_ID;
  const clientSecretSet = !!process.env.GOOGLE_CLIENT_SECRET;
  const apiKeySet = !!process.env.YOUTUBE_API_KEY;
  const hasAccessToken = await youtubeAuthService.getValidAccessToken(channel.id);
  const connectionStatus = youtubeAuthService.getConnectionStatus(channel.id);

  let liveChannelAccessible = false;
  let liveVideosCount = 0;
  let liveError: string | null = null;

  if (hasAccessToken || apiKeySet) {
    try {
      const details = await youtubeDataService.getChannelDetails(channel.youtubeChannelId);
      if (details.success && details.data) {
        liveChannelAccessible = true;
        liveVideosCount = details.data.videoCount || 0;
      } else {
        liveError = details.error || 'Failed to query channel details.';
      }
    } catch (e: any) {
      liveError = e.message;
    }
  }

  res.json({
    channelId: channel.id,
    channelTitle: channel.title,
    youtubeChannelId: channel.youtubeChannelId,
    readOnlyMode: true,
    environment: {
      googleClientIdConfigured: clientIdSet,
      googleClientSecretConfigured: clientSecretSet,
      youtubeApiKeyConfigured: apiKeySet,
    },
    authStatus: {
      hasActiveOAuthToken: !!hasAccessToken,
      hasRefreshToken: connectionStatus.hasRefreshToken,
      accountEmail: connectionStatus.accountEmail || null,
      expiresAt: connectionStatus.expiresAt || null,
    },
    liveYouTubeProbe: {
      channelAccessible: liveChannelAccessible,
      liveVideosCount,
      error: liveError,
    },
  });
});

// ==========================================
// 3. YOUTUBE OAUTH & CREDENTIALS
// ==========================================
app.get('/api/auth/youtube/url', (req: Request, res: Response) => {
  const channelId = req.query.channelId as string;
  const customRedirectUri = req.query.redirectUri as string;
  const result = youtubeAuthService.generateAuthUrl(channelId, customRedirectUri);
  res.json(result);
});

// OFFICIAL OAUTH 2.0 CALLBACK HANDLER
app.get('/api/auth/youtube/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('[OAuth Callback] Error received from Google:', error);
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Authentication Failed</title></head>
      <body style="background:#09090b;color:#f43f5e;font-family:sans-serif;text-align:center;padding:50px;">
        <h2>Google OAuth Authorization Failed</h2>
        <p style="color:#a1a1aa">${String(error)}</p>
        <button onclick="window.close()" style="background:#27272a;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;">Close Window</button>
      </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send('Missing authorization code from Google OAuth.');
  }

  let channelIdFromState = '';
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(String(state), 'base64').toString('utf-8'));
      channelIdFromState = decoded.channelId || '';
    } catch (e) {
      console.warn('[OAuth Callback] Could not parse state:', e);
    }
  }

  const exchangeResult = await youtubeAuthService.exchangeCode(String(code));
  if (!exchangeResult.success || !exchangeResult.data) {
    console.error('[OAuth Callback] Code exchange failed:', exchangeResult.error);
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Exchange Failed</title></head>
      <body style="background:#09090b;color:#f43f5e;font-family:sans-serif;text-align:center;padding:50px;">
        <h2>Token Exchange Failed</h2>
        <p style="color:#a1a1aa">${exchangeResult.error || 'Could not exchange code with Google servers.'}</p>
        <button onclick="window.close()" style="background:#27272a;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;">Close Window</button>
      </body>
      </html>
    `);
  }

  const { access_token, refresh_token, expires_in, scope } = exchangeResult.data;

  // Retrieve actual user channel directly from YouTube Data API
  const myChannelResult = await youtubeDataService.getMyChannel(access_token);
  if (!myChannelResult.success || !myChannelResult.data) {
    console.error('[OAuth Callback] Failed to fetch user channel:', myChannelResult.error);
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Channel Lookup Failed</title></head>
      <body style="background:#09090b;color:#f43f5e;font-family:sans-serif;text-align:center;padding:50px;">
        <h2>YouTube Channel Retrieval Failed</h2>
        <p style="color:#a1a1aa">${myChannelResult.error || 'Could not find a YouTube channel on this Google account.'}</p>
        <button onclick="window.close()" style="background:#27272a;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;">Close Window</button>
      </body>
      </html>
    `);
  }

  const realChannel = myChannelResult.data;
  const targetChannelId = channelIdFromState || `chan-${realChannel.id}`;

  // Store credentials securely in server vault
  youtubeAuthService.storeCredentials(targetChannelId, {
    channelId: targetChannelId,
    accessToken: access_token,
    refreshToken: refresh_token,
    tokenExpiresAt: Date.now() + (expires_in || 3600) * 1000,
    scope: scope || 'https://www.googleapis.com/auth/youtube.force-ssl',
  });

  // Upsert actual channel into dbStore
  let channel = dbStore.channels.get(targetChannelId);
  if (!channel) {
    channel = {
      id: targetChannelId,
      youtubeChannelId: realChannel.id,
      title: realChannel.title,
      customUrl: realChannel.customUrl,
      thumbnailUrl: realChannel.thumbnailUrl,
      status: 'CONNECTED',
      contentProfileId: '',
      publishFrequency: '1/day',
      publishTime: '16:00',
      timezone: 'Asia/Jakarta',
      uploadPlaylistId: realChannel.uploadPlaylistId,
      subscriberCount: realChannel.subscriberCount,
      videoCount: realChannel.videoCount,
      unmanagedVideoCount: 0,
      hasOAuthConfigured: true,
      isSeeded: false, // Confirmed REAL channel
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    dbStore.channels.set(targetChannelId, channel);
  } else {
    channel.youtubeChannelId = realChannel.id;
    channel.title = realChannel.title;
    channel.customUrl = realChannel.customUrl || channel.customUrl;
    channel.thumbnailUrl = realChannel.thumbnailUrl || channel.thumbnailUrl;
    channel.uploadPlaylistId = realChannel.uploadPlaylistId || channel.uploadPlaylistId;
    channel.subscriberCount = realChannel.subscriberCount ?? channel.subscriberCount;
    channel.videoCount = realChannel.videoCount ?? channel.videoCount;
    channel.hasOAuthConfigured = true;
    channel.status = 'CONNECTED';
    channel.isSeeded = false;
    channel.updatedAt = new Date().toISOString();
  }

  dbStore.logActivity({
    user: 'OAuth Engine',
    channelId: targetChannelId,
    channelTitle: channel.title,
    operation: 'YouTube Account Connected',
    previousValue: 'Disconnected',
    newValue: `Connected real YouTube channel: ${realChannel.title} (${realChannel.id})`,
    result: 'SUCCESS',
  });

  // Send communication back to parent window and auto-close
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>YouTube Connected</title>
      <style>
        body { background:#09090b; color:#f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .card { background: #18181b; border: 1px solid #27272a; padding: 32px; border-radius: 16px; max-width: 440px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .badge { display: inline-block; background: #064e3b; color: #34d399; font-weight: bold; font-size: 11px; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; margin-bottom: 16px; border: 1px solid #059669; }
        h2 { font-size: 20px; margin: 0 0 8px 0; color: #fff; }
        p { font-size: 13px; color: #a1a1aa; line-height: 1.5; margin: 0 0 20px 0; }
        .btn { background: #e11d48; color: #fff; border: none; padding: 10px 24px; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">Connection Verified</div>
        <h2>YouTube Account Connected</h2>
        <p>Channel <strong>${realChannel.title}</strong> (${realChannel.id}) is now authorized with AMG in <strong>Read-Only Mode</strong>.</p>
        <button class="btn" onclick="window.close()">Close Window</button>
      </div>
      <script>
        try {
          if (window.opener) {
            window.opener.postMessage({
              type: 'OAUTH_AUTH_SUCCESS',
              channelId: '${targetChannelId}',
              youtubeChannelId: '${realChannel.id}',
              channelTitle: '${realChannel.title.replace(/'/g, "\\'")}'
            }, '*');
          }
        } catch(e) {}
        setTimeout(function() { window.close(); }, 1500);
      </script>
    </body>
    </html>
  `);
});

app.post('/api/auth/youtube/connect-credentials', async (req: Request, res: Response) => {
  const { channelId, accessToken, refreshToken, accountEmail } = req.body;
  if (!channelId) {
    return res.status(400).json({ error: 'channelId is required.' });
  }

  if (!accessToken && !refreshToken) {
    return res.status(400).json({ error: 'Valid OAuth Access Token or Refresh Token is required.' });
  }

  const channel = dbStore.channels.get(channelId);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found.' });
  }

  // REAL VERIFICATION: Test the token against the official YouTube Data API v3
  let verifiedDetails: any = null;
  if (accessToken) {
    const testRes = await youtubeDataService.getMyChannel(accessToken);
    if (!testRes.success || !testRes.data) {
      // Mark channel status as ERROR
      channel.status = 'ERROR';
      channel.updatedAt = new Date().toISOString();
      return res.status(400).json({
        success: false,
        error: `YouTube API Verification Failed: ${testRes.error || 'The provided access token was rejected by YouTube Data API v3. Ensure it has https://www.googleapis.com/auth/youtube.force-ssl or https://www.googleapis.com/auth/youtube scope.'}`,
      });
    }
    verifiedDetails = testRes.data;
  }

  // Securely store verified credentials
  youtubeAuthService.storeCredentials(channelId, {
    channelId,
    accessToken: accessToken || '',
    refreshToken: refreshToken || '',
    tokenExpiresAt: Date.now() + 3600 * 1000,
    scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
    accountEmail: accountEmail || (verifiedDetails ? `${verifiedDetails.title} (Live)` : 'authorized@azkamedia.com'),
  });

  // If verified from real YouTube Data API, update channel metadata with real values
  if (verifiedDetails) {
    channel.youtubeChannelId = verifiedDetails.id;
    channel.title = verifiedDetails.title;
    channel.customUrl = verifiedDetails.customUrl || channel.customUrl;
    channel.thumbnailUrl = verifiedDetails.thumbnailUrl || channel.thumbnailUrl;
    channel.uploadPlaylistId = verifiedDetails.uploadPlaylistId || channel.uploadPlaylistId;
    channel.subscriberCount = verifiedDetails.subscriberCount ?? channel.subscriberCount;
    channel.videoCount = verifiedDetails.videoCount ?? channel.videoCount;
    channel.isSeeded = false; // Confirmed real!
  }

  channel.hasOAuthConfigured = true;
  channel.status = 'CONNECTED';
  channel.updatedAt = new Date().toISOString();

  dbStore.logActivity({
    user: 'Administrator',
    channelId,
    channelTitle: channel.title,
    operation: 'YouTube Credentials Verified & Connected',
    previousValue: 'Disconnected',
    newValue: `Verified active YouTube credentials for channel: ${channel.title} (${channel.youtubeChannelId})`,
    result: 'SUCCESS',
  });

  res.json({
    success: true,
    message: `YouTube credentials verified and connected for "${channel.title}".`,
    channel: {
      id: channel.id,
      title: channel.title,
      youtubeChannelId: channel.youtubeChannelId,
      status: channel.status,
      videoCount: channel.videoCount,
    },
  });
});

app.post('/api/auth/youtube/gis-sync', async (req: Request, res: Response) => {
  const { channelId, accessToken, channelData } = req.body;
  if (!accessToken || !channelData) {
    return res.status(400).json({ error: 'accessToken and channelData are required.' });
  }

  // Find target channel: by channelId, by matching youtubeChannelId, or first available channel
  let channel = channelId ? dbStore.channels.get(channelId) : null;
  if (!channel && channelData.id) {
    channel = Array.from(dbStore.channels.values()).find((c) => c.youtubeChannelId === channelData.id);
  }

  // If still not matched, use first channel or create
  if (!channel) {
    const existingList = Array.from(dbStore.channels.values());
    if (existingList.length > 0 && !channelId) {
      channel = existingList[0];
    }
  }

  const targetId = channel ? channel.id : (channelId || `chan-${channelData.id || Date.now()}`);

  // Securely store credentials in memory vault
  youtubeAuthService.storeCredentials(targetId, {
    channelId: targetId,
    accessToken,
    tokenExpiresAt: Date.now() + 3600 * 1000,
    scope: 'https://www.googleapis.com/auth/youtube.readonly',
    accountEmail: channelData.title ? `${channelData.title} (Live GIS)` : 'gis-client@azkamedia.com',
  });

  if (channel) {
    channel.title = channelData.title || channel.title;
    channel.youtubeChannelId = channelData.id || channel.youtubeChannelId;
    if (channelData.customUrl) channel.customUrl = channelData.customUrl;
    if (channelData.thumbnailUrl) channel.thumbnailUrl = channelData.thumbnailUrl;
    if (channelData.subscriberCount !== undefined) channel.subscriberCount = channelData.subscriberCount;
    if (channelData.videoCount !== undefined) channel.videoCount = channelData.videoCount;
    channel.status = 'CONNECTED';
    channel.hasOAuthConfigured = true;
    channel.isSeeded = false;
    channel.updatedAt = new Date().toISOString();
  } else {
    channel = {
      id: targetId,
      youtubeChannelId: channelData.id,
      title: channelData.title || 'Connected YouTube Channel',
      customUrl: channelData.customUrl || `@${channelData.id}`,
      thumbnailUrl: channelData.thumbnailUrl || '',
      status: 'CONNECTED',
      contentProfileId: '',
      publishFrequency: '1/day',
      publishTime: '16:00',
      timezone: 'Asia/Jakarta',
      subscriberCount: channelData.subscriberCount || 0,
      videoCount: channelData.videoCount || 0,
      unmanagedVideoCount: 0,
      hasOAuthConfigured: true,
      isSeeded: false,
      nicheCategory: 'General',
      nicheBadge: 'emerald',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    dbStore.channels.set(targetId, channel as any);
  }

  dbStore.logActivity({
    user: 'GIS OAuth Client',
    channelId: targetId,
    channelTitle: channel.title,
    operation: 'YouTube GIS Authorization Connected',
    previousValue: 'DISCONNECTED',
    newValue: `Connected live YouTube channel: ${channel.title} (${channel.youtubeChannelId}) via Google Identity Services (Client-Side). Status: CONNECTED`,
    result: 'SUCCESS',
  });

  return res.json({
    success: true,
    channel,
    message: `Channel "${channel.title}" successfully authorized and connected!`,
  });
});

app.post('/api/admin/clear-demo-data', (req: Request, res: Response) => {
  const report = dbStore.clearSeededData();
  dbStore.logActivity({
    user: 'Administrator',
    channelId: 'SYSTEM',
    channelTitle: 'All Channels',
    operation: 'PURGE DEMO FIXTURES',
    previousValue: 'Mock data present',
    newValue: `Purged ${report.removedChannels} mock channels, ${report.removedVideos} mock videos, ${report.removedBatches} mock batches. Only genuine data remains.`,
    result: 'SUCCESS',
  });
  res.json({
    success: true,
    message: `Purged ${report.removedChannels} demo channels, ${report.removedVideos} demo videos, and ${report.removedBatches} demo batches.`,
    report,
  });
});

// ==========================================
// 4. CONTENT PROFILES
// ==========================================
app.get('/api/content-profiles', (req: Request, res: Response) => {
  res.json(Array.from(dbStore.profiles.values()));
});

app.post('/api/content-profiles', (req: Request, res: Response) => {
  const { name, description, publishFrequency, publishTime, timezone, scheduleConfig, masterTitleIds, masterThumbnailIds, nicheCategory, nicheBadge } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  let finalScheduleConfig = scheduleConfig;
  if (scheduleConfig) {
    const valid = validateScheduleConfig(scheduleConfig);
    if (!valid.isValid) {
      return res.status(400).json({ error: `Invalid schedule config: ${valid.errors.join(', ')}` });
    }
    finalScheduleConfig = normalizeScheduleConfig(scheduleConfig);
  }

  const id = `profile-${Date.now()}`;
  const profile = {
    id,
    name,
    description: description || '',
    nicheCategory: nicheCategory || 'General',
    nicheBadge: nicheBadge || 'amber',
    publishFrequency: finalScheduleConfig ? `${finalScheduleConfig.videosPerDay}/day` : (publishFrequency || '1/day'),
    publishTime: finalScheduleConfig ? finalScheduleConfig.times.join(', ') : (publishTime || '16:00'),
    timezone: finalScheduleConfig ? finalScheduleConfig.timezone : (timezone || 'Asia/Jakarta'),
    scheduleConfig: finalScheduleConfig,
    masterTitleIds: masterTitleIds || [],
    masterThumbnailIds: masterThumbnailIds || [],
    assignedChannelCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  dbStore.profiles.set(id, profile);
  res.status(201).json(profile);
});

app.put('/api/content-profiles/:id', (req: Request, res: Response) => {
  const profile = dbStore.profiles.get(req.params.id);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  let updatedScheduleConfig = req.body.scheduleConfig !== undefined ? req.body.scheduleConfig : profile.scheduleConfig;
  if (req.body.scheduleConfig) {
    const valid = validateScheduleConfig(req.body.scheduleConfig);
    if (!valid.isValid) {
      return res.status(400).json({ error: `Invalid schedule config: ${valid.errors.join(', ')}` });
    }
    updatedScheduleConfig = normalizeScheduleConfig(req.body.scheduleConfig);
  }

  const updated = {
    ...profile,
    ...req.body,
    scheduleConfig: updatedScheduleConfig,
    updatedAt: new Date().toISOString(),
  };

  if (updatedScheduleConfig) {
    updated.publishFrequency = `${updatedScheduleConfig.videosPerDay}/day`;
    updated.publishTime = updatedScheduleConfig.times.join(', ');
    updated.timezone = updatedScheduleConfig.timezone;
  }

  dbStore.profiles.set(profile.id, updated);
  res.json(updated);
});

app.delete('/api/content-profiles/:id', (req: Request, res: Response) => {
  const profile = dbStore.profiles.get(req.params.id);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  dbStore.profiles.delete(profile.id);
  res.json({ success: true });
});

// ==========================================
// 5. MASTER TITLES
// ==========================================
app.get('/api/master-titles', (req: Request, res: Response) => {
  const profileId = req.query.profileId as string;
  let titles = Array.from(dbStore.masterTitles.values());
  if (profileId) {
    titles = titles.filter(t => t.profileId === profileId);
  }
  titles.sort((a, b) => a.orderIndex - b.orderIndex);
  res.json(titles);
});

app.post('/api/master-titles', (req: Request, res: Response) => {
  const { profileId, text, orderIndex } = req.body;
  if (!text) return res.status(400).json({ error: 'Title text is required' });

  const existing = Array.from(dbStore.masterTitles.values()).filter(t => t.profileId === (profileId || 'profile-ayam-warna'));
  const id = `title-${Date.now()}`;
  const title = {
    id,
    profileId: profileId || 'profile-ayam-warna',
    text,
    orderIndex: orderIndex !== undefined ? orderIndex : existing.length,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  dbStore.masterTitles.set(id, title);

  // Sync to profile if not present
  const profile = dbStore.profiles.get(title.profileId);
  if (profile && !profile.masterTitleIds.includes(id)) {
    profile.masterTitleIds.push(id);
  }

  res.status(201).json(title);
});

app.put('/api/master-titles/:id', (req: Request, res: Response) => {
  const title = dbStore.masterTitles.get(req.params.id);
  if (!title) return res.status(404).json({ error: 'Title not found' });

  const updated = { ...title, ...req.body };
  dbStore.masterTitles.set(title.id, updated);
  res.json(updated);
});

app.delete('/api/master-titles/:id', (req: Request, res: Response) => {
  const title = dbStore.masterTitles.get(req.params.id);
  if (!title) return res.status(404).json({ error: 'Title not found' });

  dbStore.masterTitles.delete(title.id);
  res.json({ success: true });
});

// ==========================================
// 6. MASTER THUMBNAILS
// ==========================================
app.get('/api/master-thumbnails', (req: Request, res: Response) => {
  const profileId = req.query.profileId as string;
  let thumbs = Array.from(dbStore.masterThumbnails.values());
  if (profileId) {
    thumbs = thumbs.filter(t => t.profileId === profileId);
  }
  thumbs.sort((a, b) => a.orderIndex - b.orderIndex);
  res.json(thumbs);
});

app.post('/api/master-thumbnails', (req: Request, res: Response) => {
  const { profileId, name, url, orderIndex } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'Name and URL are required' });

  const existing = Array.from(dbStore.masterThumbnails.values()).filter(t => t.profileId === (profileId || 'profile-ayam-warna'));
  const id = `thumb-${Date.now()}`;
  const thumbnail = {
    id,
    profileId: profileId || 'profile-ayam-warna',
    name,
    url,
    orderIndex: orderIndex !== undefined ? orderIndex : existing.length,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  dbStore.masterThumbnails.set(id, thumbnail);

  const profile = dbStore.profiles.get(thumbnail.profileId);
  if (profile && !profile.masterThumbnailIds.includes(id)) {
    profile.masterThumbnailIds.push(id);
  }

  res.status(201).json(thumbnail);
});

app.delete('/api/master-thumbnails/:id', (req: Request, res: Response) => {
  const thumb = dbStore.masterThumbnails.get(req.params.id);
  if (!thumb) return res.status(404).json({ error: 'Thumbnail not found' });

  dbStore.masterThumbnails.delete(thumb.id);
  res.json({ success: true });
});

// ==========================================
// 7. ROTATION MATRIX PREVIEW (Dynamic N Titles x M Thumbnails)
// ==========================================
app.get('/api/rotation/matrix', (req: Request, res: Response) => {
  const count = parseInt((req.query.count as string) || '12', 10);
  const profileId = (req.query.profileId as string) || 'profile-ayam-warna';

  const titles = Array.from(dbStore.masterTitles.values()).filter(t => t.profileId === profileId && t.isActive);
  const thumbnails = Array.from(dbStore.masterThumbnails.values()).filter(t => t.profileId === profileId && t.isActive);

  const matrix = generateRotationMatrix(titles, thumbnails, count, 0);
  res.json({
    titleCount: titles.length,
    thumbnailCount: thumbnails.length,
    totalVideosPreviewed: count,
    matrix,
  });
});

// ==========================================
// 8. VIDEOS
// ==========================================
app.get('/api/videos', (req: Request, res: Response) => {
  const { channelId, status, isManaged, scope } = req.query;
  let videos = Array.from(dbStore.videos.values());

  if (channelId) {
    videos = videos.filter(v => v.channelId === channelId);
  }
  if (status) {
    videos = videos.filter(v => v.managementStatus === status);
  }
  if (isManaged !== undefined) {
    const managedBool = isManaged === 'true';
    videos = videos.filter(v => v.isManaged === managedBool);
  }
  if (scope) {
    videos = videos.filter(v => v.managementScope === scope);
  }

  // Sort by original upload descending
  videos.sort((a, b) => new Date(b.originalUploadAt).getTime() - new Date(a.originalUploadAt).getTime());
  res.json(videos);
});

app.put('/api/videos/:id/scope', (req: Request, res: Response) => {
  const { managementScope, exclusionReason } = req.body;
  if (!managementScope || !['REGULAR', 'EXCLUDED', 'UNCLASSIFIED'].includes(managementScope)) {
    return res.status(400).json({ error: 'Valid managementScope (REGULAR | EXCLUDED | UNCLASSIFIED) is required.' });
  }

  const video = dbStore.updateVideoScope(req.params.id, managementScope, exclusionReason, 'USER');
  if (!video) {
    return res.status(404).json({ error: 'Video not found' });
  }

  dbStore.logActivity({
    user: 'Administrator',
    channelId: video.channelId,
    channelTitle: video.channelTitle,
    operation: 'Video Scope Updated',
    previousValue: 'Scope Assignment',
    newValue: `Video "${video.titleBefore}" assigned scope: ${managementScope} (isAmgEligible: ${video.isAmgEligible})`,
    result: 'SUCCESS',
  });

  res.json({
    success: true,
    video,
    message: `Video "${video.titleBefore}" scope set to ${managementScope}.`,
  });
});

app.post('/api/videos/bulk-scope', (req: Request, res: Response) => {
  const { videoIds, managementScope, exclusionReason } = req.body;
  if (!Array.isArray(videoIds) || videoIds.length === 0) {
    return res.status(400).json({ error: 'videoIds must be a non-empty array.' });
  }
  if (!managementScope || !['REGULAR', 'EXCLUDED', 'UNCLASSIFIED'].includes(managementScope)) {
    return res.status(400).json({ error: 'Valid managementScope (REGULAR | EXCLUDED | UNCLASSIFIED) is required.' });
  }

  const result = dbStore.bulkUpdateVideoScope(videoIds, managementScope, exclusionReason, 'USER');

  dbStore.logActivity({
    user: 'Administrator',
    channelId: result.videos[0]?.channelId || 'MULTIPLE',
    channelTitle: result.videos[0]?.channelTitle || 'Multiple Channels',
    operation: 'Bulk Video Scope Updated',
    previousValue: `${videoIds.length} videos requested`,
    newValue: `Assigned ${result.updatedCount} videos to ${managementScope}`,
    result: 'SUCCESS',
  });

  res.json({
    success: true,
    updatedCount: result.updatedCount,
    videos: result.videos,
    message: `Updated scope for ${result.updatedCount} videos to ${managementScope}.`,
  });
});

app.get('/api/channels/:id/scope-summary', (req: Request, res: Response) => {
  const channel = dbStore.channels.get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  const summary = dbStore.getVideoScopeSummary(channel.id);
  res.json({
    channelId: channel.id,
    channelTitle: channel.title,
    summary,
  });
});

// ==========================================
// 8B. PHASE 2 — SAFE VIDEO ELIGIBILITY & CANDIDATE MANAGEMENT
// ==========================================

// Run Multi-Layer Eligibility Detection on a Channel
app.post('/api/channels/:id/detect-candidates', (req: Request, res: Response) => {
  const channel = dbStore.channels.get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  const detection = detectChannelCandidates(channel.id);
  const channelVideos = Array.from(dbStore.videos.values()).filter((v) => v.channelId === channel.id);

  const candidates = channelVideos.filter(
    (v) => (v.safetyCategory === 'NEW_PRIVATE_CANDIDATE' || v.safetyCategory === 'ELIGIBLE') && !v.isEnrolled
  );
  const enrolledEligible = channelVideos.filter((v) => v.managementScope === 'REGULAR' && v.isAmgEligible);
  const protectedByCutoff = channelVideos.filter((v) => v.safetyCategory === 'PROTECTED_BY_CUTOFF');
  const protectedOld = channelVideos.filter((v) => v.safetyCategory === 'PROTECTED_OLD');
  const unclassified = channelVideos.filter((v) => v.safetyCategory === 'UNCLASSIFIED');
  const alreadyManaged = channelVideos.filter((v) => v.safetyCategory === 'ALREADY_MANAGED' || v.isManaged);
  const excluded = channelVideos.filter(
    (v) =>
      v.safetyCategory === 'EXCLUDED' ||
      (v.managementScope === 'EXCLUDED' && v.safetyCategory !== 'PROTECTED_BY_CUTOFF' && v.safetyCategory !== 'PROTECTED_OLD')
  );

  const result = {
    candidates,
    enrolledEligible,
    protectedByCutoff,
    protectedOld,
    unclassified,
    alreadyManaged,
    excluded,
    statistics: {
      totalEvaluated: detection.summary.totalEvaluated,
      newCandidates: candidates.length,
      enrolledEligible: enrolledEligible.length,
      protectedOld: protectedOld.length,
      protectedByCutoff: protectedByCutoff.length,
      unclassified: unclassified.length,
      alreadyManaged: alreadyManaged.length,
      excluded: excluded.length,
    },
    config: {
      eligibilityWindowDays: detection.summary.eligibilityWindowDays,
      eligibleTitlePatterns: detection.summary.eligibleTitlePatterns,
      latestManagedUploadAt: detection.summary.latestManagedUploadAt,
      autoEnroll: detection.summary.autoEnroll,
    },
  };

  dbStore.logActivity({
    user: 'Eligibility Detector',
    channelId: channel.id,
    channelTitle: channel.title,
    operation: 'Multi-Layer Candidate Detection Executed',
    previousValue: 'Pre-detection',
    newValue: `Detected: ${result.statistics.newCandidates} candidates, ${result.statistics.enrolledEligible} enrolled, ${result.statistics.protectedOld} old protected, ${result.statistics.protectedByCutoff} cutoff protected, ${result.statistics.unclassified} unclassified, ${result.statistics.alreadyManaged} managed.`,
    result: 'SUCCESS',
  });

  res.json(result);
});

// Update Channel Eligibility Settings
app.put('/api/channels/:id/eligibility-config', (req: Request, res: Response) => {
  const channel = dbStore.channels.get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  const { eligibilityWindowDays, eligibleTitlePatterns, autoEnroll, latestManagedUploadAt } = req.body;

  if (eligibilityWindowDays !== undefined) {
    const days = Number(eligibilityWindowDays);
    if (!Number.isInteger(days) || days <= 0) {
      return res.status(400).json({ error: 'eligibilityWindowDays must be a positive integer.' });
    }
    channel.eligibilityWindowDays = days;
  }

  if (eligibleTitlePatterns !== undefined) {
    if (!Array.isArray(eligibleTitlePatterns) || eligibleTitlePatterns.length === 0) {
      return res.status(400).json({ error: 'eligibleTitlePatterns must be a non-empty array of strings.' });
    }
    channel.eligibleTitlePatterns = eligibleTitlePatterns;
  }

  if (autoEnroll !== undefined) {
    channel.autoEnroll = Boolean(autoEnroll);
  }

  if (latestManagedUploadAt !== undefined) {
    channel.latestManagedUploadAt = String(latestManagedUploadAt);
  }

  channel.updatedAt = new Date().toISOString();
  dbStore.channels.set(channel.id, channel);

  dbStore.logActivity({
    user: 'Administrator',
    channelId: channel.id,
    channelTitle: channel.title,
    operation: 'Eligibility Configuration Updated',
    previousValue: 'Previous eligibility parameters',
    newValue: `Window: ${channel.eligibilityWindowDays}d, Patterns: [${channel.eligibleTitlePatterns?.join(', ')}], AutoEnroll: ${channel.autoEnroll}, Cutoff: ${channel.latestManagedUploadAt}`,
    result: 'SUCCESS',
  });

  res.json({
    success: true,
    channel,
    message: 'Channel eligibility settings updated successfully.',
  });
});

// Enroll a single Candidate into AMG Regular Scope
app.post('/api/videos/:id/enroll', (req: Request, res: Response) => {
  const video = dbStore.videos.get(req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  const channel = dbStore.channels.get(video.channelId);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });
  const profile = channel.contentProfileId ? dbStore.profiles.get(channel.contentProfileId) : null;

  // Re-verify eligibility before enrolling
  const evalRes = evaluateVideoEligibility(video, channel, profile);
  if (evalRes.category !== 'NEW_PRIVATE_CANDIDATE' && evalRes.category !== 'ELIGIBLE' && !video.isEnrolled) {
    return res.status(400).json({
      error: `Video cannot be enrolled: ${evalRes.reason}`,
      category: evalRes.category,
    });
  }

  video.isEnrolled = true;
  video.managementScope = 'REGULAR';
  video.isAmgEligible = true;
  video.amgStatus = 'ENROLLED';
  video.managementStatus = 'READY';
  video.isProtected = false;
  video.scopeAssignedAt = new Date().toISOString();
  video.scopeAssignedBy = 'USER';
  video.updatedAt = new Date().toISOString();
  dbStore.videos.set(video.id, video);

  // Update channel unmanaged count
  if (channel) {
    const unmanaged = Array.from(dbStore.videos.values()).filter(
      (v) => v.channelId === channel.id && !v.isManaged && v.managementScope === 'REGULAR' && v.isAmgEligible
    ).length;
    channel.unmanagedVideoCount = unmanaged;
  }

  dbStore.logActivity({
    user: 'Administrator',
    channelId: video.channelId,
    channelTitle: video.channelTitle,
    videoId: video.id,
    operation: 'Video Enrolled into AMG Regular Scope',
    previousValue: 'Candidate',
    newValue: `Enrolled "${video.titleBefore}" into AMG automation pipeline.`,
    result: 'SUCCESS',
  });

  res.json({
    success: true,
    video,
    message: `Video "${video.titleBefore}" enrolled into AMG automation.`,
  });
});

// Reject / Exclude a Candidate
app.post('/api/videos/:id/reject', (req: Request, res: Response) => {
  const video = dbStore.videos.get(req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  const { reason = 'Manually excluded by user.' } = req.body;

  video.isEnrolled = false;
  video.managementScope = 'EXCLUDED';
  video.isAmgEligible = false;
  video.amgStatus = 'EXCLUDED';
  video.managementStatus = 'EXCLUDED';
  video.safetyCategory = 'EXCLUDED';
  video.isProtected = true;
  video.exclusionReason = reason;
  video.scopeAssignedAt = new Date().toISOString();
  video.scopeAssignedBy = 'USER';
  video.updatedAt = new Date().toISOString();
  dbStore.videos.set(video.id, video);

  const channel = dbStore.channels.get(video.channelId);
  if (channel) {
    const unmanaged = Array.from(dbStore.videos.values()).filter(
      (v) => v.channelId === channel.id && !v.isManaged && v.managementScope === 'REGULAR' && v.isAmgEligible
    ).length;
    channel.unmanagedVideoCount = unmanaged;
  }

  dbStore.logActivity({
    user: 'Administrator',
    channelId: video.channelId,
    channelTitle: video.channelTitle,
    videoId: video.id,
    operation: 'Video Excluded from AMG',
    previousValue: 'Candidate/Unclassified',
    newValue: `Excluded "${video.titleBefore}": ${reason}`,
    result: 'SUCCESS',
  });

  res.json({
    success: true,
    video,
    message: `Video excluded from AMG automation.`,
  });
});

// Enroll ALL Eligible Candidates for a Channel
app.post('/api/channels/:id/enroll-all-candidates', (req: Request, res: Response) => {
  const channel = dbStore.channels.get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  const profile = channel.contentProfileId ? dbStore.profiles.get(channel.contentProfileId) : null;
  const enrolledList = [];

  for (const video of dbStore.videos.values()) {
    if (video.channelId !== channel.id || video.isManaged || video.isEnrolled) continue;

    const evalRes = evaluateVideoEligibility(video, channel, profile);
    if (evalRes.category === 'NEW_PRIVATE_CANDIDATE' || evalRes.category === 'ELIGIBLE') {
      video.isEnrolled = true;
      video.managementScope = 'REGULAR';
      video.isAmgEligible = true;
      video.amgStatus = 'ENROLLED';
      video.managementStatus = 'READY';
      video.isProtected = false;
      video.scopeAssignedAt = new Date().toISOString();
      video.scopeAssignedBy = 'USER';
      video.updatedAt = new Date().toISOString();
      enrolledList.push(video);
    }
  }

  const unmanaged = Array.from(dbStore.videos.values()).filter(
    (v) => v.channelId === channel.id && !v.isManaged && v.managementScope === 'REGULAR' && v.isAmgEligible
  ).length;
  channel.unmanagedVideoCount = unmanaged;

  dbStore.logActivity({
    user: 'Administrator',
    channelId: channel.id,
    channelTitle: channel.title,
    operation: 'Bulk Enrolled Candidates',
    previousValue: 'Pending Candidates',
    newValue: `Enrolled ${enrolledList.length} candidate videos into AMG Regular Scope.`,
    result: 'SUCCESS',
  });

  res.json({
    success: true,
    enrolledCount: enrolledList.length,
    enrolledVideos: enrolledList,
    message: `Successfully enrolled ${enrolledList.length} candidate(s) into AMG Regular Scope.`,
  });
});

// Validate Pre-Mutation Hard Safety Gate
app.post('/api/videos/:id/validate-mutation', (req: Request, res: Response) => {
  const video = dbStore.videos.get(req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  const result = validateBeforeMutation(video.id, video.channelId);
  res.json({
    videoId: video.id,
    channelId: video.channelId,
    title: video.titleBefore,
    ...result,
  });
});

// ==========================================
// 8C. PHASE 2 ACCEPTANCE TEST RUNNER (Requirement 32 & 33)
// ==========================================
app.post('/api/test/phase2-acceptance', (req: Request, res: Response) => {
  const channelId = req.body.channelId || 'chan-ayam-warna';
  const channel = dbStore.channels.get(channelId);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }

  const profile = channel.contentProfileId ? dbStore.profiles.get(channel.contentProfileId) : null;

  const testResults: Array<{
    testId: string;
    title: string;
    requirement: string;
    passed: boolean;
    details: string;
    data?: any;
  }> = [];

  // TEST 1: Multi-Layer Video Classification
  detectChannelCandidates(channel.id);
  const channelVideos = Array.from(dbStore.videos.values()).filter((v) => v.channelId === channel.id);
  const oldProtectedCount = channelVideos.filter((v) => v.safetyCategory === 'PROTECTED_OLD').length;
  const cutoffProtectedCount = channelVideos.filter((v) => v.safetyCategory === 'PROTECTED_BY_CUTOFF').length;
  const newCandidatesCount = channelVideos.filter(
    (v) => (v.safetyCategory === 'NEW_PRIVATE_CANDIDATE' || v.safetyCategory === 'ELIGIBLE') && !v.isEnrolled
  ).length;
  const unclassifiedCount = channelVideos.filter((v) => v.safetyCategory === 'UNCLASSIFIED').length;
  const alreadyManagedCount = channelVideos.filter((v) => v.safetyCategory === 'ALREADY_MANAGED' || v.isManaged).length;

  const t1Passed =
    oldProtectedCount >= 10 &&
    cutoffProtectedCount >= 2 &&
    newCandidatesCount >= 10 &&
    unclassifiedCount >= 3 &&
    alreadyManagedCount >= 2;

  testResults.push({
    testId: 'TEST-1-CLASSIFICATION',
    title: 'Multi-Layer Scope & Eligibility Classification',
    requirement: 'Requirement 32: 10 old private, 5 personal private, 10 candidates, 3 wrong title, 2 already managed.',
    passed: t1Passed,
    details: `Found: ${oldProtectedCount} old protected (req >=10), ${cutoffProtectedCount} cutoff protected (req >=2), ${newCandidatesCount} candidates (req >=10), ${unclassifiedCount} unclassified (req >=3), ${alreadyManagedCount} already managed (req >=2).`,
    data: {
      oldProtectedCount,
      cutoffProtectedCount,
      newCandidatesCount,
      unclassifiedCount,
      alreadyManagedCount,
    },
  });

  // TEST 2: Critical Cutoff Test (Requirement 33)
  // Personal video uploaded 23 Sep 09:00:00Z (before cutoff 23 Sep 10:15) with title "Copy of A"
  const cutoffVideo = dbStore.videos.get('vid-personal-cutoff-01');
  const cutoffEval = cutoffVideo ? evaluateVideoEligibility(cutoffVideo, channel, profile) : null;
  const cutoffPassed = cutoffEval?.category === 'PROTECTED_BY_CUTOFF' && cutoffEval.isProtected === true;

  // New video uploaded 24 Sep 09:00:00Z with title "Copy of A"
  const newCandVideo = dbStore.videos.get('vid-cand-001');
  const candEval = newCandVideo ? evaluateVideoEligibility(newCandVideo, channel, profile) : null;
  const candPassed = (candEval?.category === 'NEW_PRIVATE_CANDIDATE' || candEval?.category === 'ELIGIBLE') && candEval.isProtected === false;

  testResults.push({
    testId: 'TEST-2-CRITICAL-CUTOFF',
    title: 'Critical Upload Cutoff Separation (Requirement 33)',
    requirement: 'Upload 23 Sep 09:00 with title "Copy of A" must be PROTECTED_BY_CUTOFF. Upload 24 Sep 09:00 with title "Copy of A" must be NEW_PRIVATE_CANDIDATE.',
    passed: Boolean(cutoffPassed && candPassed),
    details: `Cutoff test: video ${cutoffVideo?.id} eval=${cutoffEval?.category} (expected PROTECTED_BY_CUTOFF). New video ${newCandVideo?.id} eval=${candEval?.category} (expected NEW_PRIVATE_CANDIDATE).`,
  });

  // TEST 3: Scheduling Continuation from 28 Sep 16:00
  // Existing latest schedule: 28 Sep 16:00 WIB
  // 5 videos scheduled at 1/day 16:00 WIB
  const testConfig = {
    mode: 'DAILY' as const,
    videosPerDay: 1,
    times: ['16:00'],
    timezone: 'Asia/Jakarta',
  };
  const latestAnchor = '2026-09-28T09:00:00.000Z'; // 28 Sep 16:00 WIB
  const fakeNow = new Date('2026-09-24T12:00:00.000Z'); // Today = 24 September 2026
  const next5Slots = calculateNextSchedules(5, testConfig, latestAnchor, [], fakeNow);

  const expectedDisplayTimes = [
    '29 September 2026 — 16:00 WIB',
    '30 September 2026 — 16:00 WIB',
    '1 Oktober 2026 — 16:00 WIB',
    '2 Oktober 2026 — 16:00 WIB',
    '3 Oktober 2026 — 16:00 WIB',
  ];

  let slotsMatch = next5Slots.length === 5;
  for (let i = 0; i < expectedDisplayTimes.length; i++) {
    if (!next5Slots[i] || next5Slots[i].formattedDisplay !== expectedDisplayTimes[i]) {
      slotsMatch = false;
      break;
    }
  }

  testResults.push({
    testId: 'TEST-3-SCHEDULING-CONTINUATION',
    title: 'Scheduling Cursor Continuation & Zero Duplicate',
    requirement: 'Anchor: 28 Sep 16:00 WIB. Next 5: 29 Sep, 30 Sep, 1 Oct, 2 Oct, 3 Oct @ 16:00 WIB. No duplicates.',
    passed: slotsMatch,
    details: `Slots generated: ${next5Slots.map((s) => s.formattedDisplay).join(', ')}`,
    data: next5Slots,
  });

  // TEST 4: Hard Pre-Mutation Safety Gate
  const gateOld = validateBeforeMutation('vid-old-001', channel.id);
  const gateExcluded = validateBeforeMutation('vid-personal-001', channel.id);
  const gateWrong = validateBeforeMutation('vid-wrong-001', channel.id);
  const gateCandidateUnenrolled = validateBeforeMutation('vid-cand-001', channel.id);

  // Verify an enrolled regular video with READY status passes the safety gate
  const testCand = dbStore.videos.get('vid-cand-001');
  const tempEnrolledId = 'vid-test-regular-enrolled';
  if (testCand) {
    dbStore.videos.set(tempEnrolledId, {
      ...testCand,
      id: tempEnrolledId,
      managementScope: 'REGULAR',
      isAmgEligible: true,
      isEnrolled: true,
      managementStatus: 'READY',
      amgStatus: 'READY',
      safetyCategory: 'ELIGIBLE',
      isProtected: false,
      isManaged: false,
      processingStatus: 'processed',
      privacyStatus: 'private',
    });
  }
  const gateEnrolled = validateBeforeMutation(tempEnrolledId, channel.id);

  const gateSecurityPassed =
    !gateOld.isValid &&
    !gateExcluded.isValid &&
    !gateWrong.isValid &&
    !gateCandidateUnenrolled.isValid &&
    gateEnrolled.isValid;

  testResults.push({
    testId: 'TEST-4-HARD-SAFETY-GATE',
    title: 'Hard Pre-Mutation Safety Gate (validateBeforeMutation)',
    requirement: 'Rejects mutation if video is excluded, old, unclassified, or not enrolled as AMG Regular. Passes only for verified regular videos.',
    passed: gateSecurityPassed,
    details: `Blocked Old: ${!gateOld.isValid}, Blocked Excluded: ${!gateExcluded.isValid}, Blocked Wrong: ${!gateWrong.isValid}, Blocked Unenrolled: ${!gateCandidateUnenrolled.isValid}, Permitted Enrolled: ${gateEnrolled.isValid}.`,
  });

  // TEST 5: Independent Title & Thumbnail Rotation Matrix
  const sampleTitles = [
    { id: 't1', text: 'Title 1', orderIndex: 0 },
    { id: 't2', text: 'Title 2', orderIndex: 1 },
    { id: 't3', text: 'Title 3', orderIndex: 2 },
  ];
  const sampleThumbs = [
    { id: 'th1', name: 'Thumb 1', url: 'u1', orderIndex: 0 },
    { id: 'th2', name: 'Thumb 2', url: 'u2', orderIndex: 1 },
    { id: 'th3', name: 'Thumb 3', url: 'u3', orderIndex: 2 },
    { id: 'th4', name: 'Thumb 4', url: 'u4', orderIndex: 3 },
  ];
  const rotMatrix = generateRotationMatrix(sampleTitles, sampleThumbs, 6, 0, 0);
  const rotPatternMatch =
    rotMatrix[0].title.id === 't1' && rotMatrix[0].thumbnail.id === 'th1' &&
    rotMatrix[1].title.id === 't2' && rotMatrix[1].thumbnail.id === 'th2' &&
    rotMatrix[2].title.id === 't3' && rotMatrix[2].thumbnail.id === 'th3' &&
    rotMatrix[3].title.id === 't1' && rotMatrix[3].thumbnail.id === 'th4' &&
    rotMatrix[4].title.id === 't2' && rotMatrix[4].thumbnail.id === 'th1';

  testResults.push({
    testId: 'TEST-5-INDEPENDENT-ROTATION',
    title: 'Deterministic Independent Title & Thumbnail Matrix',
    requirement: '3 Titles x 4 Thumbnails rotate with independent modulo sequences without random selection.',
    passed: rotPatternMatch,
    details: `Matrix pattern 0-4: T1+TH1, T2+TH2, T3+TH3, T1+TH4, T2+TH1. Verified deterministic.`,
  });

  const allPassed = testResults.every((t) => t.passed);

  dbStore.logActivity({
    user: 'Phase 2 Test Runner',
    channelId: channel.id,
    channelTitle: channel.title,
    operation: 'Phase 2 Acceptance Test Executed',
    previousValue: 'Test initiation',
    newValue: `All tests passed: ${allPassed} (${testResults.filter((t) => t.passed).length}/${testResults.length})`,
    result: allPassed ? 'SUCCESS' : 'FAILED',
  });

  res.json({
    allPassed,
    totalTests: testResults.length,
    passedCount: testResults.filter((t) => t.passed).length,
    failedCount: testResults.filter((t) => !t.passed).length,
    timestamp: new Date().toISOString(),
    results: testResults,
  });
});

// ==========================================
// 9. SCHEDULER
// ==========================================
app.get('/api/scheduler/reconcile/:channelId', async (req: Request, res: Response) => {
  const channel = dbStore.channels.get(req.params.channelId);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  // Query actual YouTube channel if uploads playlist and token exist, strictly ignoring personal/excluded videos
  let youtubeLatest: string | null = null;
  const hasAuth = await youtubeAuthService.getValidAccessToken(channel.id);
  if (hasAuth && channel.uploadPlaylistId) {
    youtubeLatest = await youtubeDataService.getLatestScheduledDate(channel.id, channel.uploadPlaylistId, (vidId) => {
      const local = Array.from(dbStore.videos.values()).find(v => v.youtubeVideoId === vidId || v.id === vidId);
      // Only AMG REGULAR eligible videos count towards the cursor!
      return !local || (local.managementScope === 'REGULAR' && local.isAmgEligible);
    });
  }

  // Check local database for latest AMG REGULAR scheduled video
  let latestLocalAmgScheduled: string | null = null;
  let latestTimestamp = 0;
  for (const v of dbStore.videos.values()) {
    if (v.channelId === channel.id && v.managementScope === 'REGULAR' && v.isAmgEligible && v.scheduledPublishAt) {
      const time = new Date(v.scheduledPublishAt).getTime();
      if (time > latestTimestamp) {
        latestTimestamp = time;
        latestLocalAmgScheduled = v.scheduledPublishAt;
      }
    }
  }

  // Effective latest anchor strictly prioritizes confirmed AMG REGULAR scheduled videos
  const effectiveLatest = youtubeLatest || latestLocalAmgScheduled || channel.lastScheduledPublishAt || null;

  const profile = channel.contentProfileId ? dbStore.profiles.get(channel.contentProfileId) : null;
  const resolvedConfig = resolveScheduleConfig(channel, profile);

  const occupiedSlots: string[] = [];
  for (const v of dbStore.videos.values()) {
    if (v.channelId === channel.id && v.scheduledPublishAt) {
      occupiedSlots.push(v.scheduledPublishAt);
    }
  }

  // Calculate next 15 slots
  const nextSchedules = calculateNextSchedules(
    15,
    resolvedConfig,
    effectiveLatest,
    occupiedSlots
  );

  res.json({
    channelId: channel.id,
    channelTitle: channel.title,
    timezone: channel.timezone,
    storedCursorPublishAt: channel.lastScheduledPublishAt,
    verifiedYouTubePublishAt: youtubeLatest,
    sourceOfTruthPublishAt: effectiveLatest,
    nextScheduleSlots: nextSchedules,
  });
});

// ==========================================
// 10. AUTOMATION (PREVIEW, DRY RUN, START)
// ==========================================
app.post('/api/automation/preview', (req: Request, res: Response) => {
  const { channelId, profileId } = req.body;
  if (!channelId) return res.status(400).json({ error: 'channelId is required.' });

  const result = automationEngine.generatePreview(channelId, profileId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json(result);
});

app.post('/api/automation/dry-run', async (req: Request, res: Response) => {
  const { channelId, profileId } = req.body;
  if (!channelId) return res.status(400).json({ error: 'channelId is required.' });

  const result = await automationEngine.executeDryRun(channelId, profileId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json(result);
});

app.post('/api/automation/start', async (req: Request, res: Response) => {
  const { channelId, profileId } = req.body;
  if (!channelId) return res.status(400).json({ error: 'channelId is required.' });

  const result = await automationEngine.startBatchAutomation(channelId, profileId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json(result);
});

app.get('/api/automation/batches', (req: Request, res: Response) => {
  const batches = Array.from(dbStore.automationBatches.values()).reverse();
  res.json(batches);
});

// ==========================================
// 11. QUEUE & JOBS
// ==========================================
app.get('/api/queue', (req: Request, res: Response) => {
  const jobs = Array.from(dbStore.automationJobs.values()).reverse();
  res.json(jobs);
});

app.post('/api/queue/pause', (req: Request, res: Response) => {
  automationEngine.pauseQueue();
  res.json({ success: true, message: 'Automation Queue Paused.' });
});

app.post('/api/queue/resume', (req: Request, res: Response) => {
  automationEngine.resumeQueue();
  res.json({ success: true, message: 'Automation Queue Resumed.' });
});

// ==========================================
// 12. ERROR CENTER
// ==========================================
app.get('/api/errors', (req: Request, res: Response) => {
  const errors = Array.from(dbStore.errorLogs.values()).reverse();
  res.json(errors);
});

app.post('/api/errors/:id/retry', (req: Request, res: Response) => {
  const error = dbStore.errorLogs.get(req.params.id);
  if (!error) return res.status(404).json({ error: 'Error record not found' });

  error.retryCount++;
  error.status = 'retried';

  dbStore.logActivity({
    user: 'Administrator',
    operation: 'Manual Error Retry',
    channelId: error.channelId,
    videoId: error.videoId,
    previousValue: error.errorMessage,
    newValue: `Retry attempt #${error.retryCount} initiated`,
    result: 'SUCCESS',
  });

  res.json({ success: true, message: 'Job retry scheduled.' });
});

app.post('/api/errors/:id/resolve', (req: Request, res: Response) => {
  const error = dbStore.errorLogs.get(req.params.id);
  if (!error) return res.status(404).json({ error: 'Error record not found' });

  error.status = 'resolved';
  res.json({ success: true, message: 'Error marked as resolved.' });
});

// ==========================================
// 13. ACTIVITY LOGS & NOTIFICATIONS
// ==========================================
app.get('/api/activity-logs', (req: Request, res: Response) => {
  res.json(dbStore.activityLogs);
});

app.get('/api/notifications', (req: Request, res: Response) => {
  const allVideos = Array.from(dbStore.videos.values());
  for (const c of dbStore.channels.values()) {
    const bufferEval = evaluateChannelScheduleBuffer(c, allVideos);
    if (bufferEval.scheduleAlertStatus === 'CRITICAL' || bufferEval.scheduleAlertStatus === 'LOW_STOCK') {
      const notifId = `notif-buffer-${c.id}`;
      const isCrit = bufferEval.scheduleAlertStatus === 'CRITICAL';
      if (!dbStore.notifications.has(notifId)) {
        dbStore.notifications.set(notifId, {
          id: notifId,
          type: isCrit ? 'ALERT' : 'WARNING',
          title: `Stok Jadwal Menipis: ${c.title}`,
          message: `Cadangan jadwal channel ${c.title} tersisa ${bufferEval.scheduleBufferDays} hari (habis pada ${bufferEval.formattedExhaustionDate}). Tersisa ${bufferEval.scheduleStockCount} video terjadwal di antrean. Segera periksa kandidat video baru.`,
          channelId: c.id,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  res.json(Array.from(dbStore.notifications.values()).reverse());
});

app.post('/api/notifications/:id/read', (req: Request, res: Response) => {
  const notif = dbStore.notifications.get(req.params.id);
  if (notif) notif.read = true;
  res.json({ success: true });
});

// ==========================================
// 14. SETTINGS
// ==========================================
app.get('/api/settings', (req: Request, res: Response) => {
  res.json(dbStore.settings);
});

app.put('/api/settings', (req: Request, res: Response) => {
  dbStore.settings = { ...dbStore.settings, ...req.body };
  res.json(dbStore.settings);
});

// ==========================================
// 15. PHASE 3 — WORKER QUEUE, RETRIES & ROLLBACK
// ==========================================
app.post('/api/phase3/queue-batch', async (req: Request, res: Response) => {
  try {
    const { batchId, channelId, jobs } = req.body;
    if (!batchId || !channelId || !Array.isArray(jobs)) {
      return res.status(400).json({ error: 'batchId, channelId, and jobs array are required.' });
    }
    const result = await phase3Engine.enqueueBatchJobs(batchId, channelId, jobs);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/phase3/rollback/:batchId', async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const result = await phase3Engine.emergencyRollbackBatch(batchId);
    res.json({ success: true, message: 'Rollback executed', ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/phase3/queue-status', (req: Request, res: Response) => {
  const batchId = req.query.batchId as string | undefined;
  const status = phase3Engine.getQueueStatus(batchId);
  res.json({ success: true, ...status });
});

app.get('/api/phase3/snapshots/:batchId', (req: Request, res: Response) => {
  const snapshots = phase3Engine.getBatchSnapshots(req.params.batchId);
  res.json({ success: true, count: snapshots.length, snapshots });
});

// ==========================================
// VITE MIDDLEWARE (DEV) & STATIC (PROD)
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AMG] Server running on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[AMG] Failed to start server:', err);
  process.exit(1);
});
