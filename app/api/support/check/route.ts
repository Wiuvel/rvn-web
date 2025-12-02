import { NextRequest, NextResponse } from 'next/server';
import { generalRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { verifyAuth } from '@/lib/auth-unified';
import { hasUserRole } from '@/lib/user-roles';
import { ERROR_INTERNAL_SERVER_ERROR, ERROR_TOO_MANY_REQUESTS } from '@/lib/constants';

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

    // Проверка авторизации пользователя
    const authResult = await verifyAuth(request);

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
        user_id: user.user_id // Добавляем user_id для отображения
      })
    );
  } catch (error) {
    logger.error('Error in GET /api/support/check', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for')
    });
    
    // При ошибке БД возвращаем 200 с информацией об ошибке, а не 500
    const authResult = await verifyAuth(request);
    
    if (authResult.isAuthenticated && authResult.user) {
      return setCorsHeaders(
        NextResponse.json({
          isAuthenticated: true,
          hasSupportAccess: false,
          username: authResult.user.username,
          userId: authResult.user.id,
          user_id: authResult.user.user_id,
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

