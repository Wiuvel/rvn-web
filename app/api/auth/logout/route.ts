import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { SessionManager } from '@/lib/auth/session-manager';
import { revokeCSRFToken } from '@/lib/security/csrf';
import { getCookieDomain } from '@/lib/utils';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    const userId = cookieStore.get('user_id')?.value;
    
    // Destroy session if exists
    if (sessionId) {
      SessionManager.destroySession(sessionId);
      revokeCSRFToken(sessionId);
    }
    
    // Get hostname for cookie domain handling
    const hostname = request.nextUrl.hostname;
    const cookieDomain = getCookieDomain(hostname);

    // Create response
    const response = NextResponse.json(
      { message: 'Logout successful' },
      { status: 200 }
    );

    // Delete all authentication cookies
    // Use response.cookies.delete() to ensure proper deletion, including cookies with domains
    response.cookies.delete('session_id');
    response.cookies.delete('user_authenticated');
    response.cookies.delete('user_id');
    response.cookies.delete('dashboard_token');
    
    // Delete OAuth state cookie if exists
    response.cookies.delete('oauth_state');
    
    // ВАЖНО: НЕ удаляем protection cookies (access_granted, access_hash, access_time)
    // Эти куки дают иммунитет на 2 часа от Bot Challenge и не связаны с авторизацией пользователя
    // Они должны сохраняться при выходе из аккаунта для удобства пользователя

    // Also delete from cookieStore for immediate effect
    await SessionManager.clearSessionCookie();
    cookieStore.delete('user_authenticated');
    cookieStore.delete('user_id');
    cookieStore.delete('dashboard_token');
    cookieStore.delete('oauth_state');
    // НЕ удаляем protection cookies из cookieStore

    // Log successful logout
    if (userId) {
      // Выход пользователя - не логируем
    }

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
