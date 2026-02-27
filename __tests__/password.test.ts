import { describe, it, expect } from 'vitest';
import { calculatePasswordStrength } from '../lib/utils/password';

describe('calculatePasswordStrength', () => {
  it('should return score 0 for empty password', () => {
    const result = calculatePasswordStrength('');
    expect(result.score).toBe(0);
    expect(result.label).toBe('');
    expect(result.color).toBe('');
    expect(result.requirements.minLength).toBe(false);
  });

  it('should return score 0 for very short password', () => {
    const result = calculatePasswordStrength('123');
    // minLength is >= 6
    expect(result.requirements.minLength).toBe(false);
    expect(result.score).toBe(1); // hasNumber is true
    expect(result.label).toBe('Слабый');
  });

  it('should detect lower case', () => {
    const result = calculatePasswordStrength('abc');
    expect(result.requirements.hasLowerCase).toBe(true);
    expect(result.requirements.hasUpperCase).toBe(false);
  });

  it('should detect upper case', () => {
    const result = calculatePasswordStrength('ABC');
    expect(result.requirements.hasUpperCase).toBe(true);
    expect(result.requirements.hasLowerCase).toBe(false);
  });

  it('should detect numbers', () => {
    const result = calculatePasswordStrength('123');
    expect(result.requirements.hasNumber).toBe(true);
  });

  it('should detect special characters', () => {
    const result = calculatePasswordStrength('!@#');
    expect(result.requirements.hasSpecialChar).toBe(true);
  });

  it('should calculate correct score for weak password', () => {
    // Length >= 6, Lowercase
    const result = calculatePasswordStrength('password');
    expect(result.requirements.minLength).toBe(true);
    expect(result.requirements.hasLowerCase).toBe(true);
    expect(result.requirements.hasUpperCase).toBe(false);
    expect(result.requirements.hasNumber).toBe(false);
    expect(result.requirements.hasSpecialChar).toBe(false);

    // Score = 2 (minLength + hasLowerCase) -> Normalized 1 (<=2)
    expect(result.score).toBe(1);
    expect(result.label).toBe('Слабый');
  });

  it('should calculate correct score for medium password', () => {
    // Length >= 6, Lowercase, Number
    const result = calculatePasswordStrength('password123');
    // Score = 3 (minLength + hasLowerCase + hasNumber) -> Normalized 2 (==3)
    expect(result.score).toBe(2);
    expect(result.label).toBe('Средний');
  });

  it('should calculate correct score for good password', () => {
    // Length >= 6, Lowercase, Number, Uppercase
    const result = calculatePasswordStrength('Password123');
    // Score = 4 (minLength + hasLowerCase + hasNumber + hasUpperCase) -> Normalized 3 (==4)
    expect(result.score).toBe(3);
    expect(result.label).toBe('Хороший');
  });

  it('should calculate correct score for excellent password', () => {
    // All requirements met
    const result = calculatePasswordStrength('Password123!');
    // Score = 5 -> Normalized 4 (else)
    expect(result.score).toBe(4);
    expect(result.label).toBe('Отличный');
  });
});
