import { describe, it, expect } from 'vitest';
import { translateError } from '@/lib/utils/error-translations';
import { ERROR_DEFAULT } from '@/lib/utils/constants';

describe('translateError', () => {
  it('should return default error for empty input', () => {
    expect(translateError(null)).toBe(ERROR_DEFAULT);
    expect(translateError(undefined)).toBe(ERROR_DEFAULT);
    expect(translateError('')).toBe(ERROR_DEFAULT);
  });

  it('should translate exact and case-insensitive match', () => {
    expect(translateError('Username is required')).toBe('Логин обязателен');
    expect(translateError('username is required')).toBe('Логин обязателен');
  });

  it('should translate partial match', () => {
    expect(translateError('Error: Username is required!')).toBe('Логин обязателен');
  });

  it('should return original message if no translation found', () => {
    const unknownError = 'Something weird happened';
    expect(translateError(unknownError)).toBe(unknownError);
  });

  it('should trim whitespace', () => {
    expect(translateError('  Username is required  ')).toBe('Логин обязателен');
  });
});
