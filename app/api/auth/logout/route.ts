import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { SessionManager } from '@/lib/auth/session-manager';
import { revokeCSRFToken } from '@/lib/security/csrf';

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
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isVercel = hostname.includes('vercel.app');
    let cookieDomain: string | undefined;
    if (!isLocalhost && !isVercel && hostname.includes('rvn.market')) {
      cookieDomain = '.rvn.market';
    }

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
    
    // Delete protection cookies (may have domain set)
    // For cookies with domain, we need to explicitly set them to expire
    const protectionCookies = ['access_granted', 'access_hash', 'access_time'];
    protectionCookies.forEach(cookieName => {
      response.cookies.delete(cookieName);
      // Also try to delete with domain if applicable
      if (cookieDomain) {
        response.cookies.set(cookieName, '', {
          maxAge: 0,
          path: '/',
          domain: cookieDomain,
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production' && !isLocalhost,
          sameSite: 'lax'
        });
      }
    });

    // Also delete from cookieStore for immediate effect
    await SessionManager.clearSessionCookie();
    cookieStore.delete('user_authenticated');
    cookieStore.delete('user_id');
    cookieStore.delete('dashboard_token');
    cookieStore.delete('oauth_state');
    protectionCookies.forEach(cookieName => {
      cookieStore.delete(cookieName);
    });

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
