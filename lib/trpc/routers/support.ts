import { cookies } from 'next/headers';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure, supportProcedure } from '../init';
import { checkAuth } from '@/lib/auth/helper';
import { hasUserRole, batchHasUserRole } from '@/lib/auth/user-roles';
import { db } from '@/lib/database/db';
import {
  supportTickets,
  supportMessages,
  supportMessageAttachments,
  users,
} from '@/lib/database/schema';
import { eq, and, ne, desc, asc, inArray, count, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { messageRateLimit } from '@/lib/security/rate-limit';
import { verifyCSRFToken } from '@/lib/security/csrf';
import {
  broadcastTicketUpdate,
  broadcastTicketAssignment,
  broadcastNewMessage,
} from '@/lib/websocket/client';
import { isValidUUID } from '@/lib/utils/uuid-validation';
import { cached } from '@/lib/database/cache';
import { logger } from '@/lib/utils/secure-logger';
import { createNotification } from '@/lib/notifications/create';
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

/**
 * Shape of a single row returned by every Drizzle ticket-list query in this
 * router. All three call-sites (`tickets.list`, `tickets.byId`, the singleton
 * fetch in `messages.list`) use the same `select({...})` projection, so this
 * one interface covers all of them. Keep the field names in sync with the
 * `select` blocks below.
 *
 * `status` and `priority` are `text` columns at the schema level so Drizzle
 * returns plain `string` (and `string | null` for `priority` due to default).
 */
interface TicketJoinRow {
  id: string;
  userId: string;
  assignedTo: string | null;
  status: string;
  priority: string | null;
  subject: string;
  lastMessageAt: Date;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userName: string | null;
  userUserId: string | null;
  userAvatar: string | null;
  assignedUserName: string | null;
  assignedUserUserId: string | null;
  assignedUserAvatar: string | null;
}

/**
 * `status` and `priority` are runtime-constrained to these unions even though
 * the schema columns are loose `text`. Narrowing here keeps the response type
 * accurate for clients without rewriting every god-component's local type.
 */
type TicketStatus = 'open' | 'closed' | 'pending';
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * tRPC serializes responses with plain `JSON.stringify` (no superjson
 * transformer is configured), so `Date` instances are emitted as ISO strings
 * on the wire and decoded as strings on the client. We do the conversion
 * explicitly here so the response type matches what consumers actually see.
 */
interface RemappedTicket {
  id: string;
  user_id: string;
  assigned_to: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  subject: string;
  last_message_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    username: string;
    user_id: string;
    avatar: string | null;
  } | null;
  assigned_user: {
    id: string;
    username: string;
    user_id: string;
    avatar: string | null;
  } | null;
}

