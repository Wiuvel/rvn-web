import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/database/supabase';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { SessionManager } from '@/lib/auth/session-manager';

const ADMIN_SESSION_COOKIE = 'admin_sid';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for root check', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return setCorsHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));
    }

    if (!supabaseAdmin) {
      logger.error('Supabase admin client is not configured');
      return setCorsHeaders(
        NextResponse.json({ error: 'Database not configured' }, { status: 500 }),
      );
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    const token = cookieStore.get('admin_token')?.value;

    if (!sessionId) {
      return setCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }

    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const validation = await SessionManager.validateSession(
      sessionId,
      token || '',
      ipAddress,
      userAgent,
    );

    if (!validation.valid) {
      return setCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }

    const session = await SessionManager.getSession(sessionId);
    if (!session) {
      return setCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }

    const { data: admin, error } = await supabaseAdmin
      .from('admins')
      .select('is_root')
      .eq('id', session.userId)
      .maybeSingle();

    if (error || !admin) {
      return setCorsHeaders(NextResponse.json({ error: 'Admin not found' }, { status: 404 }));
    }

    return setCorsHeaders(NextResponse.json({ isRoot: admin.is_root === true }));
  } catch (error) {
    logger.error('Error in GET check-root', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return setCorsHeaders(NextResponse.json({ error: 'Internal server error' }, { status: 500 }));
  }
}
