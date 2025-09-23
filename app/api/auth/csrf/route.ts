import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generateCSRFToken, generateSessionId } from '@/lib/csrf';
import { generalRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: Request) {
  try {
    // Rate limiting
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for CSRF token request', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent')
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Too many requests' },
          { status: 429 }
        )
      );
    }

    const cookieStore = await cookies();
    let sessionId = cookieStore.get('session_id')?.value;

    // Если session ID не существует, создаем новый
    if (!sessionId) {
      sessionId = generateSessionId();
      const hostname = new URL(request.url).hostname;
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
      
      cookieStore.set('session_id', sessionId, {
        maxAge: 60 * 60 * 24, // 24 часа
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax',
        path: '/'
      });
    }

    const csrfToken = generateCSRFToken(sessionId);

    return setCorsHeaders(
      NextResponse.json({
        csrfToken
      })
    );
  } catch (error) {
    logger.error('CSRF token generation error', {
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
