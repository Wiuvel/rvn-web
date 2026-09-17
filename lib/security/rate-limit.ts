interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
    immuneUntil?: number; // Время до которого пользователь имеет иммунитет
  };
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import { RATE_LIMIT_CLEANUP_INTERVAL, RATE_LIMIT_IMMUNITY_DURATION } from '../utils/constants';
import { getClientIP } from '../validation/ip-validator';
import { getEnv } from '../validation/env-validation';

function getImmunitySecret(): string {
  try {
    return getEnv().CSRF_SECRET;
  } catch {
    if (process.env.NODE_ENV !== 'production') {
      return process.env.CSRF_SECRET || 'dev-rate-limit-immunity-secret-32-chars';
    }
    throw new Error('CSRF_SECRET must be configured in production for rate limit immunity');
  }
}

/**
 * Creates HMAC-signed immunity cookie: timestamp.signature
 */
export function createImmunityCookie(expiryTimestamp: number): string {
  const data = expiryTimestamp.toString();
  const signature = createHmac('sha256', getImmunitySecret()).update(data).digest('base64url');
  return `${data}.${signature}`;
}

/**
 * Verifies and parses HMAC-signed immunity cookie.
 * Returns valid expiry timestamp or null if invalid/tampered/expired.
 */
export function parseImmunityCookie(cookieValue: string | undefined): number | null {
  if (!cookieValue || typeof cookieValue !== 'string') return null;

  const dotIdx = cookieValue.lastIndexOf('.');
  if (dotIdx === -1) return null;

  const data = cookieValue.slice(0, dotIdx);
  const signature = cookieValue.slice(dotIdx + 1);

  const expiry = parseInt(data, 10);
  if (isNaN(expiry) || expiry <= Date.now()) return null;

  try {
    const expectedSignature = createHmac('sha256', getImmunitySecret())
      .update(data)
      .digest('base64url');

    const sigBuf = Buffer.from(signature, 'base64url');
    const expBuf = Buffer.from(expectedSignature, 'base64url');

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    return expiry;
  } catch {
    return null;
  }
}

const store: RateLimitStore = {};

// Оптимизированная структура для отслеживания времени истечения
const expirationTimes = new Map<string, number>();

let cleanupInterval: NodeJS.Timeout | null = null;

export function startRateLimiterCleanup(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    const keysToDelete: string[] = [];

    expirationTimes.forEach((expirationTime, key) => {
      if (expirationTime < now) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => {
      delete store[key];
      expirationTimes.delete(key);
    });
  }, RATE_LIMIT_CLEANUP_INTERVAL);

  if (typeof cleanupInterval.unref === 'function') {
    cleanupInterval.unref();
  }
}

export function stopRateLimiterCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// Auto-start cleanup outside tests
if (process.env.NODE_ENV !== 'test') {
  startRateLimiterCleanup();
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (request: Request) => string;
}

export class RateLimiter {
  private options: RateLimitOptions;

  constructor(options: RateLimitOptions) {
    this.options = options;
  }

  private getKey(request: Request): string {
    if (this.options.keyGenerator) {
      return this.options.keyGenerator(request);
    }

    // Используем валидированную функцию для получения IP
    return getClientIP(request);
  }

  async check(request: Request): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    // Очистка выполняется периодически через setInterval, не нужно делать на каждый запрос

    const key = this.getKey(request);
    const now = Date.now();
    const windowStart = now - this.options.windowMs;

    // Проверяем иммунитет ПЕРВЫМ делом - если пользователь имеет иммунитет, пропускаем все проверки
    // Это критично для правильной работы иммунитета после CAPTCHA
    // Также проверяем иммунитет через cookie для надежности
    const cookieHeader = request.headers.get('cookie') || '';
    const immunityCookie = cookieHeader
      .split(';')
      .find((c) => c.trim().startsWith('rate_limit_immunity='));
    if (immunityCookie) {
      const rawVal = immunityCookie.split('=')[1]?.trim();
      const immunityTimestamp = parseImmunityCookie(rawVal);
      if (immunityTimestamp && immunityTimestamp > now) {
        // Иммунитет активен через криптографически подписанную cookie - пропускаем проверки
        return {
          allowed: true,
          remaining: this.options.maxRequests,
          resetTime: immunityTimestamp,
        };
      }
    }

