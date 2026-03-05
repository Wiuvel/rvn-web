'use client';

/**
 * Layer 1: Client-side FPID (Fingerprint ID) in IndexedDB
 * Generates unique persistent ID on first visit.
 * fpid store: { fpid, time }
 * rb_sync store: { hash, lastSentTime } — integrity + last sent timestamp
 */

const DB_NAME = 'rvn_device';
const DB_VERSION = 1;
const FPID_STORE = 'fpid';
const RB_SYNC_STORE = 'rb_sync';
const FPID_KEY = 'fpid';
const SYNC_KEY = 'sync';

export interface FpidRecord {
  fpid: string;
  time: string;
  lastSentAt?: number;
}

function md5LikeHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = (h << 5) - h + c;
    h = h & h;
  }
  const hex = Math.abs(h).toString(16);
  return Array(32 - hex.length)
    .fill('0')
    .join('')
    .concat(hex)
    .slice(0, 32);
}

function createHash(fpid: string, time: string): string {
  return md5LikeHash(`${fpid}:${time}`);
}

function generateFpid(): string {
  const rnd = crypto.getRandomValues(new Uint8Array(12));
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let s = 'MP_';
  for (let i = 0; i < 12; i++) {
    s += chars[rnd[i]! % chars.length];
  }
  return s;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(FPID_STORE)) {
        db.createObjectStore(FPID_STORE);
      }
      if (!db.objectStoreNames.contains(RB_SYNC_STORE)) {
        db.createObjectStore(RB_SYNC_STORE);
      }
    };
  });
}

interface FpidRow {
  fpid: string;
  time: string;
}

interface RbSyncRow {
  hash: string;
  lastSentTime: number;
}

async function getFpidRow(): Promise<FpidRow | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FPID_STORE, 'readonly');
    const req = tx.objectStore(FPID_STORE).get(FPID_KEY);
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
    req.onsuccess = () => {
      db.close();
      const row = req.result as FpidRow | undefined;
      if (!row?.fpid || !row?.time) resolve(null);
      else resolve(row);
    };
  });
}

async function getRbSyncRow(): Promise<RbSyncRow | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RB_SYNC_STORE, 'readonly');
    const req = tx.objectStore(RB_SYNC_STORE).get(SYNC_KEY);
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
    req.onsuccess = () => {
      db.close();
      resolve((req.result as RbSyncRow) || null);
    };
  });
}

async function setFpidRow(row: FpidRow): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FPID_STORE, 'readwrite');
    const req = tx.objectStore(FPID_STORE).put(row, FPID_KEY);
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
    req.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

async function setRbSyncRow(row: RbSyncRow): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RB_SYNC_STORE, 'readwrite');
    const req = tx.objectStore(RB_SYNC_STORE).put(row, SYNC_KEY);
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
    req.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

/**
 * Get or create FPID. Returns cached value or creates new.
 */
export async function getOrCreateFpid(): Promise<FpidRecord | null> {
  try {
    const fpidRow = await getFpidRow();
    const syncRow = await getRbSyncRow();

    if (fpidRow) {
      const expectedHash = createHash(fpidRow.fpid, fpidRow.time);
      if (syncRow && syncRow.hash === expectedHash) {
        return {
          fpid: fpidRow.fpid,
          time: fpidRow.time,
          lastSentAt: syncRow.lastSentTime,
        };
      }
    }

    const now = Date.now();
    const time = String(now);
    const fpid = generateFpid();
    const hash = createHash(fpid, time);

    await setFpidRow({ fpid, time });
    await setRbSyncRow({ hash, lastSentTime: 0 });

    return { fpid, time, lastSentAt: 0 };
  } catch {
    return null;
  }
}

const FPID_COOKIE_NAME = 'rvn_fpid';
const FPID_COOKIE_MAX_AGE = 300; // 5 min for OAuth flow

/**
 * Set FPID in cookie for OAuth callback (server reads it).
 * Call before OAuth redirect.
 */
export function setFpidCookieForOAuth(fpid: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${FPID_COOKIE_NAME}=${encodeURIComponent(fpid)}; path=/; max-age=${FPID_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * Mark FPID as sent to server. Updates lastSentTime in rb_sync.
 */
export async function markFpidSent(): Promise<void> {
  try {
    const fpidRow = await getFpidRow();
    const syncRow = await getRbSyncRow();
    if (!fpidRow || !syncRow) return;

    const now = Date.now();
    await setRbSyncRow({
      ...syncRow,
      lastSentTime: now,
    });
  } catch {
    // Ignore
  }
}
