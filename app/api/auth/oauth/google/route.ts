import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getEnv } from '@/lib/env-validation';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { logger } from '@/lib/secure-logger';
import { authRateLimit } from '@/lib/rate-limit';

// Handle CORS preflight
export async function OPTIONS() {
  return handleCorsPreflight();
}

// Initiate Google OAuth flow
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
      logger.warn('Rate limit exceeded for OAuth initiation', {
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
      logger.error('Google OAuth not configured', {
        hasClientId: !!env.GOOGLE_CLIENT_ID,
        hasClientSecret: !!env.GOOGLE_CLIENT_SECRET,
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=oauth_not_configured', origin)
        )
      );
    }

    // Generate CSRF state token
    const state = randomBytes(32).toString('hex');
    const redirectUri = `${origin}/api/auth/oauth/google/callback`;

    logger.info('OAuth initiation', {
      provider: 'google',
      redirectUri,
      origin,
      ip: request.headers.get('x-forwarded-for'),
    });

    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Redirect to Google OAuth
    const response = NextResponse.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'consent',
        state,
      }).toString()}`
    );

    // Store state in cookie for CSRF protection
    response.cookies.set('oauth_state', state, {
      maxAge: 10 * 60,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'lax',
      path: '/',
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('OAuth initiation error', {
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
            new URL('/auth?error=oauth_init_error', origin)
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
