import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/validation/env-validation';
import { createUserFromOAuth, getUserByEmail } from '@/lib/auth/index';
import { SessionManager } from '@/lib/auth/session-manager';
import { sanitizeInput } from '@/lib/security/sanitize';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';
import { authRateLimit } from '@/lib/security/rate-limit';
import { getErrorRedirectUrl } from '@/lib/utils/oauth-errors';

export async function OPTIONS() {
  return handleCorsPreflight();
}

// Handle Twitch OAuth callback
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
    const cleanStoredState = storedState?.includes(':popup') ? storedState.split(':')[0] : storedState;
    
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
        status: tokenResponse.status
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
    const userInfoResponse = await fetch(
      'https://api.twitch.tv/helix/users',
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Client-Id': env.TWITCH_CLIENT_ID,
        },
      }
    );

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
      const createResult = await createUserFromOAuth(email, preferredUsername);
      
      if (!createResult.success || !createResult.user) {
        logger.error('Failed to create user from Twitch', { error: createResult.error });
        const errorUrl = getErrorRedirectUrl('user_creation_failed', origin, isPopup);
        return setCorsHeaders(NextResponse.redirect(errorUrl));
      }
      user = createResult.user;
    }

    // Check user activity
    if (!user.is_active) {
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
      SessionManager.destroySession(oldSessionId);
    }
    
    const sessionId = SessionManager.createSession(
      user.id,
      sanitizeInput(user.username),
      ipAddress,
      userAgent
    );

    await SessionManager.setSessionCookie(sessionId, isLocalhost);

    // Build redirect URL
    const redirectUrl = isPopup 
      ? new URL(`/auth/oauth-handler?provider=twitch&success=true&dashboard_token=${user.dashboard_token}&popup=true`, origin)
      : new URL(`/dashboard/${user.dashboard_token}`, origin);
    const response = NextResponse.redirect(redirectUrl);

    // Copy protection cookies from request if they exist, or set temporary ones
    const accessGranted = request.cookies.get('access_granted')?.value;
    const accessHash = request.cookies.get('access_hash')?.value;
    const accessTime = request.cookies.get('access_time')?.value;

    const isVercel = hostname.includes('vercel.app');
    let cookieDomain: string | undefined;
    if (!isLocalhost && !isVercel && hostname.includes('rvn.market')) {
      cookieDomain = '.rvn.market';
    }

    if (accessGranted && accessHash) {
      response.cookies.set('access_granted', accessGranted, {
        maxAge: 60 * 60 * 2, // 2 hours
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax',
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      response.cookies.set('access_hash', accessHash, {
        maxAge: 60 * 60 * 2, // 2 hours
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax',
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      if (accessTime) {
        response.cookies.set('access_time', accessTime, {
          maxAge: 60 * 60 * 2, // 2 hours
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production' && !isLocalhost,
          sameSite: 'lax',
          path: '/',
          ...(cookieDomain && { domain: cookieDomain })
        });
      }
    } else {
      const { createHash } = await import('crypto');
      const tempHash = createHash('sha256')
        .update(`${user.id}-${Date.now()}-oauth-temp`)
        .digest('hex');
      
      response.cookies.set('access_granted', 'true', {
        maxAge: 60 * 60 * 2, // 2 hours
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax',
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      response.cookies.set('access_hash', tempHash, {
        maxAge: 60 * 60 * 2, // 2 hours
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax',
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      response.cookies.set('access_time', Date.now().toString(), {
        maxAge: 60 * 60 * 2, // 2 hours
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax',
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });
    }

    // Set authentication cookies
    response.cookies.set('user_authenticated', 'true', {
      maxAge: 60 * 60 * 24 * 7,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'lax',
      path: '/'
    });

    response.cookies.set('user_id', user.id, {
      maxAge: 60 * 60 * 24 * 7,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'lax',
      path: '/'
    });

    response.cookies.set('dashboard_token', user.dashboard_token, {
      maxAge: 60 * 60 * 24 * 7,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'lax',
      path: '/'
    });

    // Clear OAuth state cookie
    response.cookies.delete('oauth_state');

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Twitch OAuth callback error', {
      error: error instanceof Error ? error.message : 'unknown error'
    });
    
    try {
      const env = getEnv();
      if (env.PUBLIC_DOMAIN) {
        const origin = env.PUBLIC_DOMAIN.endsWith('/') 
          ? env.PUBLIC_DOMAIN.slice(0, -1) 
          : env.PUBLIC_DOMAIN;
        const errorUrl = getErrorRedirectUrl('internal_error', origin, false);
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

