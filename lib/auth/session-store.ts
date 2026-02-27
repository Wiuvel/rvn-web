/**
 * Session store abstraction with Redis backend and in-memory fallback.
 * Enables horizontal scaling and session persistence across restarts.
 */

import { getRedisClient } from '@/lib/database/redis';
import { SESSION_TIMEOUT } from '@/lib/utils/constants';
import { logger } from '@/lib/utils/secure-logger';

const SESSION_KEY_PREFIX = 'session:';
const USER_SESSIONS_PREFIX = 'user_sessions:';

export interface SessionData {
  id: string;
  userId: string;
  username: string;
  tokenFingerprint: string; // HMAC(token) — привязка session к token; пусто для admin
  createdAt: number;
  lastActivity: number;
  ipAddress: string;
  userAgent: string;
}

export interface ISessionStore {
  get(sessionId: string): Promise<SessionData | null>;
  set(sessionId: string, data: SessionData, ttlMs: number): Promise<void>;
  delete(sessionId: string): Promise<boolean>;
  deleteByUserId(userId: string): Promise<number>;
}

/**
 * Redis-backed session store. Uses Redis for persistence and multi-instance support.
 */
class RedisSessionStore implements ISessionStore {
  private getKey(sessionId: string): string {
    return `${SESSION_KEY_PREFIX}${sessionId}`;
  }

  private getUserSessionsKey(userId: string): string {
    return `${USER_SESSIONS_PREFIX}${userId}`;
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const redis = getRedisClient();
    if (!redis) return null;

    try {
      const key = this.getKey(sessionId);
      const raw = await redis.get(key);
      if (!raw) return null;

      const data = JSON.parse(raw) as SessionData;
      const now = Date.now();

      if (data.lastActivity + SESSION_TIMEOUT < now) {
        await this.delete(sessionId);
        return null;
      }

      // Sliding expiration: update lastActivity and extend TTL
      data.lastActivity = now;
      await redis.setex(key, Math.ceil(SESSION_TIMEOUT / 1000), JSON.stringify(data));

      return data;
    } catch (error) {
      logger.error('Redis session get error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: sessionId.substring(0, 8) + '...',
      });
      return null;
    }
  }

  async set(sessionId: string, data: SessionData, ttlMs: number): Promise<void> {
    const redis = getRedisClient();
    if (!redis) return;

    try {
      const key = this.getKey(sessionId);
      const ttlSec = Math.ceil(ttlMs / 1000);
      await redis.setex(key, ttlSec, JSON.stringify(data));

      // Track session IDs per user for deleteByUserId
      const userKey = this.getUserSessionsKey(data.userId);
      await redis.sadd(userKey, sessionId);
      await redis.expire(userKey, ttlSec);
    } catch (error) {
      logger.error('Redis session set error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: sessionId.substring(0, 8) + '...',
      });
    }
  }

  async delete(sessionId: string): Promise<boolean> {
    const redis = getRedisClient();
    if (!redis) return false;

    try {
      const key = this.getKey(sessionId);
      const raw = await redis.get(key);
      if (raw) {
        const data = JSON.parse(raw) as SessionData;
        const userKey = this.getUserSessionsKey(data.userId);
        await redis.srem(userKey, sessionId);
      }
      const deleted = await redis.del(key);
      return deleted > 0;
    } catch (error) {
      logger.error('Redis session delete error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: sessionId.substring(0, 8) + '...',
      });
      return false;
    }
  }

  async deleteByUserId(userId: string): Promise<number> {
    const redis = getRedisClient();
    if (!redis) return 0;

    try {
      const userKey = this.getUserSessionsKey(userId);
      const sessionIds = await redis.smembers(userKey);
      if (sessionIds.length === 0) return 0;

      let destroyed = 0;
      for (const sid of sessionIds) {
        const key = this.getKey(sid);
        const result = await redis.del(key);
        if (result > 0) destroyed++;
      }
      await redis.del(userKey);
      return destroyed;
    } catch (error) {
      logger.error('Redis session deleteByUserId error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return 0;
    }
  }
}

/**
 * In-memory session store. Fallback when Redis is unavailable.
 */
class MemorySessionStore implements ISessionStore {
  private sessions = new Map<string, SessionData>();
  private sessionExpiration = new Map<string, number>();
  private userSessions = new Map<string, Set<string>>();

  async get(sessionId: string): Promise<SessionData | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const expiration = this.sessionExpiration.get(sessionId);
    const now = Date.now();
    if (!expiration || expiration < now) {
      await this.delete(sessionId);
      return null;
    }

    // Sliding expiration
    session.lastActivity = now;
    this.sessionExpiration.set(sessionId, now + SESSION_TIMEOUT);
    return session;
  }

  async set(sessionId: string, data: SessionData, ttlMs: number): Promise<void> {
    const now = Date.now();
    this.sessions.set(sessionId, { ...data, lastActivity: now });
    this.sessionExpiration.set(sessionId, now + ttlMs);

    let set = this.userSessions.get(data.userId);
    if (!set) {
      set = new Set<string>();
      this.userSessions.set(data.userId, set);
    }
    set.add(sessionId);
  }

  async delete(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this.sessions.delete(sessionId);
    this.sessionExpiration.delete(sessionId);
    const set = this.userSessions.get(session.userId);
    if (set) {
      set.delete(sessionId);
      if (set.size === 0) this.userSessions.delete(session.userId);
    }
    return true;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const set = this.userSessions.get(userId);
    if (!set) return 0;

    let destroyed = 0;
    for (const sid of set) {
      if (this.sessions.has(sid)) {
        this.sessions.delete(sid);
        this.sessionExpiration.delete(sid);
        destroyed++;
      }
    }
    this.userSessions.delete(userId);
    return destroyed;
  }
}

let storeInstance: ISessionStore | null = null;

/**
 * Returns the session store. Uses Redis when available, otherwise in-memory.
 */
export function getSessionStore(): ISessionStore {
  if (!storeInstance) {
    storeInstance = getRedisClient() ? new RedisSessionStore() : new MemorySessionStore();
  }
  return storeInstance;
}
