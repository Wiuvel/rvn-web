import { redisManager } from './redis';
import { logger } from './secure-logger';

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
    try {
      const key = this.getKey(request);
      const redisKey = `rate_limit:${key}`;
      const windowSeconds = Math.floor(this.options.windowMs / 1000);
      
      // Use Redis INCR with TTL for atomic operations
      const count = await redisManager.incr(redisKey, windowSeconds);
      
      if (count === 1) {
        // First request in window, set TTL
        await redisManager.expire(redisKey, windowSeconds);
      }
      
      const remaining = Math.max(0, this.options.maxRequests - count);
      const resetTime = Date.now() + this.options.windowMs;
      
      if (count > this.options.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetTime
        };
      }
      
      return {
        allowed: true,
        remaining,
        resetTime
      };
    } catch (error) {
      logger.error('Rate limiting error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Fail open - allow request if Redis is down
      return {
        allowed: true,
        remaining: this.options.maxRequests - 1,
        resetTime: Date.now() + this.options.windowMs
      };
    }
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
