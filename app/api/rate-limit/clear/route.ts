import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import {
  ERROR_INTERNAL_SERVER_ERROR,
  ERROR_INVALID_REQUEST_DATA,
  ERROR_NOT_AUTHENTICATED
} from '@/lib/utils/constants';

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

    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey || secretKey === '1x0000000000000000000000000000000AA') {
      logger.error('Turnstile secret key not configured', {
        ip: request.headers.get('x-forwarded-for'),
        hasKey: !!secretKey,
        isTestKey: secretKey === '1x0000000000000000000000000000000AA'
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'CAPTCHA service not configured' },
          { status: 500 }
        )
      );
    }
    
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
      const errorCodes = verifyData['error-codes'] || [];
      logger.warn('Turnstile verification failed', {
        ip: request.headers.get('x-forwarded-for'),
        errors: errorCodes,
        captchaToken: captchaToken.substring(0, 20) + '...' // Логируем только начало токена
      });
      
      // Более детальное сообщение об ошибке для отладки
      let errorMessage = 'CAPTCHA verification failed';
      if (errorCodes.includes('invalid-input-secret')) {
        // КРИТИЧЕСКАЯ ОШИБКА: Секретный ключ неверный или не установлен
        logger.error('Turnstile secret key is invalid or not configured', {
          ip: request.headers.get('x-forwarded-for'),
          errorCodes
        });
        errorMessage = 'CAPTCHA service configuration error';
      } else if (errorCodes.includes('invalid-input-response')) {
        errorMessage = 'CAPTCHA verification failed: Invalid token (may be already used)';
      } else if (errorCodes.includes('timeout-or-duplicate')) {
        errorMessage = 'CAPTCHA verification failed: Token expired or already used';
      }
      
      return setCorsHeaders(
        NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        )
      );
    }

    // Устанавливаем временный иммунитет для текущего пользователя
    // grantImmunity возвращает время истечения для синхронизации с cookie
    const immunityExpiry = await generalRateLimit.grantImmunity(request);

    // Rate limit очищен - не логируем

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

