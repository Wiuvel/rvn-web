import { NextRequest, NextResponse } from 'next/server';
import { generateCSRFToken, getCSRFStoreSize } from '@/lib/security/csrf';
import { generateSessionId } from '@/lib/utils/index';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('RATE LIMIT EXCEEDED FOR CSRF TOKEN REQUEST', {
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
      logger.info('CREATED NEW SESSION_ID FOR CSRF TOKEN', {
        sessionId: sessionId.substring(0, 8) + '...',
        ip: request.headers.get('x-forwarded-for')
      });
    }

    const csrfToken = generateCSRFToken(sessionId);
    
    // Логируем для отладки
    logger.info('CSRF TOKEN GENERATED', {
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
    logger.error('CSRF TOKEN GENERATION ERROR', {
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
