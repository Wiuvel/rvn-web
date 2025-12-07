import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/validation/env-validation';
import { authenticateAdmin } from '@/lib/auth/index';
import { SessionManager } from '@/lib/auth/session-manager';
import { sanitizeInput } from '@/lib/security/sanitize';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';
import { authRateLimit } from '@/lib/security/rate-limit';
import { getErrorRedirectUrl, GOOGLE_ERROR_MAP } from '@/lib/utils/oauth-errors';

const ADMIN_SESSION_COOKIE = 'admin_session_id';

export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * Check if GitHub email or username is in the trusted developers list from database
 */
async function isTrustedDeveloper(
  email: string | null | undefined,
  username: string,
  supabaseAdmin: any
): Promise<boolean> {
  if (!supabaseAdmin) {
    return false;
  }

  // Check by email first (preferred method)
  if (email) {
    const normalizedEmail = email.toLowerCase().trim();
    const { data: emailMatch } = await supabaseAdmin
      .from('trusted_github_developers')
      .select('id')
      .eq('email', normalizedEmail)
      .limit(1)
      .single();

    if (emailMatch) {
      return true;
    }
  }

  // Check by username
  const normalizedUsername = username.toLowerCase().trim();
  const { data: usernameMatch } = await supabaseAdmin
    .from('trusted_github_developers')
    .select('id')
    .eq('github_username', normalizedUsername)
    .limit(1)
    .single();

  return !!usernameMatch;
}

// Handle GitHub OAuth callback for admin panel
export async function GET(request: NextRequest) {
  try {
    const env = getEnv();
    if (!env.PUBLIC_DOMAIN) {
      logger.error('OAuth: PUBLIC_DOMAIN not configured.');
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
    const storedState = request.cookies.get('admin_oauth_state')?.value;
    const referer = request.headers.get('referer') || '';
    let isPopup = false;
    if (storedState) {
      isPopup = storedState.includes(':popup');
    }
    if (!isPopup && referer.includes('/ui/panel/admin')) {
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

    // Check GitHub OAuth credentials
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      logger.error('OAuth: GitHub not configured.');
      const errorUrl = getErrorRedirectUrl('oauth_not_configured', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Get OAuth parameters
    const code = searchParams.get('code');
    const githubError = searchParams.get('error');

    // Check for GitHub errors
    if (githubError) {
      const errorCode = GOOGLE_ERROR_MAP[githubError] || 'oauth_denied';
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
    
    const redirectUri = `${origin}/api/admin/oauth/github/callback`;

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      logger.error('OAuth: Failed to exchange GitHub code.', {
        status: tokenResponse.status
      });
      const errorUrl = getErrorRedirectUrl('token_exchange_failed', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    const tokenData = await tokenResponse.json();
    const { access_token, error: tokenError } = tokenData;

    if (tokenError || !access_token) {
      logger.error('OAuth: No access token in GitHub response.');
      const errorUrl = getErrorRedirectUrl('no_access_token', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Fetch user info from GitHub
    const userInfoResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userInfoResponse.ok) {
      logger.error('OAuth: Failed to fetch GitHub user info.', { 
        status: userInfoResponse.status 
      });
      const errorUrl = getErrorRedirectUrl('user_info_failed', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    const userInfo = await userInfoResponse.json();
    const { login: githubUsername, email: githubEmail } = userInfo;

    if (!githubUsername) {
      logger.error('OAuth: No username in GitHub user info.');
      const errorUrl = getErrorRedirectUrl('invalid_request', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Get email if not provided in user info
    let email = githubEmail;
    if (!email) {
      // Try to fetch email from GitHub API
      const emailResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (emailResponse.ok) {
        const emails = await emailResponse.json();
        const primaryEmail = emails.find((e: { primary: boolean }) => e.primary);
        if (primaryEmail && primaryEmail.verified) {
          email = primaryEmail.email;
        } else if (emails.length > 0) {
          // Use first verified email if no primary email found
          const verifiedEmail = emails.find((e: { verified: boolean }) => e.verified);
          if (verifiedEmail) {
            email = verifiedEmail.email;
          }
        }
      }
    }

    // Check if admin exists with this GitHub username
    // We need to import supabaseAdmin to check directly
    const { supabaseAdmin } = await import('@/lib/database/supabase');
    
    if (!supabaseAdmin) {
      logger.error('OAuth: Database not configured.');
      const errorUrl = getErrorRedirectUrl('internal_error', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Check if user is a trusted developer (by email or username) from database
    const isTrusted = await isTrustedDeveloper(email, githubUsername, supabaseAdmin);
    if (!isTrusted) {
      logger.warn('OAuth: Untrusted GitHub developer attempted admin login.', {
        username: githubUsername,
        email: email || 'not provided'
      });
      const errorUrl = getErrorRedirectUrl('oauth_denied', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Check if admin exists with this username
    // Admin must be created manually by Founder before developer can login via GitHub
    const { data: admin, error: adminError } = await supabaseAdmin
      .from('admins')
      .select('*')
      .eq('username', githubUsername)
      .single();

    if (adminError || !admin) {
      logger.warn('OAuth: Admin not found for GitHub username. Admin must be created manually before GitHub OAuth login.', {
        username: githubUsername,
        email: email || 'not provided',
        error: adminError?.message || 'Admin not found'
      });
      const errorUrl = getErrorRedirectUrl('oauth_denied', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    // Create admin session
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    
    // Destroy old session if exists
    const oldSessionId = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (oldSessionId) {
      SessionManager.destroySession(oldSessionId);
    }
    
    const sessionId = SessionManager.createSession(
      admin.id,
      sanitizeInput(githubUsername),
      ipAddress,
      userAgent
    );

    await SessionManager.setSessionCookie(sessionId, isLocalhost, ADMIN_SESSION_COOKIE);

    // Create redirect response
    // For popup, redirect to a handler page that will communicate with parent
    const redirectUrl = isPopup 
      ? new URL(`/ui/panel/admin/oauth-handler?success=true&username=${encodeURIComponent(githubUsername)}&popup=true`, origin)
      : new URL(`/ui/panel/admin`, origin);
    const response = NextResponse.redirect(redirectUrl);

    // Set admin authentication cookies
    response.cookies.set('admin_authenticated', 'true', {
      maxAge: 60 * 60 * 6,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'lax',
      path: '/'
    });

    response.cookies.set('admin_username', sanitizeInput(githubUsername), {
      maxAge: 60 * 60 * 6,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'lax',
      path: '/'
    });

    // Clear OAuth state cookie
    response.cookies.delete('admin_oauth_state');

    logger.info('OAuth: GitHub admin login successful.', {
      username: githubUsername
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('OAuth: GitHub callback error.', {
      error: error instanceof Error ? error.message : 'Unknown error'
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

