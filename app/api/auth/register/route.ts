import { NextRequest, NextResponse } from 'next/server';
import { createUser } from '@/lib/auth';
import { authRateLimit } from '@/lib/rate-limit';
import { verifyCSRFToken } from '@/lib/csrf';
import { ServerValidator } from '@/lib/server-validation';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { SessionManager } from '@/lib/session-manager';

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

    // CSRF защита - упрощенная для регистрации
    const currentSessionId = request.cookies.get('session_id')?.value;
    if (currentSessionId && csrfToken && !verifyCSRFToken(csrfToken, currentSessionId)) {
      logger.warn('Invalid CSRF token for registration attempt', {
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
      logger.warn('Failed user creation attempt', {
        username: ServerValidator.sanitizeInput(username),
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
      ServerValidator.sanitizeInput(username),
      ipAddress,
      userAgent
    );

    await SessionManager.setSessionCookie(sessionId, isLocalhost);

    // Generate JWT tokens for new user
    const { generateAccessToken, generateRefreshToken } = await import('@/lib/jwt');
    const { storeRefreshToken } = await import('@/lib/jwt-storage');

    const accessToken = await generateAccessToken({
      userId: result.user!.id,
      username: result.user!.username,
      user_id: result.user!.user_id,
    });

    const refreshToken = await generateRefreshToken({
      userId: result.user!.id,
      tokenVersion: 1,
    });

    // Сохраняем refresh token в БД
    await storeRefreshToken(
      result.user!.id,
      refreshToken,
      {
        ipAddress,
        userAgent
      }
    );

    // Set authentication cookies
    const response = NextResponse.json(
      { 
        message: 'User created successfully',
        dashboard_token: result.user!.dashboard_token,
        access_token: accessToken
      },
      { status: 201 }
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

    // Successful registration
    logger.info('Successful user registration', {
      username: ServerValidator.sanitizeInput(username),
      ip: request.headers.get('x-forwarded-for')
    });

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



