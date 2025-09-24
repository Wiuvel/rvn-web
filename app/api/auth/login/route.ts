import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, checkAdminExists } from '@/lib/auth';
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

    // CSRF protection
    const currentSessionId = request.cookies.get('session_id')?.value;
    if (!currentSessionId || !csrfToken || !(await verifyCSRFToken(csrfToken, currentSessionId))) {
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

    const adminExists = await checkAdminExists();
    
    if (!adminExists) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Authentication failed' },
          { status: 401 }
        )
      );
    }

    const result = await authenticateAdmin(username, password, request);

    if (!result.success) {
      logger.warn('Failed login attempt', {
        username: ServerValidator.sanitizeInput(username),
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
        remainingAttempts: result.remainingAttempts,
        blockTimeRemaining: result.blockTimeRemaining
      });
      
      const errorMessage = result.blockTimeRemaining 
        ? `Too many failed attempts. Please try again in ${Math.ceil(result.blockTimeRemaining / 60000)} minutes.`
        : 'Authentication failed';
        
      return setCorsHeaders(
        NextResponse.json(
          { error: errorMessage },
          { status: 401 }
        )
      );
    }

    // Successful authentication - create session
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    
    const sessionId = await SessionManager.createSession(
      result.admin!.id,
      ServerValidator.sanitizeInput(username),
      ipAddress,
      userAgent
    );

    // Revoke old CSRF token and set new session
    await revokeCSRFToken(sessionId);
    await SessionManager.setSessionCookie(sessionId, isLocalhost);

    logger.info('Successful login', {
      username: ServerValidator.sanitizeInput(username),
      sessionId: sessionId.substring(0, 8) + '...',
      ip: ipAddress
    });

    const cookieStore = await cookies();
    
    // Secure cookie settings
    cookieStore.set('admin_authenticated', 'true', {
      maxAge: 60 * 60 * 24 * 7, 
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict', // Back to strict for better security
      path: '/'
    });

    cookieStore.set('admin_username', ServerValidator.sanitizeInput(username), {
      maxAge: 60 * 60 * 24 * 7,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/'
    });

    return setCorsHeaders(
      NextResponse.json(
        { message: 'Login successful' },
        { status: 200 }
      )
    );
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
