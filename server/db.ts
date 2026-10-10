/**
 * Database Service for AMG
 * Stores and manages all entities conforming to firebase-blueprint.json.
 * Supports Firestore schema mappings with persistent in-memory repository.
 */

import fs from 'fs';
import path from 'path';
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
  ThumbnailActionLog,
} from '../src/types/index.js';

export interface UserRecord {
  id: string;
  email: string;
  username?: string;
  role: 'PRIMARY_OWNER' | 'USER';
  passwordHash: string;
  masterKeyHash?: string;
  workspaceId: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  email: string;
  role: 'PRIMARY_OWNER' | 'USER';
  workspaceId: string;
  deviceInfo: string;
  ipAddress: string;
  createdAt: string;
  expiresAt: string;
  lastActiveAt: string;
  isRevoked: boolean;
}

export interface UserAccessRequest {
  id: string;
  email: string;
  username?: string;
  accessCodeHash: string;
  status: 'PENDING' | 'APPROVED' | 'EXPIRED' | 'REJECTED';
  requestedAt: string;
  expiresAt: string;
  attempts: number;
  usedAt?: string;
}

export interface WorkspaceRecord {
  id: string;
  ownerId: string;
  name: string;
  type: 'OWNER_WORKSPACE' | 'USER_WORKSPACE';
  createdAt: string;
}

class DatabaseStore {
  public channels: Map<string, Channel> = new Map();
  public profiles: Map<string, ContentProfile> = new Map();
  public masterTitles: Map<string, MasterTitle> = new Map();
  public masterThumbnails: Map<string, MasterThumbnail> = new Map();
  public videos: Map<string, ManagedVideo> = new Map();
  public automationBatches: Map<string, AutomationBatch> = new Map();
  public automationJobs: Map<string, AutomationJob> = new Map();
  public errorLogs: Map<string, ErrorLog> = new Map();
  public activityLogs: ActivityLog[] = [];
  public thumbnailActionLogs: ThumbnailActionLog[] = [];
  public notifications: Map<string, NotificationItem> = new Map();
  public users: Map<string, UserRecord> = new Map();
  public workspaces: Map<string, WorkspaceRecord> = new Map();
  public sessions: Map<string, SessionRecord> = new Map();
  public accessRequests: Map<string, UserAccessRequest> = new Map();
  public settings: SystemSettings = {
    defaultTimezone: 'Asia/Jakarta',
    defaultPublishTime: '16:00',
    defaultFrequency: '1/day',
    autoSyncIntervalMinutes: 30,
    maxRetries: 3,
    apiQuotaDailyLimit: 10000,
    apiQuotaUsed: 0,
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecretConfigured: !!process.env.GOOGLE_CLIENT_SECRET,
    youtubeApiKeyConfigured: !!process.env.YOUTUBE_API_KEY,
  };

  public getOwnerAuthFileCandidates(): string[] {
    return [
      path.resolve(process.cwd(), 'data/owner_auth.json'),
      path.resolve(process.cwd(), 'server/data/owner_auth.json'),
      '/app/applet/data/owner_auth.json',
      '/app/applet/server/data/owner_auth.json',
    ];
  }

