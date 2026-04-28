import { NextRequest, NextResponse } from 'next/server';
import { domains } from '@/lib/utils/config';

const MAIN_DOMAIN = domains.main;

/**
 * Checks if hostname is a subdomain of the main domain.
 */
export function isSubdomain(hostname: string): boolean {
  return hostname === MAIN_DOMAIN || hostname.endsWith(`.${MAIN_DOMAIN}`);
}

/**
 * Validates that origin belongs to the main domain or its subdomains.
 */
export function isValidOrigin(origin: string): boolean {
  return origin.includes(MAIN_DOMAIN);
}

/**
 * Generates Content Security Policy header.
 * Based on Next.js CSP structure, adapted for the project domain.
 */
export function generateCSPHeader(isDev: boolean): string {
  const turnstileDomain = 'challenges.cloudflare.com';

  const baseDomains = `'self' ${MAIN_DOMAIN} *.${MAIN_DOMAIN}`;

  const localhost = isDev
    ? ' localhost:* http://localhost:* ws://localhost:* wss://localhost:*'
    : '';

  const csp = [
    `default-src ${baseDomains}${localhost};`,
    `script-src 'self' 'unsafe-eval' 'unsafe-inline' ${baseDomains} https://${turnstileDomain}${localhost};`,
    `style-src 'self' 'unsafe-inline' ${baseDomains}${localhost};`,
    `img-src 'self' blob: data: ${baseDomains} *${localhost};`,
    `font-src 'self' ${baseDomains}${localhost};`,
    `connect-src 'self' https://${turnstileDomain} ${baseDomains} *${localhost};`,
    `frame-src 'self' https://${turnstileDomain} ${baseDomains}${localhost};`,
    `child-src 'self' https://${turnstileDomain} ${baseDomains}${localhost};`,
    `object-src 'none';`,
    `base-uri 'self';`,
    `form-action 'self';`,
    `frame-ancestors 'none';`,
    !isDev ? 'upgrade-insecure-requests;' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return csp;
}

/**
 * Applies security headers to the response.
 * Static files receive only CORS headers; non-static get full CSP + HSTS.
 */
export function applySecurityHeaders(
  response: NextResponse,
  isStaticFile: boolean = false,
  request?: NextRequest,
): void {
  const isDev = process.env.NODE_ENV === 'development';
  const cspHeader = generateCSPHeader(isDev);

  if (isStaticFile) {
    if (request) {
      const origin = request.headers.get('origin');
      const hostname = request.nextUrl.hostname;

      if (origin && isValidOrigin(origin)) {
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
        response.headers.set('Access-Control-Max-Age', '86400');
      } else if (isSubdomain(hostname)) {
        response.headers.set('Access-Control-Allow-Origin', '*');
        response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
        response.headers.set('Access-Control-Max-Age', '86400');
      }
    }

    // SVG Content-Type fix for HTTP/2
    if (request) {
      const pathname = request.nextUrl.pathname.toLowerCase();
      if (pathname.endsWith('.svg') && !response.headers.has('Content-Type')) {
        response.headers.set('Content-Type', 'image/svg+xml');
      }
    }

    return;
  }

  response.headers.set('Content-Security-Policy', cspHeader);

  if (!isDev) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  response.headers.set('X-XSS-Protection', '1; mode=block');
}
