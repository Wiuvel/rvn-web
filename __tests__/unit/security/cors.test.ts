import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextResponse } from 'next/server';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';

describe('setCorsHeaders', () => {
  let originalEnv: string | undefined;
  let originalAllowed: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    originalAllowed = process.env.ALLOWED_ORIGINS;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
    if (originalAllowed === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = originalAllowed;
  });

  it('echoes "*" when origin is explicitly true', () => {
    const res = setCorsHeaders(NextResponse.next(), { origin: true });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('joins an array of allowed origins with ", "', () => {
    const res = setCorsHeaders(NextResponse.next(), {
      origin: ['https://a.example', 'https://b.example'],
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://a.example, https://b.example',
    );
  });

  it('passes through a single string origin verbatim', () => {
    const res = setCorsHeaders(NextResponse.next(), { origin: 'https://rvn.market' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://rvn.market');
  });

  it('omits the origin header when origin is false', () => {
    const res = setCorsHeaders(NextResponse.next(), { origin: false });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('joins methods with ", "', () => {
    const res = setCorsHeaders(NextResponse.next(), { methods: ['GET', 'POST'] });
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST');
  });

  it('joins allowedHeaders with ", "', () => {
    const res = setCorsHeaders(NextResponse.next(), {
      allowedHeaders: ['Content-Type', 'X-Custom'],
    });
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, X-Custom');
  });

  it('emits Allow-Credentials only when credentials is true', () => {
    const yes = setCorsHeaders(NextResponse.next(), { credentials: true });
    expect(yes.headers.get('Access-Control-Allow-Credentials')).toBe('true');

    const no = setCorsHeaders(NextResponse.next(), { credentials: false });
    expect(no.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('exposes maxAge as a string', () => {
    const res = setCorsHeaders(NextResponse.next(), { maxAge: 3600 });
    expect(res.headers.get('Access-Control-Max-Age')).toBe('3600');
  });

  it('always sets baseline security headers', () => {
    const res = setCorsHeaders(NextResponse.next(), { origin: true });
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('returns the same response instance for chaining', () => {
    const res = NextResponse.next();
    expect(setCorsHeaders(res)).toBe(res);
  });
});

describe('handleCorsPreflight', () => {
  it('returns a 200 response', () => {
    const res = handleCorsPreflight({ origin: true });
    expect(res.status).toBe(200);
  });

  it('applies the same headers as setCorsHeaders', () => {
    const res = handleCorsPreflight({ origin: 'https://rvn.market', methods: ['GET'] });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://rvn.market');
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });
});
