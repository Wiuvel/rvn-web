import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth';
import { authRateLimit } from '@/lib/rate-limit';
import { ServerValidator } from '@/lib/server-validation';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';

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

    const { username, password } = await request.json();

    const dataValidation = ServerValidator.validateRequestData({ username, password });
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
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    const response = NextResponse.json(
      {
        message: 'Admin login successful',
        username: ServerValidator.sanitizeInput(username),
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

    response.cookies.set('admin_username', ServerValidator.sanitizeInput(username), {
      maxAge: 60 * 60 * 6,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/',
    });

    logger.info('Admin login success', {
      username: ServerValidator.sanitizeInput(username),
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


