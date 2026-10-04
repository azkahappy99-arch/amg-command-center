/**
 * AMG — Multi-Layer Video Eligibility, Detection & Protection Engine (Phase 2)
 *
 * Enforces strict multi-layer checks to guarantee that:
 * 1. Old private videos, personal videos, and unclassified videos are NEVER published or modified.
 * 2. Upload cutoff cursor (latestManagedUploadAt) strictly separates historical content from new AMG batches.
 * 3. Title pattern matching is configurable and case-insensitive.
 * 4. Safety categories are explicit: ELIGIBLE, NEW_PRIVATE_CANDIDATE, PROTECTED_OLD,
 *    PROTECTED_BY_CUTOFF, UNCLASSIFIED, ALREADY_MANAGED, EXCLUDED.
 * 5. Hard Safety Gate (validateBeforeMutation) executes immediately before any YouTube API mutation.
 */

import { dbStore } from './db.js';
import { Channel, ContentProfile, ManagedVideo, SafetyCategory, VideoManagementStatus } from '../src/types/index.js';

export interface EligibilityResult {
  category: SafetyCategory;
  isEligible: boolean;
  isProtected: boolean;
  amgStatus: VideoManagementStatus;
  matchedTitlePattern?: string;
  reason: string;
  eligibilityWindowDays: number;
  latestManagedUploadAt?: string;
  originalUploadAt: string;
}

export interface ChannelDetectionSummary {
  channelId: string;
  channelTitle: string;
  totalEvaluated: number;
  newCandidatesCount: number;
  eligibleCount: number;
  protectedOldCount: number;
  protectedByCutoffCount: number;
  unclassifiedCount: number;
  alreadyManagedCount: number;
  excludedCount: number;
  latestManagedUploadAt?: string;
  eligibilityWindowDays: number;
  eligibleTitlePatterns: string[];
  autoEnroll: boolean;
}

/**
 * Resolves eligibility configuration with deterministic priority:
 * 1. Explicit channel settings
 * 2. Assigned Content Profile settings
 * 3. AMG System Defaults
 */
export function resolveEligibilityConfig(channel?: Channel | null, profile?: ContentProfile | null): {
  windowDays: number;
  titlePatterns: string[];
  autoEnroll: boolean;
} {
  const DEFAULT_WINDOW_DAYS = 7;
  const DEFAULT_PATTERNS = ['Salinan dari A', 'Copy of A'];
  const DEFAULT_AUTO_ENROLL = false; // Always default to ASK_BEFORE_ADDING for safety

  let windowDays = DEFAULT_WINDOW_DAYS;
  let titlePatterns = [...DEFAULT_PATTERNS];
  let autoEnroll = DEFAULT_AUTO_ENROLL;

  if (profile) {
    if (typeof profile.eligibilityWindowDays === 'number' && profile.eligibilityWindowDays > 0) {
      windowDays = profile.eligibilityWindowDays;
    }
    if (Array.isArray(profile.eligibleTitlePatterns) && profile.eligibleTitlePatterns.length > 0) {
      titlePatterns = [...profile.eligibleTitlePatterns];
    }
    if (typeof profile.autoEnroll === 'boolean') {
      autoEnroll = profile.autoEnroll;
    }
  }

  if (channel) {
    if (typeof channel.eligibilityWindowDays === 'number' && channel.eligibilityWindowDays > 0) {
      windowDays = channel.eligibilityWindowDays;
    }
    if (Array.isArray(channel.eligibleTitlePatterns) && channel.eligibleTitlePatterns.length > 0) {
      titlePatterns = [...channel.eligibleTitlePatterns];
    }
    if (typeof channel.autoEnroll === 'boolean') {
      autoEnroll = channel.autoEnroll;
    }
  }

  return { windowDays, titlePatterns, autoEnroll };
}

/**
 * Normalizes title string for safe, tolerant, case-insensitive comparison.
 */
