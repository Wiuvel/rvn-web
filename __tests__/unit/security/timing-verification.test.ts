import { describe, it, expect } from 'vitest';
import {
  timingSafeCompare,
  timingSafePasswordVerify,
  timingSafeUsernameVerify,
} from '@/lib/security/timing-safe';
import { hashPassword } from '@/lib/auth/index';

describe('Timing-Safe Primitives & Delay Guarantees', () => {
  describe('timingSafeCompare', () => {
    it('accurately compares strings of differing lengths without throwing', () => {
      expect(timingSafeCompare('short', 'much-longer-string-with-extra-entropy')).toBe(false);
      expect(timingSafeCompare('a', 'b')).toBe(false);
      expect(timingSafeCompare('exact-match-token-1234', 'exact-match-token-1234')).toBe(true);
    });

    it('handles unicode and empty strings safely', () => {
      expect(timingSafeCompare('', '')).toBe(true);
      expect(timingSafeCompare('🔑', '🔑')).toBe(true);
      expect(timingSafeCompare('🔑', '🔒')).toBe(false);
    });
  });

  describe('timingSafePasswordVerify', () => {
    it('guarantees minimum 100ms execution time even on fast failures or malformed hash', async () => {
      const start = Date.now();
      const result = await timingSafePasswordVerify('any-password', 'invalid-argon-hash-format');
      const elapsed = Date.now() - start;

      expect(result).toBe(false);
      // Verify elapsed is at least 95ms (allowing minor clock skew)
      expect(elapsed).toBeGreaterThanOrEqual(95);
    });

    it('verifies valid argon2 password and respects minimum delay', async () => {
      const password = 'CorrectHorseBatteryStaple123!';
      const hash = await hashPassword(password);

      const start = Date.now();
      const valid = await timingSafePasswordVerify(password, hash);
      const elapsed = Date.now() - start;

      expect(valid).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(95);
    });

    it('rejects wrong password and respects minimum delay', async () => {
      const password = 'CorrectHorseBatteryStaple123!';
      const hash = await hashPassword(password);

      const start = Date.now();
      const valid = await timingSafePasswordVerify('WrongPassword!', hash);
      const elapsed = Date.now() - start;

      expect(valid).toBe(false);
      expect(elapsed).toBeGreaterThanOrEqual(95);
    });
  });

  describe('timingSafeUsernameVerify', () => {
    it('handles case-insensitive whitespace-trimmed comparison', () => {
      expect(timingSafeUsernameVerify('  admin  ', 'ADMIN')).toBe(true);
      expect(timingSafeUsernameVerify('user1', 'user2')).toBe(false);
    });
  });
});
