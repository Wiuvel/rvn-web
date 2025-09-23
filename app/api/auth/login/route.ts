import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, checkAdminExists } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const adminExists = await checkAdminExists();
    
    if (!adminExists) {
      return NextResponse.json(
        { error: 'No admin exists. Please register first.' },
        { status: 404 }
      );
    }

    const result = await authenticateAdmin(username, password);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Authentication failed' },
        { status: 401 }
      );
    }

    const cookieStore = await cookies();
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    cookieStore.set('admin_authenticated', 'true', {
      maxAge: 60 * 60 * 24 * 7, // 7 дней
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/'
    });

    cookieStore.set('admin_username', username, {
      maxAge: 60 * 60 * 24 * 7, // 7 дней
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/'
    });

    return NextResponse.json(
      { message: 'Login successful' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
