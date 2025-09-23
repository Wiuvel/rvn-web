import { NextResponse } from 'next/server';

interface CorsOptions {
  origin?: string | string[] | boolean;
  methods?: string[];
  allowedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

const defaultOptions: CorsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || false
    : true, // Allow all origins in development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-CSRF-Token',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  credentials: true,
  maxAge: 86400 // 24 hours
};

export function setCorsHeaders(response: NextResponse, options: CorsOptions = {}): NextResponse {
  const config = { ...defaultOptions, ...options };

  // Origin
  if (config.origin === true) {
    response.headers.set('Access-Control-Allow-Origin', '*');
  } else if (Array.isArray(config.origin)) {
    response.headers.set('Access-Control-Allow-Origin', config.origin.join(', '));
  } else if (typeof config.origin === 'string') {
    response.headers.set('Access-Control-Allow-Origin', config.origin);
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
