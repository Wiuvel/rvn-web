/**
 * CSRF token store с Redis backend и автоматическим in-memory fallback.
 *
 * ResilientCsrfStore пробует Redis на каждый вызов.
 * При ошибке Redis — fallback на MemoryCsrfStore.
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

class RedisCsrfStore implements ICsrfStore {
  private getKey(sessionId: string): string {
    return `${CSRF_KEY_PREFIX}${sessionId}`;
  }

  async get(sessionId: string): Promise<CsrfStoreEntry | null> {
    const redis = getRedisClient();
    if (!redis) throw new Error('Redis unavailable');

    const key = this.getKey(sessionId);
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as CsrfStoreEntry;
  }

  async set(sessionId: string, data: CsrfStoreEntry, ttlMs: number): Promise<void> {
    const redis = getRedisClient();
    if (!redis) throw new Error('Redis unavailable');

    const key = this.getKey(sessionId);
    const ttlSec = Math.ceil(ttlMs / 1000);
    await redis.setex(key, ttlSec, JSON.stringify(data));
  }

  async delete(sessionId: string): Promise<boolean> {
    const redis = getRedisClient();
    if (!redis) throw new Error('Redis unavailable');

    const key = this.getKey(sessionId);
    const deleted = await redis.del(key);
    return deleted > 0;
  }
}

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

/**
 * Resilient store: пробует Redis на каждый вызов, при ошибке — memory fallback.
 */
class ResilientCsrfStore implements ICsrfStore {
  private redis = new RedisCsrfStore();
  private memory = new MemoryCsrfStore();

  async get(sessionId: string): Promise<CsrfStoreEntry | null> {
    try {
      const result = await this.redis.get(sessionId);
      if (result) return result;
    } catch {
      // Redis недоступен — пробуем memory
    }
    return this.memory.get(sessionId);
  }

  async set(sessionId: string, data: CsrfStoreEntry, ttlMs: number): Promise<void> {
    try {
      await this.redis.set(sessionId, data, ttlMs);
      return;
    } catch {
      logger.warn('Redis CSRF write failed, using memory fallback', {
        sessionId: sessionId.substring(0, 8) + '...',
      });
    }
    await this.memory.set(sessionId, data, ttlMs);
  }

  async delete(sessionId: string): Promise<boolean> {
    let deleted = false;
    try {
      deleted = await this.redis.delete(sessionId);
    } catch {
      // Redis недоступен
    }
    const memDeleted = await this.memory.delete(sessionId);
    return deleted || memDeleted;
  }
}

let csrfStoreInstance: ICsrfStore | null = null;

export function getCsrfStore(): ICsrfStore {
  if (!csrfStoreInstance) {
    csrfStoreInstance = new ResilientCsrfStore();
  }
  return csrfStoreInstance;
}

export const CSRF_TOKEN_LIFETIME = CSRF_TOKEN_LIFETIME_MS;
