# Notification Types

> **[Русская версия](types.md)**

## Overview

In-app notifications are a single-table system: every notification is a row in `notifications` keyed by `(userId, type, relatedTicketId, isRead)`. The same row can represent N events thanks to UPSERT-with-counter — there is no separate "events" table or per-event log.

A row has only one mutable boolean (`isRead`) and one mutable counter (`count`). Repeated events on the same ticket bump the counter instead of inserting new rows; this keeps the unread badge accurate without flooding the DB.

## Schema

```ts
notifications {
  id              uuid PK
  user_id         uuid FK users(id) ON DELETE CASCADE
  type            text          -- discriminator (see catalog below)
  title           text          -- pre-rendered title
  message         text          -- pre-rendered message
  is_read         boolean       -- default false
  count           integer       -- default 1, incremented by UPSERT
  related_ticket_id uuid?       -- FK support_tickets(id) ON DELETE CASCADE
  created_at      timestamptz   -- bumped to now() on every UPSERT increment
}

-- Indexes:
-- idx_notifications_user_id (user_id)
-- idx_notifications_user_unread (user_id, is_read) WHERE is_read = false
-- idx_notifications_created_at (created_at)
```

`title` and `message` are stored as final localized strings — there is no template system. The producer formats the strings before calling `createNotification`.

## Type Catalog

The `type` column is a free-form string discriminator. Active producers in the codebase:

| `type` | Producer | Trigger | `relatedTicketId` |
|--------|----------|---------|-------------------|
| `ticket_status` | `lib/trpc/routers/support.ts` (admin/support `updateTicket`) | Status transition: `closed`, `in_progress`, `waiting_user`, etc. | yes |
| `support_reply` | `lib/trpc/routers/support.ts` (sendMessage when sender is support) | Support agent posts a reply on behalf of a user | yes |

Both currently target `userId = ticket.userId` (the ticket owner). Adding a new type is just a matter of calling `createNotification({ type: 'my_event', … })` from a new place — no schema migration is needed.

The catalog is intentionally narrow: notifications are for events that the user expects to come back to inside the app. Marketing or one-off broadcasts go through the WebSocket `system:notification` event instead and do not create a row.

## UPSERT Grouping

`lib/notifications/create.ts → createNotification(params)`:

```
BEGIN TRANSACTION
  IF relatedTicketId is set:
    SELECT id, count
      FROM notifications
      WHERE user_id = $1
        AND type = $2
        AND related_ticket_id = $3
        AND is_read = false
      LIMIT 1
    IF FOUND:
      UPDATE notifications
        SET message = $newMessage,
            count = existing.count + 1,
            created_at = now()
        WHERE id = existing.id
      → reuse existing.id
    ELSE:
      INSERT new row → returning id
  ELSE:
    INSERT new row → returning id
COMMIT
```

Important properties:

- **Unread is sticky**: once the user opens a notification (`markRead`), the next event creates a fresh row instead of incrementing the closed one. So `count` always represents "events since the user last read this ticket".
- **Title is frozen**: only `message` is updated on increment, so the row keeps the original title (e.g. `Тикет закрыт «…»`) while the message can carry the latest body. This avoids confusing flicker in the UI.
- **`created_at` is bumped to now()** on every increment so the notification floats back to the top of the list.
- **Atomicity**: the SELECT + UPDATE/INSERT runs inside `db.transaction()` to avoid two concurrent producers creating duplicate rows for the same `(userId, type, relatedTicketId)`.
- **Fire-and-forget**: any error is caught and logged but never bubbles out — the producing endpoint (e.g. `sendMessage`) must not fail because of a notification glitch.

If `relatedTicketId` is not provided, the UPSERT is skipped and a fresh row is inserted every time. None of the current producers do this, but future "global" notifications could (e.g. account-level events).

## Real-Time Delivery

After the DB write, `createNotification` calls `broadcastNotification(userId, payload)` (`lib/websocket/client.ts`). The WS server emits `support:notification` to the user's room with:

```ts
WsNotificationPayload {
  id: string;
  type: string;                  // mirrors notifications.type
  title: string;
  message: string;
  is_read: false;                // always false at delivery time
  count: number;                 // post-UPSERT count
  related_ticket_id: string | null;
  created_at: string;            // ISO-8601
}
```

If the WS server is unreachable, the call is swallowed silently — the notification is still in the DB and the user will pick it up on the next `notification.list` query. There is no retry queue.

The WS server also exposes `system:notification` (typed as `BroadcastSystemPayload { message, type: 'info' | 'warning' | 'error' }`) for transient banner-style notices. Those do not touch the `notifications` table.

## Reading

`lib/trpc/routers/notification.ts` provides:

| Procedure | Purpose |
|-----------|---------|
| `notification.list` | Cursor-paginated raw list, newest first. Cursor is the last row's `id`; the server resolves `id → createdAt` for keyset pagination. |
| `notification.groupedList` | Same data grouped by `relatedTicketId` (with `unread_count`, `total_count`, `latest_at`, latest 5 items per group). Cursor is `latest_at`. |
| `notification.unreadCount` | `{ count }`, cached for 10 seconds in `lib/database/cache.ts`. Cache is invalidated on every write. |
| `notification.markRead` | Marks a single notification read. |
| `notification.markGroupRead` | Marks every unread notification for a given `relatedTicketId` read in one statement. Used by the bell when a user opens the ticket. |
| `notification.markAllRead` | Marks all unread notifications read. Used by "Mark all read" in the bell. |

All procedures invalidate `notif_unread:<userId>` so the badge updates instantly on the next `unreadCount` poll.

## Cleanup Policy

Read notifications older than 30 days are deleted opportunistically: `cleanupOldNotifications(userId)` runs from `createNotification` whenever a new row is written, but is throttled by an in-memory cache (`notif_cleanup:<userId>`, 1-hour TTL) so concurrent writers don't all run the same DELETE.

```ts
DELETE FROM notifications
WHERE user_id = $1
  AND is_read = true
  AND created_at < now() - interval '30 days'
```

Unread notifications are never auto-cleaned — they stay until the user reads them.

## Files

- `lib/notifications/create.ts` — `createNotification(params)`, `cleanupOldNotifications(userId)`.
- `lib/trpc/routers/notification.ts` — `list`, `groupedList`, `unreadCount`, `markRead`, `markGroupRead`, `markAllRead`.
- `lib/database/schema.ts` — `notifications` table + indexes.
- `lib/websocket/types.ts` — `WsNotificationPayload`, `BroadcastSystemPayload`.
- `lib/websocket/client.ts` — `broadcastNotification(userId, payload)`.
- Producers: `lib/trpc/routers/support.ts` (search `createNotification(`).
