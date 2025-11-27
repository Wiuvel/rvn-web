import { NextRequest, NextResponse } from 'next/server';
import { generateCSRFToken, generateSessionId, getCSRFStoreSize } from '@/lib/csrf';
import { generalRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
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

    let sessionId = request.cookies.get('session_id')?.value;
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Если session ID не существует, создаем новый
    if (!sessionId) {
      sessionId = generateSessionId();
      logger.info('Created new session_id for CSRF token', {
        sessionId: sessionId.substring(0, 8) + '...',
        ip: request.headers.get('x-forwarded-for')
      });
    }

    const csrfToken = generateCSRFToken(sessionId);
    
    // Логируем для отладки
    logger.info('CSRF token generated', {
      sessionId: sessionId.substring(0, 8) + '...',
      tokenLength: csrfToken.length,
      storeSize: getCSRFStoreSize(),
      ip: request.headers.get('x-forwarded-for')
    });

    // Создаем response
    const response = NextResponse.json({
      csrfToken
    });

    // Устанавливаем cookie только если session_id был создан новый
    if (!request.cookies.get('session_id')) {
      response.cookies.set('session_id', sessionId, {
        maxAge: 60 * 60 * 24, // 24 часа
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax',
        path: '/'
      });
    }

    return setCorsHeaders(response);
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
