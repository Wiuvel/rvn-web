import { describe, it, expect } from 'vitest';
import { truncateFileName } from '../lib/utils/truncate';

describe('truncateFileName', () => {
  it('should return original string if shorter than maxLen', () => {
    const result = truncateFileName('short.txt', 20);
    expect(result).toBe('short.txt');
  });

  it('should truncate and add ".." if longer than maxLen', () => {
    // maxLen = 10. "very-long-name.txt" is 18 chars.
    // Should take first 8 chars (10 - 2) and add ".."
    // "very-lon" + ".."
    const result = truncateFileName('very-long-name.txt', 10);
    expect(result).toBe('very-lon..');
  });

  it('should handle exact length correctly', () => {
    const str = '1234567890';
    const result = truncateFileName(str, 10);
    expect(result).toBe(str);
  });

  it('should handle empty string', () => {
    const result = truncateFileName('', 10);
    expect(result).toBe('');
  });

  it('should use default maxLen if not provided', () => {
    // Assuming default is likely > 5
    const result = truncateFileName('test', undefined);
    expect(result).toBe('test');
  });
});
