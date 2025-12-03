import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: Request) {
  try {
    // Rate limiting
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for auth check', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent')
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Too many requests' },
          { status: 429 }
        )
      );
    }

    const cookieStore = await cookies();
    const isAuthenticated = cookieStore.get('user_authenticated')?.value === 'true';
    const userId = cookieStore.get('user_id')?.value;
    const dashboardToken = cookieStore.get('dashboard_token')?.value;

    return setCorsHeaders(
      NextResponse.json({
        isAuthenticated,
        userId: isAuthenticated ? userId : null,
        dashboardToken: isAuthenticated ? dashboardToken : null
      })
    );
  } catch (error) {
    logger.error('Auth check error', {
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
