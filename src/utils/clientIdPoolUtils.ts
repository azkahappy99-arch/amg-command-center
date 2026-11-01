import { ClientIdSlot } from '../types/index.ts';

const CLIENT_ID_POOL_KEY = 'amg_client_id_pool';

/**
 * Mengambil daftar Client ID Pool dari localStorage
 */
export function getClientIdPool(): ClientIdSlot[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const raw = localStorage.getItem(CLIENT_ID_POOL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((s) => s && typeof s.clientId === 'string' && s.clientId.trim().length > 0);
      }
    }
  } catch (err) {
    console.warn('[ClientIdPool] Gagal parse client id pool:', err);
  }
  return [];
}

/**
 * Menyimpan seluruh Client ID Pool ke localStorage
 */
export function saveClientIdPool(slots: ClientIdSlot[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(CLIENT_ID_POOL_KEY, JSON.stringify(slots));
    window.dispatchEvent(new CustomEvent('amg_client_id_pool_updated', { detail: { count: slots.length } }));
  } catch (err) {
    console.warn('[ClientIdPool] Gagal menyimpan client id pool:', err);
  }
}

/**
 * Mengubah string textarea (1 baris per Client ID) menjadi array ClientIdSlot terstruktur
 */
export function parseClientIdsFromText(text: string, existingSlots: ClientIdSlot[] = []): ClientIdSlot[] {
  if (!text) return [];
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  const existingMap = new Map<string, ClientIdSlot>();
  for (const s of existingSlots) {
    existingMap.set(s.clientId.trim(), s);
  }

  return lines.map((cId, idx) => {
    const cleanId = cId.trim();
    const existing = existingMap.get(cleanId);
    if (existing) {
      return {
        ...existing,
        id: `Project-Slot-${idx + 1}`,
        clientId: cleanId,
      };
    }
    return {
      id: `Project-Slot-${idx + 1}`,
      clientId: cleanId,
      usageCount: 0,
      isCooldown: false,
      assignedChannelId: null,
    };
  });
}

/**
 * Mengubah daftar ClientIdSlot menjadi teks string 1 baris per Client ID
 */
export function formatClientIdPoolToText(slots: ClientIdSlot[]): string {
  if (!Array.isArray(slots) || slots.length === 0) return '';
  return slots.map((s) => s.clientId.trim()).join('\n');
}

/**
 * Mendapatkan slot Client ID yang siap pakai (belum dipakai channel lain dan tidak sedang cooldown)
 */
export function getAvailableClientIdSlot(): ClientIdSlot | null {
  const pool = getClientIdPool();
  if (pool.length === 0) return null;

  // Prioritaskan yang belum ada assignedChannelId dan tidak cooldown
  const unassigned = pool.find((s) => !s.assignedChannelId && !s.isCooldown);
  if (unassigned) return unassigned;

  // Fallback: slot manapun yang tidak cooldown
  const notCooldown = pool.find((s) => !s.isCooldown);
  if (notCooldown) return notCooldown;

  // Terakhir, kembalikan slot pertama
  return pool[0];
}

/**
 * Mengaitkan slot Client ID ke channel yang berhasil ditautkan
 */
export function assignChannelToSlot(slotIdOrClientId: string, channelId: string): void {
  const pool = getClientIdPool();
  let updated = false;

  for (const s of pool) {
    if (s.id === slotIdOrClientId || s.clientId === slotIdOrClientId) {
      s.assignedChannelId = channelId;
      updated = true;
    }
  }

  if (updated) {
    saveClientIdPool(pool);
  }
}

/**
 * Menandai slot yang mengalami quotaExceeded (403) sebagai isCooldown = true
 * dan mencari slot berikutnya yang segar dari pool.
 */
export function markSlotCooldown(slotIdOrClientId: string): {
  freshSlot: ClientIdSlot | null;
  previousSlot: ClientIdSlot | null;
} {
  const pool = getClientIdPool();
  let prevSlot: ClientIdSlot | null = null;

  for (const s of pool) {
    if (s.id === slotIdOrClientId || s.clientId === slotIdOrClientId) {
      s.isCooldown = true;
      prevSlot = { ...s };
      break;
    }
  }

  // Simpan status cooldown
  saveClientIdPool(pool);

  // Cari slot segar berikutnya
  const freshSlot = pool.find((s) => !s.isCooldown && s.clientId !== slotIdOrClientId) || null;

  return { freshSlot, previousSlot: prevSlot };
}

/**
 * Mereset status cooldown untuk slot tertentu atau seluruh pool
 */
export function resetSlotCooldown(slotIdOrClientId?: string): void {
  const pool = getClientIdPool();
  for (const s of pool) {
    if (!slotIdOrClientId || s.id === slotIdOrClientId || s.clientId === slotIdOrClientId) {
      s.isCooldown = false;
      s.usageCount = 0;
    }
  }
  saveClientIdPool(pool);
}

/**
 * Mencari slot yang terkait dengan channelId
 */
export function getActiveSlotForChannel(channelId: string): ClientIdSlot | null {
  const cleanId = channelId.replace(/^chan-/, '');
  const pool = getClientIdPool();
  const matched = pool.find(
    (s) =>
      s.assignedChannelId === channelId ||
      s.assignedChannelId === cleanId ||
      s.assignedChannelId === `chan-${cleanId}`
  );
  return matched || getAvailableClientIdSlot();
}
