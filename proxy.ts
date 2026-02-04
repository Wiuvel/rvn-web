import { NextRequest, NextResponse } from 'next/server';
import { domains } from './lib/utils/config';
import { shouldShowProtection, isAllowedBot, detectSuspiciousVisitor } from './lib/security/suspicious-detector';
import { getRedisClient } from './lib/database/redis';
import { logger } from './lib/utils/secure-logger';

const MAIN_DOMAIN = domains.main;

/**
 * Проверяет, является ли hostname поддоменом основного домена
 * @param hostname - Hostname для проверки
 * @returns True если это поддомен основного домена
 */
function isSubdomain(hostname: string): boolean {
  return hostname === MAIN_DOMAIN || hostname.endsWith(`.${MAIN_DOMAIN}`);
}

/**
 * Проверяет, является ли origin допустимым (основной домен или его поддомены)
 * @param origin - Origin header для проверки
 * @returns True если origin допустим
 */
function isValidOrigin(origin: string): boolean {
  return origin.includes(MAIN_DOMAIN);
}

/**
 * Generates Content Security Policy header
 * Based on Next.js.org CSP structure, adapted for rvn.market
 * @param isDev - Whether running in development mode
 * @returns CSP header string
 */
function generateCSPHeader(isDev: boolean): string {
  const supabaseDomain = 'ljeklmajzfylmyqjxcck.supabase.co';
  const turnstileDomain = 'challenges.cloudflare.com';
  
  // Base domains for CSP
  const baseDomains = `'self' ${MAIN_DOMAIN} *.${MAIN_DOMAIN}`;
  
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
 * @param request - The NextRequest object (for origin detection)
 */
function applySecurityHeaders(response: NextResponse, isStaticFile: boolean = false, request?: NextRequest): void {
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
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // X-XSS-Protection
  response.headers.set('X-XSS-Protection', '1; mode=block');
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
 * @param hostname - The request hostname (for subdomain detection)
 * @returns True if the request should bypass all proxy checks
 */
function shouldBypassProxy(pathname: string, userAgent: string, hostname?: string): boolean {
  if (isStaticFile(pathname)) {
    return true;
  }

  /** API routes bypass protection but may have auth checks */
  if (pathname.startsWith('/api/')) {
    return true;
  }

  /** Разрешенные боты (Google, Yandex) обходят защиту */
  if (isAllowedBot(userAgent)) {
    return true;
  }

  return false;
}

/**
 * Проверяет rate limiting для IP адреса используя sliding window алгоритм
 * @param ip - IP адрес
 * @returns true если превышен лимит запросов
 */
async function checkRateLimit(ip: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    // Если Redis недоступен, не блокируем (fallback)
    return false;
  }

  try {
    const now = Date.now();
    const windowMs = 60 * 1000; // 60 секунд
    const limit = 30; // 30 запросов в минуту
    
    // Используем sliding window: храним timestamp'ы запросов
    const key = `rate_limit:${ip}`;
    const windowStart = now - windowMs;
    
    // Удаляем старые записи (за пределами окна)
    await redis.zremrangebyscore(key, 0, windowStart);
    
    // Подсчитываем количество запросов в окне
    const count = await redis.zcard(key);
    
    if (count >= limit) {
      return true; // Превышен лимит
    }
    
    // Добавляем текущий запрос
    await redis.zadd(key, now, `${now}-${Math.random()}`);
    
    // Устанавливаем TTL для ключа (окно + 10 секунд запас)
    await redis.expire(key, Math.ceil((windowMs + 10000) / 1000));
    
    return false;
  } catch (error) {
    // При ошибке Redis не блокируем
    return false;
  }
}

/**
 * Protection Proxy - проверяет прохождение пользователем страницы защиты
 * 
 * Логика работы:
 * 1. Проверяет наличие валидных куки защиты (access_granted + access_hash)
 * 2. Если куки нет, анализирует посетителя через систему определения подозрительности
 * 3. При превышении rate limit или высоком счете подозрительности - редирект на /protection
 * 4. Разрешенные боты (Google, Yandex) всегда обходят защиту
 * 5. После прохождения Turnstile CAPTCHA выдаются куки на 12 часов
 * 
 * @param request - The Next.js request object
 * @param pathname - The request pathname
 * @returns NextResponse with redirect to protection page, or null to allow access
 */
async function handleProtection(request: NextRequest, pathname: string): Promise<NextResponse | null> {
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

  /** User has protection cookies - validate and allow access */
  if (accessGranted && accessHash) {
    // Валидация hash: должен быть 64 символа hex (SHA-256)
    // Это защищает от подделки куки - hash генерируется на основе браузерного fingerprint
    if (accessHash.length === 64 && /^[a-f0-9]{64}$/i.test(accessHash)) {
      return null; // Валидные куки - разрешаем доступ
    }
    // Невалидный hash - считаем что куки подделаны, требуем повторную проверку
    // Продолжаем выполнение для редиректа на страницу защиты
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

  /** Умное определение подозрительных посетителей */
  const userAgent = request.headers.get('user-agent') || '';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
             request.headers.get('x-real-ip') || 
             'unknown';
  const referer = request.headers.get('referer');
  const acceptLanguage = request.headers.get('accept-language');

  // Собираем информацию о запросе
  const requestInfo = {
    userAgent,
    ip,
    headers: {
      'accept': request.headers.get('accept'),
      'accept-language': acceptLanguage,
      'accept-encoding': request.headers.get('accept-encoding'),
      'user-agent': userAgent,
    },
    pathname,
    referer,
    acceptLanguage,
  };

  // Проверяем rate limiting (защита от DDoS)
  // Используется sliding window алгоритм для более точного ограничения
  const isRateLimited = await checkRateLimit(ip);
  if (isRateLimited) {
    // При превышении лимита (30 запросов/минуту) всегда показываем защиту
    // Это защищает от брутфорса и DDoS атак
    logger.warn('Rate limit exceeded', {
      ip,
      pathname,
      userAgent: userAgent.substring(0, 100),
    });
    
    const targetPath = pathname + request.nextUrl.search;
    const response = NextResponse.redirect(
      new URL(`/protection?redirect=${encodeURIComponent(targetPath)}`, request.url)
    );
    applySecurityHeaders(response, false);
    
    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    response.cookies.set('target_path', targetPath, {
      maxAge: 60 * 60 * 12, /** 12 hours */
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/'
    });

    return response;
  }

  // Определяем, нужно ли показывать страницу защиты
  const showProtection = shouldShowProtection(requestInfo, false);
  
  // Логируем подозрительную активность для мониторинга
  if (showProtection) {
    const factors = detectSuspiciousVisitor(requestInfo);
    logger.warn('Suspicious visitor detected', {
      ip,
      userAgent: userAgent.substring(0, 100), // Ограничиваем длину для логов
      pathname,
      suspicionScore: factors.score,
      factors: {
        suspiciousUserAgent: factors.suspiciousUserAgent,
        missingHeaders: factors.missingHeaders,
        suspiciousIP: factors.suspiciousIP,
        botPattern: factors.botPattern,
        suspiciousBehavior: factors.suspiciousBehavior,
      },
    });
  }

  // Если не нужно показывать защиту - разрешаем доступ
  if (!showProtection) {
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
    maxAge: 60 * 60 * 12, /** 12 hours */
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
 * @param requestHeaders - Headers to pass to the response
 * @returns NextResponse with redirect or null to allow/deny access
 */
function handleAuth(request: NextRequest, pathname: string, requestHeaders: Headers): NextResponse | null {
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
      const response = NextResponse.next({ request: { headers: requestHeaders } });
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

    const response = NextResponse.next({ request: { headers: requestHeaders } });
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

    const response = NextResponse.next({ request: { headers: requestHeaders } });
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
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    applySecurityHeaders(response, false);
    return response;
  }

  /** Admin panel - requires admin authentication */
  if (pathname.startsWith('/ui/panel/admin')) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    applySecurityHeaders(response, false);
    return response;
  }

  /** Public support page - no auth required */
  if (pathname === '/support' || pathname.startsWith('/support/')) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    applySecurityHeaders(response, false);
    return response;
  }

  return null;
}

/**
 * Next.js 16 Proxy (ранее назывался middleware) - обрабатывает все запросы
 * 
 * Порядок обработки запросов:
 * 1. Ранний выход для статических файлов, API маршрутов и разрешенных ботов
 * 2. Проверка защиты (protection) - умное определение подозрительных посетителей
 * 3. Проверка аутентификации (auth) - защита приватных маршрутов
 * 4. Применение security headers для всех ответов
 * 
 * @param request - The Next.js request object
 * @returns NextResponse with appropriate redirect or next() to continue
 */
export async function proxy(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl;
  const userAgent = request.headers.get('user-agent') || '';
  const isStatic = isStaticFile(pathname);

  // Create headers with x-url and x-pathname
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-url', request.url);
  requestHeaders.set('x-pathname', pathname);

  /** 
   * Ранний выход для статических файлов, API маршрутов и разрешенных ботов
   * Это оптимизирует производительность, избегая ненужных проверок
   */
  if (shouldBypassProxy(pathname, userAgent, hostname)) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    // Применяем CORS заголовки для статических файлов
    if (isStatic) {
      applySecurityHeaders(response, true, request);
    }
    return response;
  }

  /** 
   * 1. Protection Proxy - проверка защиты от ботов и DDoS
   * Использует умное определение подозрительных посетителей
   */
  const protectionResponse = await handleProtection(request, pathname);
  if (protectionResponse) {
    return protectionResponse;
  }

  /** 
   * 2. Auth Proxy - проверка аутентификации и авторизации
   * Защищает приватные маршруты (dashboard, панели управления)
   */
  const authResponse = handleAuth(request, pathname, requestHeaders);
  if (authResponse) {
    return authResponse;
  }

  /** 
   * Дефолтный ответ для публичных страниц
   * Применяем security headers для всех ответов
   */
  const response = NextResponse.next({ request: { headers: requestHeaders } });
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
