import { NextRequest, NextResponse } from 'next/server';

// Домены из переменных окружения
const MAIN_DOMAIN = process.env.NEXT_PUBLIC_DOMAIN?.replace(/^https?:\/\//, '') || 
                    process.env.PUBLIC_DOMAIN?.replace(/^https?:\/\//, '') || 
                    'rvn.market';
const CDN_DOMAIN = process.env.NEXT_PUBLIC_CDN_URL?.replace(/^https?:\/\//, '') || 
                   process.env.CDN_URL?.replace(/^https?:\/\//, '') || 
                   'cdn.rvn.market';

/**
 * Generates Content Security Policy header
 * Based on Next.js.org CSP structure, adapted for rvn.market
 * @param isDev - Whether running in development mode
 * @returns CSP header string
 */
function generateCSPHeader(isDev: boolean): string {
  const supabaseDomain = 'ljeklmajzfylmyqjxcck.supabase.co';
  const turnstileDomain = 'challenges.cloudflare.com';
  
  // Base domains for CSP - explicitly include CDN domain
  const baseDomains = `'self' ${MAIN_DOMAIN} *.${MAIN_DOMAIN} https://${CDN_DOMAIN} http://${CDN_DOMAIN}`;
  
  // Localhost for dev mode
  const localhost = isDev ? ' localhost:* http://localhost:* ws://localhost:* wss://localhost:*' : '';
  
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
    !isDev ? 'upgrade-insecure-requests;' : ''
  ].filter(Boolean).join(' ');
  
  return csp;
}

/**
 * Applies security headers to response
 * @param response - The NextResponse object
 * @param isStaticFile - Whether this is a static file request
 * @param request - The NextRequest object (for CDN detection)
 */
function applySecurityHeaders(response: NextResponse, isStaticFile: boolean = false, request?: NextRequest): void {
  const isDev = process.env.NODE_ENV === 'development';
  const cspHeader = generateCSPHeader(isDev);
  
  // Set CSP header (only for non-static files to avoid blocking CDN resources)
  if (!isStaticFile) {
    response.headers.set('Content-Security-Policy', cspHeader);
  }
  
  // Strict Transport Security (HSTS) - only in production
  if (!isDev) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // X-XSS-Protection
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
  // CORS headers for static files (CDN support)
  if (isStaticFile && request) {
    const origin = request.headers.get('origin');
    const hostname = request.nextUrl.hostname;
    
    // Allow requests from CDN domain or same origin
    if (origin && (origin.includes('cdn.rvn.market') || origin.includes('rvn.market'))) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
      response.headers.set('Access-Control-Max-Age', '86400');
    } else if (hostname === 'cdn.rvn.market' || hostname.endsWith('.rvn.market')) {
      // Allow all subdomains of rvn.market (including cdn.rvn.market)
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
      response.headers.set('Access-Control-Max-Age', '86400');
    }
  }
}

/**
 * Static file detection - bypasses all proxy checks
 * @param pathname - The request pathname
 * @returns True if the pathname is a static file
 */
function isStaticFile(pathname: string): boolean {
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
    '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
    '.woff', '.woff2', '.ttf', '.eot', '.css', '.js', '.map'
  ];
  return staticExtensions.some(ext => pathname.toLowerCase().endsWith(ext));
}

/**
 * Early exit for static files, API routes, and bots
 * @param pathname - The request pathname
 * @param userAgent - The request user agent
 * @param hostname - The request hostname (for CDN detection)
 * @returns True if the request should bypass all proxy checks
 */
function shouldBypassProxy(pathname: string, userAgent: string, hostname?: string): boolean {
  // CDN domain requests - always bypass protection for static files
  if (hostname && (hostname === 'cdn.rvn.market' || hostname.endsWith('.rvn.market'))) {
    if (isStaticFile(pathname)) {
      return true;
    }
  }
  
  if (isStaticFile(pathname)) {
    return true;
  }

  /** API routes bypass protection but may have auth checks */
  if (pathname.startsWith('/api/')) {
    return true;
  }

  /** Bot detection */
  return /googlebot|bingbot|yandex|duckduckbot|twitterbot|whatsapp|telegrambot|discordbot|applebot|redditbot/i.test(userAgent);
}

/**
 * Protection Proxy - checks if user passed protection screen
 * @param request - The Next.js request object
 * @param pathname - The request pathname
 * @returns NextResponse with redirect to protection page, or null to allow access
 */
function handleProtection(request: NextRequest, pathname: string): NextResponse | null {
  const accessGranted = request.cookies.get('access_granted')?.value === 'true';
  const accessHash = request.cookies.get('access_hash')?.value;

  /** Protection page itself - allow access, but redirect if already protected */
  if (pathname === '/protection' || pathname.startsWith('/protection/')) {
    if (accessGranted && accessHash) {
      const response = NextResponse.redirect(new URL('/', request.url));
      applySecurityHeaders(response, false);
      return response;
    }
    const response = NextResponse.next();
    applySecurityHeaders(response, false);
    return response;
  }

  /** OAuth routes - must bypass protection for OAuth flow */
  if (pathname.startsWith('/api/auth/oauth/') || 
      pathname === '/auth/oauth-handler' || 
      pathname.startsWith('/auth/oauth-handler/')) {
    return null;
  }

  /** All auth routes bypass protection */
  if (pathname === '/auth' || pathname.startsWith('/auth/')) {
    return null;
  }

  /** User has protection cookies - allow access */
  if (accessGranted && accessHash) {
    return null;
  }

  /**
   * Special case: OAuth users redirecting to dashboard
   * Protection cookies may not be set yet due to cookie timing
   */
  const isAuthenticated = request.cookies.get('user_authenticated')?.value === 'true';
  const hasDashboardToken = !!request.cookies.get('dashboard_token')?.value;
  const hasSession = !!request.cookies.get('session_id')?.value;

  if (isAuthenticated && hasDashboardToken && hasSession && pathname.startsWith('/dashboard')) {
    return null;
  }

  /** Redirect to protection page */
  const targetPath = pathname + request.nextUrl.search;
  const response = NextResponse.redirect(
    new URL(`/protection?redirect=${encodeURIComponent(targetPath)}`, request.url)
  );
  
  applySecurityHeaders(response, false);
  
  const hostname = request.nextUrl.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

  response.cookies.set('target_path', targetPath, {
    maxAge: 60 * 60 * 2, /** 2 hours */
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && !isLocalhost,
    sameSite: 'strict',
    path: '/'
  });

  return response;
}

/**
 * Auth Proxy - handles authentication and authorization
 * @param request - The Next.js request object
 * @param pathname - The request pathname
 * @returns NextResponse with redirect or null to allow/deny access
 */
function handleAuth(request: NextRequest, pathname: string): NextResponse | null {
  const isAuthenticated = request.cookies.get('user_authenticated')?.value === 'true';
  const dashboardToken = request.cookies.get('dashboard_token')?.value;

  /** Auth routes - redirect authenticated users to dashboard */
  if (pathname === '/auth' || pathname.startsWith('/auth/')) {
    /** OAuth handler/callback pages should not be redirected */
    if (
      pathname === '/auth/oauth-handler' ||
      pathname.startsWith('/auth/oauth-handler/') ||
      pathname === '/auth/oauth-callback' ||
      pathname.startsWith('/auth/oauth-callback/')
    ) {
      const response = NextResponse.next();
      applySecurityHeaders(response, false);
      return response;
    }

    /** Redirect authenticated users away from auth page */
    if (isAuthenticated && dashboardToken) {
      const retpatch = request.nextUrl.searchParams.get('retpatch');
      if (retpatch) {
        const response = NextResponse.redirect(new URL(retpatch, request.url));
        applySecurityHeaders(response, false);
        return response;
      }
      const response = NextResponse.redirect(new URL(`/dashboard/${dashboardToken}`, request.url));
      applySecurityHeaders(response, false);
      return response;
    }

    const response = NextResponse.next();
    applySecurityHeaders(response, false);
    return response;
  }

  /** Dashboard routes - require authentication */
  if (pathname.startsWith('/dashboard')) {
    if (!isAuthenticated || !dashboardToken) {
      const retpatch = encodeURIComponent(pathname);
      const response = NextResponse.redirect(new URL(`/auth?retpatch=${retpatch}`, request.url));
      applySecurityHeaders(response, false);
      return response;
    }

    /** Normalize dashboard URL */
    if (pathname === '/dashboard' || pathname === '/dashboard/') {
      const response = NextResponse.redirect(new URL(`/dashboard/${dashboardToken}`, request.url));
      applySecurityHeaders(response, false);
      return response;
    }

    /** Ensure user accesses their own dashboard */
    const urlToken = pathname.split('/dashboard/')[1]?.split('/')[0];
    if (urlToken && urlToken !== dashboardToken) {
      const response = NextResponse.redirect(new URL(`/dashboard/${dashboardToken}`, request.url));
      applySecurityHeaders(response, false);
      return response;
    }

    const response = NextResponse.next();
    applySecurityHeaders(response, false);
    return response;
  }

  /** Support panel - requires authentication */
  if (pathname.startsWith('/ui/panel/support')) {
    if (!isAuthenticated || !dashboardToken) {
      const retpatch = encodeURIComponent(pathname);
      const response = NextResponse.redirect(new URL(`/auth?retpatch=${retpatch}`, request.url));
      applySecurityHeaders(response, false);
      return response;
    }
    const response = NextResponse.next();
    applySecurityHeaders(response, false);
    return response;
  }

  /** Admin panel - requires admin authentication */
  if (pathname.startsWith('/ui/panel/admin')) {
    const response = NextResponse.next();
    applySecurityHeaders(response, false);
    return response;
  }

  /** Public support page - no auth required */
  if (pathname === '/support' || pathname.startsWith('/support/')) {
    const response = NextResponse.next();
    applySecurityHeaders(response, false);
    return response;
  }

  return null;
}

/**
 * Next.js Proxy (Middleware) - handles all request routing and protection
 * @param request - The Next.js request object
 * @returns NextResponse with appropriate redirect or next() to continue
 */
export function proxy(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl;
  const userAgent = request.headers.get('user-agent') || '';
  const isStatic = isStaticFile(pathname);
  
  // Check if request is from CDN domain
  const isCdnRequest = hostname === CDN_DOMAIN || hostname === `cdn.${MAIN_DOMAIN}` || hostname.endsWith(`.${MAIN_DOMAIN}`);

  /** Early exit for static files, API routes, and bots */
  if (shouldBypassProxy(pathname, userAgent, hostname)) {
    const response = NextResponse.next();
    // Apply CORS headers for static files to support CDN
    if (isStatic || isCdnRequest) {
      applySecurityHeaders(response, true, request);
    }
    return response;
  }

  /** 1. Protection Proxy - checks protection cookies */
  const protectionResponse = handleProtection(request, pathname);
  if (protectionResponse) {
    return protectionResponse;
  }

  /** 2. Auth Proxy - checks authentication and authorization */
  const authResponse = handleAuth(request, pathname);
  if (authResponse) {
    return authResponse;
  }

  /** Default response for public pages - apply security headers */
  const response = NextResponse.next();
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
      source: '/((?!api|_next/static|_next/image|favicon.ico|public|static|robots.txt|sitemap.xml).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
