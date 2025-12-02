import { NextRequest, NextResponse } from 'next/server';
import { generalRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/cors';
import { verifyAuth } from '@/lib/auth-unified';
import { hasUserRole } from '@/lib/user-roles';
import { supabaseAdmin } from '@/lib/supabase';
import { ERROR_INTERNAL_SERVER_ERROR, ERROR_NOT_AUTHENTICATED, ERROR_INVALID_REQUEST_DATA, MESSAGE_MAX_LENGTH, ERROR_TICKET_NOT_FOUND, ERROR_ACCESS_DENIED, ERROR_CANNOT_SEND_TO_CLOSED_TICKET, ERROR_MESSAGE_TOO_LONG, ERROR_TOO_MANY_REQUESTS } from '@/lib/constants';

export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * POST - Отправить сообщение в тикет
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
    const authResult = await verifyAuth(request);
    
    if (!authResult.isAuthenticated || !authResult.user) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_NOT_AUTHENTICATED },
          { status: 401 }
        )
      );
    }

    const user = authResult.user;
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

    const { message } = await request.json();

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
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

    // Проверяем существование тикета и права доступа
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('support_tickets')
      .select('id, user_id, status')
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

    // Проверяем права доступа
    if (!isSupport && ticket.user_id !== user.id) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_ACCESS_DENIED },
          { status: 403 }
        )
      );
    }

    // Проверяем, что тикет не закрыт (для пользователей)
    if (!isSupport && ticket.status === 'closed') {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_CANNOT_SEND_TO_CLOSED_TICKET },
          { status: 400 }
        )
      );
    }

    // Если тикет был закрыт, но ответил поддержка - открываем его
    if (isSupport && ticket.status === 'closed') {
      await supabaseAdmin
        .from('support_tickets')
        .update({ status: 'open', closed_at: null })
        .eq('id', ticketId);
    }

    // Создаем сообщение
    const { data: newMessage, error: messageError } = await supabaseAdmin
      .from('support_messages')
      .insert({
        ticket_id: ticketId,
        sender_id: user.id,
        sender_type: isSupport ? 'support' : 'user',
        message_text: message.trim()
      })
      .select(`
        *,
        sender:users!support_messages_sender_id_fkey(id, username, user_id, avatar_gradient)
      `)
      .single();

    if (messageError) {
      logger.error('Error creating message', {
        error: messageError.message,
        code: messageError.code,
        ticketId
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    // Если это первое сообщение от пользователя, добавляем автоматический ответ от поддержки
    if (!isSupport) {
      const { data: existingMessages } = await supabaseAdmin
        .from('support_messages')
        .select('id')
        .eq('ticket_id', ticketId)
        .eq('sender_type', 'support')
        .limit(1);

      if (!existingMessages || existingMessages.length === 0) {
        // Автоматическое системное сообщение
        // Используем sender_id пользователя, но в UI будем определять системное сообщение по тексту
        const { error: autoMessageError } = await supabaseAdmin
          .from('support_messages')
          .insert({
            ticket_id: ticketId,
            sender_id: user.id, // Используем ID пользователя (требуется NOT NULL)
            sender_type: 'support',
            message_text: 'Спасибо за ваше сообщение. Мы получили ваш запрос и ответим в ближайшее время.'
          });

        // Логируем ошибку, но не прерываем выполнение, так как основное сообщение уже создано
        if (autoMessageError) {
          logger.error('Error creating automatic support message', {
            error: autoMessageError.message,
            code: autoMessageError.code,
            ticketId
          });
        }
      }
    }

    return setCorsHeaders(
      NextResponse.json({ message: newMessage, success: true })
    );
  } catch (error) {
    logger.error('Error in POST /api/support/tickets/[ticketId]/messages', {
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

