import { NextRequest, NextResponse } from 'next/server';
import { generateCSRFToken } from '@/lib/security/csrf';
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
      // Rate limit - не логируем
      return setCorsHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));
    }

    let sessionId = request.cookies.get('session_id')?.value;
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Если session ID не существует, создаем новый
    if (!sessionId) {
      sessionId = generateSessionId();
      // Создана новая сессия - не логируем
    }

    const csrfToken = await generateCSRFToken(sessionId);

    // Логируем для отладки
    // CSRF токен сгенерирован - не логируем

    // Создаем response
    const response = NextResponse.json({
      csrfToken,
    });

    // Устанавливаем cookie только если session_id был создан новый
    if (!request.cookies.get('session_id')) {
      response.cookies.set('session_id', sessionId, {
        maxAge: 60 * 60 * 24, // 24 часа
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax',
        path: '/',
      });
    }

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('CSRF token generation error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });
    return setCorsHeaders(NextResponse.json({ error: 'Internal server error' }, { status: 500 }));
  }
}
