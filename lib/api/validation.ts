/**
 * Утилиты для валидации запросов в API роутах
 */
import { ZodSchema, ZodError } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { setCorsHeaders } from '@/lib/security/cors';
import { ERROR_INVALID_REQUEST_DATA } from '@/lib/utils/constants';

/**
 * Валидация body запроса
 */
export async function validateRequestBody<T>(
  request: NextRequest,
  schema: ZodSchema<T>,
): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
  try {
    const body = await request.json();
    const validatedData = schema.parse(body);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof ZodError) {
      const errorMessage = error.issues
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join(', ');

      return {
        success: false,
        response: setCorsHeaders(
          NextResponse.json(
            { error: ERROR_INVALID_REQUEST_DATA, details: errorMessage },
            { status: 400 },
          ),
        ),
      };
    }

    return {
      success: false,
      response: setCorsHeaders(
        NextResponse.json({ error: ERROR_INVALID_REQUEST_DATA }, { status: 400 }),
      ),
    };
  }
}

/**
 * Валидация query параметров
 */
export function validateQueryParams<T>(
  request: NextRequest,
  schema: ZodSchema<T>,
): { success: true; data: T } | { success: false; response: NextResponse } {
  try {
    const { searchParams } = new URL(request.url);
    const params: Record<string, string> = {};

    searchParams.forEach((value, key) => {
      params[key] = value;
    });

    const validatedData = schema.parse(params);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof ZodError) {
      const errorMessage = error.issues
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join(', ');

      return {
        success: false,
        response: setCorsHeaders(
          NextResponse.json(
            { error: ERROR_INVALID_REQUEST_DATA, details: errorMessage },
            { status: 400 },
          ),
        ),
      };
    }

    return {
      success: false,
      response: setCorsHeaders(
        NextResponse.json({ error: ERROR_INVALID_REQUEST_DATA }, { status: 400 }),
      ),
    };
  }
}

/**
 * Валидация параметров пути (route params)
 */
export function validateRouteParams<T>(
  params: unknown,
  schema: ZodSchema<T>,
): { success: true; data: T } | { success: false; response: NextResponse } {
  try {
    const validatedData = schema.parse(params);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof ZodError) {
      const errorMessage = error.issues
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join(', ');

      return {
        success: false,
        response: setCorsHeaders(
          NextResponse.json(
            { error: ERROR_INVALID_REQUEST_DATA, details: errorMessage },
            { status: 400 },
          ),
        ),
      };
    }

    return {
      success: false,
      response: setCorsHeaders(
        NextResponse.json({ error: ERROR_INVALID_REQUEST_DATA }, { status: 400 }),
      ),
    };
  }
}
