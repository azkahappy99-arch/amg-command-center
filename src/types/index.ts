export type ChannelStatus =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'AUTHORIZATION REQUIRED'
  | 'TOKEN EXPIRED'
  | 'ERROR'
  | 'Connected'
  | 'Disconnected'
  | 'Ready'
  | 'Processing'
  | 'Needs Attention'
  | 'Completed';

export type VideoManagementStatus =
  | 'DISCOVERED'
  | 'NEW_PRIVATE_CANDIDATE'
  | 'AMG_ELIGIBLE'
  | 'ENROLLED'
  | 'VALIDATING'
  | 'PROCESSING'
  | 'READY'
  | 'TITLE_APPLIED'
  | 'THUMBNAIL_APPLIED'
  | 'SCHEDULE_PENDING'
  | 'SCHEDULED'
  | 'VERIFIED'
  | 'COMPLETED'
  | 'ERROR'
  | 'RETRY_PENDING'
  | 'PROTECTED_OLD'
  | 'PROTECTED_BY_CUTOFF'
  | 'UNCLASSIFIED'
  | 'ALREADY_MANAGED'
  | 'EXCLUDED';

export type VideoProcessingStatus = 'processing' | 'processed' | 'failed';
export type VideoPrivacyStatus = 'private' | 'unlisted' | 'public';

export type ManagementScope = 'REGULAR' | 'EXCLUDED' | 'UNCLASSIFIED';

export type SafetyCategory =
  | 'ELIGIBLE'
  | 'NEW_PRIVATE_CANDIDATE'
  | 'PROTECTED_OLD'
  | 'PROTECTED_BY_CUTOFF'
  | 'UNCLASSIFIED'
  | 'ALREADY_MANAGED'
  | 'EXCLUDED';

export type ScheduleMode = 'DAILY' | 'CUSTOM_DAILY_TIMES' | 'CUSTOM_INTERVAL' | 'ADVANCED_CUSTOM';

export type StartPolicy = 'CONTINUE_FROM_LATEST_YOUTUBE_SCHEDULE' | 'START_FROM_SPECIFIC_DATE';

export interface ScheduleConfig {
  mode: ScheduleMode;
  videosPerDay: number;
  times: string[]; // e.g. ['08:00', '14:00', '20:00'] (24h format HH:mm)
  timezone: string; // e.g. 'Asia/Jakarta'
  startPolicy?: StartPolicy;
  intervalHours?: number; // Used when mode is CUSTOM_INTERVAL (e.g. 4)
  intervalStartTime?: string; // Used when mode is CUSTOM_INTERVAL (e.g. '08:00')
  advancedConfig?: {
    activeDaysOfWeek?: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    blackoutDates?: string[]; // YYYY-MM-DD
    customTimesByDay?: Record<number, string[]>;
  };
}

export interface ScheduleValidationResult {
  isValid: boolean;
  errors: string[];
}

export type NicheCategoryPreset = 'Ayam Warna Warni' | 'ASMR' | 'Music' | 'Murottal' | string;

export interface NicheBadgeInfo {
  label: string;
  color: string; // Tailwind color class or hex
  bg: string;
  border: string;
}

export type MonetizationStatus = 'NOT_MONETIZED' | 'ALMOST_MONETIZED' | 'MONETIZED';
export type ScheduleAlertStatus = 'SAFE' | 'LOW_STOCK' | 'CRITICAL';

export interface ChannelRevenue {
  adSenseReguler: number; // Iklan Video Reguler / Shorts
  liveStream: number; // Super Chat & Super Stickers
  ytShopping: number; // Afiliasi / YouTube Shopping
  channelMemberships: number; // Langganan Channel / Gift
  totalChannelRevenue: number; // Total keseluruhan per channel
}

