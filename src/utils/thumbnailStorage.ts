/**
 * AMG Command Center — Dedicated Thumbnail Storage & HTML5 Canvas Compression Engine
 * Resolves QuotaExceededError by storing high-resolution thumbnails in IndexedDB
 * (capacity up to hundreds of MB/GB) instead of localStorage (5MB limit).
 * Automatically compresses raw images to YouTube standard resolution (max 1280px, quality 0.82).
 * 
 * Provides:
 * - Direct Binary & DataURL persistence in IndexedDB
 * - In-memory object/data URL caching for instant, zero-flicker UI rendering
 * - Payload validation to detect null, corrupt, or missing assets ("Aset Gambar Hilang - Harap Unggah Ulang")
 * - Atomic execution guards that forbid worker execution if thumbnail payload is missing
 */

import { MasterThumbnail } from '../types/index.ts';

const DB_NAME = 'AMG_THUMBNAIL_STORAGE';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';

// In-memory fallback for environments without IndexedDB (e.g. Node.js unit tests)
const memoryStore = new Map<string, any>();

// In-memory cache for resolved valid DataURLs / ObjectURLs to guarantee instant rendering
const stableUrlCache = new Map<string, string>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

/**
 * Checks if IndexedDB is available in the current runtime environment.
 */
function isIndexedDbSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

/**
 * Initializes and opens the IndexedDB database.
 */
export function initThumbnailDb(): Promise<IDBDatabase | null> {
  if (!isIndexedDbSupported()) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = () => {
          console.warn('[IndexedDB] Gagal membuka IndexedDB, menggunakan memoryStore fallback');
          resolve(null);
        };
      } catch (err) {
        console.warn('[IndexedDB] Exception saat membuka IndexedDB:', err);
        resolve(null);
      }
    });
  }

  return dbPromise;
}

/**
 * Compresses an image file or DataURL using HTML5 Canvas to YouTube standard:
 * - Max Width: 1280px (scaled proportionally)
 * - Format: image/jpeg
 * - Quality: 0.82 (reduces 5-15MB camera files to ~150KB - 300KB)
 */
export async function compressThumbnailImage(
  source: File | Blob | string,
  maxWidth = 1280,
  quality = 0.82
): Promise<{ dataUrl: string; width: number; height: number; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      // Node.js fallback
      if (typeof source === 'string') {
        resolve({ dataUrl: source, width: 1280, height: 720, sizeBytes: source.length });
      } else {
        resolve({ dataUrl: 'data:image/jpeg;base64,mock', width: 1280, height: 720, sizeBytes: 100 });
      }
      return;
    }

    const processImage = (img: HTMLImageElement) => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width <= 0 || height <= 0) {
          width = 1280;
          height = 720;
        }

        // Scale down if width exceeds max YouTube resolution
        if (width > maxWidth) {
          const ratio = maxWidth / width;
          width = maxWidth;
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get 2D canvas context for compression.'));
          return;
        }

        // High quality rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const approxBytes = Math.round((dataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75);

        resolve({
          dataUrl,
          width,
          height,
          sizeBytes: approxBytes,
        });
      } catch (err) {
        reject(err);
      }
    };

    if (typeof source === 'string') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => processImage(img);
      img.onerror = () => reject(new Error('Gagal memuat gambar untuk dikompresi.'));
      img.src = source;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        const img = new Image();
        img.onload = () => processImage(img);
        img.onerror = () => reject(new Error('Gagal memuat file gambar dari galeri.'));
        img.src = src;
      };
      reader.onerror = () => reject(new Error('Gagal membaca file dari galeri perangkat.'));
      reader.readAsDataURL(source);
    }
  });
}

/**
 * Stores a value in IndexedDB by key.
 */
export async function idbSet<T = any>(key: string, value: T): Promise<void> {
  memoryStore.set(key, value);

  try {
    const db = await initThumbnailDb();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => {
          console.warn('[IndexedDB] set error for key:', key, req.error);
          resolve();
        };
      } catch (e) {
        console.warn('[IndexedDB] transaction error:', e);
        resolve();
      }
    });
  } catch (e) {
    console.warn('[IndexedDB] idbSet exception:', e);
  }
}

