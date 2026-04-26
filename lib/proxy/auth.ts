import { NextRequest, NextResponse } from 'next/server';
import { parseUserDataCookie } from '@/lib/auth/user-cookie.server';
import { applySecurityHeaders } from '@/lib/security/headers';

/**
 * Auth Proxy - handles authentication and authorization
 *
 * Logic flow:
 * 1. Auth routes (login/register):
 *    - Redirect authenticated users to dashboard
 *    - Handle OAuth callbacks
 *
 * 2. Dashboard routes:
 *    - Require authentication (token cookie)
 *    - Redirect unauthenticated users to login
 *    - Enforce correct user ID in URL
 *
 * 3. Support panel:
 *    - Require authentication
 *
 * @param request - The Next.js request object
 * @param pathname - The request pathname
 * @param requestHeaders - Headers to pass to the response
 * @returns NextResponse with redirect or null to allow/deny access
 */
export function handleAuth(
  request: NextRequest,
  pathname: string,
  requestHeaders: Headers,
): NextResponse | null {
  const hasToken = !!request.cookies.get('token')?.value;
  const userData = parseUserDataCookie(request.cookies.get('user_data')?.value);
  const userId = userData?.user_id;

  /**
   * Session Restore & Validation
   * If token exists but user_data is missing or invalid (e.g. tampered):
   * 1. If token is valid: restore user_data and redirect back
   * 2. If token is invalid: clear cookies and redirect to auth
   * This prevents infinite redirect loops and restores broken sessions
   */
  if (hasToken && !userId) {
    // Avoid redirect loop if we are already on the restore route (handled by shouldBypassProxy, but safety first)
    if (!pathname.startsWith('/api/')) {
      const targetPath = pathname + request.nextUrl.search;
      const restoreUrl = new URL('/api/auth/restore', request.url);
      restoreUrl.searchParams.set('redirect', targetPath);
      const response = NextResponse.redirect(restoreUrl);
      applySecurityHeaders(response, false);
      return response;
    }
  }

  /**
   * Auth routes - redirect authenticated users to dashboard
   * Prevent logged-in users from accessing login/register pages
   */
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

  /**
   * User settings - requires authentication
   */
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

  /**
   * Dashboard routes - require authentication
   * Redirects unauthenticated users to login page with return URL
   */
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
      // If no userId (e.g. corrupted user_data cookie), let the page load
      // The client-side useAuth will handle the actual redirection or data fetching
      const response = NextResponse.next({ request: { headers: requestHeaders } });
      applySecurityHeaders(response, false);
      return response;
    }

    const dashboardSubPath = pathname.slice('/dashboard/'.length);
    const isSharedRoute =
      dashboardSubPath.startsWith('payment/') ||
      dashboardSubPath.startsWith('payment') ||
      dashboardSubPath === 'transactions';

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

  /**
   * Support panel - requires authentication
   * Redirects unauthenticated users to login page
   */
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

  /**
   * Admin panel - requires admin authentication
   * Currently, we allow all requests to pass through to the panel
   * Authentication is handled client-side or in server components
   */
  if (pathname.startsWith('/ui/panel/admin')) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    applySecurityHeaders(response, false);
    return response;
  }

  /**
   * Public support page - no auth required
   * Applies security headers to the response
   */
  if (pathname === '/support' || pathname.startsWith('/support/')) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    applySecurityHeaders(response, false);
    return response;
  }

  return null;
}
