import { NextRequest, NextResponse } from 'next/server';
import { createUser } from '@/lib/auth/index';
import { authRateLimit } from '@/lib/security/rate-limit';
import { verifyCSRFToken } from '@/lib/security/csrf';
import { validateRequestBody } from '@/lib/api/validation';
import { registerSchema } from '@/lib/validation/schemas';
import { sanitizeInput } from '@/lib/security/sanitize';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { SessionManager } from '@/lib/auth/session-manager';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await authRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('RATE LIMIT EXCEEDED FOR REGISTRATION ATTEMPT', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent')
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Too many registration attempts. Please try again later.' },
          { status: 429 }
        )
      );
    }

    // Validate request body with Zod
    const validation = await validateRequestBody(request, registerSchema);
    if (!validation.success) {
      return validation.response;
    }

    const { username, password, csrfToken } = validation.data;

    // CSRF защита - упрощенная для регистрации
    const currentSessionId = request.cookies.get('session_id')?.value;
    if (currentSessionId && csrfToken && !verifyCSRFToken(csrfToken, currentSessionId)) {
      logger.warn('INVALID CSRF TOKEN FOR REGISTRATION ATTEMPT', {
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

    const result = await createUser(username, password);

    if (!result.success) {
      logger.warn('FAILED USER CREATION ATTEMPT', {
        username: sanitizeInput(username),
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
        error: result.error
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: result.error || 'Failed to create account' },
          { status: 400 }
        )
      );
    }

    // Create session for the new user
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    
    const sessionId = SessionManager.createSession(
      result.user!.id,
      sanitizeInput(username),
      ipAddress,
      userAgent
    );

    await SessionManager.setSessionCookie(sessionId, isLocalhost);

    // Set authentication cookies
    const response = NextResponse.json(
      { 
        message: 'User created successfully',
        dashboard_token: result.user!.dashboard_token
      },
      { status: 201 }
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

    // Successful registration
    logger.info('SUCCESSFUL USER REGISTRATION', {
      username: sanitizeInput(username),
      ip: request.headers.get('x-forwarded-for')
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('REGISTRATION ERROR', {
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



