import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { SessionManager } from '@/lib/auth/session-manager';
import { revokeCSRFToken } from '@/lib/security/csrf';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
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

    // Get redirect URL
    const redirectUrl = request.nextUrl.searchParams.get('redirect') || '/auth';

    // Create redirect response with correct host
    const host = request.headers.get('host') || request.nextUrl.host;
    const protocol =
      request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '');
    const baseUrl = `${protocol}://${host}`;

    let targetUrl: URL;
    try {
      targetUrl = new URL(redirectUrl, baseUrl);
    } catch (e) {
      targetUrl = new URL('/auth', baseUrl);
    }

    const response = NextResponse.redirect(targetUrl);

    // Delete all authentication cookies explicitly with proper path
    response.cookies.set('session_id', '', { maxAge: 0, path: '/' });
    response.cookies.set('token', '', { maxAge: 0, path: '/' });
    response.cookies.set('user_data', '', { maxAge: 0, path: '/' });
    response.cookies.set('oauth_state', '', { maxAge: 0, path: '/' });

    // Clear cookies in store as well (server-side effect)
    await SessionManager.clearSessionCookie();
    cookieStore.delete('token');
    cookieStore.delete('user_data');
    cookieStore.delete('oauth_state');

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Logout error (GET)', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });

    const host = request.headers.get('host') || request.nextUrl.host;
    const protocol =
      request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '');
    const baseUrl = `${protocol}://${host}`;

    // Fallback to auth page on error
    const response = NextResponse.redirect(new URL('/auth', baseUrl));
    response.cookies.set('session_id', '', { maxAge: 0, path: '/' });
    response.cookies.set('token', '', { maxAge: 0, path: '/' });
    response.cookies.set('user_data', '', { maxAge: 0, path: '/' });
    return setCorsHeaders(response);
  }
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

    // For API calls (POST), just return success with cleared cookies
    const response = NextResponse.json({ success: true });

    // Delete all authentication cookies
    response.cookies.set('session_id', '', { maxAge: 0, path: '/' });
    response.cookies.set('token', '', { maxAge: 0, path: '/' });
    response.cookies.set('user_data', '', { maxAge: 0, path: '/' });
    response.cookies.set('oauth_state', '', { maxAge: 0, path: '/' });

    await SessionManager.clearSessionCookie();
    cookieStore.delete('token');
    cookieStore.delete('user_data');
    cookieStore.delete('oauth_state');

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Logout error (POST)', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });
    return setCorsHeaders(NextResponse.json({ error: 'Internal server error' }, { status: 500 }));
  }
}
