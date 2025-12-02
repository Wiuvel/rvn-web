import { NextRequest, NextResponse } from 'next/server';
import { generalRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { verifyAuth } from '@/lib/auth/verify';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
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

    const authResult = await verifyAuth(request);

    return setCorsHeaders(
      NextResponse.json({
        authenticated: authResult.success,
        userId: authResult.success ? authResult.user.id : null,
        dashboardToken: authResult.success ? authResult.user.dashboard_token : null,
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
