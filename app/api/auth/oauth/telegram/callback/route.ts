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
// Telegram Login Widget sends data via POST from client-side widget
export async function POST(request: NextRequest) {
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
        NextResponse.json(
          { error: 'rate_limit' },
          { status: 429 }
        )
      );
    }

    // Check Telegram OAuth credentials
    if (!env.TELEGRAM_BOT_TOKEN) {
      logger.error('TELEGRAM OAUTH NOT CONFIGURED');
      return setCorsHeaders(
        NextResponse.json(
          { error: 'oauth_not_configured' },
          { status: 503 }
        )
      );
    }

    // Get OAuth parameters from request body (sent from client-side widget)
    const body = await request.json();
    const id = body.id?.toString();
    const firstName = body.first_name;
    const lastName = body.last_name;
    const username = body.username;
    const photoUrl = body.photo_url;
    const authDate = body.auth_date?.toString();
    const hash = body.hash;
    const state = body.state;

    // Validate required parameters
    if (!id || !authDate || !hash) {
      logger.warn('TELEGRAM OAUTH CALLBACK MISSING PARAMETERS', {
        hasId: !!id,
        hasAuthDate: !!authDate,
        hasHash: !!hash,
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'invalid_request' },
          { status: 400 }
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
        NextResponse.json(
          { error: 'invalid_state' },
          { status: 403 }
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
        NextResponse.json(
          { error: 'invalid_hash' },
          { status: 403 }
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
        NextResponse.json(
          { error: 'auth_expired' },
          { status: 403 }
        )
      );
    }

    // Generate email from Telegram ID (since Telegram doesn't provide email)
    // Format: telegram_{id}@telegram.local
    const telegramEmail = `telegram_${id}@telegram.local`;

    // Get or create user
    let user = await getUserByEmail(telegramEmail);
    let isNewUser = false;

    logger.info('TELEGRAM OAUTH USER LOOKUP', {
      telegramEmail: telegramEmail.substring(0, 10) + '***',
      userFound: !!user,
      telegramId: id,
      ip: request.headers.get('x-forwarded-for'),
    });

    if (!user) {
      // For Telegram, we need to use the exact username that matches the email
      // Email format: telegram_{id}@telegram.local
      // Username should be: telegram_{id} to match getUserByEmail logic
      // But we can also use Telegram username if available (sanitized)
      const telegramUsernameFromEmail = `telegram_${id}`;
      const telegramUsername = username || telegramUsernameFromEmail;
      // Ensure username is valid (only alphanumeric and underscore)
      let sanitizedUsername = telegramUsername.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 30);
      
      // If sanitized username is different from email-based username, prefer email-based
      // This ensures getUserByEmail can find the user later
      if (sanitizedUsername !== telegramUsernameFromEmail && !username) {
        sanitizedUsername = telegramUsernameFromEmail;
      }
      
      logger.info('CREATING NEW USER FROM TELEGRAM OAUTH', {
        telegramEmail: telegramEmail.substring(0, 10) + '***',
        sanitizedUsername,
        telegramUsernameFromEmail,
        telegramId: id,
        ip: request.headers.get('x-forwarded-for'),
      });
      
      const createResult = await createUserFromOAuth(telegramEmail, sanitizedUsername);
      
      logger.info('TELEGRAM OAUTH USER CREATION RESULT', {
        success: createResult.success,
        error: createResult.error,
        hasUser: !!createResult.user,
        telegramEmail: telegramEmail.substring(0, 10) + '***',
        telegramId: id,
        ip: request.headers.get('x-forwarded-for'),
      });
      
      if (!createResult.success || !createResult.user) {
        logger.error('FAILED TO CREATE USER FROM TELEGRAM OAUTH', {
          error: createResult.error,
          telegramId: id,
          ip: request.headers.get('x-forwarded-for'),
        });
        return setCorsHeaders(
          NextResponse.json(
            { error: 'user_creation_failed' },
            { status: 500 }
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
        NextResponse.json(
          { error: 'account_disabled' },
          { status: 403 }
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

    // Create response with redirect URL (POST endpoint returns JSON)
    const redirectUrl = `${origin}/dashboard/${user.dashboard_token}`;
    const response = NextResponse.json({
      success: true,
      redirect: redirectUrl,
      dashboard_token: user.dashboard_token,
    });

    // Copy protection cookies from request if they exist, or set temporary ones
    // If they don't exist, we set temporary ones to avoid redirect to /protection/
    // User has already passed OAuth verification, so we can grant temporary access
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
      // Preserve existing protection cookies
      // Use sameSite: 'lax' to ensure cookies work in cross-site OAuth scenarios
      // Note: These cookies likely won't exist in cross-site OAuth callbacks due to sameSite restrictions,
      // but if they do (e.g., from same-site navigation), preserve them with lax policy
      response.cookies.set('access_granted', accessGranted, {
        maxAge: 60 * 60 * 2,
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax', // Changed from 'strict' to 'lax' for OAuth redirects
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      response.cookies.set('access_hash', accessHash, {
        maxAge: 60 * 60 * 2,
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax', // Changed from 'strict' to 'lax' for OAuth redirects
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      if (accessTime) {
        response.cookies.set('access_time', accessTime, {
          maxAge: 60 * 60 * 2,
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production' && !isLocalhost,
          sameSite: 'lax', // Changed from 'strict' to 'lax' for OAuth redirects
          path: '/',
          ...(cookieDomain && { domain: cookieDomain })
        });
      }
    } else {
      // Set temporary protection cookies for OAuth users
      // OAuth verification is sufficient for temporary access
      const { createHash } = await import('crypto');
      const tempHash = createHash('sha256')
        .update(`${user.id}-${Date.now()}-oauth-temp`)
        .digest('hex');
      
      // Set cookies with sameSite: 'lax' to ensure they're sent on redirect
      response.cookies.set('access_granted', 'true', {
        maxAge: 60 * 60 * 2,
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax', // Changed from 'strict' to 'lax' for OAuth redirects
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      response.cookies.set('access_hash', tempHash, {
        maxAge: 60 * 60 * 2,
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax', // Changed from 'strict' to 'lax' for OAuth redirects
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      response.cookies.set('access_time', Date.now().toString(), {
        maxAge: 60 * 60 * 2,
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
        return setCorsHeaders(
          NextResponse.json(
            { error: 'internal_error' },
            { status: 500 }
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

