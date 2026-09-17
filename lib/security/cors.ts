import { NextResponse } from 'next/server';

export interface CorsOptions {
  origin?: string | string[] | boolean;
  methods?: string[];
  allowedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
  requestOrigin?: string | null;
}

const defaultOptions: CorsOptions = {
  origin:
    process.env.NODE_ENV === 'production' ? process.env.ALLOWED_ORIGINS?.split(',') || false : true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-CSRF-Token',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
  credentials: true,
  maxAge: 86400,
};

export function setCorsHeaders(
  response: NextResponse,
  options: CorsOptions = {},
  request?: Request | string | null,
): NextResponse {
  const config = { ...defaultOptions, ...options };
  const reqOrigin =
    options.requestOrigin ??
    (typeof request === 'string' ? request : (request?.headers?.get('origin') ?? null));

  // W3C CORS Specification: Access-Control-Allow-Origin must be either a single origin or "*".
  // Multiple origins cannot be joined by comma, and "*" cannot be used with Credentials: true.
  let allowOrigin: string | null = null;

  if (config.origin === true) {
    if (config.credentials && reqOrigin) {
      allowOrigin = reqOrigin;
    } else {
      allowOrigin = '*';
    }
  } else if (Array.isArray(config.origin)) {
    if (reqOrigin && config.origin.includes(reqOrigin)) {
      allowOrigin = reqOrigin;
    } else if (config.origin.length > 0) {
      allowOrigin = config.origin[0]!;
    }
  } else if (typeof config.origin === 'string') {
    allowOrigin = config.origin;
  }

  if (allowOrigin) {
    response.headers.set('Access-Control-Allow-Origin', allowOrigin);
    if (allowOrigin !== '*') {
      response.headers.append('Vary', 'Origin');
    }
  }

  // Methods
  if (config.methods) {
    response.headers.set('Access-Control-Allow-Methods', config.methods.join(', '));
  }

  // Headers
  if (config.allowedHeaders) {
    response.headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
  }

  // Credentials
  if (config.credentials) {
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  // Max Age
  if (config.maxAge) {
    response.headers.set('Access-Control-Max-Age', config.maxAge.toString());
  }

  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export function handleCorsPreflight(options: CorsOptions = {}): NextResponse {
  const response = new NextResponse(null, { status: 200 });
  return setCorsHeaders(response, options);
}
