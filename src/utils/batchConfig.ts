/**
 * AMG Command Center — Batch Execution Configuration
 * Strategi 3 Channel / Bulan:
 * - 1 Kloter = 33 Video (mengunci runway 1 bulan penuh: 30-33 hari tayang).
 * - Estimasi Kuota: 33 video × 100 unit = ~3.300 unit per channel.
 * - Kapasitas Harian API (10.000 unit): Mendukung hingga 3 channel berbeda per hari (3 × 3.300 = 9.900 unit).
 */

export const BATCH_SIZE = 33; // Mengunci runway 1 bulan (30-33 hari tayang)
export const QUOTA_UNIT_PER_VIDEO = 100;
export const ESTIMATED_QUOTA_PER_BATCH = BATCH_SIZE * QUOTA_UNIT_PER_VIDEO; // 3.300 unit
export const MAX_CHANNELS_PER_DAY = Math.floor(10000 / ESTIMATED_QUOTA_PER_BATCH); // 3 channel/hari

export function sliceEligibleBatch<T>(eligibleVideos: T[], batchIndex = 1, size = BATCH_SIZE): {
  batchVideos: T[];
  remainingVideos: T[];
  totalEligible: number;
  batchIndex: number;
} {
  const safeIndex = Math.max(1, batchIndex);
  const start = (safeIndex - 1) * size;
  const end = safeIndex * size;
  const batchVideos = eligibleVideos.slice(start, end);
  const remainingVideos = eligibleVideos.slice(end);
  return {
    batchVideos,
    remainingVideos,
    totalEligible: eligibleVideos.length,
    batchIndex: safeIndex,
  };
}
