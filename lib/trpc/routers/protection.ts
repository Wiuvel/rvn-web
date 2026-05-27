import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, authRateLimitedProcedure } from '../init';
import { logger } from '@/lib/utils/secure-logger';
import { captchaBodySchema } from '@/lib/validation/api-schemas';

export const protectionRouter = router({
  /** Верификация Turnstile и установка защищённых кук (аналог POST /api/protection/verify) */
  verify: authRateLimitedProcedure.input(captchaBodySchema).mutation(async ({ ctx, input }) => {
    const { captchaToken } = input;

    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey || secretKey === '1x0000000000000000000000000000000AA') {
      logger.error('Turnstile secret key not configured for protection');
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'CAPTCHA service not configured',
      });
    }

    const verifyResponse = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: secretKey,
          response: captchaToken,
          remoteip:
            ctx.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            ctx.headers.get('x-real-ip') ||
            undefined,
        }),
      },
    );

    const verifyData = (await verifyResponse.json()) as {
      success?: boolean;
      'error-codes'?: string[];
    };

    if (!verifyData.success) {
      const errorCodes = verifyData['error-codes'] || [];
      let errorMessage = 'CAPTCHA verification failed';
      if (errorCodes.includes('invalid-input-secret')) {
        logger.error('Turnstile secret key is invalid or not configured');
        errorMessage = 'CAPTCHA service configuration error';
      } else if (errorCodes.includes('invalid-input-response')) {
        errorMessage = 'CAPTCHA verification failed: Invalid token (may be already used)';
      } else if (errorCodes.includes('timeout-or-duplicate')) {
        errorMessage = 'CAPTCHA verification failed: Token expired or already used';
      }
      throw new TRPCError({ code: 'BAD_REQUEST', message: errorMessage });
    }

    const cookieStore = await cookies();
    const cookieOptions = {
      maxAge: 12 * 60 * 60, // 12 часов
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict' as const,
      path: '/',
    };

    const payload = Buffer.from(JSON.stringify({ t: Date.now() })).toString('base64url');
    const tokenHmac = crypto.createHmac('sha256', secretKey).update(payload).digest('hex');
    cookieStore.set('access_token', `${payload}.${tokenHmac}`, cookieOptions);

    return { success: true, verified: true };
  }),

  /** Получение IP клиента (аналог GET /api/ip) */
  getIp: publicProcedure.query(({ ctx }) => {
    const forwardedFor = ctx.headers.get('x-forwarded-for');
    const realIp = ctx.headers.get('x-real-ip');
    const cfConnectingIp = ctx.headers.get('cf-connecting-ip');

    const ip =
      forwardedFor?.split(',')[0]?.trim() || realIp || cfConnectingIp || 'Не удалось определить';

    return { ip };
  }),
});
