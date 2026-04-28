import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getEnv } from '@/lib/validation/env-validation';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';
import { authRateLimit } from '@/lib/security/rate-limit';
import { getErrorRedirectUrl } from '@/lib/auth/oauth-errors';
import { domains } from '@/lib/utils';

// Handle CORS preflight
export async function OPTIONS() {
  return handleCorsPreflight();
}

// Initiate Yandex OAuth flow
export async function GET(request: NextRequest) {
  try {
    const env = getEnv();
    const origin = domains.mainUrl.endsWith('/') ? domains.mainUrl.slice(0, -1) : domains.mainUrl;

    // Check if request is from popup (oauth-handler page opens in popup)
    const referer = request.headers.get('referer') || '';
    const isPopup =
      referer.includes('/auth/oauth-handler') ||
      referer.includes('popup') ||
      request.nextUrl.searchParams.get('popup') === 'true';

    // Rate limiting
    const rateLimitResult = await authRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      const errorUrl = getErrorRedirectUrl('rate_limit', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Check Yandex OAuth credentials
    if (!env.YANDEX_CLIENT_ID || !env.YANDEX_CLIENT_SECRET) {
      logger.error('OAuth: Yandex not configured.');
      const errorUrl = getErrorRedirectUrl('oauth_not_configured', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Generate CSRF state token
    const state = randomBytes(32).toString('hex');
    const redirectUri = `${origin}/api/auth/oauth/yandex/callback`;

    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Store popup flag in state cookie for callback
    const stateWithPopup = isPopup ? `${state}:popup` : state;

    // Redirect to Yandex OAuth
    // Request access to: login:info (login, name, surname, gender), login:avatar (portrait), login:email (email)
    const response = NextResponse.redirect(
      `https://oauth.yandex.ru/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: env.YANDEX_CLIENT_ID,
        redirect_uri: redirectUri,
        state: stateWithPopup,
        scope: 'login:info login:avatar login:email',
      }).toString()}`,
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
    logger.error('OAuth: Yandex initiation error.', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    try {
      if (domains.mainUrl) {
        const origin = domains.mainUrl.endsWith('/')
          ? domains.mainUrl.slice(0, -1)
          : domains.mainUrl;
        const errorUrl = getErrorRedirectUrl('oauth_init_error', origin, false);
        return setCorsHeaders(NextResponse.redirect(errorUrl));
      }
    } catch {}

    return setCorsHeaders(NextResponse.json({ error: 'Internal server error' }, { status: 500 }));
  }
}
