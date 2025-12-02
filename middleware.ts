import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

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

  if (accessGranted && accessHash) {
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

// Упрощенная проверка JWT для middleware (Edge Runtime compatible)
async function verifyJwtInMiddleware(request: NextRequest): Promise<{ isAuthenticated: boolean; dashboardToken?: string; hasRefreshToken?: boolean }> {
  try {
    // Получаем токены из cookies
    const accessToken = request.cookies.get('access_token')?.value;
    const refreshToken = request.cookies.get('refresh_token')?.value;
    
    // Если нет ни access, ни refresh токена - пользователь не авторизован
    if (!accessToken && !refreshToken) {
      return { isAuthenticated: false };
    }

    // Если есть refresh token, но нет access token - разрешаем доступ
    // Страница сама обновит access token через API
    if (!accessToken && refreshToken) {
      return { isAuthenticated: true, hasRefreshToken: true };
    }

    // Если есть access token, проверяем его валидность
    if (accessToken) {
      try {
        // Получаем секретный ключ
        const secret = process.env.JWT_SECRET || 'change-me-in-production';
        const secretKey = new TextEncoder().encode(secret);

        // Проверяем токен
        const { payload } = await jwtVerify(accessToken, secretKey, {
          issuer: process.env.JWT_ISSUER || 'rvn.market',
          audience: process.env.JWT_AUDIENCE || 'rvn.market',
        });

        // Проверяем, что это access token
        if (payload.type === 'access') {
          return { 
            isAuthenticated: true,
            // dashboard_token будет получен через API в компонентах
          };
        }
      } catch (error) {
        // Access token истек или невалиден
        // Если есть refresh token, разрешаем доступ (страница обновит токен)
        if (refreshToken) {
          return { isAuthenticated: true, hasRefreshToken: true };
        }
        // Если нет refresh token, пользователь не авторизован
        return { isAuthenticated: false };
      }
    }

    return { isAuthenticated: false };
  } catch (error) {
    // В случае ошибки проверяем наличие refresh token
    const refreshToken = request.cookies.get('refresh_token')?.value;
    if (refreshToken) {
      return { isAuthenticated: true, hasRefreshToken: true };
    }
    return { isAuthenticated: false };
  }
}

// Auth Middleware - использует упрощенную проверку JWT для Edge Runtime
async function handleAuth(request: NextRequest, pathname: string): Promise<NextResponse | null> {
  // Проверяем JWT авторизацию (упрощенная версия для Edge Runtime)
  const authResult = await verifyJwtInMiddleware(request);
  const isAuthenticated = authResult.isAuthenticated;
  // Для dashboard_token в middleware мы не можем получить его из JWT payload,
  // поэтому полагаемся на проверку в API роутах
  // Вместо этого просто проверяем наличие токена

  if (pathname === '/auth' || pathname.startsWith('/auth/')) {
    // Если пользователь авторизован, редиректим на dashboard
    // Точный dashboard_token будет определен в компоненте через API
    if (isAuthenticated) {
      const retpatch = request.nextUrl.searchParams.get('retpatch');
      if (retpatch) {
        return NextResponse.redirect(new URL(retpatch, request.url));
      }
      // Редиректим на /dashboard, компонент сам определит правильный токен
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }
  
  // Dashboard Middleware
  if (pathname.startsWith('/dashboard')) {
    if (!isAuthenticated) {
      const retpatch = encodeURIComponent(pathname);
      return NextResponse.redirect(new URL(`/auth?retpatch=${retpatch}`, request.url));
    }
    
    // Проверка правильности dashboard_token будет в компоненте через API
    // Здесь просто проверяем наличие авторизации
    return NextResponse.next();
  }

  // Support Middleware
  if (pathname === '/support' || pathname.startsWith('/support/')) {
    // Support доступен всем, но авторизованные пользователи видят больше
    return NextResponse.next();
  }

  if (pathname.startsWith('/ui/panel/support')) {
    if (!isAuthenticated) {
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

export async function middleware(request: NextRequest) {
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
  const authResponse = await handleAuth(request, pathname);
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
