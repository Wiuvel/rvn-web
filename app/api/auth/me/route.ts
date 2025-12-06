import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserByToken } from '@/lib/auth/index';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { hasUserRole } from '@/lib/auth/user-roles';
import { SessionManager } from '@/lib/auth/session-manager';
import { SESSION_TIMEOUT } from '@/lib/utils/constants';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const dashboardToken = cookieStore.get('dashboard_token')?.value;
    const isAuthenticated = cookieStore.get('user_authenticated')?.value === 'true';
    const sessionId = cookieStore.get('session_id')?.value;

    // Validate session if exists
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    
    if (sessionId) {
      const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';
      const validation = SessionManager.validateSession(sessionId, ipAddress, userAgent);
      
      if (!validation.valid) {
        logger.warn('INVALID SESSION IN /api/auth/me', {
          sessionId: sessionId.substring(0, 8) + '...',
          reason: validation.reason,
          ip: ipAddress,
          hasAuthCookies: !!isAuthenticated && !!dashboardToken
        });
        
        // Если сессия невалидна, но есть другие auth cookies - это может быть временная проблема
        // Не удаляем cookies сразу, если есть другие признаки авторизации
        // Это позволяет избежать случайного выхода из аккаунта при временных проблемах с сессией
        if (!isAuthenticated || !dashboardToken) {
          // Нет других признаков авторизации - удаляем все cookies
          const response = NextResponse.json({ authenticated: false }, { status: 401 });
          response.cookies.delete('session_id');
          response.cookies.delete('user_authenticated');
          response.cookies.delete('user_id');
          response.cookies.delete('dashboard_token');
          return setCorsHeaders(response);
        }
        // Если есть другие auth cookies, продолжаем проверку пользователя
        // Сессия будет пересоздана при следующем логине
      }

      // Сессия валидна - getSession уже обновил время истечения в памяти
      // Cookie будет обновлен в response ниже
    }

    if (!isAuthenticated || !dashboardToken) {
      // Возвращаем 200 вместо 401, чтобы не выводить ошибку в консоль браузера
      // Это нормальная ситуация для неавторизованных пользователей
      const response = NextResponse.json({ authenticated: false });
      
      // Обновляем cookie сессии при активности, даже если пользователь не авторизован
      if (sessionId) {
        response.cookies.set('session_id', sessionId, {
          maxAge: SESSION_TIMEOUT / 1000,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production' && !isLocalhost,
          sameSite: 'strict',
          path: '/',
        });
      }
      
      return setCorsHeaders(response);
    }

    const user = await getUserByToken(dashboardToken);
    
    if (!user) {
      const response = NextResponse.json(
        { error: 'User not found', authenticated: false },
        { status: 404 }
      );
      
      // Обновляем cookie сессии при активности
      if (sessionId) {
        response.cookies.set('session_id', sessionId, {
          maxAge: SESSION_TIMEOUT / 1000,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production' && !isLocalhost,
          sameSite: 'strict',
          path: '/',
        });
      }
      
      return setCorsHeaders(response);
    }

    // Если сессия невалидна или отсутствует, но пользователь авторизован - пересоздаем сессию
    let currentSessionId = sessionId;
    if (!sessionId || (sessionId && !SessionManager.getSession(sessionId))) {
      const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';
      currentSessionId = SessionManager.createSession(
        user.id,
        user.username,
        ipAddress,
        userAgent
      );
      logger.info('Recreated session for authenticated user', {
        userId: user.id,
        sessionId: currentSessionId.substring(0, 8) + '...'
      });
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

    // Обновляем cookie сессии при активности (продлеваем время жизни)
    const response = NextResponse.json({
      authenticated: true,
      id: user.id,
      user_id: user.user_id,
      username: user.username,
      dashboard_token: user.dashboard_token,
      created_at: user.created_at,
      last_login: user.last_login,
      avatar_gradient: user.avatar_gradient,
      isSupport,
      isAdmin
    });

    // Обновляем cookie сессии через NextResponse при активности
    if (currentSessionId) {
      response.cookies.set('session_id', currentSessionId, {
        maxAge: SESSION_TIMEOUT / 1000, // Время жизни сессии в секундах
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'strict',
        path: '/',
      });
    }

    return setCorsHeaders(response);
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

