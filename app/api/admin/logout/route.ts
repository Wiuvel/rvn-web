import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { SessionManager } from '@/lib/auth/session-manager';
import { revokeCSRFToken } from '@/lib/security/csrf';

const ADMIN_SESSION_COOKIE = 'admin_session_id';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    const username = cookieStore.get('admin_username')?.value;

    if (sessionId) {
      await SessionManager.destroySession(sessionId);
      await revokeCSRFToken(sessionId);
    }

    await SessionManager.clearSessionCookie(ADMIN_SESSION_COOKIE);
    cookieStore.delete('admin_authenticated');
    cookieStore.delete('admin_username');

    if (username) {
      logger.info('Admin logout', {
        username,
        sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'none',
        ip: request.headers.get('x-forwarded-for'),
      });
    }

    return setCorsHeaders(
      NextResponse.json({ message: 'Admin logout successful' }, { status: 200 }),
    );
  } catch (error) {
    logger.error('Admin logout error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });
    return setCorsHeaders(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    );
  }
}


