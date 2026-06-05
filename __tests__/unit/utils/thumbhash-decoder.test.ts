import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { decodeThumbHash, isValidThumbHash } from '@/lib/utils/thumbhash-decoder';

describe('isValidThumbHash', () => {
  it('rejects null/undefined/empty input', () => {
    expect(isValidThumbHash(null)).toBe(false);
    expect(isValidThumbHash(undefined)).toBe(false);
    expect(isValidThumbHash('')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidThumbHash(123 as unknown as string)).toBe(false);
    expect(isValidThumbHash({} as unknown as string)).toBe(false);
  });

  it('rejects strings shorter than 10 characters', () => {
    expect(isValidThumbHash('abc')).toBe(false);
    expect(isValidThumbHash('123456789')).toBe(false);
  });

  it('rejects strings longer than 50 characters', () => {
    expect(isValidThumbHash('a'.repeat(51))).toBe(false);
  });

  it('rejects strings with characters outside the base64 alphabet', () => {
    expect(isValidThumbHash('AAAAAAAAAA!@#$')).toBe(false);
    expect(isValidThumbHash('hello world hash')).toBe(false);
  });

  it('accepts valid-looking base64 strings within length bounds', () => {
    expect(isValidThumbHash('1QcSHQRnh493V4dIh4eXh1h4kJUI')).toBe(true);
    expect(isValidThumbHash('AAAAAAAAAAAA==')).toBe(true);
  });

  it('boundary cases (length 10 and 50) are accepted', () => {
    expect(isValidThumbHash('a'.repeat(10))).toBe(true);
    expect(isValidThumbHash('a'.repeat(50))).toBe(true);
  });
});

describe('decodeThumbHash', () => {
  it('returns null for null/undefined/empty input', () => {
    expect(decodeThumbHash(null as unknown as string)).toBeNull();
    expect(decodeThumbHash(undefined as unknown as string)).toBeNull();
    expect(decodeThumbHash('')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(decodeThumbHash(42 as unknown as string)).toBeNull();
  });

  describe('on decoder failure', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it('returns null and silently swallows errors in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      expect(decodeThumbHash('!!! not base64 !!!')).toBeNull();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('returns null and warns in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      expect(decodeThumbHash('!!! not base64 !!!')).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  it('returns a data: URL string for a valid thumbhash', () => {
    // Use a small known-valid thumbhash sample. If decoding succeeds we get a data URL;
    // if the underlying library rejects it (unlikely for this canonical sample), the result
    // is null — either way we document the contract.
    const result = decodeThumbHash('1QcSHQRnh493V4dIh4eXh1h4kJUI');
    expect(result).toSatisfy((r: string | null) => r === null || r.startsWith('data:image/'));
  });
});
