import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { getUserByToken } from '@/lib/auth/index';
import { hasUserRole, batchHasUserRole } from '@/lib/auth/user-roles';
import { supabaseAdmin } from '@/lib/database/supabase';
import { ERROR_INTERNAL_SERVER_ERROR, ERROR_NOT_AUTHENTICATED, ERROR_INVALID_REQUEST_DATA, ERROR_MAXIMUM_TICKET_LIMIT_REACHED, ERROR_TOO_MANY_REQUESTS, TICKET_SUBJECT_MAX_LENGTH, MESSAGE_MAX_LENGTH, ERROR_MESSAGE_TOO_LONG, ERROR_SUBJECT_TOO_LONG, MAX_TICKETS_PER_USER } from '@/lib/utils/constants';
import { getLastMessageLabelForAttachments } from '@/lib/utils/support-messages';
import { cached, cache } from '@/lib/database/cache';

interface LastMessage {
  id: string;
  message_text: string;
  sender_id: string;
  sender_type: 'user' | 'support';
  created_at: string;
  is_read: boolean;
  attachments?: Array<{
    id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    storage_path: string;
  }>;
}

interface RpcLastMessage {
  ticket_id: string;
  id: string;
  message_text: string;
  sender_id: string;
  sender_type?: string | null;
  created_at: string;
  is_read: boolean;
}

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
      // Rate limit - не логируем (нормальная ситуация)
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
        user:users!support_tickets_user_id_fkey(id, username, user_id, avatar),
        assigned_user:users!support_tickets_assigned_to_fkey(id, username, user_id, avatar)
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

    // Кэширование списка тикетов
    const cacheKey = `tickets:${user.id}:${isSupport ? 'support' : 'user'}:${status || 'all'}:${forUser ? 'forUser' : 'all'}`;
    
    const tickets = await cached(cacheKey, async () => {
      const { data, error } = await query;
      
      if (error) {
        throw new Error(`Error fetching tickets: ${error.message}`);
      }
      
      return data || [];
    }, 30); // Кэш на 30 секунд

    if (!tickets || tickets.length === 0) {
      return setCorsHeaders(
        NextResponse.json({ tickets: [] })
      );
    }

    // Получаем последние сообщения для каждого тикета
    // Оптимизация: используем RPC функцию с оконными функциями SQL
    const ticketIds = tickets.map(t => t.id);
    let lastMessagesMap: Record<string, LastMessage | null> = {};
    
    if (ticketIds.length > 0 && supabaseAdmin) {
      try {
        // Используем оптимизированную RPC функцию с оконными функциями
        const { data: lastMessages, error: rpcError } = await supabaseAdmin
          .rpc('get_last_messages_for_tickets', { ticket_ids: ticketIds }) as { data: RpcLastMessage[] | null; error: any };
        
        if (rpcError) {
          // Fallback на старый метод при ошибке RPC
          logger.warn('RPC function failed, using fallback', {
            error: rpcError.message,
            ticketCount: ticketIds.length
          });
          
          // supabaseAdmin уже проверен на строке 135, поэтому здесь он гарантированно не null
          const BATCH_SIZE = 10;
          for (let i = 0; i < ticketIds.length; i += BATCH_SIZE) {
            const batch = ticketIds.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map(async (ticketId) => {
              const { data: lastMessage } = await supabaseAdmin!
                .from('support_messages')
                .select(`
                  id, 
                  message_text, 
                  sender_id, 
                  sender_type,
                  created_at, 
                  is_read,
                  attachments:support_message_attachments(id, file_name, file_type, file_size, storage_path)
                `)
                .eq('ticket_id', ticketId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
              return { ticketId, lastMessage: lastMessage || null };
            });
            
            const batchResults = await Promise.all(batchPromises);
            // Получаем sender_id только для сообщений без sender_type (для обратной совместимости)
            const messagesNeedingRoleCheck = batchResults
              .map(({ lastMessage }) => lastMessage)
              .filter((msg): msg is NonNullable<typeof msg> => !!msg && !msg.sender_type);
            const senderIds = messagesNeedingRoleCheck
              .map(msg => msg.sender_id)
              .filter((id): id is string => !!id);
            const senderRolesMap = senderIds.length > 0 
              ? await batchHasUserRole(senderIds, 'support')
              : new Map<string, boolean>();
            
            // Создаем map ticketId -> user_id для правильного определения sender_type старых сообщений
            const ticketUserMap = new Map<string, string>();
            for (const ticket of tickets || []) {
              if (ticket.id) {
                ticketUserMap.set(ticket.id, ticket.user_id);
              }
            }
            
            batchResults.forEach(({ ticketId, lastMessage }) => {
              if (lastMessage) {
                // Используем сохраненное значение sender_type из БД, если оно есть
                // Для старых сообщений: если сообщение от создателя тикета (user_id === sender_id), это 'user'
                // Иначе определяем по текущей роли (для обратной совместимости со старыми сообщениями)
                let senderType: 'user' | 'support';
                if (lastMessage.sender_type) {
                  senderType = lastMessage.sender_type === 'support' ? 'support' : 'user';
                } else {
                  const ticketUserId = ticketUserMap.get(ticketId);
                  // Если сообщение от создателя тикета - это 'user' (старое сообщение до получения роли поддержки)
                  if (ticketUserId && ticketUserId === lastMessage.sender_id) {
                    senderType = 'user';
                  } else {
                    // Иначе определяем по текущей роли отправителя
                const senderIsSupport = senderRolesMap.get(lastMessage.sender_id) || false;
                    senderType = senderIsSupport ? 'support' : 'user';
                  }
                }
                // Обрабатываем вложения (могут быть массивом или объектом)
                let attachments: Array<{
                  id: string;
                  file_name: string;
                  file_type: string;
                  file_size: number;
                  storage_path: string;
                }> = [];
                if (lastMessage.attachments) {
                  if (Array.isArray(lastMessage.attachments)) {
                    attachments = lastMessage.attachments.map((att: any) => ({
                      id: att.id,
                      file_name: att.file_name,
                      file_type: att.file_type,
                      file_size: att.file_size,
                      storage_path: att.storage_path,
                    }));
                  }
                }
                let displayMessageText = lastMessage.message_text;
                if (!displayMessageText && attachments.length > 0) {
                  displayMessageText = getLastMessageLabelForAttachments(attachments);
                }

                lastMessagesMap[ticketId] = {
                  id: lastMessage.id,
                  message_text: displayMessageText,
                  sender_id: lastMessage.sender_id,
                  sender_type: senderType,
                  created_at: lastMessage.created_at,
                  is_read: lastMessage.is_read,
                  attachments: attachments.length > 0 ? attachments : undefined
                };
              }
            });
          }
        } else if (lastMessages && lastMessages.length > 0) {
          // Используем sender_type из RPC, если есть; для старых сообщений без sender_type — запрос к БД
          const senderTypeMap = new Map<string, 'user' | 'support'>();
          const messagesNeedingRoleCheck: Array<{ id: string; sender_id: string }> = [];
          for (const msg of lastMessages) {
            if (msg.sender_type) {
              senderTypeMap.set(msg.id, msg.sender_type === 'support' ? 'support' : 'user');
            } else {
              messagesNeedingRoleCheck.push({ id: msg.id, sender_id: msg.sender_id });
            }
          }
          const messageIdsNeedingSenderType = messagesNeedingRoleCheck.map(m => m.id);
          let messagesWithSenderType: Array<{ id: string; sender_id: string; sender_type?: string | null }> | null = null;
          if (messageIdsNeedingSenderType.length > 0) {
            const { data } = await supabaseAdmin!
              .from('support_messages')
              .select('id, sender_id, sender_type')
              .in('id', messageIdsNeedingSenderType);
            messagesWithSenderType = data;
          }
          if (messagesWithSenderType) {
            for (const msg of messagesWithSenderType) {
              if (msg.sender_type) {
                senderTypeMap.set(msg.id, msg.sender_type === 'support' ? 'support' : 'user');
              }
            }
          }
          
          // Оптимизация: batch запрос для всех sender_id только для сообщений без sender_type
          const senderIds = messagesNeedingRoleCheck.map(msg => msg.sender_id).filter((id): id is string => !!id);
          const senderRolesMap = senderIds.length > 0 
            ? await batchHasUserRole(senderIds, 'support')
            : new Map<string, boolean>();
          
          // Создаем map ticketId -> user_id для правильного определения sender_type старых сообщений
          const ticketUserMap = new Map<string, string>();
          for (const ticket of tickets || []) {
            if (ticket.id) {
              ticketUserMap.set(ticket.id, ticket.user_id);
            }
          }
          
          // Заполняем senderTypeMap для сообщений без sender_type
          // Нужно получить ticket_id для каждого сообщения
          const messageIdsNeedingTicketInfo = messagesNeedingRoleCheck.map(msg => msg.id);
          const { data: messagesWithTicketInfo } = await supabaseAdmin!
            .from('support_messages')
            .select('id, ticket_id, sender_id')
            .in('id', messageIdsNeedingTicketInfo);
          
          if (messagesWithTicketInfo) {
            for (const msgInfo of messagesWithTicketInfo) {
              const ticketUserId = ticketUserMap.get(msgInfo.ticket_id);
              // Если сообщение от создателя тикета - это 'user' (старое сообщение до получения роли поддержки)
              if (ticketUserId && ticketUserId === msgInfo.sender_id) {
                senderTypeMap.set(msgInfo.id, 'user');
              } else {
                // Иначе определяем по текущей роли отправителя
                const senderIsSupport = senderRolesMap.get(msgInfo.sender_id) || false;
                senderTypeMap.set(msgInfo.id, senderIsSupport ? 'support' : 'user');
              }
            }
          }
          
          // Для сообщений с пустым текстом нужно проверить вложения
          const messagesNeedingAttachments = lastMessages.filter((msg: RpcLastMessage) => !msg.message_text);
          const messageIdsNeedingAttachments = messagesNeedingAttachments.map(msg => msg.id);
          
          // Получаем вложения для сообщений с пустым текстом
          let attachmentsMap: Record<string, Array<{ id: string; file_name: string; file_type: string; file_size: number; storage_path: string }>> = {};
          if (messageIdsNeedingAttachments.length > 0 && supabaseAdmin) {
            const { data: attachmentsData } = await supabaseAdmin
              .from('support_message_attachments')
              .select('message_id, id, file_name, file_type, file_size, storage_path')
              .in('message_id', messageIdsNeedingAttachments);
            
            if (attachmentsData) {
              attachmentsData.forEach(att => {
                if (!attachmentsMap[att.message_id]) {
                  attachmentsMap[att.message_id] = [];
                }
                attachmentsMap[att.message_id].push({
                  id: att.id,
                  file_name: att.file_name,
                  file_type: att.file_type,
                  file_size: att.file_size,
                  storage_path: att.storage_path
                });
              });
            }
          }
          
          // Создаем map из результатов RPC функции
          // Для определения sender_type старых сообщений: если сообщение от создателя тикета (ticket.user_id === msg.sender_id),
          // это 'user' (старое сообщение от пользователя до получения роли поддержки)
          const ticketMap = new Map<string, string>(); // ticket_id -> user_id
          for (const ticket of tickets || []) {
            if (ticket.id) {
              ticketMap.set(ticket.id, ticket.user_id);
            }
          }
          
          for (const msg of lastMessages) {
            let senderType = senderTypeMap.get(msg.id);
            
            // Если sender_type не найден, используем логику для старых сообщений
            if (!senderType) {
              const ticketUserId = ticketMap.get(msg.ticket_id);
              // Если сообщение от создателя тикета, это 'user' (старое сообщение)
              if (ticketUserId && ticketUserId === msg.sender_id) {
                senderType = 'user';
              } else {
                // Иначе определяем по текущей роли
            const senderIsSupport = senderRolesMap.get(msg.sender_id) || false;
                senderType = senderIsSupport ? 'support' : 'user';
              }
            }
            
            const attachments = attachmentsMap[msg.id] || [];
            let displayMessageText = msg.message_text || '';
            if (!displayMessageText && attachments.length > 0) {
              displayMessageText = getLastMessageLabelForAttachments(attachments);
            }

            lastMessagesMap[msg.ticket_id] = {
              id: msg.id,
              message_text: displayMessageText,
              sender_id: msg.sender_id,
              sender_type: senderType as 'user' | 'support',
              created_at: msg.created_at,
              is_read: msg.is_read,
              attachments: attachments.length > 0 ? attachments : undefined
            };
          }
        }
        
        // Заполняем null для тикетов без сообщений
        for (const ticketId of ticketIds) {
          if (!lastMessagesMap[ticketId]) {
            lastMessagesMap[ticketId] = null;
          }
        }
      } catch (error) {
        logger.error('Error in batch last messages fetch', {
          error: error instanceof Error ? error.message : 'Unknown error',
          ticketCount: ticketIds.length
        });
        // В случае ошибки возвращаем пустой map
      }
    }

    const ticketsWithLastMessage = (tickets || []).map(ticket => ({
      ...ticket,
      last_message: lastMessagesMap[ticket.id] || null
    }));

    return setCorsHeaders(
      NextResponse.json({ tickets: ticketsWithLastMessage })
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
      // Rate limit - не логируем
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

    // Поддержка не может создавать новые тикеты (только отвечать на чужие)
    const isSupport = await hasUserRole(user.id, 'support');
    if (isSupport) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Сотрудники поддержки не могут создавать новые тикеты' },
          { status: 403 }
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

    // ОПТИМИЗАЦИЯ: Используем RPC функцию для атомарного создания тикета с сообщением
    // Это предотвращает ситуацию, когда тикет создан, но сообщение не создано
    const { data: ticketData, error: rpcError } = await supabaseAdmin
      .rpc('create_ticket_with_message', {
        p_user_id: user.id,
        p_subject: subject.trim(),
        p_message_text: message.trim()
      });

    if (rpcError || !ticketData || ticketData.length === 0) {
      logger.error('Error creating ticket with message', {
        error: rpcError?.message,
        code: rpcError?.code,
        userId: user.id
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    const result = ticketData[0];
    const ticketId = result.ticket_id;

    // Получаем полную информацию о тикете
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('support_tickets')
      .select(`
        *,
        user:users!support_tickets_user_id_fkey(id, username, user_id, avatar)
      `)
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      logger.error('Error fetching created ticket', {
        error: ticketError?.message,
        ticketId
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    // Успешное создание тикета не логируется

    // Инвалидируем кэш тикетов пользователя
    cache.delete(`tickets:${user.id}:user:all:all`);
    cache.delete(`tickets:${user.id}:user:all:forUser`);
    cache.delete(`tickets:${user.id}:user:open:all`);
    cache.delete(`tickets:${user.id}:user:open:forUser`);
    // Также инвалидируем кэш для поддержки
    cache.deleteByPattern(/^tickets:.*:support:.*$/);

    // Трекинг аналитики
    try {
      const { trackTicketCreated, trackMessageSent } = await import('@/lib/analytics/support-analytics');
      await Promise.all([
        trackTicketCreated(ticket.id, user.id, ticket.status),
        trackMessageSent(ticket.id, user.id, 'user')
      ]);
    } catch (error) {
      logger.error('Error tracking ticket/message creation', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ticketId: ticket.id
      });
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

