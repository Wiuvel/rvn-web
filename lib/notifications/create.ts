import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/database/db';
import { notifications } from '@/lib/database/schema';
import { cache } from '@/lib/database/cache';
import { broadcastNotification } from '@/lib/websocket/client';

const CLEANUP_THROTTLE_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_MAX_AGE_DAYS = 30;

async function cleanupOldNotifications(userId: string): Promise<void> {
  const cacheKey = `notif_cleanup:${userId}`;
  if (cache.has(cacheKey)) return;
  cache.set(cacheKey, true, CLEANUP_THROTTLE_MS / 1000);

  try {
    const cutoff = new Date(Date.now() - CLEANUP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    await db!
      .delete(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, true),
          lt(notifications.createdAt, cutoff),
        ),
      );
  } catch {
    // Fire-and-forget
  }
}

interface CreateNotificationParams {
  userId: string;
  type: string;
  title: string;
  message: string;
  relatedTicketId?: string;
}

/**
 * Creates or updates a notification (UPSERT by userId + type + relatedTicketId).
 * If an unread notification exists for the same ticket, increments count.
 * Uses a transaction to prevent race conditions on concurrent calls.
 * Fire-and-forget — never throws.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    const { userId, type, title, message, relatedTicketId } = params;

    let notificationId: string;
    let count = 1;
    let isUpdate = false;

    await db!.transaction(async (tx) => {
      /* UPSERT: check for existing unread notification for this ticket */
      if (relatedTicketId) {
        const existing = await tx
          .select({ id: notifications.id, count: notifications.count })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              eq(notifications.type, type),
              eq(notifications.relatedTicketId, relatedTicketId),
              eq(notifications.isRead, false),
            ),
          )
          .limit(1);

        if (existing[0]) {
          count = existing[0].count + 1;
          await tx
            .update(notifications)
            .set({
              message,
              count,
              createdAt: sql`now()`,
            })
            .where(eq(notifications.id, existing[0].id));

          notificationId = existing[0].id;
          isUpdate = true;
        }
      }

      if (!isUpdate) {
        const result = await tx
          .insert(notifications)
          .values({
            userId,
            type,
            title,
            message,
            relatedTicketId: relatedTicketId ?? null,
          })
          .returning({ id: notifications.id });

        notificationId = result[0]!.id;
      }
    });

    /* Invalidate unreadCount cache */
    cache.delete(`notif_unread:${userId}`);

    /* Real-time delivery via WebSocket */
    broadcastNotification(userId, {
      id: notificationId!,
      type,
      title,
      message,
      is_read: false,
      count,
      related_ticket_id: relatedTicketId ?? null,
      created_at: new Date().toISOString(),
    });

    /* Periodic cleanup of old read notifications */
    cleanupOldNotifications(userId);
  } catch (error) {
    console.error(
      '[notifications] createNotification error:',
      error instanceof Error ? error.message : error,
    );
  }
}
