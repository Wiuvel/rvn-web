import { NextRequest } from 'next/server';
import { isAllowedBot } from '@/lib/security/suspicious-detector';

/**
 * Detects static file paths that bypass all proxy checks.
 */
export function isStaticFile(pathname: string): boolean {
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
 * Early exit check for static files, API routes, and allowed bots.
 * @returns True if the request should bypass all proxy checks.
 */
export function shouldBypassProxy(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get('user-agent') || '';

  if (isStaticFile(pathname)) {
    return true;
  }

  if (pathname.startsWith('/api/')) {
    return true;
  }

  if (request.nextUrl.searchParams.has('_rsc')) {
    return true;
  }

  if (isAllowedBot(userAgent)) {
    return true;
  }

  return false;
}
