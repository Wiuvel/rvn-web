import { NextRequest, NextResponse } from 'next/server';
import { RateLimiter } from '../security/rate-limit';
import { verifyCSRFToken } from '../security/csrf';
import { usernameSchema, passwordSchema } from '../validation/schemas';
import { logger } from '../utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '../security/cors';
import { checkAuth } from '../auth/helper';
import { ERROR_NOT_AUTHENTICATED } from '../utils/constants';
import type { User } from '../auth/index';

declare module 'next/server' {
  interface NextRequest {
    user?: User;
  }
}

// Request data type
export type RequestData = Record<string, unknown> & {
  username?: string;
  password?: string;
  confirmPassword?: string;
  csrfToken?: string;
  [key: string]: unknown;
};

export interface ApiHandlerOptions {
  rateLimit?: RateLimiter;
  requireAuth?: boolean;
  requireCSRF?: boolean;
  validateData?: (data: RequestData) => { isValid: boolean; error?: string };
  validateUsername?: boolean;
  validatePassword?: boolean;
  validateConfirmPassword?: boolean;
  customValidation?: (data: RequestData) => Promise<{ isValid: boolean; error?: string }>;
  errorMessage?: string;
}

export type ApiHandler = (
  request: NextRequest,
  data: RequestData
) => Promise<NextResponse>;

export function withApiHandler(
  handler: ApiHandler,
  options: ApiHandlerOptions = {}
): {
  OPTIONS: () => Promise<NextResponse>;
  POST?: (request: NextRequest) => Promise<NextResponse>;
  GET?: (request: NextRequest) => Promise<NextResponse>;
  PUT?: (request: NextRequest) => Promise<NextResponse>;
  DELETE?: (request: NextRequest) => Promise<NextResponse>;
} {
  const {
    rateLimit,
    requireAuth = false,
    requireCSRF = false,
    validateData,
    validateUsername = false,
    validatePassword = false,
    validateConfirmPassword = false,
    customValidation,
    errorMessage = 'Invalid request'
  } = options;

  async function handleRequest(
    request: NextRequest,
    method: 'POST' | 'GET' | 'PUT' | 'DELETE'
  ): Promise<NextResponse> {
    try {
      // Rate limiting
      if (rateLimit) {
        const rateLimitResult = await rateLimit.check(request);
        if (!rateLimitResult.allowed) {
          // Rate limit - не логируем
          return setCorsHeaders(
            NextResponse.json(
              { error: 'Too many requests. Please try again later.' },
              { status: 429 }
            )
          );
        }
      }

      // Auth check with session validation
      if (requireAuth) {
        const authResult = await checkAuth(request);
        if (!authResult.isAuthenticated || !authResult.user) {
          return setCorsHeaders(
            NextResponse.json(
              { error: authResult.error || ERROR_NOT_AUTHENTICATED },
              { status: 401 }
            )
          );
        }
        request.user = authResult.user;
      }

      // Parse request data
      let data: RequestData = {};
      if (method === 'POST' || method === 'PUT') {
        try {
          data = (await request.json()) as RequestData;
        } catch {
          return setCorsHeaders(
            NextResponse.json(
              { error: 'Invalid JSON' },
              { status: 400 }
            )
          );
        }
      }

      // CSRF CHECK
      if (requireCSRF) {
        const sessionId = request.cookies.get('session_id')?.value;
        const csrfToken = data.csrfToken;
        
        if (sessionId && csrfToken && !verifyCSRFToken(csrfToken, sessionId)) {
          logger.warn(`Invalid CSRF token for ${method} request`, {
            ip: request.headers.get('x-forwarded-for'),
            hasSessionId: !!sessionId,
            hasCsrfToken: !!csrfToken
          });
          return setCorsHeaders(
            NextResponse.json(
              { error: 'Invalid request' },
              { status: 403 }
            )
          );
        }
      }

      // Data Validation
      if (validateData) {
        const validation = validateData(data);
        if (!validation.isValid) {
          return setCorsHeaders(
            NextResponse.json(
              { error: validation.error || errorMessage },
              { status: 400 }
            )
          );
        }
      }

      // Username Validation with Zod
      if (validateUsername && data.username) {
        try {
          usernameSchema.parse(data.username);
        } catch {
          return setCorsHeaders(
            NextResponse.json(
              { error: 'Invalid username format' },
              { status: 400 }
            )
          );
        }
      }

      // Password Validation with Zod
      if (validatePassword && data.password) {
        try {
          passwordSchema.parse(data.password);
        } catch {
          return setCorsHeaders(
            NextResponse.json(
              { error: 'Invalid password format' },
              { status: 400 }
            )
          );
        }
      }

      // Confirm password validation with Zod
      if (validateConfirmPassword && data.password && data.confirmPassword) {
        if (data.password !== data.confirmPassword) {
          return setCorsHeaders(
            NextResponse.json(
              { error: 'Passwords do not match' },
              { status: 400 }
            )
          );
        }
      }

      // Custom Validation
      if (customValidation) {
        const validation = await customValidation(data);
        if (!validation.isValid) {
          return setCorsHeaders(
            NextResponse.json(
              { error: validation.error || errorMessage },
              { status: 400 }
            )
          );
        }
      }

      // Call the actual handler
      return await handler(request, data);
    } catch (error) {
      logger.error(`Error in ${method} handler`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: request.headers.get('x-forwarded-for')
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Internal server error' },
          { status: 500 }
        )
      );
    }
  }

  return {
    OPTIONS: () => Promise.resolve(handleCorsPreflight()),
    POST: (request: NextRequest) => handleRequest(request, 'POST'),
    GET: (request: NextRequest) => handleRequest(request, 'GET'),
    PUT: (request: NextRequest) => handleRequest(request, 'PUT'),
    DELETE: (request: NextRequest) => handleRequest(request, 'DELETE')
  };
}