    if (store[key]?.immuneUntil && store[key].immuneUntil > now) {
      return {
        allowed: true,
        remaining: this.options.maxRequests,
        resetTime: store[key].resetTime || now + this.options.windowMs,
      };
    }

    // Если иммунитет истек, удаляем его
    if (store[key]?.immuneUntil && store[key].immuneUntil <= now) {
      delete store[key].immuneUntil;
    }

    if (!store[key] || store[key].resetTime < windowStart) {
      const resetTime = now + this.options.windowMs;
      store[key] = {
        count: 1,
        resetTime,
      };
      expirationTimes.set(key, resetTime);

      return {
        allowed: true,
        remaining: this.options.maxRequests - 1,
        resetTime,
      };
    }

    if (store[key].count >= this.options.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: store[key].resetTime,
      };
    }

    store[key].count++;

    return {
      allowed: true,
      remaining: this.options.maxRequests - store[key].count,
      resetTime: store[key].resetTime,
    };
  }

  /**
   * Проверка rate limit с кастомным ключом (например, user_id)
   * Полезно для специфичных rate limiters, где нужна более точная идентификация
   */
  async checkWithKey(customKey: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;

    if (!store[customKey] || store[customKey].resetTime < windowStart) {
      const resetTime = now + this.options.windowMs;
      store[customKey] = {
        count: 1,
        resetTime,
      };
      expirationTimes.set(customKey, resetTime);

      return {
        allowed: true,
        remaining: this.options.maxRequests - 1,
        resetTime,
      };
    }

    if (store[customKey].count >= this.options.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: store[customKey].resetTime,
      };
    }

    store[customKey].count++;

    return {
      allowed: true,
      remaining: this.options.maxRequests - store[customKey].count,
      resetTime: store[customKey].resetTime,
    };
  }

  async clear(request: Request): Promise<boolean> {
    const key = this.getKey(request);
    if (store[key]) {
      delete store[key];
      expirationTimes.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Устанавливает временный иммунитет от rate limiting после прохождения капчи
   * @param request - Request объект
   * @param immunityDurationMs - Длительность иммунитета в миллисекундах (по умолчанию из константы)
   * @returns Время истечения иммунитета для синхронизации с cookie
   */
  async grantImmunity(
    request: Request,
    immunityDurationMs: number = RATE_LIMIT_IMMUNITY_DURATION,
  ): Promise<number> {
    const key = this.getKey(request);
    const now = Date.now();
    const immuneUntil = now + immunityDurationMs;

    // Очищаем rate limit и устанавливаем иммунитет
    // ВАЖНО: всегда создаем/обновляем запись, чтобы иммунитет точно применился
    // Используем синхронную операцию для гарантии применения
    store[key] = {
      count: 0, // Сбрасываем счетчик
      resetTime: immuneUntil, // Устанавливаем resetTime на время иммунитета
      immuneUntil: immuneUntil, // Устанавливаем иммунитет
    };
    expirationTimes.set(key, immuneUntil);

    // Возвращаем время истечения для синхронизации с cookie
    return immuneUntil;
  }

  static clearAll(): void {
    Object.keys(store).forEach((key) => {
      delete store[key];
    });
    expirationTimes.clear();
  }

  /**
   * Очищает интервал очистки (для тестирования или graceful shutdown)
   */
  static cleanup(): void {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
  }
}

export const authRateLimit = new RateLimiter({
  windowMs: 5 * 60 * 1000, // 5 минут
  maxRequests: 10, // 10 запросов
  keyGenerator: (request) => {
    const ip = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || '';
    return `${ip}-${userAgent.slice(0, 50)}`;
  },
});

export const generalRateLimit = new RateLimiter({
  windowMs: 5 * 60 * 1000, // 5 минут
  maxRequests: 100, // 100 запросов
});

// Специфичный rate limiter для отправки сообщений
// 50 сообщений за 5 минут - достаточно для активных саппортов, но защищает от спама
// Использует IP по умолчанию, но можно передать user_id через checkWithUserId
export const messageRateLimit = new RateLimiter({
  windowMs: 5 * 60 * 1000, // 5 минут
  maxRequests: 50, // 50 сообщений за 5 минут
});
