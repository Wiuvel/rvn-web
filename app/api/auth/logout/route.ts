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
    const token = cookieStore.get('token')?.value;

    // Destroy session if exists
    if (sessionId) {
      await SessionManager.destroySession(sessionId);
      await revokeCSRFToken(sessionId);
    }

    // Revoke device if token exists
    if (token) {
      await SessionManager.revokeDevice(token);
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
    response.cookies.delete('session_id');
    response.cookies.delete('token');
    response.cookies.delete('user_data');
    
    // Delete OAuth state cookie if exists
    response.cookies.delete('oauth_state');
    
    // ВАЖНО: НЕ удаляем protection cookies (access_granted, access_hash, access_time)
    // Эти куки дают иммунитет на 2 часа от Bot Challenge и не связаны с авторизацией пользователя
    // Они должны сохраняться при выходе из аккаунта для удобства пользователя

    await SessionManager.clearSessionCookie();
    cookieStore.delete('token');
    cookieStore.delete('user_data');
    cookieStore.delete('oauth_state');
    // НЕ удаляем protection cookies из cookieStore

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
