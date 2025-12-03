import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generalRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { getUserByToken } from '@/lib/auth';
import { hasUserRole } from '@/lib/user-roles';
import { supabaseAdmin } from '@/lib/supabase';
import { ERROR_INTERNAL_SERVER_ERROR, ERROR_NOT_AUTHENTICATED, ERROR_INVALID_REQUEST_DATA, ERROR_MAXIMUM_TICKET_LIMIT_REACHED, ERROR_TOO_MANY_REQUESTS, TICKET_SUBJECT_MAX_LENGTH, MESSAGE_MAX_LENGTH, ERROR_MESSAGE_TOO_LONG, ERROR_SUBJECT_TOO_LONG, MAX_TICKETS_PER_USER } from '@/lib/constants';

export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * GET - Получить список тикетов
 * Для пользователей - только свои тикеты
 * Для поддержки - все тикеты
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for tickets request', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent')
      });
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
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // open, closed, pending, all
    const statuses = searchParams.get('statuses'); // open,pending или closed (через запятую)
    const forUser = searchParams.get('forUser') === 'true'; // Явно запрошены только тикеты пользователя

    if (!supabaseAdmin) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    // Строим запрос
    // Для оптимизации запросов рекомендуется применить индексы из database_migration_add_support_indexes.sql
    // См. DATABASE_INDEXES_README.md для инструкций по применению
    let query = supabaseAdmin
      .from('support_tickets')
      .select(`
        *,
        user:users!support_tickets_user_id_fkey(id, username, user_id, avatar_gradient),
        assigned_user:users!support_tickets_assigned_to_fkey(id, username, user_id, avatar_gradient)
      `)
      .order('last_message_at', { ascending: false });

    // Если явно запрошены тикеты пользователя ИЛИ пользователь не поддержка - только свои тикеты
    if (forUser || !isSupport) {
      query = query.eq('user_id', user.id);
    }

    // Фильтр по статусу(ам)
    if (statuses) {
      // Поддержка множественных статусов через запятую
      const statusArray = statuses.split(',').map(s => s.trim()).filter(s => ['open', 'closed', 'pending'].includes(s));
      if (statusArray.length > 0) {
        query = query.in('status', statusArray);
      }
    } else if (status && status !== 'all' && ['open', 'closed', 'pending'].includes(status)) {
      // Одиночный статус (обратная совместимость)
      query = query.eq('status', status);
    }

    const { data: tickets, error } = await query;

    if (error) {
      logger.error('Error fetching tickets', {
        error: error.message,
        code: error.code,
        userId: user.id,
        isSupport
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    return setCorsHeaders(
      NextResponse.json({ tickets: tickets || [] })
    );
  } catch (error) {
    logger.error('Error in GET /api/support/tickets', {
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

/**
 * POST - Создать новый тикет
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded for create ticket', {
        ip: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent')
      });
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

    const { subject, message } = await request.json();

    if (!subject || !message) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INVALID_REQUEST_DATA },
          { status: 400 }
        )
      );
    }

    // Валидация длины subject и message
    if (typeof subject !== 'string' || subject.trim().length === 0) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INVALID_REQUEST_DATA },
          { status: 400 }
        )
      );
    }

    if (subject.trim().length > TICKET_SUBJECT_MAX_LENGTH) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_SUBJECT_TOO_LONG },
          { status: 400 }
        )
      );
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INVALID_REQUEST_DATA },
          { status: 400 }
        )
      );
    }

    if (message.length > MESSAGE_MAX_LENGTH) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_MESSAGE_TOO_LONG },
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

    // Проверяем лимит тикетов (оптимизированный запрос с count)
    // Для оптимизации рекомендуется применить частичный индекс idx_support_tickets_user_active_status
    // См. database_migration_add_support_indexes.sql
    const { count, error: countError } = await supabaseAdmin
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['open', 'pending']);

    if (countError) {
      logger.error('Error counting tickets', {
        error: countError.message,
        userId: user.id
      });
    }

    const ticketCount = count || 0;
    // Жесткая проверка: строго больше или равно 2 активных тикетов
    if (ticketCount >= MAX_TICKETS_PER_USER) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_MAXIMUM_TICKET_LIMIT_REACHED },
          { status: 400 }
        )
      );
    }

    // Создаем тикет
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('support_tickets')
      .insert({
        user_id: user.id,
        subject: subject.trim(),
        status: 'open'
      })
      .select()
      .single();

    if (ticketError || !ticket) {
      logger.error('Error creating ticket', {
        error: ticketError?.message,
        code: ticketError?.code,
        userId: user.id
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    // Создаем первое сообщение
    const { error: messageError } = await supabaseAdmin
      .from('support_messages')
      .insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_type: 'user',
        message_text: message.trim()
      });

    if (messageError) {
      logger.error('Error creating ticket message', {
        error: messageError.message,
        code: messageError.code,
        ticketId: ticket.id
      });
      // Удаляем тикет, если не удалось создать сообщение
      await supabaseAdmin.from('support_tickets').delete().eq('id', ticket.id);
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    return setCorsHeaders(
      NextResponse.json({ ticket, success: true })
    );
  } catch (error) {
    logger.error('Error in POST /api/support/tickets', {
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

