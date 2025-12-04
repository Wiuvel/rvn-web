import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getEnv } from '@/lib/validation/env-validation';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';
import { authRateLimit } from '@/lib/security/rate-limit';
import { getErrorRedirectUrl, getOAuthErrorMessage } from '@/lib/utils/oauth-errors';

// Handle CORS preflight
export async function OPTIONS() {
  return handleCorsPreflight();
}

// Initiate Telegram OAuth flow
export async function GET(request: NextRequest) {
  try {
    const env = getEnv();
    if (!env.PUBLIC_DOMAIN) {
      logger.error('public_domain not configured');
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
      logger.warn('rate limit exceeded');
      const errorUrl = getErrorRedirectUrl('rate_limit', origin, false);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Check Telegram OAuth credentials
    if (!env.TELEGRAM_BOT_TOKEN) {
      logger.error('telegram oauth not configured');
      const errorUrl = getErrorRedirectUrl('oauth_not_configured', origin, false);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Generate CSRF state token
    const state = randomBytes(32).toString('hex');

    logger.info('telegram oauth initiated');

    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Telegram Login Widget works via JavaScript widget on client-side
    // Telegram Login Widget requires bot username (e.g., "@my_bot"), not bot ID
    // Bot username should be set in TELEGRAM_BOT_USERNAME env variable
    if (!env.TELEGRAM_BOT_USERNAME) {
      logger.error('TELEGRAM_BOT_USERNAME not configured');
      return setCorsHeaders(
        NextResponse.json(
          { 
            error: 'oauth_not_configured',
            message: getOAuthErrorMessage('oauth_not_configured')
          },
          { status: 503 }
        )
      );
    }
    
    // Remove @ if present (Telegram widget expects username without @)
    const botUsername = env.TELEGRAM_BOT_USERNAME.replace(/^@/, '');
    
    // Return bot_username as JSON for client-side widget initialization
    // Client will load Telegram Login Widget and send data to POST endpoint
    const response = NextResponse.json({ botUsername, state });

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
    logger.error('telegram oauth initiation error', {
      error: error instanceof Error ? error.message : 'unknown error'
    });
    
    try {
      const env = getEnv();
      if (env.PUBLIC_DOMAIN) {
        const origin = env.PUBLIC_DOMAIN.endsWith('/') 
          ? env.PUBLIC_DOMAIN.slice(0, -1) 
          : env.PUBLIC_DOMAIN;
        const errorUrl = getErrorRedirectUrl('oauth_init_error', origin, false);
        return setCorsHeaders(NextResponse.redirect(errorUrl));
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

