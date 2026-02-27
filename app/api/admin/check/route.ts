import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { checkAdminExists } from '@/lib/auth/index';
import { SessionManager } from '@/lib/auth/session-manager';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for admin auth check', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return setCorsHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));
    }

    const adminExists = await checkAdminExists();
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('admin_sid')?.value;
    const token = cookieStore.get('admin_token')?.value;

    let isAuthenticated = false;
    if (sessionId) {
      const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';
      const validation = await SessionManager.validateSession(
        sessionId,
        token || '',
        ipAddress,
        userAgent,
      );
      isAuthenticated = validation.valid;
    }

    const username = cookieStore.get('admin_username')?.value ?? null;

    return setCorsHeaders(
      NextResponse.json({
        isAuthenticated,
        username: isAuthenticated ? username : null,
        adminExists,
      }),
    );
  } catch (error) {
    logger.error('Admin auth check error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });
    return setCorsHeaders(NextResponse.json({ error: 'Internal server error' }, { status: 500 }));
  }
}
