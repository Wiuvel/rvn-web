import { describe, it, expect } from 'vitest';
import { domains, appConfig } from '@/lib/utils/config';

describe('domains', () => {
  it('exposes a main host (no protocol)', () => {
    expect(domains.main).toBeTruthy();
    expect(domains.main).not.toMatch(/^https?:\/\//);
  });

  it('exposes a fully-qualified mainUrl', () => {
    expect(domains.mainUrl).toMatch(/^https?:\/\//);
  });

  it('main and mainUrl agree on the host portion', () => {
    const url = new URL(domains.mainUrl);
    expect(url.host).toBe(domains.main);
  });
});

describe('appConfig invariants', () => {
  describe('rate limiting', () => {
    it('auth and general windows are positive', () => {
      expect(appConfig.rateLimit.auth.windowMs).toBeGreaterThan(0);
      expect(appConfig.rateLimit.general.windowMs).toBeGreaterThan(0);
    });

    it('auth limit is stricter than general limit', () => {
      expect(appConfig.rateLimit.auth.maxRequests).toBeLessThan(
        appConfig.rateLimit.general.maxRequests,
      );
    });

    it('immunity duration is at least one auth window', () => {
      expect(appConfig.rateLimit.immunityDuration).toBeGreaterThanOrEqual(
        appConfig.rateLimit.auth.windowMs,
      );
    });
  });

  describe('session and CSRF', () => {
    it('session timeout is positive', () => {
      expect(appConfig.session.timeout).toBeGreaterThan(0);
    });

    it('session cleanup interval is shorter than the session lifetime', () => {
      expect(appConfig.session.cleanupInterval).toBeLessThan(appConfig.session.timeout);
    });

    it('CSRF token lifetime is positive and matches session expectations', () => {
      expect(appConfig.csrf.tokenLifetime).toBeGreaterThan(0);
    });
  });

  describe('cookies', () => {
    it('token cookie maxAge is in seconds (not milliseconds)', () => {
      // Sanity check: 1 year ≈ 31_536_000s. A ms value would be 1000x bigger.
      expect(appConfig.token.maxAge).toBeLessThan(10 * 365 * 24 * 60 * 60 * 1000);
      expect(appConfig.token.maxAge).toBeGreaterThan(60 * 60 * 24);
    });

    it('userData maxAge (s) and ttlMs (ms) are consistent', () => {
      expect(appConfig.userData.ttlMs).toBe(appConfig.userData.maxAge * 1000);
    });
  });

  describe('character & file limits', () => {
    it('ticket subject limit is shorter than message limit', () => {
      expect(appConfig.limits.ticketSubjectMaxLength).toBeLessThan(
        appConfig.limits.messageMaxLength,
      );
    });

    it('media maxBytes are sane (>= 1 MB)', () => {
      expect(appConfig.media.avatarMaxBytes).toBeGreaterThanOrEqual(1024 * 1024);
      expect(appConfig.media.bannerMaxBytes).toBeGreaterThanOrEqual(1024 * 1024);
    });

    it('support attachment limit matches the human-readable Mb value', () => {
      expect(appConfig.support.attachmentMaxBytes).toBe(
        appConfig.support.attachmentMaxMb * 1024 * 1024,
      );
    });
  });

  describe('animations & scroll trigger', () => {
    it('default GSAP duration and stagger are positive', () => {
      expect(appConfig.animations.defaultDuration).toBeGreaterThan(0);
      expect(appConfig.animations.staggerDelay).toBeGreaterThan(0);
    });

    it('scroll trigger uses recognizable position keywords', () => {
      expect(appConfig.scrollTrigger.start).toMatch(/top|center|bottom/);
      expect(appConfig.scrollTrigger.end).toMatch(/top|center|bottom/);
    });
  });

  describe('cache-control headers', () => {
    it('public images are immutable and have a long max-age', () => {
      expect(appConfig.cacheControl.imagesPublic).toContain('public');
      expect(appConfig.cacheControl.imagesPublic).toContain('immutable');
      expect(appConfig.cacheControl.imagesPublic).toMatch(/max-age=\d+/);
    });

    it('support files are private (not cached by intermediaries)', () => {
      expect(appConfig.cacheControl.supportFiles).toContain('private');
      expect(appConfig.cacheControl.supportFiles).not.toContain('public');
    });
  });
});
