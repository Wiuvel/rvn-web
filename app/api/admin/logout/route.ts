import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { SessionManager } from '@/lib/session-manager';
import { revokeCSRFToken } from '@/lib/csrf';

const ADMIN_SESSION_COOKIE = 'admin_session_id';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    
    // Получаем username из сессии перед её уничтожением
    let username: string | null = null;
    if (sessionId) {
      const session = SessionManager.getSession(sessionId);
      if (session) {
        username = session.username;
      }
      SessionManager.destroySession(sessionId);
      revokeCSRFToken(sessionId);
    }

    await SessionManager.clearSessionCookie(ADMIN_SESSION_COOKIE);
    cookieStore.delete('admin_authenticated');

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


