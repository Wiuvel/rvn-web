import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isSubdomain, isValidOrigin, generateCSPHeader } from '@/lib/security/headers';

describe('isSubdomain', () => {
  it('считает основной домен поддоменом', () => {
    expect(isSubdomain('rvn.market')).toBe(true);
  });
  it('считает реальные поддомены', () => {
    expect(isSubdomain('api.rvn.market')).toBe(true);
  });
  it('отклоняет другие домены', () => {
    expect(isSubdomain('example.com')).toBe(false);
  });
  it('отклоняет пустую строку', () => {
    expect(isSubdomain('')).toBe(false);
  });
});

describe('isValidOrigin', () => {
  it('принимает origin основного домена', () => {
    expect(isValidOrigin('https://rvn.market')).toBe(true);
  });
  it('принимает поддомен', () => {
    expect(isValidOrigin('https://api.rvn.market:8443')).toBe(true);
  });
  it('отклоняет чужой origin', () => {
    expect(isValidOrigin('https://example.com')).toBe(false);
  });
  it('отклоняет origin с подделкой через query/path (4.4 fix)', () => {
    expect(isValidOrigin('https://attacker.com/?fake=rvn.market')).toBe(false);
    expect(isValidOrigin('https://attacker.com/rvn.market')).toBe(false);
    expect(isValidOrigin('https://rvn.market.attacker.com')).toBe(false);
  });
  it('отклоняет невалидную строку', () => {
    expect(isValidOrigin('not a url')).toBe(false);
    expect(isValidOrigin('')).toBe(false);
  });
});

describe('generateCSPHeader (production)', () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    delete process.env.S3_ENDPOINT;
    delete process.env.NEXT_PUBLIC_WS_URL;
  });
  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('генерирует CSP строку с default-src и self', () => {
    const csp = generateCSPHeader(false);
    expect(typeof csp).toBe('string');
    expect(csp).toContain('default-src');
    expect(csp).toContain("'self'");
  });

  it('включает upgrade-insecure-requests в production', () => {
    const csp = generateCSPHeader(false);
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('не включает unsafe-eval в production (4.3)', () => {
    const csp = generateCSPHeader(false);
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('не использует * wildcard в connect-src и img-src (4.3)', () => {
    const csp = generateCSPHeader(false);
    const connect = csp.match(/connect-src[^;]*;/)?.[0] ?? '';
    const img = csp.match(/img-src[^;]*;/)?.[0] ?? '';
    // Должно не быть голого пробельного `*` в этих директивах.
    expect(connect).not.toMatch(/\s\*\b/);
    expect(img).not.toMatch(/\s\*\b/);
  });

  it('включает Cloudflare Turnstile и обязательные директивы', () => {
    const csp = generateCSPHeader(false);
    expect(csp).toContain('challenges.cloudflare.com');
    expect(csp).toContain('script-src');
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it('добавляет S3_ENDPOINT origin в connect-src и img-src когда задан', () => {
    process.env.S3_ENDPOINT = 'https://s3.example.com';
    const csp = generateCSPHeader(false);
    expect(csp).toContain('connect-src');
    expect(csp).toMatch(/connect-src[^;]*https:\/\/s3\.example\.com/);
    expect(csp).toMatch(/img-src[^;]*https:\/\/s3\.example\.com/);
  });

  it('добавляет WS http и wss origin в connect-src когда NEXT_PUBLIC_WS_URL задан', () => {
    process.env.NEXT_PUBLIC_WS_URL = 'https://ws.example.com';
    const csp = generateCSPHeader(false);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/ws\.example\.com/);
    expect(csp).toMatch(/connect-src[^;]*wss:\/\/ws\.example\.com/);
  });

  it('CSP корректен и без env (пустой fallback)', () => {
    const csp = generateCSPHeader(false);
    expect(csp).toContain('connect-src');
    expect(csp).toContain('img-src');
    // Нет двойных пробелов / ломаной конкатенации.
    expect(csp).not.toMatch(/\s{2,}/);
  });
});

describe('generateCSPHeader (development)', () => {
  it('включает unsafe-eval в dev (Turbopack/HMR)', () => {
    const csp = generateCSPHeader(true);
    expect(csp).toContain("'unsafe-eval'");
  });
  it('не включает upgrade-insecure-requests в dev', () => {
    const csp = generateCSPHeader(true);
    expect(csp).not.toContain('upgrade-insecure-requests');
  });
  it('включает localhost в dev', () => {
    const csp = generateCSPHeader(true);
    expect(csp).toContain('localhost');
    expect(csp).toContain('ws://localhost');
  });
});
