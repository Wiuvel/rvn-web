import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateCSRFToken,
  verifyCSRFToken,
  revokeCSRFToken,
  getCSRFStoreSize,
} from '@/lib/security/csrf';

describe('CSRF Security & Replay Prevention', () => {
  const sessionId = 'session-test-uuid-1234';

  beforeEach(async () => {
    await revokeCSRFToken(sessionId);
  });

  it('generates a valid token and verifies it successfully', async () => {
    const token = await generateCSRFToken(sessionId);
    expect(token).toBeDefined();
    expect(token.startsWith(sessionId)).toBe(true);

    const result = await verifyCSRFToken(token, sessionId, true);
    expect(result.valid).toBe(true);
  });

  it('rejects verification if token or sessionId is missing', async () => {
    expect(await verifyCSRFToken('', sessionId)).toBe(false);
    expect(await verifyCSRFToken('invalid', '')).toBe(false);

    const detailed = await verifyCSRFToken('', sessionId, true);
    expect(detailed.valid).toBe(false);
    expect(detailed.reason).toContain('Missing token');
  });

  it('rejects verification if sessionId does not match', async () => {
    const token = await generateCSRFToken(sessionId);
    const result = await verifyCSRFToken(token, 'different-session-id', true);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Session ID mismatch');
  });

  it('rejects tampered token signatures', async () => {
    const token = await generateCSRFToken(sessionId);
    const tampered = token.slice(0, -5) + '00000';

    const result = await verifyCSRFToken(tampered, sessionId, true);
    expect(result.valid).toBe(false);
  });

  it('prevents replay attacks by consuming the token on verify', async () => {
    const token = await generateCSRFToken(sessionId);

    // First use: should succeed and consume
    const firstAttempt = await verifyCSRFToken(token, sessionId, true, true);
    expect(firstAttempt.valid).toBe(true);

    // Second use (replay attack): must fail because token was consumed
    const secondAttempt = await verifyCSRFToken(token, sessionId, true, true);
    expect(secondAttempt.valid).toBe(false);
    expect(secondAttempt.reason).toContain('consumed');
  });

  it('allows non-consuming verification when explicitly requested', async () => {
    const token = await generateCSRFToken(sessionId);

    // Non-consuming check
    const check1 = await verifyCSRFToken(token, sessionId, false, false);
    expect(check1).toBe(true);

    // Second check still works because it was not consumed
    const check2 = await verifyCSRFToken(token, sessionId, false, false);
    expect(check2).toBe(true);

    // Now consume
    const check3 = await verifyCSRFToken(token, sessionId, false, true);
    expect(check3).toBe(true);

    // Now it is gone
    const check4 = await verifyCSRFToken(token, sessionId, false, true);
    expect(check4).toBe(false);
  });

  it('accurately reports CSRF store size', async () => {
    await revokeCSRFToken('session-size-1');
    await revokeCSRFToken('session-size-2');

    const initialSize = await getCSRFStoreSize();
    await generateCSRFToken('session-size-1');
    await generateCSRFToken('session-size-2');

    const newSize = await getCSRFStoreSize();
    expect(newSize).toBeGreaterThanOrEqual(initialSize + 2);

    await revokeCSRFToken('session-size-1');
    await revokeCSRFToken('session-size-2');
  });
});
