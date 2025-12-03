import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
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

// Handle Telegram OAuth callback
// Telegram Login Widget returns data via hash, but we'll use query params for server-side flow
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
      logger.warn('RATE LIMIT EXCEEDED FOR TELEGRAM OAUTH CALLBACK', {
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=rate_limit', origin)
        )
      );
    }

    // Check Telegram OAuth credentials
    if (!env.TELEGRAM_BOT_TOKEN) {
      logger.error('TELEGRAM OAUTH NOT CONFIGURED');
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=oauth_not_configured', origin)
        )
      );
    }

    // Get OAuth parameters from query string
    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');
    const firstName = searchParams.get('first_name');
    const lastName = searchParams.get('last_name');
    const username = searchParams.get('username');
    const photoUrl = searchParams.get('photo_url');
    const authDate = searchParams.get('auth_date');
    const hash = searchParams.get('hash');
    const state = searchParams.get('state');

    // Validate required parameters
    if (!id || !authDate || !hash) {
      logger.warn('TELEGRAM OAUTH CALLBACK MISSING PARAMETERS', {
        hasId: !!id,
        hasAuthDate: !!authDate,
        hasHash: !!hash,
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
      logger.warn('TELEGRAM OAUTH STATE MISMATCH', {
        hasStoredState: !!storedState,
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=invalid_state', origin)
        )
      );
    }

    // Verify Telegram hash
    // Telegram uses HMAC-SHA-256 with secret key derived from bot token
    // Build data check string (only include non-empty parameters)
    const params: string[] = [];
    if (id) params.push(`id=${id}`);
    if (firstName) params.push(`first_name=${firstName}`);
    if (lastName) params.push(`last_name=${lastName}`);
    if (username) params.push(`username=${username}`);
    if (photoUrl) params.push(`photo_url=${photoUrl}`);
    if (authDate) params.push(`auth_date=${authDate}`);
    
    const dataCheckString = params.sort().join('\n');

    // Calculate secret key: SHA-256("WebAppData" + bot_token)
    const secretKey = createHmac('sha256', 'WebAppData')
      .update(env.TELEGRAM_BOT_TOKEN)
      .digest();

    // Calculate hash: HMAC-SHA-256(secret_key, data_check_string)
    const calculatedHash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      logger.warn('TELEGRAM OAUTH HASH MISMATCH', {
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=invalid_hash', origin)
        )
      );
    }

    // Check auth_date (should be within last 24 hours)
    const authTimestamp = parseInt(authDate, 10);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 24 * 60 * 60; // 24 hours

    if (now - authTimestamp > maxAge) {
      logger.warn('TELEGRAM OAUTH AUTH DATE EXPIRED', {
        authTimestamp,
        now,
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=auth_expired', origin)
        )
      );
    }

    // Generate email from Telegram ID (since Telegram doesn't provide email)
    // Format: telegram_{id}@telegram.local
    const telegramEmail = `telegram_${id}@telegram.local`;

    // Get or create user
    let user = await getUserByEmail(telegramEmail);
    let isNewUser = false;

    if (!user) {
      // Create username from Telegram username or ID
      const telegramUsername = username || `telegram_${id}`;
      // Ensure username is valid (only alphanumeric and underscore)
      const sanitizedUsername = telegramUsername.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 30);
      
      const createResult = await createUserFromOAuth(telegramEmail, sanitizedUsername);
      if (!createResult.success || !createResult.user) {
        logger.error('FAILED TO CREATE USER FROM TELEGRAM OAUTH', {
          error: createResult.error,
          telegramId: id,
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
      logger.warn('TELEGRAM OAUTH LOGIN ATTEMPT FOR INACTIVE USER', {
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

    // Copy protection cookies from request if they exist
    const accessGranted = request.cookies.get('access_granted')?.value;
    const accessHash = request.cookies.get('access_hash')?.value;
    const accessTime = request.cookies.get('access_time')?.value;

    // Determine cookie domain based on hostname
    const isVercel = hostname.includes('vercel.app');
    let cookieDomain: string | undefined;
    if (!isLocalhost && !isVercel && hostname.includes('rvn.market')) {
      cookieDomain = '.rvn.market';
    }

    if (accessGranted && accessHash) {
      response.cookies.set('access_granted', accessGranted, {
        maxAge: 60 * 60 * 2,
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'strict',
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      response.cookies.set('access_hash', accessHash, {
        maxAge: 60 * 60 * 2,
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'strict',
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      if (accessTime) {
        response.cookies.set('access_time', accessTime, {
          maxAge: 60 * 60 * 2,
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production' && !isLocalhost,
          sameSite: 'strict',
          path: '/',
          ...(cookieDomain && { domain: cookieDomain })
        });
      }
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

    logger.info('TELEGRAM OAUTH LOGIN SUCCESSFUL', {
      userId: user.id,
      username: user.username,
      isNewUser,
      provider: 'telegram',
      telegramId: id,
      ip: ipAddress,
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('TELEGRAM OAUTH CALLBACK ERROR', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });
    
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
    }
    
    return setCorsHeaders(
      NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    );
  }
}

