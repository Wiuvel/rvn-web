import { NextRequest, NextResponse } from 'next/server';
import { applySecurityHeaders } from '@/lib/security/headers';
import { isStaticFile, shouldBypassProxy } from '@/lib/proxy/utils';
import { handleProtection } from '@/lib/proxy/protection';
import { handleAuth } from '@/lib/proxy/auth';

/**
 * Main proxy middleware entry point.
 * Processes requests in the following order:
 * 1. Bypasses static files, API routes, and allowed bots.
 * 2. Executes bot and DDoS protection checks.
 * 3. Enforces authentication and authorization on private routes.
 * 4. Injects security headers on all responses.
 *
 * @param request The incoming Next.js request.
 * @returns The Next.js response (continue or redirect).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isStatic = isStaticFile(pathname);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-url', request.url);
  requestHeaders.set('x-pathname', pathname);

  if (shouldBypassProxy(request)) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    if (isStatic) {
      applySecurityHeaders(response, true, request);
    }
    return response;
  }

  const protectionResponse = await handleProtection(request, pathname);
  if (protectionResponse) {
    return protectionResponse;
  }

  const authResponse = handleAuth(request, pathname, requestHeaders);
  if (authResponse) {
    return authResponse;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response, false);
  return response;
}

/**
 * Excludes static assets, API endpoints, and prefetch/RSC requests from middleware execution..
 * .. to reduce latency and prevent unnecessary CSP header generation.
 */
export const config = {
  matcher: [
    {
      source:
        '/((?!api|_next/static|_next/image|favicon.ico|public|static|robots.txt|sitemap.xml).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
        { type: 'query', key: '_rsc' },
      ],
    },
  ],
};
