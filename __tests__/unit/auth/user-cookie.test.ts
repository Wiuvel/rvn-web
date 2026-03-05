import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createUserDataCookie, parseUserDataCookie } from '@/lib/auth/user-cookie.server';
import type { UserDataPayload } from '@/lib/auth/types';

describe('User Cookie Security', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, USER_DATA_SECRET: 'test-secret-key-1234567890abcdef' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const validPayload: UserDataPayload = {
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    username: 'testuser',
    avatar: 'https://example.com/avatar.jpg',
    banner: null,
    pex: 'u',
  };

  it('should create and parse a valid cookie', () => {
    const cookie = createUserDataCookie(validPayload);
    expect(typeof cookie).toBe('string');
    expect(cookie).toContain('.');

    const parsed = parseUserDataCookie(cookie);
    expect(parsed).toEqual(validPayload);
  });

  it('should return null for invalid cookie format (no dot)', () => {
    const parsed = parseUserDataCookie('invalidcookieformat');
    expect(parsed).toBeNull();
  });

  it('should return null for tampered payload', () => {
    const cookie = createUserDataCookie(validPayload);
    const [payloadB64, signature] = cookie.split('.');

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    payload.pex = 'a';
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

    const tamperedCookie = `${tamperedPayloadB64}.${signature}`;
    const parsed = parseUserDataCookie(tamperedCookie);
    expect(parsed).toBeNull();
  });

  it('should return null for tampered signature', () => {
    const cookie = createUserDataCookie(validPayload);
    const [payloadB64, signature] = cookie.split('.');

    const tamperedSignature = signature.replace(/[a-z]/, 'X');

    const tamperedCookie = `${payloadB64}.${tamperedSignature}`;
    const parsed = parseUserDataCookie(tamperedCookie);
    expect(parsed).toBeNull();
  });

  it('should return null for empty input', () => {
    expect(parseUserDataCookie('')).toBeNull();
    expect(parseUserDataCookie(undefined)).toBeNull();
  });

  it('should return null if JSON parsing fails', async () => {
    const badJsonB64 = Buffer.from('not json').toString('base64url');
    const crypto = await import('crypto');
    const secret = process.env.USER_DATA_SECRET!;
    const signature = crypto.createHmac('sha256', secret).update(badJsonB64).digest('base64url');

    const badCookie = `${badJsonB64}.${signature}`;
    const parsed = parseUserDataCookie(badCookie);
    expect(parsed).toBeNull();
  });

  it('should return null if required fields are missing', () => {
    const invalidPayload = { ...validPayload };
    delete (invalidPayload as any).user_id;

    const cookie = createUserDataCookie(invalidPayload);
    const parsed = parseUserDataCookie(cookie);
    expect(parsed).toBeNull();
  });
});
