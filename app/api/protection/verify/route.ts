import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import crypto from 'crypto';

export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * POST - Проверить токен Turnstile для страницы protection
 */
export async function POST(request: NextRequest) {
  try {
    const { captchaToken } = await request.json();

    if (!captchaToken || typeof captchaToken !== 'string') {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid request data' },
          { status: 400 }
        )
      );
    }

    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey || secretKey === '1x0000000000000000000000000000000AA') {
      logger.error('Turnstile secret key not configured for protection');
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
      // Ошибка верификации Turnstile - не логируем (валидация)
      
      let errorMessage = 'CAPTCHA verification failed';
      if (errorCodes.includes('invalid-input-secret')) {
        logger.error('Turnstile secret key is invalid or not configured');
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

    // Успешная верификация Turnstile - генерируем защищенные куки
    // Используем HMAC-SHA256 для подписи данных (IP + UserAgent)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || '';
    
    // Формируем подпись: HMAC(IP|UserAgent, Secret)
    // Это связывает куку с конкретным IP и браузером, предотвращая кражу и подделку
    const data = `${ip}|${userAgent}`;
    const signature = crypto.createHmac('sha256', secretKey)
      .update(data)
      .digest('hex');

    const response = NextResponse.json({
      success: true,
      verified: true
    });

    // Устанавливаем защищенные HttpOnly куки
    const cookieOptions = {
      maxAge: 12 * 60 * 60, // 12 часов
      httpOnly: true, // Недоступно через JS (защита от XSS)
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/'
    };

    response.cookies.set('access_granted', 'true', cookieOptions);
    response.cookies.set('access_hash', signature, cookieOptions);
    response.cookies.set('access_time', Date.now().toString(), cookieOptions);

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Error verifying Turnstile token', {
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

