import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/validation/env-validation';
import { SessionManager } from '@/lib/auth/session-manager';
import { sanitizeInput } from '@/lib/security/sanitize';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';
import { authRateLimit } from '@/lib/security/rate-limit';
import { getErrorRedirectUrl, GOOGLE_ERROR_MAP } from '@/lib/utils/oauth-errors';
import { domains } from '@/lib/utils';
import type { db as dbClient } from '@/lib/database/db';

type Db = NonNullable<typeof dbClient>;

const ADMIN_SESSION_COOKIE = 'admin_sid';

/**
 * Handles CORS preflight requests for the OAuth endpoint
 *
 * @returns Response with CORS headers
 */
export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * Check if GitHub email or username is in the trusted developers list from database
 */
async function isTrustedDeveloper(
  email: string | null | undefined,
  username: string,
  db: Db | null,
): Promise<boolean> {
  if (!db) {
    return false;
  }

  const { trustedGithubDevelopers } = await import('@/lib/database/schema');
  const { eq } = await import('drizzle-orm');

  /* Check by email first (preferred method) */
  if (email) {
    const normalizedEmail = email.toLowerCase().trim();
    try {
      const rows = await db
        .select({ id: trustedGithubDevelopers.id })
        .from(trustedGithubDevelopers)
        .where(eq(trustedGithubDevelopers.email, normalizedEmail))
        .limit(1);

      if (rows[0]) {
        return true;
      }
    } catch (err) {
      console.error('Error checking trusted developer by email:', err);
    }
  }

  /*  Check by username */
  const normalizedUsername = username.toLowerCase().trim();
  try {
    const rows = await db
      .select({ id: trustedGithubDevelopers.id })
      .from(trustedGithubDevelopers)
      .where(eq(trustedGithubDevelopers.githubUsername, normalizedUsername))
      .limit(1);

    return !!rows[0];
  } catch (err) {
    console.error('Error checking trusted developer by username:', err);
    return false;
  }
}

/**
 * Handle GitHub OAuth callback for admin panel
 *
 * @param request - Next.js request object with OAuth parameters
 * @returns Redirect response to admin panel or error page
 *
 * @remarks
 * - Validates CSRF state token
 * - Exchanges code for access token
 * - Fetches GitHub user info
 * - Checks if user is a trusted developer
 * - Auto-creates admin account for trusted developers
 * - Creates session and sets cookies
 */
