import { describe, it, expect } from 'vitest';
import { generateUserId } from '@/lib/auth/index';

describe('generateUserId', () => {
  it('генерирует строку из 7 цифр', () => {
    const userId = generateUserId();
    expect(userId).toMatch(/^\d{7}$/);
  });

  it('дополняет нулями слева', () => {
    for (let i = 0; i < 50; i++) {
      const userId = generateUserId();
      expect(userId).toHaveLength(7);
    }
  });

  it('генерирует значения в диапазоне 0000000-9999999', () => {
    for (let i = 0; i < 50; i++) {
      const userId = generateUserId();
      const num = parseInt(userId, 10);
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThan(10000000);
    }
  });
});
