import { NextRequest, NextResponse } from 'next/server';
import { getUserByToken } from '@/lib/auth/index';
import { SessionManager } from '@/lib/auth/session-manager';
import { hasUserRole } from '@/lib/auth/user-roles';

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-internal-api-key');
  if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ valid: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { token, sessionId, tokenFromCookie, ip, userAgent } = body as {
      token: string;
      sessionId: string;
      tokenFromCookie: string;
      ip: string;
      userAgent: string;
    };

    if (!token) {
      return NextResponse.json({ valid: false, error: 'Missing token' });
    }

    // Validate token -> user
    const user = await getUserByToken(token);
    if (!user) {
      return NextResponse.json({ valid: false, error: 'Invalid token' });
    }

    // Validate session if provided
    if (sessionId && tokenFromCookie) {
      const validation = await SessionManager.validateSession(
        sessionId,
        tokenFromCookie,
        ip,
        userAgent,
      );
      if (!validation.valid) {
        return NextResponse.json({ valid: false, error: 'Invalid session' });
      }

      const session = await SessionManager.getSession(sessionId);
      if (!session || session.userId !== user.id) {
        return NextResponse.json({ valid: false, error: 'Session mismatch' });
      }
    }

    const isSupport = await hasUserRole(user.id, 'support');

    return NextResponse.json({
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        isSupport,
      },
    });
  } catch (error) {
    console.error('[internal/verify-token] Error:', error);
    return NextResponse.json({ valid: false, error: 'Internal error' }, { status: 500 });
  }
}
