import { describe, it, expect } from 'vitest';
import { translateError } from '../lib/utils/error-translations';
import { ERROR_DEFAULT } from '../lib/utils/constants';

describe('translateError', () => {
  it('should return default error for empty input', () => {
    expect(translateError(null)).toBe(ERROR_DEFAULT);
    expect(translateError(undefined)).toBe(ERROR_DEFAULT);
    expect(translateError('')).toBe(ERROR_DEFAULT);
  });

  it('should translate exact match', () => {
    expect(translateError('Username is required')).toBe('Логин обязателен');
  });

  it('should translate case-insensitive match', () => {
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

  it('should handle partial match where translation key is part of the error', () => {
    // Key: 'rate_limit' -> 'Слишком много попыток. Попробуйте позже.'
    // Input: 'upstream rate_limit exceeded'
    expect(translateError('upstream rate_limit exceeded')).toBe(
      'Слишком много попыток. Попробуйте позже.',
    );
  });
});
