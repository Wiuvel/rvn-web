import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/validation/env-validation';
import { createUserFromOAuth, getUserByEmail } from '@/lib/auth/index';
import { SessionManager } from '@/lib/auth/session-manager';
import { sanitizeInput } from '@/lib/security/sanitize';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';
import { authRateLimit } from '@/lib/security/rate-limit';

export async function OPTIONS() {
  return handleCorsPreflight();
}

// Handle Google OAuth callback
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

    // Get state early to determine if this is a popup request
    const { searchParams } = request.nextUrl;
    const state = searchParams.get('state');
    let isPopup = false;
    if (state) {
      isPopup = state.includes(':popup');
    }

    // Rate limiting
    const rateLimitResult = await authRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('rate limit exceeded');
      const errorUrl = isPopup 
        ? new URL('/auth/oauth-handler?provider=google&error=rate_limit', origin)
        : new URL('/auth?error=rate_limit', origin);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Check Google OAuth credentials
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      logger.error('google oauth not configured');
      const errorUrl = isPopup 
        ? new URL('/auth/oauth-handler?provider=google&error=oauth_not_configured', origin)
        : new URL('/auth?error=oauth_not_configured', origin);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Get OAuth parameters
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    // Check for Google errors
    if (error) {
      logger.warn('oauth error from google', { error });
      const errorUrl = isPopup 
        ? new URL('/auth/oauth-handler?provider=google&error=oauth_denied', origin)
        : new URL('/auth?error=oauth_denied', origin);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Validate required parameters
    if (!code || !state) {
      logger.warn('oauth callback missing parameters');
      const errorUrl = isPopup 
        ? new URL('/auth/oauth-handler?provider=google&error=invalid_request', origin)
        : new URL('/auth?error=invalid_request', origin);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Verify CSRF state token
    const storedState = request.cookies.get('oauth_state')?.value;
    // Check if state includes popup flag
    isPopup = state.includes(':popup');
    const cleanState = isPopup ? state.split(':')[0] : state;
    const cleanStoredState = storedState?.includes(':popup') ? storedState.split(':')[0] : storedState;
    
    if (!cleanStoredState || cleanStoredState !== cleanState) {
      logger.warn('oauth state mismatch');
      const errorUrl = isPopup 
        ? new URL('/auth/oauth-handler?provider=google&error=invalid_state', origin)
        : new URL('/auth?error=invalid_state', origin);
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
      logger.error('failed to exchange oauth code', {
        status: tokenResponse.status
      });
      const errorUrl = isPopup 
        ? new URL('/auth/oauth-handler?provider=google&error=token_exchange_failed', origin)
        : new URL('/auth?error=token_exchange_failed', origin);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    const tokenData = await tokenResponse.json();
    const { access_token } = tokenData;

    if (!access_token) {
      logger.error('no access_token in oauth response');
      const errorUrl = isPopup 
        ? new URL('/auth/oauth-handler?provider=google&error=no_access_token', origin)
        : new URL('/auth?error=no_access_token', origin);
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
      logger.error('failed to fetch user info', { status: userInfoResponse.status });
      const errorUrl = isPopup 
        ? new URL('/auth/oauth-handler?provider=google&error=user_info_failed', origin)
        : new URL('/auth?error=user_info_failed', origin);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    const userInfo = await userInfoResponse.json();
    const { email, verified_email } = userInfo;

    if (!email) {
      logger.error('no email in user info');
      const errorUrl = isPopup 
        ? new URL('/auth/oauth-handler?provider=google&error=no_email', origin)
        : new URL('/auth?error=no_email', origin);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    if (!verified_email) {
      logger.warn('email not verified');
      const errorUrl = isPopup 
        ? new URL('/auth/oauth-handler?provider=google&error=email_not_verified', origin)
        : new URL('/auth?error=email_not_verified', origin);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Get or create user
    let user = await getUserByEmail(email);
    let isNewUser = false;

    if (!user) {
      const createResult = await createUserFromOAuth(email);
      
      if (!createResult.success || !createResult.user) {
        logger.error('failed to create user', { error: createResult.error });
        const errorUrl = isPopup 
          ? new URL('/auth/oauth-handler?provider=google&error=user_creation_failed', origin)
          : new URL('/auth?error=user_creation_failed', origin);
        return setCorsHeaders(NextResponse.redirect(errorUrl));
      }
      user = createResult.user;
      isNewUser = true;
    }

    // Check user activity
    if (!user.is_active) {
      logger.warn('login attempt for inactive user', { userId: user.id });
      const errorUrl = isPopup 
        ? new URL('/auth/oauth-handler?provider=google&error=account_disabled', origin)
        : new URL('/auth?error=account_disabled', origin);
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

    // Create redirect response
    // If popup, redirect to oauth-handler which will communicate with parent
    // Otherwise, redirect directly to dashboard
    const redirectUrl = isPopup 
      ? new URL(`/auth/oauth-handler?provider=google&success=true&dashboard_token=${user.dashboard_token}`, origin)
      : new URL(`/dashboard/${user.dashboard_token}`, origin);
    const response = NextResponse.redirect(redirectUrl);

    // Copy protection cookies from request if they exist, or set temporary ones
    // Note: Due to SameSite=Strict, protection cookies may not be sent in cross-site OAuth callback
    // If they don't exist, we set temporary ones to avoid redirect to /protection/
    // User has already passed OAuth verification, so we can grant temporary access
    const accessGranted = request.cookies.get('access_granted')?.value;
    const accessHash = request.cookies.get('access_hash')?.value;
    const accessTime = request.cookies.get('access_time')?.value;

    // Determine cookie domain based on hostname (matching protection script logic)
    const isVercel = hostname.includes('vercel.app');
    let cookieDomain: string | undefined;
    if (!isLocalhost && !isVercel && hostname.includes('rvn.market')) {
      cookieDomain = '.rvn.market';
    }

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

    logger.info('google oauth login successful', { userId: user.id, isNewUser });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('oauth callback error', {
      error: error instanceof Error ? error.message : 'unknown error'
    });
    
    // Get origin for error redirect
    try {
      const env = getEnv();
      if (env.PUBLIC_DOMAIN) {
        const origin = env.PUBLIC_DOMAIN.endsWith('/') 
          ? env.PUBLIC_DOMAIN.slice(0, -1) 
          : env.PUBLIC_DOMAIN;
        return setCorsHeaders(
          NextResponse.redirect(
            new URL('/auth?error=internal_error', origin)
          )
        );
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