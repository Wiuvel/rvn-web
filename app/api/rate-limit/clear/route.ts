import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generalRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import {
  ERROR_INTERNAL_SERVER_ERROR,
  ERROR_INVALID_REQUEST_DATA,
  ERROR_NOT_AUTHENTICATED
} from '@/lib/constants';

export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * POST - Очистить rate limit после прохождения капчи
 */
export async function POST(request: NextRequest) {
  try {
    const { captchaToken } = await request.json();

    if (!captchaToken || typeof captchaToken !== 'string') {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INVALID_REQUEST_DATA },
          { status: 400 }
        )
      );
    }

    // Проверка авторизации (только для авторизованных пользователей)
    const cookieStore = await cookies();
    const isAuthenticated = cookieStore.get('user_authenticated')?.value === 'true';

    if (!isAuthenticated) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_NOT_AUTHENTICATED },
          { status: 401 }
        )
      );
    }

    // Верификация капчи через Cloudflare Turnstile
    const secretKey = process.env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA';
    const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: secretKey,
        response: captchaToken,
        remoteip: request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || undefined
      })
    });

    const verifyData = await verifyResponse.json();

    if (!verifyData.success) {
      logger.warn('Turnstile verification failed', {
        ip: request.headers.get('x-forwarded-for'),
        errors: verifyData['error-codes']
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'CAPTCHA verification failed' },
          { status: 400 }
        )
      );
    }

    // Устанавливаем временный иммунитет для текущего пользователя
    // grantImmunity возвращает время истечения для синхронизации с cookie
    const immunityExpiry = await generalRateLimit.grantImmunity(request);

    logger.info('Rate limit cleared and immunity granted after CAPTCHA', {
      ip: request.headers.get('x-forwarded-for'),
      immunityExpiry
    });

    // Создаем response с данными об иммунитете
    const response = NextResponse.json({
      success: true,
      immunityGranted: true,
      immunityExpiry
    });

    // Устанавливаем cookie с иммунитетом СРАЗУ после grantImmunity
    // Это гарантирует синхронизацию между cookie и store
    response.cookies.set('rate_limit_immunity', immunityExpiry.toString(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 минут в секундах
      path: '/'
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Error clearing rate limit', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for')
    });
    return setCorsHeaders(
      NextResponse.json(
        { error: ERROR_INTERNAL_SERVER_ERROR },
        { status: 500 }
      )
    );
  }
}

