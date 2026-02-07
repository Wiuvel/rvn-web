import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SessionManager } from '@/lib/auth/session-manager';
import { getSupportAnalytics } from '@/lib/analytics/support-analytics';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { ERROR_INTERNAL_SERVER_ERROR } from '@/lib/utils/constants';
import { logger } from '@/lib/utils/secure-logger';

export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * GET - Получить аналитику системы поддержки
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('admin_sid')?.value;
    const token = cookieStore.get('admin_token')?.value;

    if (!sessionId) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }

    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    const validation = await SessionManager.validateSession(sessionId, token || '', ipAddress, userAgent);

    if (!validation.valid) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }

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

