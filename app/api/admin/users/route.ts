import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';
import { generalRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for users listing', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return setCorsHeaders(
        NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      );
    }

    if (!supabaseAdmin) {
      logger.error('Supabase admin client is not configured for users API');
      return setCorsHeaders(
        NextResponse.json({ error: 'Database not configured' }, { status: 500 }),
      );
    }

    const cookieStore = await cookies();
    const isAuthenticated = cookieStore.get('admin_authenticated')?.value === 'true';

    if (!isAuthenticated) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      );
    }

    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get('q')?.trim() ?? '';
    const limitParam = parseInt(searchParams.get('limit') ?? '50', 10);
    const limit = Number.isNaN(limitParam) ? 50 : Math.min(Math.max(limitParam, 1), 100);
    const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';

    // Escape % and _ characters used by ILIKE to avoid unintended wildcards
    const sanitizedQuery = rawQuery.replace(/[%_]/g, (char) => `\\${char}`);

    let supabaseQuery = supabaseAdmin
      .from('users')
      .select('id,user_id,username,is_active,last_login,created_at,dashboard_token')
      .order('created_at', { ascending: order === 'asc' })
      .limit(limit);

    if (sanitizedQuery) {
      supabaseQuery = supabaseQuery.or(
        `username.ilike.%${sanitizedQuery}%,user_id.ilike.%${sanitizedQuery}%`,
      );
    }

    const { data, error } = await supabaseQuery;

    if (error) {
      logger.error('Failed to fetch users list', {
        error: error.message,
        code: error.code,
      });
      return setCorsHeaders(
        NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 }),
      );
    }

    return setCorsHeaders(
      NextResponse.json({
        users: data ?? [],
      }),
    );
  } catch (error) {
    logger.error('Unexpected users list error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      ip: request.headers.get('x-forwarded-for'),
    });
    return setCorsHeaders(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
    );
  }
}

