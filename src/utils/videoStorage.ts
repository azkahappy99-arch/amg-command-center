/**
 * AMG Command Center — Dedicated System Database & High-Capacity Video Cache Engine
 * Database Name: 'amg_system_db'
 * Object Store: 'amg_cached_videos'
 * 
 * Replaces localStorage for storing thousands of YouTube videos per channel,
 * completely resolving DOMException: QuotaExceededError (5MB limit) on mobile browsers.
 * Provides safeSetItem wrapper to guarantee localStorage.setItem never throws uncaught exceptions.
 */

import { ManagedVideo } from '../types/index.ts';

const SYSTEM_DB_NAME = 'amg_system_db';
const SYSTEM_DB_VERSION = 1;
const CACHED_VIDEOS_STORE = 'amg_cached_videos';

// In-memory fallback for environments without IndexedDB (e.g. Node.js unit tests)
const memoryVideoStore = new Map<string, ManagedVideo[]>();

let systemDbPromise: Promise<IDBDatabase | null> | null = null;

/**
 * Checks if IndexedDB is available in the current runtime environment.
 */
function isIndexedDbSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

/**
 * Initializes and opens the 'amg_system_db' IndexedDB database.
 */
export function initSystemDb(): Promise<IDBDatabase | null> {
  if (!isIndexedDbSupported()) {
    return Promise.resolve(null);
  }

  if (!systemDbPromise) {
    systemDbPromise = new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(SYSTEM_DB_NAME, SYSTEM_DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(CACHED_VIDEOS_STORE)) {
            db.createObjectStore(CACHED_VIDEOS_STORE);
          }
        };

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = () => {
          console.warn('[amg_system_db] Gagal membuka IndexedDB, menggunakan memoryVideoStore fallback');
          resolve(null);
        };
      } catch (err) {
        console.warn('[amg_system_db] Exception saat membuka IndexedDB:', err);
        resolve(null);
      }
    });
  }

  return systemDbPromise;
}

/**
 * Safe localStorage wrapper that guarantees setItem NEVER crashes with an uncaught QuotaExceededError.
 */
export const safeSetItem = (key: string, value: string): boolean => {
  if (typeof localStorage === 'undefined') return true;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e: any) {
    console.warn(`[SafeStorage] Kuota localStorage penuh untuk key: ${key}. Mengabaikan penyimpanan non-kritis.`);
    return false;
  }
};

/**
 * Safe localStorage getter with type-safe fallback.
 */
export const safeGetItem = <T = any>(key: string, fallback: T): T => {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

/**
 * Safe localStorage removeItem.
 */
export const safeRemoveItem = (key: string): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {}
};

/**
 * Saves channel videos directly to IndexedDB ('amg_system_db' -> 'amg_cached_videos').
 * Capacity supports hundreds of megabytes / tens of thousands of video records.
 */
export async function saveCachedVideosToIdb(
  channelId: string,
  videos: ManagedVideo[]
): Promise<void> {
  if (!channelId || !Array.isArray(videos)) return;

  const cleanId = channelId.replace(/^chan-/, '');
  const keysToSave = [
    channelId,
    cleanId,
    `chan-${cleanId}`,
  ];

  for (const k of keysToSave) {
    memoryVideoStore.set(k, videos);
  }

  try {
    const db = await initSystemDb();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(CACHED_VIDEOS_STORE, 'readwrite');
        const store = tx.objectStore(CACHED_VIDEOS_STORE);

        for (const k of keysToSave) {
          store.put(videos, k);
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          console.warn('[amg_system_db] Error saving videos transaction:', tx.error);
          resolve();
        };
      } catch (err) {
        console.warn('[amg_system_db] Error executing saveCachedVideosToIdb:', err);
        resolve();
      }
    });
  } catch (e) {
    console.warn('[amg_system_db] Exception in saveCachedVideosToIdb:', e);
  }
}

/**
 * Retrieves channel videos directly from IndexedDB ('amg_system_db' -> 'amg_cached_videos').
 * Checks clean channel ID variations and auto-migrates legacy localStorage items if found.
 */
