import { describe, it, expect } from 'vitest';
import {
  isAllowedBot,
  detectSuspiciousVisitor,
  shouldShowProtection,
} from '@/lib/security/suspicious-detector';

const makeRequest = (overrides: Partial<Parameters<typeof detectSuspiciousVisitor>[0]> = {}) => ({
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  ip: '192.168.1.1',
  headers: {
    accept: 'text/html,application/xhtml+xml',
    'accept-language': 'en-US',
    'accept-encoding': 'gzip, deflate, br',
  } as Record<string, string | null>,
  pathname: '/',
  referer: null,
  acceptLanguage: 'en-US',
  ...overrides,
});

describe('isAllowedBot', () => {
  it('разрешает Googlebot и YandexBot', () => {
    expect(isAllowedBot('Googlebot/2.1 (+http://www.google.com/bot.html)')).toBe(true);
    expect(isAllowedBot('Mozilla/5.0 (compatible; YandexBot/3.0)')).toBe(true);
  });
  it('не разрешает обычный браузер и пустой UA', () => {
    expect(isAllowedBot('Mozilla/5.0 Chrome/120.0.0.0')).toBe(false);
    expect(isAllowedBot('')).toBe(false);
  });
});

describe('detectSuspiciousVisitor', () => {
  it('score 0 для нормального браузера', () => {
    const result = detectSuspiciousVisitor(makeRequest());
    expect(result.score).toBe(0);
    expect(result.suspiciousUserAgent).toBe(false);
  });
  it('высокий score для curl', () => {
    const result = detectSuspiciousVisitor(makeRequest({ userAgent: 'curl/7.68.0' }));
    expect(result.suspiciousUserAgent).toBe(true);
    expect(result.botPattern).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(55);
  });
  it('обнаруживает отсутствующие заголовки', () => {
    const result = detectSuspiciousVisitor(
      makeRequest({
        headers: { accept: null, 'accept-language': null, 'accept-encoding': null },
      }),
    );
    expect(result.missingHeaders).toBe(true);
  });
  it('не считает Googlebot подозрительным', () => {
    const result = detectSuspiciousVisitor(
      makeRequest({ userAgent: 'Googlebot/2.1 (+http://www.google.com/bot.html)' }),
    );
    expect(result.botPattern).toBe(false);
  });
});

describe('shouldShowProtection', () => {
  it('не показывает защиту при валидной куке или нормальном браузере', () => {
    expect(shouldShowProtection(makeRequest(), true)).toBe(false);
    expect(shouldShowProtection(makeRequest(), false)).toBe(false);
  });
  it('показывает защиту для подозрительного запроса', () => {
    const result = shouldShowProtection(
      makeRequest({
        userAgent: 'curl/7.68.0',
        headers: { accept: null, 'accept-language': null, 'accept-encoding': null },
      }),
      false,
    );
    expect(result).toBe(true);
  });
});
