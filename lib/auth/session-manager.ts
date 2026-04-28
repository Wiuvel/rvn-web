/**
 * Session manager with Redis backend and in-memory fallback.
 * Session + Token binding: session_id и token взаимно связаны через tokenFingerprint.
 */

import { createHmac, createHash } from 'crypto';
import { cookies } from 'next/headers';
import { SESSION_TIMEOUT } from '../utils/constants';
import { generateSessionId as generateSessionIdUtil } from '../utils/index';
import { logger } from '../utils/secure-logger';
import { getSessionStore, type SessionData } from './session-store';
import { getEnv } from '../validation/env-validation';
import { db } from '../database/db';
import { userDevices } from '../database/schema';
import { eq, and, ne } from 'drizzle-orm';
import { computeDeviceFpHash } from './device-fingerprint.server';
import { resolveAndStoreLocation } from './geolocation';

export type { SessionData };

function getTokenBindingSecret(): string {
  try {
    return getEnv().CSRF_SECRET;
  } catch {
    return process.env.CSRF_SECRET || 'default-token-binding-secret';
  }
}

/** HMAC(token) — для привязки session к token (защита от подмены) */
function computeTokenFingerprint(token: string): string {
  return createHmac('sha256', getTokenBindingSecret()).update(token).digest('hex');
}

