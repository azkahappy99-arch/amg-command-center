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
  if (!title || !patterns || patterns.length === 0) {
    return { matched: false };
  }

  const cleanTitle = normalizeTitle(title);

  for (const pattern of patterns) {
    const cleanPattern = normalizeTitle(pattern);
    if (!cleanPattern) continue;

    // Exact match or contains
    if (cleanTitle === cleanPattern || cleanTitle.includes(cleanPattern)) {
      return { matched: true, matchedPattern: pattern };
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

  // CHECK 3 — UPLOAD TIME / ELIGIBILITY WINDOW
  // Videos older than eligibilityWindowDays are PROTECTED_OLD.
  if (uploadTime < cutoffWindowTime) {
    const daysOld = Math.round((referenceNowMs - uploadTime) / (24 * 60 * 60 * 1000));
    return {
      category: 'PROTECTED_OLD',
      isEligible: false,
      isProtected: true,
      amgStatus: 'PROTECTED_OLD',
      reason: `Uploaded ${daysOld} days ago (outside the ${config.windowDays}-day eligibility window). Protected historical video.`,
      eligibilityWindowDays: config.windowDays,
      latestManagedUploadAt: channel.latestManagedUploadAt,
      originalUploadAt: video.originalUploadAt,
    };
  }

  // CHECK 4 — TITLE PATTERN MATCH
  // Video title must conform to eligibleTitlePatterns (e.g. "Salinan dari A", "Copy of A").
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
      reason: `Title does not match any eligible pattern [${config.titlePatterns.join(', ')}]. Personal/unrelated video.`,
      eligibilityWindowDays: config.windowDays,
      latestManagedUploadAt: channel.latestManagedUploadAt,
      originalUploadAt: video.originalUploadAt,
    };
  }

  // Explicit user manual exclusion (e.g. user manually clicked Exclude on a matching candidate)
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

  // CHECK 5 — AMG MANAGED UPLOAD CUTOFF (latestManagedUploadAt)
  // This is the critical safety mechanism to protect personal videos created before the latest batch.
  if (channel.latestManagedUploadAt) {
    const cutoffTime = new Date(channel.latestManagedUploadAt).getTime();
    if (!isNaN(cutoffTime) && uploadTime <= cutoffTime) {
      return {
        category: 'PROTECTED_BY_CUTOFF',
        isEligible: false,
        isProtected: true,
        amgStatus: 'PROTECTED_BY_CUTOFF',
        reason: `Upload timestamp (${video.originalUploadAt}) is before/at the managed cutoff (${channel.latestManagedUploadAt}). Protected historical/personal video.`,
        matchedTitlePattern: patternResult.matchedPattern,
        eligibilityWindowDays: config.windowDays,
        latestManagedUploadAt: channel.latestManagedUploadAt,
        originalUploadAt: video.originalUploadAt,
      };
    }
  }

  // ALL CHECKS PASSED: Video is a qualified NEW CANDIDATE
  return {
    category: 'NEW_PRIVATE_CANDIDATE',
    isEligible: true,
    isProtected: false,
    amgStatus: 'NEW_PRIVATE_CANDIDATE',
    matchedTitlePattern: patternResult.matchedPattern,
    reason: `Passed all 5 safety checks: Private, in ${config.windowDays}-day window, matched pattern "${patternResult.matchedPattern}", and uploaded after cutoff.`,
    eligibilityWindowDays: config.windowDays,
    latestManagedUploadAt: channel.latestManagedUploadAt,
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
      // Do not auto-enroll unless configured
      if (config.autoEnroll) {
        video.isEnrolled = true;
        video.managementScope = 'REGULAR';
        video.isAmgEligible = true;
        video.managementStatus = video.processingStatus === 'processed' ? 'READY' : 'VALIDATING';
        video.scopeAssignedAt = new Date().toISOString();
        video.scopeAssignedBy = 'AUTO_ENROLL';
      } else {
        // Safe default: wait for user enrollment
        video.managementStatus = 'NEW_PRIVATE_CANDIDATE';
        video.managementScope = 'UNCLASSIFIED';
        video.isAmgEligible = false;
        video.isEnrolled = false;
      }
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
  const video = dbStore.videos.get(videoId);
  if (!video) {
    return { isValid: false, reason: `HARD SAFETY VIOLATION: Video ${videoId} not found in database.` };
  }

  // 1. Channel match
  if (video.channelId !== targetChannelId) {
    return {
      isValid: false,
      reason: `SECURITY VIOLATION: Video ${video.id} belongs to channel "${video.channelId}", but mutation requested for "${targetChannelId}".`,
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
