import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth/helper';
import { setUserDataCookie } from '@/lib/auth/helper';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const rawRedirect = searchParams.get('redirect') || '/dashboard';
  const redirectUrl = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/dashboard';

  // Construct base URL from headers to avoid 0.0.0.0 or internal IP usage
  const host = request.headers.get('host') || request.nextUrl.host;
  const protocol =
    request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '');
  const baseUrl = `${protocol}://${host}`;

  try {
    // Validate token and restore session/user_data
    const authResult = await checkAuth(request);
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (authResult.isAuthenticated && authResult.user) {
      // Restore user_data cookie
      await setUserDataCookie(authResult.user, isLocalhost);

      // Redirect back to the requested page
      // Use absolute URL to prevent issues with relative redirects
      return NextResponse.redirect(new URL(redirectUrl, baseUrl));
    }
  } catch {
    // Ignore errors, proceed to logout
  }

  // If authentication failed or error occurred -> clear only token and user_data, redirect to auth
  // session_id не трогаем: для неавторизованных его можно сохранять (CSRF, повторный вход)
  const authUrl = new URL('/auth', baseUrl);
  authUrl.searchParams.set('reason', 'session_expired');
  const response = NextResponse.redirect(authUrl);

  response.cookies.set('token', '', { maxAge: 0, path: '/' });
  response.cookies.set('user_data', '', { maxAge: 0, path: '/' });

  return response;
}
