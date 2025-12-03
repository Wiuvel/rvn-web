import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth/index';
import { authRateLimit } from '@/lib/security/rate-limit';
import { verifyCSRFToken, revokeCSRFToken } from '@/lib/security/csrf';
import { validateRequestBody } from '@/lib/api/validation';
import { adminAuthSchema } from '@/lib/validation/schemas';
import { sanitizeInput } from '@/lib/security/sanitize';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { SessionManager } from '@/lib/auth/session-manager';

const ADMIN_SESSION_COOKIE = 'admin_session_id';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await authRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for admin login attempt', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Too many login attempts. Please try again later.' },
          { status: 429 },
        ),
      );
    }

    // Validate request body with Zod
    const validation = await validateRequestBody(request, adminAuthSchema);
    if (!validation.success) {
      return validation.response;
    }

    const { username, password, csrfToken } = validation.data;

    const currentSessionId = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (currentSessionId && csrfToken && !verifyCSRFToken(csrfToken, currentSessionId)) {
      logger.warn('Invalid CSRF token for admin login attempt', {
        ip: request.headers.get('x-forwarded-for'),
        hasSessionId: !!currentSessionId,
        hasCsrfToken: !!csrfToken,
      });
      return setCorsHeaders(
        NextResponse.json({ error: 'Invalid request' }, { status: 403 }),
      );
    }

    const result = await authenticateAdmin(username, password);

    if (!result.success || !result.admin) {
      return setCorsHeaders(
        NextResponse.json(
          { error: result.error || 'Authentication failed' },
          { status: 401 },
        ),
      );
    }

    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    const sessionId = SessionManager.createSession(
      result.admin.id,
      sanitizeInput(username),
      ipAddress,
      userAgent,
    );

    revokeCSRFToken(sessionId);
    await SessionManager.setSessionCookie(sessionId, isLocalhost, ADMIN_SESSION_COOKIE);

    const response = NextResponse.json(
      {
        message: 'Admin login successful',
        username: sanitizeInput(username),
      },
      { status: 200 },
    );

    response.cookies.set('admin_authenticated', 'true', {
      maxAge: 60 * 60 * 6,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/',
    });

    response.cookies.set('admin_username', sanitizeInput(username), {
      maxAge: 60 * 60 * 6,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/',
    });

    logger.info('Admin login success', {
      username: sanitizeInput(username),
      sessionId: sessionId.substring(0, 8) + '...',
      ip: ipAddress,
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Admin login error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });
    return setCorsHeaders(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    );
  }
}


