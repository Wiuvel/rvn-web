import { z } from 'zod';
import { and, eq, desc, lt, sql } from 'drizzle-orm';
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
});
