import { NextRequest } from 'next/server';
import { isAllowedBot } from '@/lib/security/suspicious-detector';

/**
 * Static file detection - bypasses all proxy checks
 * @param pathname - The request pathname
 * @returns True if the pathname is a static file
 */
export function isStaticFile(pathname: string): boolean {
  /** Common static files */
  if (
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    pathname.startsWith('/public/')
  ) {
    return true;
  }

  /** Common static file extensions */
  const staticExtensions = [
    '.ico',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.webp',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.css',
    '.js',
    '.map',
  ];
  return staticExtensions.some((ext) => pathname.toLowerCase().endsWith(ext));
}

/**
 * Early exit for static files, API routes, and bots
 * @param request - The request object
 * @returns True if the request should bypass all proxy checks
 */
export function shouldBypassProxy(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get('user-agent') || '';

  if (isStaticFile(pathname)) {
    return true;
  }

  /** API routes bypass protection but may have auth checks */
  if (pathname.startsWith('/api/')) {
    return true;
  }

  /** Next.js Server Components requests (internal navigation) */
  if (request.nextUrl.searchParams.has('_rsc')) {
    return true;
  }

  /** Разрешенные боты (Google, Yandex) обходят защиту */
  if (isAllowedBot(userAgent)) {
    return true;
  }

  return false;
}
