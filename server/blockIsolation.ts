/**
 * Server-side Block Isolation, Validation Guard & Cutoff Logic
 */

import { Channel, ContentProfile, MasterTitle, MasterThumbnail, ManagedVideo, SafetyCategory } from '../src/types/index.js';

export function resolveBlockId(entity?: { blockId?: string; contentProfileId?: string; profileId?: string } | null): string {
  if (!entity) return '';
  return entity.blockId || entity.contentProfileId || entity.profileId || '';
}

export function validateBlockIsolation(params: {
  video: ManagedVideo;
  channel: Channel;
  block?: ContentProfile | null;
  masterTitle?: MasterTitle | { id?: string; text?: string; profileId?: string; blockId?: string } | null;
  masterThumbnail?: MasterThumbnail | { id?: string; name?: string; url?: string; profileId?: string; blockId?: string } | null;
  enforceCutoff?: boolean;
}): { isValid: boolean; reason?: string } {
  const { video, channel, block, masterTitle, masterThumbnail, enforceCutoff = false } = params;

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

  const targetBlockId = resolveBlockId(block) || resolveBlockId(channel);
  if (!targetBlockId) {
    return {
      isValid: false,
      reason: 'Channel Belum Memiliki Blok (Unassigned). Otomasi dan pengelolaan dicegah.',
    };
  }

  const videoBlockId = resolveBlockId(video);
  if (videoBlockId && videoBlockId !== targetBlockId) {
    return {
      isValid: false,
      reason: `Block Mismatch: Video belongs to block "${videoBlockId}", but active block is "${targetBlockId}".`,
    };
  }

  if (masterTitle) {
    const titleBlockId = resolveBlockId(masterTitle);
    if (titleBlockId && titleBlockId !== targetBlockId) {
      return {
        isValid: false,
        reason: `Cross-Niche Title Rejected: Master Title belongs to block "${titleBlockId}", not "${targetBlockId}".`,
      };
    }
  }

  if (masterThumbnail) {
    const thumbBlockId = resolveBlockId(masterThumbnail);
    if (thumbBlockId && thumbBlockId !== targetBlockId) {
      return {
        isValid: false,
        reason: `Cross-Niche Thumbnail Rejected: Master Thumbnail belongs to block "${thumbBlockId}", not "${targetBlockId}".`,
      };
    }
  }

  if (video.privacyStatus !== 'private') {
    return {
      isValid: false,
      reason: `Status Privasi Tidak Valid: Video "${video.privacyStatus}" (hanya video private yang boleh dikelola AMG).`,
    };
  }

  const hasPublishAt = Boolean(
    video.scheduledPublishAt ||
    (video as any).publishAt ||
    (video as any).scheduledAt ||
    (video as any).status?.publishAt
  );
  if (hasPublishAt || video.isManaged || video.managementStatus === 'COMPLETED' || video.managementStatus === 'SCHEDULED') {
    return {
      isValid: false,
      reason: `Video Sudah Terjadwal / Dikelola (${video.scheduledPublishAt || (video as any).publishAt || video.managementStatus}). Mencegah proses ulang.`,
    };
  }

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
