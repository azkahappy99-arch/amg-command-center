// Clean dynamic data with strict block isolation
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
} from "../types/index.ts";

export const initialChannels: Channel[] = [
  {
    id: 'chan-ayam-yahya',
    youtubeChannelId: 'UC_AYAM_YAHYA_001',
    title: 'Ayam YAHYA',
    customUrl: '@AyamYAHYA',
    thumbnailUrl: 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=150&auto=format&fit=crop&q=80',
    status: 'CONNECTED',
    monetizationStatus: 'NOT_MONETIZED',
    watchHours: 120,
    nicheCategory: 'General',
    nicheBadge: 'emerald',
    blockId: 'block-general',
    contentProfileId: 'block-general',
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
    subscriberCount: 1540,
    videoCount: 53,
    unmanagedVideoCount: 53,
    hasOAuthConfigured: true,
    isSeeded: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: new Date().toISOString(),
    connectedAt: '2026-09-01T00:00:00.000Z',
    scheduleBufferDays: 53,
    scheduleStockCount: 53,
    scheduleAlertStatus: 'SAFE',
  },
];

export const initialProfiles: ContentProfile[] = [
  {
    id: 'block-general',
    blockId: 'block-general',
    name: 'General',
    description: 'Blok rotasi konten general & AMG Reguler.',
    nicheCategory: 'General',
    nicheBadge: 'emerald',
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
    masterTitleIds: ['title-gen-1', 'title-gen-2', 'title-gen-3', 'title-gen-4'],
    masterThumbnailIds: ['thumb-gen-1', 'thumb-gen-2', 'thumb-gen-3', 'thumb-gen-4'],
    assignedChannelCount: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z',
  },
  {
    id: 'profile-ayam-warna',
    blockId: 'profile-ayam-warna',
    name: 'AYAM WARNA-WARNI',
    description: 'Blok rotasi khusus konten anak ayam warna-warni, animasi ceria dan video bermain.',
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
  },
  {
    id: 'profile-relaksasi',
    blockId: 'profile-relaksasi',
    name: 'SUARA ALAM & ASMR HUJAN',
    description: 'Blok rotasi judul dan thumbnail untuk konten relaksasi, suara hujan malam, dan musik alam.',
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
  },
  {
    id: 'profile-asmr',
    blockId: 'profile-asmr',
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
  },
  {
    id: 'profile-murottal',
    blockId: 'profile-murottal',
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
  },
];

export const initialMasterTitles: MasterTitle[] = [
  { id: 'title-gen-1', profileId: 'block-general', blockId: 'block-general', text: 'Suasana Relaksasi Pagi Penuh Kedamaian - Menenangkan Pikiran', orderIndex: 0, isActive: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
  { id: 'title-gen-2', profileId: 'block-general', blockId: 'block-general', text: 'Musik Relaksasi Alam & Ketenangan Jiwa - Terapi Hati', orderIndex: 1, isActive: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
  { id: 'title-gen-3', profileId: 'block-general', blockId: 'block-general', text: 'Alunan Lembut Suasana Hening - Istirahat & Relaksasi Maksimal', orderIndex: 2, isActive: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
  { id: 'title-gen-4', profileId: 'block-general', blockId: 'block-general', text: 'Kedamaian Alami Suara Alam - Meditasi & Tidur Nyenyak', orderIndex: 3, isActive: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
];

export const initialMasterThumbnails: MasterThumbnail[] = [
  { id: 'thumb-gen-1', profileId: 'block-general', blockId: 'block-general', name: 'Pemandangan Pantai Senja Menenangkan', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1280&q=80', orderIndex: 0, isActive: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
  { id: 'thumb-gen-2', profileId: 'block-general', blockId: 'block-general', name: 'Hutan Pinus Asri & Hijau Menyejukkan', url: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=1280&q=80', orderIndex: 1, isActive: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
  { id: 'thumb-gen-3', profileId: 'block-general', blockId: 'block-general', name: 'Pemandangan Danau Tenang di Pagi Hari', url: 'https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd?w=1280&q=80', orderIndex: 2, isActive: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
  { id: 'thumb-gen-4', profileId: 'block-general', blockId: 'block-general', name: 'Suasana Alam Rindang & Teduh', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1280&q=80', orderIndex: 3, isActive: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
];

const rawTitlesList = [
  'Video Mentah Rekaman Suasana Alam Santai',
  'Suara Menenangkan Sore Hari Tanpa Edit',
  'Dokumentasi Alam & Suasana Hutan Asri',
  'Rekaman Asli Kicau Burung dan Aliran Air',
  'Suara Hujan Rintik Alami di Halaman Rumah',
  'Suasana Senja Menentramkan Jiwa & Raga',
  'Pemandangan Hijau dan Kicauan Burung Liar',
  'Gemericik Air Sungai Jernih Pegunungan',
  'Ketenangan Alam Bebas Menjelang Malam',
  'Suasana Hening Udara Segar Pedesaan',
];

export const initialVideos: ManagedVideo[] = Array.from({ length: 53 }, (_, idx) => {
  const i = idx + 1;
  const num = String(i).padStart(3, '0');
  const vId = `yt-yahya-${num}`;
  const rawTitle = `${rawTitlesList[(i - 1) % rawTitlesList.length]} #${i}`;
  const uploadTime = new Date(Date.now() - (54 - i) * 3600 * 1000 * 4).toISOString();

  return {
    id: vId,
    youtubeVideoId: `AY_YAHYA_${num}`,
    channelId: 'chan-ayam-yahya',
    channelTitle: 'Ayam YAHYA',
    blockId: 'block-general',
    contentProfileId: 'block-general',
    titleBefore: rawTitle,
    titleAssigned: '',
    thumbnailBefore: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=640&q=80',
    thumbnailAssigned: '',
    originalUploadAt: uploadTime,
    uploadedAt: uploadTime,
    processingStatus: 'processed',
    privacyStatus: 'private',
    publishAt: undefined,
    scheduledPublishAt: undefined,
    managementStatus: 'DISCOVERED',
    managementScope: 'REGULAR',
    isAmgEligible: true,
    isManaged: false,
    isEnrolled: true,
    isProtected: false,
    retryCount: 0,
    definition: 'hd',
    isSeeded: false,
    createdAt: uploadTime,
    updatedAt: new Date().toISOString(),
  };
});

export const initialAutomationBatches: AutomationBatch[] = [];
export const initialAutomationJobs: AutomationJob[] = [];
export const initialErrorLogs: ErrorLog[] = [];
export const initialActivityLogs: ActivityLog[] = [];
export const initialNotifications: NotificationItem[] = [];
export const initialSettings: SystemSettings = {
  "defaultTimezone": "Asia/Jakarta",
  "defaultPublishTime": "16:00",
  "defaultFrequency": "1/day",
  "autoSyncIntervalMinutes": 30,
  "maxRetries": 3,
  "apiQuotaDailyLimit": 10000,
  "apiQuotaUsed": 0,
  "googleClientId": "",
  "googleClientSecretConfigured": false,
  "youtubeApiKeyConfigured": false
};
