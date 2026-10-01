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

export const initialChannels: Channel[] = [];

export const initialProfiles: ContentProfile[] = [
  {
    "id": "profile-ayam-warna",
    "blockId": "profile-ayam-warna",
    "name": "AYAM WARNA-WARNI",
    "description": "Blok rotasi khusus konten anak ayam warna-warni, animasi ceria dan video bermain.",
    "nicheCategory": "Ayam Warna Warni",
    "nicheBadge": "amber",
    "publishFrequency": "3/day",
    "publishTime": "08:00, 14:00, 20:00",
    "timezone": "Asia/Jakarta",
    "scheduleConfig": {
      "mode": "CUSTOM_DAILY_TIMES",
      "videosPerDay": 3,
      "times": ["08:00", "14:00", "20:00"],
      "timezone": "Asia/Jakarta",
      "startPolicy": "CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE"
    },
    "masterTitleIds": [],
    "masterThumbnailIds": [],
    "assignedChannelCount": 0,
    "createdAt": "2026-09-15T08:00:00.000Z",
    "updatedAt": "2026-09-20T08:00:00.000Z"
  },
  {
    "id": "profile-relaksasi",
    "blockId": "profile-relaksasi",
    "name": "SUARA ALAM & ASMR HUJAN",
    "description": "Blok rotasi judul dan thumbnail untuk konten relaksasi, suara hujan malam, dan musik alam.",
    "nicheCategory": "Music",
    "nicheBadge": "cyan",
    "publishFrequency": "1/day",
    "publishTime": "16:00",
    "timezone": "Asia/Jakarta",
    "scheduleConfig": {
      "mode": "DAILY",
      "videosPerDay": 1,
      "times": ["16:00"],
      "timezone": "Asia/Jakarta",
      "startPolicy": "CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE"
    },
    "masterTitleIds": [],
    "masterThumbnailIds": [],
    "assignedChannelCount": 0,
    "createdAt": "2026-09-15T08:00:00.000Z",
    "updatedAt": "2026-09-20T08:00:00.000Z"
  },
  {
    "id": "profile-asmr",
    "blockId": "profile-asmr",
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
      "times": ["21:00"],
      "timezone": "Asia/Jakarta",
      "startPolicy": "CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE"
    },
    "masterTitleIds": [],
    "masterThumbnailIds": [],
    "assignedChannelCount": 0,
    "createdAt": "2026-09-16T08:00:00.000Z",
    "updatedAt": "2026-09-20T08:00:00.000Z"
  },
  {
    "id": "profile-murottal",
    "blockId": "profile-murottal",
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
      "times": ["05:00", "18:00"],
      "timezone": "Asia/Jakarta",
      "startPolicy": "CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE"
    },
    "masterTitleIds": [],
    "masterThumbnailIds": [],
    "assignedChannelCount": 0,
    "createdAt": "2026-09-17T08:00:00.000Z",
    "updatedAt": "2026-09-20T08:00:00.000Z"
  }
];

export const initialMasterTitles: MasterTitle[] = [];

export const initialMasterThumbnails: MasterThumbnail[] = [];

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
  "apiQuotaUsed": 0,
  "googleClientId": "",
  "googleClientSecretConfigured": false,
  "youtubeApiKeyConfigured": false
};
