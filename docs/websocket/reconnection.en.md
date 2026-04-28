# Reconnection & Resilience

> **[Русская версия](reconnection.md)**

## Overview

The web client connects to the WebSocket server (`rvn-socketio-server`) over Socket.IO. The connection is meant to be persistent for the lifetime of an authenticated session, but in practice it is fragile — networks flap, tokens rotate, browsers throttle background tabs. This document describes how `hooks/useWebSocket.ts` and `lib/websocket/client.ts` keep that connection healthy without flooding the server with reconnect storms.

The two pieces have different jobs:

- **Browser side** (`hooks/useWebSocket.ts`) — owns the Socket.IO client instance, the React lifecycle, and the room-membership state.
- **Node side** (`lib/websocket/client.ts`) — fire-and-forget broadcasts from API routes and tRPC into the WS server. No reconnection: if the call fails, it logs and moves on.

## Connection Lifecycle (Browser)

```
[useWebSocket({ enabled, token, ticketId })]
        │
        ▼
[token present?] ──no──→ no socket, log "no token, skipping"
        │ yes
        ▼
[debounce 100 ms, then connect]
        │
        ▼
io(NEXT_PUBLIC_WS_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  forceNew: false,
  autoConnect: true,
  auth: { token },
})
        │
        ▼
[connect] → setIsConnected(true), auto-rejoin currentTicketIdRef
[disconnect] → setIsConnected(false)
[connect_error] → classify error, optionally clear token to stop loop
[error] → log non-transport errors only
```

Key options on the Socket.IO client:

| Option | Value | Why |
|--------|-------|-----|
| `transports` | `['websocket', 'polling']` | WebSocket first; polling fallback for hostile networks (corporate proxies, mobile carriers). |
| `reconnection` | `true` | Built-in Socket.IO retry. We do not implement our own reconnect loop. |
| `reconnectionAttempts` | `5` | After 5 failures the client gives up and stays disconnected. The next user action (route change, token refresh, manual refresh) will create a fresh socket. |
| `reconnectionDelay` / `reconnectionDelayMax` | `1000` / `5000` | Exponential backoff stays under 5 seconds — fast enough to feel "live", slow enough not to hammer the server during outages. |
| `timeout` | `20000` | 20-second connect timeout. Anything slower is treated as a hard failure. |
| `forceNew` | `false` | Reuse the manager when possible — avoids extra TCP/TLS handshakes when we re-mount the hook. |

## Why a 100 ms Debounce

Initial mount of components that use `useWebSocket` typically goes through three states in a few hundred milliseconds:

1. `token = undefined` (auth fetch in flight)
2. `token = '<value>'` (auth fetch resolved)
3. `token = '<same value>'` (re-render due to other state)

Without debounce, each transition would tear down and re-create the socket, causing a thundering-herd of `connect → disconnect → connect_error` cycles on the WS server. The 100 ms `setTimeout` collapses these into a single connect attempt:

```ts
reconnectTimeoutRef.current = setTimeout(() => {
  // disconnect old socket only if token actually changed
  if (cleanupRef.current && currentTokenRef.current !== token) {
    cleanupRef.current();
  }
  currentTokenRef.current = token;
  // ...create new socket
}, 100);
```

The same ref-based guard (`currentTokenRef.current === token && socketRef.current?.connected`) means re-renders that don't change the token are no-ops.

## Token Rotation

The connection is bound to the auth `token` cookie value. When `checkAuth` issues a new token (rare — only on full re-login), the prop changes and the hook reconnects with the new token in `auth: { token }`. The previous socket is explicitly disconnected first to free the auth slot on the server.

If the server rejects a token (`Authentication`, `Invalid token`, `Authentication required` in the `connect_error` message), the hook clears `currentTokenRef.current`. This breaks the Socket.IO retry loop with a stale token — otherwise it would burn through all 5 attempts re-sending the same bad credential. The user is expected to re-authenticate (via the regular auth flow) which will eventually pass a new `token` prop and trigger a clean reconnect.

CORS-related errors (`CORS`, `origin` in the message) are logged as a separate diagnostic; they typically point at server-side `WS_ALLOWED_ORIGINS` mis-configuration and won't resolve until the server is fixed.

