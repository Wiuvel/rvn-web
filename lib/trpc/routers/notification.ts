import { z } from 'zod';
import { and, eq, desc, lt, sql, inArray } from 'drizzle-orm';
import { router, protectedProcedure } from '../init';
import { db } from '@/lib/database/db';
import { notifications } from '@/lib/database/schema';
import { cache, cached } from '@/lib/database/cache';

export const notificationRouter = router({
  /** Paginated notification list (cursor-based, ordered by createdAt DESC) */
  list: protectedProcedure
    .input(
      z.object({
        cursor: z.string().uuid().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit } = input;

      const conditions = [eq(notifications.userId, ctx.user.id)];

      if (cursor) {
        /* Resolve cursor createdAt for keyset pagination */
        const cursorRow = await db!
          .select({ createdAt: notifications.createdAt })
          .from(notifications)
          .where(eq(notifications.id, cursor))
          .limit(1);

        if (cursorRow[0]) {
          conditions.push(lt(notifications.createdAt, cursorRow[0].createdAt));
        }
      }

      const items = await db!
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(limit + 1);

      let nextCursor: string | null = null;
      if (items.length > limit) {
        const next = items.pop()!;
        nextCursor = next.id;
      }

      return { items, nextCursor };
    }),

  /** Unread notification count (cached 10s in-memory) */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await cached(
      `notif_unread:${ctx.user.id}`,
      async () => {
        const result = await db!
          .select({ count: sql<number>`count(*)::int` })
          .from(notifications)
          .where(and(eq(notifications.userId, ctx.user.id), eq(notifications.isRead, false)));
        return result[0]?.count ?? 0;
      },
      10,
    );

    return { count };
  }),

  /** Mark a single notification as read */
  markRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db!
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id)));

      cache.delete(`notif_unread:${ctx.user.id}`);
      return { success: true };
    }),

  /** Mark all unread notifications as read */
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await db!
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, ctx.user.id), eq(notifications.isRead, false)));

    cache.delete(`notif_unread:${ctx.user.id}`);
    return { success: true };
  }),

  /** Mark all unread notifications for a specific ticket as read */
  markGroupRead: protectedProcedure
    .input(z.object({ relatedTicketId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db!
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.userId, ctx.user.id),
            eq(notifications.relatedTicketId, input.relatedTicketId),
            eq(notifications.isRead, false),
          ),
        );

      cache.delete(`notif_unread:${ctx.user.id}`);
      return { success: true };
    }),

  /** Notifications grouped by ticket with cursor pagination */
  groupedList: protectedProcedure
    .input(
      z.object({
        cursor: z.string().datetime().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit } = input;
      const userId = ctx.user.id;
      const ITEMS_PER_GROUP = 50;

      /* Phase 1: group summaries via raw SQL */
      const cursorCondition = cursor
        ? sql`HAVING MAX(n.created_at) < ${cursor}::timestamptz`
        : sql``;

      const groupRows = await db!.execute<{
        related_ticket_id: string | null;
        ticket_subject: string | null;
        unread_count: number;
        total_count: number;
        latest_at: string;
      }>(sql`
        SELECT
          n.related_ticket_id,
          st.subject AS ticket_subject,
          COUNT(*) FILTER (WHERE n.is_read = false)::int AS unread_count,
          COUNT(*)::int AS total_count,
          MAX(n.created_at) AS latest_at
        FROM notifications n
        LEFT JOIN support_tickets st ON st.id = n.related_ticket_id
        WHERE n.user_id = ${userId}
        GROUP BY n.related_ticket_id, st.subject
        ${cursorCondition}
        ORDER BY latest_at DESC
        LIMIT ${limit + 1}
      `);

      const rows = Array.isArray(groupRows) ? groupRows : ((groupRows as any).rows ?? []);

      let nextCursor: string | null = null;
      if (rows.length > limit) {
        const last = rows.pop()!;
        nextCursor = last.latest_at;
      }

      if (rows.length === 0) {
        return { groups: [], nextCursor: null };
      }

      /* Phase 2: fetch recent items for returned groups (capped per group) */
      const ticketIds = rows
        .map((r: { related_ticket_id: string | null }) => r.related_ticket_id)
        .filter((id: string | null): id is string => id !== null);

      let items: (typeof notifications.$inferSelect)[] = [];
      if (ticketIds.length > 0) {
        items = await db!
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              inArray(notifications.relatedTicketId, ticketIds),
            ),
          )
          .orderBy(desc(notifications.createdAt))
          .limit(ticketIds.length * ITEMS_PER_GROUP);
      }

      /* Also fetch items with NULL relatedTicketId if any group has it */
      const hasNullGroup = rows.some(
        (r: { related_ticket_id: string | null }) => r.related_ticket_id === null,
      );
      if (hasNullGroup) {
        const nullItems = await db!
          .select()
          .from(notifications)
          .where(
            and(eq(notifications.userId, userId), sql`${notifications.relatedTicketId} IS NULL`),
          )
          .orderBy(desc(notifications.createdAt))
          .limit(ITEMS_PER_GROUP);
        items = [...items, ...nullItems];
      }

      /* Assemble groups */
      const itemsByTicket = new Map<string, typeof items>();
      for (const item of items) {
        const key = item.relatedTicketId ?? '__null__';
        if (!itemsByTicket.has(key)) itemsByTicket.set(key, []);
        itemsByTicket.get(key)!.push(item);
      }

      const groups = rows.map(
        (row: {
          related_ticket_id: string | null;
          ticket_subject: string | null;
          unread_count: number;
          total_count: number;
          latest_at: string;
        }) => ({
          relatedTicketId: row.related_ticket_id,
          ticketSubject: row.ticket_subject,
          unreadCount: row.unread_count,
          totalCount: row.total_count,
          latestAt: row.latest_at,
          items: (itemsByTicket.get(row.related_ticket_id ?? '__null__') ?? []).map((item) => ({
            id: item.id,
            type: item.type,
            title: item.title,
            message: item.message,
            isRead: item.isRead,
            count: item.count,
            createdAt: item.createdAt.toISOString(),
          })),
        }),
      );

      return { groups, nextCursor };
    }),
});
