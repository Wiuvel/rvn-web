import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { authRateLimit } from '@/lib/rate-limit';
import { verifyCSRFToken, revokeCSRFToken, getCSRFTokenInfo, getCSRFStoreSize } from '@/lib/csrf';
import { ServerValidator } from '@/lib/server-validation';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { SessionManager } from '@/lib/session-manager';
import { generateAccessToken, generateRefreshToken } from '@/lib/jwt';
import { storeRefreshToken } from '@/lib/jwt-storage';

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

    const currentSessionId = request.cookies.get('session_id')?.value;
    
    // Если есть session_id, CSRF токен обязателен и должен быть валидным
    // Если session_id нет, CSRF токен не требуется (первый запрос, но все равно проверяем если передан)
    if (currentSessionId) {
      if (!csrfToken) {
        logger.warn('Missing CSRF token for login attempt with existing session', {
          ip: request.headers.get('x-forwarded-for'),
          hasSessionId: true
        });
        return setCorsHeaders(
          NextResponse.json(
            { error: 'Invalid request. Please refresh the page.' },
            { status: 403 }
          )
        );
      }
      
      // Логируем информацию о токене перед проверкой
      const tokenInfo = getCSRFTokenInfo(currentSessionId);
      logger.info('CSRF token verification attempt', {
        sessionIdPrefix: currentSessionId?.substring(0, 8),
        tokenExistsInStore: tokenInfo.exists,
        tokenLength: csrfToken?.length || 0,
        storeSize: getCSRFStoreSize(),
        ip: request.headers.get('x-forwarded-for')
      });
      
      const csrfValidation = verifyCSRFToken(csrfToken, currentSessionId, true);
      if (!csrfValidation.valid) {
        logger.warn('Invalid CSRF token for login attempt', {
          ip: request.headers.get('x-forwarded-for'),
          hasSessionId: true,
          hasCsrfToken: !!csrfToken,
          tokenLength: csrfToken?.length || 0,
          sessionIdLength: currentSessionId?.length || 0,
          reason: csrfValidation.reason,
          sessionIdPrefix: currentSessionId?.substring(0, 8),
          tokenExistsInStore: tokenInfo.exists,
          storeSize: getCSRFStoreSize()
        });
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
      logger.info('CSRF token provided without session_id for login attempt', {
        ip: request.headers.get('x-forwarded-for'),
        hasCsrfToken: true
      });
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

    // Generate JWT tokens
    const tokenVersion = 1; // Можно использовать для инвалидации токенов при смене пароля
    const accessToken = await generateAccessToken({
      userId: result.user!.id,
      username: result.user!.username,
      user_id: result.user!.user_id,
    }, {
      tokenVersion
    });

    const refreshToken = await generateRefreshToken({
      userId: result.user!.id,
    }, {
      tokenVersion
    });

    // Сохраняем refresh token в БД
    const storeResult = await storeRefreshToken(
      result.user!.id,
      refreshToken,
      {
        ipAddress,
        userAgent
      }
    );

    if (!storeResult.success) {
      logger.warn('Failed to store refresh token in DB', {
        userId: result.user!.id,
        error: storeResult.error
      });
      // Продолжаем, даже если не удалось сохранить в БД
    }

    // Set authentication cookies
    const response = NextResponse.json(
      { 
        message: 'Login successful',
        dashboard_token: result.user!.dashboard_token,
        access_token: accessToken, // Также возвращаем в body для клиента
      },
      { status: 200 }
    );

    // JWT токены в cookies (httpOnly для безопасности)
    response.cookies.set('access_token', accessToken, {
      maxAge: 10 * 60, // 10 минут
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/'
    });

    response.cookies.set('refresh_token', refreshToken, {
      maxAge: 60 * 60 * 24 * 60, // 60 дней
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