export async function getCachedVideosFromIdb(channelId?: string): Promise<ManagedVideo[]> {
  if (!channelId) {
    // Check all-channel cache
    if (memoryVideoStore.has('ALL')) {
      return memoryVideoStore.get('ALL') || [];
    }
  }

  const cleanId = (channelId || '').replace(/^chan-/, '');
  const keysToTry = channelId
    ? [channelId, cleanId, `chan-${cleanId}`]
    : ['ALL'];

  // 1. Check in-memory store
  for (const k of keysToTry) {
    if (memoryVideoStore.has(k)) {
      const memList = memoryVideoStore.get(k);
      if (Array.isArray(memList) && memList.length > 0) {
        return memList;
      }
    }
  }

  // 2. Check IndexedDB
  try {
    const db = await initSystemDb();
    if (db) {
      const fromIdb = await new Promise<ManagedVideo[] | null>((resolve) => {
        try {
          const tx = db.transaction(CACHED_VIDEOS_STORE, 'readonly');
          const store = tx.objectStore(CACHED_VIDEOS_STORE);

          let resolved = false;
          for (const k of keysToTry) {
            const req = store.get(k);
            req.onsuccess = () => {
              if (!resolved && Array.isArray(req.result) && req.result.length > 0) {
                resolved = true;
                resolve(req.result);
              }
            };
          }

          tx.oncomplete = () => {
            if (!resolved) resolve(null);
          };
          tx.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });

      if (Array.isArray(fromIdb) && fromIdb.length > 0) {
        for (const k of keysToTry) {
          memoryVideoStore.set(k, fromIdb);
        }
        return fromIdb;
      }
    }
  } catch (err) {
    console.warn('[amg_system_db] Exception reading from IndexedDB:', err);
  }

  // 3. Fallback: Check legacy localStorage key, auto-migrate to IndexedDB, and PURGE from localStorage
  if (typeof localStorage !== 'undefined' && channelId) {
    for (const k of keysToTry) {
      try {
        const raw = localStorage.getItem(`amg_real_videos_${k}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Auto-migrate to IndexedDB
            saveCachedVideosToIdb(channelId, parsed).catch(() => {});
            // Purge bloated string from localStorage to free up browser quota!
            localStorage.removeItem(`amg_real_videos_${k}`);
            return parsed;
          }
        }
      } catch {}
    }
  }

  return [];
}

/**
 * Removes cached videos for a channel from IndexedDB.
 */
export async function deleteCachedVideosFromIdb(channelId: string): Promise<void> {
  const cleanId = channelId.replace(/^chan-/, '');
  const keysToDelete = [channelId, cleanId, `chan-${cleanId}`];

  for (const k of keysToDelete) {
    memoryVideoStore.delete(k);
  }

  try {
    const db = await initSystemDb();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(CACHED_VIDEOS_STORE, 'readwrite');
        const store = tx.objectStore(CACHED_VIDEOS_STORE);
        for (const k of keysToDelete) {
          store.delete(k);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {}
}

/**
 * Proactively purges bloated legacy video keys from localStorage to prevent QuotaExceededError.
 */
export function purgeLegacyVideoLocalStorageKeys(): void {
  if (typeof localStorage === 'undefined') return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('amg_real_videos_')) {
        keysToRemove.push(key);
      }
    }

    for (const k of keysToRemove) {
      try {
        // Migrate to IndexedDB if possible before removing
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const chanId = k.replace('amg_real_videos_', '');
            saveCachedVideosToIdb(chanId, parsed).catch(() => {});
          }
        }
      } catch {}
      localStorage.removeItem(k);
    }

    if (keysToRemove.length > 0) {
      console.log(`[SafeStorage] Successfully purged ${keysToRemove.length} legacy video keys from localStorage.`);
    }
  } catch (e) {
    console.warn('[SafeStorage] Notice during purgeLegacyVideoLocalStorageKeys:', e);
  }
}

// Auto-run purge on initial script load in browser
if (typeof window !== 'undefined') {
  try {
    purgeLegacyVideoLocalStorageKeys();
  } catch {}
}
