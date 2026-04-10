# Notification System

> **[Русская версия](notifications.md)**

## Overview

The notification system informs users about events in support tickets: replies from support, status changes. Notifications are delivered in real-time via WebSocket and available through an API with cursor-based pagination.

```
┌──────────────┐    notification:new   ┌─────────────────────┐
│   Browser    │◄──────────────────────│  rvn-socketio-server│
│  (dropdown   │   WebSocket push      │  user:{userId} room │
│   + page)    │                       └────────┬────────────┘
└──────┬───────┘                                │
       │                                        │ POST /broadcast/
       │  tRPC queries                          │ notification
       ▼                                        │
┌──────────────┐  createNotification()  ┌───────┴────────────┐
│   rvn-web    │───────────────────────►│  rvn-web           │
│  tRPC router │   UPSERT + broadcast   │  support.ts        │
└──────────────┘                        └────────────────────┘
```

## Architecture

### Database

Table `notifications`:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → users.id |
| `type` | TEXT | Type: `support_reply`, `ticket_status` |
| `title` | TEXT | Title |
| `message` | TEXT | Notification text |
| `is_read` | BOOLEAN | Read status |
| `count` | INTEGER | Grouped message count |
| `related_ticket_id` | UUID | FK → support_tickets.id |
| `created_at` | TIMESTAMPTZ | Creation/update time |

**Indexes:**
- `idx_notifications_user_id` — by user_id
- `idx_notifications_user_unread` — partial (user_id, is_read) WHERE is_read = false
- `idx_notifications_created_at` — by time

### Grouping (UPSERT)

To avoid creating a separate notification for each support message:

1. On creation, check: is there an unread notification with the same `userId + type + relatedTicketId`?
2. **Yes** — UPDATE: update `message`, `created_at`, `count = count + 1`
3. **No** — INSERT new notification

Result: one ticket = one row (while unread). After `markRead`, the next reply creates a new notification.

## Creation Points

### Support reply (`support_reply`)
- Trigger: `sendMessage` in `support.ts` when `senderType === 'support'`
- Title: "Новый ответ в тикете"
- Message: "Поддержка ответила на обращение: {subject}" (up to 80 chars)

### Status change (`ticket_status`)
- Trigger: `changeStatus` / `closeTicket` in `support.ts`
- `pending` → "Ваше обращение приняли в обработку"
- `closed` → "Ваше обращение было закрыто"

## Real-time Delivery

### WebSocket user rooms

Each authenticated socket automatically joins the `user:{userId}` room on connection. When a notification is created, `rvn-web` sends a POST request:

```
POST /broadcast/notification
{
  "userId": "...",
  "notification": { id, type, title, message, is_read, count, related_ticket_id, created_at }
}
```

The server emits a `notification:new` event to the `user:{userId}` room.

### Auto-mark-read

If the user is viewing a ticket (`activeTicketId` passed to `useNotifications`), new notifications for that ticket are automatically marked as read on the client side.

## API (tRPC)

### `notification.list`
- Cursor-based pagination (ORDER BY createdAt DESC)
- Input: `{ cursor?: UUID, limit: 1..50 }`
- Output: `{ items: Notification[], nextCursor: string | null }`

### `notification.unreadCount`
- Cached for 10 seconds (in-memory)
- Polling every 60 seconds as baseline
- Output: `{ count: number }`

### `notification.markRead`
- Input: `{ id: UUID }`
- Marks a single notification as read

### `notification.markAllRead`
- Marks all unread notifications as read

## UI Components

### NotificationsWidget (`components/navigation/Notifications.tsx`)
- Bell icon with blue badge (unread count, 99+)
- Dropdown: last 5 notifications, "Mark all read" button
- Click → navigate to ticket (`/support?ticket={id}`)
- Link "All notifications" → `/notifications`

### Page `/notifications`
- Infinite scroll (IntersectionObserver)
- Relative time ("2 мин назад", "вчера")
- Individual markRead and bulk markAllRead buttons

### Mobile navigation
- Bottom nav: Bell icon with badge replaces "About" for authenticated users
- Overlay menu: "Notifications" item with badge

## Caching

| Data | Cache type | TTL | Invalidation |
|------|-----------|-----|-------------|
| `unreadCount` | In-memory | 10s | createNotification, markRead, markAllRead |
| `getUserByToken` | Redis | 5m | logout, revoke device |
| `user.profile` | In-memory | 60s | TTL |
| `user.comments.list` | In-memory | 30s | comments.create |
| `admin.teamCount` | In-memory | 5m | grant/revoke role |

## Files

| File | Purpose |
|------|---------|
| `lib/database/schema.ts` | `notifications` table + relations |
| `lib/notifications/create.ts` | Creation service with UPSERT |
| `lib/trpc/routers/notification.ts` | tRPC router |
| `hooks/useNotifications.ts` | Client hook |
| `components/providers/WebSocketProvider.tsx` | Global WS provider |
| `components/navigation/Notifications.tsx` | Widget (dropdown) |
| `components/notifications/NotificationsPageClient.tsx` | /notifications page |
| `app/notifications/page.tsx` | Next.js route |
| `database/schema.sql` | Full schema (section 7) |
| `database/schema_migration.sql` | Migration for existing DB |
