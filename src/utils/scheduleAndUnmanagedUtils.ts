import { Channel, ManagedVideo } from '../types/index.ts';

/**
 * Formats an ISO date string to Indonesian WIB (Asia/Jakarta, UTC+7) format.
 * Example output: "2 Jan 2027, 08:00 WIB"
 */
export function formatWibDateTime(isoDate?: string | null): string {
  if (!isoDate) return 'Belum ada jadwal terverifikasi';

  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return 'Belum ada jadwal terverifikasi';

    const formatter = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.format(d).replace(/\./g, ':');
    return `${parts} WIB`;
  } catch {
    return 'Belum ada jadwal terverifikasi';
  }
}

/**
 * Checks if a video belongs to a specific channel, safely matching across:
 * - c.id
 * - c.youtubeChannelId
 * - prefixed IDs ('chan-...')
 */
export function isVideoOfChannel(v: ManagedVideo, channel: Channel): boolean {
  if (!channel || !v) return false;
  const vidChan = v.channelId || '';
  const cId = channel.id || '';
  const yId = channel.youtubeChannelId || '';

  if (vidChan === cId) return true;
  if (yId && vidChan === yId) return true;
  if (yId && vidChan === `chan-${yId}`) return true;
  if (cId.startsWith('chan-') && vidChan === cId.replace('chan-', '')) return true;
  if (vidChan.startsWith('chan-') && vidChan.replace('chan-', '') === cId) return true;

  return false;
}

/**
 * Strict evaluation of whether a video belongs to "Sisa Video Private (Belum Dikelola AMG)".
 *
 * Mandatory criteria:
 * 1. PRIVACY: privacyStatus === 'private'
 * 2. EXCLUSION 1: publishAt must be null/empty (video does NOT have a scheduled publish date).
 * 3. EXCLUSION 2: Not previously processed/managed by AMG.
 * 4. EXCLUSION 3 & 4: No Master Title or Master Thumbnail applied via AMG workflow.
 * 5. EXCLUSION 5: Not currently in an active automation workflow (queued, processing, retry, or attached to a batch).
 */
export function isVideoUnmanagedPrivateRaw(v: ManagedVideo): boolean {
  if (!v) return false;

  // CONDITION A — Privacy: Must be private
  const privacy = (v.privacyStatus || '').toLowerCase();
  if (privacy !== 'private') {
    return false;
  }

  // CONDITION B / EXCLUSION 1 — Belum Terjadwal: publishAt == null
  const publishAt = v.publishAt || (v as any).status?.publishAt || v.scheduledPublishAt;
  if (publishAt) {
    const t = new Date(publishAt).getTime();
    if (!isNaN(t) && t > 0) {
      return false; // Already scheduled on YouTube
    }
  }

  // EXCLUSION 2 — Sudah Diproses AMG
  if (v.isManaged === true) {
    return false;
  }
  const status = (v.managementStatus || '').toUpperCase();
  if (
    status === 'MANAGED' ||
    status === 'PROCESSED' ||
    status === 'COMPLETED' ||
    status === 'SCHEDULED' ||
    status === 'EXCLUDED'
  ) {
    return false;
  }
  if ((v as any).processedAt || (v as any).amgProcessedAt) {
    return false;
  }

  // EXCLUSION 3 — Master Title Sudah Diterapkan melalui workflow AMG
  if (
    v.titleAssigned &&
    v.titleAssigned.trim() !== '' &&
    v.titleAssigned !== v.titleBefore
  ) {
    return false;
  }

  // EXCLUSION 4 — Master Thumbnail Sudah Diterapkan melalui workflow AMG
  if (
    v.thumbnailAssigned &&
    v.thumbnailAssigned.trim() !== '' &&
    v.thumbnailAssigned !== v.thumbnailBefore
  ) {
    return false;
  }

  // EXCLUSION 5 — Video Sedang/Sudah Masuk Workflow Automation
  if (status === 'QUEUED' || status === 'PROCESSING' || status === 'RETRY') {
    return false;
  }
  if (v.automationBatchId && v.automationBatchId.trim() !== '') {
    return false;
  }

  // Passes ALL rules: Strictly raw private video waiting to be managed by AMG
  return true;
}

/**
 * Returns the unmanaged raw private videos for a channel.
 */
export function getChannelUnmanagedVideos(channel: Channel, videos: ManagedVideo[] = []): ManagedVideo[] {
  const channelVideos = videos.filter((v) => isVideoOfChannel(v, channel));
  return channelVideos.filter(isVideoUnmanagedPrivateRaw).sort((a, b) => {
    const timeA = new Date(a.originalUploadAt || a.uploadedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.originalUploadAt || b.uploadedAt || b.createdAt || 0).getTime();
    return timeB - timeA;
  });
}

export interface ScheduledAnchorInfo {
  latestPublishAt: string | null;
  latestVideoTitle: string | null;
  latestVideoId: string | null;
  scheduledVideosCount: number;
}

/**
 * Determines the Latest Scheduled Anchor for a channel:
 * - Scans channel videos for privacyStatus === 'private' and valid publishAt.
 * - Identifies the furthest/latest scheduled date into the future.
 * - Falls back to channel.lastScheduledPublishAt / channel.latestManagedScheduledAt.
 */
export function getChannelScheduledAnchor(channel: Channel, videos: ManagedVideo[] = []): ScheduledAnchorInfo {
  const channelVideos = videos.filter((v) => isVideoOfChannel(v, channel));

  let maxTime = 0;
  let latestPublishAt: string | null = null;
  let latestVideoTitle: string | null = null;
  let latestVideoId: string | null = null;
  let count = 0;

  for (const v of channelVideos) {
    const isPrivate = (v.privacyStatus || '').toLowerCase() === 'private';
    if (!isPrivate) continue;

    const pubAt = v.publishAt || (v as any).status?.publishAt || v.scheduledPublishAt;
    if (pubAt) {
      const t = new Date(pubAt).getTime();
      if (!isNaN(t) && t > 0) {
        count++;
        if (t > maxTime) {
          maxTime = t;
          latestPublishAt = pubAt;
          latestVideoTitle = v.titleBefore || v.titleAssigned || v.id;
          latestVideoId = v.youtubeVideoId || v.id;
        }
      }
    }
  }

  // Also verify against channel's stored anchor
  const channelStored = channel.lastScheduledPublishAt || channel.latestManagedScheduledAt;
  if (channelStored) {
    const storedTime = new Date(channelStored).getTime();
    if (!isNaN(storedTime) && storedTime > maxTime) {
      maxTime = storedTime;
      latestPublishAt = channelStored;
      latestVideoTitle = channel.lastScheduledVideoTitle || latestVideoTitle;
      latestVideoId = channel.lastScheduledVideoId || latestVideoId;
    }
  }

  return {
    latestPublishAt,
    latestVideoTitle: latestVideoTitle || channel.lastScheduledVideoTitle || null,
    latestVideoId: latestVideoId || channel.lastScheduledVideoId || null,
    scheduledVideosCount: count || channel.scheduleStockCount || 0,
  };
}
