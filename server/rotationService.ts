/**
 * Rotation Service for AMG
 * Implements deterministic round-robin rotation for dynamic Master Titles and Master Thumbnails.
 * Guarantees zero random selection and independent rotation cycles.
 */

export interface RotationTitle {
  id: string;
  text: string;
  orderIndex: number;
}

export interface RotationThumbnail {
  id: string;
  name: string;
  url: string;
  orderIndex: number;
}

export interface RotationAssignment {
  videoIndex: number; // 0-based
  titleIndex: number; // 0-based
  thumbnailIndex: number; // 0-based
  title: RotationTitle;
  thumbnail: RotationThumbnail;
}

/**
 * Deterministic round-robin title assignment.
 * E.g. with 3 titles: video 0 -> T0, 1 -> T1, 2 -> T2, 3 -> T0, 4 -> T1, ...
 */
export function getTitleForIndex(titles: RotationTitle[], index: number): RotationTitle {
  if (!titles || titles.length === 0) {
    throw new Error('Cannot assign title: titles list is empty');
  }
  const sorted = [...titles].sort((a, b) => a.orderIndex - b.orderIndex);
  const modIndex = index % sorted.length;
  return sorted[modIndex];
}

/**
 * Deterministic round-robin thumbnail assignment.
 * E.g. with 4 thumbnails: video 0 -> TH0, 1 -> TH1, 2 -> TH2, 3 -> TH3, 4 -> TH0, ...
 */
export function getThumbnailForIndex(thumbnails: RotationThumbnail[], index: number): RotationThumbnail {
  if (!thumbnails || thumbnails.length === 0) {
    throw new Error('Cannot assign thumbnail: thumbnails list is empty');
  }
  const sorted = [...thumbnails].sort((a, b) => a.orderIndex - b.orderIndex);
  const modIndex = index % sorted.length;
  return sorted[modIndex];
}

/**
 * Generates an independent title & thumbnail rotation matrix for a count of videos.
 * E.g. 3 Titles (T1, T2, T3) and 4 Thumbnails (TH1, TH2, TH3, TH4):
 * Video 1 (idx 0): T1 + TH1
 * Video 2 (idx 1): T2 + TH2
 * Video 3 (idx 2): T3 + TH3
 * Video 4 (idx 3): T1 + TH4
 * Video 5 (idx 4): T2 + TH1
 * Video 6 (idx 5): T3 + TH2
 * Video 7 (idx 6): T1 + TH3
 * Video 8 (idx 7): T2 + TH4
 */
export function generateRotationMatrix(
  titles: RotationTitle[],
  thumbnails: RotationThumbnail[],
  count: number,
  startingTitleOffset = 0,
  startingThumbnailOffset = 0
): RotationAssignment[] {
  if (!titles || titles.length === 0 || !thumbnails || thumbnails.length === 0) {
    return [];
  }

  const sortedTitles = [...titles].sort((a, b) => a.orderIndex - b.orderIndex);
  const sortedThumbnails = [...thumbnails].sort((a, b) => a.orderIndex - b.orderIndex);

  const assignments: RotationAssignment[] = [];

  for (let i = 0; i < count; i++) {
    const titleIdx = (startingTitleOffset + i) % sortedTitles.length;
    const thumbIdx = (startingThumbnailOffset + i) % sortedThumbnails.length;

    assignments.push({
      videoIndex: i,
      titleIndex: titleIdx,
      thumbnailIndex: thumbIdx,
      title: sortedTitles[titleIdx],
      thumbnail: sortedThumbnails[thumbIdx],
    });
  }

  return assignments;
}
