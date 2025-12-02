/**
 * Верификация авторизации для API routes
 */

import { NextRequest } from 'next/server';
import { verifyAccessToken, verifyRefreshToken } from './jwt';
import { verifyRefreshTokenInDB } from './tokens';
import { getActiveUserById, getUserRoles, toPublicUser } from './users';
import { extractTokensFromRequest } from './cookies';
import type { AuthResponse, AuthErrorCode, UserRole } from './types';

// ============================================================================
// Main Auth Verification
// ============================================================================

export interface VerifyAuthOptions {
  requireRoles?: UserRole[];
}

/**
 * Проверяет авторизацию пользователя по access token
 * Возвращает данные пользователя или ошибку
 */
export async function verifyAuth(
  request: NextRequest,
  options: VerifyAuthOptions = {}
): Promise<AuthResponse> {
  const { accessToken } = extractTokensFromRequest(request);

  // Нет access token
  if (!accessToken) {
    return {
      success: false,
      code: 'NO_TOKEN',
      message: 'No access token provided',
    };
  }

  // Верифицируем access token
  const tokenResult = await verifyAccessToken(accessToken);

  if (!tokenResult.valid) {
    const code: AuthErrorCode = tokenResult.expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    return {
      success: false,
      code,
      message: tokenResult.error,
    };
  }

  // Получаем пользователя из БД
  const user = await getActiveUserById(tokenResult.payload.sub);

  if (!user) {
    return {
      success: false,
      code: 'USER_NOT_FOUND',
      message: 'User not found or inactive',
    };
  }

  // Проверяем версию токена
  if (tokenResult.payload.ver !== user.token_version) {
    return {
      success: false,
      code: 'TOKEN_REVOKED',
      message: 'Token has been revoked',
    };
  }

  // Получаем роли
  const roles = await getUserRoles(user.id);

  // Проверяем требуемые роли
  if (options.requireRoles && options.requireRoles.length > 0) {
    const hasRequiredRole = options.requireRoles.some((role) => roles.includes(role));
    if (!hasRequiredRole) {
      return {
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Insufficient permissions',
      };
    }
  }

  return {
    success: true,
    user: toPublicUser(user),
    roles,
  };
}

// ============================================================================
// Refresh Token Verification
// ============================================================================

export interface RefreshAuthResult {
  success: true;
  userId: string;
  tokenVersion: number;
  jti: string;
}

export interface RefreshAuthError {
  success: false;
  code: AuthErrorCode;
  message: string;
}

/**
 * Проверяет refresh token (JWT + DB)
 */
export async function verifyRefreshAuth(
  request: NextRequest
): Promise<RefreshAuthResult | RefreshAuthError> {
  const { refreshToken } = extractTokensFromRequest(request);

  // Нет refresh token
  if (!refreshToken) {
    return {
      success: false,
      code: 'NO_TOKEN',
      message: 'No refresh token provided',
    };
  }

  // Верифицируем JWT
  const jwtResult = await verifyRefreshToken(refreshToken);

  if (!jwtResult.valid) {
    const code: AuthErrorCode = jwtResult.expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    return {
      success: false,
      code,
      message: jwtResult.error,
    };
  }

  const { payload } = jwtResult;

  // Проверяем в БД
  const dbResult = await verifyRefreshTokenInDB(
    refreshToken,
    payload.jti,
    payload.sub
  );

  if (!dbResult.valid) {
    const code: AuthErrorCode = dbResult.userInactive ? 'USER_INACTIVE' : 'TOKEN_REVOKED';
    return {
      success: false,
      code,
      message: dbResult.error,
    };
  }

  return {
    success: true,
    userId: dbResult.user.id,
    tokenVersion: dbResult.user.token_version,
    jti: payload.jti,
  };
}

// ============================================================================
// Middleware Verification (Edge Runtime)
// ============================================================================

export interface MiddlewareAuthResult {
  isAuthenticated: boolean;
  hasRefreshToken: boolean;
  tokenExpired: boolean;
  userId?: string;
}

/**
 * Упрощенная проверка для middleware (Edge Runtime compatible)
 * Не делает запросы к БД
 */
export async function verifyAuthForMiddleware(
  request: NextRequest
): Promise<MiddlewareAuthResult> {
  const { accessToken, refreshToken } = extractTokensFromRequest(request);

  // Нет токенов вообще
  if (!accessToken && !refreshToken) {
    return {
      isAuthenticated: false,
      hasRefreshToken: false,
      tokenExpired: false,
    };
  }

  // Есть только refresh token
  if (!accessToken && refreshToken) {
    return {
      isAuthenticated: true, // Разрешаем доступ, страница обновит токен
      hasRefreshToken: true,
      tokenExpired: true,
    };
  }

  // Есть access token - проверяем его
  if (accessToken) {
    const result = await verifyAccessToken(accessToken);

    if (result.valid) {
      return {
        isAuthenticated: true,
        hasRefreshToken: !!refreshToken,
        tokenExpired: false,
        userId: result.payload.sub,
      };
    }

    // Access token невалиден, но есть refresh token
    if (refreshToken) {
      return {
        isAuthenticated: true,
        hasRefreshToken: true,
        tokenExpired: result.expired,
      };
    }

    // Нет refresh token
    return {
      isAuthenticated: false,
      hasRefreshToken: false,
      tokenExpired: result.expired,
    };
  }

  return {
    isAuthenticated: false,
    hasRefreshToken: false,
    tokenExpired: false,
  };
}

