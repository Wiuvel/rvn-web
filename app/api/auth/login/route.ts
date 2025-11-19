import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { cookies } from 'next/headers';
import { authRateLimit } from '@/lib/rate-limit';
import { verifyCSRFToken, revokeCSRFToken } from '@/lib/csrf';
import { ServerValidator } from '@/lib/server-validation';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { SessionManager } from '@/lib/session-manager';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await authRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for login attempt', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent')
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Too many login attempts. Please try again later.' },
          { status: 429 }
        )
      );
    }

    const { username, password, csrfToken } = await request.json();

    const dataValidation = ServerValidator.validateRequestData({ username, password });
    if (!dataValidation.isValid) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid request data' },
          { status: 400 }
        )
      );
    }

    const usernameValidation = ServerValidator.validateUsername(username);
    if (!usernameValidation.isValid) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid username format' },
          { status: 400 }
        )
      );
    }

    const passwordValidation = ServerValidator.validatePassword(password);
    if (!passwordValidation.isValid) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid password format' },
          { status: 400 }
        )
      );
    }

    // CSRF protection - упрощенная для логина
    const currentSessionId = request.cookies.get('session_id')?.value;
    if (currentSessionId && csrfToken && !verifyCSRFToken(csrfToken, currentSessionId)) {
      logger.warn('Invalid CSRF token for login attempt', {
        ip: request.headers.get('x-forwarded-for'),
        hasSessionId: !!currentSessionId,
        hasCsrfToken: !!csrfToken
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid request' },
          { status: 403 }
        )
      );
    }

    const result = await authenticateUser(username, password);

    if (!result.success) {
      logger.warn('Failed login attempt', {
        username: ServerValidator.sanitizeInput(username),
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent')
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: result.error || 'Authentication failed' },
          { status: 401 }
        )
      );
    }

    // Successful authentication - create session
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    
    const sessionId = SessionManager.createSession(
      result.user!.id,
      ServerValidator.sanitizeInput(username),
      ipAddress,
      userAgent
    );

    // Revoke old CSRF token and set new session
    revokeCSRFToken(sessionId);
    await SessionManager.setSessionCookie(sessionId, isLocalhost);

    logger.info('Successful login', {
      username: ServerValidator.sanitizeInput(username),
      sessionId: sessionId.substring(0, 8) + '...',
      ip: ipAddress
    });

    // Set authentication cookies
    const response = NextResponse.json(
      { 
        message: 'Login successful',
        dashboard_token: result.user!.dashboard_token
      },
      { status: 200 }
    );

    response.cookies.set('user_authenticated', 'true', {
      maxAge: 60 * 60 * 24 * 7,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/'
    });

    response.cookies.set('user_id', result.user!.id, {
      maxAge: 60 * 60 * 24 * 7,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/'
    });

    response.cookies.set('dashboard_token', result.user!.dashboard_token, {
      maxAge: 60 * 60 * 24 * 7,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/'
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Login error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for')
    });
    return setCorsHeaders(
      NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    );
  }
}
