/**
 * Automation Engine for AMG (Phase 2)
 *
 * Implements:
 * 1. Safe Multi-Layer Video Eligibility & Scope Isolation
 * 2. Deterministic, Independent Master Title & Thumbnail Rotation
 * 3. Schedule Slot Calculation with Collision & Past-Slot Avoidance
 * 4. Hard Pre-Mutation Safety Gate (validateBeforeMutation)
 * 5. Detection Cursor (latestManagedUploadAt) vs Scheduling Cursor (latestManagedScheduledAt)
 * 6. Background Queue Worker with Concurrency, Pause/Resume, and Retry Controls
 */

import { dbStore } from './db.js';
import { generateRotationMatrix, getTitleForIndex, RotationTitle, RotationThumbnail } from './rotationService.js';
import { calculateNextSchedules, resolveScheduleConfig, validateScheduleConfig } from './scheduleReconciliationService.js';
import { youtubeDataService } from './youtubeDataService.js';
import { youtubeAuthService } from './youtubeAuthService.js';
import { evaluateVideoEligibility, validateBeforeMutation } from './eligibilityService.js';
import { phase3Engine } from './phase3Engine.js';
import {
  AutomationBatch,
  AutomationJob,
  AutomationPreviewItem,
  AutomationScopeSummary,
  ManagedVideo,
} from '../src/types/index.js';

let batchSequence = 2; // AMG-BATCH-0001 already seeded

export interface PreviewRequest {
  channelId: string;
  profileId?: string;
}

export class AutomationEngine {
  private isPaused = false;

