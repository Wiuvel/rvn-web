import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserByToken } from '@/lib/auth';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { hasUserRole } from '@/lib/user-roles';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const dashboardToken = cookieStore.get('dashboard_token')?.value;
    const isAuthenticated = cookieStore.get('user_authenticated')?.value === 'true';

    if (!isAuthenticated || !dashboardToken) {
      // Возвращаем 200 вместо 401, чтобы не выводить ошибку в консоль браузера
      // Это нормальная ситуация для неавторизованных пользователей
      return setCorsHeaders(
        NextResponse.json(
          { authenticated: false }
        )
      );
    }

    const user = await getUserByToken(dashboardToken);
    
    if (!user) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      );
    }

    // Проверяем роли пользователя
    let isSupport = false;
    let isAdmin = false;
    try {
      isSupport = await hasUserRole(user.id, 'support');
      isAdmin = await hasUserRole(user.id, 'admin');
    } catch (error) {
      // Игнорируем ошибки проверки ролей, просто не устанавливаем флаги
      logger.warn('Error checking user roles', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: user.id
      });
    }

    return setCorsHeaders(
      NextResponse.json({
        id: user.id,
        user_id: user.user_id,
        username: user.username,
        dashboard_token: user.dashboard_token,
        created_at: user.created_at,
        last_login: user.last_login,
        avatar_gradient: user.avatar_gradient,
        isSupport,
        isAdmin
      })
    );
  } catch (error) {
    logger.error('Get user error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for')
    });
    return setCorsHeaders(
      NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    );
  }
}

