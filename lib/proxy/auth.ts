import { NextRequest, NextResponse } from 'next/server';
import { parseUserDataCookie } from '@/lib/auth/user-cookie.server';
import { applySecurityHeaders } from '@/lib/security/headers';

/**
 * Handles authentication and authorization in the proxy layer.
 *
 * 1. Auth routes — redirect authenticated users to dashboard, pass OAuth callbacks.
 * 2. Dashboard routes — require token, enforce correct user ID in URL.
 * 3. Support/admin panels — require authentication.
 *
 * @returns Redirect response, or null to allow access.
 */
export function handleAuth(
  request: NextRequest,
  pathname: string,
  requestHeaders: Headers,
): NextResponse | null {
  const hasToken = !!request.cookies.get('token')?.value;
  const userData = parseUserDataCookie(request.cookies.get('user_data')?.value);
  const userId = userData?.user_id;

  /** Token present but user_data missing/invalid — redirect to restore endpoint. */
  if (hasToken && !userId) {
    if (!pathname.startsWith('/api/')) {
      const targetPath = pathname + request.nextUrl.search;
      const restoreUrl = new URL('/api/auth/restore', request.url);
      restoreUrl.searchParams.set('redirect', targetPath);
      const response = NextResponse.redirect(restoreUrl);
      applySecurityHeaders(response, false);
      return response;
    }
  }

  /** Auth routes — redirect authenticated users to dashboard. */
  if (pathname === '/auth' || pathname.startsWith('/auth/')) {
    if (
      pathname === '/auth/oauth-handler' ||
      pathname.startsWith('/auth/oauth-handler/') ||
      pathname === '/auth/oauth-callback' ||
      pathname.startsWith('/auth/oauth-callback/')
    ) {
      const response = NextResponse.next({ request: { headers: requestHeaders } });
      applySecurityHeaders(response, false);
      return response;
    }

    if (hasToken) {
      const return_to = request.nextUrl.searchParams.get('return_to');
      if (return_to && return_to.startsWith('/') && !return_to.startsWith('//')) {
        const response = NextResponse.redirect(new URL(return_to, request.url));
        applySecurityHeaders(response, false);
        return response;
      }
      const redirectPath = userId ? `/dashboard/${userId}` : '/dashboard';
      const response = NextResponse.redirect(new URL(redirectPath, request.url));
      applySecurityHeaders(response, false);
      return response;
    }

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    applySecurityHeaders(response, false);
    return response;
  }

  /** User settings — requires authentication. */
  if (pathname.startsWith('/user/settings')) {
    if (!hasToken) {
      const return_to = encodeURIComponent(pathname);
      const response = NextResponse.redirect(new URL(`/auth?return_to=${return_to}`, request.url));
      applySecurityHeaders(response, false);
      return response;
    }
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    applySecurityHeaders(response, false);
    return response;
  }

  /** Dashboard — requires authentication, enforces correct user ID in URL. */
  if (pathname.startsWith('/dashboard')) {
    if (!hasToken) {
      const return_to = encodeURIComponent(pathname);
      const response = NextResponse.redirect(new URL(`/auth?return_to=${return_to}`, request.url));
      applySecurityHeaders(response, false);
      return response;
    }

    if (pathname === '/dashboard' || pathname === '/dashboard/') {
      if (userId) {
        const response = NextResponse.redirect(new URL(`/dashboard/${userId}`, request.url));
        applySecurityHeaders(response, false);
        return response;
      }
      // No userId — let client-side useAuth handle redirection
      const response = NextResponse.next({ request: { headers: requestHeaders } });
      applySecurityHeaders(response, false);
      return response;
    }

    const dashboardSubPath = pathname.slice('/dashboard/'.length);
    const isSharedRoute =
      dashboardSubPath.startsWith('payment/') ||
      dashboardSubPath.startsWith('payment') ||
      dashboardSubPath === 'transactions' ||
      dashboardSubPath === 'devices' ||
      dashboardSubPath.startsWith('devices/');

    if (!isSharedRoute) {
      const urlUserId = dashboardSubPath.split('/')[0];
      if (urlUserId && userId && urlUserId !== userId) {
        const response = NextResponse.redirect(new URL(`/dashboard/${userId}`, request.url));
        applySecurityHeaders(response, false);
        return response;
      }
    }

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    applySecurityHeaders(response, false);
    return response;
  }

  /** Support panel — requires authentication. */
  if (pathname.startsWith('/ui/panel/support')) {
    if (!hasToken) {
      const return_to = encodeURIComponent(pathname);
      const response = NextResponse.redirect(new URL(`/auth?return_to=${return_to}`, request.url));
      applySecurityHeaders(response, false);
      return response;
    }
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    applySecurityHeaders(response, false);
    return response;
  }

  /** Admin panel — auth handled client-side. */
  if (pathname.startsWith('/ui/panel/admin')) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    applySecurityHeaders(response, false);
    return response;
  }

  /** Public support page — no auth required. */
  if (pathname === '/support' || pathname.startsWith('/support/')) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    applySecurityHeaders(response, false);
    return response;
  }

  return null;
}