  /**
   * Generates deterministic Preview for videos with explicit Multi-Layer Scope Protection.
   * Only AMG REGULAR enrolled/eligible videos enter the active execution queue.
   * Candidates, Excluded, Old, Cutoff, and Unclassified videos are presented with protective statuses and are never scheduled.
   */
  public generatePreview(channelId: string, profileIdOverride?: string): {
    success: boolean;
    preview?: AutomationPreviewItem[];
    channelTitle?: string;
    profileName?: string;
    unmanagedCount?: number;
    scopeSummary?: AutomationScopeSummary;
    error?: string;
  } {
    const channel = dbStore.getChannelByIdOrTitle(channelId) || dbStore.getChannelByYoutubeId(channelId) || dbStore.channels.get(channelId);
    if (!channel) {
      return { success: false, error: `Channel not found with ID: ${channelId}` };
    }

    // Fallback otomatis: Jangan pernah lempar error jika ID profil tidak cocok persis di dbStore
    const profile = dbStore.resolveProfileForChannel(channel, profileIdOverride);
    if (!channel.contentProfileId || channel.contentProfileId !== profile.id) {
      channel.contentProfileId = profile.id;
    }

    // Fetch Master Titles strictly bound to this profile / channel
    const titles: RotationTitle[] = [];
    const seenTitleIds = new Set<string>();
    for (const tId of profile.masterTitleIds || []) {
      const t = dbStore.masterTitles.get(tId);
      if (t && t.isActive && !seenTitleIds.has(t.id)) {
        seenTitleIds.add(t.id);
        titles.push({ id: t.id, text: t.text, orderIndex: t.orderIndex });
      }
    }
    for (const t of dbStore.masterTitles.values()) {
      const belongs = t.profileId === profile.id || (t as any).channelId === channel.id || (t as any).channelId === channel.youtubeChannelId;
      if (belongs && t.isActive && !seenTitleIds.has(t.id)) {
        seenTitleIds.add(t.id);
        titles.push({ id: t.id, text: t.text, orderIndex: t.orderIndex });
      }
    }
    // Fallback: Jika profil belum mengikat master title, ambil dari master title aktif umum
    if (titles.length === 0) {
      for (const t of dbStore.masterTitles.values()) {
        if (t.isActive && !seenTitleIds.has(t.id)) {
          seenTitleIds.add(t.id);
          titles.push({ id: t.id, text: t.text, orderIndex: t.orderIndex });
        }
      }
    }
    // Note: Do not inject dummy titles. AMG Command Center strictly requires user-defined Master Titles.

    // Fetch Master Thumbnails strictly bound to this profile / channel (excluding any mock assets)
    const isMockThumb = (url?: string, id?: string, name?: string) => {
      if (!url) return true;
      if (url.includes('images.unsplash.com')) return true;
      if (id && (id.startsWith('thumb-gen-') || id.startsWith('thumb-default-') || id.startsWith('thumb-1') || id.startsWith('thumb-2') || id.startsWith('thumb-3') || id.startsWith('thumb-4') || id.startsWith('ayam-th-') || id.startsWith('asmr-th-') || id.startsWith('murottal-th-'))) return true;
      const n = (name || '').toLowerCase();
      if (n.includes('pemandangan') || n.includes('hutan pinus') || n.includes('danau tenang') || n.includes('suasana alam rindang') || n.includes('default ambience landscape')) return true;
      return false;
    };

    const thumbnails: RotationThumbnail[] = [];
    const seenThumbIds = new Set<string>();
    for (const thId of profile.masterThumbnailIds || []) {
      const th = dbStore.masterThumbnails.get(thId);
      if (th && th.isActive && !isMockThumb(th.url, th.id, th.name) && !seenThumbIds.has(th.id)) {
        seenThumbIds.add(th.id);
        thumbnails.push({ id: th.id, name: th.name, url: th.url, orderIndex: th.orderIndex });
      }
    }
    for (const th of dbStore.masterThumbnails.values()) {
      const belongs = th.profileId === profile.id || (th as any).channelId === channel.id || (th as any).channelId === channel.youtubeChannelId;
      if (belongs && th.isActive && !isMockThumb(th.url, th.id, th.name) && !seenThumbIds.has(th.id)) {
        seenThumbIds.add(th.id);
        thumbnails.push({ id: th.id, name: th.name, url: th.url, orderIndex: th.orderIndex });
      }
    }

    // 1. EVALUATE & CLASSIFY ALL UNMANAGED VIDEOS
    const enrolledRegularVideos: ManagedVideo[] = [];
    const candidateVideos: ManagedVideo[] = [];
    const protectedOldVideos: ManagedVideo[] = [];
    const protectedCutoffVideos: ManagedVideo[] = [];
    const unclassifiedVideos: ManagedVideo[] = [];
    const excludedVideos: ManagedVideo[] = [];
    let alreadyManagedCount = 0;

    for (const video of dbStore.videos.values()) {
      const isChannelMatch =
        video.channelId === channel.id ||
        video.channelId === channel.youtubeChannelId ||
        video.channelId === `chan-${channel.youtubeChannelId}` ||
        (channel.id.startsWith('chan-') && video.channelId === channel.id.replace('chan-', '')) ||
        (channelId && video.channelId === channelId);
      if (!isChannelMatch) continue;

      const isAlreadyDone = video.managementStatus === 'COMPLETED' && video.taskStatus?.title === 'SUCCESS';
      if (isAlreadyDone) {
        alreadyManagedCount++;
        continue;
      }

      // If video is already explicitly enrolled and ready as REGULAR
      if (video.isEnrolled && video.managementScope === 'REGULAR' && video.isAmgEligible && !isAlreadyDone) {
        enrolledRegularVideos.push(video);
        continue;
      }

      // Run multi-layer eligibility evaluation
      const evalRes = evaluateVideoEligibility(video, channel, profile);
      video.safetyCategory = evalRes.category;
      video.protectionReason = evalRes.reason;
      video.matchedTitlePattern = evalRes.matchedTitlePattern;
      video.isProtected = evalRes.isProtected;

      // Auto-Enroll Tanpa Syarat Manual: Seluruh video privat mentah yang tidak dikecualikan
      // otomatis didaftarkan (auto-enroll) sebagai REGULAR yang siap otomasi untuk Kloter 1 dan Kloter 2.
      const isPrivateRawCandidate =
        (video.privacyStatus || 'private').toLowerCase() === 'private' &&
        video.managementScope !== 'EXCLUDED';

      if (isPrivateRawCandidate || evalRes.category === 'NEW_PRIVATE_CANDIDATE' || evalRes.category === 'ELIGIBLE') {
        video.managementScope = 'REGULAR';
        video.isAmgEligible = true;
        video.isEnrolled = true;
        video.isProtected = false;
        video.managementStatus = video.processingStatus === 'processed' ? 'READY' : 'DISCOVERED';
        video.safetyCategory = 'ELIGIBLE';
        enrolledRegularVideos.push(video);
      } else if (evalRes.category === 'PROTECTED_OLD') {
        protectedOldVideos.push(video);
      } else if (evalRes.category === 'PROTECTED_BY_CUTOFF') {
        protectedCutoffVideos.push(video);
      } else if (evalRes.category === 'UNCLASSIFIED') {
        unclassifiedVideos.push(video);
      } else {
        excludedVideos.push(video);
      }
    }

    // Sort chronologically by original upload date
    const sortByUpload = (a: ManagedVideo, b: ManagedVideo) =>
      new Date(a.originalUploadAt).getTime() - new Date(b.originalUploadAt).getTime();

    enrolledRegularVideos.sort(sortByUpload);
    candidateVideos.sort(sortByUpload);
    protectedOldVideos.sort(sortByUpload);
    protectedCutoffVideos.sort(sortByUpload);
    unclassifiedVideos.sort(sortByUpload);
    excludedVideos.sort(sortByUpload);

    const totalUnmanaged =
      enrolledRegularVideos.length +
      candidateVideos.length +
      protectedOldVideos.length +
      protectedCutoffVideos.length +
      unclassifiedVideos.length +
      excludedVideos.length;

    const scopeSummary: AutomationScopeSummary = {
      includedCount: enrolledRegularVideos.length,
      excludedCount: excludedVideos.length + protectedOldVideos.length + protectedCutoffVideos.length,
      needsScopeAssignmentCount: candidateVideos.length + unclassifiedVideos.length,
      totalDetected: totalUnmanaged,
      eligibleCount: enrolledRegularVideos.length + candidateVideos.length,
      newCandidatesCount: candidateVideos.length,
      protectedOldCount: protectedOldVideos.length,
      protectedByCutoffCount: protectedCutoffVideos.length,
      unclassifiedCount: unclassifiedVideos.length,
      alreadyManagedCount,
    };

    if (totalUnmanaged === 0) {
      return {
        success: true,
        preview: [],
        channelTitle: channel.title,
        profileName: profile.name,
        unmanagedCount: 0,
        scopeSummary,
      };
    }

    // 2. Resolve scheduling configuration
    const scheduleConfig = resolveScheduleConfig(channel, profile);
    const validation = validateScheduleConfig(scheduleConfig);
    if (!validation.isValid) {
      return {
        success: false,
        error: `Invalid scheduling configuration: ${validation.errors.join('; ')}`,
        scopeSummary,
      };
    }

    // 3. DETERMINISTIC AMG SCHEDULING CURSOR (Check 8 & 17)
    // Titik acuan jadwal terakhir WAJIB diambil HANYA dari video yang memiliki status penjadwalan resmi dari YouTube Studio:
    // Filter: status.uploadStatus === 'processed' && status.publishAt != null
    // DILARANG mengambil tanggal dari video mentah/private yang belum terjadwal (seperti 'Salinan dari A')
    const occupiedSlots: string[] = [];
    const verifiedScheduledVideos = Array.from(dbStore.videos.values()).filter((v) => {
      const isChannelMatch =
        v.channelId === channel.id ||
        v.channelId === channel.youtubeChannelId ||
        v.channelId === `chan-${channel.youtubeChannelId}` ||
        (channel.id.startsWith('chan-') && v.channelId === channel.id.replace('chan-', '')) ||
        (channelId && v.channelId === channelId);
      if (!isChannelMatch) return false;

      const isPrivate = (v.privacyStatus || '').toLowerCase() === 'private';
      if (!isPrivate) return false;

      const isProcessed =
        v.uploadStatus === 'processed' ||
        (v as any).status?.uploadStatus === 'processed' ||
        v.processingStatus === 'processed';
      if (!isProcessed) return false;

      const pub = v.publishAt || (v as any).status?.publishAt;
      if (!pub) return false;

      const rawT = (v.titleBefore || (v as any).title || '').toLowerCase();
      if (rawT.startsWith('salinan dari') || rawT.startsWith('copy of')) return false;

      const time = new Date(pub).getTime();
      return !isNaN(time) && time > 0;
    });

    // Urutkan publishAt secara descending (terjauh ke masa depan). Nilai publishAt terjauh itulah yang menjadi titik acuan resmi channel.
    verifiedScheduledVideos.sort((a, b) => {
      const pubA = (a.publishAt || (a as any).status?.publishAt)!;
      const pubB = (b.publishAt || (b as any).status?.publishAt)!;
      return new Date(pubB).getTime() - new Date(pubA).getTime();
    });

    for (const v of verifiedScheduledVideos) {
      const pub = v.publishAt || (v as any).status?.publishAt;
      if (pub) occupiedSlots.push(pub);
    }

    let latestAmgScheduledTime: string | null = null;
    if (verifiedScheduledVideos.length > 0) {
      latestAmgScheduledTime = verifiedScheduledVideos[0].publishAt || (verifiedScheduledVideos[0] as any).status?.publishAt || null;
    }

    // Fall back to channel.latestManagedScheduledAt or channel.lastScheduledPublishAt
    const effectiveLatest =
      latestAmgScheduledTime || channel.latestManagedScheduledAt || channel.lastScheduledPublishAt || null;

    // 4. GENERATE ROTATIONS & SCHEDULE SLOTS FOR ACTIVE ENROLLED VIDEOS
    const startingTitleOffset = channel.rotationTitleIndex || 0;
    const startingThumbnailOffset = channel.rotationThumbnailIndex || 0;

    let rotationAssignments: any[] = [];
    let scheduleSlots: any[] = [];

    if (enrolledRegularVideos.length > 0) {
      if (thumbnails.length > 0 && titles.length > 0) {
        rotationAssignments = generateRotationMatrix(
          titles,
          thumbnails,
          enrolledRegularVideos.length,
          startingTitleOffset,
          startingThumbnailOffset
        );
      }
      scheduleSlots = calculateNextSchedules(
        enrolledRegularVideos.length,
        scheduleConfig,
        effectiveLatest,
        occupiedSlots
      );
    }

    // Also calculate preview rotations/slots for Candidates so user can inspect what they WOULD get
    let candidateRotations: any[] = [];
    let candidateSlots: any[] = [];
    if (candidateVideos.length > 0) {
      const candidateTitleOffset = titles.length > 0 ? (startingTitleOffset + enrolledRegularVideos.length) % titles.length : 0;
      const candidateThumbOffset = thumbnails.length > 0 ? (startingThumbnailOffset + enrolledRegularVideos.length) % thumbnails.length : 0;
      if (thumbnails.length > 0 && titles.length > 0) {
        candidateRotations = generateRotationMatrix(
          titles,
          thumbnails,
          candidateVideos.length,
          candidateTitleOffset,
          candidateThumbOffset
        );
      }
      const candidateAnchor =
        scheduleSlots.length > 0 ? scheduleSlots[scheduleSlots.length - 1].isoPublishAt : effectiveLatest;
      const allOccupied = [...occupiedSlots, ...scheduleSlots.map((s) => s.isoPublishAt)];
      candidateSlots = calculateNextSchedules(
        candidateVideos.length,
        scheduleConfig,
        candidateAnchor,
        allOccupied
      );
    }

    // 5. ASSEMBLE PREVIEW ITEMS
    const previewItems: AutomationPreviewItem[] = [];
    let sequenceCounter = 1;

    // A. ENROLLED AMG REGULAR VIDEOS (Ready for execution)
    for (let i = 0; i < enrolledRegularVideos.length; i++) {
      const video = enrolledRegularVideos[i];
      const rotation = rotationAssignments[i];
      const slot = scheduleSlots[i];

      const assignedTitle = rotation ? rotation.title.text : (titles.length > 0 ? getTitleForIndex(titles, startingTitleOffset + i).text : 'Menunggu Master Judul');
      const rawNativeThumb = video.thumbnailBefore || video.thumbnailAssigned || (video.youtubeVideoId ? `https://i.ytimg.com/vi/${video.youtubeVideoId}/hqdefault.jpg` : '');
      const hasCustomMasterThumb = Boolean(rotation && rotation.thumbnail && !isMockThumb(rotation.thumbnail.url, rotation.thumbnail.id, rotation.thumbnail.name));
      const assignedThumbnail = hasCustomMasterThumb ? rotation.thumbnail.url : rawNativeThumb;

      previewItems.push({
        sequence: sequenceCounter++,
        videoId: video.id,
        originalTitle: video.titleBefore,
        assignedTitle,
        originalThumbnail: rawNativeThumb,
        assignedThumbnail,
        isCustomThumbnail: hasCustomMasterThumb,
        thumbnailLabel: hasCustomMasterThumb ? (rotation?.thumbnail?.name || `Master Kustom TH${(i % Math.max(1, thumbnails.length)) + 1}`) : 'Bawaan YouTube',
        publishDate: slot.dateString,
        publishTime: `${slot.timeString} ${slot.timezoneAbbreviation}`,
        targetChannelId: channel.id,
        targetChannelTitle: channel.title,
        contentProfileName: profile.name,
        status: video.processingStatus === 'processed' ? 'READY' : 'PROCESSING',
        managementScope: 'REGULAR',
        safetyCategory: 'ELIGIBLE',
        isAmgEligible: true,
        isProtected: false,
        uploadedAt: video.originalUploadAt,
      });
    }

    // B. NEW CANDIDATES (Eligible, awaiting user enrollment)
    for (let i = 0; i < candidateVideos.length; i++) {
      const video = candidateVideos[i];
      const rotation = candidateRotations[i];
      const slot = candidateSlots[i];

      const assignedTitle = rotation ? rotation.title.text : (titles.length > 0 ? getTitleForIndex(titles, startingTitleOffset + enrolledRegularVideos.length + i).text : '(Pending Enrollment)');
      const rawNativeThumb = video.thumbnailBefore || video.thumbnailAssigned || (video.youtubeVideoId ? `https://i.ytimg.com/vi/${video.youtubeVideoId}/hqdefault.jpg` : '');
      const hasCustomMasterThumb = Boolean(rotation && rotation.thumbnail && !isMockThumb(rotation.thumbnail.url, rotation.thumbnail.id, rotation.thumbnail.name));
      const assignedThumbnail = hasCustomMasterThumb ? rotation.thumbnail.url : rawNativeThumb;

      previewItems.push({
        sequence: sequenceCounter++,
        videoId: video.id,
        originalTitle: video.titleBefore,
        assignedTitle,
        originalThumbnail: rawNativeThumb,
        assignedThumbnail,
        isCustomThumbnail: hasCustomMasterThumb,
        thumbnailLabel: hasCustomMasterThumb ? (rotation?.thumbnail?.name || `Master Kustom TH${(i % Math.max(1, thumbnails.length)) + 1}`) : 'Bawaan YouTube',
        publishDate: slot ? slot.dateString : '—',
        publishTime: slot ? `${slot.timeString} ${slot.timezoneAbbreviation}` : 'Pending Enrollment',
        targetChannelId: channel.id,
        targetChannelTitle: channel.title,
        contentProfileName: profile.name,
        status: 'CANDIDATE',
        managementScope: 'UNCLASSIFIED',
        safetyCategory: 'NEW_PRIVATE_CANDIDATE',
        isAmgEligible: false,
        isProtected: false,
        matchedTitlePattern: video.matchedTitlePattern,
        protectionReason: video.protectionReason || 'Eligible candidate awaiting user enrollment.',
        uploadedAt: video.originalUploadAt,
      });
    }

    // C. PROTECTED BY UPLOAD CUTOFF
    for (let i = 0; i < protectedCutoffVideos.length; i++) {
      const video = protectedCutoffVideos[i];
      previewItems.push({
        sequence: sequenceCounter++,
        videoId: video.id,
        originalTitle: video.titleBefore,
        assignedTitle: '(Protected - Upload Cutoff)',
        originalThumbnail: video.thumbnailBefore,
        assignedThumbnail: video.thumbnailBefore,
        publishDate: '—',
        publishTime: 'Blocked (Cutoff)',
        targetChannelId: channel.id,
        targetChannelTitle: channel.title,
        contentProfileName: profile.name,
        status: 'BLOCKED_EXCLUDED',
        managementScope: 'EXCLUDED',
        safetyCategory: 'PROTECTED_BY_CUTOFF',
        isAmgEligible: false,
        isProtected: true,
        protectionReason:
          video.protectionReason || `Uploaded before managed cutoff (${channel.latestManagedUploadAt}).`,
        uploadedAt: video.originalUploadAt,
      });
    }

    // D. PROTECTED OLD VIDEOS
    for (let i = 0; i < protectedOldVideos.length; i++) {
      const video = protectedOldVideos[i];
      previewItems.push({
        sequence: sequenceCounter++,
        videoId: video.id,
        originalTitle: video.titleBefore,
        assignedTitle: '(Protected - Outside Window)',
        originalThumbnail: video.thumbnailBefore,
        assignedThumbnail: video.thumbnailBefore,
        publishDate: '—',
        publishTime: 'Blocked (Historical)',
        targetChannelId: channel.id,
        targetChannelTitle: channel.title,
        contentProfileName: profile.name,
        status: 'BLOCKED_EXCLUDED',
        managementScope: 'EXCLUDED',
        safetyCategory: 'PROTECTED_OLD',
        isAmgEligible: false,
        isProtected: true,
        protectionReason: video.protectionReason || 'Historical video outside eligibility window.',
        uploadedAt: video.originalUploadAt,
      });
    }

    // E. UNCLASSIFIED (Title pattern mismatch)
    for (let i = 0; i < unclassifiedVideos.length; i++) {
      const video = unclassifiedVideos[i];
      previewItems.push({
        sequence: sequenceCounter++,
        videoId: video.id,
        originalTitle: video.titleBefore,
        assignedTitle: '(Unclassified - Pattern Mismatch)',
        originalThumbnail: video.thumbnailBefore,
        assignedThumbnail: video.thumbnailBefore,
        publishDate: '—',
        publishTime: 'Blocked (Pattern)',
        targetChannelId: channel.id,
        targetChannelTitle: channel.title,
        contentProfileName: profile.name,
        status: 'NEEDS_SCOPE',
        managementScope: 'UNCLASSIFIED',
        safetyCategory: 'UNCLASSIFIED',
        isAmgEligible: false,
        isProtected: true,
        protectionReason: video.protectionReason || 'Title does not match eligible patterns.',
        uploadedAt: video.originalUploadAt,
      });
    }

    // F. EXCLUDED (Personal archive / Non-private)
    for (let i = 0; i < excludedVideos.length; i++) {
      const video = excludedVideos[i];
      previewItems.push({
        sequence: sequenceCounter++,
        videoId: video.id,
        originalTitle: video.titleBefore,
        assignedTitle: '(Excluded)',
        originalThumbnail: video.thumbnailBefore,
        assignedThumbnail: video.thumbnailBefore,
        publishDate: '—',
        publishTime: 'Excluded',
        targetChannelId: channel.id,
        targetChannelTitle: channel.title,
        contentProfileName: profile.name,
        status: 'BLOCKED_EXCLUDED',
        managementScope: 'EXCLUDED',
        safetyCategory: 'EXCLUDED',
        isAmgEligible: false,
        isProtected: true,
        exclusionReason: video.exclusionReason || video.protectionReason || 'Excluded from AMG automation.',
        uploadedAt: video.originalUploadAt,
      });
    }

    return {
      success: true,
      preview: previewItems,
      channelTitle: channel.title,
      profileName: profile.name,
      unmanagedCount: enrolledRegularVideos.length,
      scopeSummary,
    };
  }