export interface Channel {
  id: string;
  youtubeChannelId: string;
  title: string;
  customUrl?: string;
  thumbnailUrl?: string;
  status: ChannelStatus;
  monetizationStatus?: MonetizationStatus;
  watchHours?: number; // Jam Tayang untuk ALMOST_MONETIZED (target 4.000 jam)
  revenue?: ChannelRevenue;
  // Schedule Buffer Monitor & Low Stock Alert
  scheduleBufferDays?: number; // estimasi sisa hari sebelum jadwal habis
  scheduleStockCount?: number; // jumlah total video berstatus terjadwal di masa depan
  scheduleAlertStatus?: ScheduleAlertStatus; // 'SAFE' | 'LOW_STOCK' | 'CRITICAL'
  bufferExhaustionDate?: string; // tanggal ISO saat slot jadwal terakhir tayang
  contentProfileId?: string;
  nicheCategory?: NicheCategoryPreset;
  nicheBadge?: string; // e.g. 'amber', 'rose', 'cyan', 'emerald', 'purple'
  publishFrequency: string; // e.g. '1/day', '2/day', '3/day', '5/day' (display)
  publishTime: string; // e.g. '16:00' or '08:00, 14:00, 20:00' (display)
  timezone: string; // e.g. 'Asia/Jakarta'
  scheduleConfig?: ScheduleConfig;
  useProfileSchedule?: boolean; // If true, inherits from assigned ContentProfile scheduleConfig
  eligibilityWindowDays?: number; // Phase 2: default 7 days
  eligibleTitlePatterns?: string[]; // Phase 2: e.g. ['Salinan dari A', 'Copy of A']
  autoEnroll?: boolean; // Phase 2: default false (ASK_BEFORE_ADDING)
  latestManagedUploadAt?: string; // Phase 2: Detection cutoff cursor
  latestManagedScheduledAt?: string; // Phase 2: Scheduling cursor
  lastSuccessfulSyncAt?: string;
  rotationTitleIndex?: number;
  rotationThumbnailIndex?: number;
  lastSyncAt?: string;
  lastScheduledPublishAt?: string;
  uploadPlaylistId?: string;
  subscriberCount?: number;
  videoCount?: number;
  unmanagedVideoCount?: number;
  hasOAuthConfigured?: boolean;
  isSeeded?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContentProfile {
  id: string;
  name: string;
  description: string;
  nicheCategory?: NicheCategoryPreset;
  nicheBadge?: string;
  publishFrequency: string;
  publishTime: string;
  timezone: string;
  scheduleConfig?: ScheduleConfig;
  masterTitleIds: string[];
  masterThumbnailIds: string[];
  eligibilityWindowDays?: number; // Phase 2
  eligibleTitlePatterns?: string[]; // Phase 2
  autoEnroll?: boolean; // Phase 2
  assignedChannelCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MasterTitle {
  id: string;
  profileId: string;
  text: string;
  orderIndex: number;
  isActive: boolean;
  createdAt: string;
}

export interface MasterThumbnail {
  id: string;
  profileId: string;
  name: string;
  url: string;
  orderIndex: number;
  isActive: boolean;
  createdAt: string;
}

export interface ManagedVideo {
  id: string;
  youtubeVideoId: string;
  channelId: string;
  channelTitle?: string;
  titleBefore: string;
  titleAssigned: string;
  thumbnailBefore: string;
  thumbnailAssigned: string;
  originalUploadAt: string;
  uploadedAt?: string; // Phase 2 synonym
  processingStatus: VideoProcessingStatus;
  privacyStatus: VideoPrivacyStatus;
  scheduledPublishAt?: string;
  scheduledAt?: string; // Phase 2 synonym
  verifiedAt?: string; // Phase 2
  managementStatus: VideoManagementStatus;
  amgStatus?: VideoManagementStatus; // Phase 2
  managementScope: ManagementScope; // 'REGULAR' | 'EXCLUDED' | 'UNCLASSIFIED'
  safetyCategory?: SafetyCategory; // Phase 2
  isAmgEligible: boolean; // true ONLY if managementScope === 'REGULAR' and passes all eligibility checks
  isAmgManaged?: boolean; // Phase 2
  isEnrolled?: boolean; // Phase 2
  isProtected?: boolean; // Phase 2: true for PROTECTED_OLD, PROTECTED_BY_CUTOFF, UNCLASSIFIED
  protectionReason?: string; // Phase 2 explanation
  matchedTitlePattern?: string; // Phase 2
  eligibilityWindowDays?: number; // Phase 2
  latestManagedUploadAtAtDiscovery?: string; // Phase 2 snapshot of cutoff
  rotationTitleIndex?: number; // Phase 2
  rotationThumbnailIndex?: number; // Phase 2
  scopeAssignedAt?: string;
  scopeAssignedBy?: string; // 'USER' | 'SYSTEM' | 'SEEDED'
  exclusionReason?: string;
  isManaged: boolean;
  contentProfileId?: string;
  automationBatchId?: string;
  batchId?: string; // Phase 2 synonym
  retryCount: number;
  lastError?: string;
  duration?: string;
  definition?: 'hd' | 'sd';
  isSeeded?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationBatch {
  id: string;
  batchNumber: string;
  channelId: string;
  channelTitle?: string;
  profileId: string;
  profileName?: string;
  isDryRun: boolean;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  detectedCount: number;
  processedCount: number;
  scheduledCount: number;
  completedCount: number;
  failedCount: number;
  isSeeded?: boolean;
}

export interface AutomationJob {
  id: string;
  batchId: string;
  videoId: string;
  videoTitle?: string;
  channelId: string;
  channelTitle?: string;
  jobType: 'detect' | 'validate' | 'apply_title' | 'apply_thumbnail' | 'schedule' | 'verify';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retry_pending';
  startedAt?: string;
  completedAt?: string;
  retryCount: number;
  error?: string;
}

export interface ErrorLog {
  id: string;
  timestamp: string;
  channelId?: string;
  channelTitle?: string;
  videoId?: string;
  videoTitle?: string;
  operation: string;
  errorType: string;
  errorMessage: string;
  retryCount: number;
  status: 'open' | 'retried' | 'resolved' | 'ignored';
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  user: string;
  channelId?: string;
  channelTitle?: string;
  videoId?: string;
  operation: string;
  previousValue?: string;
  newValue?: string;
  result: 'SUCCESS' | 'WARNING' | 'FAILED';
  error?: string;
}

export interface NotificationItem {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'ALERT' | 'WARNING';
  title: string;
  message: string;
  channelId?: string;
  read: boolean;
  createdAt: string;
}

export interface SystemSettings {
  defaultTimezone: string;
  defaultPublishTime: string;
  defaultFrequency: string;
  autoSyncIntervalMinutes: number;
  maxRetries: number;
  apiQuotaDailyLimit: number;
  apiQuotaUsed: number;
  googleClientId?: string;
  googleClientSecretConfigured?: boolean;
  youtubeApiKeyConfigured?: boolean;
}

export interface ScheduleCalculationItem {
  index: number;
  publishDate: string; // YYYY-MM-DD
  publishTime: string; // HH:mm
  formattedFull: string;
  isoString: string;
}

export interface AutomationScopeSummary {
  includedCount: number;
  excludedCount: number;
  needsScopeAssignmentCount: number;
  totalDetected: number;
  // Phase 2 granular safety breakdown
  eligibleCount?: number;
  newCandidatesCount?: number;
  protectedOldCount?: number;
  protectedByCutoffCount?: number;
  unclassifiedCount?: number;
  alreadyManagedCount?: number;
}

export interface AutomationPreviewItem {
  sequence: number;
  videoId: string;
  originalTitle: string;
  assignedTitle: string;
  originalThumbnail: string;
  assignedThumbnail: string;
  publishDate: string;
  publishTime: string;
  targetChannelId: string;
  targetChannelTitle: string;
  contentProfileName: string;
  status: 'READY' | 'PROCESSING' | 'CONFLICT' | 'BLOCKED_EXCLUDED' | 'NEEDS_SCOPE' | 'CANDIDATE';
  managementScope: ManagementScope;
  safetyCategory?: SafetyCategory;
  isAmgEligible: boolean;
  isProtected?: boolean;
  protectionReason?: string;
  matchedTitlePattern?: string;
  exclusionReason?: string;
  uploadedAt?: string;
}

// ==========================================
// PHASE 3 — AUTOMATION QUEUE, WORKER & ANALYTICS TYPES
// ==========================================

export interface MetadataSnapshot {
  videoId: string;
  youtubeVideoId: string;
  titleBefore: string;
  thumbnailBefore: string;
  privacyStatusBefore: string;
  capturedAt: string;
  batchId: string;
}

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'RETRYING';

export interface Phase3AutomationJob {
  id: string;
  batchId: string;
  channelId: string;
  videoId: string;
  payload: {
    title: string;
    description: string;
    tags: string[];
    scheduledPublishAt: string;
    thumbnailUrl: string;
  };
  snapshot: MetadataSnapshot;
  status: JobStatus;
  retryCount: number;
  maxRetries: number;
  nextRunAt: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatrixAnalyticsRecord {
  titleKey: string;
  thumbnailKey: string;
  impressions: number;
  clicks: number;
  totalWatchTimeSeconds: number;
  views: number;
  ctr: number;
  averageViewDuration: number;
}