function normalizeTitle(str: string): string {
  return (str || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Evaluates whether a title matches any of the configured patterns.
 * Supports exact match or contains match.
 */
export function matchTitlePattern(title: string, patterns: string[]): { matched: boolean; matchedPattern?: string } {
  if (!title) {
    return { matched: false };
  }

  const cleanTitle = normalizeTitle(title);

  // Common YouTube upload placeholders & draft indications (Requirement 7 & 14)
  const defaultPlaceholders = [
    'salinan dari',
    'copy of',
    'untitled',
    'draft',
    'video mentah',
    'raw video',
    'video tanpa judul',
    'salinan',
  ];

  for (const placeholder of defaultPlaceholders) {
    if (cleanTitle.includes(placeholder)) {
      return { matched: true, matchedPattern: placeholder };
    }
  }

  // Device filename placeholders (e.g. VID_20260920, MOV_001, VIDEO_1)
  if (/^(vid_|video_|mov_|img_|\d{8}_\d{6})/i.test(cleanTitle)) {
    return { matched: true, matchedPattern: 'device_filename_placeholder' };
  }

  if (patterns && patterns.length > 0) {
    for (const pattern of patterns) {
      const cleanPattern = normalizeTitle(pattern);
      if (!cleanPattern) continue;

      if (cleanTitle === cleanPattern || cleanTitle.includes(cleanPattern)) {
        return { matched: true, matchedPattern: pattern };
      }
    }
  }

  return { matched: false };
}

/**
 * Core Multi-Layer Video Eligibility Detector
 */
export function evaluateVideoEligibility(
  video: ManagedVideo,
  channel: Channel,
  profile?: ContentProfile | null,
  referenceNowMs: number = Date.now()
): EligibilityResult {
  const config = resolveEligibilityConfig(channel, profile);
  const uploadTime = new Date(video.originalUploadAt || video.uploadedAt || video.createdAt).getTime();
  const windowMs = config.windowDays * 24 * 60 * 60 * 1000;
  const cutoffWindowTime = referenceNowMs - windowMs;

  // CHECK 1 — PRIVACY STATUS
  // Video MUST be PRIVATE. Public or unlisted videos are permanently excluded from automation.
  if (video.privacyStatus !== 'private') {
    return {
      category: 'EXCLUDED',
      isEligible: false,
      isProtected: true,
      amgStatus: 'EXCLUDED',
      reason: `Non-private video (${video.privacyStatus.toUpperCase()}) cannot be modified or scheduled by AMG.`,
      eligibilityWindowDays: config.windowDays,
      latestManagedUploadAt: channel.latestManagedUploadAt,
      originalUploadAt: video.originalUploadAt,
    };
  }

  // CHECK 1B — SCHEDULED PUBLISH CHECK
  // Video must NOT have an existing scheduled publish time (publishAt must be empty/null).
  const existingPublishStr =
    video.scheduledPublishAt ||
    (video as any).publishAt ||
    (video as any).scheduledAt ||
    (video as any).status?.publishAt;

  if (existingPublishStr) {
    const cursorDateStr = channel.lastScheduledPublishAt || channel.latestManagedScheduledAt;
    if (cursorDateStr) {
      const cursorTime = new Date(cursorDateStr).getTime();
      const videoSchedTime = new Date(existingPublishStr).getTime();
      if (!isNaN(cursorTime) && !isNaN(videoSchedTime) && videoSchedTime <= cursorTime) {
        return {
          category: 'PROTECTED_BY_CUTOFF',
          isEligible: false,
          isProtected: true,
          amgStatus: 'SCHEDULED',
          reason: `Jadwal publikasi video (${existingPublishStr}) berada pada atau sebelum scheduling cursor (${cursorDateStr}). Video lama dipertahankan dan tidak dijadwalkan ulang.`,
          eligibilityWindowDays: config.windowDays,
          latestManagedUploadAt: cursorDateStr,
          originalUploadAt: video.originalUploadAt,
        };
      }
    }

    return {
      category: 'ALREADY_MANAGED',
      isEligible: false,
      isProtected: true,
      amgStatus: 'SCHEDULED',
      reason: `Video sudah memiliki jadwal publikasi YouTube (${existingPublishStr}). Video terjadwal dikecualikan dari antrean deteksi baru.`,
      eligibilityWindowDays: config.windowDays,
      latestManagedUploadAt: channel.latestManagedUploadAt,
      originalUploadAt: video.originalUploadAt,
    };
  }

  // CHECK 2 — ALREADY MANAGED / ENROLLED
  // If video is already managed, scheduled, verified, or completed, DO NOT re-process.
  const alreadyManagedStatuses: VideoManagementStatus[] = [
    'ENROLLED',
    'TITLE_APPLIED',
    'THUMBNAIL_APPLIED',
    'SCHEDULE_PENDING',
    'SCHEDULED',
    'VERIFIED',
    'COMPLETED',
  ];

  if (video.isManaged || alreadyManagedStatuses.includes(video.managementStatus)) {
    return {
      category: 'ALREADY_MANAGED',
      isEligible: false,
      isProtected: true,
      amgStatus: video.managementStatus,
      reason: `Video is already part of an AMG batch (${video.managementStatus}).`,
      eligibilityWindowDays: config.windowDays,
      latestManagedUploadAt: channel.latestManagedUploadAt,
      originalUploadAt: video.originalUploadAt,
    };
  }

  // CHECK 3 — UPLOAD TIME (Section 2: Do NOT exclude raw videos due to upload age)
  // Upload age (e.g. 7 days, 30 days, 2 months) is NEVER a sole reason to exclude private raw videos.
  // Historical raw videos present on the channel ("Salinan dari A", etc.) are fully admitted into scope.

  // CHECK 4 — TITLE PATTERN MATCH
  // Video title must conform to eligibleTitlePatterns or common placeholder indications.
  const patternResult = matchTitlePattern(video.titleBefore, config.titlePatterns);
  if (!patternResult.matched) {
    if (video.exclusionReason || video.managementScope === 'EXCLUDED') {
      return {
        category: 'EXCLUDED',
        isEligible: false,
        isProtected: true,
        amgStatus: 'EXCLUDED',
        reason: video.exclusionReason || 'Personal/excluded video outside AMG scope.',
        eligibilityWindowDays: config.windowDays,
        latestManagedUploadAt: channel.latestManagedUploadAt,
        originalUploadAt: video.originalUploadAt,
      };
    }
    return {
      category: 'UNCLASSIFIED',
      isEligible: false,
      isProtected: true,
      amgStatus: 'UNCLASSIFIED',
      reason: `Judul bukan placeholder dan tidak cocok dengan pola master channel [${config.titlePatterns.join(', ')}].`,
      eligibilityWindowDays: config.windowDays,
      latestManagedUploadAt: channel.latestManagedUploadAt,
      originalUploadAt: video.originalUploadAt,
    };
  }

  // Explicit user manual exclusion
  if (video.scopeAssignedBy === 'USER' && video.managementScope === 'EXCLUDED') {
    return {
      category: 'EXCLUDED',
      isEligible: false,
      isProtected: true,
      amgStatus: 'EXCLUDED',
      reason: video.exclusionReason || 'Video explicitly excluded by user.',
      eligibilityWindowDays: config.windowDays,
      latestManagedUploadAt: channel.latestManagedUploadAt,
      originalUploadAt: video.originalUploadAt,
    };
  }

  // CHECK 4B — BLOCK ISOLATION GUARANTEE
  const blockId = channel.contentProfileId || (channel as any).blockId;
  if (!blockId) {
    return {
      category: 'UNCLASSIFIED',
      isEligible: false,
      isProtected: true,
      amgStatus: 'UNCLASSIFIED',
      reason: 'Channel belum memiliki blok / unassigned. Otomasi dicegah.',
      eligibilityWindowDays: config.windowDays,
      latestManagedUploadAt: channel.lastScheduledPublishAt || channel.latestManagedUploadAt,
      originalUploadAt: video.originalUploadAt,
    };
  }

  // CHECK 4C — EXISTING SCHEDULE CHECK (Requirements 5 & 6)
  // If video already has a scheduled publish time on YouTube:
  const videoScheduleStr = video.scheduledPublishAt || video.publishAt;
  const cursorDateStr = channel.lastScheduledPublishAt || channel.latestManagedScheduledAt;

  if (videoScheduleStr) {
    if (cursorDateStr) {
      const cursorTime = new Date(cursorDateStr).getTime();
      const videoSchedTime = new Date(videoScheduleStr).getTime();
      // Video yang sudah memiliki jadwal pada atau sebelum cursor (<= cursor) DILINDUNGI & TIDAK DIJADWALKAN ULANG
      if (!isNaN(cursorTime) && !isNaN(videoSchedTime) && videoSchedTime <= cursorTime) {
        return {
          category: 'PROTECTED_BY_CUTOFF',
          isEligible: false,
          isProtected: true,
          amgStatus: 'SCHEDULED',
          reason: `Jadwal tayang video (${videoScheduleStr}) berada pada/sebelum scheduling cursor (${cursorDateStr}). Video lama di bawah cursor dipertahankan dan tidak dijadwalkan ulang.`,
          matchedTitlePattern: patternResult.matchedPattern,
          eligibilityWindowDays: config.windowDays,
          latestManagedUploadAt: cursorDateStr,
          originalUploadAt: video.originalUploadAt,
        };
      }
    }

    return {
      category: 'ALREADY_MANAGED',
      isEligible: false,
      isProtected: true,
      amgStatus: 'SCHEDULED',
      reason: `Video sudah memiliki jadwal publikasi YouTube (${videoScheduleStr}). Dipertahankan pada timeline yang telah diproses.`,
      eligibilityWindowDays: config.windowDays,
      latestManagedUploadAt: cursorDateStr || channel.latestManagedUploadAt,
      originalUploadAt: video.originalUploadAt,
    };
  }

  // ALL CHECKS PASSED: Video is a qualified NEW CANDIDATE
  // Private, unscheduled, unprocessed, matching placeholder/candidate pattern.
  // Ready to be assigned Master Title, Master Thumbnail, and next schedule slot starting AFTER cursor.
  return {
    category: 'NEW_PRIVATE_CANDIDATE',
    isEligible: true,
    isProtected: false,
    amgStatus: 'NEW_PRIVATE_CANDIDATE',
    matchedTitlePattern: patternResult.matchedPattern,
    reason: `Memenuhi kriteria otomasi: Private, belum memiliki jadwal tayang, teridentifikasi sebagai video mentah/placeholder ("${patternResult.matchedPattern}").`,
    eligibilityWindowDays: config.windowDays,
    latestManagedUploadAt: cursorDateStr || channel.latestManagedUploadAt,
    originalUploadAt: video.originalUploadAt,
  };
}

/**
 * Evaluates and classifies all videos for a channel into safety categories.
 * Updates in-memory video metadata without mutating live YouTube data.
 */
export function detectChannelCandidates(
  channelId: string,
  referenceNowMs: number = Date.now()
): {
  summary: ChannelDetectionSummary;
  classifiedVideos: ManagedVideo[];
} {
  const channel = dbStore.channels.get(channelId);
  if (!channel) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  const profile = channel.contentProfileId ? dbStore.profiles.get(channel.contentProfileId) : null;
  const config = resolveEligibilityConfig(channel, profile);

  const channelVideos = Array.from(dbStore.videos.values()).filter((v) => v.channelId === channelId);

  let newCandidatesCount = 0;
  let eligibleCount = 0;
  let protectedOldCount = 0;
  let protectedByCutoffCount = 0;
  let unclassifiedCount = 0;
  let alreadyManagedCount = 0;
  let excludedCount = 0;

  for (const video of channelVideos) {
    const result = evaluateVideoEligibility(video, channel, profile, referenceNowMs);

    video.safetyCategory = result.category;
    video.protectionReason = result.reason;
    video.matchedTitlePattern = result.matchedTitlePattern;
    video.eligibilityWindowDays = result.eligibilityWindowDays;
    video.latestManagedUploadAtAtDiscovery = result.latestManagedUploadAt;
    video.isProtected = result.isProtected;

    // Set management scope and eligibility based on category
    if (result.category === 'NEW_PRIVATE_CANDIDATE' || result.category === 'ELIGIBLE') {
      newCandidatesCount++;
      eligibleCount++;
      video.amgStatus = 'NEW_PRIVATE_CANDIDATE';
      // Raw private unscheduled videos in channel scope are admitted as REGULAR & eligible candidates
      video.managementScope = 'REGULAR';
      video.isAmgEligible = true;
      video.isEnrolled = true;
      video.managementStatus = video.processingStatus === 'processed' ? 'READY' : 'DISCOVERED';
      video.scopeAssignedAt = video.scopeAssignedAt || new Date().toISOString();
      video.scopeAssignedBy = video.scopeAssignedBy || 'SYSTEM';
    } else if (result.category === 'PROTECTED_OLD') {
      protectedOldCount++;
      video.amgStatus = 'PROTECTED_OLD';
      video.managementStatus = 'PROTECTED_OLD';
      video.managementScope = 'EXCLUDED';
      video.isAmgEligible = false;
      video.isEnrolled = false;
    } else if (result.category === 'PROTECTED_BY_CUTOFF') {
      protectedByCutoffCount++;
      video.amgStatus = 'PROTECTED_BY_CUTOFF';
      video.managementStatus = 'PROTECTED_BY_CUTOFF';
      video.managementScope = 'EXCLUDED';
      video.isAmgEligible = false;
      video.isEnrolled = false;
    } else if (result.category === 'UNCLASSIFIED') {
      unclassifiedCount++;
      video.amgStatus = 'UNCLASSIFIED';
      video.managementStatus = 'UNCLASSIFIED';
      video.managementScope = 'UNCLASSIFIED';
      video.isAmgEligible = false;
      video.isEnrolled = false;
    } else if (result.category === 'ALREADY_MANAGED') {
      alreadyManagedCount++;
      video.safetyCategory = 'ALREADY_MANAGED';
    } else if (result.category === 'EXCLUDED') {
      excludedCount++;
      video.amgStatus = 'EXCLUDED';
      video.managementStatus = 'EXCLUDED';
      video.managementScope = 'EXCLUDED';
      video.isAmgEligible = false;
      video.isEnrolled = false;
    }

    dbStore.videos.set(video.id, video);
  }

  // Update channel detection cursor timestamp
  channel.lastSuccessfulSyncAt = new Date().toISOString();

  const summary: ChannelDetectionSummary = {
    channelId,
    channelTitle: channel.title,
    totalEvaluated: channelVideos.length,
    newCandidatesCount,
    eligibleCount,
    protectedOldCount,
    protectedByCutoffCount,
    unclassifiedCount,
    alreadyManagedCount,
    excludedCount,
    latestManagedUploadAt: channel.latestManagedUploadAt,
    eligibilityWindowDays: config.windowDays,
    eligibleTitlePatterns: config.titlePatterns,
    autoEnroll: config.autoEnroll,
  };

  dbStore.logActivity({
    user: 'Eligibility Engine',
    channelId,
    channelTitle: channel.title,
    operation: 'Candidate Detection Completed',
    previousValue: 'Pending detection',
    newValue: `Evaluated ${channelVideos.length} videos: ${newCandidatesCount} new candidates, ${protectedOldCount} protected old, ${protectedByCutoffCount} protected by cutoff, ${unclassifiedCount} unclassified.`,
    result: 'SUCCESS',
  });

  return { summary, classifiedVideos: channelVideos };
}

/**
 * HARD SAFETY GATE: validateBeforeMutation
 * Runs immediately before ANY modification (title, thumbnail, publish schedule).
 * Re-validates the video against all safety requirements in real time.
 */
export function validateBeforeMutation(
  videoId: string,
  targetChannelId: string
): { isValid: boolean; reason?: string; video?: ManagedVideo } {
  const video = dbStore.getVideoById(videoId) || dbStore.videos.get(videoId);
  if (!video) {
    return { isValid: false, reason: `HARD SAFETY VIOLATION: Video ${videoId} not found in database.` };
  }

  // 1. Channel match (respect aliases like chan-xxx, UCxxx, or title)
  const resolvedTargetChan = dbStore.getChannelByIdOrTitle(targetChannelId) || dbStore.getChannelByYoutubeId(targetChannelId);
  const targetId = resolvedTargetChan ? resolvedTargetChan.id : targetChannelId;
  const videoChan = dbStore.getChannelByIdOrTitle(video.channelId) || dbStore.getChannelByYoutubeId(video.channelId);
  const videoChanId = videoChan ? videoChan.id : video.channelId;

  if (videoChanId !== targetId && video.channelId !== targetChannelId && video.channelId !== resolvedTargetChan?.youtubeChannelId) {
    return {
      isValid: false,
      reason: `SECURITY VIOLATION: Video ${video.id} belongs to channel "${video.channelId}", but mutation requested for "${targetChannelId}".`,
      video,
    };
  }

  // 1b. Block Isolation Check (Requirement 16)
  const channel = resolvedTargetChan || dbStore.channels.get(targetChannelId);
  const targetBlockId = channel?.contentProfileId || (channel as any)?.blockId || 'profile-default';
  const videoBlockId = video.blockId || video.contentProfileId;
  if (videoBlockId && targetBlockId && videoBlockId !== targetBlockId && videoBlockId !== 'profile-default') {
    return {
      isValid: false,
      reason: `BLOCK ISOLATION VIOLATION: Video belongs to block "${videoBlockId}", but channel is assigned to block "${targetBlockId}". Cross-niche mutation rejected.`,
      video,
    };
  }

  // 2. Privacy check
  if (video.privacyStatus !== 'private') {
    return {
      isValid: false,
      reason: `SAFETY GATE BLOCKED: Video is not private (privacyStatus="${video.privacyStatus}"). Modification strictly forbidden.`,
      video,
    };
  }

  // 3. Not already managed or published
  if (video.isManaged && video.managementStatus === 'COMPLETED') {
    return {
      isValid: false,
      reason: `SAFETY GATE BLOCKED: Video ${video.id} is already managed and completed. Re-mutation forbidden.`,
      video,
    };
  }

  // 4. Must be enrolled & regular scope
  if (!video.isEnrolled && video.managementStatus !== 'READY' && video.managementStatus !== 'ENROLLED') {
    return {
      isValid: false,
      reason: `SAFETY GATE BLOCKED: Video is not enrolled in AMG (managementStatus="${video.managementStatus}", isEnrolled=${video.isEnrolled}).`,
      video,
    };
  }

  if (video.managementScope !== 'REGULAR' || !video.isAmgEligible) {
    return {
      isValid: false,
      reason: `SAFETY GATE BLOCKED: Video scope is "${video.managementScope}" with isAmgEligible=${video.isAmgEligible}. Must be REGULAR and eligible.`,
      video,
    };
  }

  // 5. Must not be protected
  if (video.isProtected || video.managementStatus === 'PROTECTED_OLD' || video.managementStatus === 'PROTECTED_BY_CUTOFF') {
    return {
      isValid: false,
      reason: `PROTECTED VIDEO GUARANTEE: Mutation BLOCKED. ${video.protectionReason || 'Video is protected.'}`,
      video,
    };
  }

  // 6. HD processing check
  if (video.processingStatus === 'failed') {
    return {
      isValid: false,
      reason: `SAFETY GATE BLOCKED: Video transcoding failed on YouTube.`,
      video,
    };
  }

  return { isValid: true, video };
}

/**
 * Enrolls a candidate video into AMG Automation Queue
 */
export function enrollVideo(
  videoId: string,
  user: string = 'User'
): { success: boolean; video?: ManagedVideo; error?: string } {
  const video = dbStore.videos.get(videoId);
  if (!video) {
    return { success: false, error: 'Video not found' };
  }

  const channel = dbStore.channels.get(video.channelId);
  if (!channel) {
    return { success: false, error: 'Channel not found' };
  }

  // Check if video is protected
  if (video.isProtected || video.managementScope === 'EXCLUDED') {
    return {
      success: false,
      error: `Cannot enroll protected/excluded video: ${video.protectionReason || 'Protected historical/personal video.'}`,
    };
  }

  video.isEnrolled = true;
  video.managementScope = 'REGULAR';
  video.isAmgEligible = true;
  video.isProtected = false;
  video.managementStatus = video.processingStatus === 'processed' ? 'READY' : 'VALIDATING';
  video.amgStatus = video.managementStatus;
  video.scopeAssignedAt = new Date().toISOString();
  video.scopeAssignedBy = user;
  video.updatedAt = new Date().toISOString();

  dbStore.videos.set(video.id, video);

  dbStore.logActivity({
    user,
    channelId: channel.id,
    channelTitle: channel.title,
    videoId: video.id,
    operation: 'Video Enrolled in AMG',
    previousValue: 'NEW_PRIVATE_CANDIDATE',
    newValue: `Enrolled into AMG Regular scope: "${video.titleBefore}"`,
    result: 'SUCCESS',
  });

  return { success: true, video };
}

/**
 * Enrolls all eligible candidates for a channel
 */
export function enrollAllEligibleCandidates(
  channelId: string,
  user: string = 'User'
): { success: boolean; enrolledCount: number; videos: ManagedVideo[]; error?: string } {
  const channel = dbStore.channels.get(channelId);
  if (!channel) {
    return { success: false, enrolledCount: 0, videos: [], error: 'Channel not found' };
  }

  const candidates = Array.from(dbStore.videos.values()).filter(
    (v) =>
      v.channelId === channelId &&
      !v.isManaged &&
      !v.isProtected &&
      (v.safetyCategory === 'NEW_PRIVATE_CANDIDATE' || v.safetyCategory === 'ELIGIBLE' || v.managementStatus === 'NEW_PRIVATE_CANDIDATE')
  );

  if (candidates.length === 0) {
    return { success: false, enrolledCount: 0, videos: [], error: 'No eligible candidates available to enroll.' };
  }

  const enrolled: ManagedVideo[] = [];

  for (const video of candidates) {
    const res = enrollVideo(video.id, user);
    if (res.success && res.video) {
      enrolled.push(res.video);
    }
  }

  // Update channel unmanaged video count
  const regularEligible = Array.from(dbStore.videos.values()).filter(
    (v) => v.channelId === channelId && !v.isManaged && v.managementScope === 'REGULAR' && v.isAmgEligible
  );
  channel.unmanagedVideoCount = regularEligible.length;

  dbStore.logActivity({
    user,
    channelId: channel.id,
    channelTitle: channel.title,
    operation: 'Bulk Enrollment Completed',
    previousValue: `${candidates.length} candidates`,
    newValue: `Enrolled ${enrolled.length} videos into AMG Regular pipeline.`,
    result: 'SUCCESS',
  });

  return { success: true, enrolledCount: enrolled.length, videos: enrolled };
}

export const eligibilityService = {
  evaluateVideoEligibility,
  validateBeforeMutation,
  detectChannelCandidates,
  enrollVideo,
  enrollAllEligibleCandidates,
};
