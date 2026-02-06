import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generateCSRFToken } from '@/lib/security/csrf';
import { generateSessionId } from '@/lib/utils/index';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';

const ADMIN_SESSION_COOKIE = 'admin_session_id';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: Request) {
  try {
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      // Rate limit - не логируем
      return setCorsHeaders(
        NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      );
    }

    const cookieStore = await cookies();
    let sessionId = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

    if (!sessionId) {
      sessionId = generateSessionId();
      const hostname = new URL(request.url).hostname;
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

      cookieStore.set(ADMIN_SESSION_COOKIE, sessionId, {
        maxAge: 60 * 60 * 24,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax',
        path: '/',
      });
    }

    const csrfToken = await generateCSRFToken(sessionId);

    return setCorsHeaders(
      NextResponse.json({
        csrfToken,
      }),
    );
  } catch (error) {
    logger.error('Admin CSRF token generation error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });
    return setCorsHeaders(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    );
  }
}


