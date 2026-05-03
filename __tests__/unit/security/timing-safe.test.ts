import { describe, it, expect } from 'vitest';
import {
  timingSafeCompare,
  timingSafeUsernameVerify,
  addRandomDelay,
} from '@/lib/security/timing-safe';

describe('timingSafeCompare', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeCompare('hello', 'hello')).toBe(true);
  });

  it('returns false for different strings of equal length', () => {
    expect(timingSafeCompare('hello', 'world')).toBe(false);
  });

  it('returns false when lengths differ (short-circuit)', () => {
    expect(timingSafeCompare('a', 'ab')).toBe(false);
    expect(timingSafeCompare('abc', 'a')).toBe(false);
  });

  it('handles empty strings', () => {
    expect(timingSafeCompare('', '')).toBe(true);
    expect(timingSafeCompare('', 'x')).toBe(false);
  });

  it('handles unicode characters correctly', () => {
    expect(timingSafeCompare('пароль', 'пароль')).toBe(true);
    expect(timingSafeCompare('пароль', 'пароль1')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(timingSafeCompare('ABC', 'abc')).toBe(false);
  });

  it('handles very long strings without throwing', () => {
    const a = 'x'.repeat(10_000);
    const b = 'x'.repeat(10_000);
    expect(timingSafeCompare(a, b)).toBe(true);
  });
});

describe('timingSafeUsernameVerify', () => {
  it('matches identical usernames', () => {
    expect(timingSafeUsernameVerify('alice', 'alice')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(timingSafeUsernameVerify('Alice', 'alice')).toBe(true);
    expect(timingSafeUsernameVerify('ALICE', 'alice')).toBe(true);
  });

  it('trims surrounding whitespace on both sides', () => {
    expect(timingSafeUsernameVerify('  alice  ', 'alice')).toBe(true);
    expect(timingSafeUsernameVerify('alice', '  alice  ')).toBe(true);
  });

  it('rejects non-matching usernames', () => {
    expect(timingSafeUsernameVerify('alice', 'bob')).toBe(false);
  });

  it('does not strip inner whitespace', () => {
    expect(timingSafeUsernameVerify('al ice', 'alice')).toBe(false);
  });
});

describe('addRandomDelay', () => {
  it('resolves after at least minMs', async () => {
    const start = Date.now();
    await addRandomDelay(20, 40);
    const elapsed = Date.now() - start;
    // Allow small scheduler drift below the lower bound
    expect(elapsed).toBeGreaterThanOrEqual(15);
  });

  it('respects the upper bound (within timer slack)', async () => {
    const start = Date.now();
    await addRandomDelay(10, 30);
    const elapsed = Date.now() - start;
    // Generous ceiling to keep CI stable
    expect(elapsed).toBeLessThan(150);
  });

  it('uses default range when called without arguments', async () => {
    await expect(addRandomDelay()).resolves.toBeUndefined();
  });
});