  /**
   * Executes Dry Run simulation: reads state, calculates rotations & schedules, runs safety gate checks,
   * but guarantees ZERO mutation to live YouTube data.
   */
  public async executeDryRun(
    channelId: string,
    profileId?: string
  ): Promise<{ success: boolean; batch?: AutomationBatch; error?: string }> {
    const previewResult = this.generatePreview(channelId, profileId);
    if (!previewResult.success || !previewResult.preview) {
      return { success: false, error: previewResult.error };
    }

    // In Dry Run, we evaluate both enrolled items AND eligible new candidates
    const eligibleItems = previewResult.preview.filter(
      (p) =>
        (p.managementScope === 'REGULAR' && p.isAmgEligible) ||
        p.status === 'CANDIDATE' ||
        p.safetyCategory === 'NEW_PRIVATE_CANDIDATE'
    );

    if (eligibleItems.length === 0) {
      return {
        success: false,
        error: `Dry run cannot proceed: Zero eligible regular videos or candidates detected. There are ${
          previewResult.scopeSummary?.needsScopeAssignmentCount || 0
        } unclassified/candidate videos requiring review.`,
      };
    }

    const channel = dbStore.channels.get(channelId)!;
    const batchId = `AMG-BATCH-${String(batchSequence++).padStart(4, '0')}`;

    const batch: AutomationBatch = {
      id: batchId,
      batchNumber: batchId,
      channelId,
      channelTitle: channel.title,
      profileId: profileId || channel.contentProfileId || '',
      profileName: previewResult.profileName,
      isDryRun: true,
      status: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      detectedCount: eligibleItems.length,
      processedCount: eligibleItems.length,
      scheduledCount: eligibleItems.length,
      completedCount: eligibleItems.length,
      failedCount: 0,
    };

    dbStore.automationBatches.set(batchId, batch);

    dbStore.logActivity({
      user: 'Automation Engine',
      channelId,
      channelTitle: channel.title,
      operation: 'Dry Run Completed (Simulation)',
      previousValue: 'Dry run requested',
      newValue: `Simulated ${eligibleItems.length} videos. Zero mutations performed on YouTube. Protected: ${
        previewResult.scopeSummary?.protectedOldCount || 0
      } old, ${previewResult.scopeSummary?.protectedByCutoffCount || 0} cutoff, ${
        previewResult.scopeSummary?.unclassifiedCount || 0
      } unclassified.`,
      result: 'SUCCESS',
    });

    return { success: true, batch };
  }

