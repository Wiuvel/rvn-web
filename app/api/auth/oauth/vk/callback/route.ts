import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/validation/env-validation';
import { createUserFromOAuth, getUserByEmail } from '@/lib/auth/index';
import { SessionManager } from '@/lib/auth/session-manager';
import { sanitizeInput } from '@/lib/security/sanitize';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';
import { authRateLimit } from '@/lib/security/rate-limit';
import { getErrorRedirectUrl } from '@/lib/utils/oauth-errors';
import { domains, getCookieDomain } from '@/lib/utils';

export async function OPTIONS() {
  return handleCorsPreflight();
}

// Handle VK OAuth callback
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

    // Check VK OAuth credentials
    if (!env.VK_CLIENT_ID || !env.VK_CLIENT_SECRET) {
      logger.error('VK OAuth not configured');
      const errorUrl = getErrorRedirectUrl('oauth_not_configured', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Get OAuth parameters
    const code = searchParams.get('code');
    const vkError = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Check for VK errors
    if (vkError) {
      // Ошибка от VK - не логируем (валидация)
      const errorCode = vkError === 'access_denied' ? 'oauth_denied' : 'oauth_error';
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
    const cleanState = isPopup ? state.split(':')[0] : state;
    const cleanStoredState = storedState?.includes(':popup') ? storedState.split(':')[0] : storedState;
    
    if (!cleanStoredState || cleanStoredState !== cleanState) {
      // Несоответствие state - не логируем (валидация)
      const errorUrl = getErrorRedirectUrl('invalid_state', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }
    
    const redirectUri = `${origin}/api/auth/oauth/vk/callback`;

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://oauth.vk.com/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: env.VK_CLIENT_ID,
        client_secret: env.VK_CLIENT_SECRET,
        code,
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
    
    // VK returns error in JSON if something went wrong
    if (tokenData.error) {
      logger.error('VK OAuth error', {
        error: tokenData.error,
        description: tokenData.error_description
      });
      const errorUrl = getErrorRedirectUrl('token_exchange_failed', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    const { access_token, user_id, email } = tokenData;

    if (!access_token || !user_id) {
      logger.error('No access token or user_id in VK OAuth response');
      const errorUrl = getErrorRedirectUrl('no_access_token', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // VK may not return email if user didn't grant email permission
    // Generate email from VK user_id if email is not provided
    let userEmail: string;
    if (email) {
      userEmail = email;
    } else {
      // Generate email from VK ID (format: vk_{user_id}@vk.local)
      userEmail = `vk_${user_id}@vk.local`;
    }

    // Fetch user info from VK API
    const userInfoResponse = await fetch(
      `https://api.vk.com/method/users.get?${new URLSearchParams({
        user_ids: user_id.toString(),
        fields: 'screen_name',
        access_token: access_token,
        v: '5.131',
      })}`
    );

    if (!userInfoResponse.ok) {
      logger.error('Failed to fetch user info from VK', { status: userInfoResponse.status });
      // Continue with email-based user creation even if user info fetch fails
    }

    let vkUsername: string | undefined;
    if (userInfoResponse.ok) {
      const userInfoData = await userInfoResponse.json();
      if (userInfoData.response && userInfoData.response[0]) {
        const vkUser = userInfoData.response[0];
        // Use screen_name if available, otherwise use first_name + last_name
        vkUsername = vkUser.screen_name || 
                     (vkUser.first_name && vkUser.last_name 
                       ? `${vkUser.first_name}_${vkUser.last_name}`.toLowerCase().replace(/[^a-z0-9_]/g, '_')
                       : undefined);
      }
    }

    // Get or create user
    let user = await getUserByEmail(userEmail);

    if (!user) {
      const createResult = await createUserFromOAuth(userEmail, vkUsername);
      
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
      ? new URL(`/auth/oauth-handler?provider=vk&success=true&dashboard_token=${user.dashboard_token}&popup=true`, origin)
      : new URL(`/dashboard/${user.dashboard_token}`, origin);
    const response = NextResponse.redirect(redirectUrl);

    // Copy protection cookies from request if they exist, or set temporary ones
    const accessGranted = request.cookies.get('access_granted')?.value;
    const accessHash = request.cookies.get('access_hash')?.value;
    const accessTime = request.cookies.get('access_time')?.value;

    // Determine cookie domain based on hostname
    const cookieDomain = getCookieDomain(hostname);

    if (accessGranted && accessHash) {
      // Preserve existing protection cookies
      response.cookies.set('access_granted', accessGranted, {
        maxAge: 60 * 60 * 2,
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax',
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      response.cookies.set('access_hash', accessHash, {
        maxAge: 60 * 60 * 2,
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax',
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      if (accessTime) {
        response.cookies.set('access_time', accessTime, {
          maxAge: 60 * 60 * 2,
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production' && !isLocalhost,
          sameSite: 'lax',
          path: '/',
          ...(cookieDomain && { domain: cookieDomain })
        });
      }
    } else {
      // Set temporary protection cookies for OAuth users
      const { createHash } = await import('crypto');
      const tempHash = createHash('sha256')
        .update(`${user.id}-${Date.now()}-oauth-temp`)
        .digest('hex');
      
      response.cookies.set('access_granted', 'true', {
        maxAge: 60 * 60 * 2,
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax',
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      response.cookies.set('access_hash', tempHash, {
        maxAge: 60 * 60 * 2,
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'lax',
        path: '/',
        ...(cookieDomain && { domain: cookieDomain })
      });

      response.cookies.set('access_time', Date.now().toString(), {
        maxAge: 60 * 60 * 2,
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

    // Успешный OAuth вход - не логируем

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('VK OAuth callback error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    try {
      const env = getEnv();
      {
        const origin = domains.mainUrl.endsWith('/') 
          ? domains.mainUrl.slice(0, -1) 
          : domains.mainUrl;
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


