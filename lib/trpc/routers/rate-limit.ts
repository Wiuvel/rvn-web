import { cookies } from 'next/headers';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../init';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import { captchaBodySchema } from '@/lib/validation/api-schemas';

export const rateLimitRouter = router({
  clear: publicProcedure.input(captchaBodySchema).mutation(async ({ ctx, input }) => {
    const { captchaToken } = input;

    const cookieStore = await cookies();
    const isAuthenticated = cookieStore.get('user_authenticated')?.value === 'true';

    if (!isAuthenticated) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Требуется авторизация' });
    }

    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey || secretKey === '1x0000000000000000000000000000000AA') {
      logger.error('Turnstile secret key not configured', {
        ip: ctx.headers.get('x-forwarded-for'),
      });
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Сервис проверки недоступен',
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
            ctx.headers.get('x-forwarded-for')?.split(',')[0] ||
            ctx.headers.get('x-real-ip') ||
            undefined,
        }),
      },
    );

    const verifyData = await verifyResponse.json();

    if (!verifyData.success) {
      const errorCodes = verifyData['error-codes'] || [];
      logger.warn('Turnstile verification failed', {
        ip: ctx.headers.get('x-forwarded-for'),
        errors: errorCodes,
      });

      let errorMessage = 'Проверка не пройдена';
      if (errorCodes.includes('invalid-input-secret')) {
        logger.error('Turnstile secret key is invalid', {
          ip: ctx.headers.get('x-forwarded-for'),
        });
        errorMessage = 'Сервис проверки недоступен';
      } else if (errorCodes.includes('invalid-input-response')) {
        errorMessage = 'Неверный токен проверки';
      } else if (errorCodes.includes('timeout-or-duplicate')) {
        errorMessage = 'Токен истек, попробуйте снова';
      }

      throw new TRPCError({ code: 'BAD_REQUEST', message: errorMessage });
    }

    const immunityExpiry = await generalRateLimit.grantImmunity(ctx.req);

    cookieStore.set('rate_limit_immunity', immunityExpiry.toString(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 15 * 60,
      path: '/',
    });

    return { success: true, immunityGranted: true, immunityExpiry };
  }),
});
