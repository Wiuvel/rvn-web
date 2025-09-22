import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get('user-agent') || '';
  const isBot = /googlebot|bingbot|yandex|duckduckbot|twitterbot|whatsapp|telegrambot|discordbot|applebot|redditbot/i.test(userAgent);
  const isSpecialFile = pathname === '/robots.txt' || pathname === '/sitemap.xml' || pathname === '/favicon.ico' || pathname.startsWith('/api/');
  
  if (isBot || isSpecialFile) {
    return NextResponse.next();
  }
  
  const accessGranted = request.cookies.get('access_granted')?.value === 'true';
  const accessHash = request.cookies.get('access_hash')?.value;
  
  if (accessGranted && accessHash) {
    const targetPath = request.cookies.get('target_path')?.value;
    
    if (targetPath && targetPath !== pathname) {
      const response = NextResponse.redirect(new URL(targetPath, request.url));
      response.cookies.delete('target_path');
      return response;
    }
    
    if (pathname === '/protection') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    
    return NextResponse.next();
  }
  
  if (pathname.startsWith('/auth') || pathname.startsWith('/dashboard') || pathname === '/') {
    if (pathname === '/protection') {
      return NextResponse.next();
    }
    
    const targetPath = pathname + request.nextUrl.search;
    const response = NextResponse.redirect(new URL(`/protection?redirect=${encodeURIComponent(targetPath)}`, request.url));
    
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isVercel = hostname.includes('vercel.app');
    
    let domain: string | undefined;
    if (isLocalhost) {
      domain = undefined;
    } else if (isVercel) {
      domain = undefined;
    } else {
      domain = 'rvn.guru';
    }
    
    response.cookies.set('target_path', targetPath, {
      maxAge: 60 * 60 * 2,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/',
      domain
    });
    return response;
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|public|static|debug|robots.txt|sitemap.xml).*)',
  ],
};
