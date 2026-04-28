import { NextRequest, NextResponse } from 'next/server';
import { detectSuspiciousVisitor } from '@/lib/security/suspicious-detector';
import { getRedisClient } from '@/lib/database/redis';
import { logger } from '@/lib/utils/secure-logger';
import { applySecurityHeaders } from '@/lib/security/headers';

let cachedHmacKey: CryptoKey | null = null;

/** Lazily imports and caches the HMAC key for cookie verification. */
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
 * Sliding window rate limiter per IP (30 req/min).
 * @returns true if the IP is rate-limited.
 */
async function checkRateLimit(ip: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    return true; // Fail closed
  }

  try {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const limit = 30;
    const key = `rate_limit:${ip}`;
    const windowStart = now - windowMs;

    await redis.zremrangebyscore(key, 0, windowStart);
    const count = await redis.zcard(key);

    if (count >= limit) {
      return true;
    }

    await redis.zadd(key, now, `${now}-${Math.random()}`);

    await redis.expire(key, Math.ceil((windowMs + 10000) / 1000));

    return false;
  } catch {
    return true; // Fail closed
  }
}

/**
 * Validates user access and detects suspicious activity.
 *
 * 1. Validates HMAC-signed protection cookies.
 * 2. If no valid cookies — analyzes visitor behavior and checks rate limits.
 * 3. Redirects to /protection if suspicious or rate-limited; bypasses auth/OAuth routes.
 *
 * @returns Redirect response to protection page, or null to allow access.
 */
export async function handleProtection(
  request: NextRequest,
  pathname: string,
): Promise<NextResponse | null> {
  if (request.nextUrl.searchParams.has('_rsc')) {
    return null;
  }

  const accessToken = request.cookies.get('access_token')?.value;

  /** Protection page — redirect away if already verified. */
  if (pathname === '/protection' || pathname.startsWith('/protection/')) {
    if (accessToken) {
      const response = NextResponse.redirect(new URL('/', request.url));
      applySecurityHeaders(response, false);
      return response;
    }
    const response = NextResponse.next();
    applySecurityHeaders(response, false);
    return response;
  }

  /** OAuth routes bypass protection. */
  if (
    pathname.startsWith('/api/auth/oauth/') ||
    pathname === '/auth/oauth-handler' ||
    pathname.startsWith('/auth/oauth-handler/')
  ) {
    return null;
  }

  /** Auth routes bypass protection. */
  if (pathname === '/auth' || pathname.startsWith('/auth/')) {
    return null;
  }

  /** Validate HMAC-signed protection cookie. */
  if (accessToken) {
    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey) return null;

    try {
      const dotIndex = accessToken.indexOf('.');
      if (dotIndex > 0) {
        const payload = accessToken.substring(0, dotIndex);
        const hmac = accessToken.substring(dotIndex + 1);

        const encoder = new TextEncoder();
        const key = await getHmacKey(secretKey);
        const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
        const signatureHex = Array.from(new Uint8Array(signature))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

        if (signatureHex === hmac) {
          const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
          const age = Date.now() - decoded.t;
          if (age < 12 * 60 * 60 * 1000) {
            return null;
          }
        }
      }
    } catch {
      // Invalid cookie — fall through to protection check
    }
  }

  /** OAuth users may land on dashboard before protection cookie is set. */
  const hasToken = !!request.cookies.get('token')?.value;
  const hasSession = !!request.cookies.get('session_id')?.value;

  if (hasToken && hasSession && pathname.startsWith('/dashboard')) {
    return null;
  }

  const userAgent = request.headers.get('user-agent') || '';
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const referer = request.headers.get('referer');
  const acceptLanguage = request.headers.get('accept-language');

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

  const isRateLimited = await checkRateLimit(ip);
  if (isRateLimited) {
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

  const factors = detectSuspiciousVisitor(requestInfo);

  if (factors.score < 30) {
    return null;
  }

  /** Score >= 80: definite bot — block with 403, no logging. */
  if (factors.score >= 80) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  /** Score 30-79: suspicious — log with full IP and redirect to protection. */
  logger.warn('Suspicious visitor detected', {
    ip,
    userAgent: userAgent.substring(0, 100),
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
