interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach(key => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 5 * 60 * 1000);

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

  private cleanup(): void {
    const now = Date.now();
    Object.keys(store).forEach(key => {
      if (store[key].resetTime < now) {
        delete store[key];
      }
    });
  }

  async check(request: Request): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    this.cleanup();
    
    const key = this.getKey(request);
    const now = Date.now();
    const windowStart = now - this.options.windowMs;
    
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
