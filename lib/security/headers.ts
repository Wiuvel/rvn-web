import { NextRequest, NextResponse } from 'next/server';
import { domains } from '@/lib/utils/config';

const MAIN_DOMAIN = domains.main;

/**
 * Проверяет, является ли hostname поддоменом основного домена
 * @param hostname - Hostname для проверки
 * @returns True если это поддомен основного домена
 */
export function isSubdomain(hostname: string): boolean {
  return hostname === MAIN_DOMAIN || hostname.endsWith(`.${MAIN_DOMAIN}`);
}

/**
 * Проверяет, является ли origin допустимым (основной домен или его поддомены)
 * @param origin - Origin header для проверки
 * @returns True если origin допустим
 */
export function isValidOrigin(origin: string): boolean {
  return origin.includes(MAIN_DOMAIN);
}

/**
 * Generates Content Security Policy header
 * Based on Next.js.org CSP structure, adapted for .market
 * @param isDev - Whether running in development mode
 * @returns CSP header string
 */
export function generateCSPHeader(isDev: boolean): string {
  // Extract domain from NEXT_PUBLIC_SUPABASE_URL
  let supabaseDomain = 'supabase.co';
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
      const url = new URL(supabaseUrl);
      supabaseDomain = url.hostname;
    }
  } catch (e) {
    supabaseDomain = 'supabase.co';
  }

  const turnstileDomain = 'challenges.cloudflare.com';

  // Base domains for CSP
  const baseDomains = `'self' ${MAIN_DOMAIN} *.${MAIN_DOMAIN}`;

  // Localhost for dev mode
  const localhost = isDev
    ? ' localhost:* http://localhost:* ws://localhost:* wss://localhost:*'
    : '';

  // CSP directives
  const csp = [
    `default-src ${baseDomains}${localhost};`,
    `script-src 'self' 'unsafe-eval' 'unsafe-inline' ${baseDomains} https://${turnstileDomain}${localhost};`,
    `style-src 'self' 'unsafe-inline' ${baseDomains}${localhost};`,
    `img-src 'self' blob: data: https://${supabaseDomain} ${baseDomains} *${localhost};`,
    `font-src 'self' ${baseDomains}${localhost};`,
    `connect-src 'self' https://${turnstileDomain} https://${supabaseDomain} ${baseDomains} *${localhost};`,
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
 * Applies security headers to response
 * @param response - The NextResponse object
 * @param isStaticFile - Whether this is a static file request
 * @param request - The NextRequest object (for origin detection)
 */
export function applySecurityHeaders(
  response: NextResponse,
  isStaticFile: boolean = false,
  request?: NextRequest,
): void {
  const isDev = process.env.NODE_ENV === 'development';
  const cspHeader = generateCSPHeader(isDev);

  // For static files, apply minimal headers to avoid HTTP/2 protocol errors
  if (isStaticFile) {
    // CORS headers for static files
    if (request) {
      const origin = request.headers.get('origin');
      const hostname = request.nextUrl.hostname;

      // Allow requests from same origin or subdomains
      if (origin && isValidOrigin(origin)) {
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
        response.headers.set('Access-Control-Max-Age', '86400');
      } else if (isSubdomain(hostname)) {
        // Allow all subdomains of main domain
        response.headers.set('Access-Control-Allow-Origin', '*');
        response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
        response.headers.set('Access-Control-Max-Age', '86400');
      }
    }

    // Set proper Content-Type for SVG files to avoid HTTP/2 errors
    // Only set if not already set by Next.js
    if (request) {
      const pathname = request.nextUrl.pathname.toLowerCase();
      if (pathname.endsWith('.svg') && !response.headers.has('Content-Type')) {
        response.headers.set('Content-Type', 'image/svg+xml');
      }
    }

    // Don't apply security headers to static files to avoid HTTP/2 protocol errors
    return;
  }

  // Security headers for non-static files
  response.headers.set('Content-Security-Policy', cspHeader);

  // Strict Transport Security (HSTS) - only in production, not for static files
  if (!isDev) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  // X-XSS-Protection
  response.headers.set('X-XSS-Protection', '1; mode=block');
}
