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
    
    // Secure cookie deletion
    await SessionManager.clearSessionCookie();
    cookieStore.delete('user_authenticated');
    cookieStore.delete('user_id');
    cookieStore.delete('dashboard_token');

    // Log successful logout
    if (userId) {
      logger.info('User logout', {
        userId: userId,
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