/**
 * Retrieves a value from IndexedDB by key.
 */
export async function idbGet<T = any>(key: string): Promise<T | null> {
  if (memoryStore.has(key)) {
    return memoryStore.get(key) as T;
  }

  try {
    const db = await initThumbnailDb();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => {
          const res = req.result ?? null;
          if (res !== null) {
            memoryStore.set(key, res);
          }
          resolve(res);
        };
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  } catch (e) {
    return null;
  }
}

/**
 * Deletes a value from IndexedDB by key.
 */
export async function idbDelete(key: string): Promise<void> {
  memoryStore.delete(key);

  try {
    const db = await initThumbnailDb();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {}
}

/**
 * Validates whether a thumbnail payload string or Blob is genuinely valid and non-corrupt.
 */
export function isValidThumbnailData(data: any): boolean {
  if (!data) return false;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (trimmed.length < 100) return false;
    if (trimmed.startsWith('idb:')) return false; // Unresolved pointer
    if (trimmed.startsWith('data:image/')) return true;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return true;
    return false;
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return data.size > 100;
  }
  return false;
}

/**
 * Retrieves raw thumbnail image (dataUrl / base64) by thumbnail ID from IndexedDB.
 * Auto-migrates from localStorage if found there.
 */
export async function getThumbnailDataById(thumbnailId: string): Promise<string | null> {
  if (!thumbnailId) return null;

  // 1. Check in-memory stable URL cache
  if (stableUrlCache.has(thumbnailId)) {
    const cached = stableUrlCache.get(thumbnailId);
    if (cached && isValidThumbnailData(cached)) {
      return cached;
    }
  }

  // 2. Check direct asset key in IndexedDB
  const asset = await idbGet<string>(`amg_thumb_asset_${thumbnailId}`);
  if (asset && isValidThumbnailData(asset)) {
    stableUrlCache.set(thumbnailId, asset);
    return asset;
  }

  // 3. Check legacy or alternative key `thumb_payload_${thumbnailId}`
  const altAsset = await idbGet<string>(`thumb_payload_${thumbnailId}`);
  if (altAsset && isValidThumbnailData(altAsset)) {
    stableUrlCache.set(thumbnailId, altAsset);
    await idbSet(`amg_thumb_asset_${thumbnailId}`, altAsset);
    return altAsset;
  }

  // 4. Check if stored as Blob
  const blobAsset = await idbGet<Blob>(`thumb_blob_${thumbnailId}`);
  if (blobAsset && typeof Blob !== 'undefined' && blobAsset instanceof Blob && blobAsset.size > 100) {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blobAsset);
      });
      if (isValidThumbnailData(dataUrl)) {
        stableUrlCache.set(thumbnailId, dataUrl);
        await idbSet(`amg_thumb_asset_${thumbnailId}`, dataUrl);
        return dataUrl;
      }
    } catch {}
  }

  // 5. Fallback: Search localStorage for legacy base64 data and auto-migrate to IndexedDB
  if (typeof localStorage !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('amg_master_thumbnails_') || key === 'amg_master_thumbnails')) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const match = parsed.find((t: any) => t && t.id === thumbnailId);
              if (match && match.url && isValidThumbnailData(match.url)) {
                // Auto-migrate to IndexedDB
                await idbSet(`amg_thumb_asset_${thumbnailId}`, match.url);
                stableUrlCache.set(thumbnailId, match.url);
                return match.url;
              }
            }
          }
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Validates whether a MasterThumbnail has a real, readable payload in IndexedDB.
 * Returns { isValid: true, url: dataUrl } or { isValid: false, url: null, error: 'Aset Gambar Hilang - Harap Unggah Ulang' }
 */
export async function validateThumbnailPayload(
  thumb: MasterThumbnail
): Promise<{ isValid: boolean; url: string | null; error?: string }> {
  if (!thumb || !thumb.id) {
    return {
      isValid: false,
      url: null,
      error: 'Aset Gambar Hilang - Harap Unggah Ulang',
    };
  }

  // 1. If thumb.url is already a valid full DataURL
  if (thumb.url && isValidThumbnailData(thumb.url)) {
    stableUrlCache.set(thumb.id, thumb.url);
    return { isValid: true, url: thumb.url };
  }

  // 2. Fetch from IndexedDB
  const payload = await getThumbnailDataById(thumb.id);
  if (payload && isValidThumbnailData(payload)) {
    return { isValid: true, url: payload };
  }

  return {
    isValid: false,
    url: null,
    error: 'Aset Gambar Hilang - Harap Unggah Ulang',
  };
}

