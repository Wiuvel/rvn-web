import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, verifyRefreshAuth } from '@/lib/auth/verify';
import { generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt';
import { storeRefreshToken, revokeTokenByJti } from '@/lib/auth/tokens';
import { getActiveUserById, toPublicUser, getUserRoles } from '@/lib/auth/users';
import { setTokenCookies, clearTokenCookies, extractTokensFromRequest } from '@/lib/auth/cookies';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { logger } from '@/lib/secure-logger';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);

    // Not authenticated - try to refresh if access token expired
    if (!authResult.success) {
      // Only return 200 for missing tokens
      if (authResult.code === 'NO_TOKEN') {
        return setCorsHeaders(
          NextResponse.json({ authenticated: false }, { status: 200 })
        );
      }

      // Token expired - try to refresh automatically
      if (authResult.code === 'TOKEN_EXPIRED') {
        const { refreshToken } = extractTokensFromRequest(request);
        
        // If refresh token exists, try to refresh
        if (refreshToken) {
          const refreshResult = await verifyRefreshAuth(request);
          
          if (refreshResult.success) {
            const { userId, tokenVersion, jti: oldJti } = refreshResult;
            const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
            const userAgent = request.headers.get('user-agent') || 'unknown';

            // Get user data
            const user = await getActiveUserById(userId);
            if (!user) {
              return setCorsHeaders(
                NextResponse.json({ authenticated: false }, { status: 200 })
              );
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

            if (storeResult.success) {
              // Revoke old token (token rotation)
              await revokeTokenByJti(oldJti, 'rotation');

              // Get roles
              const roles = await getUserRoles(user.id);
              const isSupport = roles.includes('support');
              const isAdmin = roles.includes('admin');

              // Create response with new tokens
              const response = NextResponse.json({
                authenticated: true,
                ...toPublicUser(user),
                isSupport,
                isAdmin,
              });

              // Set new cookies
              const hostname = request.nextUrl.hostname;
              setTokenCookies(response, newAccessToken, newRefreshToken, hostname);

              return setCorsHeaders(response);
            }
          }
        }

        // Refresh failed or no refresh token - clear cookies and return expired status
        const hostname = request.nextUrl.hostname;
        const errorResponse = NextResponse.json(
          { authenticated: false, expired: true },
          { status: 401 }
        );
        clearTokenCookies(errorResponse, hostname);
        
        return setCorsHeaders(errorResponse);
      }

      // Other errors
      return setCorsHeaders(
        NextResponse.json(
          { authenticated: false, error: authResult.message },
          { status: 401 }
        )
      );
    }

    // Check for support/admin roles
    const roles = authResult.roles;
    const isSupport = roles.includes('support');
    const isAdmin = roles.includes('admin');

    return setCorsHeaders(
      NextResponse.json({
        authenticated: true,
        ...authResult.user,
        isSupport,
        isAdmin,
      })
    );
  } catch (error) {
    logger.error('Auth me error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });
    // Internal error - return 500
    return setCorsHeaders(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    );
  }
}
