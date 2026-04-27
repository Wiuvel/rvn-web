/**
 * CSRF protection with Redis backend and in-memory fallback.
 * Enables horizontal scaling and CSRF persistence across restarts.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { getEnv } from '../validation/env-validation';
import { getCsrfStore, CSRF_TOKEN_LIFETIME } from './csrf-store';

// Get CSRF secret from validated env (will throw if not set or invalid)
function getCSRFSecret(): string {
  try {
    return getEnv().CSRF_SECRET;
  } catch {
    // Fallback only for development/testing
    if (process.env.NODE_ENV === 'development') {
      return 'default-csrf-secret-change-in-production-dev-only';
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

// Async verify - используется для Redis-backed store
export async function verifyCSRFToken(
  token: string,
  sessionId: string,
  detailed?: false,
): Promise<boolean>;
export async function verifyCSRFToken(
  token: string,
  sessionId: string,
  detailed: true,
): Promise<{ valid: boolean; reason?: string }>;
export async function verifyCSRFToken(
  token: string,
  sessionId: string,
  detailed?: boolean,
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

    const tokenTime = parseInt(timestamp || '0');
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

    if (isValid) {
      const store = getCsrfStore();
      const storedToken = await store.get(sessionId);
      if (storedToken && storedToken.token !== token) {
        if (detailed) return { valid: false, reason: 'Token already used' };
        return false;
      }
      // Сохраняем токен в хранилище для предотвращения повторного использования
      await store.set(sessionId, { token, createdAt: Date.now() }, CSRF_TOKEN_LIFETIME);
    }

    if (detailed) {
      return { valid: isValid, reason: isValid ? undefined : 'Invalid signature' };
    }

    return isValid;
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

// Экспортируем функцию для получения размера хранилища (для отладки)
export function getCSRFStoreSize(): number {
  // In-memory fallback не отслеживает размер; Redis - нужно бы SCAN
  return 0;
}
