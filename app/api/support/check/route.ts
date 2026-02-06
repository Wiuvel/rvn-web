import { NextRequest, NextResponse } from 'next/server';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { checkAuth } from '@/lib/auth/helper';
import { hasUserRole } from '@/lib/auth/user-roles';
import { ERROR_INTERNAL_SERVER_ERROR, ERROR_TOO_MANY_REQUESTS } from '@/lib/utils/constants';

export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * Проверяет, имеет ли пользователь права доступа к панели поддержки
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for support check', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent')
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_TOO_MANY_REQUESTS },
          { status: 429 }
        )
      );
    }

    const authResult = await checkAuth(request);
    if (!authResult.isAuthenticated || !authResult.user) {
      return setCorsHeaders(
        NextResponse.json({
          isAuthenticated: false,
          hasSupportAccess: false
        })
      );
    }
    const user = authResult.user;

    // Проверяем роль поддержки (может выбросить ошибку если БД не настроена)
    let hasSupportAccess = false;
    try {
      hasSupportAccess = await hasUserRole(user.id, 'support');
    } catch (dbError) {
      // Если ошибка БД, возвращаем информацию о пользователе, но без доступа
      logger.error('Database error in support check', {
        error: dbError instanceof Error ? dbError.message : 'Unknown error',
        userId: user.id
      });
        return setCorsHeaders(
          NextResponse.json({
            isAuthenticated: true,
            hasSupportAccess: false,
            username: user.username,
            userId: user.id,
            user_id: user.user_id,
          token: user.token, // для WebSocket
            error: 'Database not configured'
          })
        );
    }

    return setCorsHeaders(
      NextResponse.json({
        isAuthenticated: true,
        hasSupportAccess,
        username: user.username,
        userId: user.id,
        user_id: user.user_id, // Добавляем user_id для отображения
        token: user.token // для WebSocket
      })
    );
  } catch (error) {
    logger.error('Error in GET /api/support/check', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for')
    });

    const authResult = await checkAuth(request);
    if (authResult.isAuthenticated && authResult.user) {
      const user = authResult.user;
      return setCorsHeaders(
        NextResponse.json({
          isAuthenticated: true,
          hasSupportAccess: false,
          username: user.username,
          userId: user.id,
          user_id: user.user_id,
          token: user.token,
          error: 'Database not configured'
        })
      );
    }

    return setCorsHeaders(
      NextResponse.json(
        { 
          error: ERROR_INTERNAL_SERVER_ERROR,
          isAuthenticated: false,
          hasSupportAccess: false
        },
        { status: 500 }
      )
    );
  }
}

