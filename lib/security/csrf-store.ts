/**
 * CSRF token store abstraction with Redis backend and in-memory fallback.
 * Enables horizontal scaling and CSRF persistence across restarts.
 */

import { getRedisClient } from '@/lib/database/redis';
import { logger } from '@/lib/utils/secure-logger';

const CSRF_KEY_PREFIX = 'csrf:';
const CSRF_TOKEN_LIFETIME_MS = 60 * 60 * 1000; // 1 hour

export interface CsrfStoreEntry {
  token: string;
  createdAt: number;
}

export interface ICsrfStore {
  get(sessionId: string): Promise<CsrfStoreEntry | null>;
  set(sessionId: string, data: CsrfStoreEntry, ttlMs: number): Promise<void>;
  delete(sessionId: string): Promise<boolean>;
}

/**
 * Redis-backed CSRF store.
 */
class RedisCsrfStore implements ICsrfStore {
  private getKey(sessionId: string): string {
    return `${CSRF_KEY_PREFIX}${sessionId}`;
  }

  async get(sessionId: string): Promise<CsrfStoreEntry | null> {
    const redis = getRedisClient();
    if (!redis) return null;

    try {
      const key = this.getKey(sessionId);
      const raw = await redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as CsrfStoreEntry;
    } catch (error) {
      logger.error('Redis CSRF get error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: sessionId.substring(0, 8) + '...'
      });
      return null;
    }
  }

  async set(sessionId: string, data: CsrfStoreEntry, ttlMs: number): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;

    try {
      const key = this.getKey(sessionId);
      const ttlSec = Math.ceil(ttlMs / 1000);
      await redis.setex(key, ttlSec, JSON.stringify(data));
    } catch (error) {
      logger.error('Redis CSRF set error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: sessionId.substring(0, 8) + '...'
      });
    }
  }

  async delete(sessionId: string): Promise<boolean> {
    const redis = getRedisClient();
    if (!redis) return false;

    try {
      const key = this.getKey(sessionId);
      const deleted = await redis.del(key);
      return deleted > 0;
    } catch (error) {
      logger.error('Redis CSRF delete error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: sessionId.substring(0, 8) + '...'
      });
      return false;
    }
  }
}

/**
 * In-memory CSRF store. Fallback when Redis is unavailable.
 */
class MemoryCsrfStore implements ICsrfStore {
  private store = new Map<string, CsrfStoreEntry>();
  private expiration = new Map<string, number>();

  async get(sessionId: string): Promise<CsrfStoreEntry | null> {
    const entry = this.store.get(sessionId);
    if (!entry) return null;

    const exp = this.expiration.get(sessionId);
    if (exp && Date.now() > exp) {
      this.store.delete(sessionId);
      this.expiration.delete(sessionId);
      return null;
    }
    return entry;
  }

  async set(sessionId: string, data: CsrfStoreEntry, ttlMs: number): Promise<void> {
    this.store.set(sessionId, data);
    this.expiration.set(sessionId, Date.now() + ttlMs);
  }

  async delete(sessionId: string): Promise<boolean> {
    const had = this.store.has(sessionId);
    this.store.delete(sessionId);
    this.expiration.delete(sessionId);
    return had;
  }
}

let csrfStoreInstance: ICsrfStore | null = null;

/**
 * Returns the CSRF store. Uses Redis when available, otherwise in-memory.
 */
export function getCsrfStore(): ICsrfStore {
  if (!csrfStoreInstance) {
    csrfStoreInstance = getRedisClient() ? new RedisCsrfStore() : new MemoryCsrfStore();
  }
  return csrfStoreInstance;
}

export const CSRF_TOKEN_LIFETIME = CSRF_TOKEN_LIFETIME_MS;
