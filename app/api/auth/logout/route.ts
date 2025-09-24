import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { SessionManager } from '@/lib/session-manager';
import { revokeCSRFToken } from '@/lib/csrf';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    const username = cookieStore.get('admin_username')?.value;
    
    // Destroy session if exists
    if (sessionId) {
      await SessionManager.destroySession(sessionId);
      await revokeCSRFToken(sessionId);
    }
    
    // Secure cookie deletion
    await SessionManager.clearSessionCookie();
    cookieStore.delete('admin_authenticated');
    cookieStore.delete('admin_username');

    // Log successful logout
    if (username) {
      logger.info('User logout', {
        username: username,
        sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'none',
        ip: request.headers.get('x-forwarded-for')
      });
    }

    return setCorsHeaders(
      NextResponse.json(
        { message: 'Logout successful' },
        { status: 200 }
      )
    );
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
