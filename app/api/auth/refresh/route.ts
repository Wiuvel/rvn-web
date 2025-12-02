import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyRefreshToken, generateAccessToken, generateRefreshToken } from '@/lib/jwt';
import { getUserByToken } from '@/lib/auth';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { ERROR_NOT_AUTHENTICATED, ERROR_INTERNAL_SERVER_ERROR } from '@/lib/constants';
import { generalRateLimit } from '@/lib/rate-limit';
import { verifyRefreshTokenInDB, storeRefreshToken, revokeRefreshToken } from '@/lib/jwt-storage';

export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * POST /api/auth/refresh
 * Обновление Access Token с помощью Refresh Token
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await generalRateLimit.check(request);
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

    // Проверяем токен в БД
    const dbVerification = await verifyRefreshTokenInDB(refreshToken, payload.userId);
    if (!dbVerification.valid) {
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

    // Получаем данные пользователя
    const user = await getUserByToken(payload.userId);
    if (!user) {
      logger.warn('User not found for refresh token', {
        userId: payload.userId,
        ip: request.headers.get('x-forwarded-for')
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_NOT_AUTHENTICATED },
          { status: 401 }
        )
      );
    }

    // Генерируем новые токены
    const newAccessToken = await generateAccessToken({
      userId: user.id,
      username: user.username,
      user_id: user.user_id,
    });

    // Отзываем старый refresh token (rotation)
    await revokeRefreshToken(refreshToken, 'Token rotation');

    // Генерируем новый refresh token
    const newRefreshToken = await generateRefreshToken({
      userId: user.id,
      tokenVersion: payload.tokenVersion || 1,
    });

    // Сохраняем новый refresh token в БД
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const storeResult = await storeRefreshToken(
      user.id,
      newRefreshToken,
      {
        ipAddress,
        userAgent
      }
    );

    if (!storeResult.success) {
      logger.warn('Failed to store new refresh token in DB', {
        userId: user.id,
        error: storeResult.error
      });
      // Продолжаем, даже если не удалось сохранить
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

