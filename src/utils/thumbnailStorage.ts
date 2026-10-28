/**
 * AMG Command Center — Dedicated Thumbnail Storage & HTML5 Canvas Compression Engine
 * Resolves QuotaExceededError by storing high-resolution thumbnails in IndexedDB
 * (capacity up to hundreds of MB/GB) instead of localStorage (5MB limit).
 * Automatically compresses raw images to YouTube standard resolution (max 1280px, quality 0.82).
 */

import { MasterThumbnail } from '../types/index.ts';

const DB_NAME = 'AMG_THUMBNAIL_STORAGE';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Initializes and opens the IndexedDB database.
 */
export function initThumbnailDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is not available in this environment.'));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
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
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
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
  try {
    const db = await initThumbnailDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[IndexedDB] set error:', e);
  }
}

/**
 * Retrieves a value from IndexedDB by key.
 */
export async function idbGet<T = any>(key: string): Promise<T | null> {
  try {
    const db = await initThumbnailDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[IndexedDB] get error:', e);
    return null;
  }
}

/**
 * Deletes a value from IndexedDB by key.
 */
export async function idbDelete(key: string): Promise<void> {
  try {
    const db = await initThumbnailDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[IndexedDB] delete error:', e);
  }
}

/**
 * Retrieves all Master Thumbnails for a specific channel from IndexedDB.
 * Checks key `amg_thumbnails_${channelId}`, and clean variations.
 */
export async function getChannelThumbnailsFromIdb(channelId?: string): Promise<MasterThumbnail[]> {
  if (!channelId || channelId === 'ALL') {
    const all = await idbGet<MasterThumbnail[]>('amg_thumbnails_all');
    return Array.isArray(all) ? all : [];
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
      return stored;
    }
  }

  return [];
}

/**
 * Saves all Master Thumbnails for a specific channel to IndexedDB.
 * Also syncs clean channel ID variations.
 */
export async function saveChannelThumbnailsToIdb(
  channelId: string,
  thumbnails: MasterThumbnail[]
): Promise<void> {
  if (!channelId) return;
  const cleanId = channelId.replace(/^chan-/, '');

  await Promise.all([
    idbSet(`amg_thumbnails_${channelId}`, thumbnails),
    idbSet(`amg_thumbnails_${cleanId}`, thumbnails),
    idbSet(`amg_thumbnails_chan-${cleanId}`, thumbnails),
  ]);

  // Also update individual item cache by ID
  for (const th of thumbnails) {
    if (th && th.id && th.url) {
      await idbSet(`amg_thumb_asset_${th.id}`, th.url);
    }
  }
}

/**
 * Appends or updates a Master Thumbnail for a channel in IndexedDB.
 * Guarantees N unlimited items without QuotaExceededError.
 */
export async function appendThumbnailToIdb(
  channelId: string,
  newThumb: MasterThumbnail
): Promise<MasterThumbnail[]> {
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
  return filtered;
}

/**
 * Safely writes to localStorage without throwing QuotaExceededError.
 * If quota is exceeded, stores stripped metadata with an IndexedDB reference pointer.
 */
export function safeLocalStorageSet(key: string, value: string): boolean {
  try {
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
        // Strip large dataUrl properties if it's an array of thumbnails
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          const stripped = parsed.map((item: any) => {
            if (item && item.url && item.url.startsWith('data:')) {
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

/**
 * Retrieves raw thumbnail image (dataUrl / base64) by thumbnail ID from IndexedDB.
 */
export async function getThumbnailDataById(thumbnailId: string): Promise<string | null> {
  if (!thumbnailId) return null;
  const asset = await idbGet<string>(`amg_thumb_asset_${thumbnailId}`);
  if (asset) return asset;
  return null;
}

