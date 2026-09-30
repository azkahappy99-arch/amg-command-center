/**
 * AMG — Block Isolation, Validation Guard & Cutoff Engine
 *
 * Guarantees:
 * 1. Strict Block Isolation: 1 BLOCK = 1 isolated container (Channel, Videos, Master Titles, Master Thumbnails, Schedule, Cutoff).
 * 2. Zero Cross-Niche Leakage / Fallback: Master from Block A NEVER appears or rotates into Block B.
 * 3. Cutoff Separation: VIDEO_DATETIME > LAST_SCHEDULED_DATETIME. Any video <= cutoff is permanently protected.
 * 4. Hard Safety Gate: validateBlockIsolation stops any mutation if blockId/channelId/master mismatch.
 * 5. Accurate Video Detection Count: private + unscheduled + unmanaged + connected + valid block + after cutoff.
 */

import { Channel, ContentProfile, MasterTitle, MasterThumbnail, ManagedVideo, SafetyCategory, VideoManagementStatus } from '../types/index.ts';

export interface BlockIsolationValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Returns the effective blockId for any entity.
 */
export function resolveBlockId(entity?: { blockId?: string; contentProfileId?: string; profileId?: string } | null): string {
  if (!entity) return '';
  return entity.blockId || entity.contentProfileId || entity.profileId || '';
}

/**
 * Hard Pre-Mutation & Pre-Display Validation Guard (Requirement 16)
 * Validates that video, channel, block, master title, and master thumbnail all belong to the exact same block.
 */
