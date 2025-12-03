import { NextRequest, NextResponse } from 'next/server';

function isBotOrSpecialFile(pathname: string, userAgent: string): boolean {
  if (pathname === '/robots.txt' || pathname === '/sitemap.xml' || pathname === '/favicon.ico' || pathname.startsWith('/api/')) {
    return true;
  }
  return /googlebot|bingbot|yandex|duckduckbot|twitterbot|whatsapp|telegrambot|discordbot|applebot|redditbot/i.test(userAgent);
}

// Protection Middleware - works on all pages (except exceptions)
function handleProtection(request: NextRequest, pathname: string): NextResponse | null {
  const accessGranted = request.cookies.get('access_granted')?.value === 'true';
  const accessHash = request.cookies.get('access_hash')?.value;
  
  // Exceptions for protection
  if (pathname === '/protection' || pathname.startsWith('/protection/')) {
    // If cookies are already set, redirect only to home
    if (accessGranted && accessHash) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/auth/oauth/')) {
    return null;
  }

  // OAuth handler page has immunity to protection middleware
  // This page opens in popup and handles OAuth flow
  if (pathname === '/auth/oauth-handler' || pathname.startsWith('/auth/oauth-handler/')) {
    return null;
  }

  // OAuth callback page also has immunity
  if (pathname === '/auth/oauth-callback' || pathname.startsWith('/auth/oauth-callback/')) {
    return null;
  }

  // Allow /auth page without protection cookies
  // This is the authentication page where OAuth callbacks are handled
  // Client-side code will process OAuth callbacks (including hash-based Telegram callbacks)
  // Protection middleware should not interfere with OAuth flow
  if (pathname === '/auth' || pathname.startsWith('/auth/')) {
    // Check for OAuth query parameters (Google OAuth uses query params)
    const hasOAuthParams = request.nextUrl.searchParams.has('code') || 
                          request.nextUrl.searchParams.has('state') || 
                          request.nextUrl.searchParams.has('error');
    
    // Allow access to /auth page without protection cookies
    // Hash-based callbacks (Telegram) are handled client-side and not visible to middleware
    // Query-based callbacks (Google) are also handled here
    return null;
  }

  // If user has protection cookies, allow access
  if (accessGranted && accessHash) {
    return null;
  }
  
  // Special handling for OAuth users: OAuth callbacks set protection cookies,
  // but due to cookie timing and sameSite restrictions, they may not be immediately
  // available in the request after redirect. Allow authenticated OAuth users to access
  // their dashboard route (where OAuth redirects them).
  const isAuthenticated = request.cookies.get('user_authenticated')?.value === 'true';
  const hasDashboardToken = !!request.cookies.get('dashboard_token')?.value;
  const hasSession = !!request.cookies.get('session_id')?.value;
  
  // Only allow bypass for dashboard routes (where OAuth redirects users)
  // and only if user has valid session (proving they just authenticated via OAuth)
  if (isAuthenticated && hasDashboardToken && hasSession && pathname.startsWith('/dashboard')) {
    // User just completed OAuth and is being redirected to dashboard
    // Protection cookies are set by OAuth callback but may not be in request yet
    return null;
  }
  
  // Protection Redirect
  const targetPath = pathname + request.nextUrl.search;
  const response = NextResponse.redirect(new URL(`/protection?redirect=${encodeURIComponent(targetPath)}`, request.url));
  const hostname = request.nextUrl.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  
  response.cookies.set('target_path', targetPath, {
    maxAge: 60 * 60 * 2,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && !isLocalhost,
    sameSite: 'strict',
    path: '/'
  });
  return response;
}

// Auth Middleware
function handleAuth(request: NextRequest, pathname: string): NextResponse | null {
  const isAuthenticated = request.cookies.get('user_authenticated')?.value === 'true';
  const dashboardToken = request.cookies.get('dashboard_token')?.value;

  if (pathname === '/auth' || pathname.startsWith('/auth/')) {
    // OAuth handler and callback pages should not be redirected by auth middleware
    // They need to handle OAuth flow and communicate with parent window
    if (pathname === '/auth/oauth-handler' || pathname.startsWith('/auth/oauth-handler/') ||
        pathname === '/auth/oauth-callback' || pathname.startsWith('/auth/oauth-callback/')) {
      return NextResponse.next();
    }
    
    if (isAuthenticated && dashboardToken) {
      const retpatch = request.nextUrl.searchParams.get('retpatch');
      if (retpatch) {
        return NextResponse.redirect(new URL(retpatch, request.url));
      }
      return NextResponse.redirect(new URL(`/dashboard/${dashboardToken}`, request.url));
    }
    return NextResponse.next();
  }
  
  // Dashboard Middleware
  if (pathname.startsWith('/dashboard')) {
    if (!isAuthenticated || !dashboardToken) {
      const retpatch = encodeURIComponent(pathname);
      return NextResponse.redirect(new URL(`/auth?retpatch=${retpatch}`, request.url));
    }
    
    if (pathname === '/dashboard' || pathname === '/dashboard/') {
      return NextResponse.redirect(new URL(`/dashboard/${dashboardToken}`, request.url));
    }
    
    const urlToken = pathname.split('/dashboard/')[1];
    if (urlToken && urlToken !== dashboardToken) {
      // Если токен в URL не совпадает с токеном пользователя, редиректим на правильный dashboard
      return NextResponse.redirect(new URL(`/dashboard/${dashboardToken}`, request.url));
    }
    
    return NextResponse.next();
  }

  // Support Middleware
  if (pathname === '/support' || pathname.startsWith('/support/')) {
    if (!isAuthenticated || !dashboardToken) {
      return NextResponse.next();
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/ui/panel/support')) {
    if (!isAuthenticated || !dashboardToken) {
      const retpatch = encodeURIComponent(pathname);
      return NextResponse.redirect(new URL(`/auth?retpatch=${retpatch}`, request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/ui/panel/admin')) {
    const isAdminAuthenticated = request.cookies.get('admin_authenticated')?.value === 'true';
    if (!isAdminAuthenticated) {
      return NextResponse.next();
    }
    return NextResponse.next();
  }

  return null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get('user-agent') || '';
  
  if (isBotOrSpecialFile(pathname, userAgent)) {
    return NextResponse.next();
  }
  
  // 2. Protection Middleware
  const protectionResponse = handleProtection(request, pathname);
  if (protectionResponse) {
    return protectionResponse;
  }
  
  // 3. Auth Middleware
  const authResponse = handleAuth(request, pathname);
  if (authResponse) {
    return authResponse;
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|public|static|robots.txt|sitemap.xml).*)',
  ],
};
