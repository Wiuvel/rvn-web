import { describe, it, expect } from 'vitest';
import { isValidIP, getClientIP } from '@/lib/validation/ip-validator';

describe('isValidIP', () => {
  describe('IPv4', () => {
    it('accepts canonical addresses', () => {
      expect(isValidIP('1.1.1.1')).toBe(true);
      expect(isValidIP('192.168.0.1')).toBe(true);
      expect(isValidIP('255.255.255.255')).toBe(true);
      expect(isValidIP('0.0.0.0')).toBe(true);
    });

    it('rejects out-of-range octets', () => {
      expect(isValidIP('256.0.0.0')).toBe(false);
      expect(isValidIP('1.2.3.999')).toBe(false);
    });

    it('rejects malformed addresses', () => {
      expect(isValidIP('1.2.3')).toBe(false);
      expect(isValidIP('1.2.3.4.5')).toBe(false);
      expect(isValidIP('1.2.3.')).toBe(false);
      expect(isValidIP('a.b.c.d')).toBe(false);
    });
  });

  describe('IPv6', () => {
    it('accepts full and compressed forms', () => {
      expect(isValidIP('::1')).toBe(true);
      expect(isValidIP('2001:db8::1')).toBe(true);
      expect(isValidIP('fe80::1')).toBe(true);
      expect(isValidIP('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
    });

    it('rejects clearly malformed strings', () => {
      expect(isValidIP('not-an-ip')).toBe(false);
      expect(isValidIP('xyz::1234')).toBe(false);
    });
  });

  describe('input validation', () => {
    it('rejects empty / non-string input', () => {
      expect(isValidIP('')).toBe(false);
      expect(isValidIP(null as unknown as string)).toBe(false);
      expect(isValidIP(undefined as unknown as string)).toBe(false);
      expect(isValidIP(123 as unknown as string)).toBe(false);
    });
  });
});

describe('getClientIP', () => {
  function makeRequest(headers: Record<string, string>): Request {
    return new Request('https://rvn.market/', { headers });
  }

  it('prefers cf-connecting-ip over other headers', () => {
    const req = makeRequest({
      'cf-connecting-ip': '1.1.1.1',
      'x-real-ip': '2.2.2.2',
      'x-forwarded-for': '3.3.3.3',
    });
    expect(getClientIP(req)).toBe('1.1.1.1');
  });

  it('falls back to x-real-ip when cf-connecting-ip is missing', () => {
    const req = makeRequest({ 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '3.3.3.3' });
    expect(getClientIP(req)).toBe('2.2.2.2');
  });

  it('falls back to the first IP in x-forwarded-for', () => {
    const req = makeRequest({ 'x-forwarded-for': '4.4.4.4, 5.5.5.5, 6.6.6.6' });
    expect(getClientIP(req)).toBe('4.4.4.4');
  });

  it('trims whitespace around forwarded IPs', () => {
    const req = makeRequest({ 'x-forwarded-for': '   7.7.7.7  ,  8.8.8.8' });
    expect(getClientIP(req)).toBe('7.7.7.7');
  });

  it('skips invalid header values and falls through', () => {
    const req = makeRequest({
      'cf-connecting-ip': 'not-an-ip',
      'x-real-ip': 'still-not-an-ip',
      'x-forwarded-for': '9.9.9.9',
    });
    expect(getClientIP(req)).toBe('9.9.9.9');
  });

  it('returns "unknown" when no header yields a valid IP', () => {
    const req = makeRequest({ 'x-forwarded-for': 'bogus, also-bogus' });
    expect(getClientIP(req)).toBe('unknown');
  });

  it('returns "unknown" when no IP-related headers are present', () => {
    const req = makeRequest({});
    expect(getClientIP(req)).toBe('unknown');
  });

  it('does not trust a malicious cf-connecting-ip without a Cloudflare presence — value is taken at face value (documented behavior)', () => {
    // This documents current behavior: callers must ensure the request actually
    // came through Cloudflare (e.g. via proxy/firewall) before relying on this header.
    const req = makeRequest({ 'cf-connecting-ip': '1.2.3.4' });
    expect(getClientIP(req)).toBe('1.2.3.4');
  });
});
