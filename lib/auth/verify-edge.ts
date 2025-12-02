/**
 * Edge Runtime compatible auth verification
 * NO database calls, NO Node.js modules
 */

import { jwtVerify } from 'jose';

// ============================================================================
// Types
// ============================================================================

interface AccessTokenPayload {
  sub: string;
  type: 'access';
  username: string;
  user_id: string;
  ver: number;
}

export interface VerifyResult {
  valid: true;
  payload: AccessTokenPayload;
}

export interface VerifyError {
  valid: false;
  expired: boolean;
  error: string;
}

export interface MiddlewareAuthResult {
  isAuthenticated: boolean;
  hasRefreshToken: boolean;
  tokenExpired: boolean;
  userId?: string;
}

// ============================================================================
// JWT Config (inline to avoid imports)
// ============================================================================

const JWT_ISSUER = 'rvn.market';
const JWT_AUDIENCE = 'rvn.market';

// ============================================================================
// Cookie Extraction
// ============================================================================

export function extractTokensFromRequest(request: {
  cookies: { get: (name: string) => { value: string } | undefined };
}): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  return {
    accessToken: request.cookies.get('access_token')?.value || null,
    refreshToken: request.cookies.get('refresh_token')?.value || null,
  };
}

// ============================================================================
// Token Verification
// ============================================================================

export async function verifyAccessToken(
  token: string
): Promise<VerifyResult | VerifyError> {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return { valid: false, expired: false, error: 'JWT_SECRET not configured' };
    }

    const secretKey = new TextEncoder().encode(secret);

    const { payload } = await jwtVerify(token, secretKey, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (payload.type !== 'access') {
      return { valid: false, expired: false, error: 'Invalid token type' };
    }

    if (!payload.sub || !payload.username || !payload.user_id) {
      return { valid: false, expired: false, error: 'Invalid token payload' };
    }

    return {
      valid: true,
      payload: payload as unknown as AccessTokenPayload,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const expired = message.includes('expired') || message.includes('exp');
    return { valid: false, expired, error: message };
  }
}

// ============================================================================
// Middleware Auth Check
// ============================================================================

export async function verifyAuthForMiddleware(
  request: { cookies: { get: (name: string) => { value: string } | undefined } }
): Promise<MiddlewareAuthResult> {
  const { accessToken, refreshToken } = extractTokensFromRequest(request);

  // No tokens
  if (!accessToken && !refreshToken) {
    return {
      isAuthenticated: false,
      hasRefreshToken: false,
      tokenExpired: false,
    };
  }

  // Only refresh token - allow access, page will refresh
  if (!accessToken && refreshToken) {
    return {
      isAuthenticated: true,
      hasRefreshToken: true,
      tokenExpired: true,
    };
  }

  // Has access token - verify it
  if (accessToken) {
    const result = await verifyAccessToken(accessToken);

    if (result.valid) {
      return {
        isAuthenticated: true,
        hasRefreshToken: !!refreshToken,
        tokenExpired: false,
        userId: result.payload.sub,
      };
    }

    // Invalid access token but has refresh token
    if (refreshToken) {
      return {
        isAuthenticated: true,
        hasRefreshToken: true,
        tokenExpired: result.expired,
      };
    }

    // No refresh token
    return {
      isAuthenticated: false,
      hasRefreshToken: false,
      tokenExpired: result.expired,
    };
  }

  return {
    isAuthenticated: false,
    hasRefreshToken: false,
    tokenExpired: false,
  };
}

