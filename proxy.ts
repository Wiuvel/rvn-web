import { NextRequest, NextResponse } from 'next/server';
import { applySecurityHeaders } from '@/lib/security/headers';
import { isStaticFile, shouldBypassProxy } from '@/lib/proxy/utils';
import { handleProtection } from '@/lib/proxy/protection';
import { handleAuth } from '@/lib/proxy/auth';

/**
 * Next.js 16 Proxy
 *
 * Порядок обработки запросов:
 * 1. Ранний выход для статических файлов, API маршрутов и разрешенных ботов
 * 2. Проверка защиты (protection) - умное определение подозрительных посетителей
 * 3. Проверка аутентификации (auth) - защита приватных маршрутов
 * 4. Применение security headers для всех ответов
 *
 * @param request - The Next.js request object
 * @returns NextResponse with appropriate redirect or next() to continue
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isStatic = isStaticFile(pathname);

  // Create headers with x-url and x-pathname
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-url', request.url);
  requestHeaders.set('x-pathname', pathname);

  /**
   * Ранний выход для статических файлов, API маршрутов и разрешенных ботов
   * Это оптимизирует производительность, избегая ненужных проверок
   */
  if (shouldBypassProxy(request)) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    // Применяем CORS заголовки для статических файлов
    if (isStatic) {
      applySecurityHeaders(response, true, request);
    }
    return response;
  }

  /**
   * 1. Protection Proxy - проверка защиты от ботов и DDoS
   * Использует умное определение подозрительных посетителей
   */
  const protectionResponse = await handleProtection(request, pathname);
  if (protectionResponse) {
    return protectionResponse;
  }

  /**
   * 2. Auth Proxy - проверка аутентификации и авторизации
   * Защищает приватные маршруты (dashboard, панели управления)
   */
  const authResponse = handleAuth(request, pathname, requestHeaders);
  if (authResponse) {
    return authResponse;
  }

  /**
   * Дефолтный ответ для публичных страниц
   * Применяем security headers для всех ответов
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
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, robots.txt, sitemap.xml
     * - public folder
     * - static folder
     *
     * Also exclude prefetch requests to avoid unnecessary CSP generation
     */
    {
      source:
        '/((?!api|_next/static|_next/image|favicon.ico|public|static|robots.txt|sitemap.xml).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
