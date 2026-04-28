import { NextRequest, NextResponse } from 'next/server';
import { domains } from '@/lib/utils/config';

const MAIN_DOMAIN = domains.main;

/**
 * Checks if hostname is the main domain or one of its subdomains.
 */
export function isSubdomain(hostname: string): boolean {
  return hostname === MAIN_DOMAIN || hostname.endsWith(`.${MAIN_DOMAIN}`);
}

/**
 * Validates that origin belongs to the main domain or its subdomains.
 * Parses the URL and compares the hostname suffix-style — guarding against
 * `https://attacker.com/?fake=rvn.market` style bypasses.
 */
export function isValidOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return isSubdomain(hostname);
  } catch {
    return false;
  }
}

/**
 * Extracts the origin (scheme + host[:port]) from an absolute URL.
 * Returns `null` when the input is missing or unparseable.
 */
function safeOrigin(input: string | undefined | null): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * Builds the connect-src and img-src extras from environment variables.
 * Empty allowlist parts are returned when the env is not configured.
 */
function getEnvAllowlists(): {
  s3Origin: string | null;
  wsHttp: string | null;
  wsRealtime: string | null;
} {
  const s3Origin = safeOrigin(process.env.S3_ENDPOINT);
  const wsHttp = safeOrigin(process.env.NEXT_PUBLIC_WS_URL);
  let wsRealtime: string | null = null;
  if (wsHttp) {
    try {
      const u = new URL(wsHttp);
      const wsScheme = u.protocol === 'https:' ? 'wss:' : 'ws:';
      wsRealtime = `${wsScheme}//${u.host}`;
    } catch {
      wsRealtime = null;
    }
  }
  return { s3Origin, wsHttp, wsRealtime };
}

/**
 * Generates the Content-Security-Policy header.
 *
 * Production:
 * - `'unsafe-eval'` is dropped.
 * - `connect-src` / `img-src` use an explicit allowlist; no `*` wildcard.
 *   S3 and WebSocket origins are read from `S3_ENDPOINT` / `NEXT_PUBLIC_WS_URL`
 *   (empty fallback if the env is not set).
 * - `'unsafe-inline'` is retained on `script-src` because the JSON-LD payload
 *   in `components/seo/StructuredData.tsx` ships as an inline script. The
 *   payload is server-controlled and `</` is escaped, so the practical risk
 *   is limited; a future migration can hash-pin it (`'sha256-...'`).
 *
 * Development:
 * - `'unsafe-eval'` and `'unsafe-inline'` remain to allow Turbopack / HMR.
 * - localhost (HTTP and WebSocket) is added to all relevant directives.
 */
export function generateCSPHeader(isDev: boolean): string {
  const turnstileDomain = 'https://challenges.cloudflare.com';
  const baseDomains = `'self' ${MAIN_DOMAIN} *.${MAIN_DOMAIN}`;
  const localhostHttp = isDev ? ' localhost:* http://localhost:* https://localhost:*' : '';
  const localhostWs = isDev ? ' ws://localhost:* wss://localhost:*' : '';

  const { s3Origin, wsHttp, wsRealtime } = getEnvAllowlists();
  const s3Part = s3Origin ? ` ${s3Origin}` : '';
  const wsHttpPart = wsHttp ? ` ${wsHttp}` : '';
  const wsRealtimePart = wsRealtime ? ` ${wsRealtime}` : '';

  // script-src:
  // - prod: 'self' + 'unsafe-inline' + baseDomains + Turnstile (no 'unsafe-eval')
  // - dev: + 'unsafe-eval' for Turbopack
  // baseDomains already includes 'self' — no need to prepend it again.
  const scriptSrcExtras = isDev ? " 'unsafe-eval'" : '';
  const scriptSrc =
    `script-src${scriptSrcExtras} 'unsafe-inline' ${baseDomains} ${turnstileDomain}${localhostHttp};`;

  // style-src: 'unsafe-inline' kept for CSS-in-JS / Tailwind runtime.
  const styleSrc = `style-src 'unsafe-inline' ${baseDomains}${localhostHttp};`;

  // Explicit allowlists; no `*`.
  const imgSrc = `img-src blob: data: ${baseDomains}${s3Part}${localhostHttp};`;
  const connectSrc =
    `connect-src ${turnstileDomain} ${baseDomains}` +
    `${s3Part}${wsHttpPart}${wsRealtimePart}${localhostHttp}${localhostWs};`;
  const fontSrc = `font-src ${baseDomains}${localhostHttp};`;
  const frameSrc = `frame-src ${turnstileDomain} ${baseDomains}${localhostHttp};`;
  const childSrc = `child-src ${turnstileDomain} ${baseDomains}${localhostHttp};`;

  const csp = [
    `default-src ${baseDomains}${localhostHttp};`,
    scriptSrc,
    styleSrc,
    imgSrc,
    fontSrc,
    connectSrc,
    frameSrc,
    childSrc,
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
 * Applies all baseline security headers to a response.
 *
 * Single source of truth — `next.config.ts` no longer sets duplicate
 * X-Content-Type-Options / X-Frame-Options / Referrer-Policy headers.
 *
 * Static files receive CORS + the same baseline headers (minus CSP, since
 * static assets don't execute scripts). HSTS is applied on every response
 * in production.
 */
export function applySecurityHeaders(
  response: NextResponse,
  isStaticFile: boolean = false,
  request?: NextRequest,
): void {
  const isDev = process.env.NODE_ENV === 'development';

  // Baseline headers — applied to every response (static and non-static).
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!isDev) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

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

      // SVG Content-Type fix for HTTP/2.
      const pathname = request.nextUrl.pathname.toLowerCase();
      if (pathname.endsWith('.svg') && !response.headers.has('Content-Type')) {
        response.headers.set('Content-Type', 'image/svg+xml');
      }
    }
    return;
  }

  response.headers.set('Content-Security-Policy', generateCSPHeader(isDev));
  response.headers.set('X-XSS-Protection', '1; mode=block');
}
