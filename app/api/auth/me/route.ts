import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserByToken } from '@/lib/auth';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const dashboardToken = cookieStore.get('dashboard_token')?.value;
    const isAuthenticated = cookieStore.get('user_authenticated')?.value === 'true';

    if (!isAuthenticated || !dashboardToken) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Not authenticated' },
          { status: 401 }
        )
      );
    }

    const user = await getUserByToken(dashboardToken);
    
    if (!user) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      );
    }

    return setCorsHeaders(
      NextResponse.json({
        id: user.id,
        user_id: user.user_id,
        username: user.username,
        dashboard_token: user.dashboard_token,
        created_at: user.created_at,
        last_login: user.last_login
      })
    );
  } catch (error) {
    logger.error('Get user error', {
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

