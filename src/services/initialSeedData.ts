// Clean dynamic data without demo fixtures
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

export const initialChannels: Channel[] = [];
export const initialProfiles: ContentProfile[] = [
  {
    "id": "profile-relaksasi",
    "name": "SUARA ALAM & RELAKSASI",
    "description": "Profil rotasi judul dan thumbnail untuk konten relaksasi, suara hujan, dan musik alam.",
    "nicheCategory": "Music",
    "nicheBadge": "cyan",
    "publishFrequency": "1/day",
    "publishTime": "16:00",
    "timezone": "Asia/Jakarta",
    "scheduleConfig": {
      "mode": "DAILY",
      "videosPerDay": 1,
      "times": [
        "16:00"
      ],
      "timezone": "Asia/Jakarta",
      "startPolicy": "CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE"
    },
    "masterTitleIds": [
      "title-1",
      "title-2",
      "title-3"
    ],
    "masterThumbnailIds": [
      "thumb-1",
      "thumb-2",
      "thumb-3",
      "thumb-4"
    ],
    "assignedChannelCount": 0,
    "createdAt": "2026-09-15T08:00:00.000Z",
    "updatedAt": "2026-09-20T08:00:00.000Z"
  },
  {
    "id": "profile-asmr",
    "name": "DEEP ASMR SOUNDS",
    "description": "Gentle whispering, rain tapping, and deep binaural triggers.",
    "nicheCategory": "ASMR",
    "nicheBadge": "purple",
    "publishFrequency": "1/day",
    "publishTime": "21:00",
    "timezone": "Asia/Jakarta",
    "scheduleConfig": {
      "mode": "DAILY",
      "videosPerDay": 1,
      "times": [
        "21:00"
      ],
      "timezone": "Asia/Jakarta",
      "startPolicy": "CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE"
    },
    "masterTitleIds": [
      "asmr-t-1",
      "asmr-t-2"
    ],
    "masterThumbnailIds": [
      "asmr-th-1",
      "asmr-th-2"
    ],
    "assignedChannelCount": 1,
    "createdAt": "2026-09-16T08:00:00.000Z",
    "updatedAt": "2026-09-20T08:00:00.000Z"
  },
  {
    "id": "profile-murottal",
    "name": "MUROTTAL MERDU 30 JUZ",
    "description": "Lantunan ayat suci Al-Quran merdu dan terjemahan bahasa Indonesia.",
    "nicheCategory": "Murottal",
    "nicheBadge": "emerald",
    "publishFrequency": "2/day",
    "publishTime": "05:00, 18:00",
    "timezone": "Asia/Jakarta",
    "scheduleConfig": {
      "mode": "CUSTOM_DAILY_TIMES",
      "videosPerDay": 2,
      "times": [
        "05:00",
        "18:00"
      ],
      "timezone": "Asia/Jakarta",
      "startPolicy": "CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE"
    },
    "masterTitleIds": [
      "murottal-t-1",
      "murottal-t-2"
    ],
    "masterThumbnailIds": [
      "murottal-th-1",
      "murottal-th-2"
    ],
    "assignedChannelCount": 1,
    "createdAt": "2026-09-17T08:00:00.000Z",
    "updatedAt": "2026-09-20T08:00:00.000Z"
  }
];
export const initialMasterTitles: MasterTitle[] = [
  {
    "id": "asmr-t-1",
    "profileId": "profile-asmr",
    "text": "Deep ASMR Rain Whispers for Insomnia Relief",
    "orderIndex": 0,
    "isActive": true,
    "createdAt": "2026-09-16T08:00:00.000Z"
  },
  {
    "id": "asmr-t-2",
    "profileId": "profile-asmr",
    "text": "100% Tingles Binaural Tapping & Gentle Brushing",
    "orderIndex": 1,
    "isActive": true,
    "createdAt": "2026-09-16T08:00:00.000Z"
  },
  {
    "id": "murottal-t-1",
    "profileId": "profile-murottal",
    "text": "Murottal Surat Ar-Rahman Penenang Jiwa & Hati",
    "orderIndex": 0,
    "isActive": true,
    "createdAt": "2026-09-17T08:00:00.000Z"
  },
  {
    "id": "murottal-t-2",
    "profileId": "profile-murottal",
    "text": "Lantunan Surat Al-Mulk Pengantar Tidur Nyenyak",
    "orderIndex": 1,
    "isActive": true,
    "createdAt": "2026-09-17T08:00:00.000Z"
  },
  {
    "id": "title-1",
    "profileId": "profile-relaksasi",
    "text": "Tidur Nyenyak dengan Suara Hujan",
    "orderIndex": 0,
    "isActive": true,
    "createdAt": "2026-09-15T08:00:00.000Z"
  },
  {
    "id": "title-2",
    "profileId": "profile-relaksasi",
    "text": "Suara Hujan untuk Relaksasi",
    "orderIndex": 1,
    "isActive": true,
    "createdAt": "2026-09-15T08:00:00.000Z"
  },
  {
    "id": "title-3",
    "profileId": "profile-relaksasi",
    "text": "Hujan Malam untuk Teman Tidur",
    "orderIndex": 2,
    "isActive": true,
    "createdAt": "2026-09-15T08:00:00.000Z"
  }
];
export const initialMasterThumbnails: MasterThumbnail[] = [
  {
    "id": "asmr-th-1",
    "profileId": "profile-asmr",
    "name": "ASMR Microphone Soft Light",
    "url": "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800&auto=format&fit=crop&q=80",
    "orderIndex": 0,
    "isActive": true,
    "createdAt": "2026-09-16T08:00:00.000Z"
  },
  {
    "id": "asmr-th-2",
    "profileId": "profile-asmr",
    "name": "Cozy Binaural Headphones Night",
    "url": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80",
    "orderIndex": 1,
    "isActive": true,
    "createdAt": "2026-09-16T08:00:00.000Z"
  },
  {
    "id": "murottal-th-1",
    "profileId": "profile-murottal",
    "name": "Quran Mosque Silhouette",
    "url": "https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?w=800&auto=format&fit=crop&q=80",
    "orderIndex": 0,
    "isActive": true,
    "createdAt": "2026-09-17T08:00:00.000Z"
  },
  {
    "id": "murottal-th-2",
    "profileId": "profile-murottal",
    "name": "Holy Quran Wooden Rehal",
    "url": "https://images.unsplash.com/photo-1609599006353-e629aaabfeae?w=800&auto=format&fit=crop&q=80",
    "orderIndex": 1,
    "isActive": true,
    "createdAt": "2026-09-17T08:00:00.000Z"
  },
  {
    "id": "thumb-1",
    "profileId": "profile-relaksasi",
    "name": "Rain Window Aesthetic TH1",
    "url": "https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=800&auto=format&fit=crop&q=80",
    "orderIndex": 0,
    "isActive": true,
    "createdAt": "2026-09-15T08:00:00.000Z"
  },
  {
    "id": "thumb-2",
    "profileId": "profile-relaksasi",
    "name": "Cozy Bedroom Rain TH2",
    "url": "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80",
    "orderIndex": 1,
    "isActive": true,
    "createdAt": "2026-09-15T08:00:00.000Z"
  },
  {
    "id": "thumb-3",
    "profileId": "profile-relaksasi",
    "name": "Night Forest Rain TH3",
    "url": "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=800&auto=format&fit=crop&q=80",
    "orderIndex": 2,
    "isActive": true,
    "createdAt": "2026-09-15T08:00:00.000Z"
  },
  {
    "id": "thumb-4",
    "profileId": "profile-relaksasi",
    "name": "Soft Lantern Cabin TH4",
    "url": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80",
    "orderIndex": 3,
    "isActive": true,
    "createdAt": "2026-09-15T08:00:00.000Z"
  }
];
export const initialVideos: ManagedVideo[] = [];
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
  "apiQuotaUsed": 1420,
  "googleClientId": "",
  "googleClientSecretConfigured": false,
  "youtubeApiKeyConfigured": false
};