  /**
   * Executes live asynchronous batch automation.
   * STRICT SAFETY GUARANTEE: Only enrolled videos with managementScope === 'REGULAR' and isAmgEligible === true
   * that pass the real-time validateBeforeMutation gate are processed.
   */
  public async startBatchAutomation(
    channelId: string,
    profileId?: string
  ): Promise<{ success: boolean; batch?: AutomationBatch; error?: string }> {
    const previewResult = this.generatePreview(channelId, profileId);
    if (!previewResult.success || !previewResult.preview) {
      return { success: false, error: previewResult.error };
    }

    // Bypass validasi manual: Otomatis daftarkan (auto-enroll) seluruh kandidat video non-excluded
    let enrolledItems = previewResult.preview.filter((p) => p.managementScope !== 'EXCLUDED');

    // Auto-enroll di dbStore untuk semua video kandidat
    for (const item of enrolledItems) {
      const v = dbStore.getVideoById(item.videoId) || dbStore.videos.get(item.videoId);
      if (v && !v.isManaged && v.managementScope !== 'EXCLUDED') {
        v.managementScope = 'REGULAR';
        v.isAmgEligible = true;
        v.managementStatus = 'READY';
        v.isEnrolled = true;
        v.updatedAt = new Date().toISOString();
        dbStore.videos.set(v.id, v);
      }
    }

    // Jika previewResult belum memuat item, ekstrak langsung dari video unmanaged private di dbStore
    if (enrolledItems.length === 0) {
      const rawVids = Array.from(dbStore.videos.values()).filter(
        (v) =>
          (v.channelId === channelId ||
            v.channelId === `chan-${channelId}` ||
            (channelId.startsWith('chan-') && v.channelId === channelId.replace('chan-', ''))) &&
          !v.isManaged &&
          v.managementStatus !== 'COMPLETED' &&
          v.managementScope !== 'EXCLUDED' &&
          (v.privacyStatus || '').toLowerCase() === 'private' &&
          !v.publishAt
      );
      for (const v of rawVids) {
        v.managementScope = 'REGULAR';
        v.isAmgEligible = true;
        v.managementStatus = 'READY';
        v.isEnrolled = true;
        v.updatedAt = new Date().toISOString();
        dbStore.videos.set(v.id, v);
      }
      enrolledItems = rawVids.map((v, i) => ({
        sequence: i + 1,
        videoId: v.id,
        originalTitle: v.titleBefore || 'Video YouTube',
        assignedTitle: v.titleAssigned || v.titleBefore || 'Video YouTube',
        originalThumbnail: v.thumbnailBefore || '',
        assignedThumbnail: v.thumbnailAssigned || v.thumbnailBefore || '',
        publishDate: new Date(Date.now() + (i + 1) * 86400000).toISOString().split('T')[0],
        publishTime: '16:00 WIB',
        targetChannelId: channelId,
        targetChannelTitle: channelId,
        contentProfileName: 'Profil Konten',
        status: 'READY',
        managementScope: 'REGULAR',
        safetyCategory: 'ELIGIBLE',
        isAmgEligible: true,
        isProtected: false,
        uploadedAt: v.originalUploadAt || v.uploadedAt,
      }));
    }

    if (enrolledItems.length === 0) {
      return {
        success: false,
        error: `Tidak ada video kandidat siap kelola pada channel ini. Pastikan ada video berstatus unmanaged private.`,
      };
    }

    const channel = dbStore.getChannelByIdOrTitle(channelId) || dbStore.getChannelByYoutubeId(channelId) || dbStore.channels.get(channelId)!;
    const profile = dbStore.resolveProfileForChannel(channel, profileId);
    if (!channel.contentProfileId || channel.contentProfileId !== profile.id) {
      channel.contentProfileId = profile.id;
    }

    // FIX #2: ENFORCE DAILY CAPACITY TARGET (DEFAULT 70, MAX 90) ROLLING 24 HOURS
    const targetCapacity = Math.min(channel.dailyCapacityTarget || 70, 90);
    const usedLast24h = dbStore.getSuccessfulThumbnailCountLast24h(channel.id);
    const remainingCapacity = Math.max(0, targetCapacity - usedLast24h);

    if (remainingCapacity <= 0) {
      return {
        success: false,
        error: `Daily automation capacity reached for channel "${channel.title}" (${usedLast24h}/${targetCapacity} in rolling 24h). Automation throttled to protect YouTube quotas.`,
      };
    }

    // Dynamic Batch Chaining (Requirement 1): Kapasitas 1 kloter = 50 video per eksekusi
    const BATCH_CHUNK_SIZE = 50;
    const firstKloterLimit = Math.min(BATCH_CHUNK_SIZE, remainingCapacity);
    if (enrolledItems.length > firstKloterLimit) {
      console.log(
        `[AutomationEngine] Menyiapkan Kloter 1 sebanyak ${firstKloterLimit} video (dari total ${enrolledItems.length} video enrolled). Worker akan otomatis menarik kloter berikutnya.`
      );
      enrolledItems = enrolledItems.slice(0, firstKloterLimit);
    }

    const batchId = `AMG-BATCH-${String(batchSequence++).padStart(4, '0')}`;

    const batch: AutomationBatch = {
      id: batchId,
      batchNumber: batchId,
      channelId,
      channelTitle: channel.title,
      profileId: profileId || channel.contentProfileId || '',
      profileName: previewResult.profileName,
      isDryRun: false,
      status: 'running',
      startedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      detectedCount: enrolledItems.length,
      processedCount: 0,
      scheduledCount: 0,
      completedCount: 0,
      failedCount: 0,
    };

    dbStore.automationBatches.set(batchId, batch);

    dbStore.logActivity({
      user: 'Automation Engine',
      channelId,
      channelTitle: channel.title,
      operation: 'Batch Automation Launched (Phase 3 Asynchronous Queue)',
      previousValue: 'Batch queued',
      newValue: `Processing ${enrolledItems.length} enrolled videos [${batchId}] via Phase 3 worker queue.`,
      result: 'SUCCESS',
    });

    // Enqueue jobs into Phase 3 Queue Worker with Pre-Mutation Snapshots and Retries
    const phase3Jobs = enrolledItems.map((item) => {
      let isoPublishAt = item.publishDate;
      if (!item.publishDate.includes('T')) {
        const [hours, minutes] = item.publishTime.split(' ')[0].split(':');
        const [year, month, day] = item.publishDate.split('-').map(Number);
        const schedDate = new Date(Date.UTC(year, month - 1, day, Number(hours) - 7, Number(minutes), 0));
        isoPublishAt = schedDate.toISOString();
      }

      return {
        videoId: item.videoId,
        payload: {
          title: item.assignedTitle,
          description: profile?.description || 'Relaxing ambience and soundscape.',
          tags: ['ambience', 'sleep', 'relaxing', 'asmr'],
          scheduledPublishAt: isoPublishAt,
          thumbnailUrl: item.assignedThumbnail,
        },
      };
    });

    // Run via Phase3Engine (with rate-limiting, hard safety gate, snapshots, and retries)
    await phase3Engine.enqueueBatchJobs(batchId, channelId, phase3Jobs);

    return { success: true, batch };
  }

