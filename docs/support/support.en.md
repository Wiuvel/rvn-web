# Support system

> **[Русская версия](support.md)**

Ticket system: users open requests, support agents reply in real time. Messages are delivered over WebSocket, attachments live in S3, and ticket events raise notifications.

## Related documents

- [RBAC](../security/rbac.en.md) — `user` / `support` / `admin` roles, the `pex` flag, middleware (who can reach the agent panel).
- [Upload pipeline](../storage/upload.en.md) — support attachment pipeline (`app/api/support/upload`, magic-byte validation, S3 `support/` prefix).
- [Storage & Media](../storage/storage.en.md) — S3, Redis media cache, thumbhash.
- [Notifications](../notifications/notifications.en.md) and [types](../notifications/types.en.md) — UPSERT grouping of notifications per ticket.
- [WebSocket architecture](../websocket/architecture.en.md) and [events](../websocket/events.en.md) — rooms, broadcast, delivery.
- [Sessions & Cookies](../auth/sessions.en.md) — user authentication.

## Overview

Two entry points onto the same ticket domain:

| Route | Who | Component |
|-------|-----|-----------|
| `app/support` | user | `SupportClient` |
| `app/ui/panel/support` | agent (`support` / `admin` role) | `AdminSupportClient` |

A user sees only their own tickets; an agent sees all, can assign, change status, and close with a reason. The split is enforced by [RBAC](../security/rbac.en.md): agent mutations require `supportProcedure` (`support` or `admin` role), user mutations require `protectedProcedure`.

## Data model

Three tables (`lib/database/schema.ts`):

```
support_tickets
  id, user_id → users, assigned_to → users (nullable),
  status ('open' | 'pending' | 'closed'), priority ('normal' default),
  subject, last_message_at, closed_at, created_at, updated_at

support_messages
  id, ticket_id → support_tickets (cascade), sender_id → users (cascade),
  message_text, sender_type ('user' | 'support'), is_read, created_at

support_message_attachments
  id, message_id → support_messages (cascade),
  file_name, file_type, file_size, storage_path,
  blur_hash, width, height, created_at
```

`status` and `priority` are `text` columns at the DB level; runtime narrowing to union types happens in `support.ts` (`TicketStatus`, `TicketPriority`). `blur_hash` / `width` / `height` are populated for images (see [Upload pipeline](../storage/upload.en.md)).

## Ticket lifecycle

```
                   create
                     │
                     ▼
   ┌────────── open ◀──────── reopen (new message)
   │             │
   │   agent: assignedTo, priority
   │             │
   │             ▼
   │          pending  (awaiting user / agent reply)
   │             │
   │             ▼
   └────────▶ closed  (closed_at + close reason)
```

- **create** (`tickets.create`) — user supplies `subject` + first message; status `open`.
- **update** (`tickets.update`, `supportProcedure`) — agent changes `status`, `assignedTo`, `priority`; closing records a reason (`CloseReasonModal`) and sets `closed_at`.
- Agent list filter: `open` / `pending` / `closed` / `all`.
- Archive — closed tickets with a dedicated search in `AdminSupportClient`.

## tRPC procedures (`lib/trpc/routers/support.ts`)

| Procedure | Access | Purpose |
|-----------|--------|---------|
| `check` | public | Whether support is available to the current caller (role / guest) |
| `tickets.list` | protected | Ticket list (own for users, all for agents), filtered by status |
| `tickets.create` | protected | Create a ticket + first message |
| `tickets.get` | protected | Ticket with messages and attachments; backfills `sender_type` from roles |
| `tickets.update` | **support** | Change status / assign / priority / close with a reason |
| `tickets.sendMessage` | protected | Send a message (with attachments); reopens if needed |
| `tickets.markAsRead` | protected | Mark a ticket's messages as read |

## Pagination

Lists and message history load via `IntersectionObserver`: 50 initial items + 25 per batch on scroll near the end. Already tuned for admin support (see project memory); `MessageItem` is wrapped in `React.memo`.

## Real-time (WebSocket)

The server calls helpers in `lib/websocket/client.ts`, which broadcast to the WS server (`WEBSOCKET_SERVER_URL` + `INTERNAL_API_KEY`):

| Helper | When | To |
|--------|------|-----|
| `broadcastNewMessage(ticketId, message)` | new message | the ticket room subscribers |
| `broadcastTicketUpdate(ticketId, ticket)` | status/field change | the ticket room subscribers |
| `broadcastTicketAssignment(...)` | agent assignment | agents |

Rooms and delivery details are in [WebSocket architecture](../websocket/architecture.en.md) and [events](../websocket/events.en.md). Reconnect, debounce, and room rejoin are in [Reconnection](../websocket/reconnection.en.md). On the client, `ConnectionBanner` reflects the connection state.

## Attachments

Uploads go through the REST route `app/api/support/upload` (not tRPC): magic-byte validation, limits, write to S3 under the `support/` prefix, thumbhash generation for images. Metadata is stored in `support_message_attachments`. Full pipeline: [Upload pipeline](../storage/upload.en.md). Reads go through `app/support/files/[key]`; blurred-placeholder rendering via `ImageWithBlur` / `ImageViewer`.

## Notifications

A new message raises a notification via `createNotification` (`lib/notifications`). Notifications are grouped per ticket via UPSERT — multiple messages in one ticket don't spawn separate rows. Semantics: [Notifications](../notifications/notifications.en.md); type catalog: [Notification types](../notifications/types.en.md).

## Key files

| File | Role |
|------|------|
| `lib/trpc/routers/support.ts` | Ticket & message router |
| `components/support/SupportClient.tsx` | User UI |
| `components/support/AdminSupportClient.tsx` | Agent UI (lists, archive, assignment) |
| `components/support/MessageItem.tsx` / `AdminMessageItem.tsx` | Message rendering (memo) |
| `components/support/FileUploadModal.tsx` / `ImageViewer.tsx` | Attachments |
| `components/support/CloseReasonModal.tsx` | Close ticket with a reason |
| `app/api/support/upload/route.ts` | Attachment intake |
| `lib/websocket/client.ts` | Broadcast helpers |
