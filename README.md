<div align="center">
  <h1 align="center">@rvn-website</h1>

  <img src="docs/images/readme-card.png" alt="RVN Website" width="90%" />
  
  <p align="center">
    <img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js">
    <img src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=black" alt="React">
    <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Tailwind-4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind">
    <img src="https://img.shields.io/badge/tRPC-11-2596be?style=flat-square&logo=trpc&logoColor=white" alt="tRPC">
    <img src="https://img.shields.io/badge/Drizzle-PostgreSQL-c5f74f?style=flat-square&logo=drizzle&logoColor=black" alt="Drizzle ORM">
    <img src="https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis">
    <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
    <img src="https://img.shields.io/badge/Rust→WASM-000000?style=flat-square&logo=rust&logoColor=white" alt="Rust WASM">
  </p>
</div>

## Tech Stack

**Core** — Next.js 16, React 19, TypeScript, Tailwind CSS, Radix UI

**API** — tRPC 11, Socket.io

**Data** — Drizzle ORM (PostgreSQL), Redis, AWS S3

**Auth** — Argon2id, OAuth (Google, GitHub, Yandex, Telegram, VK, Twitch)

**Infra** — Docker, Rust → WASM (image processing), Turbopack

## Documentation

### Authentication

| Document | Description |
|----------|-------------|
| [Authentication architecture](docs/auth/architecture.en.md) | Sessions, device tokens, OAuth, password hashing, cookies |
| [Device fingerprinting](docs/auth/device-fingerprint.en.md) | Two-layer FPID system, IndexedDB, server-side hashing, deduplication |
| [Device IP geolocation](docs/auth/geolocation.en.md) | MaxMind GeoLite2, ip-api.com fallback, caching, storage format |

### Notifications

| Document | Description |
|----------|-------------|
| [Notification system](docs/notifications/notifications.en.md) | Real-time notifications, UPSERT grouping, WebSocket delivery, caching |

### WebSocket

| Document | Description |
|----------|-------------|
| [WebSocket architecture](docs/websocket/architecture.en.md) | Connection, rooms, broadcast, authentication |
| [Event Directory](docs/websocket/events.en.md) | Client/server events, error codes, REST endpoints |

### Security

| Document | Description |
|----------|-------------|
| [Bot Protection](docs/security/protection.en.md) | Proxy middleware, suspicion detector, Turnstile access cookie, rate limiting, CSRF, security headers |

### Storage & Media

| Document | Description |
|----------|-------------|
| [Storage & Media](docs/storage/storage.en.md) | S3-compatible upload, Redis media cache (gzip + TTL), Rust → WASM image processor, ThumbHash blur previews |

### Subscriptions & Payments

| Document | Description |
|----------|-------------|
| [Subscriptions & Payments](docs/subscriptions/subscriptions.en.md) | Plan catalogue, Remnawave provisioning, balance/promo/external purchase flows, payment webhook |

---

## Setup

```bash
cp .env.example .env
pnpm install
pnpm run build:wasm
pnpm run build
pnpm dev
```

## Scripts

```bash
pnpm dev               # dev server
pnpm build             # production build
pnpm start             # production server
pnpm test              # vitest
pnpm lint              # oxlint
pnpm format            # prettier
```

## Project Structure

```
app/
├── auth/              # login, register, OAuth
├── dashboard/         # user dashboard
├── admin/             # admin panel
├── support/           # ticket system
├── user/settings/     # profile settings
├── api/               # tRPC, websocket, uploads
└── protection/        # bot/DDoS protection

lib/
├── auth/              # sessions, device fingerprint
├── database/          # drizzle, redis, cache
├── storage/           # S3, media cache
├── trpc/              # routers (auth, user, admin)
└── websocket/         # socket.io server

wasm/                  # Rust image processing
```

## Environment

`.env.example`:

- `NEXT_PUBLIC_DOMAIN` — app URL
- `DATABASE_URL` — PostgreSQL connection
- `REDIS_URL` — cache
- `S3_*` — object storage
- `CSRF_SECRET` / `TURNSTILE_*` — security
- OAuth keys per provider

---
