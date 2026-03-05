import { describe, it, expect } from 'vitest';
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
  it('принимает origin с основным доменом', () => {
    expect(isValidOrigin('https://rvn.market')).toBe(true);
  });
  it('отклоняет чужой origin', () => {
    expect(isValidOrigin('https://example.com')).toBe(false);
  });
});

describe('generateCSPHeader', () => {
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
  it('не включает upgrade-insecure-requests в dev', () => {
    const csp = generateCSPHeader(true);
    expect(csp).not.toContain('upgrade-insecure-requests');
  });
  it('включает localhost в dev', () => {
    const csp = generateCSPHeader(true);
    expect(csp).toContain('localhost');
  });
  it('включает Cloudflare Turnstile и обязательные директивы', () => {
    const csp = generateCSPHeader(false);
    expect(csp).toContain('challenges.cloudflare.com');
    expect(csp).toContain('script-src');
    expect(csp).toContain("object-src 'none'");
  });
});
