import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { getUserByToken } from '@/lib/auth/index';
import { hasUserRole } from '@/lib/auth/user-roles';
import { supabaseAdmin } from '@/lib/database/supabase';
import { ERROR_INTERNAL_SERVER_ERROR, ERROR_NOT_AUTHENTICATED, ERROR_TICKET_NOT_FOUND, ERROR_ACCESS_DENIED, ERROR_TOO_MANY_REQUESTS, ERROR_INVALID_REQUEST_DATA } from '@/lib/utils/constants';

export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * POST - Отметить сообщения как прочитанные
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_TOO_MANY_REQUESTS },
          { status: 429 }
        )
      );
    }

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

    const isSupport = await hasUserRole(user.id, 'support');
    const { ticketId } = await params;

    // Валидация UUID формата ticketId
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(ticketId)) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INVALID_REQUEST_DATA },
          { status: 400 }
        )
      );
    }

    if (!supabaseAdmin) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    // Проверяем права доступа к тикету
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('support_tickets')
      .select('id, user_id')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_TICKET_NOT_FOUND },
          { status: 404 }
        )
      );
    }

    if (!isSupport && ticket.user_id !== user.id) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_ACCESS_DENIED },
          { status: 403 }
        )
      );
    }

    // Отмечаем непрочитанные сообщения как прочитанные
    // Пользователь видит прочитанными сообщения от поддержки
    // Поддержка видит прочитанными сообщения от пользователя
    const senderTypeToMark = isSupport ? 'user' : 'support';

    const { error: updateError } = await supabaseAdmin
      .from('support_messages')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('ticket_id', ticketId)
      .eq('sender_type', senderTypeToMark)
      .eq('is_read', false);

    if (updateError) {
      logger.error('Error marking messages as read', {
        error: updateError.message,
        ticketId
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    return setCorsHeaders(
      NextResponse.json({ success: true })
    );
  } catch (error) {
    logger.error('Error in POST /api/support/tickets/[ticketId]/messages/read', {
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

