import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkAdminExists } from '@/lib/auth';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = cookieStore.get('admin_authenticated')?.value === 'true';
    const username = cookieStore.get('admin_username')?.value;
    const adminExists = await checkAdminExists();

    return NextResponse.json({
      isAuthenticated,
      username: isAuthenticated ? username : null,
      adminExists
    });
  } catch (error) {
    console.error('Auth check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
