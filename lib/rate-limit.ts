interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
    immuneUntil?: number; // Время до которого пользователь имеет иммунитет
  };
}

import { RATE_LIMIT_CLEANUP_INTERVAL, RATE_LIMIT_IMMUNITY_DURATION } from './constants';

const store: RateLimitStore = {};

// Периодическая очистка устаревших записей
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach(key => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, RATE_LIMIT_CLEANUP_INTERVAL);

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
    
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
    return ip;
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
    const immunityCookie = cookieHeader.split(';').find(c => c.trim().startsWith('rate_limit_immunity='));
    if (immunityCookie) {
      const immunityTimestamp = parseInt(immunityCookie.split('=')[1], 10);
      if (!isNaN(immunityTimestamp) && immunityTimestamp > now) {
        // Иммунитет активен через cookie - пропускаем все проверки
        return {
          allowed: true,
          remaining: this.options.maxRequests,
          resetTime: immunityTimestamp
        };
      }
    }
    
    if (store[key]?.immuneUntil && store[key].immuneUntil > now) {
      return {
        allowed: true,
        remaining: this.options.maxRequests,
        resetTime: store[key].resetTime || (now + this.options.windowMs)
      };
    }
    
    // Если иммунитет истек, удаляем его
    if (store[key]?.immuneUntil && store[key].immuneUntil <= now) {
      delete store[key].immuneUntil;
    }
    
    if (!store[key] || store[key].resetTime < windowStart) {
      store[key] = {
        count: 1,
        resetTime: now + this.options.windowMs
      };
      
      return {
        allowed: true,
        remaining: this.options.maxRequests - 1,
        resetTime: store[key].resetTime
      };
    }
    
    if (store[key].count >= this.options.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: store[key].resetTime
      };
    }
    
    store[key].count++;
    
    return {
      allowed: true,
      remaining: this.options.maxRequests - store[key].count,
      resetTime: store[key].resetTime
    };
  }

  async clear(request: Request): Promise<boolean> {
    const key = this.getKey(request);
    if (store[key]) {
      delete store[key];
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
  async grantImmunity(request: Request, immunityDurationMs: number = RATE_LIMIT_IMMUNITY_DURATION): Promise<number> {
    const key = this.getKey(request);
    const now = Date.now();
    const immuneUntil = now + immunityDurationMs;
    
    // Очищаем rate limit и устанавливаем иммунитет
    // ВАЖНО: всегда создаем/обновляем запись, чтобы иммунитет точно применился
    // Используем синхронную операцию для гарантии применения
    store[key] = {
      count: 0, // Сбрасываем счетчик
      resetTime: immuneUntil, // Устанавливаем resetTime на время иммунитета
      immuneUntil: immuneUntil // Устанавливаем иммунитет
    };
    
    // Возвращаем время истечения для синхронизации с cookie
    return immuneUntil;
  }

  static clearAll(): void {
    Object.keys(store).forEach(key => {
      delete store[key];
    });
  }
}

export const authRateLimit = new RateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 5,
  keyGenerator: (request) => {
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
    const userAgent = request.headers.get('user-agent') || '';
    return `${ip}-${userAgent.slice(0, 50)}`;
  }
});

export const generalRateLimit = new RateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 100,
});
