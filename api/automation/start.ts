import { dbStore } from '../../server/db.js';
import { automationEngine } from '../../server/automationEngine.js';
import { phase3Engine } from '../../server/phase3Engine.js';
import type { AutomationBatch, ManagedVideo } from '../../src/types/index.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let batchId = '';
  try {
    const { channelId, profileId, videoIds, executionPlan, channelTitle, videos } = req.body || {};
    if (!channelId) {
      return res.status(400).json({ error: 'channelId is required.' });
    }

    // Sync any candidate videos provided directly from authentic YouTube Data API scan
    if (Array.isArray(videos)) {
      for (const v of videos) {
        if (v && v.id) {
          dbStore.videos.set(v.id, v);
        }
      }
    }

    let channel = dbStore.getChannelByIdOrTitle(channelId) || dbStore.getChannelByYoutubeId(channelId);
    if (!channel) {
      const norm = channelId.trim().toLowerCase();
      for (const c of dbStore.channels.values()) {
        if (
          c.title?.toLowerCase() === norm ||
          c.id.toLowerCase() === norm ||
          c.youtubeChannelId?.toLowerCase() === norm
        ) {
          channel = c;
          break;
        }
      }
    }

    const effectiveTitle =
      channelTitle ||
      channel?.title ||
      channelId;

    if (!channel) {
      channel = dbStore.upsertChannel({
        id: channelId.startsWith('chan-') ? channelId : `chan-${Date.now()}`,
        title: effectiveTitle,
        youtubeChannelId: channelId.startsWith('UC') ? channelId : `UC_${Date.now()}`,
        status: 'CONNECTED',
        connectedAt: new Date().toISOString(),
        contentProfileId: profileId || 'profile-default',
        thumbnailUrl: 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=150',
        videoCount: Array.isArray(videoIds) ? videoIds.length : (Array.isArray(executionPlan) ? executionPlan.length : 8),
        unmanagedVideoCount: Array.isArray(videoIds) ? videoIds.length : (Array.isArray(executionPlan) ? executionPlan.length : 8),
        publishFrequency: '1/day',
        publishTime: '16:00',
        timezone: 'Asia/Jakarta',
        lastScheduledPublishAt: '2026-10-03T09:00:00.000Z',
        latestManagedScheduledAt: '2026-10-03T09:00:00.000Z',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const { batchSize = 50 } = req.body || {};

    // 2. Ambil langsung daftar video kandidat dari dbStore internal di sisi server
    const cId = channel.id;
    const yId = channel.youtubeChannelId;
    const isChannelMatch = (v: ManagedVideo) => {
      return (
        v.channelId === cId ||
        (yId && (v.channelId === yId || v.channelId === `chan-${yId}`)) ||
        (cId.startsWith('chan-') && v.channelId === cId.replace('chan-', '')) ||
        (channelId && v.channelId === channelId)
      );
    };

    // Pastikan seluruh video mentah kandidat di dbStore terdaftar dan ditandai REGULAR / READY (Auto-Enroll)
    for (const v of dbStore.videos.values()) {
      if (isChannelMatch(v)) {
        if (!v.isManaged && v.managementStatus !== 'COMPLETED' && v.managementScope !== 'EXCLUDED') {
          const isPriv = (v.privacyStatus || 'private').toLowerCase() === 'private';
          if (isPriv && !v.publishAt) {
            v.managementScope = 'REGULAR';
            v.isAmgEligible = true;
            v.isEnrolled = true;
            if (v.managementStatus !== 'PROCESSING') {
              v.managementStatus = 'READY';
            }
          }
        }
      }
    }

    // Resolusikan content profile untuk penugasan rotasi & jadwal
    const prof = dbStore.resolveProfileForChannel(channel, profileId);
    if (!channel.contentProfileId || channel.contentProfileId !== prof.id) {
      channel.contentProfileId = prof.id;
    }

    // Dapatkan daftar kandidat video internal di sisi server
    let allCandidates: any[] = [];

    // Prioritas 1: Jika videoIds dikirim langsung dari frontend (daftar ID video yang tampil di UI pratinjau)
    if (Array.isArray(videoIds) && videoIds.length > 0) {
      console.log(`[api/automation/start] Menggunakan ${videoIds.length} videoIds langsung dari request frontend.`);

      const planMap = new Map<string, any>();
      if (Array.isArray(executionPlan)) {
        for (const p of executionPlan) {
          if (p && p.videoId) planMap.set(p.videoId, p);
        }
      }

      const blockId = prof?.blockId || channel.blockId;
      const titles = Array.from(dbStore.masterTitles.values()).filter((t) => !blockId || t.blockId === blockId);
      const thumbs = Array.from(dbStore.masterThumbnails.values()).filter((t) => !blockId || t.blockId === blockId);

      let anchorPublishAt = channel.lastScheduledPublishAt || channel.latestManagedScheduledAt;
      let anchorTime = anchorPublishAt ? new Date(anchorPublishAt).getTime() : Date.now();
      if (isNaN(anchorTime) || anchorTime <= Date.now()) {
        anchorTime = Date.now();
      }

      for (let idx = 0; idx < videoIds.length; idx++) {
        const vidId = videoIds[idx];
        const ytId = vidId.startsWith('yt-vid-') ? vidId.replace('yt-vid-', '') : vidId;
        let v = dbStore.getVideoById(vidId) || dbStore.videos.get(vidId);
        const pItem = planMap.get(vidId);

        const assignedTitle =
          pItem?.assignedTitle ||
          pItem?.title ||
          (titles.length > 0 ? titles[idx % titles.length].text : (v?.titleAssigned || v?.titleBefore || 'Video YouTube'));

        const assignedThumbnail =
          pItem?.assignedThumbnail ||
          pItem?.thumbnailUrl ||
          (thumbs.length > 0 ? thumbs[idx % thumbs.length].url : (v?.thumbnailAssigned || v?.thumbnailBefore || ''));

        const nextSlotDate = new Date(anchorTime + (idx + 1) * 24 * 60 * 60 * 1000);
        nextSlotDate.setUTCHours(9, 0, 0, 0); // 16:00 WIB
        const isoSlot = pItem?.scheduledPublishAt || nextSlotDate.toISOString();
        const dateStr = pItem?.publishDate || isoSlot.split('T')[0];
        const timeStr = pItem?.publishTime || '16:00 WIB';

        if (!v) {
          v = {
            id: vidId,
            youtubeVideoId: ytId,
            channelId: channel.id,
            channelTitle: channel.title,
            titleBefore: pItem?.originalTitle || 'Video YouTube',
            titleAssigned: assignedTitle,
            thumbnailBefore: '',
            thumbnailAssigned: assignedThumbnail,
            originalUploadAt: new Date(Date.now() - (videoIds.length - idx) * 3600000).toISOString(),
            uploadedAt: new Date().toISOString(),
            processingStatus: 'processed',
            privacyStatus: 'private',
            managementStatus: 'READY',
            managementScope: 'REGULAR',
            isAmgEligible: true,
            isManaged: false,
            isEnrolled: true,
            isProtected: false,
            scheduledPublishAt: isoSlot,
            retryCount: 0,
            isSeeded: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        } else {
          v.channelId = channel.id;
          v.titleAssigned = assignedTitle;
          v.thumbnailAssigned = assignedThumbnail;
          v.scheduledPublishAt = isoSlot;
          v.managementScope = 'REGULAR';
          v.isAmgEligible = true;
          v.isEnrolled = true;
          v.isProtected = false;
          v.managementStatus = 'READY';
          v.privacyStatus = 'private';
        }
        dbStore.videos.set(v.id, v);

        allCandidates.push({
          videoId: v.id,
          originalTitle: v.titleBefore,
          assignedTitle,
          originalThumbnail: v.thumbnailBefore,
          assignedThumbnail,
          publishDate: dateStr,
          publishTime: timeStr,
          scheduledPublishAt: isoSlot,
          managementScope: 'REGULAR',
          isAmgEligible: true,
          status: 'READY',
        });
      }
    } else if (Array.isArray(executionPlan) && executionPlan.length > 0) {
      allCandidates = executionPlan;
    } else {
      const previewResult = automationEngine.generatePreview(channel.id, prof.id);
      if (previewResult.success && Array.isArray(previewResult.preview)) {
        allCandidates = previewResult.preview.filter((p) => p.managementScope !== 'EXCLUDED');
      }

      // Fallback: Jika preview engine belum menghasilkan item, ekstrak langsung dari dbStore.videos
      if (allCandidates.length === 0) {
        const rawCandidates = Array.from(dbStore.videos.values()).filter(
          (v) =>
            isChannelMatch(v) &&
            !v.isManaged &&
            v.managementStatus !== 'COMPLETED' &&
            v.managementScope !== 'EXCLUDED' &&
            (v.privacyStatus || '').toLowerCase() === 'private' &&
            !v.publishAt
        );
        rawCandidates.sort(
          (a, b) =>
            new Date(a.originalUploadAt || a.uploadedAt || 0).getTime() -
            new Date(b.originalUploadAt || b.uploadedAt || 0).getTime()
        );

        const blockId = prof?.blockId || channel.blockId;
        const titles = Array.from(dbStore.masterTitles.values()).filter((t) => !blockId || t.blockId === blockId);
        const thumbs = Array.from(dbStore.masterThumbnails.values()).filter((t) => !blockId || t.blockId === blockId);

        allCandidates = rawCandidates.map((v, idx) => {
          const assignedTitle = titles.length > 0 ? titles[idx % titles.length].text : (v.titleAssigned || v.titleBefore || 'Video YouTube');
          const assignedThumbnail = thumbs.length > 0 ? thumbs[idx % thumbs.length].url : (v.thumbnailAssigned || v.thumbnailBefore || '');
          const baseDate = new Date(Date.now() + (idx + 1) * 24 * 60 * 60 * 1000);
          baseDate.setUTCHours(9, 0, 0, 0); // 16:00 WIB
          return {
            videoId: v.id,
            assignedTitle,
            assignedThumbnail,
            publishDate: baseDate.toISOString().split('T')[0],
            publishTime: '16:00 WIB',
            scheduledPublishAt: baseDate.toISOString(),
            managementScope: 'REGULAR',
            isAmgEligible: true,
          };
        });
      }
    }

    if (allCandidates.length === 0) {
      return res.status(400).json({
        success: false,
        error: `Tidak ada video kandidat siap kelola pada channel "${channel.title}". Pastikan channel memiliki video berstatus unmanaged private.`,
      });
    }

    // Step B: Dynamic Batch Chaining: Kapasitas 1 kloter = 50 video per eksekusi
    const targetCapacity = Math.min(channel.dailyCapacityTarget || 70, 90);
    const usedLast24h = dbStore.getSuccessfulThumbnailCountLast24h(channel.id);
    const remainingCapacity = Math.max(0, targetCapacity - usedLast24h);

    const BATCH_CHUNK_SIZE = Number(batchSize) || 50;
    const kloter1Limit = Math.min(BATCH_CHUNK_SIZE, remainingCapacity, allCandidates.length);
    const planToExecute = allCandidates.slice(0, kloter1Limit);

    console.log(
      `[api/automation/start] Menjalankan Kloter 1 sebanyak ${planToExecute.length} video (dari total ${allCandidates.length} video kandidat). Sisa ${Math.max(0, allCandidates.length - planToExecute.length)} video akan ditarik otomatis oleh Phase 3 Worker secara berantai.`
    );

    batchId = `AMG-BATCH-${Date.now().toString().slice(-4)}`;
    const batch: AutomationBatch = {
      id: batchId,
      batchNumber: batchId,
      channelId: channel.id,
      channelTitle: channel.title,
      profileId: prof?.id || channel.contentProfileId || 'profile-default',
      profileName: prof?.name || 'Standard AMG Schedule (Kloter 1)',
      isDryRun: false,
      status: 'running',
      startedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      detectedCount: planToExecute.length,
      processedCount: 0,
      scheduledCount: 0,
      completedCount: 0,
      failedCount: 0,
    };

    dbStore.automationBatches.set(batchId, batch);

    // Daftarkan video di dbStore dan bangun Phase 3 jobs untuk Kloter 1
    const phase3Jobs = [];
    for (let idx = 0; idx < planToExecute.length; idx++) {
      const item = planToExecute[idx];
      let video = dbStore.getVideoById(item.videoId) || dbStore.videos.get(item.videoId);
      if (!video) {
        const ytId = item.videoId.startsWith('yt-vid-') ? item.videoId.replace('yt-vid-', '') : item.videoId;
        video = {
          id: item.videoId,
          youtubeVideoId: ytId,
          channelId: channel.id,
          channelTitle: channel.title,
          titleBefore: item.originalTitle || item.title || 'Video YouTube',
          titleAssigned: item.assignedTitle || item.title || '',
          thumbnailBefore: item.originalThumbnail || item.thumbnailUrl || '',
          thumbnailAssigned: item.assignedThumbnail || item.thumbnailUrl || '',
          originalUploadAt: new Date().toISOString(),
          uploadedAt: new Date().toISOString(),
          processingStatus: 'processed',
          privacyStatus: 'private',
          managementStatus: 'READY',
          managementScope: 'REGULAR',
          isAmgEligible: true,
          isManaged: false,
          isEnrolled: true,
          retryCount: 0,
          isSeeded: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        dbStore.videos.set(video.id, video);
      } else {
        if (item.assignedTitle || item.title) video.titleAssigned = item.assignedTitle || item.title;
        if (item.assignedThumbnail || item.thumbnailUrl) video.thumbnailAssigned = item.assignedThumbnail || item.thumbnailUrl;
        video.managementScope = 'REGULAR';
        video.isAmgEligible = true;
        video.isEnrolled = true;
        video.managementStatus = 'READY';
        video.privacyStatus = 'private';
        video.channelId = channel.id;
        video.automationBatchId = batchId;
        dbStore.videos.set(video.id, video);
      }

      // Hitung jadwal kontinu slot publikasi (1 video per hari jam 16:00 WIB)
      let isoPublishAt = item.scheduledPublishAt;
      if (!isoPublishAt) {
        if (item.publishDate && item.publishTime) {
          let [hours, minutes] = item.publishTime.split(' ')[0].split(':');
          let [y, m, d] = item.publishDate.split('-').map(Number);
          const slotDate = new Date(Date.UTC(y, m - 1, d, Number(hours) - 7, Number(minutes), 0));
          isoPublishAt = slotDate.toISOString();
        } else {
          const baseDate = new Date(Date.now() + (idx + 1) * 24 * 60 * 60 * 1000);
          baseDate.setUTCHours(9, 0, 0, 0); // 16:00 WIB
          isoPublishAt = baseDate.toISOString();
        }
      }

      phase3Jobs.push({
        videoId: video.id,
        payload: {
          title: item.assignedTitle || item.title || video.titleAssigned || video.titleBefore || 'Video YouTube',
          description: prof?.description || 'Continuous relaxing ambience published by AMG.',
          tags: item.tags || ['ambience', 'relaxing', 'sleep', 'music'],
          scheduledPublishAt: isoPublishAt,
          thumbnailUrl: item.assignedThumbnail || item.thumbnailUrl || video.thumbnailAssigned || '',
        },
      });
    }

    // Pastikan seluruh sisa kandidat untuk Kloter 2+ (misal video ke-51 s/d 53) juga terdaftar rapi di dbStore.videos
    for (let idx = kloter1Limit; idx < allCandidates.length; idx++) {
      const item = allCandidates[idx];
      let video = dbStore.getVideoById(item.videoId) || dbStore.videos.get(item.videoId);
      if (video) {
        if (item.assignedTitle || item.title) video.titleAssigned = item.assignedTitle || item.title;
        if (item.assignedThumbnail || item.thumbnailUrl) video.thumbnailAssigned = item.assignedThumbnail || item.thumbnailUrl;
        if (item.scheduledPublishAt) video.scheduledPublishAt = item.scheduledPublishAt;
        video.managementScope = 'REGULAR';
        video.isAmgEligible = true;
        video.isEnrolled = true;
        video.isProtected = false;
        video.managementStatus = 'READY';
        video.privacyStatus = 'private';
        dbStore.videos.set(video.id, video);
      }
    }

    await phase3Engine.enqueueBatchJobs(batchId, channel.id, phase3Jobs);
    dbStore.saveToDisk();

    return res.status(200).json({
      success: true,
      batchId: batch.id,
      batch,
      totalEnrolled: allCandidates.length,
      kloterSize: planToExecute.length,
      message: `Kloter 1 (${planToExecute.length} video) berhasil dimasukkan ke antrean Phase 3 Worker. Pemrosesan berantai aktif untuk total ${allCandidates.length} video (Kloter per ${BATCH_CHUNK_SIZE} video).`,
    });
  } catch (err: any) {
    console.error('[API Handler Error]', err);
    if (batchId && dbStore.automationBatches.has(batchId)) {
      const b = dbStore.automationBatches.get(batchId)!;
      b.status = 'failed';
      (b as any).failureReason = err.message || 'Dispatch failure';
      b.completedAt = new Date().toISOString();
      dbStore.automationBatches.set(batchId, b);
    }
    return res.status(500).json({ error: err.message || 'Internal server error starting batch' });
  }
}