export function validateBlockIsolation(params: {
  video: ManagedVideo;
  channel: Channel;
  block?: ContentProfile | null;
  masterTitle?: MasterTitle | { id?: string; text?: string; profileId?: string; blockId?: string } | null;
  masterThumbnail?: MasterThumbnail | { id?: string; name?: string; url?: string; profileId?: string; blockId?: string } | null;
  enforceCutoff?: boolean;
}): BlockIsolationValidationResult {
  const { video, channel, block, masterTitle, masterThumbnail, enforceCutoff = false } = params;

  // 1. Channel association
  const normChanId = channel.id;
  const normYtId = channel.youtubeChannelId;
  const isChannelMatch =
    video.channelId === normChanId ||
    video.channelId === normYtId ||
    video.channelId === `chan-${normYtId}` ||
    (normChanId.startsWith('chan-') && video.channelId === normChanId.replace('chan-', ''));

  if (!isChannelMatch) {
    return {
      isValid: false,
      reason: `Channel Mismatch: Video channel (${video.channelId}) does not match target channel (${channel.id}).`,
    };
  }

  // 2. Block Assignment (Channel must have valid block)
  const targetBlockId = resolveBlockId(block) || resolveBlockId(channel);
  if (!targetBlockId) {
    return {
      isValid: false,
      reason: 'Channel Belum Memiliki Blok (Unassigned). Otomasi dan pengelolaan dicegah.',
    };
  }

  // 3. Video Block Alignment
  const videoBlockId = resolveBlockId(video);
  if (videoBlockId && videoBlockId !== targetBlockId) {
    return {
      isValid: false,
      reason: `Block Mismatch: Video belongs to block "${videoBlockId}", but active block is "${targetBlockId}".`,
    };
  }

  // 4. Master Title Isolation (Must belong strictly to this block)
  if (masterTitle) {
    const titleBlockId = resolveBlockId(masterTitle);
    if (titleBlockId && titleBlockId !== targetBlockId) {
      return {
        isValid: false,
        reason: `Cross-Niche Title Rejected: Master Title belongs to block "${titleBlockId}", not "${targetBlockId}".`,
      };
    }
  }

  // 5. Master Thumbnail Isolation (Must belong strictly to this block)
  if (masterThumbnail) {
    const thumbBlockId = resolveBlockId(masterThumbnail);
    if (thumbBlockId && thumbBlockId !== targetBlockId) {
      return {
        isValid: false,
        reason: `Cross-Niche Thumbnail Rejected: Master Thumbnail belongs to block "${thumbBlockId}", not "${targetBlockId}".`,
      };
    }
  }

  // 6. Privacy Status must be 'private'
  if (video.privacyStatus !== 'private') {
    return {
      isValid: false,
      reason: `Status Privasi Tidak Valid: Video "${video.privacyStatus}" (hanya video private yang boleh dikelola AMG).`,
    };
  }

  // 7. Video cannot be already managed
  if (video.isManaged || video.managementStatus === 'COMPLETED' || video.managementStatus === 'SCHEDULED') {
    return {
      isValid: false,
      reason: `Video Sudah Dikelola (${video.managementStatus}). Mencegah proses ulang.`,
    };
  }

  // 8. Cutoff Gate (VIDEO_DATETIME > LAST_SCHEDULED_DATETIME)
  const effectiveCutoff = channel.lastScheduledPublishAt || block?.lastScheduledDatetime || null;
  if (effectiveCutoff && enforceCutoff) {
    const videoUploadTime = new Date(video.originalUploadAt || video.uploadedAt || video.createdAt).getTime();
    const cutoffTime = new Date(effectiveCutoff).getTime();

    if (!isNaN(cutoffTime) && !isNaN(videoUploadTime) && videoUploadTime <= cutoffTime) {
      return {
        isValid: false,
        reason: `Video terlindungi cutoff: Waktu upload (${video.originalUploadAt}) berada pada atau sebelum cutoff jadwal terakhir (${effectiveCutoff}).`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Retrieves Master Titles and Thumbnails strictly isolated for a specific block.
 * ZERO fallback to other blocks (Requirement 13 & 17).
 */
export function getBlockMasters(
  blockId: string,
  allTitles: MasterTitle[],
  allThumbnails: MasterThumbnail[]
): {
  titles: MasterTitle[];
  thumbnails: MasterThumbnail[];
  hasTitles: boolean;
  hasThumbnails: boolean;
  titleMessage?: string;
  thumbnailMessage?: string;
} {
  if (!blockId) {
    return {
      titles: [],
      thumbnails: [],
      hasTitles: false,
      hasThumbnails: false,
      titleMessage: 'Channel belum memiliki blok yang ditentukan',
      thumbnailMessage: 'Channel belum memiliki blok yang ditentukan',
    };
  }

  const titles = allTitles
    .filter((t) => (t.blockId === blockId || t.profileId === blockId) && t.isActive)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const thumbnails = allThumbnails
    .filter((th) => (th.blockId === blockId || th.profileId === blockId) && th.isActive)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  return {
    titles,
    thumbnails,
    hasTitles: titles.length > 0,
    hasThumbnails: thumbnails.length > 0,
    titleMessage: titles.length === 0 ? 'Master Judul belum tersedia pada blok ini' : undefined,
    thumbnailMessage: thumbnails.length === 0 ? 'Master Thumbnail belum tersedia pada blok ini' : undefined,
  };
}

/**
 * Multi-layer Video Eligibility Evaluator enforcing all 8 rules from Requirement 6 & 7:
 * A. Channel Connected
 * B. BlockId Valid
 * C. Private
 * D. Belum memiliki jadwal publish
 * E. Belum dikelola AMG
 * F. Belum memiliki konfigurasi final
 * G. Video > LAST_SCHEDULED_DATETIME
 * H. Bukan video lama / terlindungi
 */
export function evaluateVideoEligibilityWithBlock(
  video: ManagedVideo,
  channel?: Channel | null,
  block?: ContentProfile | null
): {
  category: SafetyCategory;
  isEligible: boolean;
  isProtected: boolean;
  reason: string;
} {
  // A. Channel verification
  if (!channel) {
    return {
      category: 'UNCLASSIFIED',
      isEligible: false,
      isProtected: true,
      reason: 'Channel tidak ditemukan atau belum terhubung.',
    };
  }

  const isConnected =
    channel.status === 'CONNECTED' ||
    channel.status === 'Connected' ||
    channel.status === 'Ready';

  if (!isConnected) {
    return {
      category: 'UNCLASSIFIED',
      isEligible: false,
      isProtected: true,
      reason: `Channel berstatus "${channel.status}". Otorisasi aktif diperlukan.`,
    };
  }

  // B. BlockId verification
  const targetBlockId = resolveBlockId(block) || resolveBlockId(channel);
  if (!targetBlockId) {
    return {
      category: 'UNCLASSIFIED',
      isEligible: false,
      isProtected: true,
      reason: 'Channel belum memiliki blok / unassigned. Otomasi dicegah.',
    };
  }

  // C. Privacy Status
  if (video.privacyStatus !== 'private') {
    return {
      category: 'EXCLUDED',
      isEligible: false,
      isProtected: true,
      reason: `Video berstatus "${video.privacyStatus}". Hanya video PRIVATE yang dapat dikelola AMG.`,
    };
  }

  // D. Belum memiliki jadwal publish
  if (video.scheduledPublishAt) {
    return {
      category: 'ALREADY_MANAGED',
      isEligible: false,
      isProtected: true,
      reason: `Video sudah memiliki jadwal tayang YouTube (${video.scheduledPublishAt}).`,
    };
  }

  // E. Belum dikelola AMG
  const managedStatuses: VideoManagementStatus[] = [
    'ENROLLED',
    'TITLE_APPLIED',
    'THUMBNAIL_APPLIED',
    'SCHEDULE_PENDING',
    'SCHEDULED',
    'VERIFIED',
    'COMPLETED',
  ];
  if (video.isManaged || managedStatuses.includes(video.managementStatus)) {
    return {
      category: 'ALREADY_MANAGED',
      isEligible: false,
      isProtected: true,
      reason: `Video sudah berada dalam antrean atau telah dikelola AMG (${video.managementStatus}).`,
    };
  }

  // F. Belum memiliki konfigurasi final
  if (video.titleAssigned && video.thumbnailAssigned && video.scheduledPublishAt) {
    return {
      category: 'ALREADY_MANAGED',
      isEligible: false,
      isProtected: true,
      reason: 'Video telah memiliki konfigurasi final (Judul, Thumbnail, Jadwal).',
    };
  }

  // G. Cutoff Check: VIDEO_DATETIME > LAST_SCHEDULED_DATETIME
  const effectiveCutoff = channel.lastScheduledPublishAt || block?.lastScheduledDatetime || null;
  const videoTime = new Date(video.originalUploadAt || video.uploadedAt || video.createdAt).getTime();

  if (effectiveCutoff) {
    const cutoffTime = new Date(effectiveCutoff).getTime();
    if (!isNaN(cutoffTime) && !isNaN(videoTime)) {
      if (videoTime <= cutoffTime) {
        return {
          category: 'PROTECTED_BY_CUTOFF',
          isEligible: false,
          isProtected: true,
          reason: `Upload (${video.originalUploadAt}) berada pada atau sebelum cutoff jadwal terakhir (${effectiveCutoff}). Protected historical video.`,
        };
      }
    }
  }

  // Manual explicit user exclusion
  if (video.managementScope === 'EXCLUDED') {
    return {
      category: 'EXCLUDED',
      isEligible: false,
      isProtected: true,
      reason: video.exclusionReason || 'Dikecualikan secara manual oleh pengguna.',
    };
  }

  // ALL CHECKS PASSED: Qualified Candidate
  return {
    category: 'NEW_PRIVATE_CANDIDATE',
    isEligible: true,
    isProtected: false,
    reason: `Memenuhi seluruh 8 kriteria: Channel terhubung, Blok valid (${targetBlockId}), Private, Belum dijadwalkan, Upload setelah cutoff (${effectiveCutoff || 'Awal'}).`,
  };
}

/**
 * Calculates the exact count of "Video Terdeteksi" for Dashboard & Metrics (Requirement 18).
 * Strictly requires: private + unscheduled + unmanaged + connected channel + valid block + upload after cutoff.
 */
export function calculateDetectedVideosCount(
  videos: ManagedVideo[],
  channels: Channel[],
  blocks: ContentProfile[],
  filterChannelId?: string
): number {
  const channelMap = new Map<string, Channel>();
  for (const c of channels) {
    channelMap.set(c.id, c);
    channelMap.set(c.youtubeChannelId, c);
    if (!c.id.startsWith('chan-')) channelMap.set(`chan-${c.id}`, c);
  }

  const blockMap = new Map<string, ContentProfile>();
  for (const b of blocks) {
    blockMap.set(b.id, b);
  }

  let count = 0;
  for (const v of videos) {
    if (filterChannelId && filterChannelId !== 'ALL') {
      const match =
        v.channelId === filterChannelId ||
        v.channelId === `chan-${filterChannelId}` ||
        (filterChannelId.startsWith('chan-') && v.channelId === filterChannelId.replace('chan-', ''));
      if (!match) continue;
    }

    const chan = channelMap.get(v.channelId);
    if (!chan) continue;

    const blockId = resolveBlockId(chan);
    const block = blockId ? blockMap.get(blockId) : null;

    const evalResult = evaluateVideoEligibilityWithBlock(v, chan, block);
    if (evalResult.isEligible && evalResult.category === 'NEW_PRIVATE_CANDIDATE') {
      count++;
    }
  }

  return count;
}
