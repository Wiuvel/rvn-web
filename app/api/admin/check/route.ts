import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generalRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { checkAdminExists } from '@/lib/auth';
import { SessionManager } from '@/lib/session-manager';

const ADMIN_SESSION_COOKIE = 'admin_session_id';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: Request) {
  try {
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for admin auth check', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return setCorsHeaders(
        NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      );
    }

    const adminExists = await checkAdminExists();
    const cookieStore = await cookies();
    const isAuthenticated = cookieStore.get('admin_authenticated')?.value === 'true';
    
    // Получаем username из сессии
    let username: string | null = null;
    if (isAuthenticated) {
      const sessionId = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
      if (sessionId) {
        const session = SessionManager.getSession(sessionId);
        if (session) {
          username = session.username;
        }
      }
    }

    return setCorsHeaders(
      NextResponse.json({
        isAuthenticated,
        username: isAuthenticated ? username : null,
        adminExists,
      }),
    );
  } catch (error) {
    logger.error('Admin auth check error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });
    return setCorsHeaders(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    );
  }
}


