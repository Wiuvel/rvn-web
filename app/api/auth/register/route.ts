import { NextRequest, NextResponse } from 'next/server';
import { createAdmin, checkAdminExists } from '@/lib/auth';
import { authRateLimit } from '@/lib/rate-limit';
import { verifyCSRFToken } from '@/lib/csrf';
import { ServerValidator } from '@/lib/server-validation';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await authRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for registration attempt', {
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

    const { username, password, confirmPassword, csrfToken } = await request.json();

    // Валидация входных данных
    const dataValidation = ServerValidator.validateRequestData({ username, password, confirmPassword });
    if (!dataValidation.isValid) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid request data' },
          { status: 400 }
        )
      );
    }

    // Валидация username
    const usernameValidation = ServerValidator.validateUsername(username);
    if (!usernameValidation.isValid) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid username format' },
          { status: 400 }
        )
      );
    }

    // Валидация password
    const passwordValidation = ServerValidator.validatePassword(password);
    if (!passwordValidation.isValid) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid password format' },
          { status: 400 }
        )
      );
    }

    // Валидация confirmPassword
    const confirmPasswordValidation = ServerValidator.validateConfirmPassword(password, confirmPassword);
    if (!confirmPasswordValidation.isValid) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Passwords do not match' },
          { status: 400 }
        )
      );
    }

    // CSRF защита
    const sessionId = request.cookies.get('session_id')?.value;
    if (!sessionId || !csrfToken || !verifyCSRFToken(csrfToken, sessionId)) {
      logger.warn('Invalid CSRF token for registration attempt', {
        ip: request.headers.get('x-forwarded-for'),
        hasSessionId: !!sessionId,
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
    if (adminExists) {
      // Унифицированное сообщение об ошибке
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Registration is not available' },
          { status: 403 }
        )
      );
    }

    const result = await createAdmin(username, password);

    if (!result.success) {
      logger.warn('Failed admin creation attempt', {
        username: ServerValidator.sanitizeInput(username),
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
        error: result.error
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Failed to create admin account' },
          { status: 400 }
        )
      );
    }

    // Успешная регистрация
    logger.info('Successful admin registration', {
      username: ServerValidator.sanitizeInput(username),
      ip: request.headers.get('x-forwarded-for')
    });

    return setCorsHeaders(
      NextResponse.json(
        { message: 'Admin created successfully' },
        { status: 201 }
      )
    );
  } catch (error) {
    logger.error('Registration error', {
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



