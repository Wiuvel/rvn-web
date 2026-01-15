import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getEnv } from '@/lib/validation/env-validation';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';
import { authRateLimit } from '@/lib/security/rate-limit';
import { getErrorRedirectUrl } from '@/lib/utils/oauth-errors';
import { domains } from '@/lib/utils';

// Handle CORS preflight
export async function OPTIONS() {
  return handleCorsPreflight();
}

// Initiate Google OAuth flow
export async function GET(request: NextRequest) {
  try {
    const env = getEnv();
    const origin = domains.mainUrl.endsWith('/') 
      ? domains.mainUrl.slice(0, -1) 
      : domains.mainUrl;

    // Check if request is from popup (oauth-handler page opens in popup)
    // This must be determined early as it's used in error handling
    const referer = request.headers.get('referer') || '';
    const isPopup = referer.includes('/auth/oauth-handler') || 
                    referer.includes('popup') ||
                    request.nextUrl.searchParams.get('popup') === 'true';

    // Rate limiting
    const rateLimitResult = await authRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      // Rate limit - не логируем
      const errorUrl = getErrorRedirectUrl('rate_limit', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Check Google OAuth credentials
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      logger.error('Google OAuth not configured');
      const errorUrl = getErrorRedirectUrl('oauth_not_configured', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Generate CSRF state token
    const state = randomBytes(32).toString('hex');
    const redirectUri = `${origin}/api/auth/oauth/google/callback`;

    // OAuth инициирован - не логируем

    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    
    // Store popup flag in state cookie for callback
    const stateWithPopup = isPopup ? `${state}:popup` : state;

    // Redirect to Google OAuth
    const response = NextResponse.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'consent',
        state: stateWithPopup,
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
    logger.error('OAuth initiation error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    try {
      const env = getEnv();
      if (domains.mainUrl) {
        const origin = domains.mainUrl.endsWith('/') 
          ? domains.mainUrl.slice(0, -1) 
          : domains.mainUrl;
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