## Room Membership Across Reconnects

Tickets and profile pages are scoped to Socket.IO rooms. The hook tracks the current ticket in a ref (`currentTicketIdRef`) so that on every `connect` event it can re-emit `support:join` automatically:

```ts
socket.on('connect', () => {
  setIsConnected(true);
  if (currentTicketIdRef.current) {
    socket.emit('support:join', { ticketId: currentTicketIdRef.current });
  }
});
```

This is intentional: `ticketId` is **not** a dependency of the connect-effect, so a route change inside a ticket does not trigger a reconnect — only `joinTicket(newId)` / `leaveTicket(oldId)` emits. The reconnect path picks up whatever ticket the user is currently viewing, with no manual coordination from the calling component.

The same pattern is exposed for profile pages via `joinProfile` / `leaveProfile`. Both `joinTicket` and `joinProfile` queue the join until `socket.connected === true` and skip if the room is already current.

## Typing Indicator

`sendTyping(ticketId, isTyping)` is best-effort — it emits `support:typing` only when the socket is connected. There is no buffering: if the socket is down, the typing event is dropped silently. This is fine because typing is a UX hint; missing one keystroke does not change application state.

## Cleanup

On unmount or dependency change, the hook:

1. Clears any pending debounce `setTimeout`.
2. Removes Socket.IO listeners explicitly (`off('connect')`, `off('disconnect')`, `off('connect_error')`, `off('error')`) — Socket.IO does not detach them for you.
3. Calls `socket.disconnect()` to free the server slot.
4. Nulls out `socketRef.current` and `setSocket(null)` so consumers cannot accidentally use a dead socket.

Listener removal matters: the same `useWebSocket` hook is mounted in `SupportClient` and `AdminSupportClient`, both of which mount/unmount on route changes. Without explicit `off()`, every navigation would leak handlers and leave stale closures alive in memory.

## Server-Side Broadcasts (Node)

`lib/websocket/client.ts` is the API-route side of the contract:

```ts
broadcastSupportMessage(ticketId, message)
broadcastTicketUpdate(ticketId, update)
broadcastNotification(userId, notification)
broadcastSystem(payload)
broadcastTicketAssignment(ticketId, assignedTo, assignedUser)
broadcastProfileComment(profileId, comment)
```

These are HTTP POSTs to the WS server. They are intentionally fire-and-forget:

- No retries, no queue. If the WS server is down, the broadcast is lost; the client will re-fetch state on next interaction (e.g. `notification.list`, `support.getTicket`).
- The 5-second timeout prevents a stuck WS server from pinning API routes.
- Errors are logged but never thrown — a notification glitch must not fail the producing tRPC mutation.

This is the right trade-off because every broadcast is a side-effect of a DB write that already succeeded. The DB is the source of truth; WS is just the fast-path for delivery.

## Failure Modes

| Symptom | Cause | What happens |
|---------|-------|--------------|
| Banner never goes away (`isConnected = false`) | WS server unreachable, all 5 attempts failed | Hook stays disconnected. Real-time updates stop, but tRPC/REST keep working. Next mount tries again. |
| `connect_error: Authentication required` | Token expired / revoked | `currentTokenRef` cleared, retries stop. User must re-auth. |
| `connect_error: CORS / origin` | `WS_ALLOWED_ORIGINS` on server doesn't include the current origin | Logged as CORS error; will keep failing until WS server config is fixed. |
| Background tab "freezes" then catches up | Browser throttles timers/sockets in background tabs | On tab focus the browser fires `visibilitychange` and Socket.IO automatically reconnects from `disconnected`. |
| `disconnect` reason = `transport close` | Network blip | Socket.IO retries with backoff up to 5 attempts. Usually recovers within seconds. |

## Files

- `hooks/useWebSocket.ts` — browser-side hook (connect, debounce, token-binding, room rejoin, typing).
- `lib/websocket/client.ts` — Node-side broadcast helpers.
- `lib/websocket/types.ts` — shared payload types (mirrored from `rvn-socketio-server`).
- `docs/websocket/architecture.en.md` — overall architecture and event catalog.
- `docs/websocket/events.en.md` — full event reference.
