import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, toPublicUser } from '@/lib/auth/users';
import { generateAccessToken, generateRefreshToken } from '@/lib/auth/jwt';
import { storeRefreshToken } from '@/lib/auth/tokens';
import { setTokenCookies } from '@/lib/auth/cookies';
import { authRateLimit } from '@/lib/rate-limit';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { logger } from '@/lib/secure-logger';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await authRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for login', {
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Too many login attempts. Please try again later.' },
          { status: 429 }
        )
      );
    }

    // Parse request
    const body = await request.json();
    const { username, password } = body;

    // Validate input
    if (!username || typeof username !== 'string' || username.length < 3) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Invalid username' }, { status: 400 })
      );
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Invalid password' }, { status: 400 })
      );
    }

    // Authenticate user
    const authResult = await authenticateUser(username, password);

    if (!authResult.success) {
      logger.warn('Failed login attempt', {
        username: username.substring(0, 3) + '***',
        ip: request.headers.get('x-forwarded-for'),
        code: authResult.code,
      });
      return setCorsHeaders(
        NextResponse.json({ error: authResult.error }, { status: 401 })
      );
    }

    const { user } = authResult;
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Generate tokens
    const accessToken = await generateAccessToken(
      { id: user.id, username: user.username, user_id: user.user_id },
      user.token_version
    );

    const { token: refreshToken, jti } = await generateRefreshToken(
      user.id,
      user.token_version
    );

    // Store refresh token in DB
    const storeResult = await storeRefreshToken(
      user.id,
      refreshToken,
      jti,
      ipAddress,
      userAgent
    );

    if (!storeResult.success) {
      logger.error('Failed to store refresh token', {
        userId: user.id,
        error: storeResult.error,
      });
      // Continue anyway - access token will still work
    }

    // Create response
    const response = NextResponse.json(
      {
        message: 'Login successful',
        user: toPublicUser(user),
      },
      { status: 200 }
    );

    // Set cookies
    const hostname = request.nextUrl.hostname;
    setTokenCookies(response, accessToken, refreshToken, hostname);

    logger.info('User logged in', {
      userId: user.id,
      ip: ipAddress,
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Login error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });
    return setCorsHeaders(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    );
  }
}
