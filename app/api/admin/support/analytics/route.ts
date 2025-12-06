import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserByToken } from '@/lib/auth/index';
import { hasUserRole } from '@/lib/auth/user-roles';
import { getSupportAnalytics } from '@/lib/analytics/support-analytics';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { ERROR_NOT_AUTHENTICATED, ERROR_ACCESS_DENIED, ERROR_INTERNAL_SERVER_ERROR } from '@/lib/utils/constants';
import { logger } from '@/lib/utils/secure-logger';

export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * GET - Получить аналитику системы поддержки
 */
export async function GET(request: NextRequest) {
  try {
    // Проверка авторизации
    const cookieStore = await cookies();
    const isAuthenticated = cookieStore.get('user_authenticated')?.value === 'true';
    const dashboardToken = cookieStore.get('dashboard_token')?.value;

    if (!isAuthenticated || !dashboardToken) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_NOT_AUTHENTICATED },
          { status: 401 }
        )
      );
    }

    const user = await getUserByToken(dashboardToken);
    if (!user) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_NOT_AUTHENTICATED },
          { status: 401 }
        )
      );
    }

    // Проверка прав администратора
    const isAdmin = await hasUserRole(user.id, 'admin');
    if (!isAdmin) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_ACCESS_DENIED },
          { status: 403 }
        )
      );
    }

    // Получаем параметр days из query string
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);
    const validDays = Math.min(Math.max(days, 1), 90); // От 1 до 90 дней

    // Получаем аналитику
    const analytics = await getSupportAnalytics(validDays);

    // Теперь getSupportAnalytics всегда возвращает объект (не null)
    // Если Redis не подключен, возвращается пустая аналитика
    return setCorsHeaders(
      NextResponse.json({ analytics })
    );
  } catch (error) {
    logger.error('Error in GET /api/admin/support/analytics', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return setCorsHeaders(
      NextResponse.json(
        { error: ERROR_INTERNAL_SERVER_ERROR },
        { status: 500 }
      )
    );
  }
}

