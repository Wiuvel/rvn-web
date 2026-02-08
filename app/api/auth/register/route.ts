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
      // Rate limit - не логируем
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
    if (currentSessionId && csrfToken && !(await verifyCSRFToken(csrfToken, currentSessionId))) {
      // Невалидный CSRF токен - не логируем
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid request' },
          { status: 403 }
        )
      );
    }

    const result = await createUser(username, password);

    if (!result.success) {
      // Неудачная попытка создания - не логируем
      return setCorsHeaders(
        NextResponse.json(
          { error: result.error || 'Failed to create account' },
          { status: 400 }
        )
      );
    }

    const user = result.user!;
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Register device and get new token
    const token = await SessionManager.registerDevice(user.id, userAgent, ipAddress);

    const sessionId = await SessionManager.createSession(
      user.id,
      sanitizeInput(username),
      ipAddress,
      userAgent,
      token,
      'user'
    );

    await SessionManager.setSessionCookie(sessionId, isLocalhost);

    const response = NextResponse.json(
      { message: 'User created successfully', user_id: user.user_id },
      { status: 201 }
    );

    const { appConfig } = await import('@/lib/utils/config');

    response.cookies.set('token', token, {
      maxAge: appConfig.token.maxAge,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/'
    });

    const { createUserDataCookie, USER_DATA_COOKIE_NAME, getUserDataCookieOptions } = await import('@/lib/auth/user-cookie.server');
    response.cookies.set(USER_DATA_COOKIE_NAME, createUserDataCookie({
      user_id: user.user_id,
      username: user.username,
      avatar: user.avatar ?? null,
      banner: user.banner ?? null,
      pex: 'u',
    }), getUserDataCookieOptions(isLocalhost));
    // Успешная регистрация - не логируем

    return setCorsHeaders(response);
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



