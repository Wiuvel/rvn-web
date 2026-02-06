import { NextRequest, NextResponse } from 'next/server';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { checkAuth } from '@/lib/auth/helper';
import { hasUserRole, batchHasUserRole } from '@/lib/auth/user-roles';
import { supabaseAdmin } from '@/lib/database/supabase';
import { ERROR_INTERNAL_SERVER_ERROR, ERROR_NOT_AUTHENTICATED, ERROR_INVALID_REQUEST_DATA, ERROR_TICKET_NOT_FOUND, ERROR_ACCESS_DENIED, ERROR_TOO_MANY_REQUESTS, ERROR_INVALID_STATUS_TRANSITION, ERROR_TICKET_NOT_ASSIGNED } from '@/lib/utils/constants';
import { broadcastTicketUpdate, broadcastTicketAssignment, broadcastNewMessage } from '@/lib/websocket/server';
import { isValidUUID } from '@/lib/utils/uuid-validation';
import { cache } from '@/lib/database/cache';

export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * GET - Получить тикет с сообщениями
 */
export async function GET(
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

    if (!supabaseAdmin) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    // Получаем тикет
    const ticketQuery = supabaseAdmin
      .from('support_tickets')
      .select(`
        *,
        user:users!support_tickets_user_id_fkey(id, username, user_id, avatar),
        assigned_user:users!support_tickets_assigned_to_fkey(id, username, user_id, avatar)
      `)
      .eq('id', ticketId)
      .single();

    const { data: ticket, error: ticketError } = await ticketQuery;

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

    // Получаем сообщения с пагинацией
    // Для оптимизации рекомендуется применить индекс idx_support_messages_ticket_created
    // См. database_migration_add_support_indexes.sql
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10); // По умолчанию 100 сообщений
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const maxLimit = 500; // Максимальный лимит для защиты от перегрузки
    
    const safeLimit = Math.min(Math.max(limit, 1), maxLimit);
    const safeOffset = Math.max(offset, 0);
    
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('support_messages')
      .select(`
        *,
        sender:users!support_messages_sender_id_fkey(id, username, user_id, avatar),
        attachments:support_message_attachments(id, file_name, file_type, file_size, storage_path, blur_hash, width, height)
      `)
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })
      .range(safeOffset, safeOffset + safeLimit - 1);

    if (messagesError) {
      logger.error('Error fetching messages', {
        error: messagesError.message,
        ticketId
      });
      // Возвращаем тикет, но с пустым массивом сообщений
      // Это позволяет показать тикет, даже если сообщения не загрузились
      return setCorsHeaders(
        NextResponse.json({
          ticket,
          messages: []
        })
      );
    }

    // Оптимизация: batch запрос для всех sender_id вместо N запросов (только для старых сообщений без sender_type)
    const messagesNeedingRoleCheck = (messages || []).filter((msg: any) => !msg.sender_type);
    const uniqueSenderIds = Array.from(new Set(messagesNeedingRoleCheck.map((msg: any) => msg.sender_id)));
    const senderRolesMap = uniqueSenderIds.length > 0 
      ? await batchHasUserRole(uniqueSenderIds, 'support')
      : new Map<string, boolean>();
    
    // Оптимизированная обработка сообщений с вложениями
    const messagesWithSenderType = (messages || []).map((msg: any) => {
      // Используем сохраненное значение sender_type из БД, если оно есть (самый надежный способ)
      // Для старых сообщений без sender_type:
      // - Если сообщение от создателя тикета (user_id === sender_id), это 'user' (старое сообщение до получения роли)
      // - Иначе определяем по текущей роли отправителя (для обратной совместимости)
      let senderType: 'user' | 'support';
      if (msg.sender_type) {
        // Используем сохраненное значение
        senderType = msg.sender_type === 'support' ? 'support' : 'user';
      } else if (ticket.user_id === msg.sender_id) {
        // Старое сообщение от создателя тикета - всегда 'user' (даже если сейчас он поддержка)
        senderType = 'user';
      } else {
        // Для сообщений не от создателя тикета - определяем по текущей роли
      const senderIsSupport = senderRolesMap.get(msg.sender_id) || false;
        senderType = senderIsSupport ? 'support' : 'user';
      }
      
      // Формируем правильные URL для вложений из storage_path (оптимизировано)
      let attachments = undefined;
      if (msg.attachments) {
        // Обрабатываем как массив (нормализуем)
        const attArray = Array.isArray(msg.attachments) ? msg.attachments : [msg.attachments];
        if (attArray.length > 0) {
          attachments = attArray.map((att: any) => ({
            id: att.id,
            file_name: att.file_name,
            file_type: att.file_type,
            file_size: att.file_size,
            storage_path: att.storage_path,
            // Формируем URL только из storage_path (единственный источник истины)
            storage_url: att.storage_path 
              ? `/support/files/${encodeURIComponent(att.storage_path)}` 
              : '',
            // Metadata для blur preview и правильного размера
            blur_hash: att.blur_hash,
            width: att.width,
            height: att.height
          }));
        }
      }
      return {
        ...msg,
        sender_type: senderType,
        attachments
      };
    });

    return setCorsHeaders(
      NextResponse.json({
        ticket,
        messages: messagesWithSenderType
      })
    );
  } catch (error) {
    logger.error('Error in GET /api/support/tickets/[ticketId]', {
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

/**
 * PUT - Обновить тикет (статус, назначение)
 */
export async function PUT(
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
    const isSupport = await hasUserRole(user.id, 'support');
    if (!isSupport) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_ACCESS_DENIED },
          { status: 403 }
        )
      );
    }

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
    const { assignedTo, priority, closeReason, ...rest } = await request.json();
    let status = rest.status;

    if (!supabaseAdmin) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    // Получаем текущий статус тикета и назначение перед обновлением
    const { data: currentTicket } = await supabaseAdmin
      .from('support_tickets')
      .select('status, assigned_to')
      .eq('id', ticketId)
      .single();

    if (!currentTicket) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_TICKET_NOT_FOUND },
          { status: 404 }
        )
      );
    }

    const oldStatus = currentTicket.status;
    const oldAssignedTo = currentTicket.assigned_to;

    // Валидация переходов статусов
    // Если пытаются установить "resolved", автоматически заменяем на "closed"
    if (status === 'resolved') {
      status = 'closed';
    }
    
    if (status && oldStatus !== status) {
      // Определяем допустимые переходы статусов
      const allowedTransitions: Record<string, string[]> = {
        'open': ['pending'], // Открыт → только В работе (при взятии)
        'pending': ['closed'], // В работе → Закрыт
        'closed': [] // Закрыт → нельзя менять (финальный статус)
      };

      const allowedNextStatuses = allowedTransitions[oldStatus] || [];
      
      if (!allowedNextStatuses.includes(status)) {
        // Невалидный переход статуса - не логируем
        return setCorsHeaders(
          NextResponse.json(
            { error: ERROR_INVALID_STATUS_TRANSITION },
            { status: 400 }
          )
        );
      }

      // Проверка прав на изменение статуса
      // Для изменения статуса тикет должен быть назначен текущему саппорту
      // Исключение: взятие тикета (open → pending) и закрытие (pending → closed)
      if (status !== 'pending' || oldStatus !== 'open') {
        // Если это не взятие тикета, проверяем назначение
        if (oldAssignedTo !== user.id) {
          // Попытка изменения статуса не назначенным поддержкой - не логируем
          return setCorsHeaders(
            NextResponse.json(
              { error: ERROR_TICKET_NOT_ASSIGNED },
              { status: 403 }
            )
          );
        }
      }
    }

    // Если меняется назначение, проверяем логику
    if (assignedTo !== undefined && assignedTo !== oldAssignedTo) {
      // Если тикет берется (assignedTo устанавливается), автоматически меняем статус на pending
      if (assignedTo && oldStatus === 'open') {
        if (!status) {
          status = 'pending';
        }
      }
      // Если тикет отвязывается (assignedTo = null), статус не должен быть pending
      if (!assignedTo && oldStatus === 'pending') {
        // При отвязывании тикета в работе, статус остается pending
        // Но можно отвязать только если это делает назначенный саппорт
        if (oldAssignedTo !== user.id) {
          return setCorsHeaders(
            NextResponse.json(
              { error: ERROR_TICKET_NOT_ASSIGNED },
              { status: 403 }
            )
          );
        }
      }
    }

    const updateData: { status?: string; closed_at?: string | null; assigned_to?: string | null; priority?: string } = {};
    if (status && ['open', 'closed', 'pending'].includes(status)) {
      updateData.status = status;
      if (status === 'closed') {
        updateData.closed_at = new Date().toISOString();
      } else if (oldStatus === 'closed' && (status === 'open' || status === 'pending')) {
        // Если тикет открывается из закрытого состояния, очищаем closed_at
        // Явно устанавливаем null для корректного обновления в БД
        updateData.closed_at = null;
      }
    }
    if (assignedTo !== undefined) {
      updateData.assigned_to = assignedTo || null;
    }
    if (priority && ['low', 'normal', 'high', 'urgent'].includes(priority)) {
      updateData.priority = priority;
    }

    if (Object.keys(updateData).length === 0) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INVALID_REQUEST_DATA },
          { status: 400 }
        )
      );
    }

    const { data: ticket, error } = await supabaseAdmin
      .from('support_tickets')
      .update(updateData)
      .eq('id', ticketId)
      .select(`
        *,
        user:users!support_tickets_user_id_fkey(id, username, user_id),
        assigned_user:users!support_tickets_assigned_to_fkey(id, username, user_id, avatar)
      `)
      .single();

    if (error) {
      logger.error('Error updating ticket', {
        error: error.message,
        ticketId
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    // Инвалидируем кэш тикетов при обновлении
    if (ticket) {
      // Инвалидируем кэш для владельца тикета
      cache.delete(`tickets:${ticket.user_id}:user:all:all`);
      cache.delete(`tickets:${ticket.user_id}:user:all:forUser`);
      cache.delete(`tickets:${ticket.user_id}:user:open:all`);
      cache.delete(`tickets:${ticket.user_id}:user:open:forUser`);
      // Инвалидируем кэш для поддержки
      cache.deleteByPattern(/^tickets:.*:support:.*$/);
    }

    // Отправляем обновление тикета через WebSocket
    if (ticket) {
      // Успешное обновление тикета не логируется
      
      broadcastTicketUpdate(ticketId, {
        id: ticketId,
        status: ticket.status,
        updated_at: ticket.updated_at,
        closed_at: ticket.closed_at || null,
      });

      // Если изменилось назначение, отправляем событие
      if (assignedTo !== undefined && assignedTo !== oldAssignedTo) {
        // Назначение тикета изменено - не логируем
        
        broadcastTicketAssignment(
          ticketId,
          assignedTo || null,
          ticket.assigned_user || null
        );
      }
    }

    // Если статус изменился, создаем системное сообщение
    if (status && oldStatus && oldStatus !== status && ticket) {
      let messageText = '';
      
      if (status === 'pending' && oldStatus === 'open') {
        messageText = 'Ваше обращение приняли в обработку. Ожидайте ответа.';
      } else if (status === 'closed') {
        // Трекинг аналитики при закрытии тикета
        try {
          const { trackTicketClosed } = await import('@/lib/analytics/support-analytics');
          await trackTicketClosed(ticketId, user.id, status);
        } catch (error) {
          logger.error('Error tracking ticket closure', {
            error: error instanceof Error ? error.message : 'Unknown error',
            ticketId
          });
        }
        
        if (closeReason && closeReason.trim()) {
          messageText = `Ваше обращение было закрыто по причине: ${closeReason.trim()}`;
        } else {
          messageText = 'Ваше обращение было закрыто.';
        }
      } else {
        const statusNames: Record<string, string> = {
          'open': 'Открыт',
          'pending': 'В работе',
          'closed': 'Закрыт'
        };
        const newStatusName = statusNames[status] || status;
        messageText = `Статус обращения изменен на [${newStatusName}]`;
      }

      // Создаем системное сообщение о смене статуса
      // Используем sender_id саппорта, который меняет статус, но sender_type: 'support' для отображения как системное
      const { data: statusMessage, error: messageError } = await supabaseAdmin
        .from('support_messages')
        .insert({
          ticket_id: ticketId,
          sender_id: user.id, // ID саппорта, который меняет статус
          message_text: messageText
        })
        .select(`
          *,
          sender:users!support_messages_sender_id_fkey(id, username, user_id, avatar)
        `)
        .single();

      if (messageError) {
        // Логируем ошибку, но не прерываем выполнение, так как тикет уже обновлен
        logger.error('Error creating status change message', {
          error: messageError.message,
          ticketId
        });
      } else {
        // last_message_at автоматически обновляется триггером БД при создании сообщения
        // Не нужно обновлять вручную - это исправляет race condition
        
        // Отправляем системное сообщение через WebSocket
        if (statusMessage) {
          broadcastNewMessage(ticketId, statusMessage);
        }
      }
    }

    return setCorsHeaders(
      NextResponse.json({ ticket, success: true })
    );
  } catch (error) {
    logger.error('Error in PUT /api/support/tickets/[ticketId]', {
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

