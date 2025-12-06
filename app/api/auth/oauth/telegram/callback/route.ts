import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
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

// Handle Telegram OAuth callback
// Telegram OAuth redirects back with parameters in query string
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
    // Check stored state cookie to determine if this is a popup request
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
      logger.warn('rate limit exceeded');
      const errorUrl = getErrorRedirectUrl('rate_limit', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Check Telegram OAuth credentials
    if (!env.TELEGRAM_BOT_TOKEN) {
      logger.error('telegram oauth not configured');
      const errorUrl = getErrorRedirectUrl('oauth_not_configured', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Get OAuth parameters from query string (Telegram OAuth redirects with query params)
    const id = searchParams.get('id')?.toString();
    const firstName = searchParams.get('first_name') || undefined;
    const lastName = searchParams.get('last_name') || undefined;
    const username = searchParams.get('username') || undefined;
    const photoUrl = searchParams.get('photo_url') || undefined;
    const authDate = searchParams.get('auth_date')?.toString();
    const hash = searchParams.get('hash') || undefined;

    // Validate required parameters
    if (!id || !authDate || !hash) {
      logger.warn('telegram oauth missing parameters', { hasId: !!id, hasAuthDate: !!authDate, hasHash: !!hash });
      const errorUrl = getErrorRedirectUrl('invalid_request', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Verify CSRF state token
    // storedState already retrieved above for isPopup determination
    const cleanState = isPopup && state ? state.split(':')[0] : state;
    const cleanStoredState = storedState?.includes(':popup') ? storedState.split(':')[0] : storedState;
    
    if (!cleanStoredState || cleanStoredState !== cleanState) {
      logger.warn('telegram oauth state mismatch');
      const errorUrl = getErrorRedirectUrl('invalid_state', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
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
      logger.warn('telegram oauth hash mismatch', { 
        calculatedHash: calculatedHash.substring(0, 8) + '...', 
        receivedHash: hash.substring(0, 8) + '...' 
      });
      const errorUrl = getErrorRedirectUrl('invalid_hash', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Check auth_date (should be within last 24 hours)
    const authTimestamp = parseInt(authDate, 10);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 24 * 60 * 60; // 24 hours

    if (now - authTimestamp > maxAge) {
      logger.warn('telegram oauth expired', { 
        authTimestamp, 
        now, 
        age: now - authTimestamp 
      });
      const errorUrl = getErrorRedirectUrl('auth_expired', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Generate email from Telegram ID (since Telegram doesn't provide email)
    // Format: telegram_{id}@telegram.local
    const telegramEmail = `telegram_${id}@telegram.local`;

    // Get or create user
    let user = await getUserByEmail(telegramEmail);
    let isNewUser = false;

    if (!user) {
      const telegramUsernameFromEmail = `telegram_${id}`;
      let sanitizedUsername: string;
      
      if (username) {
        // Sanitize username from Telegram
        sanitizedUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
        // Remove leading/trailing underscores and collapse multiple underscores
        sanitizedUsername = sanitizedUsername.replace(/^_+|_+$/g, '').replace(/_+/g, '_');
        // Limit to 30 characters
        if (sanitizedUsername.length > 30) {
          sanitizedUsername = sanitizedUsername.substring(0, 30);
        }
        // If sanitized username is invalid (too short or only underscores), use fallback
        if (!sanitizedUsername || sanitizedUsername.length < 3 || sanitizedUsername.replace(/_/g, '').length === 0) {
          sanitizedUsername = telegramUsernameFromEmail;
        }
      } else {
        sanitizedUsername = telegramUsernameFromEmail;
      }
      
      const createResult = await createUserFromOAuth(telegramEmail, sanitizedUsername);
      
      if (!createResult.success || !createResult.user) {
        logger.error('failed to create user', { error: createResult.error });
        const errorUrl = getErrorRedirectUrl('user_creation_failed', origin, isPopup);
        return setCorsHeaders(NextResponse.redirect(errorUrl));
      }
      user = createResult.user;
      isNewUser = true;
    }

    // Check user activity
    if (!user.is_active) {
      logger.warn('login attempt for inactive user', { userId: user.id });
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

    // Create response with redirect URL
    const redirectUrl = `${origin}/dashboard/${user.dashboard_token}`;
    const response = NextResponse.redirect(redirectUrl);

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

    logger.info('telegram oauth login successful', { userId: user.id, isNewUser });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('telegram oauth callback error', {
      error: error instanceof Error ? error.message : 'unknown error'
    });
    
    try {
      const env = getEnv();
      if (env.PUBLIC_DOMAIN) {
        const origin = env.PUBLIC_DOMAIN.endsWith('/') 
          ? env.PUBLIC_DOMAIN.slice(0, -1) 
          : env.PUBLIC_DOMAIN;
        // Determine if popup from error context
        const referer = request.headers.get('referer') || '';
        const isPopup = referer.includes('/auth/oauth-handler') || 
                        referer.includes('popup') ||
                        request.nextUrl.searchParams.get('popup') === 'true';
        const errorUrl = getErrorRedirectUrl('internal_error', origin, isPopup);
        return setCorsHeaders(NextResponse.redirect(errorUrl));
      }
    } catch {
    }
    
    // Fallback error response
    return setCorsHeaders(
      NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    );
  }
}

