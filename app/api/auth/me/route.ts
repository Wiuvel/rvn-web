import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-unified';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { hasUserRole } from '@/lib/user-roles';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);

    if (!authResult.isAuthenticated || !authResult.user) {
      // Возвращаем 200 вместо 401, чтобы не выводить ошибку в консоль браузера
      // Это нормальная ситуация для неавторизованных пользователей
      return setCorsHeaders(
        NextResponse.json(
          { authenticated: false }
        )
      );
    }

    // Проверяем роли пользователя
    let isSupport = false;
    let isAdmin = false;
    try {
      isSupport = await hasUserRole(authResult.user.id, 'support');
      isAdmin = await hasUserRole(authResult.user.id, 'admin');
    } catch (error) {
      logger.warn('Error checking user roles', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: authResult.user.id
      });
    }

    return setCorsHeaders(
      NextResponse.json({
        id: authResult.user.id,
        user_id: authResult.user.user_id,
        username: authResult.user.username,
        dashboard_token: authResult.user.dashboard_token,
        created_at: authResult.user.created_at,
        last_login: authResult.user.last_login,
        avatar_gradient: authResult.user.avatar_gradient,
        isSupport,
        isAdmin
      })
    );
  } catch (error) {
    // Логируем только реальные ошибки сервера, а не нормальные случаи отсутствия авторизации
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isExpectedError = errorMessage.includes('Not authenticated') || 
                            errorMessage.includes('No token') ||
                            errorMessage.includes('expired') ||
                            errorMessage.includes('invalid');
    
    if (!isExpectedError) {
      logger.error('Unexpected error in /api/auth/me', {
        error: errorMessage,
        ip: request.headers.get('x-forwarded-for')
      });
    }
    
    return setCorsHeaders(
      NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    );
  }
}

