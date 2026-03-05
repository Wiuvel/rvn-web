import { describe, it, expect } from 'vitest';
import { generateAuthToken, generateUserId } from '@/lib/auth/index';

describe('generateAuthToken', () => {
  it('генерирует строку длиной 15 символов', () => {
    const token = generateAuthToken();
    expect(token).toHaveLength(15);
  });

  it('содержит только base64url символы', () => {
    const token = generateAuthToken();
    expect(token).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('генерирует уникальные токены', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateAuthToken()));
    expect(tokens.size).toBe(100);
  });
});

describe('generateUserId', () => {
  it('генерирует строку из 6 цифр', () => {
    const userId = generateUserId();
    expect(userId).toMatch(/^\d{6}$/);
  });

  it('дополняет нулями слева', () => {
    for (let i = 0; i < 50; i++) {
      const userId = generateUserId();
      expect(userId).toHaveLength(6);
    }
  });

  it('генерирует значения в диапазоне 000000-999999', () => {
    for (let i = 0; i < 50; i++) {
      const userId = generateUserId();
      const num = parseInt(userId, 10);
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThan(1000000);
    }
  });
});