/** SHA256(token) — для хранения в БД */
function computeTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class SessionManager {
  /**
   * Генерирует случайный session ID
   * @deprecated Используйте generateSessionId из lib/utils напрямую
   */
  static generateSessionId(): string {
    return generateSessionIdUtil();
  }

  /**
   * Регистрирует новое устройство пользователя.
   * Layer 2 grouping: при наличии fpid ищет существующее устройство по device_fp_hash
   * (User-Agent + IP prefix + FPID) и обновляет его вместо создания дубликата.
   * @param fpid - опциональный FPID из IndexedDB (Layer 1)
   * @returns Токен устройства (raw)
   */
  static async registerDevice(
    userId: string,
    userAgent: string,
    ipAddress: string,
    fpid?: string | null,
  ): Promise<string> {
    const token = generateSessionIdUtil();
    const tokenHash = computeTokenHash(token);
    const deviceName = this.parseDeviceName(userAgent);
    const now = new Date();

    if (!db) {
      return token;
    }

    if (fpid) {
      const deviceFpHash = computeDeviceFpHash(userAgent, ipAddress, fpid);
      const rows = await db
        .select({ id: userDevices.id })
        .from(userDevices)
        .where(and(eq(userDevices.userId, userId), eq(userDevices.deviceFpHash, deviceFpHash)));
      const existing = rows[0] ?? null;

      if (existing) {
        try {
          await db
            .update(userDevices)
            .set({
              tokenHash,
              lastActive: now,
              ipAddress,
            })
            .where(eq(userDevices.id, existing.id));

          resolveAndStoreLocation(existing.id, ipAddress);
          return token;
        } catch (error) {
          logger.warn('Failed to update device on grouping', {
            error: error instanceof Error ? error.message : String(error),
            userId,
            deviceId: existing.id,
          });
        }
      }

      try {
        const [inserted] = await db
          .insert(userDevices)
          .values({
            userId,
            tokenHash,
            deviceName,
            ipAddress,
            lastActive: now,
            deviceFpHash,
          })
          .returning({ id: userDevices.id });
        if (inserted) resolveAndStoreLocation(inserted.id, ipAddress);
      } catch (error) {
        logger.error('Failed to register device', {
          error: error instanceof Error ? error.message : String(error),
          userId,
        });
      }
      return token;
    }

    // No FPID — try to find existing device by deviceName + IP prefix (same browser+OS on same network)
    try {
      const rows = await db
        .select({ id: userDevices.id })
        .from(userDevices)
        .where(
          and(
            eq(userDevices.userId, userId),
            eq(userDevices.deviceName, deviceName),
            eq(userDevices.ipAddress, ipAddress),
          ),
        );
      const existing = rows[0] ?? null;

      if (existing) {
        await db
          .update(userDevices)
          .set({ tokenHash, lastActive: now })
          .where(eq(userDevices.id, existing.id));
        resolveAndStoreLocation(existing.id, ipAddress);
        return token;
      }

      const [inserted] = await db
        .insert(userDevices)
        .values({
          userId,
          tokenHash,
          deviceName,
          ipAddress,
          lastActive: now,
        })
        .returning({ id: userDevices.id });
      if (inserted) resolveAndStoreLocation(inserted.id, ipAddress);
    } catch (error) {
      logger.error('Failed to register device', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
    }

    return token;
  }

  /**
   * Удаляет устройство по токену
   */
  static async revokeDevice(token: string): Promise<void> {
    if (!db) return;
    const tokenHash = computeTokenHash(token);
    await db.delete(userDevices).where(eq(userDevices.tokenHash, tokenHash));
  }

  /**
   * Удаляет устройство по ID (для UI)
   */
  static async revokeDeviceById(deviceId: string, userId: string): Promise<void> {
    if (!db) return;
    await db
      .delete(userDevices)
      .where(and(eq(userDevices.id, deviceId), eq(userDevices.userId, userId)));
  }

  /**
   * Удаляет все устройства пользователя кроме текущего
   */
  static async revokeOtherDevices(userId: string, currentToken: string): Promise<void> {
    if (!db) return;
    const currentTokenHash = computeTokenHash(currentToken);

    // Удаляем все устройства пользователя, кроме того, чей хеш совпадает с текущим
    await db
      .delete(userDevices)
      .where(and(eq(userDevices.userId, userId), ne(userDevices.tokenHash, currentTokenHash)));
  }

  static parseDeviceName(userAgent: string): string {
    let browser = 'Unknown Browser';

    // Order matters! Check specific browsers before generic ones (Chrome/Safari)
    if (/Edg\//i.test(userAgent) || /Edge\//i.test(userAgent)) {
      browser = 'Edge';
    } else if (/OPR\//i.test(userAgent) || /Opera/i.test(userAgent)) {
      browser = 'Opera';
    } else if (/YaBrowser\//i.test(userAgent)) {
      browser = 'Yandex Browser';
    } else if (/Vivaldi\//i.test(userAgent)) {
      browser = 'Vivaldi';
    } else if (/Brave\//i.test(userAgent)) {
      browser = 'Brave';
    } else if (/Chrome\//i.test(userAgent)) {
      browser = 'Chrome';
    } else if (/Firefox\//i.test(userAgent)) {
      browser = 'Firefox';
    } else if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) {
      browser = 'Safari';
    }

    const osMatch = userAgent.match(/(Windows|Mac|Linux|Android|iOS|iPhone|iPad)/i);
    let os = osMatch ? osMatch[1] : 'Unknown OS';

    // Normalize OS names
    if (os.toLowerCase().startsWith('mac')) os = 'macOS';
    if (os.toLowerCase() === 'iphone' || os.toLowerCase() === 'ipad') os = 'iOS';

    return `${browser} (${os})`;
  }

  static async createSession(
    userId: string,
    username: string,
    ipAddress: string,
    userAgent: string,
    token?: string, // Device token (required for users, optional for admins)
    userType: 'user' | 'admin' = 'user',
  ): Promise<string> {
    const sessionId = this.generateSessionId();
    const now = Date.now();
    const data: SessionData = {
      id: sessionId,
      userId,
      username,
      tokenFingerprint: token ? computeTokenFingerprint(token) : '',
      createdAt: now,
      lastActivity: now,
      ipAddress,
      userAgent,
    };

    const store = getSessionStore();
    await store.set(sessionId, data, SESSION_TIMEOUT);

    // Если это пользователь и есть токен, обновляем last_active в БД
    if (userType === 'user' && token && db) {
      const tokenHash = computeTokenHash(token);
      // Не блокируем создание сессии ожиданием БД
      db.update(userDevices)
        .set({ lastActive: new Date(), ipAddress })
        .where(eq(userDevices.tokenHash, tokenHash))
        .returning({ id: userDevices.id })
        .then((rows) => {
          const device = rows[0];
          if (device) resolveAndStoreLocation(device.id, ipAddress);
        })
        .catch((error) => {
          logger.warn('Failed to update device last_active', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }

    return sessionId;
  }

  static async getSession(sessionId: string): Promise<SessionData | null> {
    const store = getSessionStore();
    return store.get(sessionId);
  }

  static async updateSession(sessionId: string, updates: Partial<SessionData>): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) return false;

    const store = getSessionStore();
    const updated: SessionData = { ...session, ...updates, lastActivity: Date.now() };
    await store.set(sessionId, updated, SESSION_TIMEOUT);
    return true;
  }

  static async destroySession(sessionId: string): Promise<boolean> {
    const store = getSessionStore();
    return store.delete(sessionId);
  }

  static async destroyAllUserSessions(userId: string): Promise<number> {
    const store = getSessionStore();
    return store.deleteByUserId(userId);
  }

  static async setSessionCookie(
    sessionId: string,
    isLocalhost: boolean = false,
    cookieName = 'session_id',
  ): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.set(cookieName, sessionId, {
      maxAge: SESSION_TIMEOUT / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/',
    });
  }

  static async clearSessionCookie(cookieName = 'session_id'): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(cookieName);
  }

  static async validateSession(
    sessionId: string,
    token: string,
    ipAddress: string,
    userAgent: string,
    options: { strictIP?: boolean; updateCookie?: boolean } = {},
  ): Promise<{ valid: boolean; reason?: string }> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return { valid: false, reason: 'Session not found or expired' };
    }

    // Token binding: если session имеет fingerprint, token должен совпадать (user sessions)
    if (session.tokenFingerprint) {
      if (!token) return { valid: false, reason: 'Token required' };
      const expectedFingerprint = computeTokenFingerprint(token);
      if (session.tokenFingerprint !== expectedFingerprint) {
        return { valid: false, reason: 'Token mismatch' };
      }
    }

    // Смягченная валидация User-Agent - проверяем только основную часть
    const normalizeUserAgent = (ua: string): string => {
      const browserMatch = ua.match(
        /(Chrome|Firefox|Safari|Edge|Opera|Brave|Vivaldi|YandexBrowser|YaBrowser)/i,
      );
      const osMatch = ua.match(/(Windows|Mac|Linux|Android|iOS|iPhone|iPad)/i);
      const browser = browserMatch ? browserMatch[1].toLowerCase() : 'unknown';
      const os = osMatch ? osMatch[1].toLowerCase() : 'unknown';
      return `${browser}:${os}`;
    };

    const sessionUANormalized = normalizeUserAgent(session.userAgent);
    const requestUANormalized = normalizeUserAgent(userAgent);

    if (sessionUANormalized !== requestUANormalized) {
      logger.warn('User-Agent mismatch detected', {
        sessionId: sessionId.substring(0, 8) + '...',
        sessionUA: session.userAgent.substring(0, 50),
        requestUA: userAgent.substring(0, 50),
        sessionNormalized: sessionUANormalized,
        requestNormalized: requestUANormalized,
      });
      await this.updateSession(sessionId, { userAgent });
    }

    // IP validation - flexible by default, strict if requested
    if (options.strictIP) {
      if (session.ipAddress !== ipAddress) {
        await this.destroySession(sessionId);
        return { valid: false, reason: 'IP address mismatch' };
      }
    } else {
      const normalizeIP = (ip: string): string => {
        if (ip.includes('.')) {
          const parts = ip.split('.');
          if (parts.length >= 3) return parts.slice(0, 3).join('.');
        }
        if (ip.includes(':')) {
          const parts = ip.split(':');
          if (parts.length >= 4) return parts.slice(0, 4).join(':');
        }
        return ip;
      };

      const sessionIPPrefix = normalizeIP(session.ipAddress);
      const requestIPPrefix = normalizeIP(ipAddress);

      if (sessionIPPrefix !== requestIPPrefix) {
        return { valid: true, reason: 'IP prefix mismatch (logged)' };
      }
    }

    return { valid: true };
  }

  /**
   * Обновить cookie сессии (продлить время жизни)
   */
  static async refreshSessionCookie(
    sessionId: string,
    isLocalhost: boolean = false,
    cookieName = 'session_id',
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;
    await this.setSessionCookie(sessionId, isLocalhost, cookieName);
  }
}
