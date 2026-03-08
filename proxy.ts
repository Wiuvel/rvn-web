import { NextRequest, NextResponse } from 'next/server';
import { applySecurityHeaders } from '@/lib/security/headers';
import { isStaticFile, shouldBypassProxy } from '@/lib/proxy/utils';
import { handleProtection } from '@/lib/proxy/protection';
import { handleAuth } from '@/lib/proxy/auth';

/**
 * Proxy.ts
 *
 * Порядок обработки запросов:
 * 1. Ранний выход для статических файлов, API маршрутов и разрешенных ботов.
 * 2. Проверка защиты (protection) - умное определение подозрительных посетителей.
 * 3. Проверка аутентификации (auth) - защита приватных маршрутов.
 * 4. Применение security headers для всех ответов.
 *
 * @param request - The Next.js request object
 * @returns NextResponse with appropriate redirect or next() to continue
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isStatic = isStaticFile(pathname);

  // Create headers with x-url and x-pathname:
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-url', request.url);
  requestHeaders.set('x-pathname', pathname);

  /**
   * Early release for static files, API routes, and allowed bots;
   * This optimizes performance by avoiding unnecessary checks.
   */
  if (shouldBypassProxy(request)) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    // Applying CORS headers to static files:
    if (isStatic) {
      applySecurityHeaders(response, true, request);
    }
    return response;
  }

  /**
   * 1. Protection Proxy - checks protection against bots and DDoS;
   * Uses smart detection of suspicious visitors.
   */
  const protectionResponse = await handleProtection(request, pathname);
  if (protectionResponse) {
    return protectionResponse;
  }

  /**
   * 2. Auth Proxy - authentication and authorization check;
   * Protects private routes (dashboard, control panels).
   */
  const authResponse = handleAuth(request, pathname, requestHeaders);
  if (authResponse) {
    return authResponse;
  }

  /**
   * Default response for public pages;
   * Apply security headers to all responses.
   */
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response, false);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes
     * - next/static (static files)
     * - next/image (image optimization files)
     * - favicon.ico, robots.txt, sitemap.xml
     * - public folder
     * - static folder
     *
     * Also exclude prefetch requests to avoid unnecessary CSP generation.
     */
    {
      source:
        '/((?!api|_next/static|_next/image|favicon.ico|public|static|robots.txt|sitemap.xml).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
        { type: 'query', key: '_rsc' }, // - RSC payload requests bypass proxy entirely.
      ],
    },
  ],
};
