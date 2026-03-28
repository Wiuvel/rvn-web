import type { CityResponse, Reader } from 'maxmind';
import { logger } from './secure-logger';
import { db } from '../database/db';
import { userDevices } from '../database/schema';
import { eq } from 'drizzle-orm';

// --- MaxMind lazy loader ---

let mmdbReader: Reader<CityResponse> | null = null;
let mmdbLoadAttempted = false;

async function getMaxMindReader(): Promise<Reader<CityResponse> | null> {
  if (mmdbLoadAttempted) return mmdbReader;
  mmdbLoadAttempted = true;

  const dbPath = process.env.MAXMIND_DB_PATH || './data/GeoLite2-City.mmdb';

  try {
    const maxmind = await import('maxmind');
    mmdbReader = await maxmind.open<CityResponse>(dbPath);
    logger.info('MaxMind GeoLite2 database loaded', { path: dbPath });
  } catch {
    // .mmdb not found — expected in dev, will use IP-API fallback
    mmdbReader = null;
  }

  return mmdbReader;
}

// --- In-memory cache ---

const CACHE_MAX_SIZE = 10_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheGet(ip: string): string | null | undefined {
  const entry = cache.get(ip);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(ip);
    return undefined;
  }
  return entry.value;
}

function cacheSet(ip: string, value: string | null): void {
  if (cache.size >= CACHE_MAX_SIZE) {
    // Evict oldest entry
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(ip, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// --- Private IP detection ---

function isPrivateIP(ip: string): boolean {
  if (!ip || ip === 'unknown') return true;
  if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('127.')) return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // IPv6 ULA
  return false;
}

// --- IP-API.com fallback ---

let lastIpApiCall = 0;
const IP_API_MIN_INTERVAL_MS = 1500; // ~40 req/min

async function lookupViaIpApi(ip: string): Promise<string | null> {
  const now = Date.now();
  if (now - lastIpApiCall < IP_API_MIN_INTERVAL_MS) return null;
  lastIpApiCall = now;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = (await res.json()) as { status?: string; city?: string; country?: string };
    if (data.status !== 'success') return null;

    return formatLocation(data.city, data.country);
  } catch {
    return null;
  }
}

// --- Format helper ---

function formatLocation(city?: string, country?: string): string | null {
  if (city && country) return `${city}, ${country}`;
  if (country) return country;
  return null;
}

// --- Public API ---

export async function lookupIP(ip: string): Promise<string | null> {
  if (isPrivateIP(ip)) return null;

  const cached = cacheGet(ip);
  if (cached !== undefined) return cached;

  // Try MaxMind
  const reader = await getMaxMindReader();
  if (reader) {
    try {
      const result = reader.get(ip);
      if (result) {
        const location = formatLocation(result.city?.names?.en, result.country?.names?.en);
        cacheSet(ip, location);
        return location;
      }
    } catch {
      // Invalid IP or lookup error
    }
  }

  // Fallback: IP-API.com
  const location = await lookupViaIpApi(ip);
  cacheSet(ip, location);
  return location;
}

export function resolveAndStoreLocation(deviceId: string, ipAddress: string): void {
  if (!db || !ipAddress) return;

  lookupIP(ipAddress)
    .then((location) => {
      if (!location || !db) return;
      return db
        .update(userDevices)
        .set({ location })
        .where(eq(userDevices.id, deviceId));
    })
    .catch((error) => {
      logger.warn('Failed to resolve device location', {
        error: error instanceof Error ? error.message : String(error),
        deviceId,
      });
    });
}

/**
 * Eagerly load MaxMind DB and report status. Used by instrumentation.ts.
 * Returns 'maxmind' | 'ip-api' | null.
 */
export async function checkGeoReady(): Promise<{ source: 'maxmind' | 'ip-api'; dbPath?: string } | null> {
  const reader = await getMaxMindReader();
  if (reader) {
    return { source: 'maxmind', dbPath: process.env.MAXMIND_DB_PATH || './data/GeoLite2-City.mmdb' };
  }
  // ip-api.com is always available as fallback (no pre-check needed)
  return { source: 'ip-api' };
}

// Exported for testing
export { isPrivateIP as _isPrivateIP, formatLocation as _formatLocation, cache as _cache, cacheSet as _cacheSet };
