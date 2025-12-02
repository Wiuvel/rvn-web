import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthForMiddleware } from '@/lib/auth/verify-edge';

// ============================================================================
// Route Matchers
// ============================================================================

function isBotOrStaticFile(pathname: string, userAgent: string): boolean {
  // Static files and API routes
  if (
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/static/')
  ) {
    return true;
  }

  // Bots
  return /googlebot|bingbot|yandex|duckduckbot|baiduspider|slurp|twitterbot|linkedinbot|applebot|whatsapp|telegrambot|vkshare/i.test(
    userAgent
  );
}

// ============================================================================
// Protection Middleware
// ============================================================================

function handleProtection(request: NextRequest, pathname: string): NextResponse | null {
  const accessGranted = request.cookies.get('access_granted')?.value === 'true';
  const accessHash = request.cookies.get('access_hash')?.value;

  // Already on protection page
  if (pathname === '/protection' || pathname.startsWith('/protection/')) {
    if (accessGranted && accessHash) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Has access - continue
  if (accessGranted && accessHash) {
    return null;
  }

  // Redirect to protection
  const targetPath = pathname + request.nextUrl.search;
  const response = NextResponse.redirect(
    new URL(`/protection?redirect=${encodeURIComponent(targetPath)}`, request.url)
  );

  const hostname = request.nextUrl.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

  response.cookies.set('target_path', targetPath, {
    maxAge: 60 * 60 * 2,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && !isLocalhost,
    sameSite: 'strict',
    path: '/',
  });

  return response;
}

// ============================================================================
// Auth Middleware
// ============================================================================

async function handleAuth(
  request: NextRequest,
  pathname: string
): Promise<NextResponse | null> {
  const authResult = await verifyAuthForMiddleware(request);
  const isAuthenticated = authResult.isAuthenticated;

  // Auth page - redirect authenticated users to dashboard
  if (pathname === '/auth' || pathname.startsWith('/auth/')) {
    if (isAuthenticated) {
      const retpatch = request.nextUrl.searchParams.get('retpatch');
      if (retpatch) {
        return NextResponse.redirect(new URL(retpatch, request.url));
      }
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // Dashboard - require auth
  if (pathname.startsWith('/dashboard')) {
    if (!isAuthenticated) {
      const retpatch = encodeURIComponent(pathname);
      return NextResponse.redirect(new URL(`/auth?retpatch=${retpatch}`, request.url));
    }
    return NextResponse.next();
  }

  // Support page - public but enhanced for authenticated users
  if (pathname === '/support' || pathname.startsWith('/support/')) {
    return NextResponse.next();
  }

  // Support panel - require auth
  if (pathname.startsWith('/ui/panel/support')) {
    if (!isAuthenticated) {
      const retpatch = encodeURIComponent(pathname);
      return NextResponse.redirect(new URL(`/auth?retpatch=${retpatch}`, request.url));
    }
    return NextResponse.next();
  }

  // Admin panel - check admin cookie (actual verification in page)
  if (pathname.startsWith('/ui/panel/admin')) {
    return NextResponse.next();
  }

  return null;
}

// ============================================================================
// Main Middleware
// ============================================================================

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get('user-agent') || '';

  // Skip bots and static files
  if (isBotOrStaticFile(pathname, userAgent)) {
    return NextResponse.next();
  }

  // Protection check
  const protectionResponse = handleProtection(request, pathname);
  if (protectionResponse) {
    return protectionResponse;
  }

  // Auth check
  const authResponse = await handleAuth(request, pathname);
  if (authResponse) {
    return authResponse;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|favicon|public|static|robots.txt|sitemap.xml|.*\\.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.gif|.*\\.svg|.*\\.webp|.*\\.woff|.*\\.woff2|.*\\.ttf|.*\\.eot).*)',
  ],
};
