import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/validation/env-validation';
import { createUserFromOAuth, getUserByEmail } from '@/lib/auth/index';
import { SessionManager } from '@/lib/auth/session-manager';
import { sanitizeInput } from '@/lib/security/sanitize';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';
import { authRateLimit } from '@/lib/security/rate-limit';
import { getErrorRedirectUrl, GOOGLE_ERROR_MAP } from '@/lib/utils/oauth-errors';
import { domains, getCookieDomain } from '@/lib/utils';

export async function OPTIONS() {
  return handleCorsPreflight();
}

// Handle Google OAuth callback
export async function GET(request: NextRequest) {
  try {
    const env = getEnv();
    const origin = domains.mainUrl.endsWith('/') 
      ? domains.mainUrl.slice(0, -1) 
      : domains.mainUrl;

    // Get state early to determine if this is a popup request
    const { searchParams } = request.nextUrl;
    const state = searchParams.get('state');
    // Check stored state cookie to determine if this is a popup request
    // This is more reliable than checking the state parameter from URL
    const storedState = request.cookies.get('oauth_state')?.value;
    const referer = request.headers.get('referer') || '';
    let isPopup = false;
    if (storedState) {
      isPopup = storedState.includes(':popup');
    }
    // Fallback: check referer if cookie check didn't work
    if (!isPopup && referer.includes('/auth/oauth-handler')) {
      isPopup = true;
    }
    // Additional fallback: check if state parameter contains popup flag
    if (!isPopup && state && state.includes(':popup')) {
      isPopup = true;
    }

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

    // Get OAuth parameters
    const code = searchParams.get('code');
    const googleError = searchParams.get('error');

    // Check for Google errors (e.g., ?error=access_denied, ?error=rate_limit)
    if (googleError) {
      // Ошибка от Google - не логируем (валидация)
      // Map Google error to generic error code
      const errorCode = GOOGLE_ERROR_MAP[googleError] || 'oauth_denied';
      const errorUrl = getErrorRedirectUrl(errorCode, origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Validate required parameters
    if (!code || !state) {
      // Отсутствуют параметры - не логируем (валидация)
      const errorUrl = getErrorRedirectUrl('invalid_request', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Verify CSRF state token
    // storedState already retrieved above for isPopup determination
    const cleanState = isPopup ? state.split(':')[0] : state;
    const cleanStoredState = storedState?.includes(':popup') ? storedState.split(':')[0] : storedState;
    
    if (!cleanStoredState || cleanStoredState !== cleanState) {
      // Несоответствие state - не логируем (валидация)
      const errorUrl = getErrorRedirectUrl('invalid_state', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }
    
    const redirectUri = `${origin}/api/auth/oauth/google/callback`;

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      logger.error('Failed to exchange OAuth code', {
        status: tokenResponse.status
      });
      const errorUrl = getErrorRedirectUrl('token_exchange_failed', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    const tokenData = await tokenResponse.json();
    const { access_token } = tokenData;

    if (!access_token) {
      logger.error('No access token in OAuth response');
      const errorUrl = getErrorRedirectUrl('no_access_token', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Fetch user info from Google
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    if (!userInfoResponse.ok) {
      logger.error('Failed to fetch user info', { status: userInfoResponse.status });
      const errorUrl = getErrorRedirectUrl('user_info_failed', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    const userInfo = await userInfoResponse.json();
    const { email, verified_email, picture } = userInfo;

    if (!email) {
      logger.error('No email in user info');
      const errorUrl = getErrorRedirectUrl('no_email', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    if (!verified_email) {
      // Email не подтвержден - не логируем (валидация)
      const errorUrl = getErrorRedirectUrl('email_not_verified', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Get or create user
    let user = await getUserByEmail(email);

    if (!user) {
      // Передаем URL аватара из Google (поле picture)
      const createResult = await createUserFromOAuth(email, undefined, picture);
      
      if (!createResult.success || !createResult.user) {
        logger.error('Failed to create user', { error: createResult.error });
        const errorUrl = getErrorRedirectUrl('user_creation_failed', origin, isPopup);
        return setCorsHeaders(NextResponse.redirect(errorUrl));
      }
      user = createResult.user;
    }

    // Check user activity
    if (!user.is_active) {
      // Попытка входа неактивного пользователя - не логируем
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
    
    // Register device and get new token
    const token = await SessionManager.registerDevice(user.id, userAgent, ipAddress);

    const sessionId = await SessionManager.createSession(
      user.id,
      user.username,
      ipAddress,
      userAgent,
      token,
      'user'
    );

    await SessionManager.setSessionCookie(sessionId, isLocalhost);

    const redirectUrl = isPopup 
      ? new URL(`/auth/oauth-handler?provider=google&success=true&user_id=${user.user_id}&popup=true`, origin)
      : new URL(`/dashboard/${user.user_id}`, origin);
    const response = NextResponse.redirect(redirectUrl);

    // Copy protection cookies from request if they exist, or set temporary ones
    // Note: Due to SameSite=Strict, protection cookies may not be sent in cross-site OAuth callback
    // If they don't exist, we set temporary ones to avoid redirect to /protection/
    // User has already passed OAuth verification, so we can grant temporary access
    const accessGranted = request.cookies.get('access_granted')?.value;
    const accessHash = request.cookies.get('access_hash')?.value;
    const accessTime = request.cookies.get('access_time')?.value;

    // Determine cookie domain based on hostname
    const cookieDomain = getCookieDomain(hostname);

    if (accessGranted && accessHash) {
      // Preserve existing protection cookies
      // Use sameSite: 'lax' to ensure cookies work in cross-site OAuth scenarios
      response.cookies.set('access_granted', accessGranted, {
        maxAge: 60 * 60 * 2, // 2 hours
        httpOnly: false, // Must match client-side setting
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax', // Changed from 'strict' to 'lax' for OAuth redirects
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      response.cookies.set('access_hash', accessHash, {
        maxAge: 60 * 60 * 2, // 2 hours
        httpOnly: false, // Must match client-side setting
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax', // Changed from 'strict' to 'lax' for OAuth redirects
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      if (accessTime) {
        response.cookies.set('access_time', accessTime, {
          maxAge: 60 * 60 * 2, // 2 hours
          httpOnly: false, // Must match client-side setting
          secure: process.env.NODE_ENV === 'production' && !isLocalhost,
          sameSite: 'lax', // Changed from 'strict' to 'lax' for OAuth redirects
          path: '/',
          ...(cookieDomain && { domain: cookieDomain })
        });
      }
    } else {
      // Set temporary protection cookies for OAuth users
      // OAuth verification is sufficient for temporary access
      // User can complete full protection later if needed
      const { createHash } = await import('crypto');
      const tempHash = createHash('sha256')
        .update(`${user.id}-${Date.now()}-oauth-temp`)
        .digest('hex');
      
      // Set cookies with sameSite: 'lax' to ensure they're sent on redirect
      response.cookies.set('access_granted', 'true', {
        maxAge: 60 * 60 * 2, // 2 hours
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax', // Changed from 'strict' to 'lax' for OAuth redirects
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      response.cookies.set('access_hash', tempHash, {
        maxAge: 60 * 60 * 2, // 2 hours
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax', // Changed from 'strict' to 'lax' for OAuth redirects
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      response.cookies.set('access_time', Date.now().toString(), {
        maxAge: 60 * 60 * 2, // 2 hours
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax', // Changed from 'strict' to 'lax' for OAuth redirects
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });
    }

    const { appConfig } = await import('@/lib/utils/config');
    const { createUserDataCookie, USER_DATA_COOKIE_NAME, getUserDataCookieOptions } = await import('@/lib/auth/user-cookie.server');

    response.cookies.set('token', token, {
      maxAge: appConfig.token.maxAge,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'lax',
      path: '/'
    });

    response.cookies.set(USER_DATA_COOKIE_NAME, createUserDataCookie({
      user_id: user.user_id,
      username: user.username,
      avatar: user.avatar ?? null,
      banner: user.banner ?? null,
      pex: 'u',
    }), getUserDataCookieOptions(isLocalhost));

    response.cookies.delete('oauth_state');

    // Успешный OAuth вход - не логируем

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('OAuth callback error', {
      error: error instanceof Error ? error.message : 'unknown error'
    });
    
    // Get origin for error redirect
    try {
      const env = getEnv();
      {
        const origin = domains.mainUrl.endsWith('/') 
          ? domains.mainUrl.slice(0, -1) 
          : domains.mainUrl;
        const errorUrl = getErrorRedirectUrl('internal_error', origin, false);
        return setCorsHeaders(NextResponse.redirect(errorUrl));
      }
    } catch {
      // Fallback to JSON error if env unavailable
    }
    
    return setCorsHeaders(
      NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    );
  }
}