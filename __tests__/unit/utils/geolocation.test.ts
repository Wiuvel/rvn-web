import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('@/lib/utils/secure-logger', () => ({
  logger: {
    info: vi.fn<() => void>(),
    warn: vi.fn<() => void>(),
    error: vi.fn<() => void>(),
    debug: vi.fn<() => void>(),
  },
}));

vi.mock('@/lib/database/db', () => ({ db: null }));
vi.mock('@/lib/database/schema', () => ({ userDevices: {} }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn<() => void>() }));

import {
  lookupIP,
  resolveAndStoreLocation,
  _isPrivateIP,
  _formatLocation,
  _cache,
  _cacheSet,
} from '@/lib/auth/geolocation';

describe('geolocation', () => {
  beforeEach(() => {
    _cache.clear();
  });

  describe('_isPrivateIP', () => {
    it.each([
      '127.0.0.1',
      '127.1.2.3',
      '10.0.0.1',
      '10.255.255.255',
      '192.168.0.1',
      '192.168.100.50',
      '172.16.0.1',
      '172.31.255.255',
      '::1',
      'unknown',
      '',
      'fc00::1',
      'fd12::1',
    ])('returns true for private IP %s', (ip) => {
      expect(_isPrivateIP(ip)).toBe(true);
    });

    it.each(['8.8.8.8', '1.1.1.1', '203.0.113.1', '172.15.0.1', '172.32.0.1'])(
      'returns false for public IP %s',
      (ip) => {
        expect(_isPrivateIP(ip)).toBe(false);
      },
    );
  });

  describe('_formatLocation', () => {
    it('formats city and country', () => {
      expect(_formatLocation('Moscow', 'Russia')).toBe('Moscow, Russia');
    });

    it('returns country only when no city', () => {
      expect(_formatLocation(undefined, 'Germany')).toBe('Germany');
    });

    it('returns null when no data', () => {
      expect(_formatLocation(undefined, undefined)).toBeNull();
    });

    it('returns null for empty strings', () => {
      expect(_formatLocation('', '')).toBeNull();
    });
  });

  describe('lookupIP', () => {
    it('returns null for private IPs', async () => {
      expect(await lookupIP('127.0.0.1')).toBeNull();
      expect(await lookupIP('10.0.0.1')).toBeNull();
      expect(await lookupIP('192.168.1.1')).toBeNull();
      expect(await lookupIP('::1')).toBeNull();
    });

    it('returns cached value on second call', async () => {
      _cacheSet('8.8.8.8', 'Mountain View, United States');
      const result = await lookupIP('8.8.8.8');
      expect(result).toBe('Mountain View, United States');
    });

    it('returns cached null', async () => {
      _cacheSet('1.2.3.4', null);
      const result = await lookupIP('1.2.3.4');
      expect(result).toBeNull();
    });
  });

  describe('resolveAndStoreLocation', () => {
    it('does not throw when db is null', () => {
      expect(() => resolveAndStoreLocation('device-id', '8.8.8.8')).not.toThrow();
    });

    it('does not throw with empty IP', () => {
      expect(() => resolveAndStoreLocation('device-id', '')).not.toThrow();
    });
  });
});
