import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  RateLimiter,
  createImmunityCookie,
  parseImmunityCookie,
  startRateLimiterCleanup,
  stopRateLimiterCleanup,
} from '@/lib/security/rate-limit';

describe('Rate Limit Immunity & Tampering Protection', () => {
  beforeEach(() => {
    RateLimiter.clearAll();
  });

  afterEach(() => {
    stopRateLimiterCleanup();
  });

  it('rejects plain unsigned cookie value (prevents trivial bypass)', () => {
    const maliciousCookie = '9999999999999';
    const parsed = parseImmunityCookie(maliciousCookie);
    expect(parsed).toBeNull();
  });

  it('rejects tampered signature', () => {
    const validExpiry = Date.now() + 600_000;
    const signedCookie = createImmunityCookie(validExpiry);
    const parts = signedCookie.split('.');
    const tamperedCookie = `${parts[0]}.forgedsignature123`;

    const parsed = parseImmunityCookie(tamperedCookie);
    expect(parsed).toBeNull();
  });

  it('parses valid HMAC-signed immunity cookie correctly', () => {
    const validExpiry = Date.now() + 600_000;
    const signedCookie = createImmunityCookie(validExpiry);

    const parsed = parseImmunityCookie(signedCookie);
    expect(parsed).toBe(validExpiry);
  });

  it('rejects expired immunity cookie even if signature is valid', () => {
    const pastExpiry = Date.now() - 1000;
    const signedCookie = createImmunityCookie(pastExpiry);

    const parsed = parseImmunityCookie(signedCookie);
    expect(parsed).toBeNull();
  });

  it('allows requests when signed immunity is present in request header', async () => {
    const limiter = new RateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
    });

    const validExpiry = Date.now() + 600_000;
    const signedCookie = createImmunityCookie(validExpiry);

    const reqWithImmunity = new Request('https://rvn.market/api/test', {
      headers: {
        'cf-connecting-ip': '198.51.100.1',
        cookie: `rate_limit_immunity=${signedCookie}`,
      },
    });

    // Make 5 requests (exceeding maxRequests of 2)
    for (let i = 0; i < 5; i++) {
      const res = await limiter.check(reqWithImmunity);
      expect(res.allowed).toBe(true);
    }
  });

  it('blocks requests when unsigned forged cookie is supplied', async () => {
    const limiter = new RateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
    });

    const reqWithForgedCookie = new Request('https://rvn.market/api/test', {
      headers: {
        'cf-connecting-ip': '198.51.100.2',
        cookie: 'rate_limit_immunity=9999999999999',
      },
    });

    // 1st request: allowed
    const r1 = await limiter.check(reqWithForgedCookie);
    expect(r1.allowed).toBe(true);

    // 2nd request: allowed
    const r2 = await limiter.check(reqWithForgedCookie);
    expect(r2.allowed).toBe(true);

    // 3rd request: MUST be blocked (forged cookie ignored)
    const r3 = await limiter.check(reqWithForgedCookie);
    expect(r3.allowed).toBe(false);
  });

  it('starts and stops cleanup without crashing or hanging', () => {
    expect(() => {
      startRateLimiterCleanup();
      startRateLimiterCleanup(); // idempotent
      stopRateLimiterCleanup();
      stopRateLimiterCleanup(); // idempotent
    }).not.toThrow();
  });
});
