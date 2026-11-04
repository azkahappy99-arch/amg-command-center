/**
 * AMG Command Center — YouTube Data API Quota Tracker Engine
 * Database: IndexedDB ('amg_quota_tracker')
 * ObjectStore: 'amg_quota_tracker'
 * Key: 'daily_quota'
 * 
 * Provides:
 * - Real-time tracking of YouTube Data API quota consumption (100 units per video: thumbnails.set + videos.update).
 * - Persistent storage in IndexedDB (immune to tab switching or page refreshes).
 * - Auto-reset daily at Midnight Pacific Time (PST/PDT - America/Los_Angeles cycle used by YouTube API).
 * - Real-time custom event broadcasting ('amg_quota_updated') for responsive UI syncing.
 */

export interface QuotaTrackerData {
  usedQuota: number;
  dailyLimit: number;
  lastDatePst: string;
  updatedAt: string;
}

const DB_NAME = 'amg_quota_tracker';
const DB_VERSION = 1;
const STORE_NAME = 'amg_quota_tracker';
const QUOTA_RECORD_KEY = 'daily_quota';
const STORAGE_KEY = 'amg_quota_tracker';
export const DEFAULT_DAILY_LIMIT = 10000;
export const QUOTA_COST_PER_VIDEO = 100; // thumbnails.set (50) + videos.update (50)

// In-memory cache for instant zero-latency UI access
let memoryQuotaCache: QuotaTrackerData | null = null;
let dbPromise: Promise<IDBDatabase | null> | null = null;

/**
 * Returns the current calendar date in Pacific Time (America/Los_Angeles, e.g. "2026-11-03").
 * YouTube Data API quota resets officially at 00:00:00 PST.
 */
export function getPstDateString(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    // Fallback if Intl format fails
    const pstDate = new Date(date.getTime() - 8 * 60 * 60 * 1000);
    return pstDate.toISOString().split('T')[0];
  }
}

/**
 * Checks if IndexedDB is supported in the current environment.
 */
function isIndexedDbSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

/**
 * Initializes and opens the 'amg_quota_tracker' IndexedDB database.
 */
export function initQuotaDb(): Promise<IDBDatabase | null> {
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
          console.warn('[amg_quota_tracker] Gagal membuka IndexedDB, fallback ke localStorage');
          resolve(null);
        };
      } catch (err) {
        console.warn('[amg_quota_tracker] Exception saat membuka IndexedDB:', err);
        resolve(null);
      }
    });
  }

  return dbPromise;
}

/**
 * Reads quota data directly from IndexedDB.
 */
async function loadQuotaFromIndexedDb(): Promise<QuotaTrackerData | null> {
  try {
    const db = await initQuotaDb();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(QUOTA_RECORD_KEY);

        req.onsuccess = () => {
          resolve(req.result || null);
        };

        req.onerror = () => {
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

/**
 * Writes quota data directly to IndexedDB.
 */
async function saveQuotaToIndexedDb(data: QuotaTrackerData): Promise<boolean> {
  try {
    const db = await initQuotaDb();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(data, QUOTA_RECORD_KEY);

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

/**
 * Clears the in-memory quota cache (used in testing or on hard reset).
 */
export function clearMemoryQuotaCache(): void {
  memoryQuotaCache = null;
}

/**
 * Reads quota data synchronously from localStorage fallback.
 */
export function getQuotaUsageSync(): QuotaTrackerData {
  const todayPst = getPstDateString();

  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.usedQuota === 'number') {
          // Check daily reset
          if (parsed.lastDatePst === todayPst) {
            memoryQuotaCache = parsed;
            return parsed;
          }
        }
      }
    } catch {}
  }

  if (memoryQuotaCache && memoryQuotaCache.lastDatePst === todayPst) {
    return memoryQuotaCache;
  }

  const fresh: QuotaTrackerData = {
    usedQuota: 0,
    dailyLimit: DEFAULT_DAILY_LIMIT,
    lastDatePst: todayPst,
    updatedAt: new Date().toISOString(),
  };
  memoryQuotaCache = fresh;
  return fresh;
}

/**
 * Syncs the current quota to localStorage and SystemSettings for compatibility.
 */
function syncQuotaToLocalStorage(data: QuotaTrackerData): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    // Also sync to amg_settings if present
    const rawSettings = localStorage.getItem('amg_settings');
    if (rawSettings) {
      try {
        const settings = JSON.parse(rawSettings);
        settings.apiQuotaUsed = data.usedQuota;
        settings.apiQuotaDailyLimit = data.dailyLimit;
        localStorage.setItem('amg_settings', JSON.stringify(settings));
      } catch {}
    }
  } catch {}
}

/**
 * Reads the current quota usage, automatically resetting if Midnight PST has passed.
 */
export async function getQuotaUsage(): Promise<QuotaTrackerData> {
  const todayPst = getPstDateString();

  // 1. Try reading from IndexedDB
  let data = await loadQuotaFromIndexedDb();

  // 2. Fallback to localStorage
  if (!data) {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.usedQuota === 'number') {
            data = parsed;
          }
        }
      } catch {}
    }
  }

  // 3. Fallback to memory cache
  if (!data && memoryQuotaCache) {
    data = memoryQuotaCache;
  }

  // 4. Auto-Reset Harian (Sesuai Siklus Midnight PST)
  if (!data || data.lastDatePst !== todayPst) {
    data = {
      usedQuota: 0,
      dailyLimit: DEFAULT_DAILY_LIMIT,
      lastDatePst: todayPst,
      updatedAt: new Date().toISOString(),
    };
    await saveQuotaToIndexedDb(data);
    syncQuotaToLocalStorage(data);
  }

  memoryQuotaCache = data;
  return data;
}

/**
 * Increments the used quota by a given unit amount (default: 100 units).
 * Persists directly in IndexedDB & localStorage, and broadcasts an update event.
 */
export async function incrementQuota(units: number = QUOTA_COST_PER_VIDEO): Promise<QuotaTrackerData> {
  const current = await getQuotaUsage();
  const todayPst = getPstDateString();

  const newUsed = (current.lastDatePst === todayPst ? current.usedQuota : 0) + units;

  const updatedData: QuotaTrackerData = {
    usedQuota: newUsed,
    dailyLimit: current.dailyLimit || DEFAULT_DAILY_LIMIT,
    lastDatePst: todayPst,
    updatedAt: new Date().toISOString(),
  };

  memoryQuotaCache = updatedData;

  // Persist to IndexedDB
  await saveQuotaToIndexedDb(updatedData);

  // Persist to localStorage & amg_settings
  syncQuotaToLocalStorage(updatedData);

  // Broadcast real-time update event across app
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('amg_quota_updated', {
          detail: updatedData,
        })
      );
    } catch {}
  }

  return updatedData;
}

/**
 * Manually resets the daily quota counter back to 0 for the current PST date.
 */
export async function resetDailyQuota(): Promise<QuotaTrackerData> {
  const todayPst = getPstDateString();
  const resetData: QuotaTrackerData = {
    usedQuota: 0,
    dailyLimit: DEFAULT_DAILY_LIMIT,
    lastDatePst: todayPst,
    updatedAt: new Date().toISOString(),
  };

  memoryQuotaCache = resetData;
  await saveQuotaToIndexedDb(resetData);
  syncQuotaToLocalStorage(resetData);

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('amg_quota_updated', {
          detail: resetData,
        })
      );
    } catch {}
  }

  return resetData;
}