function remapTicketRow(row: TicketJoinRow): RemappedTicket {
  return {
    id: row.id,
    user_id: row.userId,
    assigned_to: row.assignedTo,
    status: row.status as TicketStatus,
    priority: (row.priority ?? 'normal') as TicketPriority,
    subject: row.subject,
    last_message_at: row.lastMessageAt.toISOString(),
    closed_at: row.closedAt ? row.closedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    user: row.userName
      ? {
          id: row.userId,
          username: row.userName,
          user_id: row.userUserId ?? '',
          avatar: row.userAvatar,
        }
      : null,
    assigned_user:
      row.assignedTo && row.assignedUserName
        ? {
            id: row.assignedTo,
            username: row.assignedUserName,
            user_id: row.assignedUserUserId ?? '',
            avatar: row.assignedUserAvatar,
          }
        : null,
  };
}

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
        user_id: user.userId,
        token: currentToken,
        error: 'Database not configured',
      };
    }

    return {
      isAuthenticated: true as const,
      hasSupportAccess,
      username: user.username,
      userId: user.id,
      user_id: user.userId,
      token: currentToken,
    };
  }),

  tickets: router({
    list: protectedProcedure.input(supportTicketsQuerySchema).query(async ({ ctx, input }) => {
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database error' });
      }

      const user = ctx.user;
      const isSupport = await hasUserRole(user.id, 'support');
      const { status, statuses, forUser } = input;

      const cacheKey = `tickets:${user.id}:${isSupport ? 'support' : 'user'}:${status || 'all'}:${forUser ? 'forUser' : 'all'}`;

      const tickets = await cached(
        cacheKey,
        async () => {
          const ticketUser = alias(users, 'ticketUser');
          const assignedUser = alias(users, 'assignedUser');

          const conditions: SQL[] = [];

          if (forUser || !isSupport) {
            conditions.push(eq(supportTickets.userId, user.id));
          }

          if (statuses) {
            const statusArray = statuses
              .split(',')
              .map((s) => s.trim())
              .filter((s) => ['open', 'closed', 'pending'].includes(s));
            if (statusArray.length > 0) {
              conditions.push(inArray(supportTickets.status, statusArray));
            }
          } else if (status && status !== 'all' && ['open', 'closed', 'pending'].includes(status)) {
            conditions.push(eq(supportTickets.status, status));
          }

          const rows = await db!
            .select({
              id: supportTickets.id,
              userId: supportTickets.userId,
              assignedTo: supportTickets.assignedTo,
              status: supportTickets.status,
              priority: supportTickets.priority,
              subject: supportTickets.subject,
              lastMessageAt: supportTickets.lastMessageAt,
              closedAt: supportTickets.closedAt,
              createdAt: supportTickets.createdAt,
              updatedAt: supportTickets.updatedAt,
              // user fields
              userName: ticketUser.username,
              userUserId: ticketUser.userId,
              userAvatar: ticketUser.avatar,
              // assigned user fields
              assignedUserName: assignedUser.username,
              assignedUserUserId: assignedUser.userId,
              assignedUserAvatar: assignedUser.avatar,
            })
            .from(supportTickets)
            .leftJoin(ticketUser, eq(supportTickets.userId, ticketUser.id))
            .leftJoin(assignedUser, eq(supportTickets.assignedTo, assignedUser.id))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(supportTickets.lastMessageAt));

          return rows.map(remapTicketRow);
        },
        30,
      );

      if (!tickets || tickets.length === 0) {
        return { tickets: [] };
      }

      const ticketIds = tickets.map((t) => t.id);
      const lastMessagesMap = await resolveLastMessagesForTickets(
        ticketIds,
        tickets.map((t) => ({ id: t.id, userId: t.user_id })),
      );

      const ticketsWithLastMessage = tickets.map((ticket) => ({
        ...ticket,
        last_message: lastMessagesMap[ticket.id] || null,
      }));

      return { tickets: ticketsWithLastMessage };
    }),

    create: protectedProcedure.input(createTicketBodySchema).mutation(async ({ ctx, input }) => {
      if (!db) {
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

      const [countResult] = await db
        .select({ count: count() })
        .from(supportTickets)
        .where(
          and(
            eq(supportTickets.userId, user.id),
            inArray(supportTickets.status, ['open', 'pending']),
          ),
        );

      if (countResult && (countResult.count || 0) >= MAX_TICKETS_PER_USER) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: ERROR_MAXIMUM_TICKET_LIMIT_REACHED });
      }

      let ticketId: string;
      try {
        const result = await db.transaction(async (tx) => {
          const [ticket] = await tx
            .insert(supportTickets)
            .values({
              userId: user.id,
              subject,
              status: 'open',
            })
            .returning({ id: supportTickets.id, createdAt: supportTickets.createdAt });

          const [msg] = await tx
            .insert(supportMessages)
            .values({
              ticketId: ticket.id,
              senderId: user.id,
              messageText: message,
              senderType: 'user',
            })
            .returning({ id: supportMessages.id, createdAt: supportMessages.createdAt });

          return {
            ticketId: ticket.id,
            ticketCreatedAt: ticket.createdAt,
            messageId: msg.id,
            messageCreatedAt: msg.createdAt,
          };
        });

        ticketId = result.ticketId;
      } catch (err) {
        logger.error('Error creating ticket', {
          error: err instanceof Error ? err.message : 'Unknown error',
          userId: user.id,
        });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create ticket' });
      }

      // Fetch the created ticket with user info
      const ticketUser = alias(users, 'ticketUser');
      const ticketRows = await db
        .select({
          id: supportTickets.id,
          userId: supportTickets.userId,
          assignedTo: supportTickets.assignedTo,
          status: supportTickets.status,
          priority: supportTickets.priority,
          subject: supportTickets.subject,
          lastMessageAt: supportTickets.lastMessageAt,
          closedAt: supportTickets.closedAt,
          createdAt: supportTickets.createdAt,
          updatedAt: supportTickets.updatedAt,
          userName: ticketUser.username,
          userUserId: ticketUser.userId,
          userAvatar: ticketUser.avatar,
        })
        .from(supportTickets)
        .leftJoin(ticketUser, eq(supportTickets.userId, ticketUser.id))
        .where(eq(supportTickets.id, ticketId));

      const ticket = ticketRows[0];
      if (!ticket) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch created ticket',
        });
      }

      const mappedTicket = {
        id: ticket.id,
        user_id: ticket.userId,
        assigned_to: ticket.assignedTo,
        status: ticket.status,
        priority: ticket.priority,
        subject: ticket.subject,
        last_message_at: ticket.lastMessageAt,
        closed_at: ticket.closedAt,
        created_at: ticket.createdAt,
        updated_at: ticket.updatedAt,
        user: ticket.userName
          ? {
              id: ticket.userId,
              username: ticket.userName,
              user_id: ticket.userUserId,
              avatar: ticket.userAvatar,
            }
          : null,
      };

      invalidateTicketCaches(user.id);

      try {
        const { trackTicketCreated, trackMessageSent } =
          await import('@/lib/analytics/support-analytics');
        await Promise.all([
          trackTicketCreated(mappedTicket.id, user.id, mappedTicket.status),
          trackMessageSent(mappedTicket.id, user.id, 'user'),
        ]);
      } catch {}

      return { ticket: mappedTicket, success: true };
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
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database error' });
        }

        const user = ctx.user;
        const isSupport = await hasUserRole(user.id, 'support');
        const { ticketId, limit, offset } = input;

        if (!isValidUUID(ticketId)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid ticket ID' });
        }

        // Fetch ticket with user and assigned_user
        const ticketUser = alias(users, 'ticketUser');
        const assignedUser = alias(users, 'assignedUser');

        const ticketRows = await db
          .select({
            id: supportTickets.id,
            userId: supportTickets.userId,
            assignedTo: supportTickets.assignedTo,
            status: supportTickets.status,
            priority: supportTickets.priority,
            subject: supportTickets.subject,
            lastMessageAt: supportTickets.lastMessageAt,
            closedAt: supportTickets.closedAt,
            createdAt: supportTickets.createdAt,
            updatedAt: supportTickets.updatedAt,
            userName: ticketUser.username,
            userUserId: ticketUser.userId,
            userAvatar: ticketUser.avatar,
            assignedUserName: assignedUser.username,
            assignedUserUserId: assignedUser.userId,
            assignedUserAvatar: assignedUser.avatar,
          })
          .from(supportTickets)
          .leftJoin(ticketUser, eq(supportTickets.userId, ticketUser.id))
          .leftJoin(assignedUser, eq(supportTickets.assignedTo, assignedUser.id))
          .where(eq(supportTickets.id, ticketId));

        const ticketRow = ticketRows[0];
        if (!ticketRow) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
        }

        const ticket = remapTicketRow(ticketRow);

        if (!isSupport && ticket.user_id !== user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        // Fetch messages with sender
        const messageRows = await db
          .select({
            id: supportMessages.id,
            ticketId: supportMessages.ticketId,
            senderId: supportMessages.senderId,
            messageText: supportMessages.messageText,
            senderType: supportMessages.senderType,
            isRead: supportMessages.isRead,
            createdAt: supportMessages.createdAt,
            senderUsername: users.username,
            senderUserId: users.userId,
            senderAvatar: users.avatar,
          })
          .from(supportMessages)
          .leftJoin(users, eq(supportMessages.senderId, users.id))
          .where(eq(supportMessages.ticketId, ticketId))
          .orderBy(asc(supportMessages.createdAt))
          .limit(limit)
          .offset(offset);

        // Fetch attachments for all messages
        const messageIds = messageRows.map((m) => m.id);
        const allAttachments =
          messageIds.length > 0
            ? await db
                .select()
                .from(supportMessageAttachments)
                .where(inArray(supportMessageAttachments.messageId, messageIds))
            : [];

        const attachmentsByMessageId = new Map<string, typeof allAttachments>();
        for (const att of allAttachments) {
          const list = attachmentsByMessageId.get(att.messageId) || [];
          list.push(att);
          attachmentsByMessageId.set(att.messageId, list);
        }

        const messagesNeedingRoles = messageRows.filter((m) => !m.senderType);
        const uniqueSenderIds = Array.from(new Set(messagesNeedingRoles.map((m) => m.senderId)));
        const senderRolesMap =
          uniqueSenderIds.length > 0
            ? await batchHasUserRole(uniqueSenderIds, 'support')
            : new Map<string, boolean>();

        const messagesWithSenderType = messageRows.map((msg) => {
          const senderType = resolveSenderType(
            { sender_id: msg.senderId, sender_type: msg.senderType },
            ticket.user_id,
            senderRolesMap,
          );

          const msgAttachments = attachmentsByMessageId.get(msg.id);
          let attachments = undefined;
          if (msgAttachments && msgAttachments.length > 0) {
            attachments = msgAttachments.map((att) => ({
              id: att.id,
              file_name: att.fileName,
              file_type: att.fileType,
              file_size: att.fileSize,
              storage_path: att.storagePath,
              storage_url: att.storagePath
                ? `/support/files/${encodeURIComponent(att.storagePath)}`
                : '',
              blur_hash: att.blurHash,
              width: att.width,
              height: att.height,
            }));
          }

          return {
            id: msg.id,
            ticket_id: msg.ticketId,
            sender_id: msg.senderId,
            message_text: msg.messageText,
            sender_type: senderType,
            is_read: msg.isRead,
            created_at: msg.createdAt,
            sender: msg.senderUsername
              ? {
                  id: msg.senderId,
                  username: msg.senderUsername,
                  user_id: msg.senderUserId,
                  avatar: msg.senderAvatar,
                }
              : null,
            attachments,
          };
        });

        return { ticket, messages: messagesWithSenderType };
      }),

    update: supportProcedure
      .input(ticketIdParamSchema.merge(updateTicketBodySchema))
      .mutation(async ({ ctx, input }) => {
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database error' });
        }

        const user = ctx.user;
        const { ticketId, closeReason } = input;
        let { assignedTo, priority, status } = input;

        if (!isValidUUID(ticketId)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid ticket ID' });
        }

        const currentTicketRows = await db
          .select({
            status: supportTickets.status,
            assignedTo: supportTickets.assignedTo,
            userId: supportTickets.userId,
          })
          .from(supportTickets)
          .where(eq(supportTickets.id, ticketId));

        const currentTicket = currentTicketRows[0];
        if (!currentTicket) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
        }

        const oldStatus = currentTicket.status;
        const oldAssignedTo = currentTicket.assignedTo;

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
          if (status === 'closed') updateData.closedAt = new Date().toISOString();
          else if (oldStatus === 'closed') updateData.closedAt = null;
        }
        if (assignedTo !== undefined) updateData.assignedTo = assignedTo || null;
        if (priority && ['low', 'normal', 'high', 'urgent'].includes(priority))
          updateData.priority = priority;

        if (Object.keys(updateData).length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No valid update data' });
        }

        // Update ticket and fetch with joins
        let updatedTicketRows;
        try {
          await db.update(supportTickets).set(updateData).where(eq(supportTickets.id, ticketId));

          const ticketUserAlias = alias(users, 'ticketUser');
          const assignedUserAlias = alias(users, 'assignedUser');

          updatedTicketRows = await db
            .select({
              id: supportTickets.id,
              userId: supportTickets.userId,
              assignedTo: supportTickets.assignedTo,
              status: supportTickets.status,
              priority: supportTickets.priority,
              subject: supportTickets.subject,
              lastMessageAt: supportTickets.lastMessageAt,
              closedAt: supportTickets.closedAt,
              createdAt: supportTickets.createdAt,
              updatedAt: supportTickets.updatedAt,
              userName: ticketUserAlias.username,
              userUserId: ticketUserAlias.userId,
              userAvatar: ticketUserAlias.avatar,
              assignedUserName: assignedUserAlias.username,
              assignedUserUserId: assignedUserAlias.userId,
              assignedUserAvatar: assignedUserAlias.avatar,
            })
            .from(supportTickets)
            .leftJoin(ticketUserAlias, eq(supportTickets.userId, ticketUserAlias.id))
            .leftJoin(assignedUserAlias, eq(supportTickets.assignedTo, assignedUserAlias.id))
            .where(eq(supportTickets.id, ticketId));
        } catch (err) {
          logger.error('Error updating ticket', {
            error: err instanceof Error ? err.message : 'Unknown error',
            ticketId,
          });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update ticket',
          });
        }

        const ticketRow = updatedTicketRows[0];
        const ticket = ticketRow ? remapTicketRow(ticketRow) : null;

        if (ticket) {
          invalidateTicketCaches(ticket.user_id);

          broadcastTicketUpdate(ticketId, {
            id: ticketId,
            status: ticket.status,
            updated_at: ticket.updated_at,
            closed_at: ticket.closed_at,
          });

          /* Notify ticket owner on status change (support-initiated only) */
          if (status && oldStatus !== status && ticket.user_id !== user.id) {
            const subjectPreview =
              ticket.subject.length > 60 ? ticket.subject.slice(0, 60) + '…' : ticket.subject;
            const statusConfig: Record<string, { title: string; message: string }> = {
              pending: {
                title: `Тикет в обработке «${subjectPreview}»`,
                message: 'Ваше обращение приняли в обработку',
              },
              closed: {
                title: `Тикет закрыт «${subjectPreview}»`,
                message: 'Ваше обращение было закрыто',
              },
            };
            const config = statusConfig[status];
            if (config) {
              createNotification({
                userId: ticket.user_id,
                type: 'ticket_status',
                title: config.title,
                message: config.message,
                relatedTicketId: ticketId,
              });
            }
          }

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

          try {
            const [statusMessage] = await db!
              .insert(supportMessages)
              .values({
                ticketId,
                senderId: user.id,
                messageText,
              })
              .returning();

            if (statusMessage) {
              // Fetch sender info for broadcast
              const senderRows = await db!
                .select({
                  id: users.id,
                  username: users.username,
                  userId: users.userId,
                  avatar: users.avatar,
                })
                .from(users)
                .where(eq(users.id, user.id));

              const sender = senderRows[0] || null;

              broadcastNewMessage(ticketId, {
                id: statusMessage.id,
                ticket_id: statusMessage.ticketId,
                sender_id: statusMessage.senderId,
                sender_type: 'support' as const,
                message_text: statusMessage.messageText,
                is_read: statusMessage.isRead,
                created_at:
                  statusMessage.createdAt instanceof Date
                    ? statusMessage.createdAt.toISOString()
                    : statusMessage.createdAt,
                sender: sender
                  ? {
                      id: sender.id,
                      username: sender.username,
                      user_id: sender.userId,
                      avatar: sender.avatar,
                    }
                  : undefined,
              });
            }
          } catch (err) {
            logger.error('Error creating status change message', {
              error: err instanceof Error ? err.message : 'Unknown error',
              ticketId,
            });
          }
        }

        return { ticket, success: true };
      }),

    sendMessage: protectedProcedure
      .input(ticketIdParamSchema.merge(createMessageBodySchema))
      .mutation(async ({ ctx, input }) => {
        if (!db) {
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

        const ticketRows = await db
          .select({
            id: supportTickets.id,
            userId: supportTickets.userId,
            status: supportTickets.status,
            subject: supportTickets.subject,
          })
          .from(supportTickets)
          .where(eq(supportTickets.id, ticketId));

        const ticket = ticketRows[0];
        if (!ticket) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
        }

        if (!isSupport && ticket.userId !== user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        if (isSupport && ticket.userId === user.id) {
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
          const updatedRows = await db
            .update(supportTickets)
            .set({ status: 'open', closedAt: null })
            .where(eq(supportTickets.id, ticketId))
            .returning({
              status: supportTickets.status,
              updatedAt: supportTickets.updatedAt,
              closedAt: supportTickets.closedAt,
            });

          const updatedTicket = updatedRows[0];
          if (updatedTicket) {
            broadcastTicketUpdate(ticketId, {
              id: ticketId,
              status: updatedTicket.status as 'open' | 'closed' | 'pending',
              updated_at:
                updatedTicket.updatedAt instanceof Date
                  ? updatedTicket.updatedAt.toISOString()
                  : updatedTicket.updatedAt,
              closed_at:
                updatedTicket.closedAt instanceof Date
                  ? updatedTicket.closedAt.toISOString()
                  : (updatedTicket.closedAt ?? null),
            });
          }
        }

        const messageText =
          message && typeof message === 'string' && message.trim() ? message.trim() : '';

        let newMessage;
        try {
          const [inserted] = await db
            .insert(supportMessages)
            .values({
              ticketId,
              senderId: user.id,
              messageText,
              senderType: isSupport ? 'support' : 'user',
            })
            .returning();
          newMessage = inserted;
        } catch {
          // Fallback: try without senderType if column issue
          try {
            const [inserted] = await db
              .insert(supportMessages)
              .values({
                ticketId,
                senderId: user.id,
                messageText,
              })
              .returning();
            newMessage = inserted;
          } catch (fallbackErr) {
            logger.error('Error creating message', {
              error: fallbackErr instanceof Error ? fallbackErr.message : 'Unknown error',
              ticketId,
            });
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to send message',
            });
          }
        }

        if (!newMessage) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to send message' });
        }

        // Fetch sender info
        const senderRows = await db
          .select({
            id: users.id,
            username: users.username,
            userId: users.userId,
            avatar: users.avatar,
          })
          .from(users)
          .where(eq(users.id, user.id));

        const senderData = senderRows[0] || null;

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
            messageId: newMessage!.id,
            fileName: att.fileName,
            fileType: att.fileType,
            fileSize: att.fileSize,
            storagePath: att.storagePath,
            blurHash: att.blur_hash || null,
            width: att.width || null,
            height: att.height || null,
          }));

          try {
            const insertedAtt = await db
              .insert(supportMessageAttachments)
              .values(attachmentRecords)
              .returning({
                id: supportMessageAttachments.id,
                fileName: supportMessageAttachments.fileName,
                fileType: supportMessageAttachments.fileType,
                fileSize: supportMessageAttachments.fileSize,
                storagePath: supportMessageAttachments.storagePath,
                blurHash: supportMessageAttachments.blurHash,
                width: supportMessageAttachments.width,
                height: supportMessageAttachments.height,
              });

            if (insertedAtt && insertedAtt.length > 0) {
              dbAttachments = insertedAtt.map((att) => ({
                id: att.id,
                file_name: att.fileName,
                file_type: att.fileType,
                file_size: att.fileSize,
                storage_path: att.storagePath,
                storage_url: `/support/files/${encodeURIComponent(att.storagePath)}`,
                blur_hash: att.blurHash,
                width: att.width,
                height: att.height,
              }));
            }
          } catch (attErr) {
            logger.error('Error creating attachments', {
              error: attErr instanceof Error ? attErr.message : 'Unknown error',
              messageId: newMessage.id,
            });
          }
        }

        if (newMessage) {
          const messageForBroadcast = {
            id: newMessage.id,
            ticket_id: newMessage.ticketId,
            sender_id: newMessage.senderId,
            sender_type: (isSupport ? 'support' : 'user') as 'user' | 'support',
            message_text: newMessage.messageText || '',
            is_read: newMessage.isRead || false,
            created_at:
              newMessage.createdAt instanceof Date
                ? newMessage.createdAt.toISOString()
                : newMessage.createdAt,
            sender: senderData
              ? {
                  id: senderData.id,
                  username: senderData.username,
                  user_id: senderData.userId,
                  avatar: senderData.avatar,
                }
              : undefined,
            attachments: dbAttachments.length > 0 ? dbAttachments : undefined,
          };

          try {
            const { trackMessageSent } = await import('@/lib/analytics/support-analytics');
            await trackMessageSent(ticketId, newMessage.senderId, messageForBroadcast.sender_type);
          } catch {}

          try {
            broadcastNewMessage(ticketId, messageForBroadcast);
          } catch (err) {
            logger.error('Error broadcasting new message', {
              error: err instanceof Error ? err.message : 'Unknown error',
              ticketId,
            });
          }

          /* Notify ticket owner on support reply */
          if (isSupport && ticket.userId !== user.id) {
            const subjectPreview =
              ticket.subject.length > 60 ? ticket.subject.slice(0, 60) + '…' : ticket.subject;
            createNotification({
              userId: ticket.userId,
              type: 'support_reply',
              title: `Новый ответ в тикете «${subjectPreview}»`,
              message: 'Поддержка ответила на ваше обращение',
              relatedTicketId: ticketId,
            });
          }

          invalidateTicketCaches(ticket.userId);
        }

        if (!isSupport) {
          const existingMessages = await db
            .select({ senderId: supportMessages.senderId })
            .from(supportMessages)
            .where(eq(supportMessages.ticketId, ticketId))
            .limit(10);

          let hasSupportMessage = false;
          if (existingMessages && existingMessages.length > 0) {
            const senderIds = Array.from(new Set(existingMessages.map((m) => m.senderId)));
            const rolesMap = await batchHasUserRole(senderIds, 'support');
            for (const m of existingMessages) {
              if (rolesMap.get(m.senderId)) {
                hasSupportMessage = true;
                break;
              }
            }
          }

          if (!hasSupportMessage) {
            const SYSTEM_MESSAGE_TEXT =
              'Спасибо за ваше обращение. Мы получили ваш запрос и ответим в ближайшее время.';
            const existing = await db
              .select({ id: supportMessages.id })
              .from(supportMessages)
              .where(
                and(
                  eq(supportMessages.ticketId, ticketId),
                  eq(supportMessages.messageText, SYSTEM_MESSAGE_TEXT),
                ),
              )
              .limit(1);

            if (!existing || existing.length === 0) {
              await db.insert(supportMessages).values({
                ticketId,
                senderId: user.id,
                messageText: SYSTEM_MESSAGE_TEXT,
              });
            }
          }
        }

        return {
          message: {
            id: newMessage.id,
            ticket_id: newMessage.ticketId,
            sender_id: newMessage.senderId,
            message_text: newMessage.messageText,
            sender_type: (isSupport ? 'support' : 'user') as 'user' | 'support',
            is_read: newMessage.isRead,
            created_at: newMessage.createdAt,
            sender: senderData
              ? {
                  id: senderData.id,
                  username: senderData.username,
                  user_id: senderData.userId,
                  avatar: senderData.avatar,
                }
              : undefined,
            attachments: dbAttachments.length > 0 ? dbAttachments : undefined,
          },
          success: true,
        };
      }),

    markAsRead: protectedProcedure.input(ticketIdParamSchema).mutation(async ({ ctx, input }) => {
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database error' });
      }

      const user = ctx.user;
      const { ticketId } = input;

      if (!isValidUUID(ticketId)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid ticket ID' });
      }

      const ticketRows = await db
        .select({ id: supportTickets.id, userId: supportTickets.userId })
        .from(supportTickets)
        .where(eq(supportTickets.id, ticketId));

      const ticket = ticketRows[0];
      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      const isSupport = await hasUserRole(user.id, 'support');
      if (!isSupport && ticket.userId !== user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      try {
        await db
          .update(supportMessages)
          .set({ isRead: true })
          .where(
            and(
              eq(supportMessages.ticketId, ticketId),
              ne(supportMessages.senderId, user.id),
              eq(supportMessages.isRead, false),
            ),
          );
      } catch (err) {
        logger.error('Error marking messages as read', {
          error: err instanceof Error ? err.message : 'Unknown error',
          ticketId,
        });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to mark as read' });
      }

      return { success: true };
    }),
  }),
});