/**
 * Hydrates a list of MasterThumbnails by resolving real image payloads from IndexedDB.
 * Any item with missing or corrupt binary/blob data is flagged with `isCorrupt: true`
 * and error: "Aset Gambar Hilang - Harap Unggah Ulang".
 */
export async function hydrateThumbnailsWithPayloads(
  thumbnails: MasterThumbnail[]
): Promise<Array<MasterThumbnail & { isCorrupt?: boolean; error?: string }>> {
  if (!Array.isArray(thumbnails)) return [];

  const results = await Promise.all(
    thumbnails.map(async (th) => {
      const validation = await validateThumbnailPayload(th);
      if (validation.isValid && validation.url) {
        return {
          ...th,
          url: validation.url,
          isCorrupt: false,
          error: undefined,
        };
      } else {
        return {
          ...th,
          url: '', // Clear broken pointer
          isCorrupt: true,
          error: 'Aset Gambar Hilang - Harap Unggah Ulang',
        };
      }
    })
  );

  return results;
}

/**
 * Validates whether all thumbnails in a rotation list have valid payloads.
 * Used as an atomic barrier before starting worker execution.
 */
export async function validateThumbnailsRotation(
  thumbnails: MasterThumbnail[]
): Promise<{
  allValid: boolean;
  corruptCount: number;
  corruptIds: string[];
  corruptNames: string[];
}> {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) {
    return { allValid: true, corruptCount: 0, corruptIds: [], corruptNames: [] };
  }

  const corruptIds: string[] = [];
  const corruptNames: string[] = [];

  for (const th of thumbnails) {
    const val = await validateThumbnailPayload(th);
    if (!val.isValid) {
      corruptIds.push(th.id);
      corruptNames.push(th.name || th.id);
    }
  }

  return {
    allValid: corruptIds.length === 0,
    corruptCount: corruptIds.length,
    corruptIds,
    corruptNames,
  };
}

/**
 * Retrieves all Master Thumbnails for a specific channel from IndexedDB and hydrates image payloads.
 * Checks key `amg_thumbnails_${channelId}`, and clean variations.
 */
export async function getChannelThumbnailsFromIdb(channelId?: string): Promise<MasterThumbnail[]> {
  if (!channelId || channelId === 'ALL') {
    const all = await idbGet<MasterThumbnail[]>('amg_thumbnails_all');
    if (Array.isArray(all) && all.length > 0) {
      return hydrateThumbnailsWithPayloads(all);
    }
    return [];
  }

  const cleanId = channelId.replace(/^chan-/, '');
  const keysToTry = [
    `amg_thumbnails_${channelId}`,
    `amg_thumbnails_${cleanId}`,
    `amg_thumbnails_chan-${cleanId}`,
  ];

  for (const k of keysToTry) {
    const stored = await idbGet<MasterThumbnail[]>(k);
    if (Array.isArray(stored) && stored.length > 0) {
      return hydrateThumbnailsWithPayloads(stored);
    }
  }

  return [];
}

/**
 * Saves all Master Thumbnails for a specific channel to IndexedDB.
 * Safely persists binary data in `amg_thumb_asset_${th.id}`.
 */
export async function saveChannelThumbnailsToIdb(
  channelId: string,
  thumbnails: MasterThumbnail[]
): Promise<void> {
  if (!channelId || !Array.isArray(thumbnails)) return;
  const cleanId = channelId.replace(/^chan-/, '');

  // 1. Store individual asset payloads first to IndexedDB
  for (const th of thumbnails) {
    if (th && th.id) {
      if (th.url && isValidThumbnailData(th.url)) {
        await idbSet(`amg_thumb_asset_${th.id}`, th.url);
        stableUrlCache.set(th.id, th.url);
      }
    }
  }

  // 2. Persist list with full data in IndexedDB (IndexedDB has GB-level capacity)
  await Promise.all([
    idbSet(`amg_thumbnails_${channelId}`, thumbnails),
    idbSet(`amg_thumbnails_${cleanId}`, thumbnails),
    idbSet(`amg_thumbnails_chan-${cleanId}`, thumbnails),
  ]);
}

