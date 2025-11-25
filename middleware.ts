import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get('user-agent') || '';
  const isBot = /googlebot|bingbot|yandex|duckduckbot|twitterbot|whatsapp|telegrambot|discordbot|applebot|redditbot/i.test(userAgent);
  const isSpecialFile = pathname === '/robots.txt' || pathname === '/sitemap.xml' || pathname === '/favicon.ico' || pathname.startsWith('/api/');
  
  if (isBot || isSpecialFile) {
    return NextResponse.next();
  }
  
  const isAuthenticated = request.cookies.get('user_authenticated')?.value === 'true';
  const dashboardToken = request.cookies.get('dashboard_token')?.value;
  
  // Проверка для /auth/ - если авторизован, редирект в dashboard
  if (pathname === '/auth' || pathname.startsWith('/auth/')) {
    if (isAuthenticated && dashboardToken) {
      return NextResponse.redirect(new URL(`/dashboard/${dashboardToken}`, request.url));
    }
    return NextResponse.next();
  }
  
  // Проверка для /dashboard
  if (pathname.startsWith('/dashboard')) {
    if (!isAuthenticated || !dashboardToken) {
      return NextResponse.redirect(new URL('/auth', request.url));
    }
    
    // Если зашли на /dashboard/ без токена, редиректим на /dashboard/{token}
    if (pathname === '/dashboard' || pathname === '/dashboard/') {
      return NextResponse.redirect(new URL(`/dashboard/${dashboardToken}`, request.url));
    }
    
    const urlToken = pathname.split('/dashboard/')[1];
    if (urlToken && urlToken !== dashboardToken) {
      return NextResponse.redirect(new URL('/auth', request.url));
    }
    
    return NextResponse.next();
  }
  
  if (pathname === '/protection') {
    return NextResponse.next();
  }
  
  const accessGranted = request.cookies.get('access_granted')?.value === 'true';
  const accessHash = request.cookies.get('access_hash')?.value;
  
  if (accessGranted && accessHash) {
    return NextResponse.next();
  }
  
  if (pathname.startsWith('/ui/panel')) {
    return NextResponse.next();
  }
  
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

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|public|static|robots.txt|sitemap.xml).*)',
  ],
};
