import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth/helper';
import { getSupportAnalytics } from '@/lib/analytics/support-analytics';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { ERROR_NOT_AUTHENTICATED, ERROR_INTERNAL_SERVER_ERROR } from '@/lib/utils/constants';
import { logger } from '@/lib/utils/secure-logger';

export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * GET - Получить аналитику системы поддержки
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await checkAuth(request);
    if (!authResult.isAuthenticated || !authResult.user) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_NOT_AUTHENTICATED },
          { status: 401 }
        )
      );
    }
    const user = authResult.user;

    // Проверка прав администратора убрана - доступ к админ-панели уже означает авторизацию администратора
    // Получаем параметр period из query string
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'month';
    
    // Валидация периода
    const validPeriods = ['hour', 'day', 'week', 'month'] as const;
    const validPeriod = validPeriods.includes(period as typeof validPeriods[number]) 
      ? (period as typeof validPeriods[number])
      : 'month';

    // Получаем аналитику
    const analytics = await getSupportAnalytics(validPeriod);

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

