import { NextRequest, NextResponse } from 'next/server';
import { createAdmin, checkAdminExists } from '@/lib/auth/index';
import { authRateLimit } from '@/lib/security/rate-limit';
import { verifyCSRFToken } from '@/lib/security/csrf';
import { validateRequestBody } from '@/lib/api/validation';
import { adminRegisterSchema } from '@/lib/validation/schemas';
import { sanitizeInput } from '@/lib/security/sanitize';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';

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

    // Validate request body with Zod
    const validation = await validateRequestBody(request, adminRegisterSchema);
    if (!validation.success) {
      return validation.response;
    }

    const { username, password, csrfToken } = validation.data;

    const currentSessionId = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (currentSessionId && csrfToken && !(await verifyCSRFToken(csrfToken, currentSessionId))) {
      // Невалидный CSRF токен - не логируем
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
      username: sanitizeInput(username),
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


