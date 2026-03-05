import { describe, it, expect } from 'vitest';
import { isValidUUID, validateUUID } from '@/lib/utils/uuid-validation';

describe('uuid-validation', () => {
  describe('isValidUUID', () => {
    it('returns true for valid UUID', () => {
      expect(isValidUUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
      expect(isValidUUID('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(true);
    });
    it('returns false for empty or wrong length', () => {
      expect(isValidUUID('')).toBe(false);
      expect(isValidUUID('a1b2c3d4-e5f6-7890-abcd-ef123456789')).toBe(false);
    });
    it('returns false for missing hyphens or invalid chars', () => {
      expect(isValidUUID('a1b2c3d4e5f67890abcdef1234567890')).toBe(false);
      expect(isValidUUID('g1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
    });
  });

  describe('validateUUID', () => {
    it('does not throw for valid UUID', () => {
      expect(() => validateUUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).not.toThrow();
    });
    it('throws for invalid UUID', () => {
      expect(() => validateUUID('invalid')).toThrow(/Invalid UUID/);
    });
    it('throws with custom field name', () => {
      expect(() => validateUUID('x', 'userId')).toThrow(/userId/);
    });
  });
});
