import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generalRateLimit, messageRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { getUserByToken } from '@/lib/auth/index';
import { hasUserRole, batchHasUserRole } from '@/lib/auth/user-roles';
import { supabaseAdmin } from '@/lib/database/supabase';
import { ERROR_INTERNAL_SERVER_ERROR, ERROR_NOT_AUTHENTICATED, ERROR_INVALID_REQUEST_DATA, MESSAGE_MAX_LENGTH, ERROR_TICKET_NOT_FOUND, ERROR_ACCESS_DENIED, ERROR_CANNOT_SEND_TO_CLOSED_TICKET, ERROR_MESSAGE_TOO_LONG, ERROR_TOO_MANY_REQUESTS } from '@/lib/utils/constants';
import { broadcastNewMessage, broadcastTicketUpdate } from '@/lib/websocket/server';
import { isValidUUID } from '@/lib/utils/uuid-validation';
import { cache } from '@/lib/database/cache';
import { verifyCSRFToken } from '@/lib/security/csrf';

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
    // Базовая проверка rate limit по IP
    const generalRateLimitResult = await generalRateLimit.check(request);
    if (!generalRateLimitResult.allowed) {
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

    // Специфичный rate limit для сообщений по user_id (50 сообщений за 5 минут)
    const messageRateLimitResult = await messageRateLimit.checkWithKey(`message:${user.id}`);
    if (!messageRateLimitResult.allowed) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_TOO_MANY_REQUESTS },
          { status: 429 }
        )
      );
    }

    // Проверка CSRF токена
    const sessionId = cookieStore.get('session_id')?.value;
    const requestData = await request.json();
    const csrfToken = requestData.csrfToken;
    
    if (sessionId && csrfToken) {
      const csrfValidation = verifyCSRFToken(csrfToken, sessionId, true);
      if (!csrfValidation.valid) {
        return setCorsHeaders(
          NextResponse.json(
            { error: 'Invalid request. Please refresh the page.' },
            { status: 403 }
          )
        );
      }
    } else if (sessionId) {
      // Если есть session_id, но нет CSRF токена - это подозрительно
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid request. Please refresh the page.' },
          { status: 403 }
        )
      );
    }

    const isSupport = await hasUserRole(user.id, 'support');
    const { ticketId } = await params;

    // Валидация UUID формата ticketId
    if (!isValidUUID(ticketId)) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INVALID_REQUEST_DATA },
          { status: 400 }
        )
      );
    }

    const { message } = requestData;

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
      const { data: updatedTicket } = await supabaseAdmin
        .from('support_tickets')
        .update({ status: 'open', closed_at: null })
        .eq('id', ticketId)
        .select('status, updated_at, closed_at')
        .single();
      
      if (updatedTicket) {
        // Отправляем обновление через WebSocket
        broadcastTicketUpdate(ticketId, {
          id: ticketId,
          status: updatedTicket.status,
          updated_at: updatedTicket.updated_at,
          closed_at: updatedTicket.closed_at,
        });
      }
    }

    // Создаем сообщение
    const { data: newMessage, error: messageError } = await supabaseAdmin
      .from('support_messages')
      .insert({
        ticket_id: ticketId,
        sender_id: user.id,
        message_text: message.trim()
      })
      .select(`
        *,
        sender:users!support_messages_sender_id_fkey(id, username, user_id, avatar)
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

    // Отправляем новое сообщение через WebSocket
    if (newMessage) {
      // Убеждаемся, что структура данных соответствует ожидаемой
      // Важно: sender может быть массивом или объектом в зависимости от Supabase запроса
      let senderData = undefined;
      if (newMessage.sender) {
        // Если sender - массив, берем первый элемент
        if (Array.isArray(newMessage.sender)) {
          senderData = newMessage.sender[0] || undefined;
        } else {
          senderData = newMessage.sender;
        }
      }
      
      const messageForBroadcast = {
        id: newMessage.id,
        ticket_id: newMessage.ticket_id,
        sender_id: newMessage.sender_id,
        sender_type: isSupport ? 'support' : 'user' as 'user' | 'support',
        message_text: newMessage.message_text,
        is_read: newMessage.is_read || false,
        created_at: newMessage.created_at,
        sender: senderData,
      };
      
      // Успешное создание сообщения не логируется
      
      // Трекинг аналитики
      try {
        const { trackMessageSent } = await import('@/lib/analytics/support-analytics');
        await trackMessageSent(ticketId, newMessage.sender_id, messageForBroadcast.sender_type);
      } catch (error) {
        logger.error('Error tracking message sent', {
          error: error instanceof Error ? error.message : 'Unknown error',
          ticketId
        });
      }
      
      try {
        broadcastNewMessage(ticketId, messageForBroadcast);
      } catch (error) {
        logger.error('Error broadcasting new message', {
          error: error instanceof Error ? error.message : 'Unknown error',
          ticketId
        });
      }
      
      // Инвалидируем кэш тикетов при создании сообщения
      if (ticket) {
        // Инвалидируем кэш для владельца тикета
        cache.delete(`tickets:${ticket.user_id}:user:all:all`);
        cache.delete(`tickets:${ticket.user_id}:user:all:forUser`);
        cache.delete(`tickets:${ticket.user_id}:user:open:all`);
        cache.delete(`tickets:${ticket.user_id}:user:open:forUser`);
        // Инвалидируем кэш для поддержки
        cache.deleteByPattern(/^tickets:.*:support:.*$/);
      }
    }

    // Если это первое сообщение от пользователя, добавляем автоматический ответ от поддержки
    if (!isSupport) {
      // Проверяем, есть ли уже сообщения от поддержки
      // Определяем это через проверку ролей отправителей
      const { data: existingMessages } = await supabaseAdmin
        .from('support_messages')
        .select('sender_id')
        .eq('ticket_id', ticketId)
        .limit(10);

      // Оптимизация: batch запрос для всех sender_id вместо N запросов
      let hasSupportMessage = false;
      if (existingMessages && existingMessages.length > 0) {
        const senderIds = Array.from(new Set(existingMessages.map(msg => msg.sender_id)));
        const senderRolesMap = await batchHasUserRole(senderIds, 'support');
        
        for (const msg of existingMessages) {
          const isSupportSender = senderRolesMap.get(msg.sender_id) || false;
          if (isSupportSender) {
            hasSupportMessage = true;
            break;
          }
        }
      }

      if (!hasSupportMessage) {
        // Проверяем, не было ли уже создано системное сообщение
        const SYSTEM_MESSAGE_TEXT = 'Спасибо за ваше обращение. Мы получили ваш запрос и ответим в ближайшее время.';
        const { data: existingSystemMessage } = await supabaseAdmin
          .from('support_messages')
          .select('id')
          .eq('ticket_id', ticketId)
          .eq('message_text', SYSTEM_MESSAGE_TEXT)
          .limit(1);

        // Создаем системное сообщение только если его еще нет
        if (!existingSystemMessage || existingSystemMessage.length === 0) {
          const { error: autoMessageError } = await supabaseAdmin
            .from('support_messages')
            .insert({
              ticket_id: ticketId,
              sender_id: user.id, // Используем ID пользователя (требуется NOT NULL)
              message_text: SYSTEM_MESSAGE_TEXT
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

