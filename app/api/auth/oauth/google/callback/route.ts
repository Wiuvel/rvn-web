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
    // Rate limiting
    const rateLimitResult = await authRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for OAuth callback', {
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=rate_limit', request.nextUrl.origin)
        )
      );
    }

    // Проверяем наличие Google OAuth credentials
    const env = getEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      logger.error('Google OAuth not configured');
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=oauth_not_configured', request.nextUrl.origin)
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
          new URL('/auth?error=oauth_denied', request.nextUrl.origin)
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
          new URL('/auth?error=invalid_request', request.nextUrl.origin)
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
          new URL('/auth?error=invalid_state', request.nextUrl.origin)
        )
      );
    }

    // Определяем origin для production (учитываем прокси и заголовки)
    const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
    const origin = forwardedHost ? `https://${forwardedHost}` : request.nextUrl.origin;
    const redirectUri = `${origin}/api/auth/oauth/google/callback`;

    // Логируем для отладки
    logger.info('OAuth callback - exchanging code', {
      redirectUri,
      origin,
      forwardedHost,
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
          new URL('/auth?error=token_exchange_failed', request.nextUrl.origin)
        )
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token } = tokenData;

    if (!access_token) {
      logger.error('No access_token in OAuth response');
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=no_access_token', request.nextUrl.origin)
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
          new URL('/auth?error=user_info_failed', request.nextUrl.origin)
        )
      );
    }

    const userInfo = await userInfoResponse.json();
    const { email, verified_email } = userInfo;

    if (!email) {
      logger.error('No email in Google user info');
      return setCorsHeaders(
        NextResponse.redirect(
          new URL('/auth?error=no_email', request.nextUrl.origin)
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
          new URL('/auth?error=email_not_verified', request.nextUrl.origin)
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
          new URL('/auth?error=user_creation_failed', request.nextUrl.origin)
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
          new URL('/auth?error=account_disabled', request.nextUrl.origin)
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

    // Создаем redirect response
    const redirectUrl = new URL('/dashboard', request.nextUrl.origin);
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
    return setCorsHeaders(
      NextResponse.redirect(
        new URL('/auth?error=internal_error', request.nextUrl.origin)
      )
    );
  }
}

