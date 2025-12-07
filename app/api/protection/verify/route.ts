import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';

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

    // Успешная верификация Turnstile - не логируем

    return setCorsHeaders(
      NextResponse.json({
        success: true,
        verified: true
      })
    );
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

