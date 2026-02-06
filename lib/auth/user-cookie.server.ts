import { createHmac, timingSafeEqual } from 'crypto';
import { getEnv } from '@/lib/validation/env-validation';
import { appConfig } from '@/lib/utils/config';
import type { UserDataPayload } from './types';

export const USER_DATA_COOKIE_NAME = 'user_data';

function getUserDataSecret(): string {
  try {
    return process.env.USER_DATA_SECRET || getEnv().CSRF_SECRET;
  } catch {
    if (process.env.NODE_ENV === 'development') {
      return 'default-user-data-secret-change-in-production-dev';
    }
    throw new Error('USER_DATA_SECRET or CSRF_SECRET must be configured');
  }
}

/**
 * Создаёт HMAC-подписанную строку: base64url(json) + "." + base64url(signature)
 */
export function createUserDataCookie(payload: UserDataPayload): string {
  const json = JSON.stringify(payload);
  const dataB64 = Buffer.from(json, 'utf-8').toString('base64url');
  const signature = createHmac('sha256', getUserDataSecret())
    .update(dataB64)
    .digest('base64url');
  return `${dataB64}.${signature}`;
}

/**
 * Верифицирует и парсит user_data cookie. Возвращает null при ошибке.
 */
export function parseUserDataCookie(cookieValue: string | undefined): UserDataPayload | null {
  if (!cookieValue || typeof cookieValue !== 'string') return null;

  const dotIdx = cookieValue.lastIndexOf('.');
  if (dotIdx === -1) return null;

  const dataB64 = cookieValue.slice(0, dotIdx);
  const signatureB64 = cookieValue.slice(dotIdx + 1);

  try {
    const expectedSignature = createHmac('sha256', getUserDataSecret())
      .update(dataB64)
      .digest('base64url');

    const sigBuffer = Buffer.from(signatureB64, 'base64url');
    const expectedBuffer = Buffer.from(expectedSignature, 'base64url');
    
    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      return null;
    }

    const json = Buffer.from(dataB64, 'base64url').toString('utf-8');
    const payload = JSON.parse(json) as UserDataPayload;

    if (!payload.user_id || typeof payload.user_id !== 'string') return null;
    if (!payload.username || typeof payload.username !== 'string') return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Опции для установки user_data cookie
 */
export function getUserDataCookieOptions(isLocalhost: boolean) {
  const { maxAge } = appConfig.userData;
  return {
    maxAge,
    httpOnly: false, // Клиент читает для UI
    secure: process.env.NODE_ENV === 'production' && !isLocalhost,
    sameSite: 'lax' as const,
    path: '/',
  };
}
