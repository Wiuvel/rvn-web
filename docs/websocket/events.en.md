# WebSocket Events Reference

> **[Русская версия](events.md)**

## Client → Server

| Event | Payload | Description |
|---|---|---|
| `support:join` | `{ ticketId: string }` | Join a support ticket room |
| `support:leave` | `{ ticketId: string }` | Leave a support ticket room |
| `support:typing` | `{ ticketId: string, isTyping: boolean }` | Typing indicator (rate-limited: 1s interval, 10/min) |
| `profile:join` | `{ profileId: string }` | Join a profile comments room |
| `profile:leave` | `{ profileId: string }` | Leave a profile comments room |

## Server → Client

| Event | Payload | Description |
|---|---|---|
| `support:message:new` | `{ ticketId, message }` | New message in ticket |
| `support:ticket:updated` | `{ ticketId, ticket }` | Ticket status/metadata changed |
| `support:ticket:assigned` | `{ ticketId, assignedTo, assignedUser }` | Ticket assigned to support agent |
| `support:typing:status` | `{ ticketId, userId, username, isTyping }` | Someone is typing in ticket |
| `support:message:read` | `{ ticketId, messageIds[], readBy }` | Messages marked as read |
| `support:error` | `{ message, code? }` | Error notification |
| `profile:comment:new` | `{ profileId, comment }` | New comment on profile |
| `notification:new` | `{ notification }` | New user notification (targeted to `user:{userId}` room) |
| `system:notification` | `{ message, type? }` | System notification (broadcast to all connected clients) |

## Rooms

- `user:{userId}` — Personal user room. Auto-joined on connection. Used for notifications.
- `ticket:{ticketId}` — Support ticket room. Users can join only their own tickets; support staff can join any.
- `profile:{profileId}` — Profile comments room. Any authenticated user can join.

## Error Codes

| Code | Description |
|---|---|
| `INVALID_DATA` | Missing or malformed payload |
| `INVALID_TICKET_ID` | Ticket ID is not a valid UUID |
| `TICKET_NOT_FOUND` | Ticket does not exist |
| `ACCESS_DENIED` | User has no access to this ticket |
| `VALIDATION_ERROR` | Server error during access check |
| `SERVICE_UNAVAILABLE` | Auth service unreachable |

## Broadcast REST Endpoints

Used by rvn-web to push events through the WS server. All require `x-internal-api-key` header.

| Endpoint | Emits |
|---|---|
| `POST /broadcast/support/message` | `support:message:new` |
| `POST /broadcast/support/ticket-update` | `support:ticket:updated` |
| `POST /broadcast/support/ticket-assigned` | `support:ticket:assigned` |
| `POST /broadcast/support/message-read` | `support:message:read` |
| `POST /broadcast/profile/comment` | `profile:comment:new` |
| `POST /broadcast/notification` | `notification:new` (to `user:{userId}` room) |
| `POST /broadcast/system` | `system:notification` |
