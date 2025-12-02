import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth/verify';
import { revokeAllUserTokens, revokeRefreshToken } from '@/lib/auth/tokens';
import { clearTokenCookies, extractTokensFromRequest } from '@/lib/auth/cookies';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { logger } from '@/lib/secure-logger';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest) {
  try {
    const hostname = request.nextUrl.hostname;
    const { refreshToken } = extractTokensFromRequest(request);

    // Try to get user ID from access token (optional - logout should work even with invalid token)
    const authResult = await verifyAuth(request);
    const userId = authResult.success ? authResult.user.id : null;

    // Revoke current refresh token
    if (refreshToken) {
      await revokeRefreshToken(refreshToken, 'logout');
    }

    // Revoke all user tokens if we have userId
    if (userId) {
      const revokeResult = await revokeAllUserTokens(userId, 'logout');
      if (revokeResult.success && revokeResult.count) {
        logger.info('User logged out', {
          userId,
          revokedTokens: revokeResult.count,
          ip: request.headers.get('x-forwarded-for'),
        });
      }
    }

    // Create response and clear cookies
    const response = NextResponse.json(
      { message: 'Logout successful' },
      { status: 200 }
    );

    clearTokenCookies(response, hostname);

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Logout error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });

    // Even on error, try to clear cookies
    const response = NextResponse.json(
      { message: 'Logout completed' },
      { status: 200 }
    );

    clearTokenCookies(response, request.nextUrl.hostname);

    return setCorsHeaders(response);
  }
}
