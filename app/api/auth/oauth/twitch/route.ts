import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getEnv } from '@/lib/validation/env-validation';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';
import { authRateLimit } from '@/lib/security/rate-limit';
import { getErrorRedirectUrl } from '@/lib/utils/oauth-errors';

// Handle CORS preflight
export async function OPTIONS() {
  return handleCorsPreflight();
}

// Initiate Twitch OAuth flow
export async function GET(request: NextRequest) {
  try {
    const env = getEnv();
    if (!env.PUBLIC_DOMAIN) {
      logger.error('Public domain not configured');
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

    // Detect popup flow early for error handling
    const referer = request.headers.get('referer') || '';
    const isPopup = referer.includes('/auth/oauth-handler') || 
                    referer.includes('popup') ||
                    request.nextUrl.searchParams.get('popup') === 'true';

    // Rate limiting
    const rateLimitResult = await authRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      const errorUrl = getErrorRedirectUrl('rate_limit', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Check Twitch OAuth credentials
    if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
      logger.error('Twitch OAuth not configured');
      const errorUrl = getErrorRedirectUrl('oauth_not_configured', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Generate CSRF state token
    const state = randomBytes(32).toString('hex');
    const redirectUri = `${origin}/api/auth/oauth/twitch/callback`;

    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Store popup flag in state cookie for callback
    const stateWithPopup = isPopup ? `${state}:popup` : state;

    // Redirect to Twitch OAuth
    const response = NextResponse.redirect(
      `https://id.twitch.tv/oauth2/authorize?${new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'user:read:email',
        state: stateWithPopup,
        force_verify: 'true',
      }).toString()}`
    );

    // Store state in cookie for CSRF protection (with popup flag if needed)
    response.cookies.set('oauth_state', stateWithPopup, {
      maxAge: 10 * 60,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'lax',
      path: '/',
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Twitch OAuth initiation error', {
      error: error instanceof Error ? error.message : 'Unknown error'
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

