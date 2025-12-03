import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getEnv } from '@/lib/validation/env-validation';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';
import { authRateLimit } from '@/lib/security/rate-limit';

// Handle CORS preflight
export async function OPTIONS() {
  return handleCorsPreflight();
}

// Initiate Telegram OAuth flow
export async function GET(request: NextRequest) {
  try {
    const env = getEnv();
    if (!env.PUBLIC_DOMAIN) {
      logger.error('PUBLIC_DOMAIN NOT CONFIGURED');
      return setCorsHeaders(
        NextResponse.json(
          { error: 'OAuth service not configured' },
          { status: 503 }
        )
      );
    }

    const origin = env.PUBLIC_DOMAIN.endsWith('/') 
      ? env.PUBLIC_DOMAIN.slice(0, -1) 
      : env.PUBLIC_DOMAIN;

    // Rate limiting
    const rateLimitResult = await authRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('RATE LIMIT EXCEEDED FOR TELEGRAM OAUTH INITIATION', {
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=rate_limit', origin)
        )
      );
    }

    // Check Telegram OAuth credentials
    if (!env.TELEGRAM_BOT_TOKEN) {
      logger.error('TELEGRAM OAUTH NOT CONFIGURED', {
        hasBotToken: !!env.TELEGRAM_BOT_TOKEN,
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=oauth_not_configured', origin)
        )
      );
    }

    // Generate CSRF state token
    const state = randomBytes(32).toString('hex');
    const redirectUri = `${origin}/api/auth/oauth/telegram/callback`;

    logger.info('TELEGRAM OAUTH INITIATION', {
      provider: 'telegram',
      redirectUri,
      origin,
      ip: request.headers.get('x-forwarded-for'),
    });

    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Telegram Login Widget works via JavaScript widget on client-side
    // Extract bot ID from token (format: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz")
    const botId = env.TELEGRAM_BOT_TOKEN.split(':')[0];
    
    // Return bot_id as JSON for client-side widget initialization
    // Client will load Telegram Login Widget and send data to POST endpoint
    const response = NextResponse.json({ botId, state });

    // Store state in cookie for CSRF protection
    response.cookies.set('oauth_state', state, {
      maxAge: 10 * 60,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'lax',
      path: '/',
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('TELEGRAM OAUTH INITIATION ERROR', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });
    
    try {
      const env = getEnv();
      if (env.PUBLIC_DOMAIN) {
        const origin = env.PUBLIC_DOMAIN.endsWith('/') 
          ? env.PUBLIC_DOMAIN.slice(0, -1) 
          : env.PUBLIC_DOMAIN;
        return setCorsHeaders(
          NextResponse.redirect(
            new URL('/auth?error=oauth_init_error', origin)
          )
        );
      }
    } catch {
    }
    
    return setCorsHeaders(
      NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    );
  }
}

