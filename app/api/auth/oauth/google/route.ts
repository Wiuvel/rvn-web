import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getEnv } from '@/lib/env-validation';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { logger } from '@/lib/secure-logger';
import { authRateLimit } from '@/lib/rate-limit';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await authRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for OAuth initiation', {
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          { status: 429 }
        )
      );
    }

    // Проверяем наличие Google OAuth credentials
    const env = getEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      logger.error('Google OAuth not configured', {
        hasClientId: !!env.GOOGLE_CLIENT_ID,
        hasClientSecret: !!env.GOOGLE_CLIENT_SECRET,
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'OAuth service is not configured' },
          { status: 503 }
        )
      );
    }

    // Генерируем state токен для CSRF защиты
    const state = randomBytes(32).toString('hex');
    
    // Определяем origin для production (учитываем прокси и заголовки)
    const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
    const origin = forwardedHost ? `https://${forwardedHost}` : request.nextUrl.origin;
    const redirectUri = `${origin}/api/auth/oauth/google/callback`;

    // Логируем для отладки
    logger.info('OAuth initiation', {
      provider: 'google',
      redirectUri,
      origin,
      forwardedHost,
      ip: request.headers.get('x-forwarded-for'),
    });

    const response = NextResponse.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'consent',
        state,
      }).toString()}`
    );

    // Сохраняем state в cookie
    response.cookies.set('oauth_state', state, {
      maxAge: 10 * 60, // 10 минут
      httpOnly: true,
      secure: true, // Всегда secure для production
      sameSite: 'lax',
      path: '/',
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('OAuth initiation error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });
    return setCorsHeaders(
      NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    );
  }
}