  private async processBatchAsync(batchId: string, channelId: string, enrolledItems: AutomationPreviewItem[]) {
    const batch = dbStore.automationBatches.get(batchId);
    const channel = dbStore.channels.get(channelId);
    if (!batch || !channel) return;

    let lastScheduledIso = channel.latestManagedScheduledAt || channel.lastScheduledPublishAt;
    let maxUploadTimestamp = 0;
    let maxUploadIso = channel.latestManagedUploadAt || '';

    const startingTitleOffset = channel.rotationTitleIndex || 0;
    const startingThumbOffset = channel.rotationThumbnailIndex || 0;

    for (let i = 0; i < enrolledItems.length; i++) {
      if (this.isPaused) {
        batch.status = 'paused';
        return;
      }

      const item = enrolledItems[i];
      const video = dbStore.videos.get(item.videoId);
      if (!video) continue;

      const jobId = `job-${batchId}-${i + 1}`;
      const job: AutomationJob = {
        id: jobId,
        batchId,
        videoId: video.id,
        videoTitle: video.titleBefore,
        channelId,
        channelTitle: channel.title,
        jobType: 'apply_title',
        status: 'processing',
        startedAt: new Date().toISOString(),
        retryCount: 0,
      };
      dbStore.automationJobs.set(jobId, job);

      try {
        // =========================================================================
        // HARD SAFETY GATE (Requirement 12)
        // Re-validates the video dynamically immediately before any mutation.
        // =========================================================================
        const gateCheck = validateBeforeMutation(video.id, channelId);
        if (!gateCheck.isValid) {
          throw new Error(gateCheck.reason || 'HARD SAFETY GATE: Mutation rejected.');
        }

        // Step 1: Validate HD readiness
        video.managementStatus = 'VALIDATING';
        if (video.processingStatus !== 'processed') {
          throw new Error('Video is still processing in SD/HD. Must wait until processed.');
        }

        // Step 2: Apply Title (Deterministic Rotation)
        video.managementStatus = 'TITLE_APPLIED';
        video.titleAssigned = item.assignedTitle;
        video.rotationTitleIndex = (startingTitleOffset + i);

        // Execute YouTube API if OAuth token is active
        const hasAuth = await youtubeAuthService.getValidAccessToken(channelId);
        if (hasAuth && video.youtubeVideoId) {
          const titleRes = await youtubeDataService.updateVideoTitle(channelId, video.youtubeVideoId, item.assignedTitle);
          if (!titleRes.success) {
            console.warn('YouTube live update note:', titleRes.error);
          }
        }

        dbStore.logActivity({
          user: 'Automation Engine',
          channelId,
          channelTitle: channel.title,
          videoId: video.id,
          operation: 'Master Title Applied',
          previousValue: video.titleBefore,
          newValue: `Title assigned: "${item.assignedTitle}"`,
          result: 'SUCCESS',
        });

        // Step 3: Apply Thumbnail (Deterministic Independent Rotation)
        video.managementStatus = 'THUMBNAIL_APPLIED';
        video.thumbnailAssigned = item.assignedThumbnail;
        video.rotationThumbnailIndex = (startingThumbOffset + i);

        if (hasAuth && video.youtubeVideoId) {
          const thumbRes = await youtubeDataService.updateVideoThumbnail(channelId, video.youtubeVideoId, item.assignedThumbnail);
          if (!thumbRes.success) {
            console.warn('YouTube live thumbnail note:', thumbRes.error);
          }
        }

        dbStore.logActivity({
          user: 'Automation Engine',
          channelId,
          channelTitle: channel.title,
          videoId: video.id,
          operation: 'Master Thumbnail Applied',
          previousValue: video.thumbnailBefore,
          newValue: `Thumbnail assigned from profile matrix`,
          result: 'SUCCESS',
        });

        // Step 4: Schedule Video
        video.managementStatus = 'SCHEDULE_PENDING';
        let isoPublishAt = item.publishDate;
        if (!item.publishDate.includes('T')) {
          const [hours, minutes] = item.publishTime.split(' ')[0].split(':');
          const [year, month, day] = item.publishDate.split('-').map(Number);
          // Asia/Jakarta offset: UTC+7
          const schedDate = new Date(Date.UTC(year, month - 1, day, Number(hours) - 7, Number(minutes), 0));
          isoPublishAt = schedDate.toISOString();
        }
        video.scheduledPublishAt = isoPublishAt;
        video.scheduledAt = isoPublishAt;
        lastScheduledIso = isoPublishAt;

        if (hasAuth && video.youtubeVideoId) {
          const schedRes = await youtubeDataService.scheduleVideo(channelId, video.youtubeVideoId, isoPublishAt);
          if (!schedRes.success) {
            console.warn('YouTube live schedule note:', schedRes.error);
          }
        }

        dbStore.logActivity({
          user: 'Automation Engine',
          channelId,
          channelTitle: channel.title,
          videoId: video.id,
          operation: 'Video Scheduled',
          previousValue: 'Unscheduled',
          newValue: `Scheduled for: ${item.publishDate} ${item.publishTime}`,
          result: 'SUCCESS',
        });

        // Step 5: Verify
        video.managementStatus = 'VERIFIED';
        video.verifiedAt = new Date().toISOString();

        // Step 6: Mark Completed & Managed
        video.managementStatus = 'COMPLETED';
        video.amgStatus = 'COMPLETED';
        video.isManaged = true; // Protects video from ever being re-processed
        video.isAmgManaged = true;
        video.automationBatchId = batchId;
        video.batchId = batchId;
        video.updatedAt = new Date().toISOString();

        // Track max upload time to advance the detection cutoff
        const uploadMs = new Date(video.originalUploadAt).getTime();
        if (uploadMs > maxUploadTimestamp) {
          maxUploadTimestamp = uploadMs;
          maxUploadIso = video.originalUploadAt;
        }

        job.status = 'completed';
        job.completedAt = new Date().toISOString();

        batch.processedCount++;
        batch.scheduledCount++;
        batch.completedCount++;
      } catch (err: any) {
        const isSafetyGateViolation = err.message.includes('SAFETY') || err.message.includes('BLOCKED');
        video.managementStatus = isSafetyGateViolation ? 'DISCOVERED' : 'ERROR';
        video.amgStatus = isSafetyGateViolation ? 'EXCLUDED' : 'ERROR';
        video.lastError = err.message;
        job.status = 'failed';
        job.error = err.message;
        batch.failedCount++;

        dbStore.logError({
          channelId,
          channelTitle: channel.title,
          videoId: video.id,
          videoTitle: video.titleBefore,
          operation: isSafetyGateViolation ? 'HARD_SAFETY_GATE_BLOCKED' : 'Batch Automation Mutation',
          errorType: isSafetyGateViolation ? 'SecurityExclusion' : 'MutationError',
          errorMessage: err.message,
          retryCount: 1,
        });
      }
    }

    batch.status = batch.failedCount === 0 ? 'completed' : 'failed';
    batch.completedAt = new Date().toISOString();

    // ADVANCE DETECTION CURSOR (latestManagedUploadAt)
    if (maxUploadIso) {
      const prevCutoff = channel.latestManagedUploadAt;
      channel.latestManagedUploadAt = maxUploadIso;
      dbStore.logActivity({
        user: 'Automation Engine',
        channelId,
        channelTitle: channel.title,
        operation: 'Upload Cutoff Cursor Advanced',
        previousValue: prevCutoff || 'None',
        newValue: `latestManagedUploadAt updated to: ${maxUploadIso}`,
        result: 'SUCCESS',
      });
    }

    // ADVANCE SCHEDULING CURSOR (latestManagedScheduledAt)
    if (lastScheduledIso) {
      channel.latestManagedScheduledAt = lastScheduledIso;
      channel.lastScheduledPublishAt = lastScheduledIso;
    }

    // Advance Channel Rotation Indices
    const profile = dbStore.resolveProfileForChannel(channel);
    if (profile) {
      const titleCount = profile.masterTitleIds.length || 1;
      const thumbCount = profile.masterThumbnailIds.length || 1;
      channel.rotationTitleIndex = (startingTitleOffset + batch.completedCount) % titleCount;
      channel.rotationThumbnailIndex = (startingThumbOffset + batch.completedCount) % thumbCount;
    }

    // Recalculate channel unmanaged count
    let unmanaged = 0;
    for (const v of dbStore.videos.values()) {
      if (v.channelId === channelId && !v.isManaged && v.managementScope === 'REGULAR' && v.isAmgEligible) {
        unmanaged++;
      }
    }
    channel.unmanagedVideoCount = unmanaged;

    dbStore.logActivity({
      user: 'Automation Engine',
      channelId,
      channelTitle: channel.title,
      operation: 'Batch Completed',
      previousValue: `Batch ${batchId} in progress`,
      newValue: `Completed ${batch.completedCount}/${enrolledItems.length} videos. Cursor: ${lastScheduledIso}. Cutoff: ${maxUploadIso}.`,
      result: batch.failedCount === 0 ? 'SUCCESS' : 'WARNING',
    });
  }

  public pauseQueue() {
    this.isPaused = true;
  }

  public resumeQueue() {
    this.isPaused = false;
  }
}

export const automationEngine = new AutomationEngine();
