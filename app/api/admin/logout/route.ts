import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const username = cookieStore.get('admin_username')?.value;

    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    const response = NextResponse.json(
      { message: 'Admin logout successful' },
      { status: 200 }
    );

    // Clear cookies
    response.cookies.set('admin_authenticated', '', {
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/',
    });

    response.cookies.set('admin_username', '', {
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/',
    });

    if (username) {
      logger.info('Admin logout', {
        username,
        ip: request.headers.get('x-forwarded-for'),
      });
    }

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Admin logout error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for'),
    });
    return setCorsHeaders(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    );
  }
}


