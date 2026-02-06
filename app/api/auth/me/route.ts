import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkAuth } from '@/lib/auth/helper';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { hasUserRole } from '@/lib/auth/user-roles';
import { SESSION_TIMEOUT } from '@/lib/utils/constants';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await checkAuth(request);
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (!authResult.isAuthenticated || !authResult.user) {
      // Clear invalid cookies to prevent redirect loops
      const response = NextResponse.json({ authenticated: false });
      
      // Clear user_data cookie
      response.cookies.set('user_data', '', {
        maxAge: 0,
        path: '/',
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'strict'
      });
      
      // Clear session cookies if they exist but are invalid
      response.cookies.set('session_id', '', {
        maxAge: 0,
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'strict'
      });

      return setCorsHeaders(response);
    }

    const user = authResult.user;
    const cookieStore = await cookies();
    const currentSessionId = cookieStore.get('session_id')?.value;

    // Проверяем роли пользователя
    let isSupport = false;
    let isAdmin = false;
    try {
      isSupport = await hasUserRole(user.id, 'support');
      isAdmin = await hasUserRole(user.id, 'admin');
    } catch (error) {
      logger.error('Error checking user roles', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: user.id
      });
    }

    const { setUserDataCookie } = await import('@/lib/auth/helper');
    await setUserDataCookie(user, isLocalhost);

    const response = NextResponse.json({
      authenticated: true,
      id: user.id,
      user_id: user.user_id,
      username: user.username,
      token: user.token, // для WebSocket auth
      created_at: user.created_at,
      last_login: user.last_login,
      avatar: user.avatar,
      banner: user.banner || null,
      isSupport,
      isAdmin
    });

    // Продлеваем cookie сессии при активности
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
    logger.error('Error getting user', {
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

