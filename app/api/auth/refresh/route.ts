import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyRefreshToken, generateAccessToken, generateRefreshToken } from '@/lib/jwt';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { ERROR_NOT_AUTHENTICATED, ERROR_INTERNAL_SERVER_ERROR } from '@/lib/constants';
import { refreshRateLimit } from '@/lib/rate-limit';
import { verifyRefreshTokenWithUser, storeRefreshToken, revokeRefreshToken } from '@/lib/jwt-storage';

export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * POST /api/auth/refresh
 * Обновление Access Token с помощью Refresh Token
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await refreshRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for refresh token request', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent')
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Too many requests' },
          { status: 429 }
        )
      );
    }

    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh_token')?.value;

    if (!refreshToken) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_NOT_AUTHENTICATED },
          { status: 401 }
        )
      );
    }

    // Верифицируем refresh token (JWT)
    let payload;
    try {
      payload = await verifyRefreshToken(refreshToken);
    } catch (error) {
      logger.warn('Invalid refresh token (JWT verification failed)', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: request.headers.get('x-forwarded-for')
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_NOT_AUTHENTICATED },
          { status: 401 }
        )
      );
    }

    // Проверяем токен в БД и получаем данные пользователя в одном запросе (оптимизация)
    const dbVerification = await verifyRefreshTokenWithUser(refreshToken, payload.userId);
    if (!dbVerification.valid || !dbVerification.user) {
      logger.warn('Invalid refresh token (not found in DB or revoked)', {
        userId: payload.userId,
        error: dbVerification.error,
        ip: request.headers.get('x-forwarded-for')
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_NOT_AUTHENTICATED },
          { status: 401 }
        )
      );
    }

    // Проверяем активность пользователя
    if (!dbVerification.user.is_active) {
      logger.warn('Inactive user attempted token refresh', {
        userId: payload.userId,
        ip: request.headers.get('x-forwarded-for')
      });
      // Отзываем токен, если пользователь неактивен
      await revokeRefreshToken(refreshToken, 'User inactive');
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_NOT_AUTHENTICATED },
          { status: 401 }
        )
      );
    }

    // Используем данные пользователя из оптимизированного запроса
    const user = {
      id: dbVerification.user.id,
      username: dbVerification.user.username,
      user_id: dbVerification.user.user_id,
      dashboard_token: dbVerification.user.dashboard_token,
      is_active: dbVerification.user.is_active
    };

    // Проверяем подозрительную активность: изменение IP или User-Agent
    const currentIp = request.headers.get('x-forwarded-for') || 'unknown';
    const currentUserAgent = request.headers.get('user-agent') || 'unknown';
    const dbRecord = dbVerification.record;
    
    if (dbRecord) {
      // Если IP или User-Agent изменились, логируем для безопасности
      if (dbRecord.ip_address && dbRecord.ip_address !== currentIp) {
        logger.warn('Refresh token used from different IP', {
          userId: user.id,
          oldIp: dbRecord.ip_address,
          newIp: currentIp,
          tokenId: payload.jti
        });
      }
      
      if (dbRecord.user_agent && dbRecord.user_agent !== currentUserAgent) {
        logger.warn('Refresh token used with different User-Agent', {
          userId: user.id,
          oldUserAgent: dbRecord.user_agent,
          newUserAgent: currentUserAgent,
          tokenId: payload.jti
        });
      }
    }

    // Генерируем новые токены с той же версией
    const tokenVersion = payload.tokenVersion || 1;
    const newAccessToken = await generateAccessToken({
      userId: user.id,
      username: user.username,
      user_id: user.user_id,
    }, {
      tokenVersion
    });

    // Генерируем новый refresh token
    const newRefreshToken = await generateRefreshToken({
      userId: user.id,
    }, {
      tokenVersion
    });

    // Сохраняем новый refresh token в БД ПЕРЕД отзывом старого
    // Декодируем новый токен для получения jti (без верификации, так как мы его только что создали)
    const { decodeJwtWithoutVerification } = await import('@/lib/jwt');
    const decodedNewToken = decodeJwtWithoutVerification(newRefreshToken);
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const storeResult = await storeRefreshToken(
      user.id,
      newRefreshToken,
      {
        ipAddress,
        userAgent,
        fingerprint: decodedNewToken?.payload.jti || undefined // Используем jti как fingerprint
      }
    );

    // Если не удалось сохранить новый токен, НЕ отзываем старый и возвращаем ошибку
    if (!storeResult.success) {
      logger.error('Failed to store new refresh token - aborting rotation', {
        userId: user.id,
        error: storeResult.error,
        ip: ipAddress
      });
      
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Failed to refresh tokens. Please try again.' },
          { status: 500 }
        )
      );
    }

    // Только после успешного сохранения нового токена отзываем старый (rotation)
    const revokeResult = await revokeRefreshToken(refreshToken, 'Token rotation');
    
    if (!revokeResult.success) {
      // Логируем, но не блокируем - новый токен уже сохранен
      logger.warn('Failed to revoke old refresh token', {
        userId: user.id,
        error: revokeResult.error,
        ip: ipAddress
      });
    }

    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    const response = NextResponse.json(
      {
        message: 'Tokens refreshed',
        access_token: newAccessToken,
      },
      { status: 200 }
    );

    // Устанавливаем новые токены в cookies
    response.cookies.set('access_token', newAccessToken, {
      maxAge: 10 * 60, // 10 минут
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/'
    });

    response.cookies.set('refresh_token', newRefreshToken, {
      maxAge: 60 * 60 * 24 * 60, // 60 дней
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/'
    });

    logger.info('Tokens refreshed successfully', {
      userId: user.id,
      ip: request.headers.get('x-forwarded-for')
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Error refreshing tokens', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for')
    });
    return setCorsHeaders(
      NextResponse.json(
        { error: ERROR_INTERNAL_SERVER_ERROR },
        { status: 500 }
      )
    );
  }
}

