import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generalRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { supabaseAdmin } from '@/lib/supabase';
import { grantUserRole, revokeUserRole, getUserRoles, getUsersByRole, UserRole } from '@/lib/user-roles';
import { ERROR_INTERNAL_SERVER_ERROR, ERROR_NOT_AUTHENTICATED, ERROR_INVALID_REQUEST_DATA } from '@/lib/constants';

export async function OPTIONS() {
  return handleCorsPreflight();
}

// GET - Получить роли пользователя или список пользователей с ролью
export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for user roles request', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent')
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Too many requests' },
          { status: 429 }
        )
      );
    }

    // Проверка авторизации админа
    const cookieStore = await cookies();
    const isAuthenticated = cookieStore.get('admin_authenticated')?.value === 'true';
    const adminUsername = cookieStore.get('admin_username')?.value || null;

    if (!isAuthenticated || !adminUsername) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_NOT_AUTHENTICATED },
          { status: 401 }
        )
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const role = searchParams.get('role') as UserRole | null;

    // Если указан userId - возвращаем роли пользователя
    if (userId) {
      const roles = await getUserRoles(userId);
      return setCorsHeaders(
        NextResponse.json({ roles })
      );
    }

    // Если указан role - возвращаем список пользователей с этой ролью
    if (role && ['support', 'admin'].includes(role)) {
      const users = await getUsersByRole(role);
      return setCorsHeaders(
        NextResponse.json({ users })
      );
    }

    return setCorsHeaders(
      NextResponse.json(
        { error: ERROR_INVALID_REQUEST_DATA },
        { status: 400 }
      )
    );
  } catch (error) {
    logger.error('Error in GET /api/admin/users/roles', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for')
    });
    return setCorsHeaders(
      NextResponse.json(
        { error: ERROR_INTERNAL_SERVER_ERROR },
        { status: 500 }
      )
    );
  }
}

// POST - Выдать роль пользователю
export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for grant role request', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent')
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Too many requests' },
          { status: 429 }
        )
      );
    }

    // Проверка авторизации админа
    const cookieStore = await cookies();
    const isAuthenticated = cookieStore.get('admin_authenticated')?.value === 'true';
    const adminUsername = cookieStore.get('admin_username')?.value || null;

    if (!isAuthenticated || !adminUsername) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_NOT_AUTHENTICATED },
          { status: 401 }
        )
      );
    }

    // Получаем ID админа из БД напрямую
    if (!supabaseAdmin) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    const { data: admin, error: adminError } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('username', adminUsername)
      .single();

    if (adminError || !admin) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_NOT_AUTHENTICATED },
          { status: 401 }
        )
      );
    }

    const { userId, role } = await request.json();

    if (!userId || !role) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INVALID_REQUEST_DATA },
          { status: 400 }
        )
      );
    }

    if (!['support', 'admin'].includes(role)) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid role' },
          { status: 400 }
        )
      );
    }

    const result = await grantUserRole(userId, role as UserRole, admin.id);

    if (!result.success) {
      return setCorsHeaders(
        NextResponse.json(
          { error: result.error || 'Failed to grant role' },
          { status: 400 }
        )
      );
    }

    return setCorsHeaders(
      NextResponse.json({ success: true, message: 'Role granted successfully' })
    );
  } catch (error) {
    logger.error('Error in POST /api/admin/users/roles', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for')
    });
    return setCorsHeaders(
      NextResponse.json(
        { error: ERROR_INTERNAL_SERVER_ERROR },
        { status: 500 }
      )
    );
  }
}

// DELETE - Отозвать роль у пользователя
export async function DELETE(request: NextRequest) {
  try {
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for revoke role request', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent')
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Too many requests' },
          { status: 429 }
        )
      );
    }

    // Проверка авторизации админа
    const cookieStore = await cookies();
    const isAuthenticated = cookieStore.get('admin_authenticated')?.value === 'true';
    const adminUsername = cookieStore.get('admin_username')?.value || null;

    if (!isAuthenticated || !adminUsername) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_NOT_AUTHENTICATED },
          { status: 401 }
        )
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const role = searchParams.get('role') as UserRole | null;

    if (!userId || !role) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INVALID_REQUEST_DATA },
          { status: 400 }
        )
      );
    }

    if (!['support', 'admin'].includes(role)) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid role' },
          { status: 400 }
        )
      );
    }

    const result = await revokeUserRole(userId, role);

    if (!result.success) {
      return setCorsHeaders(
        NextResponse.json(
          { error: result.error || 'Failed to revoke role' },
          { status: 400 }
        )
      );
    }

    return setCorsHeaders(
      NextResponse.json({ success: true, message: 'Role revoked successfully' })
    );
  } catch (error) {
    logger.error('Error in DELETE /api/admin/users/roles', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for')
    });
    return setCorsHeaders(
      NextResponse.json(
        { error: ERROR_INTERNAL_SERVER_ERROR },
        { status: 500 }
      )
    );
  }
}

