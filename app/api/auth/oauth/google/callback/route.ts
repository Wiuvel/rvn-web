import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env-validation';
import { createUserFromOAuth, getUserByEmail } from '@/lib/auth';
import { SessionManager } from '@/lib/session-manager';
import { ServerValidator } from '@/lib/server-validation';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { logger } from '@/lib/secure-logger';
import { authRateLimit } from '@/lib/rate-limit';

export async function OPTIONS() {
  return handleCorsPreflight();
}

// Handle Google OAuth callback
export async function GET(request: NextRequest) {
  try {
    const env = getEnv();
    if (!env.PUBLIC_DOMAIN) {
      logger.error('PUBLIC_DOMAIN not configured');
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
      logger.warn('Rate limit exceeded for OAuth callback', {
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=rate_limit', origin)
        )
      );
    }

    // Check Google OAuth credentials
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      logger.error('Google OAuth not configured');
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=oauth_not_configured', origin)
        )
      );
    }

    // Get OAuth parameters
    const { searchParams } = request.nextUrl;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for Google errors
    if (error) {
      logger.warn('OAuth error from Google', {
        error,
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=oauth_denied', origin)
        )
      );
    }

    // Validate required parameters
    if (!code || !state) {
      logger.warn('OAuth callback missing parameters', {
        hasCode: !!code,
        hasState: !!state,
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=invalid_request', origin)
        )
      );
    }

    // Verify CSRF state token
    const storedState = request.cookies.get('oauth_state')?.value;
    if (!storedState || storedState !== state) {
      logger.warn('OAuth state mismatch', {
        hasStoredState: !!storedState,
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=invalid_state', origin)
        )
      );
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
      const errorData = await tokenResponse.text();
      logger.error('Failed to exchange OAuth code for token', {
        status: tokenResponse.status,
        error: errorData,
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=token_exchange_failed', origin)
        )
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token } = tokenData;

    if (!access_token) {
      logger.error('No access_token in OAuth response');
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=no_access_token', origin)
        )
      );
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
      logger.error('Failed to fetch user info from Google', {
        status: userInfoResponse.status,
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=user_info_failed', origin)
        )
      );
    }

    const userInfo = await userInfoResponse.json();
    const { email, verified_email } = userInfo;

    if (!email) {
      logger.error('No email in Google user info');
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=no_email', origin)
        )
      );
    }

    if (!verified_email) {
      logger.warn('Google email not verified', {
        email: email.substring(0, 3) + '***',
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=email_not_verified', origin)
        )
      );
    }

    // Get or create user
    let user = await getUserByEmail(email);
    let isNewUser = false;

    if (!user) {
      const createResult = await createUserFromOAuth(email);
      if (!createResult.success || !createResult.user) {
        logger.error('Failed to create user from OAuth', {
          error: createResult.error,
          email: email.substring(0, 3) + '***',
          ip: request.headers.get('x-forwarded-for'),
        });
        return setCorsHeaders(
          NextResponse.redirect(
            new URL('/auth?error=user_creation_failed', origin)
          )
        );
      }
      user = createResult.user;
      isNewUser = true;
    }

    // Check user activity
    if (!user.is_active) {
      logger.warn('OAuth login attempt for inactive user', {
        userId: user.id,
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=account_disabled', origin)
        )
      );
    }

    // Create session
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    
    const sessionId = SessionManager.createSession(
      user.id,
      ServerValidator.sanitizeInput(user.username),
      ipAddress,
      userAgent
    );

    await SessionManager.setSessionCookie(sessionId, isLocalhost);

    // Create redirect response
    const redirectUrl = new URL(`/dashboard/${user.dashboard_token}`, origin);
    const response = NextResponse.redirect(redirectUrl);

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

    logger.info('OAuth login successful', {
      userId: user.id,
      username: user.username,
      isNewUser,
      provider: 'google',
      ip: ipAddress,
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('OAuth callback error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
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
