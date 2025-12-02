/**
 * Управление cookies для авторизации
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './types';

// ============================================================================
// Cookie Helpers
// ============================================================================

/**
 * Определяет, нужен ли secure флаг для cookies
 */
export function isSecureCookie(hostname: string): boolean {
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  return process.env.NODE_ENV === 'production' && !isLocalhost;
}

// ============================================================================
// Set Cookies
// ============================================================================

/**
 * Устанавливает токены в cookies ответа
 */
export function setTokenCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
  hostname: string
): NextResponse {
  const secure = isSecureCookie(hostname);

  response.cookies.set(ACCESS_TOKEN_COOKIE.name, accessToken, {
    ...ACCESS_TOKEN_COOKIE,
    secure,
  });

  response.cookies.set(REFRESH_TOKEN_COOKIE.name, refreshToken, {
    ...REFRESH_TOKEN_COOKIE,
    secure,
  });

  return response;
}

/**
 * Устанавливает только access token в cookies ответа
 */
export function setAccessTokenCookie(
  response: NextResponse,
  accessToken: string,
  hostname: string
): NextResponse {
  const secure = isSecureCookie(hostname);

  response.cookies.set(ACCESS_TOKEN_COOKIE.name, accessToken, {
    ...ACCESS_TOKEN_COOKIE,
    secure,
  });

  return response;
}

// ============================================================================
// Clear Cookies
// ============================================================================

/**
 * Очищает токены из cookies ответа
 */
export function clearTokenCookies(
  response: NextResponse,
  hostname: string
): NextResponse {
  const secure = isSecureCookie(hostname);

  // Удаляем через .delete()
  response.cookies.delete(ACCESS_TOKEN_COOKIE.name);
  response.cookies.delete(REFRESH_TOKEN_COOKIE.name);

  // Также устанавливаем пустые значения для надежности
  response.cookies.set(ACCESS_TOKEN_COOKIE.name, '', {
    ...ACCESS_TOKEN_COOKIE,
    secure,
    maxAge: 0,
  });

  response.cookies.set(REFRESH_TOKEN_COOKIE.name, '', {
    ...REFRESH_TOKEN_COOKIE,
    secure,
    maxAge: 0,
  });

  return response;
}

// ============================================================================
// Read Cookies (Server Components)
// ============================================================================

/**
 * Получает токены из cookies (для Server Components и Route Handlers)
 */
export async function getTokensFromCookies(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
}> {
  const cookieStore = await cookies();

  return {
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE.name)?.value || null,
    refreshToken: cookieStore.get(REFRESH_TOKEN_COOKIE.name)?.value || null,
  };
}

// ============================================================================
// Extract from Request
// ============================================================================

/**
 * Извлекает токены из request cookies (для middleware и route handlers)
 */
export function extractTokensFromRequest(request: {
  cookies: { get: (name: string) => { value: string } | undefined };
}): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  return {
    accessToken: request.cookies.get(ACCESS_TOKEN_COOKIE.name)?.value || null,
    refreshToken: request.cookies.get(REFRESH_TOKEN_COOKIE.name)?.value || null,
  };
}

