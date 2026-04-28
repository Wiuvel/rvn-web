# WebSocket Architecture

> **[Русская версия](architecture.md)**

## Overview

Real-time communication is handled by a **standalone WebSocket server** (`rvn-socket-server`), separate from the Next.js application. The web app connects to it as a client and sends broadcast commands via internal REST API.

```
┌──────────────┐     Socket.IO      ┌─────────────────────┐
│   Browser    │◄──────────────────►│  rvn-socket-server  │
│  (socket.io  │   wss://ws.host    │  (Bun + Socket.IO)  │
│   client)    │                    │    port 3002        │
└──────┬───────┘                    └────────┬────────────┘
       │                                     │
       │  HTTPS                              │  HTTP (internal)
       ▼                                     ▼
┌──────────────┐   POST /broadcast/* ┌────────────────────┐
│   rvn-web    │────────────────────►│  rvn-socket-server │
│  (Next.js)   │    x-internal-      │  REST broadcast    │
│  port 3001   │    api-key          │  endpoints         │
└──────┬───────┘                     └────────────────────┘
       │
       │  POST /api/internal/*
       ▼
┌──────────────┐
│  rvn-web     │   Token & ticket
│  internal API│   verification
└──────────────┘
```

## Data Flow

### Client → Server (events)

1. Browser connects to `NEXT_PUBLIC_WS_URL` via `useWebSocket` hook
2. Socket.IO sends auth token in handshake
3. WS server validates token via `POST /api/internal/verify-token` callback to rvn-web
4. On success, client can join rooms and emit events (`support:join`, `support:typing`, etc.)

### Server → Client (broadcasts)

1. tRPC mutation in rvn-web executes (e.g., new message sent)
2. rvn-web calls `POST /broadcast/support/message` on WS server (internal network)
3. WS server emits event to the appropriate Socket.IO room
4. All connected clients in the room receive the event

## Authentication

WS server does **not** have direct database access. Authentication is delegated:

1. Client sends `auth.token` in Socket.IO handshake
2. WS server calls `POST {AUTH_SERVICE_URL}/api/internal/verify-token` with token + session cookies
3. rvn-web validates token (SHA256 → `user_devices` lookup), session, and roles
4. Response: `{ valid, user: { id, username, isSupport } }`
5. Result is cached in-memory for 60s by token hash

Ticket access is verified similarly via `POST /api/internal/verify-ticket-access`.

## Environment Variables

### rvn-web

| Variable | Side | Description |
|---|---|---|
| `NEXT_PUBLIC_WS_URL` | Client (build-time) | Public WS server URL for browser connections |
| `WEBSOCKET_SERVER_URL` | Server | Internal WS server URL for broadcast calls |
| `INTERNAL_API_KEY` | Server | Shared secret for internal API auth |

### rvn-socket-server

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 3002) |
| `AUTH_SERVICE_URL` | rvn-web URL for token verification |
| `INTERNAL_API_KEY` | Shared secret (must match rvn-web) |
| `CORS_ORIGINS` | Comma-separated allowed origins |

## Key Files

### rvn-web

- `hooks/useWebSocket.ts` — Socket.IO client hook
- `lib/websocket/client.ts` — HTTP broadcast client (server-side)
- `lib/websocket/types.ts` — TypeScript contract (mirrors `rvn-socketio-server/src/types.ts`)
- `app/api/internal/verify-token/route.ts` — Token verification endpoint
- `app/api/internal/verify-ticket-access/route.ts` — Ticket access verification

### rvn-socket-server

- `src/index.ts` — Entry point, Bun server + Socket.IO setup
- `src/auth.ts` — Auth middleware with caching
- `src/broadcast.ts` — REST broadcast handler
- `src/handlers/support.ts` — Support ticket event handlers
- `src/handlers/profile.ts` — Profile comment event handlers
- `src/rate-limit.ts` — Connection & typing rate limiting
- `src/types.ts` — Shared TypeScript types (source of truth)

## Type Contract

The WebSocket message contract is defined twice: once on the server in [`Wiuvel/rvn-socketio-server`](https://github.com/Wiuvel/rvn-socketio-server) (`src/types.ts`) and mirrored in `lib/websocket/types.ts` on the rvn-web side. The server file is the **source of truth** — all changes start there.

When modifying the contract:

1. Update `src/types.ts` in `rvn-socketio-server`.
2. Mirror the change in `lib/websocket/types.ts` here.
3. Update broadcast helpers in `lib/websocket/client.ts` and consumers in `hooks/useWebSocket.ts`.
4. Update the event tables in [`events.en.md`](events.en.md) / [`events.md`](events.md).

There is currently no automated drift check; future work could publish a shared `@rvn/ws-types` npm package or add a CI step that diffs both files.
