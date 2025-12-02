import { NextRequest, NextResponse } from 'next/server';
import { verifyRefreshAuth } from '@/lib/auth/verify';
import { generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt';
import { storeRefreshToken, revokeTokenByJti } from '@/lib/auth/tokens';
import { setTokenCookies, clearTokenCookies, extractTokensFromRequest } from '@/lib/auth/cookies';
import { getActiveUserById, toPublicUser } from '@/lib/auth/users';
import { refreshRateLimit } from '@/lib/rate-limit';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { logger } from '@/lib/secure-logger';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await refreshRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for token refresh', {
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.json({ error: 'Too many requests' }, { status: 429 })
      );
    }

    // Check if refresh token exists
    const { refreshToken: oldRefreshToken } = extractTokensFromRequest(request);
    if (!oldRefreshToken) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      );
    }

    // Verify refresh token
    const authResult = await verifyRefreshAuth(request);

    if (!authResult.success) {
      // Don't log expected errors (no token, expired token)
      if (authResult.code !== 'NO_TOKEN' && authResult.code !== 'TOKEN_EXPIRED') {
        logger.warn('Invalid refresh token', {
          code: authResult.code,
          ip: request.headers.get('x-forwarded-for'),
        });
      }
      
      // Clear cookies if refresh token is invalid/revoked
      const hostname = request.nextUrl.hostname;
      const errorResponse = NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
      clearTokenCookies(errorResponse, hostname);
      
      return setCorsHeaders(errorResponse);
    }

    const { userId, tokenVersion, jti: oldJti } = authResult;
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Get user data
    const user = await getActiveUserById(userId);
    if (!user) {
      // Clear cookies if user not found
      const hostname = request.nextUrl.hostname;
      const errorResponse = NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
      clearTokenCookies(errorResponse, hostname);
      
      return setCorsHeaders(errorResponse);
    }

    // Generate new tokens
    const newAccessToken = await generateAccessToken(
      { id: user.id, username: user.username, user_id: user.user_id },
      tokenVersion
    );

    const { token: newRefreshToken, jti: newJti } = await generateRefreshToken(
      userId,
      tokenVersion
    );

    // Store new refresh token BEFORE revoking old one
    const storeResult = await storeRefreshToken(
      userId,
      newRefreshToken,
      newJti,
      ipAddress,
      userAgent
    );

    if (!storeResult.success) {
      logger.error('Failed to store new refresh token', {
        userId,
        error: storeResult.error,
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Failed to refresh tokens. Please try again.' },
          { status: 500 }
        )
      );
    }

    // Revoke old token (token rotation)
    await revokeTokenByJti(oldJti, 'rotation');

    // Create response
    const response = NextResponse.json(
      {
        message: 'Tokens refreshed',
        user: toPublicUser(user),
      },
      { status: 200 }
    );

    // Set new cookies
    const hostname = request.nextUrl.hostname;
    setTokenCookies(response, newAccessToken, newRefreshToken, hostname);

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Token refresh error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });
    return setCorsHeaders(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    );
  }
}
