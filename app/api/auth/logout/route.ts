import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { SessionManager } from '@/lib/session-manager';
import { revokeCSRFToken } from '@/lib/csrf';
import { revokeRefreshToken, revokeAllUserRefreshTokens } from '@/lib/jwt-storage';
import { verifyAuth } from '@/lib/auth-unified';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    const refreshToken = cookieStore.get('refresh_token')?.value;
    
    // Получаем user_id из JWT токена
    let userId: string | null = null;
    const authResult = await verifyAuth(request);
    if (authResult.isAuthenticated && authResult.user) {
      userId = authResult.user.id;
    }
    
    // Отзываем refresh токен из БД
    if (refreshToken) {
      await revokeRefreshToken(refreshToken, 'User logout');
    }

    // Отзываем все refresh токены пользователя (для безопасности)
    if (userId) {
      const revokeResult = await revokeAllUserRefreshTokens(userId, 'User logout');
      if (revokeResult.success && revokeResult.revokedCount) {
        logger.info('Revoked all user refresh tokens', {
          userId,
          revokedCount: revokeResult.revokedCount
        });
      }
    }
    
    // Destroy session if exists
    if (sessionId) {
      SessionManager.destroySession(sessionId);
      revokeCSRFToken(sessionId);
    }
    
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Secure cookie deletion
    await SessionManager.clearSessionCookie();

    // Log successful logout
    if (userId) {
      logger.info('User logout', {
        userId: userId,
        sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'none',
        ip: request.headers.get('x-forwarded-for')
      });
    }

    // Очищаем JWT токены
    const response = NextResponse.json(
      { message: 'Logout successful' },
      { status: 200 }
    );

    // Удаляем JWT токены из cookies
    response.cookies.delete('access_token');
    response.cookies.delete('refresh_token');

    // Также устанавливаем пустые значения с истекшим временем для надежности
    response.cookies.set('access_token', '', {
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/'
    });

    response.cookies.set('refresh_token', '', {
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/'
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Logout error', {
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