  public loadOwnerAuthFromDisk(): boolean {
    for (const filePath of this.getOwnerAuthFileCandidates()) {
      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(raw);
          if (data && data.owner && data.owner.email && data.owner.passwordHash) {
            this.users.set(data.owner.id, data.owner);
            if (data.workspace) {
              this.workspaces.set(data.workspace.id, data.workspace);
            }
            if (Array.isArray(data.sessions)) {
              for (const s of data.sessions) {
                if (s && s.id && !s.isRevoked) {
                  this.sessions.set(s.id, s);
                }
              }
            }
            return true;
          }
        } catch (e) {
          console.warn('[DatabaseStore] Could not parse owner auth file:', filePath, e);
        }
      }
    }
    return false;
  }

  public saveOwnerAuthToDisk(): void {
    const owner = this.getPrimaryOwner();
    if (!owner) return;
    const workspace = this.workspaces.get(owner.workspaceId) || {
      id: owner.workspaceId,
      ownerId: owner.id,
      name: `Owner Workspace (${owner.email})`,
      type: 'OWNER_WORKSPACE' as const,
      createdAt: owner.createdAt || new Date().toISOString(),
    };
    const activeSessions = Array.from(this.sessions.values()).filter(
      (s) => s.userId === owner.id && !s.isRevoked
    );

    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      owner,
      workspace,
      sessions: activeSessions,
    };

    const targetDirs = [
      path.resolve(process.cwd(), 'data'),
      path.resolve(process.cwd(), 'server/data'),
    ];

    for (const dir of targetDirs) {
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, 'owner_auth.json');
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
      } catch (e) {
        console.warn('[DatabaseStore] Could not write owner auth file to:', dir, e);
      }
    }
  }

  public isOwnerProvisioned(): boolean {
    for (const u of this.users.values()) {
      if (u.role === 'PRIMARY_OWNER') {
        return true;
      }
    }
    if (this.loadOwnerAuthFromDisk()) {
      return true;
    }
    return false;
  }

  public getPrimaryOwner(): UserRecord | null {
    for (const u of this.users.values()) {
      if (u.role === 'PRIMARY_OWNER') {
        return u;
      }
    }
    if (this.loadOwnerAuthFromDisk()) {
      for (const u of this.users.values()) {
        if (u.role === 'PRIMARY_OWNER') {
          return u;
        }
      }
    }
    return null;
  }

  public getOnlineUsersCount(): number {
    const now = Date.now();
    const activeWindowMs = 15 * 60 * 1000; // 15 minutes window
    const onlineUserIds = new Set<string>();

    for (const session of this.sessions.values()) {
      if (
        session &&
        !session.isRevoked &&
        new Date(session.expiresAt).getTime() > now
      ) {
        const lastActiveTime = new Date(session.lastActiveAt || session.createdAt).getTime();
        if (now - lastActiveTime <= activeWindowMs) {
          onlineUserIds.add(session.userId);
        }
      }
    }
    // Return distinct online users count (minimum 1 if at least one unrevoked session exists)
    return Math.max(onlineUserIds.size, 1);
  }

  public isUserOnline(userId: string): boolean {
    const now = Date.now();
    const activeWindowMs = 15 * 60 * 1000;

    for (const session of this.sessions.values()) {
      if (
        session &&
        session.userId === userId &&
        !session.isRevoked &&
        new Date(session.expiresAt).getTime() > now
      ) {
        const lastActiveTime = new Date(session.lastActiveAt || session.createdAt).getTime();
        if (now - lastActiveTime <= activeWindowMs) {
          return true;
        }
      }
    }
    return false;
  }

  private dbFilePath: string;

  constructor() {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (e) {
        console.error('[DatabaseStore] Could not create data directory:', e);
      }
    }
    this.dbFilePath = path.join(dataDir, 'amg-database.json');
    this.initDatabase();
  }

  private initDatabase() {
    if (fs.existsSync(this.dbFilePath)) {
      try {
        const raw = fs.readFileSync(this.dbFilePath, 'utf8');
        const data = JSON.parse(raw);
        if (data.channels && Array.isArray(data.channels)) {
          this.channels = new Map(data.channels);
        }
        if (data.profiles && Array.isArray(data.profiles)) {
          this.profiles = new Map(data.profiles);
        }
        if (data.masterTitles && Array.isArray(data.masterTitles)) {
          this.masterTitles = new Map(data.masterTitles);
        }
        if (data.masterThumbnails && Array.isArray(data.masterThumbnails)) {
          this.masterThumbnails = new Map(data.masterThumbnails);
        }
        if (data.videos && Array.isArray(data.videos)) {
          this.videos = new Map(data.videos);
        }
        if (data.automationBatches && Array.isArray(data.automationBatches)) {
          this.automationBatches = new Map(data.automationBatches);
        }
        if (data.automationJobs && Array.isArray(data.automationJobs)) {
          this.automationJobs = new Map(data.automationJobs);
        }
        if (data.errorLogs && Array.isArray(data.errorLogs)) {
          this.errorLogs = new Map(data.errorLogs);
        }
        if (data.activityLogs && Array.isArray(data.activityLogs)) {
          this.activityLogs = data.activityLogs;
        }
        if (data.thumbnailActionLogs && Array.isArray(data.thumbnailActionLogs)) {
          this.thumbnailActionLogs = data.thumbnailActionLogs;
        }
        if (data.notifications && Array.isArray(data.notifications)) {
          this.notifications = new Map(data.notifications);
        }
        if (data.users && Array.isArray(data.users)) {
          this.users = new Map(data.users);
        }
        if (data.workspaces && Array.isArray(data.workspaces)) {
          this.workspaces = new Map(data.workspaces);
        }
        if (data.sessions && Array.isArray(data.sessions)) {
          this.sessions = new Map(data.sessions);
        }
        if (data.accessRequests && Array.isArray(data.accessRequests)) {
          this.accessRequests = new Map(data.accessRequests);
        }
        if (data.settings) {
          this.settings = { ...this.settings, ...data.settings };
        }
        console.log(`[DatabaseStore] Loaded persistent database: ${this.channels.size} channels, ${this.videos.size} videos from ${this.dbFilePath}`);
        this.clearSeededData();
        this.sanitizeBlockIntegrity();
        this.sanitizeStaleBatches();
        this.loadOwnerAuthFromDisk();
        return;
      } catch (err) {
        console.error('[DatabaseStore] Failed to parse existing database file, seeding default:', err);
      }
    }

    // Seed master configurations only if file does not exist
    this.seedInitialData();
    this.clearSeededData();
    this.sanitizeStaleBatches();
    this.loadOwnerAuthFromDisk();
    this.saveToDisk();
  }

  public sanitizeBlockIntegrity(): void {
    let changed = false;

    // 1. Ensure Profile AYAM WARNA-WARNI exists and is strictly isolated
    const ayamProfile = this.profiles.get('profile-ayam-warna');
    if (ayamProfile) {
      if (ayamProfile.name !== 'AYAM WARNA-WARNI' || ayamProfile.nicheCategory !== 'Ayam Warna Warni') {
        ayamProfile.name = 'AYAM WARNA-WARNI';
        ayamProfile.nicheCategory = 'Ayam Warna Warni';
        ayamProfile.blockId = 'profile-ayam-warna';
        changed = true;
      }
      const hasRainTitle = ayamProfile.masterTitleIds.some(id => id.startsWith('title-'));
      if (hasRainTitle || ayamProfile.masterTitleIds.length === 0) {
        ayamProfile.masterTitleIds = [];
        ayamProfile.masterThumbnailIds = [];
        changed = true;
      }
    }

    // 2. Ensure Profile SUARA ALAM & ASMR HUJAN exists as a separate block
    if (!this.profiles.has('profile-relaksasi')) {
      this.profiles.set('profile-relaksasi', {
        id: 'profile-relaksasi',
        blockId: 'profile-relaksasi',
        name: 'SUARA ALAM & ASMR HUJAN',
        description: 'Blok rotasi khusus konten relaksasi, suara hujan malam, dan musik alam.',
        nicheCategory: 'Music',
        nicheBadge: 'cyan',
        publishFrequency: '1/day',
        publishTime: '16:00',
        timezone: 'Asia/Jakarta',
        scheduleConfig: {
          mode: 'DAILY',
          videosPerDay: 1,
          times: ['16:00'],
          timezone: 'Asia/Jakarta',
          startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
        },
        masterTitleIds: [],
        masterThumbnailIds: [],
        assignedChannelCount: 0,
        createdAt: '2026-09-15T08:00:00.000Z',
        updatedAt: '2026-09-20T08:00:00.000Z',
      });
      changed = true;
    }

    // 3. Ensure any user-created Master Titles and Thumbnails retain correct blockId
    for (const t of this.masterTitles.values()) {
      if (!t.blockId && t.profileId) {
        t.blockId = t.profileId;
        changed = true;
      }
    }
    for (const th of this.masterThumbnails.values()) {
      if (!th.blockId && th.profileId) {
        th.blockId = th.profileId;
        changed = true;
      }
    }

    // Sync profiles masterTitleIds and masterThumbnailIds strictly with existing user items
    for (const p of this.profiles.values()) {
      const validTitleIds = Array.from(this.masterTitles.values())
        .filter(t => t.profileId === p.id || t.blockId === p.id)
        .map(t => t.id);
      const validThumbIds = Array.from(this.masterThumbnails.values())
        .filter(th => th.profileId === p.id || th.blockId === p.id)
        .map(th => th.id);
      p.masterTitleIds = validTitleIds;
      p.masterThumbnailIds = validThumbIds;
    }

    // 4. Ensure all channels have blockId set
    for (const ch of this.channels.values()) {
      if (!ch.blockId && ch.contentProfileId) {
        ch.blockId = ch.contentProfileId;
        changed = true;
      }
    }

    // 5. Ensure all videos have blockId set
    for (const v of this.videos.values()) {
      const ch = this.channels.get(v.channelId);
      const targetBlockId = ch?.blockId || ch?.contentProfileId || v.contentProfileId || v.blockId;
      if (targetBlockId && v.blockId !== targetBlockId) {
        v.blockId = targetBlockId;
        changed = true;
      }
    }

    if (changed) {
      console.log('[DatabaseStore] Cleaned and sanitized block isolation integrity across database.');
      this.saveToDisk();
    }
  }

  public saveToDisk(): void {
    try {
      const dataDir = path.dirname(this.dbFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const serialized = {
        version: 1,
        savedAt: new Date().toISOString(),
        channels: Array.from(this.channels.entries()),
        profiles: Array.from(this.profiles.entries()),
        masterTitles: Array.from(this.masterTitles.entries()),
        masterThumbnails: Array.from(this.masterThumbnails.entries()),
        videos: Array.from(this.videos.entries()),
        automationBatches: Array.from(this.automationBatches.entries()),
        automationJobs: Array.from(this.automationJobs.entries()),
        errorLogs: Array.from(this.errorLogs.entries()),
        activityLogs: this.activityLogs.slice(0, 500),
        thumbnailActionLogs: this.thumbnailActionLogs.slice(-5000),
        notifications: Array.from(this.notifications.entries()),
        users: Array.from(this.users.entries()),
        workspaces: Array.from(this.workspaces.entries()),
        sessions: Array.from(this.sessions.entries()),
        accessRequests: Array.from(this.accessRequests.entries()),
        settings: this.settings,
      };

      const tempFile = `${this.dbFilePath}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(serialized, null, 2), 'utf8');
      fs.renameSync(tempFile, this.dbFilePath);
    } catch (err) {
      console.error('[DatabaseStore] Error writing database to disk:', err);
    }
  }

  public upsertChannel(channel: Channel): Channel {
    const existing = this.getChannelByYoutubeId(channel.youtubeChannelId) || this.channels.get(channel.id);
    const dailyCapacity = Math.min(channel.dailyCapacityTarget || existing?.dailyCapacityTarget || 70, 90);
    const maxCapacity = 90;

    if (existing) {
      const updated: Channel = {
        ...existing,
        ...channel,
        id: existing.id,
        youtubeChannelId: channel.youtubeChannelId || existing.youtubeChannelId,
        dailyCapacityTarget: dailyCapacity,
        maxDailyCapacity: maxCapacity,
        connectedAt: existing.connectedAt || channel.connectedAt || new Date().toISOString(),
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
        status: channel.status || 'CONNECTED',
        isSeeded: false, // Confirmed permanent user channel
      };
      this.channels.set(existing.id, updated);
      this.saveToDisk();
      return updated;
    }

    const newChan: Channel = {
      ...channel,
      dailyCapacityTarget: dailyCapacity,
      maxDailyCapacity: maxCapacity,
      status: channel.status || 'CONNECTED',
      connectedAt: channel.connectedAt || new Date().toISOString(),
      createdAt: channel.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSeeded: false,
    };
    this.channels.set(newChan.id, newChan);
    this.saveToDisk();
    return newChan;
  }

  /**
   * Records a thumbnail action event for rolling 24-hour rate limit tracking
   */
  public logThumbnailAction(item: Omit<ThumbnailActionLog, 'id'>): ThumbnailActionLog {
    const log: ThumbnailActionLog = {
      id: `thumb-act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      ...item,
    };
    this.thumbnailActionLogs.push(log);
    if (this.thumbnailActionLogs.length > 10000) {
      this.thumbnailActionLogs.splice(0, this.thumbnailActionLogs.length - 10000);
    }
    this.saveToDisk();
    return log;
  }

  /**
   * Returns all thumbnail actions for a channel within a rolling time window (default 24h)
   */
  public getThumbnailActionsInWindow(channelId: string, windowMs: number = 24 * 60 * 60 * 1000): ThumbnailActionLog[] {
    const cutoff = Date.now() - windowMs;
    const norm = channelId.trim().toLowerCase();
    return this.thumbnailActionLogs.filter((l) => {
      const match =
        l.channelId.toLowerCase() === norm ||
        l.channelId.toLowerCase() === `chan-${norm}` ||
        `chan-${l.channelId.toLowerCase()}` === norm;
      return match && new Date(l.timestamp).getTime() >= cutoff;
    });
  }

  /**
   * Returns count of successful thumbnail mutations in the rolling 24-hour window
   */
  public getSuccessfulThumbnailCountLast24h(channelId: string): number {
    const actions = this.getThumbnailActionsInWindow(channelId, 24 * 60 * 60 * 1000);
    return actions.filter((a) => a.status === 'SUCCESS').length;
  }

  /**
   * Checks whether thumbnail upload should be throttled based on rolling 24h capacity or active YouTube limit
   */
  public isChannelThumbnailRateLimited(channelId: string): {
    isLimited: boolean;
    reason?: string;
    usedLast24h: number;
    targetCapacity: number;
    resetInMs?: number;
  } {
    const channel = this.getChannelByIdOrTitle(channelId) || this.getChannelByYoutubeId(channelId);
    const targetCapacity = Math.min(channel?.dailyCapacityTarget || 70, 90);
    const usedLast24h = this.getSuccessfulThumbnailCountLast24h(channel?.id || channelId);

    // 1. Check AMG rolling 24h configured limit
    if (usedLast24h >= targetCapacity) {
      const logs = this.getThumbnailActionsInWindow(channel?.id || channelId, 24 * 60 * 60 * 1000).filter(
        (l) => l.status === 'SUCCESS'
      );
      const oldestTimestamp = logs.length > 0 ? new Date(logs[0].timestamp).getTime() : Date.now();
      const resetInMs = Math.max(0, oldestTimestamp + 24 * 60 * 60 * 1000 - Date.now());
      return {
        isLimited: true,
        reason: `AMG CAPACITY LIMIT: Rolling 24-hour target reached (${usedLast24h}/${targetCapacity} thumbnails) for channel "${channel?.title || channelId}".`,
        usedLast24h,
        targetCapacity,
        resetInMs,
      };
    }

    // 2. Check if YouTube returned a hard quota or custom thumbnail limit
    if (channel?.thumbnailRateLimitReachedAt) {
      const limitAge = Date.now() - new Date(channel.thumbnailRateLimitReachedAt).getTime();
      const FOUR_HOURS = 4 * 60 * 60 * 1000;
      if (limitAge < FOUR_HOURS) {
        return {
          isLimited: true,
          reason: `YOUTUBE RATE LIMIT ACTIVE: YouTube reported custom thumbnail limit reached at ${channel.thumbnailRateLimitReachedAt}. Throttling thumbnail mutations.`,
          usedLast24h,
          targetCapacity,
          resetInMs: Math.max(0, FOUR_HOURS - limitAge),
        };
      } else {
        // Window expired, clear the lock
        channel.thumbnailRateLimitReachedAt = undefined;
        this.saveToDisk();
      }
    }

    return {
      isLimited: false,
      usedLast24h,
      targetCapacity,
    };
  }

  /**
   * Returns capacity and throttling telemetry for a channel
   */
  public getChannelCapacityStatus(channelId: string): {
    channelId: string;
    channelTitle: string;
    dailyCapacityTarget: number;
    maxDailyCapacity: number;
    thumbnailActionsLast24h: number;
    remainingDailyCapacity: number;
    isRateLimited: boolean;
    rateLimitReason?: string;
    resetInMinutes?: number;
  } {
    const channel = this.getChannelByIdOrTitle(channelId) || this.getChannelByYoutubeId(channelId);
    const target = Math.min(channel?.dailyCapacityTarget || 70, 90);
    const check = this.isChannelThumbnailRateLimited(channel?.id || channelId);
    const remaining = Math.max(0, target - check.usedLast24h);

    return {
      channelId: channel?.id || channelId,
      channelTitle: channel?.title || 'Unknown Channel',
      dailyCapacityTarget: target,
      maxDailyCapacity: 90,
      thumbnailActionsLast24h: check.usedLast24h,
      remainingDailyCapacity: check.isLimited ? 0 : remaining,
      isRateLimited: check.isLimited,
      rateLimitReason: check.reason,
      resetInMinutes: check.resetInMs ? Math.ceil(check.resetInMs / 60000) : undefined,
    };
  }

  public getChannelByYoutubeId(youtubeChannelId: string): Channel | undefined {
    if (!youtubeChannelId) return undefined;
    const norm = youtubeChannelId.trim().toLowerCase();
    for (const c of this.channels.values()) {
      if (c.youtubeChannelId && c.youtubeChannelId.trim().toLowerCase() === norm) {
        return c;
      }
    }
    return undefined;
  }

  public getChannelByIdOrTitle(identifier: string): Channel | undefined {
    if (!identifier) return undefined;
    const direct = this.channels.get(identifier);
    if (direct) return direct;

    const norm = identifier.trim().toLowerCase();
    for (const c of this.channels.values()) {
      if (
        c.id.toLowerCase() === norm ||
        (c.youtubeChannelId && c.youtubeChannelId.toLowerCase() === norm) ||
        (c.title && c.title.toLowerCase() === norm)
      ) {
        return c;
      }
    }
    for (const c of this.channels.values()) {
      if (c.title && c.title.toLowerCase().includes(norm)) {
        return c;
      }
    }
    return undefined;
  }

  public getVideoById(id: string): ManagedVideo | undefined {
    if (!id) return undefined;
    const direct = this.videos.get(id);
    if (direct) return direct;

    const norm = id.trim().toLowerCase();
    for (const v of this.videos.values()) {
      if (v.id.toLowerCase() === norm ||
          (v.youtubeVideoId && v.youtubeVideoId.toLowerCase() === norm) ||
          v.id.toLowerCase() === `yt-${norm}` ||
          `yt-${v.youtubeVideoId?.toLowerCase()}` === norm) {
        return v;
      }
    }
    return undefined;
  }

  public sanitizeStaleBatches(): void {
    let changed = false;
    const now = Date.now();
    const fifteenMinutesMs = 15 * 60 * 1000;
    const targetStaleBatchNumbers = new Set(['BAT-7127', 'BAT-3054', 'BAT-2479', '7127', '3054', '2479']);

    for (const [id, batch] of this.automationBatches.entries()) {
      const isTargetStale = targetStaleBatchNumbers.has(batch.batchNumber) || targetStaleBatchNumbers.has(batch.id);
      const isStaleRunning = batch.status === 'running' && (
        !batch.lastHeartbeatAt ||
        (now - new Date(batch.lastHeartbeatAt).getTime() > fifteenMinutesMs) ||
        (now - new Date(batch.startedAt).getTime() > fifteenMinutesMs)
      );

      if (isTargetStale || isStaleRunning) {
        batch.status = 'failed';
        (batch as any).failureReason = isTargetStale 
          ? 'STALE_CLEANED: One-time cleanup of locked legacy batch'
          : 'STALE_TIMEOUT: Inactivity detected (>15m) without active worker heartbeat';
        batch.completedAt = new Date().toISOString();
        this.automationBatches.set(id, batch);
        changed = true;

        // Release any videos locked to this batch
        for (const [vId, v] of this.videos.entries()) {
          if (v.automationBatchId === batch.id || v.automationBatchId === batch.batchNumber) {
            if (v.managementStatus !== 'COMPLETED') {
              v.managementStatus = 'READY';
              v.isManaged = false;
              v.isAmgManaged = false;
              v.automationBatchId = undefined;
              v.scheduledPublishAt = undefined;
              v.updatedAt = new Date().toISOString();
              this.videos.set(vId, v);
            }
          }
        }
      }
    }

    if (changed) {
      console.log('[DatabaseStore] Sanitized stale batches and released video locks.');
      this.saveToDisk();
    }
  }

  private seedInitialData() {
    const profileId = 'profile-ayam-warna';

    // 1a. Content Profile: AYAM WARNA-WARNI (Niche: Ayam Warna Warni)
    this.profiles.set(profileId, {
      id: profileId,
      blockId: profileId,
      name: 'AYAM WARNA-WARNI',
      description: 'Master profile for colorful chicks, playful animation, and creative kids series.',
      nicheCategory: 'Ayam Warna Warni',
      nicheBadge: 'amber',
      publishFrequency: '3/day',
      publishTime: '08:00, 14:00, 20:00',
      timezone: 'Asia/Jakarta',
      scheduleConfig: {
        mode: 'CUSTOM_DAILY_TIMES',
        videosPerDay: 3,
        times: ['08:00', '14:00', '20:00'],
        timezone: 'Asia/Jakarta',
        startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
      },
      masterTitleIds: [],
      masterThumbnailIds: [],
      assignedChannelCount: 0,
      createdAt: '2026-09-15T08:00:00.000Z',
      updatedAt: '2026-09-20T08:00:00.000Z',
    });

    // 1b. Content Profile: SUARA ALAM & ASMR HUJAN (Niche: Music / Nature)
    const relaksasiProfileId = 'profile-relaksasi';
    this.profiles.set(relaksasiProfileId, {
      id: relaksasiProfileId,
      blockId: relaksasiProfileId,
      name: 'SUARA ALAM & ASMR HUJAN',
      description: 'Master profile for relaxing ambient audio and rain series videos.',
      nicheCategory: 'Music',
      nicheBadge: 'cyan',
      publishFrequency: '1/day',
      publishTime: '16:00',
      timezone: 'Asia/Jakarta',
      scheduleConfig: {
        mode: 'DAILY',
        videosPerDay: 1,
        times: ['16:00'],
        timezone: 'Asia/Jakarta',
        startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
      },
      masterTitleIds: [],
      masterThumbnailIds: [],
      assignedChannelCount: 0,
      createdAt: '2026-09-15T08:00:00.000Z',
      updatedAt: '2026-09-20T08:00:00.000Z',
    });

    // 1c. Content Profile: ASMR & SOUNDSCAPES (Niche: ASMR)
    const asmrProfileId = 'profile-asmr';
    this.profiles.set(asmrProfileId, {
      id: asmrProfileId,
      name: 'DEEP ASMR SOUNDS',
      description: 'Gentle whispering, rain tapping, and deep binaural triggers.',
      nicheCategory: 'ASMR',
      nicheBadge: 'purple',
      publishFrequency: '1/day',
      publishTime: '21:00',
      timezone: 'Asia/Jakarta',
      scheduleConfig: {
        mode: 'DAILY',
        videosPerDay: 1,
        times: ['21:00'],
        timezone: 'Asia/Jakarta',
        startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
      },
      masterTitleIds: [],
      masterThumbnailIds: [],
      assignedChannelCount: 0,
      createdAt: '2026-09-16T08:00:00.000Z',
      updatedAt: '2026-09-20T08:00:00.000Z',
    });

    // 1d. Content Profile: MUROTTAL AL-QURAN (Niche: Murottal)
    const murottalProfileId = 'profile-murottal';
    this.profiles.set(murottalProfileId, {
      id: murottalProfileId,
      name: 'MUROTTAL MERDU 30 JUZ',
      description: 'Lantunan ayat suci Al-Quran merdu dan terjemahan bahasa Indonesia.',
      nicheCategory: 'Murottal',
      nicheBadge: 'emerald',
      publishFrequency: '2/day',
      publishTime: '05:00, 18:00',
      timezone: 'Asia/Jakarta',
      scheduleConfig: {
        mode: 'CUSTOM_DAILY_TIMES',
        videosPerDay: 2,
        times: ['05:00', '18:00'],
        timezone: 'Asia/Jakarta',
        startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
      },
      masterTitleIds: [],
      masterThumbnailIds: [],
      assignedChannelCount: 0,
      createdAt: '2026-09-17T08:00:00.000Z',
      updatedAt: '2026-09-20T08:00:00.000Z',
    });
  }

  public logActivity(item: Omit<ActivityLog, 'id' | 'timestamp'>) {
    const log: ActivityLog = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...item,
    };
    this.activityLogs.unshift(log);
    // Keep max 500 logs
    if (this.activityLogs.length > 500) {
      this.activityLogs.pop();
    }
    this.saveToDisk();
    return log;
  }

  public logError(item: Omit<ErrorLog, 'id' | 'timestamp' | 'status'>) {
    const error: ErrorLog = {
      id: `err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      status: 'open',
      ...item,
    };
    this.errorLogs.set(error.id, error);
    this.saveToDisk();
    return error;
  }

  /**
   * Cleans all mock/demo fixtures from memory store, leaving only real production YouTube data.
   */
  public clearSeededData(): { removedChannels: number; removedVideos: number; removedBatches: number } {
    let removedChannels = 0;
    let removedVideos = 0;
    let removedBatches = 0;

    for (const [id, c] of this.channels.entries()) {
      const isFixture =
        c.isSeeded ||
        id === 'chan-ayam-warna' ||
        id === 'chan-suara-alam' ||
        id === 'chan-whisper-asmr' ||
        id === 'chan-murottal-quran' ||
        id === 'chan-1790528541320' ||
        id === 'chan-1790528541332' ||
        id === 'chan-1791049429497' ||
        c.title?.toLowerCase().includes('ayam yahya') ||
        c.title?.includes('[DEMO FIXTURE]') ||
        c.title?.includes('Demo Fixture') ||
        c.title?.toLowerCase().includes('fixture');

      if (isFixture) {
        this.channels.delete(id);
        removedChannels++;
      }
    }

    for (const [id, v] of this.videos.entries()) {
      const isFixture =
        v.isSeeded ||
        id.startsWith('vid-m-') ||
        id.startsWith('vid-old-') ||
        id.startsWith('vid-cand-') ||
        id.startsWith('vid-wrong-') ||
        id.startsWith('vid-personal-') ||
        id.startsWith('vid-test-') ||
        id.startsWith('vid-') ||
        id === 'vid-1' ||
        id === 'vid-2' ||
        id === 'vid-3' ||
        id === 'vid-4' ||
        id === 'vid-5' ||
        id === 'vid-6' ||
        id === 'vid-7' ||
        id === 'vid-8' ||
        v.titleBefore?.toLowerCase().includes('suara ayam pagi menenangkan') ||
        v.titleBefore?.toLowerCase().includes('[demo fixture]') ||
        v.titleBefore?.includes('[DEMO FIXTURE]') ||
        v.channelTitle?.includes('[DEMO FIXTURE]');

      if (isFixture) {
        this.videos.delete(id);
        removedVideos++;
      }
    }

    for (const [id, b] of this.automationBatches.entries()) {
      const isFixture =
        b.isSeeded ||
        id.startsWith('batch-001') ||
        id.startsWith('batch-002') ||
        b.channelId === 'chan-ayam-warna' ||
        b.channelId === 'chan-suara-alam';

      if (isFixture) {
        this.automationBatches.delete(id);
        removedBatches++;
      }
    }

    // Purge fake notifications referencing fixtures
    for (const [id, n] of this.notifications.entries()) {
      if (
        id === 'notif-1' ||
        id.startsWith('notif-buffer-chan-ayam-warna') ||
        id.startsWith('notif-buffer-chan-suara-alam') ||
        id.startsWith('notif-buffer-chan-whisper-asmr') ||
        id.startsWith('notif-buffer-chan-murottal-quran') ||
        id.startsWith('notif-buffer-chan-1790528541320') ||
        id.startsWith('notif-buffer-chan-1790528541332') ||
        n.channelId === 'chan-ayam-warna' ||
        n.channelId === 'chan-suara-alam'
      ) {
        this.notifications.delete(id);
      }
    }

    // Purge fake activity logs referencing fixtures
    this.activityLogs = this.activityLogs.filter(
      (l) =>
        l.channelId !== 'chan-ayam-warna' &&
        l.channelId !== 'chan-suara-alam' &&
        l.channelId !== 'chan-1790528541320' &&
        l.channelId !== 'chan-1790528541332' &&
        !l.channelTitle?.includes('[DEMO FIXTURE]') &&
        !l.channelTitle?.toLowerCase().includes('fixture')
    );

    // Purge fake preset titles
    const presetTitleIds = new Set([
      'ayam-t-1', 'ayam-t-2', 'ayam-t-3',
      'title-1', 'title-2', 'title-3',
      'asmr-t-1', 'asmr-t-2',
      'murottal-t-1', 'murottal-t-2',
    ]);
    for (const [id, t] of this.masterTitles.entries()) {
      if (presetTitleIds.has(id) || t.text?.includes('Tidur Nyenyak dengan Suara Hujan') || t.text?.includes('Ayam Warna-Warni Lucu')) {
        this.masterTitles.delete(id);
      }
    }

    // Purge fake preset thumbnails
    const presetThumbIds = new Set([
      'ayam-th-1', 'ayam-th-2', 'ayam-th-3',
      'thumb-1', 'thumb-2', 'thumb-3', 'thumb-4',
      'asmr-th-1', 'asmr-th-2',
      'murottal-th-1', 'murottal-th-2',
    ]);
    for (const [id, th] of this.masterThumbnails.entries()) {
      if (presetThumbIds.has(id) || th.url?.includes('images.unsplash.com')) {
        this.masterThumbnails.delete(id);
      }
    }

    // Sync profile assignedChannelCount with actual existing channels
    for (const profile of this.profiles.values()) {
      let count = 0;
      for (const ch of this.channels.values()) {
        if (ch.contentProfileId === profile.id || ch.blockId === profile.id) {
          count++;
        }
      }
      profile.assignedChannelCount = count;
    }

    this.saveToDisk();
    return { removedChannels, removedVideos, removedBatches };
  }

  /**
   * Updates management scope for a single video.
   */
  public updateVideoScope(
    videoId: string,
    scope: 'REGULAR' | 'EXCLUDED' | 'UNCLASSIFIED',
    exclusionReason?: string,
    assignedBy: string = 'USER'
  ): ManagedVideo | null {
    const video = this.videos.get(videoId);
    if (!video) return null;

    video.managementScope = scope;
    video.isAmgEligible = scope === 'REGULAR';
    video.scopeAssignedAt = new Date().toISOString();
    video.scopeAssignedBy = assignedBy;
    video.exclusionReason = scope === 'EXCLUDED' ? (exclusionReason || 'Excluded by user') : undefined;
    video.updatedAt = new Date().toISOString();

    // If now eligible and unmanaged, set to READY; if excluded, keep or set DISCOVERED
    if (scope === 'REGULAR' && !video.isManaged && video.processingStatus === 'processed') {
      video.managementStatus = 'READY';
    }

    return video;
  }

  /**
   * Bulk updates management scope for multiple videos.
   */
  public bulkUpdateVideoScope(
    videoIds: string[],
    scope: 'REGULAR' | 'EXCLUDED' | 'UNCLASSIFIED',
    exclusionReason?: string,
    assignedBy: string = 'USER'
  ): { updatedCount: number; videos: ManagedVideo[] } {
    const updated: ManagedVideo[] = [];
    for (const id of videoIds) {
      const v = this.updateVideoScope(id, scope, exclusionReason, assignedBy);
      if (v) updated.push(v);
    }
    return { updatedCount: updated.length, videos: updated };
  }

  /**
   * Returns a breakdown of video counts by management scope for a channel.
   */
  public getVideoScopeSummary(channelId: string): {
    includedCount: number;
    excludedCount: number;
    needsScopeAssignmentCount: number;
    totalDetected: number;
  } {
    let includedCount = 0;
    let excludedCount = 0;
    let needsScopeAssignmentCount = 0;
    let totalDetected = 0;

    for (const v of this.videos.values()) {
      if (v.channelId === channelId) {
        totalDetected++;
        if (v.managementScope === 'REGULAR' && v.isAmgEligible) {
          includedCount++;
        } else if (v.managementScope === 'EXCLUDED' || !v.isAmgEligible) {
          if (v.managementScope === 'UNCLASSIFIED') {
            needsScopeAssignmentCount++;
          } else {
            excludedCount++;
          }
        }
      }
    }

    return {
      includedCount,
      excludedCount,
      needsScopeAssignmentCount,
      totalDetected,
    };
  }
}

export const dbStore = new DatabaseStore();
