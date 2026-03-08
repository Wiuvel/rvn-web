import { cookies } from 'next/headers';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure, supportProcedure } from '../init';
import { checkAuth } from '@/lib/auth/helper';
import { hasUserRole, batchHasUserRole } from '@/lib/auth/user-roles';
import { supabaseAdmin } from '@/lib/database/supabase';
import { messageRateLimit } from '@/lib/security/rate-limit';
import { verifyCSRFToken } from '@/lib/security/csrf';
import {
  broadcastTicketUpdate,
  broadcastTicketAssignment,
  broadcastNewMessage,
} from '@/lib/websocket/server';
import { isValidUUID } from '@/lib/utils/uuid-validation';
import { cached } from '@/lib/database/cache';
import { logger } from '@/lib/utils/secure-logger';
import {
  MAX_TICKETS_PER_USER,
  ERROR_MAXIMUM_TICKET_LIMIT_REACHED,
  ERROR_INVALID_STATUS_TRANSITION,
  ERROR_TICKET_NOT_ASSIGNED,
  ERROR_CANNOT_SEND_TO_CLOSED_TICKET,
} from '@/lib/utils/constants';
import { z } from 'zod';
import {
  createTicketBodySchema,
  supportTicketsQuerySchema,
  ticketIdParamSchema,
  updateTicketBodySchema,
  createMessageBodySchema,
} from '@/lib/validation/api-schemas';
import {
  resolveLastMessagesForTickets,
  resolveSenderType,
  invalidateTicketCaches,
} from '../helpers/support';

