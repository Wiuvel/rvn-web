import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth/verify';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);

    // Not authenticated - return 200 with authenticated: false
    // This prevents console errors on client side
    if (!authResult.success) {
      // Only return 401 for truly invalid tokens, not for missing tokens
      if (authResult.code === 'NO_TOKEN') {
        return setCorsHeaders(
          NextResponse.json({ authenticated: false }, { status: 200 })
        );
      }

      // Token expired - client should try to refresh
      if (authResult.code === 'TOKEN_EXPIRED') {
        return setCorsHeaders(
          NextResponse.json(
            { authenticated: false, expired: true },
            { status: 401 }
          )
        );
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
  } catch {
    // Internal error - return 500
    return setCorsHeaders(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    );
  }
}
