/**
 * Database Service for AMG
 * Stores and manages all entities conforming to firebase-blueprint.json.
 * Supports Firestore schema mappings with persistent in-memory repository.
 */

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
} from '../src/types/index.js';

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
  public notifications: Map<string, NotificationItem> = new Map();
  public settings: SystemSettings = {
    defaultTimezone: 'Asia/Jakarta',
    defaultPublishTime: '16:00',
    defaultFrequency: '1/day',
    autoSyncIntervalMinutes: 30,
    maxRetries: 3,
    apiQuotaDailyLimit: 10000,
    apiQuotaUsed: 1420,
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecretConfigured: !!process.env.GOOGLE_CLIENT_SECRET,
    youtubeApiKeyConfigured: !!process.env.YOUTUBE_API_KEY,
  };

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    const profileId = 'profile-ayam-warna';

    // 1. Content Profile: AYAM WARNA (Niche: Ayam Warna Warni)
    this.profiles.set(profileId, {
      id: profileId,
      name: 'AYAM WARNA',
      description: 'Master profile for colorful chicks, relaxing ambient audio and rain series videos.',
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
      masterTitleIds: ['title-1', 'title-2', 'title-3'],
      masterThumbnailIds: ['thumb-1', 'thumb-2', 'thumb-3', 'thumb-4'],
      assignedChannelCount: 1,
      createdAt: '2026-09-15T08:00:00.000Z',
      updatedAt: '2026-09-20T08:00:00.000Z',
    });

    // 1b. Content Profile: ASMR & SOUNDSCAPES (Niche: ASMR)
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
      masterTitleIds: ['asmr-t-1', 'asmr-t-2'],
      masterThumbnailIds: ['asmr-th-1', 'asmr-th-2'],
      assignedChannelCount: 1,
      createdAt: '2026-09-16T08:00:00.000Z',
      updatedAt: '2026-09-20T08:00:00.000Z',
    });
    this.masterTitles.set('asmr-t-1', {
      id: 'asmr-t-1',
      profileId: asmrProfileId,
      text: 'Deep ASMR Rain Whispers for Insomnia Relief',
      orderIndex: 0,
      isActive: true,
      createdAt: '2026-09-16T08:00:00.000Z',
    });
    this.masterTitles.set('asmr-t-2', {
      id: 'asmr-t-2',
      profileId: asmrProfileId,
      text: '100% Tingles Binaural Tapping & Gentle Brushing',
      orderIndex: 1,
      isActive: true,
      createdAt: '2026-09-16T08:00:00.000Z',
    });
    this.masterThumbnails.set('asmr-th-1', {
      id: 'asmr-th-1',
      profileId: asmrProfileId,
      name: 'ASMR Microphone Soft Light',
      url: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800&auto=format&fit=crop&q=80',
      orderIndex: 0,
      isActive: true,
      createdAt: '2026-09-16T08:00:00.000Z',
    });
    this.masterThumbnails.set('asmr-th-2', {
      id: 'asmr-th-2',
      profileId: asmrProfileId,
      name: 'Cozy Binaural Headphones Night',
      url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
      orderIndex: 1,
      isActive: true,
      createdAt: '2026-09-16T08:00:00.000Z',
    });

    // 1c. Content Profile: MUROTTAL AL-QURAN (Niche: Murottal)
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
      masterTitleIds: ['murottal-t-1', 'murottal-t-2'],
      masterThumbnailIds: ['murottal-th-1', 'murottal-th-2'],
      assignedChannelCount: 1,
      createdAt: '2026-09-17T08:00:00.000Z',
      updatedAt: '2026-09-20T08:00:00.000Z',
    });
    this.masterTitles.set('murottal-t-1', {
      id: 'murottal-t-1',
      profileId: murottalProfileId,
      text: 'Murottal Surat Ar-Rahman Penenang Jiwa & Hati',
      orderIndex: 0,
      isActive: true,
      createdAt: '2026-09-17T08:00:00.000Z',
    });
    this.masterTitles.set('murottal-t-2', {
      id: 'murottal-t-2',
      profileId: murottalProfileId,
      text: 'Lantunan Surat Al-Mulk Pengantar Tidur Nyenyak',
      orderIndex: 1,
      isActive: true,
      createdAt: '2026-09-17T08:00:00.000Z',
    });
    this.masterThumbnails.set('murottal-th-1', {
      id: 'murottal-th-1',
      profileId: murottalProfileId,
      name: 'Quran Mosque Silhouette',
      url: 'https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?w=800&auto=format&fit=crop&q=80',
      orderIndex: 0,
      isActive: true,
      createdAt: '2026-09-17T08:00:00.000Z',
    });
    this.masterThumbnails.set('murottal-th-2', {
      id: 'murottal-th-2',
      profileId: murottalProfileId,
      name: 'Holy Quran Wooden Rehal',
      url: 'https://images.unsplash.com/photo-1609599006353-e629aaabfeae?w=800&auto=format&fit=crop&q=80',
      orderIndex: 1,
      isActive: true,
      createdAt: '2026-09-17T08:00:00.000Z',
    });

    // 2. Dynamic Master Titles
    this.masterTitles.set('title-1', {
      id: 'title-1',
      profileId,
      text: 'Tidur Nyenyak dengan Suara Hujan',
      orderIndex: 0,
      isActive: true,
      createdAt: '2026-09-15T08:00:00.000Z',
    });
    this.masterTitles.set('title-2', {
      id: 'title-2',
      profileId,
      text: 'Suara Hujan untuk Relaksasi',
      orderIndex: 1,
      isActive: true,
      createdAt: '2026-09-15T08:00:00.000Z',
    });
    this.masterTitles.set('title-3', {
      id: 'title-3',
      profileId,
      text: 'Hujan Malam untuk Teman Tidur',
      orderIndex: 2,
      isActive: true,
      createdAt: '2026-09-15T08:00:00.000Z',
    });

    // 3. Dynamic Master Thumbnails
    this.masterThumbnails.set('thumb-1', {
      id: 'thumb-1',
      profileId,
      name: 'Rain Window Aesthetic TH1',
      url: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=800&auto=format&fit=crop&q=80',
      orderIndex: 0,
      isActive: true,
      createdAt: '2026-09-15T08:00:00.000Z',
    });
    this.masterThumbnails.set('thumb-2', {
      id: 'thumb-2',
      profileId,
      name: 'Cozy Bedroom Rain TH2',
      url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
      orderIndex: 1,
      isActive: true,
      createdAt: '2026-09-15T08:00:00.000Z',
    });
    this.masterThumbnails.set('thumb-3', {
      id: 'thumb-3',
      profileId,
      name: 'Night Forest Rain TH3',
      url: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=800&auto=format&fit=crop&q=80',
      orderIndex: 2,
      isActive: true,
      createdAt: '2026-09-15T08:00:00.000Z',
    });
    this.masterThumbnails.set('thumb-4', {
      id: 'thumb-4',
      profileId,
      name: 'Soft Lantern Cabin TH4',
      url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80',
      orderIndex: 3,
      isActive: true,
      createdAt: '2026-09-15T08:00:00.000Z',
    });

    // 4. Primary Channel: Ayam Warna (Fixture / Initial Template)
    // Note: 28 September 2026 16:00 WIB = 2026-09-28T09:00:00.000Z
    const channel1Id = 'chan-ayam-warna';
    this.channels.set(channel1Id, {
      id: channel1Id,
      youtubeChannelId: 'UC_ayam_warna_official',
      title: '[DEMO FIXTURE] Ayam Warna',
      customUrl: '@ayamwarna_id',
      thumbnailUrl: 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=160&auto=format&fit=crop&q=80',
      status: 'DISCONNECTED', // Explicitly Disconnected until OAuth is authorized
      monetizationStatus: 'MONETIZED',
      watchHours: 12450,
      revenue: {
        adSenseReguler: 18500000,
        liveStream: 3200000,
        ytShopping: 2800000,
        channelMemberships: 1500000,
        totalChannelRevenue: 26000000,
      },
      contentProfileId: profileId,
      nicheCategory: 'Ayam Warna Warni',
      nicheBadge: 'amber',
      publishFrequency: '1/day',
      publishTime: '16:00',
      timezone: 'Asia/Jakarta',
      useProfileSchedule: false,
      scheduleConfig: {
        mode: 'DAILY',
        videosPerDay: 1,
        times: ['16:00'],
        timezone: 'Asia/Jakarta',
        startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
      },
      eligibilityWindowDays: 7,
      eligibleTitlePatterns: ['Salinan dari A', 'Copy of A'],
      autoEnroll: false, // Default ASK_BEFORE_ADDING
      latestManagedUploadAt: '2026-09-23T10:15:00.000Z', // Critical Cutoff: 23 Sep 10:15
      latestManagedScheduledAt: '2026-09-28T09:00:00.000Z', // 28 September 2026 16:00 WIB
      lastScheduledPublishAt: '2026-09-28T09:00:00.000Z',
      rotationTitleIndex: 0,
      rotationThumbnailIndex: 0,
      lastSyncAt: '2026-09-24T08:00:00.000Z',
      uploadPlaylistId: 'UU_ayam_warna_official',
      subscriberCount: 24500,
      videoCount: 184,
      unmanagedVideoCount: 10,
      hasOAuthConfigured: false,
      isSeeded: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-09-24T08:00:00.000Z',
    });

    // Secondary Channel: Suara Alam Indonesia (Niche: Music / Ambience)
    const channel2Id = 'chan-suara-alam';
    this.channels.set(channel2Id, {
      id: channel2Id,
      youtubeChannelId: 'UC_suara_alam_nusantara',
      title: '[DEMO FIXTURE] Suara Alam Nusantara',
      customUrl: '@suaraalam_id',
      thumbnailUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=160&auto=format&fit=crop&q=80',
      status: 'DISCONNECTED',
      monetizationStatus: 'ALMOST_MONETIZED',
      watchHours: 3250, // Progres 3.250 / 4.000 jam
      revenue: {
        adSenseReguler: 0,
        liveStream: 0,
        ytShopping: 450000,
        channelMemberships: 0,
        totalChannelRevenue: 450000,
      },
      contentProfileId: profileId,
      nicheCategory: 'Music',
      nicheBadge: 'cyan',
      publishFrequency: '1/day',
      publishTime: '16:00',
      timezone: 'Asia/Jakarta',
      useProfileSchedule: false,
      scheduleConfig: {
        mode: 'DAILY',
        videosPerDay: 1,
        times: ['16:00'],
        timezone: 'Asia/Jakarta',
        startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
      },
      eligibilityWindowDays: 7,
      eligibleTitlePatterns: ['Salinan dari A', 'Copy of A'],
      autoEnroll: false,
      latestManagedUploadAt: '2026-09-20T10:00:00.000Z',
      latestManagedScheduledAt: '2026-09-28T09:00:00.000Z',
      lastScheduledPublishAt: '2026-09-28T09:00:00.000Z',
      lastSyncAt: '',
      uploadPlaylistId: 'UU_suara_alam_nusantara',
      subscriberCount: 890, // 890 / 1.000 subscriber
      videoCount: 42,
      unmanagedVideoCount: 0,
      hasOAuthConfigured: false,
      isSeeded: true,
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-09-22T14:10:00.000Z',
    });

    // Tertiary Channel: Whisper ASMR ID (Niche: ASMR)
    const channel3Id = 'chan-whisper-asmr';
    this.channels.set(channel3Id, {
      id: channel3Id,
      youtubeChannelId: 'UC_whisper_asmr_id',
      title: 'Whisper Binaural ASMR Indonesia',
      customUrl: '@whisperasmr_id',
      thumbnailUrl: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=160&auto=format&fit=crop&q=80',
      status: 'DISCONNECTED',
      monetizationStatus: 'MONETIZED',
      watchHours: 8900,
      revenue: {
        adSenseReguler: 12200000,
        liveStream: 4500000,
        ytShopping: 1800000,
        channelMemberships: 2100000,
        totalChannelRevenue: 20600000,
      },
      contentProfileId: asmrProfileId,
      nicheCategory: 'ASMR',
      nicheBadge: 'purple',
      publishFrequency: '1/day',
      publishTime: '21:00',
      timezone: 'Asia/Jakarta',
      useProfileSchedule: true,
      scheduleConfig: {
        mode: 'DAILY',
        videosPerDay: 1,
        times: ['21:00'],
        timezone: 'Asia/Jakarta',
        startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
      },
      eligibilityWindowDays: 7,
      eligibleTitlePatterns: ['Salinan dari A', 'Copy of A', 'ASMR Raw'],
      autoEnroll: false,
      latestManagedUploadAt: '2026-09-22T10:00:00.000Z',
      latestManagedScheduledAt: '2026-09-29T14:00:00.000Z',
      lastScheduledPublishAt: '2026-09-29T14:00:00.000Z',
      lastSyncAt: '2026-09-24T06:00:00.000Z',
      uploadPlaylistId: 'UU_whisper_asmr_id',
      subscriberCount: 15200,
      videoCount: 64,
      unmanagedVideoCount: 2,
      hasOAuthConfigured: false,
      isSeeded: true,
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-09-24T06:00:00.000Z',
    });

    // Quaternary Channel: Cahaya Murottal Quran (Niche: Murottal)
    const channel4Id = 'chan-murottal-quran';
    this.channels.set(channel4Id, {
      id: channel4Id,
      youtubeChannelId: 'UC_cahaya_murottal_id',
      title: 'Cahaya Murottal Al-Quran',
      customUrl: '@cahayamurottal',
      thumbnailUrl: 'https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?w=160&auto=format&fit=crop&q=80',
      status: 'DISCONNECTED',
      monetizationStatus: 'MONETIZED',
      watchHours: 24800,
      revenue: {
        adSenseReguler: 28400000,
        liveStream: 5600000,
        ytShopping: 3100000,
        channelMemberships: 3900000,
        totalChannelRevenue: 41000000,
      },
      contentProfileId: murottalProfileId,
      nicheCategory: 'Murottal',
      nicheBadge: 'emerald',
      publishFrequency: '2/day',
      publishTime: '05:00, 18:00',
      timezone: 'Asia/Jakarta',
      useProfileSchedule: true,
      scheduleConfig: {
        mode: 'CUSTOM_DAILY_TIMES',
        videosPerDay: 2,
        times: ['05:00', '18:00'],
        timezone: 'Asia/Jakarta',
        startPolicy: 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE',
      },
      eligibilityWindowDays: 7,
      eligibleTitlePatterns: ['Salinan dari A', 'Copy of A', 'Juz'],
      autoEnroll: false,
      latestManagedUploadAt: '2026-09-21T10:00:00.000Z',
      latestManagedScheduledAt: '2026-10-14T11:00:00.000Z',
      lastScheduledPublishAt: '2026-10-14T11:00:00.000Z',
      lastSyncAt: '2026-09-24T07:00:00.000Z',
      uploadPlaylistId: 'UU_cahaya_murottal_id',
      subscriberCount: 38400,
      videoCount: 112,
      unmanagedVideoCount: 4,
      hasOAuthConfigured: false,
      isSeeded: true,
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-09-24T07:00:00.000Z',
    });

    // =========================================================================
    // 5. PHASE 2 ACCEPTANCE TEST DATASET (Requirement 32 & 33)
    // - 10 Old Private Videos (> 7 days, uploaded 10 Sep) -> PROTECTED_OLD
    // - 5 Personal Private Videos (uploaded before cutoff or personal title) -> PROTECTED_BY_CUTOFF / UNCLASSIFIED
    // - 10 New Candidate Videos (uploaded 24 Sep, title "Copy of A") -> NEW_PRIVATE_CANDIDATE
    // - 3 Videos with Wrong Title (uploaded 24 Sep) -> UNCLASSIFIED
    // - 2 Already Managed Videos (uploaded 18-19 Sep, scheduled 27-28 Sep) -> ALREADY_MANAGED
    // =========================================================================

    // A. 10 OLD PRIVATE VIDEOS (Uploaded 10 September, outside 7-day window -> PROTECTED_OLD)
    for (let i = 1; i <= 10; i++) {
      const vidId = `vid-old-${String(i).padStart(3, '0')}`;
      this.videos.set(vidId, {
        id: vidId,
        youtubeVideoId: `yt_old_${1000 + i}`,
        channelId: channel1Id,
        channelTitle: '[DEMO FIXTURE] Ayam Warna',
        titleBefore: 'Copy of A',
        titleAssigned: '',
        thumbnailBefore: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=400',
        thumbnailAssigned: '',
        originalUploadAt: `2026-09-10T10:${String(i).padStart(2, '0')}:00.000Z`,
        processingStatus: 'processed',
        privacyStatus: 'private',
        managementStatus: 'PROTECTED_OLD',
        amgStatus: 'PROTECTED_OLD',
        safetyCategory: 'PROTECTED_OLD',
        managementScope: 'EXCLUDED',
        isAmgEligible: false,
        isProtected: true,
        protectionReason: 'Uploaded 14 days ago (outside 7-day eligibility window). Historical video.',
        isManaged: false,
        isSeeded: true,
        retryCount: 0,
        definition: 'hd',
        duration: 'PT3H15M00S',
        createdAt: '2026-09-10T10:00:00.000Z',
        updatedAt: '2026-09-24T08:00:00.000Z',
      });
    }

    // B. 5 PERSONAL PRIVATE VIDEOS
    // CRITICAL TEST PAIR (Requirement 33):
    // Video 1: Uploaded 23 Sep 09:00 (BEFORE cutoff 23 Sep 10:15) with title "Copy of A" -> MUST BE PROTECTED_BY_CUTOFF!
    this.videos.set('vid-personal-cutoff-01', {
      id: 'vid-personal-cutoff-01',
      youtubeVideoId: 'yt_personal_cutoff_01',
      channelId: channel1Id,
      channelTitle: '[DEMO FIXTURE] Ayam Warna',
      titleBefore: 'Copy of A',
      titleAssigned: '',
      thumbnailBefore: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=400',
      thumbnailAssigned: '',
      originalUploadAt: '2026-09-23T09:00:00.000Z', // 23 Sep 09:00 < 23 Sep 10:15
      processingStatus: 'processed',
      privacyStatus: 'private',
      managementStatus: 'PROTECTED_BY_CUTOFF',
      amgStatus: 'PROTECTED_BY_CUTOFF',
      safetyCategory: 'PROTECTED_BY_CUTOFF',
      managementScope: 'EXCLUDED',
      isAmgEligible: false,
      isProtected: true,
      protectionReason: 'Uploaded before/at managed cutoff (23 Sep 2026 10:15). Protected historical/personal video.',
      isManaged: false,
      isSeeded: true,
      retryCount: 0,
      definition: 'hd',
      duration: 'PT1H20M00S',
      createdAt: '2026-09-23T09:00:00.000Z',
      updatedAt: '2026-09-24T08:00:00.000Z',
    });

    // Video 2: Uploaded 22 Sep 20:00 (BEFORE cutoff) with title "Copy of A" -> PROTECTED_BY_CUTOFF
    this.videos.set('vid-personal-cutoff-02', {
      id: 'vid-personal-cutoff-02',
      youtubeVideoId: 'yt_personal_cutoff_02',
      channelId: channel1Id,
      channelTitle: '[DEMO FIXTURE] Ayam Warna',
      titleBefore: 'Copy of A',
      titleAssigned: '',
      thumbnailBefore: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=400',
      thumbnailAssigned: '',
      originalUploadAt: '2026-09-22T20:00:00.000Z',
      processingStatus: 'processed',
      privacyStatus: 'private',
      managementStatus: 'PROTECTED_BY_CUTOFF',
      amgStatus: 'PROTECTED_BY_CUTOFF',
      safetyCategory: 'PROTECTED_BY_CUTOFF',
      managementScope: 'EXCLUDED',
      isAmgEligible: false,
      isProtected: true,
      protectionReason: 'Uploaded before/at managed cutoff (23 Sep 2026 10:15). Protected historical/personal video.',
      isManaged: false,
      isSeeded: true,
      retryCount: 0,
      definition: 'hd',
      duration: 'PT2H40M00S',
      createdAt: '2026-09-22T20:00:00.000Z',
      updatedAt: '2026-09-24T08:00:00.000Z',
    });

    // Video 3: Personal Archive (Vacation) -> EXCLUDED / UNCLASSIFIED
    this.videos.set('vid-personal-001', {
      id: 'vid-personal-001',
      youtubeVideoId: 'yt_personal_bali_trip',
      channelId: channel1Id,
      channelTitle: '[DEMO FIXTURE] Ayam Warna',
      titleBefore: 'Personal Bali Vacation Raw Footage.mp4',
      titleAssigned: '',
      thumbnailBefore: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=400',
      thumbnailAssigned: '',
      originalUploadAt: '2026-09-21T08:00:00.000Z',
      processingStatus: 'processed',
      privacyStatus: 'private',
      managementStatus: 'EXCLUDED',
      amgStatus: 'EXCLUDED',
      safetyCategory: 'EXCLUDED',
      managementScope: 'EXCLUDED',
      isAmgEligible: false,
      isProtected: true,
      exclusionReason: 'Personal family archive - strictly excluded from AMG automation',
      isManaged: false,
      isSeeded: true,
      retryCount: 0,
      definition: 'hd',
      duration: 'PT45M12S',
      createdAt: '2026-09-21T08:00:00.000Z',
      updatedAt: '2026-09-24T08:00:00.000Z',
    });

    // Video 4: Acoustic Guitar Practice Draft -> EXCLUDED
    this.videos.set('vid-personal-002', {
      id: 'vid-personal-002',
      youtubeVideoId: 'yt_personal_guitar_backup',
      channelId: channel1Id,
      channelTitle: '[DEMO FIXTURE] Ayam Warna',
      titleBefore: 'My Acoustic Guitar Practice Draft.mp4',
      titleAssigned: '',
      thumbnailBefore: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400',
      thumbnailAssigned: '',
      originalUploadAt: '2026-09-22T14:00:00.000Z',
      processingStatus: 'processed',
      privacyStatus: 'private',
      managementStatus: 'EXCLUDED',
      amgStatus: 'EXCLUDED',
      safetyCategory: 'EXCLUDED',
      managementScope: 'EXCLUDED',
      isAmgEligible: false,
      isProtected: true,
      exclusionReason: 'Personal practice draft - excluded from automation',
      isManaged: false,
      isSeeded: true,
      retryCount: 0,
      definition: 'hd',
      duration: 'PT15M30S',
      createdAt: '2026-09-22T14:00:00.000Z',
      updatedAt: '2026-09-24T08:00:00.000Z',
    });

    // Video 5: Family Birthday Recording -> UNCLASSIFIED
    this.videos.set('vid-personal-003', {
      id: 'vid-personal-003',
      youtubeVideoId: 'yt_personal_birthday',
      channelId: channel1Id,
      channelTitle: '[DEMO FIXTURE] Ayam Warna',
      titleBefore: 'Family Birthday Party Video.mp4',
      titleAssigned: '',
      thumbnailBefore: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=400',
      thumbnailAssigned: '',
      originalUploadAt: '2026-09-23T06:00:00.000Z',
      processingStatus: 'processed',
      privacyStatus: 'private',
      managementStatus: 'UNCLASSIFIED',
      amgStatus: 'UNCLASSIFIED',
      safetyCategory: 'UNCLASSIFIED',
      managementScope: 'UNCLASSIFIED',
      isAmgEligible: false,
      isProtected: true,
      protectionReason: 'Title does not match eligible patterns [Salinan dari A, Copy of A].',
      isManaged: false,
      isSeeded: true,
      retryCount: 0,
      definition: 'hd',
      duration: 'PT25M00S',
      createdAt: '2026-09-23T06:00:00.000Z',
      updatedAt: '2026-09-24T08:00:00.000Z',
    });

    // C. 10 NEW CANDIDATE VIDEOS (Uploaded 24 Sep 2026, title "Copy of A", privacy "private" -> NEW_PRIVATE_CANDIDATE)
    for (let i = 1; i <= 10; i++) {
      const vidId = `vid-cand-${String(i).padStart(3, '0')}`;
      this.videos.set(vidId, {
        id: vidId,
        youtubeVideoId: `yt_cand_${2000 + i}`,
        channelId: channel1Id,
        channelTitle: '[DEMO FIXTURE] Ayam Warna',
        titleBefore: i % 2 === 0 ? 'Salinan dari A' : 'Copy of A',
        titleAssigned: '',
        thumbnailBefore: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400',
        thumbnailAssigned: '',
        originalUploadAt: `2026-09-24T09:${String(i * 2).padStart(2, '0')}:00.000Z`,
        processingStatus: 'processed',
        privacyStatus: 'private',
        managementStatus: 'NEW_PRIVATE_CANDIDATE',
        amgStatus: 'NEW_PRIVATE_CANDIDATE',
        safetyCategory: 'NEW_PRIVATE_CANDIDATE',
        managementScope: 'UNCLASSIFIED',
        isAmgEligible: false, // Pending explicit enrollment (Default ASK_BEFORE_ADDING)
        isEnrolled: false,
        isProtected: false,
        matchedTitlePattern: i % 2 === 0 ? 'Salinan dari A' : 'Copy of A',
        isManaged: false,
        isSeeded: true,
        contentProfileId: profileId,
        retryCount: 0,
        definition: 'hd',
        duration: 'PT3H30M00S',
        createdAt: `2026-09-24T09:${String(i * 2).padStart(2, '0')}:00.000Z`,
        updatedAt: '2026-09-24T09:30:00.000Z',
      });
    }

    // D. 3 VIDEOS WITH WRONG TITLE (Uploaded 24 Sep, private, but title doesn't match -> UNCLASSIFIED)
    const wrongTitles = [
      'My Unrelated Stream Recording.mp4',
      'Experiment Audio Draft.mp4',
      'Random Test Capture.mp4',
    ];
    for (let i = 1; i <= 3; i++) {
      const vidId = `vid-wrong-${String(i).padStart(3, '0')}`;
      this.videos.set(vidId, {
        id: vidId,
        youtubeVideoId: `yt_wrong_${3000 + i}`,
        channelId: channel1Id,
        channelTitle: '[DEMO FIXTURE] Ayam Warna',
        titleBefore: wrongTitles[i - 1],
        titleAssigned: '',
        thumbnailBefore: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=400',
        thumbnailAssigned: '',
        originalUploadAt: `2026-09-24T11:0${i}:00.000Z`,
        processingStatus: 'processed',
        privacyStatus: 'private',
        managementStatus: 'UNCLASSIFIED',
        amgStatus: 'UNCLASSIFIED',
        safetyCategory: 'UNCLASSIFIED',
        managementScope: 'UNCLASSIFIED',
        isAmgEligible: false,
        isProtected: true,
        protectionReason: 'Title pattern does not match [Salinan dari A, Copy of A].',
        isManaged: false,
        isSeeded: true,
        retryCount: 0,
        definition: 'hd',
        duration: 'PT1H10M00S',
        createdAt: `2026-09-24T11:0${i}:00.000Z`,
        updatedAt: '2026-09-24T11:00:00.000Z',
      });
    }

    // E. 2 ALREADY MANAGED VIDEOS (Historical batch -> ALREADY_MANAGED)
    this.videos.set('vid-managed-001', {
      id: 'vid-managed-001',
      youtubeVideoId: 'yt_hist_0927',
      channelId: channel1Id,
      channelTitle: '[DEMO FIXTURE] Ayam Warna',
      titleBefore: 'Copy of A',
      titleAssigned: 'Tidur Nyenyak dengan Suara Hujan',
      thumbnailBefore: '',
      thumbnailAssigned: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=800',
      originalUploadAt: '2026-09-18T10:00:00.000Z',
      processingStatus: 'processed',
      privacyStatus: 'private',
      scheduledPublishAt: '2026-09-27T09:00:00.000Z', // 27 Sept 2026 16:00 WIB
      managementStatus: 'COMPLETED',
      amgStatus: 'COMPLETED',
      safetyCategory: 'ALREADY_MANAGED',
      managementScope: 'REGULAR',
      isAmgEligible: true,
      isEnrolled: true,
      isManaged: true, // ALREADY MANAGED
      isSeeded: true,
      contentProfileId: profileId,
      automationBatchId: 'AMG-BATCH-0001',
      retryCount: 0,
      definition: 'hd',
      duration: 'PT4H00M00S',
      createdAt: '2026-09-18T10:00:00.000Z',
      updatedAt: '2026-09-27T09:00:00.000Z',
    });

    this.videos.set('vid-managed-002', {
      id: 'vid-managed-002',
      youtubeVideoId: 'yt_hist_0928',
      channelId: channel1Id,
      channelTitle: '[DEMO FIXTURE] Ayam Warna',
      titleBefore: 'Copy of A',
      titleAssigned: 'Suara Hujan untuk Relaksasi',
      thumbnailBefore: '',
      thumbnailAssigned: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800',
      originalUploadAt: '2026-09-19T10:00:00.000Z',
      processingStatus: 'processed',
      privacyStatus: 'private',
      scheduledPublishAt: '2026-09-28T09:00:00.000Z', // 28 Sept 2026 16:00 WIB (LATEST MANAGED SCHEDULE)
      managementStatus: 'COMPLETED',
      amgStatus: 'COMPLETED',
      safetyCategory: 'ALREADY_MANAGED',
      managementScope: 'REGULAR',
      isAmgEligible: true,
      isEnrolled: true,
      isManaged: true, // ALREADY MANAGED
      isSeeded: true,
      contentProfileId: profileId,
      automationBatchId: 'AMG-BATCH-0001',
      retryCount: 0,
      definition: 'hd',
      duration: 'PT3H45M12S',
      createdAt: '2026-09-19T10:00:00.000Z',
      updatedAt: '2026-09-28T09:00:00.000Z',
    });

    // 7. Seed Automation Batch #0001
    this.automationBatches.set('AMG-BATCH-0001', {
      id: 'AMG-BATCH-0001',
      batchNumber: 'AMG-BATCH-0001',
      channelId: channel1Id,
      channelTitle: 'Ayam Warna',
      profileId,
      profileName: 'AYAM WARNA',
      isDryRun: false,
      status: 'completed',
      startedAt: '2026-09-19T11:00:00.000Z',
      completedAt: '2026-09-19T11:04:12.000Z',
      detectedCount: 2,
      processedCount: 2,
      scheduledCount: 2,
      completedCount: 2,
      failedCount: 0,
      isSeeded: true,
    });

    // 8. Seed Activity Logs
    this.logActivity({
      user: 'Administrator',
      channelId: channel1Id,
      channelTitle: 'Ayam Warna',
      operation: 'Channel Synchronized',
      previousValue: '0 videos detected',
      newValue: '15 unmanaged videos detected (HD Ready)',
      result: 'SUCCESS',
    });

    this.logActivity({
      user: 'Scheduler Engine',
      channelId: channel1Id,
      channelTitle: 'Ayam Warna',
      operation: 'Schedule Cursor Reconciled',
      previousValue: 'None',
      newValue: 'Latest scheduled: 30 September 2026 16:00 WIB',
      result: 'SUCCESS',
    });

    // 9. Notifications
    this.notifications.set('notif-1', {
      id: 'notif-1',
      type: 'info',
      title: '15 Unmanaged Videos Detected',
      message: 'Channel "Ayam Warna" has 15 HD-ready private videos awaiting Master Title, Thumbnail, and Scheduling automation.',
      channelId: channel1Id,
      read: false,
      createdAt: '2026-09-23T08:35:00.000Z',
    });

    this.notifications.set('notif-2', {
      id: 'notif-2',
      type: 'warning',
      title: 'Google OAuth Setup Reminder',
      message: 'To execute real YouTube Data API mutations, provide Google OAuth Client ID & Secret in Settings.',
      read: false,
      createdAt: '2026-09-23T08:30:00.000Z',
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
      if (c.isSeeded) {
        this.channels.delete(id);
        removedChannels++;
      }
    }
    for (const [id, v] of this.videos.entries()) {
      if (v.isSeeded) {
        this.videos.delete(id);
        removedVideos++;
      }
    }
    for (const [id, b] of this.automationBatches.entries()) {
      if (b.isSeeded) {
        this.automationBatches.delete(id);
        removedBatches++;
      }
    }

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