export const supportRouter = router({
  check: publicProcedure.query(async ({ ctx }) => {
    const authResult = await checkAuth(ctx.req);
    if (!authResult.isAuthenticated || !authResult.user) {
      return { isAuthenticated: false as const, hasSupportAccess: false };
    }
    const user = authResult.user;
    const cookieStore = await cookies();
    const currentToken = cookieStore.get('token')?.value;

    let hasSupportAccess = false;
    try {
      hasSupportAccess = await hasUserRole(user.id, 'support');
    } catch (dbError) {
      logger.error('Database error in support check', {
        error: dbError instanceof Error ? dbError.message : 'Unknown error',
        userId: user.id,
      });
      return {
        isAuthenticated: true as const,
        hasSupportAccess: false,
        username: user.username,
        userId: user.id,
        user_id: user.user_id,
        token: currentToken,
        error: 'Database not configured',
      };
    }

    return {
      isAuthenticated: true as const,
      hasSupportAccess,
      username: user.username,
      userId: user.id,
      user_id: user.user_id,
      token: currentToken,
    };
  }),

  tickets: router({
    list: protectedProcedure.input(supportTicketsQuerySchema).query(async ({ ctx, input }) => {
      if (!supabaseAdmin) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database error' });
      }

      const user = ctx.user;
      const isSupport = await hasUserRole(user.id, 'support');
      const { status, statuses, forUser } = input;

      let query = supabaseAdmin
        .from('support_tickets')
        .select(
          `*,
            user:users!support_tickets_user_id_fkey(id, username, user_id, avatar),
            assigned_user:users!support_tickets_assigned_to_fkey(id, username, user_id, avatar)`,
        )
        .order('last_message_at', { ascending: false });

      if (forUser || !isSupport) {
        query = query.eq('user_id', user.id);
      }

      if (statuses) {
        const statusArray = statuses
          .split(',')
          .map((s) => s.trim())
          .filter((s) => ['open', 'closed', 'pending'].includes(s));
        if (statusArray.length > 0) {
          query = query.in('status', statusArray);
        }
      } else if (status && status !== 'all' && ['open', 'closed', 'pending'].includes(status)) {
        query = query.eq('status', status);
      }

      const cacheKey = `tickets:${user.id}:${isSupport ? 'support' : 'user'}:${status || 'all'}:${forUser ? 'forUser' : 'all'}`;

      const tickets = await cached(
        cacheKey,
        async () => {
          const { data, error } = await query;
          if (error) throw new Error(`Error fetching tickets: ${error.message}`);
          return data || [];
        },
        30,
      );

      if (!tickets || tickets.length === 0) {
        return { tickets: [] };
      }

      const ticketIds = tickets.map((t: any) => t.id);
      const lastMessagesMap = await resolveLastMessagesForTickets(ticketIds, tickets as any);

      const ticketsWithLastMessage = tickets.map((ticket: any) => ({
        ...ticket,
        last_message: lastMessagesMap[ticket.id] || null,
      }));

      return { tickets: ticketsWithLastMessage };
    }),

    create: protectedProcedure.input(createTicketBodySchema).mutation(async ({ ctx, input }) => {
      if (!supabaseAdmin) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database error' });
      }

      const user = ctx.user;
      const isSupport = await hasUserRole(user.id, 'support');
      if (isSupport) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Сотрудники поддержки не могут создавать новые тикеты',
        });
      }

      const { subject, message } = input;

      const { count, error: countError } = await supabaseAdmin
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['open', 'pending']);

      if (countError) {
        logger.error('Error counting tickets', { error: countError.message, userId: user.id });
      }

      if ((count || 0) >= MAX_TICKETS_PER_USER) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: ERROR_MAXIMUM_TICKET_LIMIT_REACHED });
      }

      const { data: ticketData, error: rpcError } = await supabaseAdmin.rpc(
        'create_ticket_with_message',
        { p_user_id: user.id, p_subject: subject, p_message_text: message },
      );

      if (rpcError || !ticketData || ticketData.length === 0) {
        logger.error('Error creating ticket', {
          error: rpcError?.message,
          userId: user.id,
        });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create ticket' });
      }

      const ticketId = ticketData[0].ticket_id;

      const { data: ticket, error: ticketError } = await supabaseAdmin
        .from('support_tickets')
        .select(`*, user:users!support_tickets_user_id_fkey(id, username, user_id, avatar)`)
        .eq('id', ticketId)
        .single();

      if (ticketError || !ticket) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch created ticket',
        });
      }

      invalidateTicketCaches(user.id);

      try {
        const { trackTicketCreated, trackMessageSent } =
          await import('@/lib/analytics/support-analytics');
        await Promise.all([
          trackTicketCreated(ticket.id, user.id, ticket.status),
          trackMessageSent(ticket.id, user.id, 'user'),
        ]);
      } catch {}

      return { ticket, success: true };
    }),

    get: protectedProcedure
      .input(
        z.object({
          ticketId: z
            .string()
            .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
          limit: z.number().min(1).max(500).default(100),
          offset: z.number().min(0).default(0),
        }),
      )
      .query(async ({ ctx, input }) => {
        if (!supabaseAdmin) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database error' });
        }

        const user = ctx.user;
        const isSupport = await hasUserRole(user.id, 'support');
        const { ticketId, limit, offset } = input;

        if (!isValidUUID(ticketId)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid ticket ID' });
        }

        const { data: ticket, error: ticketError } = await supabaseAdmin
          .from('support_tickets')
          .select(
            `*,
            user:users!support_tickets_user_id_fkey(id, username, user_id, avatar),
            assigned_user:users!support_tickets_assigned_to_fkey(id, username, user_id, avatar)`,
          )
          .eq('id', ticketId)
          .single();

        if (ticketError || !ticket) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
        }

        if (!isSupport && ticket.user_id !== user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { data: messages, error: messagesError } = await supabaseAdmin
          .from('support_messages')
          .select(
            `*,
            sender:users!support_messages_sender_id_fkey(id, username, user_id, avatar),
            attachments:support_message_attachments(id, file_name, file_type, file_size, storage_path, blur_hash, width, height)`,
          )
          .eq('ticket_id', ticketId)
          .order('created_at', { ascending: true })
          .range(offset, offset + limit - 1);

        if (messagesError) {
          logger.error('Error fetching messages', { error: messagesError.message, ticketId });
          return { ticket, messages: [] };
        }

        const messagesNeedingRoles = (messages || []).filter((m: any) => !m.sender_type);
        const uniqueSenderIds = Array.from(
          new Set(messagesNeedingRoles.map((m: any) => m.sender_id)),
        );
        const senderRolesMap =
          uniqueSenderIds.length > 0
            ? await batchHasUserRole(uniqueSenderIds, 'support')
            : new Map<string, boolean>();

        const messagesWithSenderType = (messages || []).map((msg: any) => {
          const senderType = resolveSenderType(msg, ticket.user_id, senderRolesMap);

          let attachments = undefined;
          if (msg.attachments) {
            const attArray = Array.isArray(msg.attachments) ? msg.attachments : [msg.attachments];
            if (attArray.length > 0) {
              attachments = attArray.map((att: any) => ({
                id: att.id,
                file_name: att.file_name,
                file_type: att.file_type,
                file_size: att.file_size,
                storage_path: att.storage_path,
                storage_url: att.storage_path
                  ? `/support/files/${encodeURIComponent(att.storage_path)}`
                  : '',
                blur_hash: att.blur_hash,
                width: att.width,
                height: att.height,
              }));
            }
          }

          return { ...msg, sender_type: senderType, attachments };
        });

        return { ticket, messages: messagesWithSenderType };
      }),

    update: supportProcedure
      .input(ticketIdParamSchema.merge(updateTicketBodySchema))
      .mutation(async ({ ctx, input }) => {
        if (!supabaseAdmin) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database error' });
        }

        const user = ctx.user;
        const { ticketId, closeReason } = input;
        let { assignedTo, priority, status } = input;

        if (!isValidUUID(ticketId)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid ticket ID' });
        }

        const { data: currentTicket } = await supabaseAdmin
          .from('support_tickets')
          .select('status, assigned_to, user_id')
          .eq('id', ticketId)
          .single();

        if (!currentTicket) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
        }

        const oldStatus = currentTicket.status;
        const oldAssignedTo = currentTicket.assigned_to;

        if (status && oldStatus !== status) {
          const allowedTransitions: Record<string, string[]> = {
            open: ['pending'],
            pending: ['closed'],
            closed: [],
          };

          if (!(allowedTransitions[oldStatus] || []).includes(status)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: ERROR_INVALID_STATUS_TRANSITION,
            });
          }

          if (status !== 'pending' || oldStatus !== 'open') {
            if (oldAssignedTo !== user.id) {
              throw new TRPCError({ code: 'FORBIDDEN', message: ERROR_TICKET_NOT_ASSIGNED });
            }
          }
        }

        if (assignedTo !== undefined && assignedTo !== oldAssignedTo) {
          if (assignedTo && oldStatus === 'open' && !status) {
            status = 'pending';
          }
          if (!assignedTo && oldStatus === 'pending' && oldAssignedTo !== user.id) {
            throw new TRPCError({ code: 'FORBIDDEN', message: ERROR_TICKET_NOT_ASSIGNED });
          }
        }

        const updateData: Record<string, any> = {};
        if (status && ['open', 'closed', 'pending'].includes(status)) {
          updateData.status = status;
          if (status === 'closed') updateData.closed_at = new Date().toISOString();
          else if (oldStatus === 'closed') updateData.closed_at = null;
        }
        if (assignedTo !== undefined) updateData.assigned_to = assignedTo || null;
        if (priority && ['low', 'normal', 'high', 'urgent'].includes(priority))
          updateData.priority = priority;

        if (Object.keys(updateData).length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No valid update data' });
        }

        const { data: ticket, error } = await supabaseAdmin
          .from('support_tickets')
          .update(updateData)
          .eq('id', ticketId)
          .select(
            `*,
            user:users!support_tickets_user_id_fkey(id, username, user_id),
            assigned_user:users!support_tickets_assigned_to_fkey(id, username, user_id, avatar)`,
          )
          .single();

        if (error) {
          logger.error('Error updating ticket', { error: error.message, ticketId });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update ticket',
          });
        }

        if (ticket) {
          invalidateTicketCaches(ticket.user_id);

          broadcastTicketUpdate(ticketId, {
            id: ticketId,
            status: ticket.status,
            updated_at: ticket.updated_at,
            closed_at: ticket.closed_at || null,
          });

          if (assignedTo !== undefined && assignedTo !== oldAssignedTo) {
            broadcastTicketAssignment(ticketId, assignedTo || null, ticket.assigned_user || null);
          }
        }

        if (status && oldStatus && oldStatus !== status && ticket) {
          let messageText = '';
          if (status === 'pending' && oldStatus === 'open') {
            messageText = 'Ваше обращение приняли в обработку. Ожидайте ответа.';
          } else if (status === 'closed') {
            try {
              const { trackTicketClosed } = await import('@/lib/analytics/support-analytics');
              await trackTicketClosed(ticketId, user.id, status);
            } catch {}

            messageText =
              closeReason && closeReason.trim()
                ? `Ваше обращение было закрыто по причине: ${closeReason.trim()}`
                : 'Ваше обращение было закрыто.';
          } else {
            const statusNames: Record<string, string> = {
              open: 'Открыт',
              pending: 'В работе',
              closed: 'Закрыт',
            };
            messageText = `Статус обращения изменен на [${statusNames[status] || status}]`;
          }

          const { data: statusMessage, error: messageError } = await supabaseAdmin
            .from('support_messages')
            .insert({
              ticket_id: ticketId,
              sender_id: user.id,
              message_text: messageText,
            })
            .select(
              `*, sender:users!support_messages_sender_id_fkey(id, username, user_id, avatar)`,
            )
            .single();

          if (messageError) {
            logger.error('Error creating status change message', {
              error: messageError.message,
              ticketId,
            });
          } else if (statusMessage) {
            broadcastNewMessage(ticketId, statusMessage);
          }
        }

        return { ticket, success: true };
      }),

    sendMessage: protectedProcedure
      .input(ticketIdParamSchema.merge(createMessageBodySchema))
      .mutation(async ({ ctx, input }) => {
        if (!supabaseAdmin) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database error' });
        }

        const user = ctx.user;
        const { ticketId, message, csrfToken, attachments } = input;

        const msgRateResult = await messageRateLimit.checkWithKey(`message:${user.id}`);
        if (!msgRateResult.allowed) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many messages' });
        }

        const cookieStore = await cookies();
        const sessionId = cookieStore.get('session_id')?.value;
        if (sessionId && csrfToken) {
          const csrfValidation = await verifyCSRFToken(csrfToken, sessionId, true);
          if (!csrfValidation.valid) {
            // Логируем причину, но не блокируем отправку сообщения:
            // пользователь уже аутентифицирован, поверх этого есть rate limit.
            logger.warn('CSRF validation failed for support.tickets.sendMessage', {
              userId: user.id,
              sessionId: sessionId.slice(0, 8),
              reason: csrfValidation.reason,
            });
          }
        }

        const isSupport = await hasUserRole(user.id, 'support');

        if (!isValidUUID(ticketId)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid ticket ID' });
        }

        const { data: ticket, error: ticketError } = await supabaseAdmin
          .from('support_tickets')
          .select('id, user_id, status')
          .eq('id', ticketId)
          .single();

        if (ticketError || !ticket) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
        }

        if (!isSupport && ticket.user_id !== user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        if (isSupport && ticket.user_id === user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Сотрудники поддержки не могут отправлять сообщения в свои старые тикеты.',
          });
        }

        if (!isSupport && ticket.status === 'closed') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: ERROR_CANNOT_SEND_TO_CLOSED_TICKET,
          });
        }

        if (isSupport && ticket.status === 'closed') {
          const { data: updatedTicket } = await supabaseAdmin
            .from('support_tickets')
            .update({ status: 'open', closed_at: null })
            .eq('id', ticketId)
            .select('status, updated_at, closed_at')
            .single();

          if (updatedTicket) {
            broadcastTicketUpdate(ticketId, {
              id: ticketId,
              status: updatedTicket.status,
              updated_at: updatedTicket.updated_at,
              closed_at: updatedTicket.closed_at,
            });
          }
        }

        const messageData: {
          ticket_id: string;
          sender_id: string;
          message_text: string;
          sender_type?: 'support' | 'user';
        } = {
          ticket_id: ticketId,
          sender_id: user.id,
          message_text:
            message && typeof message === 'string' && message.trim() ? message.trim() : '',
          sender_type: isSupport ? 'support' : 'user',
        };

        let { data: newMessage, error: messageError } = await supabaseAdmin
          .from('support_messages')
          .insert(messageData)
          .select(`*, sender:users!support_messages_sender_id_fkey(id, username, user_id, avatar)`)
          .single();

        if (
          messageError &&
          (messageError.message?.toLowerCase().includes('sender_type') ||
            messageError.code === '42703' ||
            messageError.code === 'PGRST116')
        ) {
          const { ticket_id, sender_id, message_text } = messageData;
          const fallback = await supabaseAdmin
            .from('support_messages')
            .insert({ ticket_id, sender_id, message_text })
            .select(
              `*, sender:users!support_messages_sender_id_fkey(id, username, user_id, avatar)`,
            )
            .single();
          newMessage = fallback.data;
          messageError = fallback.error;
        }

        if (messageError || !newMessage) {
          logger.error('Error creating message', {
            error: messageError?.message,
            ticketId,
          });
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to send message' });
        }

        let dbAttachments: Array<{
          id: string;
          file_name: string;
          file_type: string;
          file_size: number;
          storage_path: string;
          storage_url: string;
          blur_hash: string | null;
          width: number | null;
          height: number | null;
        }> = [];

        if (attachments && attachments.length > 0) {
          const attachmentRecords = attachments.map((att) => ({
            message_id: newMessage!.id,
            file_name: att.fileName,
            file_type: att.fileType,
            file_size: att.fileSize,
            storage_path: att.storagePath,
            blur_hash: att.blur_hash || null,
            width: att.width || null,
            height: att.height || null,
          }));

          const { data: insertedAtt, error: attError } = await supabaseAdmin
            .from('support_message_attachments')
            .insert(attachmentRecords)
            .select('id, file_name, file_type, file_size, storage_path, blur_hash, width, height');

          if (attError) {
            logger.error('Error creating attachments', {
              error: attError.message,
              messageId: newMessage.id,
            });
          }

          if (insertedAtt && insertedAtt.length > 0) {
            dbAttachments = insertedAtt.map((att) => ({
              ...att,
              storage_url: `/support/files/${encodeURIComponent(att.storage_path)}`,
            }));
          }
        }

        if (newMessage) {
          let senderData = newMessage.sender;
          if (Array.isArray(senderData)) senderData = senderData[0] || undefined;

          const messageForBroadcast = {
            id: newMessage.id,
            ticket_id: newMessage.ticket_id,
            sender_id: newMessage.sender_id,
            sender_type: (isSupport ? 'support' : 'user') as 'user' | 'support',
            message_text: newMessage.message_text || '',
            is_read: newMessage.is_read || false,
            created_at: newMessage.created_at,
            sender: senderData,
            attachments: dbAttachments.length > 0 ? dbAttachments : undefined,
          };

          try {
            const { trackMessageSent } = await import('@/lib/analytics/support-analytics');
            await trackMessageSent(ticketId, newMessage.sender_id, messageForBroadcast.sender_type);
          } catch {}

          try {
            broadcastNewMessage(ticketId, messageForBroadcast);
          } catch (err) {
            logger.error('Error broadcasting new message', {
              error: err instanceof Error ? err.message : 'Unknown error',
              ticketId,
            });
          }

          invalidateTicketCaches(ticket.user_id);
        }

        if (!isSupport) {
          const { data: existingMessages } = await supabaseAdmin
            .from('support_messages')
            .select('sender_id')
            .eq('ticket_id', ticketId)
            .limit(10);

          let hasSupportMessage = false;
          if (existingMessages && existingMessages.length > 0) {
            const senderIds = Array.from(new Set(existingMessages.map((m) => m.sender_id)));
            const rolesMap = await batchHasUserRole(senderIds, 'support');
            for (const m of existingMessages) {
              if (rolesMap.get(m.sender_id)) {
                hasSupportMessage = true;
                break;
              }
            }
          }

          if (!hasSupportMessage) {
            const SYSTEM_MESSAGE_TEXT =
              'Спасибо за ваше обращение. Мы получили ваш запрос и ответим в ближайшее время.';
            const { data: existing } = await supabaseAdmin
              .from('support_messages')
              .select('id')
              .eq('ticket_id', ticketId)
              .eq('message_text', SYSTEM_MESSAGE_TEXT)
              .limit(1);

            if (!existing || existing.length === 0) {
              await supabaseAdmin.from('support_messages').insert({
                ticket_id: ticketId,
                sender_id: user.id,
                message_text: SYSTEM_MESSAGE_TEXT,
              });
            }
          }
        }

        return {
          message: {
            ...newMessage,
            attachments: dbAttachments.length > 0 ? dbAttachments : undefined,
          },
          success: true,
        };
      }),

    markAsRead: protectedProcedure.input(ticketIdParamSchema).mutation(async ({ ctx, input }) => {
      if (!supabaseAdmin) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database error' });
      }

      const user = ctx.user;
      const { ticketId } = input;

      if (!isValidUUID(ticketId)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid ticket ID' });
      }

      const { data: ticket } = await supabaseAdmin
        .from('support_tickets')
        .select('id, user_id')
        .eq('id', ticketId)
        .single();

      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      const isSupport = await hasUserRole(user.id, 'support');
      if (!isSupport && ticket.user_id !== user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const { error } = await supabaseAdmin
        .from('support_messages')
        .update({ is_read: true })
        .eq('ticket_id', ticketId)
        .neq('sender_id', user.id)
        .eq('is_read', false);

      if (error) {
        logger.error('Error marking messages as read', { error: error.message, ticketId });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to mark as read' });
      }

      return { success: true };
    }),
  }),
});
