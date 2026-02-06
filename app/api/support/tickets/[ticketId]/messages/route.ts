import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generalRateLimit, messageRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { checkAuth } from '@/lib/auth/helper';
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
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    const requestData = await request.json();
    const csrfToken = requestData.csrfToken;
    
    if (sessionId && csrfToken) {
      const csrfValidation = await verifyCSRFToken(csrfToken, sessionId, true);
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
    const attachments = requestData.attachments || [];

    // Разрешаем пустое сообщение, если есть вложения
    if (!attachments || attachments.length === 0) {
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return setCorsHeaders(
          NextResponse.json(
            { error: ERROR_INVALID_REQUEST_DATA },
            { status: 400 }
          )
        );
      }
    }

    // Валидация сообщения, если оно есть
    if (message && typeof message === 'string' && message.length > MESSAGE_MAX_LENGTH) {
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
    // Обычные пользователи могут писать только в свои тикеты
    if (!isSupport && ticket.user_id !== user.id) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_ACCESS_DENIED },
          { status: 403 }
        )
      );
    }
    
    // Поддержка не может писать в свои старые тикеты (созданные до получения роли поддержки)
    // Это предотвращает путаницу и сохраняет контекст тикета как тикета пользователя
    if (isSupport && ticket.user_id === user.id) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Сотрудники поддержки не могут отправлять сообщения в свои старые тикеты.' },
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

    // Создаем сообщение (разрешаем пустой текст, если есть вложения)
    // Сохраняем sender_type на момент отправки сообщения, чтобы старые сообщения не меняли тип при изменении роли пользователя
    // Пробуем сначала с sender_type, если поле не существует - используем fallback без него
    const messageData: {
      ticket_id: string;
      sender_id: string;
      message_text: string;
      sender_type?: 'support' | 'user';
    } = {
      ticket_id: ticketId,
      sender_id: user.id,
      message_text: (message && typeof message === 'string' && message.trim()) ? message.trim() : '',
      sender_type: isSupport ? 'support' : 'user'
    };

    let { data: newMessage, error: messageError } = await supabaseAdmin
      .from('support_messages')
      .insert(messageData)
      .select(`
        *,
        sender:users!support_messages_sender_id_fkey(id, username, user_id, avatar)
      `)
      .single();

    // Если ошибка связана с несуществующим полем sender_type, пробуем без него (обратная совместимость)
    // Проверяем различные варианты ошибок: PostgreSQL коды, сообщения об отсутствующих колонках
    if (messageError && (
      messageError.message?.toLowerCase().includes('sender_type') || 
      messageError.message?.toLowerCase().includes('column') ||
      messageError.message?.toLowerCase().includes('does not exist') ||
      messageError.code === '42703' || // PostgreSQL: undefined column
      messageError.code === '42P01' || // PostgreSQL: undefined table (на всякий случай)
      messageError.code === 'PGRST116' // PostgREST: column not found
    )) {
      logger.warn('sender_type field not available, using fallback', {
        error: messageError.message,
        code: messageError.code,
        ticketId
      });
      
      // Повторяем вставку без sender_type
      const { ticket_id, sender_id, message_text } = messageData;
      const fallbackData = {
        ticket_id,
        sender_id,
        message_text
      };
      
      const fallbackResult = await supabaseAdmin
        .from('support_messages')
        .insert(fallbackData)
        .select(`
          *,
          sender:users!support_messages_sender_id_fkey(id, username, user_id, avatar)
        `)
        .single();
      
      newMessage = fallbackResult.data;
      messageError = fallbackResult.error;
    }

    if (messageError || !newMessage) {
      logger.error('Error creating message', {
        error: messageError?.message || 'Unknown error',
        code: messageError?.code,
        ticketId
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    // Создаем вложения, если они есть
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      const attachmentRecords = attachments.map((att: {
        storagePath: string;
        storageUrl: string;
        fileName: string;
        fileType: string;
        fileSize: number;
        blur_hash?: string;
        width?: number;
        height?: number;
      }) => ({
        message_id: newMessage.id,
        file_name: att.fileName,
        file_type: att.fileType,
        file_size: att.fileSize,
        storage_path: att.storagePath,
        storage_url: `/support/files/${encodeURIComponent(att.storagePath)}`, // Используем endpoint для авторизованного доступа
        blur_hash: att.blur_hash || null,
        width: att.width || null,
        height: att.height || null,
      }));

      const { error: attachmentsError } = await supabaseAdmin
        .from('support_message_attachments')
        .insert(attachmentRecords);

      if (attachmentsError) {
        logger.error('Error creating attachments', {
          error: attachmentsError.message,
          code: attachmentsError.code,
          messageId: newMessage.id
        });
        // Не прерываем выполнение, так как сообщение уже создано
      }
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
      
      // Получаем вложения для сообщения
      let attachmentsData: Array<{
        id: string;
        file_name: string;
        file_type: string;
        file_size: number;
        storage_path: string;
        blur_hash?: string;
        width?: number;
        height?: number;
      }> = [];
      
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        // Получаем вложения из базы данных
        const { data: dbAttachments } = await supabaseAdmin
          .from('support_message_attachments')
          .select('id, file_name, file_type, file_size, storage_path, blur_hash, width, height')
          .eq('message_id', newMessage.id);
        
        if (dbAttachments && dbAttachments.length > 0) {
          attachmentsData = dbAttachments.map(att => ({
            id: att.id,
            file_name: att.file_name,
            file_type: att.file_type,
            file_size: att.file_size,
            storage_path: att.storage_path,
            blur_hash: att.blur_hash,
            width: att.width,
            height: att.height,
          }));
        }
      }
      
      // Формируем вложения с правильными URL для WebSocket broadcast
      const attachmentsForBroadcast = attachmentsData.length > 0 
        ? attachmentsData.map(att => ({
            id: att.id,
            file_name: att.file_name,
            file_type: att.file_type,
            file_size: att.file_size,
            storage_path: att.storage_path,
            storage_url: `/support/files/${encodeURIComponent(att.storage_path)}`,
            blur_hash: att.blur_hash,
            width: att.width,
            height: att.height,
          }))
        : undefined;

      // В broadcast — пустой message_text при только вложениях (подпись только в last_message в списке)
      const displayMessageText = newMessage.message_text || '';

      const messageForBroadcast = {
        id: newMessage.id,
        ticket_id: newMessage.ticket_id,
        sender_id: newMessage.sender_id,
        sender_type: isSupport ? 'support' : 'user' as 'user' | 'support',
        message_text: displayMessageText,
        is_read: newMessage.is_read || false,
        created_at: newMessage.created_at,
        sender: senderData,
        attachments: attachmentsForBroadcast,
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

