import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/validation/env-validation';
import { createUserFromOAuth, getUserByEmail } from '@/lib/auth/index';
import { SessionManager } from '@/lib/auth/session-manager';
import { sanitizeInput } from '@/lib/security/sanitize';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';
import { authRateLimit } from '@/lib/security/rate-limit';
import { getErrorRedirectUrl } from '@/lib/auth/oauth-errors';
import { domains, getCookieDomain } from '@/lib/utils';

export async function OPTIONS() {
  return handleCorsPreflight();
}

// Handle Twitch OAuth callback
export async function GET(request: NextRequest) {
  try {
    const env = getEnv();
    const origin = domains.mainUrl.endsWith('/') ? domains.mainUrl.slice(0, -1) : domains.mainUrl;

    // Determine popup mode early
    const { searchParams } = request.nextUrl;
    const state = searchParams.get('state');
    const storedState = request.cookies.get('oauth_state')?.value;
    const referer = request.headers.get('referer') || '';
    let isPopup = false;
    if (storedState) {
      isPopup = storedState.includes(':popup');
    }
    if (!isPopup && referer.includes('/auth/oauth-handler')) {
      isPopup = true;
    }
    if (!isPopup && state && state.includes(':popup')) {
      isPopup = true;
    }

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

    // Get OAuth parameters
    const code = searchParams.get('code');
    const twitchError = searchParams.get('error');

    if (twitchError) {
      const errorCode = twitchError === 'access_denied' ? 'oauth_denied' : 'invalid_request';
      const errorUrl = getErrorRedirectUrl(errorCode, origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Validate required parameters
    if (!code || !state) {
      const errorUrl = getErrorRedirectUrl('invalid_request', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Verify CSRF state token
    const cleanState = isPopup ? state.split(':')[0] : state;
    const cleanStoredState = storedState?.includes(':popup')
      ? storedState.split(':')[0]
      : storedState;

    if (!cleanStoredState || cleanStoredState !== cleanState) {
      const errorUrl = getErrorRedirectUrl('invalid_state', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    const redirectUri = `${origin}/api/auth/oauth/twitch/callback`;

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret: env.TWITCH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      logger.error('Failed to exchange Twitch OAuth code', {
        status: tokenResponse.status,
      });
      const errorUrl = getErrorRedirectUrl('token_exchange_failed', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    const tokenData = await tokenResponse.json();
    const { access_token } = tokenData;

    if (!access_token) {
      logger.error('No access token in Twitch OAuth response');
      const errorUrl = getErrorRedirectUrl('no_access_token', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Fetch user info from Twitch
    const userInfoResponse = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Client-Id': env.TWITCH_CLIENT_ID,
      },
    });

    if (!userInfoResponse.ok) {
      logger.error('Failed to fetch Twitch user info', { status: userInfoResponse.status });
      const errorUrl = getErrorRedirectUrl('user_info_failed', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    const userInfo = await userInfoResponse.json();
    const twitchUser = Array.isArray(userInfo?.data) ? userInfo.data[0] : null;

    if (!twitchUser) {
      logger.error('No user data in Twitch response');
      const errorUrl = getErrorRedirectUrl('user_info_failed', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    const email = twitchUser.email;
    const verifiedEmail = twitchUser.email_verified ?? true;
    const preferredUsername = twitchUser.display_name || twitchUser.login;

    if (!email) {
      logger.error('No email in Twitch user info');
      const errorUrl = getErrorRedirectUrl('no_email', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    if (!verifiedEmail) {
      const errorUrl = getErrorRedirectUrl('email_not_verified', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Get or create user
    let user = await getUserByEmail(email);

    if (!user) {
      // ВАЖНО: Мы больше не сохраняем аватарки из соцсетей, используем градиенты
      const createResult = await createUserFromOAuth(email, preferredUsername, undefined);

      if (!createResult.success || !createResult.user) {
        logger.error('Failed to create user from Twitch', { error: createResult.error });
        const errorUrl = getErrorRedirectUrl('user_creation_failed', origin, isPopup);
        return setCorsHeaders(NextResponse.redirect(errorUrl));
      }
      user = createResult.user;
    }

    // Check user activity
    if (!user.isActive) {
      const errorUrl = getErrorRedirectUrl('account_disabled', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Create session with rotation (prevent session fixation)
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Destroy old session if exists
    const oldSessionId = request.cookies.get('session_id')?.value;
    if (oldSessionId) {
      await SessionManager.destroySession(oldSessionId);
    }

    // Register device and get new token (fpid for Layer 2 grouping)
    const fpid = request.cookies.get('rvn_fpid')?.value ?? null;
    const token = await SessionManager.registerDevice(user.id, userAgent, ipAddress, fpid);

    const sessionId = await SessionManager.createSession(
      user.id,
      sanitizeInput(user.username),
      ipAddress,
      userAgent,
      token,
      'user',
    );

    await SessionManager.setSessionCookie(sessionId, isLocalhost);

    const redirectUrl = isPopup
      ? new URL(
          `/auth/oauth-handler?provider=twitch&success=true&user_id=${user.userId}&popup=true`,
          origin,
        )
      : new URL(`/dashboard/${user.userId}`, origin);
    const response = NextResponse.redirect(redirectUrl);

    // Clear FPID cookie after use (OAuth only)
    response.cookies.set('rvn_fpid', '', { maxAge: 0, path: '/' });

    // Copy protection cookie from request if it exists, or set a temporary one
    const existingAccessToken = request.cookies.get('access_token')?.value;

    const cookieDomain = getCookieDomain(hostname);

    if (existingAccessToken) {
      response.cookies.set('access_token', existingAccessToken, {
        maxAge: 60 * 60 * 2,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax',
        path: '/',
        ...(cookieDomain && { domain: cookieDomain }),
      });
    } else {
      const { createHmac } = await import('crypto');
      const secretKey = process.env.TURNSTILE_SECRET_KEY || '';
      const payload = Buffer.from(JSON.stringify({ t: Date.now() })).toString('base64url');
      const hmac = createHmac('sha256', secretKey).update(payload).digest('hex');
      response.cookies.set('access_token', `${payload}.${hmac}`, {
        maxAge: 60 * 60 * 2,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax',
        path: '/',
        ...(cookieDomain && { domain: cookieDomain }),
      });
    }

    const { appConfig } = await import('@/lib/utils/config');
    const { createUserDataCookie, USER_DATA_COOKIE_NAME, getUserDataCookieOptions } =
      await import('@/lib/auth/user-cookie.server');

    response.cookies.set('token', token, {
      maxAge: appConfig.token.maxAge,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'lax',
      path: '/',
    });

    response.cookies.set(
      USER_DATA_COOKIE_NAME,
      createUserDataCookie({
        user_id: user.userId,
        username: user.username,
        avatar: user.avatar ?? null,
        banner: user.banner ?? null,
        pex: 'u', // Default to 'u'
      }),
      getUserDataCookieOptions(isLocalhost),
    );

    response.cookies.delete('oauth_state');

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Twitch OAuth callback error', {
      error: error instanceof Error ? error.message : 'unknown error',
    });

    try {
      {
        const origin = domains.mainUrl.endsWith('/')
          ? domains.mainUrl.slice(0, -1)
          : domains.mainUrl;
        const errorUrl = getErrorRedirectUrl('internal_error', origin, false);
        return setCorsHeaders(NextResponse.redirect(errorUrl));
      }
    } catch {}

    return setCorsHeaders(NextResponse.json({ error: 'Internal server error' }, { status: 500 }));
  }
}
