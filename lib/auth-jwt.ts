/**
 * Утилиты для работы с JWT авторизацией
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken, extractTokenFromHeader, extractTokenFromCookies, type AccessTokenPayload } from './jwt';
import { getUserById } from './auth';
import { logger } from './secure-logger';
import { AuthErrorCode, isExpectedAuthError } from './auth-errors';

/**
 * Результат проверки авторизации через JWT
 */
export interface JwtAuthResult {
  isAuthenticated: boolean;
  user?: {
    id: string;
    user_id: string;
    username: string;
    dashboard_token: string;
    created_at: string;
    last_login?: string;
    avatar_gradient?: string | null;
  };
  payload?: AccessTokenPayload;
  error?: string;
  errorCode?: AuthErrorCode;
}

/**
 * Проверка авторизации через JWT токен
 * Поддерживает токены из Authorization header и cookies
 */
export async function verifyJwtAuth(request: NextRequest): Promise<JwtAuthResult> {
  try {
    // Пробуем получить токен из Authorization header
    const authHeader = request.headers.get('authorization');
    let token = extractTokenFromHeader(authHeader);

    // Если токена нет в header, пробуем получить из cookies
    if (!token) {
      const cookieStore = await cookies();
      const tokens = extractTokenFromCookies(cookieStore);
      token = tokens.accessToken;
    }

    if (!token) {
      return {
        isAuthenticated: false,
        error: 'No token provided',
        errorCode: AuthErrorCode.NOT_AUTHENTICATED
      };
    }

    // Верифицируем токен
    let payload: AccessTokenPayload;
    try {
      payload = await verifyAccessToken(token);
      
      // Дополнительная проверка: убеждаемся что пользователь активен
      // (getUserById уже проверяет is_active, но лучше проверить заранее)
    } catch (error) {
      // Определяем тип ошибки
      const errorMessage = error instanceof Error ? error.message : 'Invalid token';
      let errorCode = AuthErrorCode.TOKEN_INVALID;
      
      if (errorMessage.includes('expired')) {
        errorCode = AuthErrorCode.TOKEN_EXPIRED;
      } else if (errorMessage.includes('version')) {
        errorCode = AuthErrorCode.TOKEN_VERSION_MISMATCH;
      }
      
      // Не логируем истекшие токены или отсутствие токена - это нормальная ситуация
      // Логируем только неожиданные ошибки
      if (!isExpectedAuthError(error)) {
        logger.warn('Unexpected JWT verification error', {
          error: errorMessage,
          errorCode,
          ip: request.headers.get('x-forwarded-for')
        });
      }
      
      return {
        isAuthenticated: false,
        error: errorMessage,
        errorCode
      };
    }

    // Получаем данные пользователя по ID
    const user = await getUserById(payload.userId);
    if (!user) {
      // Логируем только если это неожиданная ситуация (пользователь был удален)
      // Не логируем для нормальных случаев (пользователь вышел, токен отозван)
      logger.warn('User not found for valid JWT token', {
        userId: payload.userId,
        ip: request.headers.get('x-forwarded-for')
      });
      return {
        isAuthenticated: false,
        error: 'User not found',
        errorCode: AuthErrorCode.USER_NOT_FOUND
      };
    }
    
    // Проверяем активность пользователя (getUserById уже проверяет, но для ясности)
    if (!user.is_active) {
      logger.warn('Inactive user attempted access', {
        userId: user.id,
        ip: request.headers.get('x-forwarded-for')
      });
      return {
        isAuthenticated: false,
        error: 'Account is disabled',
        errorCode: AuthErrorCode.USER_INACTIVE
      };
    }

    return {
      isAuthenticated: true,
      user: {
        id: user.id,
        user_id: user.user_id,
        username: user.username,
        dashboard_token: user.dashboard_token,
        created_at: user.created_at,
        last_login: user.last_login,
        avatar_gradient: user.avatar_gradient,
      },
      payload
    };
  } catch (error) {
    logger.error('Error verifying JWT auth', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for')
    });
    return {
      isAuthenticated: false,
      error: 'Internal error',
      errorCode: AuthErrorCode.INTERNAL_ERROR
    };
  }
}

/**
 * Middleware helper для проверки JWT авторизации
 * Возвращает NextResponse с ошибкой или null если авторизация успешна
 */
export async function requireJwtAuth(request: NextRequest): Promise<NextResponse | null> {
  const authResult = await verifyJwtAuth(request);
  
  if (!authResult.isAuthenticated) {
    const { setCorsHeaders } = await import('./cors');
    const { ERROR_NOT_AUTHENTICATED } = await import('./constants');
    
    return setCorsHeaders(
      NextResponse.json(
        { error: ERROR_NOT_AUTHENTICATED },
        { status: 401 }
      )
    );
  }

  return null;
}

