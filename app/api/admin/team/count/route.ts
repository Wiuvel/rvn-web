import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/database/supabase';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { SessionManager } from '@/lib/auth/session-manager';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for team count', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
      return setCorsHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));
    }

    // Проверяем аутентификацию админа
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('admin_sid')?.value;
    const token = cookieStore.get('admin_token')?.value;

    let isAuthenticated = false;
    if (sessionId) {
      const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';
      const validation = await SessionManager.validateSession(
        sessionId,
        token || '',
        ipAddress,
        userAgent,
      );
      isAuthenticated = validation.valid;
    }

    if (!isAuthenticated) {
      return setCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }

    if (!supabaseAdmin) {
      logger.error('Supabase admin client is not configured for team count API');
      return setCorsHeaders(
        NextResponse.json({ error: 'Database not configured' }, { status: 500 }),
      );
    }

    // Получаем количество пользователей с ролями "Поддержка" и "Админ" напрямую из БД
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, role')
      .in('role', ['support', 'admin'])
      .eq('is_active', true)
      .is('revoked_at', null);

    if (roleError) {
      logger.error('Error fetching team roles', {
        error: roleError.message,
        code: roleError.code,
      });
      return setCorsHeaders(
        NextResponse.json({ error: 'Failed to fetch team roles' }, { status: 500 }),
      );
    }

    // Получаем уникальные user_id
    const uniqueUserIds = new Set<string>();
    const supportCount = roleData?.filter((r) => r.role === 'support').length || 0;
    const adminCount = roleData?.filter((r) => r.role === 'admin').length || 0;

    roleData?.forEach((role) => {
      uniqueUserIds.add(role.user_id);
    });

    const totalCount = uniqueUserIds.size;

    return setCorsHeaders(
      NextResponse.json({
        count: totalCount,
        support: supportCount,
        admin: adminCount,
      }),
    );
  } catch (error) {
    logger.error('Error counting team members', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return setCorsHeaders(
      NextResponse.json({ error: 'Failed to count team members' }, { status: 500 }),
    );
  }
}
