import { NextRequest, NextResponse } from 'next/server';
import { createUser, toPublicUser } from '@/lib/auth/users';
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
      logger.warn('Rate limit exceeded for registration', {
        ip: request.headers.get('x-forwarded-for'),
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Too many registration attempts. Please try again later.' },
          { status: 429 }
        )
      );
    }

    // Parse request
    const body = await request.json();
    const { username, password, confirmPassword } = body;

    // Validate input
    if (!username || typeof username !== 'string') {
      return setCorsHeaders(
        NextResponse.json({ error: 'Username is required' }, { status: 400 })
      );
    }

    if (username.length < 3 || username.length > 20) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Username must be 3-20 characters' },
          { status: 400 }
        )
      );
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Username can only contain letters, numbers, and underscores' },
          { status: 400 }
        )
      );
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Password must be at least 6 characters' },
          { status: 400 }
        )
      );
    }

    if (password !== confirmPassword) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Passwords do not match' }, { status: 400 })
      );
    }

    // Create user
    const createResult = await createUser(username, password);

    if (!createResult.success) {
      logger.warn('Failed registration attempt', {
        username: username.substring(0, 3) + '***',
        ip: request.headers.get('x-forwarded-for'),
        error: createResult.error,
      });
      return setCorsHeaders(
        NextResponse.json({ error: createResult.error }, { status: 400 })
      );
    }

    const { user } = createResult;
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

    // Store refresh token
    await storeRefreshToken(user.id, refreshToken, jti, ipAddress, userAgent);

    // Create response
    const response = NextResponse.json(
      {
        message: 'Registration successful',
        user: toPublicUser(user),
      },
      { status: 201 }
    );

    // Set cookies
    const hostname = request.nextUrl.hostname;
    setTokenCookies(response, accessToken, refreshToken, hostname);

    logger.info('User registered', {
      userId: user.id,
      ip: ipAddress,
    });

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Registration error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });
    return setCorsHeaders(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    );
  }
}
