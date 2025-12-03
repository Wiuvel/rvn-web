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
      logger.warn('RATE LIMIT EXCEEDED FOR OAUTH CALLBACK', {
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
      logger.error('GOOGLE OAUTH NOT CONFIGURED');
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
      logger.warn('OAUTH ERROR FROM GOOGLE', {
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
      logger.warn('OAUTH CALLBACK MISSING PARAMETERS', {
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
      logger.warn('OAUTH STATE MISMATCH', {
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
      logger.error('FAILED TO EXCHANGE OAUTH CODE FOR TOKEN', {
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
      logger.error('NO ACCESS_TOKEN IN OAUTH RESPONSE');
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
      logger.error('FAILED TO FETCH USER INFO FROM GOOGLE', {
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
      logger.error('NO EMAIL IN GOOGLE USER INFO');
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=no_email', origin)
        )
      );
    }

    if (!verified_email) {
      logger.warn('GOOGLE EMAIL NOT VERIFIED', {
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

    logger.info('GOOGLE OAUTH USER LOOKUP', {
      email: email.substring(0, 3) + '***',
      userFound: !!user,
      ip: request.headers.get('x-forwarded-for'),
    });

    if (!user) {
      logger.info('CREATING NEW USER FROM GOOGLE OAUTH', {
        email: email.substring(0, 3) + '***',
        ip: request.headers.get('x-forwarded-for'),
      });
      
      const createResult = await createUserFromOAuth(email);
      
      logger.info('GOOGLE OAUTH USER CREATION RESULT', {
        success: createResult.success,
        error: createResult.error,
        hasUser: !!createResult.user,
        email: email.substring(0, 3) + '***',
        ip: request.headers.get('x-forwarded-for'),
      });
      
      if (!createResult.success || !createResult.user) {
        logger.error('FAILED TO CREATE USER FROM OAUTH', {
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
      logger.warn('OAUTH LOGIN ATTEMPT FOR INACTIVE USER', {
        userId: user.id,
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=account_disabled', origin)
        )
      );
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
    const redirectUrl = new URL(`/dashboard/${user.dashboard_token}`, origin);
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
      response.cookies.set('access_granted', accessGranted, {
        maxAge: 60 * 60 * 2, // 2 hours
        httpOnly: false, // Must match client-side setting
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'strict',
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      response.cookies.set('access_hash', accessHash, {
        maxAge: 60 * 60 * 2, // 2 hours
        httpOnly: false, // Must match client-side setting
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'strict',
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      if (accessTime) {
        response.cookies.set('access_time', accessTime, {
          maxAge: 60 * 60 * 2, // 2 hours
          httpOnly: false, // Must match client-side setting
          secure: process.env.NODE_ENV === 'production' && !isLocalhost,
          sameSite: 'strict',
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

    logger.info('OAUTH LOGIN SUCCESSFUL', {
      userId: user.id,
      username: user.username,
      isNewUser,
      provider: 'google',
      ip: ipAddress,
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('OAUTH CALLBACK ERROR', {
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
