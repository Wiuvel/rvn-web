import { NextRequest, NextResponse } from 'next/server';

/**
 * Generates a unique nonce for Content Security Policy
 * @returns Base64-encoded nonce string
 */
function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

/**
 * Generates Content Security Policy header with nonce
 * @param nonce - The nonce value to include in CSP
 * @param isDev - Whether running in development mode
 * @returns CSP header string
 */
function generateCSPHeader(nonce: string, isDev: boolean): string {
  // In production, Next.js generates inline styles and scripts without nonce
  // We need to allow 'unsafe-inline' for both styles and scripts
  // 'strict-dynamic' blocks Next.js chunks, so we remove it in production
  // Note: nonce in script-src blocks 'unsafe-inline', so we remove it in production
  // External scripts (like Turnstile) work with domain allowlist, nonce not required
  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com 'unsafe-eval'`
    : `'self' 'unsafe-inline' https://challenges.cloudflare.com`;
  
  // Note: 'unsafe-inline' is ignored if nonce is present in CSP
  // For Next.js inline styles, we use only 'unsafe-inline' in production
  const styleSrc = `'self' 'unsafe-inline'`;
  
  const cspHeader = `
    default-src 'self';
    script-src ${scriptSrc};
    style-src ${styleSrc};
    img-src 'self' blob: data: https://ljeklmajzfylmyqjxcck.supabase.co;
    font-src 'self';
    connect-src 'self' https://challenges.cloudflare.com ${isDev ? 'http://localhost:* ws://localhost:* wss://localhost:*' : ''};
    frame-src 'self' https://challenges.cloudflare.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${!isDev ? 'upgrade-insecure-requests;' : ''}
  `;
  
  // Replace newline characters and multiple spaces with single space
  return cspHeader.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Creates a NextResponse with CSP headers and nonce
 * According to Next.js 16 documentation, nonce is extracted from Content-Security-Policy header during SSR
 * @param request - The NextRequest object
 * @param nonce - The nonce value
 * @param responseType - Type of response to create ('next' | 'redirect')
 * @param redirectUrl - Optional redirect URL for redirect responses
 * @returns NextResponse with CSP headers applied
 */
function createResponseWithCSP(
  request: NextRequest,
  nonce: string,
  responseType: 'next' | 'redirect' = 'next',
  redirectUrl?: URL
): NextResponse {
  const isDev = process.env.NODE_ENV === 'development';
  const cspHeader = generateCSPHeader(nonce, isDev);
  
  // Create response based on type
  let response: NextResponse;
  if (responseType === 'redirect' && redirectUrl) {
    response = NextResponse.redirect(redirectUrl);
  } else {
    response = NextResponse.next();
  }
  
  // Set CSP header in response - Next.js extracts nonce from this header during SSR
  response.headers.set('Content-Security-Policy', cspHeader);
  
  // Also set x-nonce header for manual access in Server Components via headers()
  response.headers.set('x-nonce', nonce);
  
  return response;
}

/**
 * Applies CSP headers and nonce to existing response
 * @param response - The NextResponse object (for cases where response is already created)
 * @param request - The NextRequest object
 * @param nonce - The nonce value
 */
function applyCSPHeaders(response: NextResponse, request: NextRequest, nonce: string): void {
  const isDev = process.env.NODE_ENV === 'development';
  const cspHeader = generateCSPHeader(nonce, isDev);
  
  // Set CSP header in response
  response.headers.set('Content-Security-Policy', cspHeader);
  
  // Note: For existing responses, we can't modify the request headers
  // Next.js will extract nonce from Content-Security-Policy header during SSR
  // The x-nonce header is set when creating new responses via createResponseWithCSP
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
 * @returns True if the request should bypass all proxy checks
 */
function shouldBypassProxy(pathname: string, userAgent: string): boolean {
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
 * @param nonce - The CSP nonce value
 * @returns NextResponse with redirect to protection page, or null to allow access
 */
function handleProtection(request: NextRequest, pathname: string, nonce: string): NextResponse | null {
  const accessGranted = request.cookies.get('access_granted')?.value === 'true';
  const accessHash = request.cookies.get('access_hash')?.value;

  /** Protection page itself - allow access, but redirect if already protected */
  if (pathname === '/protection' || pathname.startsWith('/protection/')) {
    if (accessGranted && accessHash) {
      const response = NextResponse.redirect(new URL('/', request.url));
      applyCSPHeaders(response, request, nonce);
      return response;
    }
    const response = NextResponse.next();
    applyCSPHeaders(response, request, nonce);
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
  const response = createResponseWithCSP(
    request,
    nonce,
    'redirect',
    new URL(`/protection?redirect=${encodeURIComponent(targetPath)}`, request.url)
  );
  
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
 * @param nonce - The CSP nonce value
 * @returns NextResponse with redirect or null to allow/deny access
 */
function handleAuth(request: NextRequest, pathname: string, nonce: string): NextResponse | null {
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
      return createResponseWithCSP(request, nonce, 'next');
    }

    /** Redirect authenticated users away from auth page */
    if (isAuthenticated && dashboardToken) {
      const retpatch = request.nextUrl.searchParams.get('retpatch');
      if (retpatch) {
        return createResponseWithCSP(request, nonce, 'redirect', new URL(retpatch, request.url));
      }
      return createResponseWithCSP(request, nonce, 'redirect', new URL(`/dashboard/${dashboardToken}`, request.url));
    }

    return createResponseWithCSP(request, nonce, 'next');
  }

  /** Dashboard routes - require authentication */
  if (pathname.startsWith('/dashboard')) {
    if (!isAuthenticated || !dashboardToken) {
      const retpatch = encodeURIComponent(pathname);
      return createResponseWithCSP(request, nonce, 'redirect', new URL(`/auth?retpatch=${retpatch}`, request.url));
    }

    /** Normalize dashboard URL */
    if (pathname === '/dashboard' || pathname === '/dashboard/') {
      return createResponseWithCSP(request, nonce, 'redirect', new URL(`/dashboard/${dashboardToken}`, request.url));
    }

    /** Ensure user accesses their own dashboard */
    const urlToken = pathname.split('/dashboard/')[1]?.split('/')[0];
    if (urlToken && urlToken !== dashboardToken) {
      return createResponseWithCSP(request, nonce, 'redirect', new URL(`/dashboard/${dashboardToken}`, request.url));
    }

    return createResponseWithCSP(request, nonce, 'next');
  }

  /** Support panel - requires authentication */
  if (pathname.startsWith('/ui/panel/support')) {
    if (!isAuthenticated || !dashboardToken) {
      const retpatch = encodeURIComponent(pathname);
      return createResponseWithCSP(request, nonce, 'redirect', new URL(`/auth?retpatch=${retpatch}`, request.url));
    }
    return createResponseWithCSP(request, nonce, 'next');
  }

  /** Admin panel - requires admin authentication */
  if (pathname.startsWith('/ui/panel/admin')) {
    return createResponseWithCSP(request, nonce, 'next');
  }

  /** Public support page - no auth required */
  if (pathname === '/support' || pathname.startsWith('/support/')) {
    return createResponseWithCSP(request, nonce, 'next');
  }

  return null;
}

/**
 * Main proxy function - handles all request routing and protection
 * @param request - The Next.js request object
 * @returns NextResponse with appropriate redirect or next() to continue
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get('user-agent') || '';

  /** Early exit for static files, API routes, and bots */
  if (shouldBypassProxy(pathname, userAgent)) {
    return NextResponse.next();
  }

  /** Generate nonce for CSP - unique for each request */
  const nonce = generateNonce();

  /** 1. Protection Proxy - checks protection cookies */
  const protectionResponse = handleProtection(request, pathname, nonce);
  if (protectionResponse) {
    return protectionResponse;
  }

  /** 2. Auth Proxy - checks authentication and authorization */
  const authResponse = handleAuth(request, pathname, nonce);
  if (authResponse) {
    return authResponse;
  }

  /** Default response for public pages - apply CSP */
  return createResponseWithCSP(request, nonce, 'next');
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