export async function GET(request: NextRequest) {
  try {
    const env = getEnv();
    const origin = domains.mainUrl.endsWith('/') ? domains.mainUrl.slice(0, -1) : domains.mainUrl;

    /* Get state early to determine if this is a popup request */
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

    /* Rate limiting */
    const rateLimitResult = await authRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      const errorUrl = getErrorRedirectUrl('rate_limit', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    /* Check GitHub OAuth credentials */
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      logger.error('OAuth: GitHub not configured.');
      const errorUrl = getErrorRedirectUrl('oauth_not_configured', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    /* Get OAuth parameters */
    const code = searchParams.get('code');
    const githubError = searchParams.get('error');

    /* Check for GitHub errors */
    if (githubError) {
      const errorCode = GOOGLE_ERROR_MAP[githubError] || 'oauth_denied';
      const errorUrl = getErrorRedirectUrl(errorCode, origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    /* Validate required parameters */
    if (!code || !state) {
      const errorUrl = getErrorRedirectUrl('invalid_request', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    /* Verify CSRF state token */
    const cleanState = isPopup ? state.split(':')[0] : state;
    const cleanStoredState = storedState?.includes(':popup')
      ? storedState.split(':')[0]
      : storedState;

    if (!cleanStoredState || cleanStoredState !== cleanState) {
      const errorUrl = getErrorRedirectUrl('invalid_state', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    const redirectUri = `${origin}/api/admin/oauth/github/callback`;

    /* Exchange authorization code for access token */
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
        status: tokenResponse.status,
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

    /* Fetch user info from GitHub */
    const userInfoResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userInfoResponse.ok) {
      logger.error('OAuth: Failed to fetch GitHub user info.', {
        status: userInfoResponse.status,
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

    /* Get email if not provided in user info */
    let email = githubEmail;
    if (!email) {
      /* Try to fetch email from GitHub API */
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
          /* Use first verified email if no primary email found */
          const verifiedEmail = emails.find((e: { verified: boolean }) => e.verified);
          if (verifiedEmail) {
            email = verifiedEmail.email;
          }
        }
      }
    }

    /* Check if admin exists with this GitHub username */
    const { db } = await import('@/lib/database/db');
    const { admins } = await import('@/lib/database/schema');
    const { eq } = await import('drizzle-orm');

    if (!db) {
      logger.error('OAuth: Database not configured.');
      const errorUrl = getErrorRedirectUrl('internal_error', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    /* Check if user is a trusted developer (by email or username) from database */
    const isTrusted = await isTrustedDeveloper(email, githubUsername, db);
    if (!isTrusted) {
      logger.warn('OAuth: Untrusted GitHub developer attempted admin login.', {
        username: githubUsername,
        email: email || 'not provided',
      });
      const errorUrl = getErrorRedirectUrl('oauth_denied', origin, isPopup);
      return setCorsHeaders(NextResponse.redirect(errorUrl));
    }

    /* Check if admin exists with this username */
    /* If not, create it automatically (for trusted developers) */
    let admin: (typeof adminRows)[0] | undefined;
    const adminRows = await db
      .select()
      .from(admins)
      .where(eq(admins.username, githubUsername))
      .limit(1);

    admin = adminRows[0];

    /* If admin doesn't exist, create it automatically */
    if (!admin) {
      try {
        const [newAdmin] = await db
          .insert(admins)
          .values({
            username: githubUsername,
            passwordHash: null,
            isRoot: false,
          })
          .returning();

        if (!newAdmin) {
          logger.error('OAuth: Failed to create admin for trusted developer.', {
            username: githubUsername,
            email: email || 'not provided',
            error: 'Insert returned no result',
          });
          const errorUrl = getErrorRedirectUrl('internal_error', origin, isPopup);
          return setCorsHeaders(NextResponse.redirect(errorUrl));
        }

        admin = newAdmin;
        logger.info('OAuth: Admin created automatically for trusted developer.', {
          username: githubUsername,
          email: email || 'not provided',
        });
      } catch (createError) {
        logger.error('OAuth: Failed to create admin for trusted developer.', {
          username: githubUsername,
          email: email || 'not provided',
          error: createError instanceof Error ? createError.message : 'Unknown error',
        });
        const errorUrl = getErrorRedirectUrl('internal_error', origin, isPopup);
        return setCorsHeaders(NextResponse.redirect(errorUrl));
      }
    }

    /* Create admin session */
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    /* Destroy old session if exists */
    const oldSessionId = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (oldSessionId) {
      await SessionManager.destroySession(oldSessionId);
    }

    const sessionId = await SessionManager.createSession(
      admin.id,
      sanitizeInput(githubUsername),
      ipAddress,
      userAgent,
      undefined,
      'admin',
    );

    await SessionManager.setSessionCookie(sessionId, isLocalhost, ADMIN_SESSION_COOKIE);

    /* Create redirect response */
    /* For popup, redirect to a handler page that will communicate with parent */
    const redirectUrl = isPopup
      ? new URL(
          `/ui/panel/admin/oauth-handler?success=true&username=${encodeURIComponent(githubUsername)}&popup=true`,
          origin,
        )
      : new URL(`/ui/panel/admin`, origin);
    const response = NextResponse.redirect(redirectUrl);

    /* Set admin authentication cookies */
    const cookieOptions = {
      maxAge: 60 * 60 * 6,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict' as const,
      path: '/',
    };

    response.cookies.set('admin_username', sanitizeInput(githubUsername), cookieOptions);

    logger.info('OAuth: Admin login successful', {
      username: githubUsername,
      ip: ipAddress,
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('OAuth: GitHub callback error.', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    try {
      {
        const origin = domains.mainUrl.endsWith('/')
          ? domains.mainUrl.slice(0, -1)
          : domains.mainUrl;
        const errorUrl = getErrorRedirectUrl('internal_error', origin, false);
        return setCorsHeaders(NextResponse.redirect(errorUrl));
      }
    } catch {}

    return setCorsHeaders(NextResponse.json({ error: 'Internal server error' }, { status: 500 }));
  }
}
