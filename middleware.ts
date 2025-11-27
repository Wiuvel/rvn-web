import { NextRequest, NextResponse } from 'next/server';

// Быстрая проверка ботов и специальных файлов (выполняется первой)
function isBotOrSpecialFile(pathname: string, userAgent: string): boolean {
  if (pathname === '/robots.txt' || pathname === '/sitemap.xml' || pathname === '/favicon.ico' || pathname.startsWith('/api/')) {
    return true;
  }
  return /googlebot|bingbot|yandex|duckduckbot|twitterbot|whatsapp|telegrambot|discordbot|applebot|redditbot/i.test(userAgent);
}

// Protection middleware - работает на всех страницах (кроме исключений)
function handleProtection(request: NextRequest, pathname: string): NextResponse | null {
  const accessGranted = request.cookies.get('access_granted')?.value === 'true';
  const accessHash = request.cookies.get('access_hash')?.value;
  
  // Исключения для protection
  if (pathname === '/protection' || pathname.startsWith('/protection/')) {
    // Если cookies уже установлены, редиректим только на главную
    if (accessGranted && accessHash) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Проверка cookies для всех остальных страниц
  if (accessGranted && accessHash) {
    return null; // Доступ разрешен, продолжаем проверки
  }
  
  // Редирект на protection
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

// Auth middleware - только для страниц, требующих авторизации
function handleAuth(request: NextRequest, pathname: string): NextResponse | null {
  const isAuthenticated = request.cookies.get('user_authenticated')?.value === 'true';
  const dashboardToken = request.cookies.get('dashboard_token')?.value;

  // Проверка для /auth/ - если авторизован, редирект с учетом retpatch
  if (pathname === '/auth' || pathname.startsWith('/auth/')) {
    if (isAuthenticated && dashboardToken) {
      // Проверяем retpatch из URL
      const retpatch = request.nextUrl.searchParams.get('retpatch');
      if (retpatch) {
        return NextResponse.redirect(new URL(retpatch, request.url));
      }
      return NextResponse.redirect(new URL(`/dashboard/${dashboardToken}`, request.url));
    }
    return NextResponse.next();
  }
  
  // Проверка для /dashboard
  if (pathname.startsWith('/dashboard')) {
    if (!isAuthenticated || !dashboardToken) {
      const retpatch = encodeURIComponent(pathname);
      return NextResponse.redirect(new URL(`/auth?retpatch=${retpatch}`, request.url));
    }
    
    // Если зашли на /dashboard/ без токена, редиректим на /dashboard/{token}
    if (pathname === '/dashboard' || pathname === '/dashboard/') {
      return NextResponse.redirect(new URL(`/dashboard/${dashboardToken}`, request.url));
    }
    
    const urlToken = pathname.split('/dashboard/')[1];
    if (urlToken && urlToken !== dashboardToken) {
      const retpatch = encodeURIComponent(pathname);
      return NextResponse.redirect(new URL(`/auth?retpatch=${retpatch}`, request.url));
    }
    
    return NextResponse.next();
  }

  // Проверка для /support
  if (pathname === '/support' || pathname.startsWith('/support/')) {
    // Остальные страницы /support требуют авторизации
    if (!isAuthenticated || !dashboardToken) {
      // Не редиректим, просто разрешаем доступ - заглушка будет показана на странице
      return NextResponse.next();
    }
    return NextResponse.next();
  }

  // Проверка для /ui/panel/support - требует авторизации и роли support
  // Проверка роли будет выполнена на стороне клиента через API
  if (pathname.startsWith('/ui/panel/support')) {
    if (!isAuthenticated || !dashboardToken) {
      const retpatch = encodeURIComponent(pathname);
      return NextResponse.redirect(new URL(`/auth?retpatch=${retpatch}`, request.url));
    }
    return NextResponse.next();
  }

  // Проверка для /ui/panel/admin - требует авторизации админа
  // Проверка выполняется через cookie admin_authenticated
  if (pathname.startsWith('/ui/panel/admin')) {
    const isAdminAuthenticated = request.cookies.get('admin_authenticated')?.value === 'true';
    if (!isAdminAuthenticated) {
      // Редирект на страницу авторизации админа (она сама проверит и покажет форму)
      return NextResponse.next();
    }
    return NextResponse.next();
  }

  return null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get('user-agent') || '';
  
  // 1. Быстрая проверка ботов и специальных файлов (самая первая)
  if (isBotOrSpecialFile(pathname, userAgent)) {
    return NextResponse.next();
  }
  
  // 2. Protection middleware - работает всегда (кроме исключений)
  const protectionResponse = handleProtection(request, pathname);
  if (protectionResponse) {
    return protectionResponse;
  }
  
  // 3. Auth middleware - только для страниц, требующих авторизации
  const authResponse = handleAuth(request, pathname);
  if (authResponse) {
    return authResponse;
  }
  
  // 4. Все остальные страницы проходят без дополнительных проверок
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|public|static|robots.txt|sitemap.xml).*)',
  ],
};
