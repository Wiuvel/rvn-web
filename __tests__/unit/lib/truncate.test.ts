import { describe, it, expect } from 'vitest';
import { truncateFileName } from '@/lib/utils/truncate';

describe('truncateFileName', () => {
  it('should return original string if shorter than maxLen', () => {
    expect(truncateFileName('short.txt', 20)).toBe('short.txt');
  });

  it('should truncate and add ".." if longer than maxLen', () => {
    const result = truncateFileName('very-long-name.txt', 10);
    expect(result).toBe('very-lon..');
  });

  it('should handle exact length correctly', () => {
    const str = '1234567890';
    expect(truncateFileName(str, 10)).toBe(str);
  });

  it('should handle empty string', () => {
    expect(truncateFileName('', 10)).toBe('');
  });

  it('should use default maxLen if not provided', () => {
    expect(truncateFileName('test', undefined)).toBe('test');
  });
});
