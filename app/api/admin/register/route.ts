import { NextRequest, NextResponse } from 'next/server';
import { createAdmin, checkAdminExists } from '@/lib/auth';
import { authRateLimit } from '@/lib/rate-limit';
import { verifyCSRFToken } from '@/lib/csrf';
import { ServerValidator } from '@/lib/server-validation';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';

const ADMIN_SESSION_COOKIE = 'admin_session_id';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest) {
  try {
    const adminAlreadyExists = await checkAdminExists();
    if (adminAlreadyExists) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Admin account already exists' },
          { status: 403 },
        ),
      );
    }

    const rateLimitResult = await authRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for admin registration attempt', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Too many registration attempts. Please try again later.' },
          { status: 429 },
        ),
      );
    }

    const { username, password, confirmPassword, csrfToken } = await request.json();

    const dataValidation = ServerValidator.validateRequestData({
      username,
      password,
      confirmPassword,
    });
    if (!dataValidation.isValid) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Invalid request data' }, { status: 400 }),
      );
    }

    const usernameValidation = ServerValidator.validateUsername(username);
    if (!usernameValidation.isValid) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Invalid username format' }, { status: 400 }),
      );
    }

    const passwordValidation = ServerValidator.validatePassword(password);
    if (!passwordValidation.isValid) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Invalid password format' }, { status: 400 }),
      );
    }

    if (password !== confirmPassword) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Passwords do not match' }, { status: 400 }),
      );
    }

    const currentSessionId = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (currentSessionId && csrfToken && !verifyCSRFToken(csrfToken, currentSessionId)) {
      logger.warn('Invalid CSRF token for admin registration attempt', {
        ip: request.headers.get('x-forwarded-for'),
        hasSessionId: !!currentSessionId,
        hasCsrfToken: !!csrfToken,
      });
      return setCorsHeaders(
        NextResponse.json({ error: 'Invalid request' }, { status: 403 }),
      );
    }

    const result = await createAdmin(username, password);
    if (!result.success) {
      return setCorsHeaders(
        NextResponse.json({ error: result.error || 'Failed to create account' }, { status: 400 }),
      );
    }

    logger.info('Admin account created', {
      username: ServerValidator.sanitizeInput(username),
      ip: request.headers.get('x-forwarded-for'),
    });

    return setCorsHeaders(
      NextResponse.json(
        { message: 'Admin created successfully' },
        { status: 201 },
      ),
    );
  } catch (error) {
    logger.error('Admin registration error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });
    return setCorsHeaders(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    );
  }
}


