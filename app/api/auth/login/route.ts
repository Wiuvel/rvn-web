import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/index';
import { authRateLimit } from '@/lib/security/rate-limit';
import { verifyCSRFToken, revokeCSRFToken } from '@/lib/security/csrf';
import { validateRequestBody } from '@/lib/api/validation';
import { loginSchema } from '@/lib/validation/schemas';
import { sanitizeInput } from '@/lib/security/sanitize';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { SessionManager } from '@/lib/auth/session-manager';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await authRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      // Rate limit - не логируем
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Too many login attempts. Please try again later.' },
          { status: 429 }
        )
      );
    }

    // Validate request body with Zod
    const validation = await validateRequestBody(request, loginSchema);
    if (!validation.success) {
      return validation.response;
    }

    const { username, password, csrfToken } = validation.data;

    const currentSessionId = request.cookies.get('session_id')?.value;
    
    // Если есть session_id, CSRF токен обязателен и должен быть валидным
    // Если session_id нет, CSRF токен не требуется (первый запрос, но все равно проверяем если передан)
    if (currentSessionId) {
      if (!csrfToken) {
        // Отсутствует CSRF токен - не логируем (нормальная валидация)
        return setCorsHeaders(
          NextResponse.json(
            { error: 'Invalid request. Please refresh the page.' },
            { status: 403 }
          )
        );
      }
      
      // Проверка CSRF токена - не логируем
      
      const csrfValidation = verifyCSRFToken(csrfToken, currentSessionId, true);
      if (!csrfValidation.valid) {
        // Невалидный CSRF токен - не логируем (нормальная валидация)
        return setCorsHeaders(
          NextResponse.json(
            { error: 'Invalid request. Please refresh the page and try again.' },
            { status: 403 }
          )
        );
      }
    } else if (csrfToken) {
      // Если session_id нет, но CSRF токен передан - это подозрительно
      // Но не блокируем, так как это может быть первый запрос после очистки cookies
      // CSRF токен без session_id - не логируем
    }

    const result = await authenticateUser(username, password);

    if (!result.success) {
      // Неудачная попытка входа - не логируем (безопасность)
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
    
    // Session rotation: destroy old session if exists (prevents session fixation)
    const oldSessionId = currentSessionId;
    if (oldSessionId) {
      SessionManager.destroySession(oldSessionId);
      revokeCSRFToken(oldSessionId);
    }
    
    const sessionId = SessionManager.createSession(
      result.user!.id,
      sanitizeInput(username),
      ipAddress,
      userAgent
    );

    // Revoke old CSRF token and set new session
    revokeCSRFToken(sessionId);
    await SessionManager.setSessionCookie(sessionId, isLocalhost);

    // Успешный вход - не логируем

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