/**
 * Appends or updates a Master Thumbnail for a channel in IndexedDB.
 * Guarantees unlimited items without QuotaExceededError.
 */
export async function appendThumbnailToIdb(
  channelId: string,
  newThumb: MasterThumbnail
): Promise<MasterThumbnail[]> {
  if (!channelId || !newThumb) return [];

  // 1. Persist the real payload in IndexedDB asset key
  if (newThumb.id && newThumb.url && isValidThumbnailData(newThumb.url)) {
    await idbSet(`amg_thumb_asset_${newThumb.id}`, newThumb.url);
    stableUrlCache.set(newThumb.id, newThumb.url);
  }

  const existing = await getChannelThumbnailsFromIdb(channelId);
  const seen = new Set<string>();
  const list: MasterThumbnail[] = [];

  for (const th of existing) {
    if (th && th.id && !seen.has(th.id)) {
      seen.add(th.id);
      list.push(th);
    }
  }

  const idx = list.findIndex((th) => th.id === newThumb.id);
  if (idx >= 0) {
    list[idx] = newThumb;
  } else {
    newThumb.orderIndex = list.length;
    list.push(newThumb);
  }

  list.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  await saveChannelThumbnailsToIdb(channelId, list);
  return list;
}

/**
 * Removes a Master Thumbnail from IndexedDB for a channel.
 */
export async function deleteThumbnailFromIdb(
  channelId: string,
  thumbId: string
): Promise<MasterThumbnail[]> {
  const existing = await getChannelThumbnailsFromIdb(channelId);
  const filtered = existing.filter((th) => th.id !== thumbId);
  await saveChannelThumbnailsToIdb(channelId, filtered);
  await idbDelete(`amg_thumb_asset_${thumbId}`);
  await idbDelete(`thumb_payload_${thumbId}`);
  await idbDelete(`thumb_blob_${thumbId}`);
  stableUrlCache.delete(thumbId);
  return filtered;
}

/**
 * Safely writes to localStorage without throwing QuotaExceededError.
 * Automatically strips large base64 dataUrl properties to pointer `idb:${id}`
 * so localStorage remains < 10KB while IndexedDB retains the full megabyte payloads.
 */
export function safeLocalStorageSet(key: string, value: string): boolean {
  if (typeof localStorage === 'undefined') return true;

  try {
    // If it's an array of thumbnails, strip large dataUrls proactively before writing
    if (key.includes('thumbnail') || key.includes('THUMBNAILS')) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          const stripped = parsed.map((item: any) => {
            if (item && item.url && item.url.startsWith('data:')) {
              // Cache payload in memory/idb before stripping
              if (item.id) {
                stableUrlCache.set(item.id, item.url);
                idbSet(`amg_thumb_asset_${item.id}`, item.url).catch(() => {});
              }
              return { ...item, url: `idb:${item.id}` };
            }
            return item;
          });
          localStorage.setItem(key, JSON.stringify(stripped));
          return true;
        }
      } catch {}
    }

    localStorage.setItem(key, value);
    return true;
  } catch (err: any) {
    if (
      err?.name === 'QuotaExceededError' ||
      err?.code === 22 ||
      err?.code === 1014 ||
      err?.number === -2147024882
    ) {
      console.warn(`[safeLocalStorageSet] Quota exceeded for "${key}". Cleaning up and using IndexedDB.`);
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          const stripped = parsed.map((item: any) => {
            if (item && item.url && item.url.startsWith('data:')) {
              if (item.id) {
                stableUrlCache.set(item.id, item.url);
                idbSet(`amg_thumb_asset_${item.id}`, item.url).catch(() => {});
              }
              return { ...item, url: `idb:${item.id}` };
            }
            return item;
          });
          localStorage.setItem(key, JSON.stringify(stripped));
          return true;
        }
      } catch {
        // Fallback: omit saving to localStorage, relying 100% on IndexedDB
      }
    }
    return false;
  }
}
