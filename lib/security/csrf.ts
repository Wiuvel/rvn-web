/**
 * CSRF protection with Redis backend and in-memory fallback.
 * Enables horizontal scaling and CSRF persistence across restarts.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { getEnv } from '../validation/env-validation';
import { getCsrfStore, CSRF_TOKEN_LIFETIME } from './csrf-store';

// Get CSRF secret from validated env (will throw if not set or invalid)
function getCSRFSecret(): string {
  try {
    return getEnv().CSRF_SECRET;
  } catch {
    // Fallback only for development/testing
    if (process.env.NODE_ENV !== 'production') {
      return process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production-dev-only';
    }
    throw new Error('CSRF_SECRET must be configured in production');
  }
}

export async function generateCSRFToken(sessionId: string): Promise<string> {
  const timestamp = Date.now().toString();
  const nonce = randomBytes(16).toString('hex');
  const data = `${sessionId}-${timestamp}-${nonce}`;
  const signature = createHmac('sha256', getCSRFSecret()).update(data).digest('hex');

  const token = `${data}-${signature}`;
  const createdAt = Date.now();

  const store = getCsrfStore();
  await store.set(sessionId, { token, createdAt }, CSRF_TOKEN_LIFETIME);

  return token;
}

// Функция для получения информации о токене (для отладки)
export async function getCSRFTokenInfo(
  sessionId: string,
): Promise<{ exists: boolean; token?: string; createdAt?: number }> {
  const store = getCsrfStore();
  const stored = await store.get(sessionId);
  if (!stored) {
    return { exists: false };
  }
  return {
    exists: true,
    token: stored.token,
    createdAt: stored.createdAt,
  };
}

// Async verify - validates HMAC and enforces single-use token consumption against store
export async function verifyCSRFToken(
  token: string,
  sessionId: string,
  detailed?: false,
  consume?: boolean,
): Promise<boolean>;
export async function verifyCSRFToken(
  token: string,
  sessionId: string,
  detailed: true,
  consume?: boolean,
): Promise<{ valid: boolean; reason?: string }>;
export async function verifyCSRFToken(
  token: string,
  sessionId: string,
  detailed: boolean = false,
  consume: boolean = true,
): Promise<boolean | { valid: boolean; reason?: string }> {
  try {
    if (!token || !sessionId) {
      if (detailed) return { valid: false, reason: 'Missing token or sessionId' };
      return false;
    }

    const parts = token.split('-');
    if (parts.length < 4) {
      if (detailed) return { valid: false, reason: 'Invalid token format' };
      return false;
    }

    const signature = parts.pop();
    const nonce = parts.pop();
    const timestamp = parts.pop();
    const tokenSessionId = parts.join('-');

    if (tokenSessionId !== sessionId) {
      if (detailed) return { valid: false, reason: 'Session ID mismatch' };
      return false;
    }

    const tokenTime = parseInt(timestamp || '0', 10);
    if (isNaN(tokenTime)) {
      if (detailed) return { valid: false, reason: 'Invalid timestamp' };
      return false;
    }

    const now = Date.now();
    if (now - tokenTime > CSRF_TOKEN_LIFETIME) {
      if (detailed) return { valid: false, reason: 'Token expired' };
      return false;
    }

    const data = `${tokenSessionId}-${timestamp}-${nonce}`;
    const expectedSignature = createHmac('sha256', getCSRFSecret()).update(data).digest('hex');

    const signatureBuffer = Buffer.from(signature || '', 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      if (detailed) return { valid: false, reason: 'Signature length mismatch' };
      return false;
    }

    const isValid = timingSafeEqual(signatureBuffer, expectedBuffer);
    if (!isValid) {
      if (detailed) return { valid: false, reason: 'Invalid signature' };
      return false;
    }

    // Verify token exists in store and matches
    const store = getCsrfStore();
    const storedToken = await store.get(sessionId);

    if (!storedToken) {
      if (detailed) return { valid: false, reason: 'Token not found or already consumed' };
      return false;
    }

    if (storedToken.token !== token) {
      if (detailed) return { valid: false, reason: 'Token already used or superseded' };
      return false;
    }

    if (consume) {
      // Consume token to prevent replay attacks
      await store.delete(sessionId);
    }

    if (detailed) {
      return { valid: true };
    }

    return true;
  } catch (error) {
    if (detailed) {
      return {
        valid: false,
        reason: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
      };
    }
    return false;
  }
}

export async function revokeCSRFToken(sessionId: string): Promise<void> {
  const store = getCsrfStore();
  await store.delete(sessionId);
}

// Экспортируем функцию для получения размера хранилища (для мониторинга)
export async function getCSRFStoreSize(): Promise<number> {
  const store = getCsrfStore();
  return store.size();
}
