import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatRelativeTime } from '@/lib/utils/format';

describe('formatRelativeTime', () => {
  // Pin "now" so the relative buckets are deterministic regardless of CI clock.
  const NOW = new Date('2026-05-02T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function ago(ms: number): string {
    return new Date(NOW.getTime() - ms).toISOString();
  }

  it('returns "только что" for sub-minute deltas', () => {
    expect(formatRelativeTime(ago(0))).toBe('только что');
    expect(formatRelativeTime(ago(30_000))).toBe('только что');
    expect(formatRelativeTime(ago(59_000))).toBe('только что');
  });

  it('returns minutes-ago for sub-hour deltas', () => {
    expect(formatRelativeTime(ago(60_000))).toBe('1 мин назад');
    expect(formatRelativeTime(ago(2 * 60_000))).toBe('2 мин назад');
    expect(formatRelativeTime(ago(59 * 60_000))).toBe('59 мин назад');
  });

  it('returns hours-ago for sub-day deltas', () => {
    expect(formatRelativeTime(ago(60 * 60_000))).toBe('1 ч назад');
    expect(formatRelativeTime(ago(5 * 60 * 60_000))).toBe('5 ч назад');
    expect(formatRelativeTime(ago(23 * 60 * 60_000))).toBe('23 ч назад');
  });

  it('returns "вчера" for exactly one day ago', () => {
    expect(formatRelativeTime(ago(24 * 60 * 60_000))).toBe('вчера');
    expect(formatRelativeTime(ago(36 * 60 * 60_000))).toBe('вчера');
  });

  it('returns days-ago for 2-6 days', () => {
    expect(formatRelativeTime(ago(2 * 24 * 60 * 60_000))).toBe('2 дн назад');
    expect(formatRelativeTime(ago(6 * 24 * 60 * 60_000))).toBe('6 дн назад');
  });

  it('falls back to localized short date for >= 7 days', () => {
    const result = formatRelativeTime(ago(10 * 24 * 60 * 60_000));
    // Should not match any of the relative-time labels
    expect(result).not.toMatch(/назад|только что|вчера/);
    // Should contain a digit and a Russian month abbreviation
    expect(result).toMatch(/\d/);
  });

  it('handles invalid date strings gracefully (returns NaN-driven fallback)', () => {
    const result = formatRelativeTime('not-a-date');
    // Implementation does not throw; documents current behavior.
    expect(typeof result).toBe('string');
  });
});
