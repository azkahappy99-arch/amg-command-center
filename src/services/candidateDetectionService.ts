import { ManagedVideo, Channel } from '../types/index.ts';

/**
 * Checks if a title is a raw YouTube Studio / device / render placeholder:
 * - case-insensitive contains 'Salinan dari', 'Salinan', 'Copy of', 'Copy'
 * - or raw upload/render string (e.g. vid_, video_, mov_, img_, untitled, draft, video mentah, raw video, comp_, render, .mp4)
 */
export function isRawStudioTitle(title?: string | null): boolean {
  if (!title) return true;
  const clean = title.trim().toLowerCase();
  if (!clean) return true;

  // Case-insensitive checks for YouTube studio clone/copy titles
  if (
    clean.includes('salinan dari') ||
    clean.includes('salinan') ||
    clean.includes('copy of') ||
    clean.includes('copy')
  ) {
    return true;
  }

  // Common raw studio upload & render placeholder strings
  const rawKeywords = [
    'untitled',
    'draft',
    'video mentah',
    'raw video',
    'video tanpa judul',
    'render',
    'comp_',
    'sequence',
  ];
  for (const kw of rawKeywords) {
    if (clean.includes(kw)) return true;
  }

  // Device filenames & video extensions (e.g. VID_20261030, MOV_001, VIDEO_1, 20261030_123456.mp4)
  if (/^(vid_|video_|mov_|img_|\d{8}_\d{6})/i.test(clean) || /\.(mp4|mov|mkv|avi|webm)$/i.test(clean)) {
    return true;
  }

  return false;
}

/**
 * Evaluates whether a video qualifies as "AMG Reguler (Layak)":
 * a. status.privacyStatus === 'private'
 * b. status.publishAt kosong/falsy (belum dijadwalkan di masa depan)
 * c. Judul masih merupakan judul bawaan/mentah studio (case-insensitive mengandung 'Salinan dari', 'Salinan', 'Copy of', 'Copy', atau string upload render mentah).
 *
 * DILARANG memasukkan video private mentah ke kategori 'Dikecualikan (Terlindung)'!
 */
export function isAmgRegulerEligible(video: ManagedVideo): boolean {
  if (!video) return false;

  // a. Privacy must be private
  const privacy = (video.privacyStatus || (video as any).status?.privacyStatus || '').toLowerCase();
  if (privacy !== 'private') return false;

  // b. publishAt must be empty/falsy (belum dijadwalkan di masa depan)
  const publishAt =
    video.publishAt ||
    video.scheduledPublishAt ||
    (video as any).status?.publishAt ||
    (video as any).scheduledAt;
  if (publishAt) {
    const t = new Date(publishAt).getTime();
    if (!isNaN(t) && t > 0) {
      return false; // Already scheduled on YouTube
    }
  }

  // Don't re-qualify completed videos that already have master titles successfully applied
  if (
    video.managementStatus === 'COMPLETED' ||
    (video.isManaged && video.titleAssigned && video.titleAssigned !== video.titleBefore)
  ) {
    return false;
  }

  // c. Judul masih merupakan judul bawaan / mentah studio
  const rawTitle = video.titleBefore || (video as any).title || video.titleAssigned || '';
  return isRawStudioTitle(rawTitle);
}

export interface CandidateDetectionResult {
  channelId: string;
  candidates: ManagedVideo[];
  enrolledEligible: ManagedVideo[];
  protectedByCutoff: ManagedVideo[];
  protectedOld: ManagedVideo[];
  unclassified: ManagedVideo[];
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
}

/**
 * Classifies videos for candidate review modal and automation scope
 */
export function classifyChannelVideos(
  channelId: string,
  allVideos: ManagedVideo[]
): CandidateDetectionResult {
  const cleanId = channelId.replace(/^chan-/, '');
  const channelVideos = allVideos.filter(
    (v) =>
      v.channelId === channelId ||
      v.channelId === `chan-${channelId}` ||
      v.channelId === cleanId ||
      v.channelId === `chan-${cleanId}`
  );

  const candidates: ManagedVideo[] = [];
  const alreadyManaged: ManagedVideo[] = [];
  const unclassified: ManagedVideo[] = [];
  const excluded: ManagedVideo[] = [];

  for (const v of channelVideos) {
    const isPrivacyPrivate = (v.privacyStatus || (v as any).status?.privacyStatus || '').toLowerCase() === 'private';
    const pubAt = v.publishAt || v.scheduledPublishAt || (v as any).status?.publishAt;
    const hasPublishAt = Boolean(pubAt && !isNaN(new Date(pubAt).getTime()) && new Date(pubAt).getTime() > 0);

    // If already scheduled on YouTube or completed
    if (hasPublishAt || v.managementStatus === 'SCHEDULED' || v.managementStatus === 'COMPLETED') {
      alreadyManaged.push(v);
      continue;
    }

    // Explicit user manual exclusion
    if (v.scopeAssignedBy === 'USER' && v.managementScope === 'EXCLUDED') {
      excluded.push(v);
      continue;
    }

    // Public / unlisted video is protected from automatic mutation
    if (!isPrivacyPrivate) {
      excluded.push({
        ...v,
        managementScope: 'EXCLUDED',
        exclusionReason: 'Bukan video private (Publik/Tidak Publik terlindungi dari mutasi)',
      });
      continue;
    }

    // Private raw video evaluation:
    // Sesuai Aturan: JANGAN masukkan video private mentah ke 'Dikecualikan (Terlindung)'
    if (isAmgRegulerEligible(v)) {
      candidates.push({
        ...v,
        managementScope: 'REGULAR',
        isAmgEligible: true,
      });
    } else {
      unclassified.push(v);
    }
  }

  return {
    channelId,
    candidates,
    enrolledEligible: candidates,
    protectedByCutoff: [],
    protectedOld: [],
    unclassified,
    alreadyManaged,
    excluded,
    statistics: {
      totalEvaluated: channelVideos.length,
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
      eligibleTitlePatterns: ['Salinan dari', 'Salinan', 'Copy of', 'Copy'],
      latestManagedUploadAt: new Date().toISOString(),
      autoEnroll: false,
    },
  };
}
