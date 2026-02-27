import { NextRequest, NextResponse } from 'next/server';
import { shouldShowProtection, detectSuspiciousVisitor } from '@/lib/security/suspicious-detector';
import { getRedisClient } from '@/lib/database/redis';
import { logger } from '@/lib/utils/secure-logger';
import { applySecurityHeaders } from '@/lib/security/headers';

/**
 * Cache for the HMAC key to avoid re-importing it on every request
 * This optimization is crucial for high-traffic scenarios
 */
let cachedHmacKey: CryptoKey | null = null;

/**
 * Gets or imports the HMAC key for protection validation
 */
async function getHmacKey(secretKey: string): Promise<CryptoKey> {
  if (cachedHmacKey) {
    return cachedHmacKey;
  }

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);

  cachedHmacKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  return cachedHmacKey;
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
      return true;
    }

    await redis.zadd(key, now, `${now}-${Math.random()}`);

    // Устанавливаем TTL для ключа (окно + 10 секунд запас)
    await redis.expire(key, Math.ceil((windowMs + 10000) / 1000));

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Protection Proxy - validates user access and detects suspicious activity
 *
 * Logic flow:
 * 1. Validates protection cookies (access_granted + access_hash)
 *    - Uses HMAC-SHA256 to verify cookie integrity
 *    - Checks if cookies are bound to user's IP/UA
 *
 * 2. If no valid cookies:
 *    - Analyzes visitor behavior (UA, Headers, IP)
 *    - Checks rate limits via Redis
 *
 * 3. Actions:
 *    - Redirects to /protection if suspicious or rate limited
 *    - Allows access if clean
 *    - Bypasses OAuth and specific system routes
 *
 * @param request - The Next.js request object
 * @param pathname - The request pathname
 * @returns NextResponse with redirect to protection page, or null to allow access
 */
export async function handleProtection(
  request: NextRequest,
  pathname: string,
): Promise<NextResponse | null> {
  if (request.nextUrl.searchParams.has('_rsc')) {
    return null;
  }

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
  if (
    pathname.startsWith('/api/auth/oauth/') ||
    pathname === '/auth/oauth-handler' ||
    pathname.startsWith('/auth/oauth-handler/')
  ) {
    return null;
  }

  /** All auth routes bypass protection */
  if (pathname === '/auth' || pathname.startsWith('/auth/')) {
    return null;
  }

  /** User has protection cookies - validate and allow access */
  if (accessGranted && accessHash) {
    // Валидация hash: HMAC-SHA256(IP|UserAgent, Secret)
    // Это гарантирует, что кука была выдана сервером и привязана к текущему пользователю
    const secretKey = process.env.TURNSTILE_SECRET_KEY;

    // Если ключ не настроен или это старый формат хеша (64 символа, но не подпись) - требуем перепроверку
    // Но для плавного перехода пока поддерживаем старый формат, если он валиден (TODO: удалить позже)
    if (accessHash.length === 64 && /^[a-f0-9]{64}$/i.test(accessHash)) {
      if (!secretKey) return null; // Fallback если нет ключа

      try {
        const ip =
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          request.headers.get('x-real-ip') ||
          'unknown';
        const userAgent = request.headers.get('user-agent') || '';
        const data = `${ip}|${userAgent}`;

        // Web Crypto API для Edge Runtime
        const encoder = new TextEncoder();
        const msgData = encoder.encode(data);

        // Use cached key for performance optimization
        const key = await getHmacKey(secretKey);

        const signature = await crypto.subtle.sign('HMAC', key, msgData);
        const signatureArray = Array.from(new Uint8Array(signature));
        const signatureHex = signatureArray.map((b) => b.toString(16).padStart(2, '0')).join('');

        if (signatureHex === accessHash) {
          return null; // Подпись верна
        }
      } catch (e) {
        // Ошибка проверки подписи - считаем невалидным
      }
    }
    // Невалидный hash - считаем что куки подделаны или устарели, требуем повторную проверку
    // Продолжаем выполнение для редиректа на страницу защиты
  }

  /**
   * Special case: OAuth users redirecting to dashboard
   * Protection cookies may not be set yet due to cookie timing
   */
  const hasToken = !!request.cookies.get('token')?.value;
  const hasSession = !!request.cookies.get('session_id')?.value;

  if (hasToken && hasSession && pathname.startsWith('/dashboard')) {
    return null;
  }

  /** Умное определение подозрительных посетителей */
  const userAgent = request.headers.get('user-agent') || '';
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const referer = request.headers.get('referer');
  const acceptLanguage = request.headers.get('accept-language');

  // Собираем информацию о запросе
  const requestInfo = {
    userAgent,
    ip,
    headers: {
      accept: request.headers.get('accept'),
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
      new URL(`/protection?redirect=${encodeURIComponent(targetPath)}`, request.url),
    );
    applySecurityHeaders(response, false);

    const hostname = request.nextUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    response.cookies.set('target_path', targetPath, {
      maxAge: 60 * 60 * 12 /** 12 hours */,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/',
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
    new URL(`/protection?redirect=${encodeURIComponent(targetPath)}`, request.url),
  );

  applySecurityHeaders(response, false);

  const hostname = request.nextUrl.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

  response.cookies.set('target_path', targetPath, {
    maxAge: 60 * 60 * 12 /** 12 hours */,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && !isLocalhost,
    sameSite: 'strict',
    path: '/',
  });

  return response;
}
