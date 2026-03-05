import { describe, it, expect } from 'vitest';
import {
  getAvatarUrl,
  getGradientClasses,
  generateAvatarFromString,
  isValidAvatar,
  getBannerUrl,
} from '@/lib/utils/avatar-gradients';

describe('avatar-gradients', () => {
  describe('getAvatarUrl', () => {
    it('returns null for null or empty', () => {
      expect(getAvatarUrl(null)).toBe(null);
      expect(getAvatarUrl('')).toBe(null);
    });
    it('returns null for numeric avatar id (gradient)', () => {
      expect(getAvatarUrl('0')).toBe(null);
    });
    it('returns URL for s3 avatar path', () => {
      expect(getAvatarUrl('s3:avatars/user-123/123456.jpg')).toBe(
        '/images/users/user-123/123456.jpg',
      );
    });
    it('returns null for s3 path not starting with avatars/', () => {
      expect(getAvatarUrl('s3:banners/user/1.jpg')).toBe(null);
    });
  });

  describe('getGradientClasses', () => {
    it('returns gradient class for numeric id', () => {
      const c = getGradientClasses('0');
      expect(c).toContain('bg-gradient-to-r');
    });
    it('returns empty string for s3 avatar', () => {
      expect(getGradientClasses('s3:avatars/u/1.jpg')).toBe('');
    });
  });

  describe('generateAvatarFromString', () => {
    it('returns deterministic avatar id for same string', () => {
      const a = generateAvatarFromString('alice');
      const b = generateAvatarFromString('alice');
      expect(a).toBe(b);
    });
    it('returns different id for different strings', () => {
      const a = generateAvatarFromString('alice');
      const b = generateAvatarFromString('bob');
      expect(a).not.toBe(b);
    });
    it('returns valid AvatarId (0-9)', () => {
      const id = generateAvatarFromString('test');
      expect(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']).toContain(id);
    });
  });

  describe('isValidAvatar', () => {
    it('returns true for 0-9', () => {
      expect(isValidAvatar('0')).toBe(true);
      expect(isValidAvatar('9')).toBe(true);
    });
    it('returns false for s3 or invalid', () => {
      expect(isValidAvatar('s3:avatars/x/1.jpg')).toBe(false);
      expect(isValidAvatar('10')).toBe(false);
    });
  });

  describe('getBannerUrl', () => {
    it('returns null for non-s3', () => {
      expect(getBannerUrl(null)).toBe(null);
    });
    it('returns URL for s3 banner path', () => {
      expect(getBannerUrl('s3:banners/user-1/2.jpg')).toBe('/images/users/banners/user-1/2.jpg');
    });
  });
});
