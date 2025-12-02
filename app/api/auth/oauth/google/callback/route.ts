import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env-validation';
import { createOrGetUserByEmail } from '@/lib/auth/users';
import { generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt';
import { storeRefreshToken } from '@/lib/auth/tokens';
import { setTokenCookies } from '@/lib/auth/cookies';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { logger } from '@/lib/secure-logger';
import { authRateLimit } from '@/lib/rate-limit';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    // Получаем PUBLIC_DOMAIN в начале функции для всех редиректов
    const env = getEnv();
    if (!env.PUBLIC_DOMAIN) {
      logger.error('PUBLIC_DOMAIN NOT CONFIGURED');
      return setCorsHeaders(
        NextResponse.json(
          { error: 'OAuth SERVICE NOT CONFIGURED' },
          { status: 503 }
        )
      );
    }

    // Убираем trailing slash если есть
    const origin = env.PUBLIC_DOMAIN.endsWith('/') 
      ? env.PUBLIC_DOMAIN.slice(0, -1) 
      : env.PUBLIC_DOMAIN;

    // Rate limiting
    const rateLimitResult = await authRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for OAuth callback', {
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=rate_limit', origin)
        )
      );
    }

    // Проверяем наличие Google OAuth credentials
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      logger.error('Google OAuth not configured');
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=oauth_not_configured', origin)
        )
      );
    }

    // Получаем параметры из query string
    const { searchParams } = request.nextUrl;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Проверяем на ошибки от Google
    if (error) {
      logger.warn('OAuth error from Google', {
        error,
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=oauth_denied', origin)
        )
      );
    }

    // Проверяем наличие code и state
    if (!code || !state) {
      logger.warn('OAuth callback missing parameters', {
        hasCode: !!code,
        hasState: !!state,
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=invalid_request', origin)
        )
      );
    }

    // Проверяем state токен (CSRF защита)
    const storedState = request.cookies.get('oauth_state')?.value;
    if (!storedState || storedState !== state) {
      logger.warn('OAuth state mismatch', {
        hasStoredState: !!storedState,
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=invalid_state', origin)
        )
      );
    }
    
    const redirectUri = `${origin}/api/auth/oauth/google/callback`;

    // Логируем для отладки
    logger.info('OAuth callback - exchanging code', {
      redirectUri,
      origin,
      ip: request.headers.get('x-forwarded-for'),
    });

    // Обмениваем code на access_token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      logger.error('Failed to exchange OAuth code for token', {
        status: tokenResponse.status,
        error: errorData,
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=token_exchange_failed', origin)
        )
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token } = tokenData;

    if (!access_token) {
      logger.error('No access_token in OAuth response');
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=no_access_token', origin)
        )
      );
    }

    // Получаем информацию о пользователе
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    if (!userInfoResponse.ok) {
      logger.error('Failed to fetch user info from Google', {
        status: userInfoResponse.status,
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=user_info_failed', origin)
        )
      );
    }

    const userInfo = await userInfoResponse.json();
    const { email, verified_email } = userInfo;

    if (!email) {
      logger.error('No email in Google user info');
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=no_email', origin)
        )
      );
    }

    if (!verified_email) {
      logger.warn('Google email not verified', {
        email: email.substring(0, 3) + '***',
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=email_not_verified', origin)
        )
      );
    }

    // Создаем или получаем пользователя
    const userResult = await createOrGetUserByEmail(email);

    if (!userResult.success) {
      logger.error('Failed to create or get user', {
        error: userResult.error,
        email: email.substring(0, 3) + '***',
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=user_creation_failed', origin)
        )
      );
    }

    const { user, isNewUser } = userResult;

    // Проверяем активность пользователя
    if (!user.is_active) {
      logger.warn('OAuth login attempt for inactive user', {
        userId: user.id,
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=account_disabled', origin)
        )
      );
    }

    // Генерируем JWT токены
    const accessToken = await generateAccessToken(
      { id: user.id, username: user.username, user_id: user.user_id },
      user.token_version
    );

    const { token: refreshToken, jti } = await generateRefreshToken(
      user.id,
      user.token_version
    );

    // Сохраняем refresh token в БД
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const storeResult = await storeRefreshToken(
      user.id,
      refreshToken,
      jti,
      ipAddress,
      userAgent
    );

    if (!storeResult.success) {
      logger.error('Failed to store refresh token', {
        userId: user.id,
        error: storeResult.error,
      });
      // Продолжаем - access token все равно будет работать
    }

    // Создаем redirect response (используем тот же origin, что и для OAuth)
    const redirectUrl = new URL('/dashboard', origin);
    const response = NextResponse.redirect(redirectUrl);

    // Устанавливаем токены в cookies
    const hostname = request.nextUrl.hostname;
    setTokenCookies(response, accessToken, refreshToken, hostname);

    // Удаляем oauth_state cookie
    response.cookies.delete('oauth_state');

    logger.info('OAuth login successful', {
      userId: user.id,
      username: user.username,
      isNewUser,
      provider: 'google',
      ip: ipAddress,
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('OAuth callback error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });
    
    // Получаем origin для редиректа на ошибку
    try {
      const env = getEnv();
      if (env.PUBLIC_DOMAIN) {
        const origin = env.PUBLIC_DOMAIN.endsWith('/') 
          ? env.PUBLIC_DOMAIN.slice(0, -1) 
          : env.PUBLIC_DOMAIN;
        return setCorsHeaders(
          NextResponse.redirect(
            new URL('/auth?error=internal_error', origin)
          )
        );
      }
    } catch {
      // Если не удалось получить env, возвращаем JSON ошибку
    }
    
    return setCorsHeaders(
      NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    );
  }
}

