# Documentation

Central navigation index for the project's architecture, APIs, security systems, integrations, and guides.

---

## 📑 Table of Contents

- [1. Vinext Framework](#1-vinext-framework)
- [2. Authentication & Sessions](#2-authentication--sessions)
- [3. Notification System](#3-notification-system)
- [4. Admin Panel](#4-admin-panel)
- [5. Support System](#5-support-system)
- [6. WebSocket & Real-time](#6-websocket--real-time)
- [7. Security & Protection](#7-security--protection)
- [8. Storage & Media](#8-storage--media)
- [9. Subscriptions & Payments](#9-subscriptions--payments)
- [10. Database & Migrations](#10-database--migrations)
- [11. Development & Local Stack](#11-development--local-stack)

---

## 1. Vinext Framework

| Document | Description |
| :--- | :--- |
| [Vinext Integration](vinext/vinext.en.md) | Notes on Vinext 1.0.0-beta integration, resolution of former workarounds (`vinext/types`, `sameSite`, `MetadataRoute`, Vitest shims). |

---

## 2. Authentication & Sessions

| Document | Description |
| :--- | :--- |
| [Authentication Architecture](auth/architecture.en.md) | Session lifecycle, device tokens, Argon2id password hashing, cookie strategy. |
| [OAuth Providers](auth/oauth.en.md) | Google, Yandex, Twitch, VK, Telegram, GitHub-admin flows, CSRF protection, popup vs full-page. |
| [Sessions & Cookies](auth/sessions.en.md) | `token`, `session_id`, `user_data` cookies specification, token rotation, and logout. |
| [Device Fingerprinting](auth/device-fingerprint.en.md) | Two-layer FPID system (IndexedDB + server-side hashing), device deduplication. |
| [IP Geolocation](auth/geolocation.en.md) | MaxMind GeoLite2 integration, ip-api.com fallback, memory caching. |

---

## 3. Notification System

| Document | Description |
| :--- | :--- |
| [Notification System](notifications/notifications.en.md) | Real-time notifications, UPSERT grouping, WebSocket delivery, caching. |
| [Notification Types Catalog](notifications/types.en.md) | Event type semantics, cleanup policy, read paths, system broadcasts. |

---

## 4. Admin Panel

| Document | Description |
| :--- | :--- |
| [Admin Panel](admin/admin-panel.en.md) | Isolated admin auth (GitHub OAuth), user management, subscription plans, maintenance mode. |

---

## 5. Support System

| Document | Description |
| :--- | :--- |
| [Ticket & Support System](support/support.en.md) | Ticket lifecycle, live chat, attachments, real-time WebSocket delivery. |

---

## 6. WebSocket & Real-time

| Document | Description |
| :--- | :--- |
| [WebSocket Architecture](websocket/architecture.en.md) | Connections, user rooms, broadcasting, socket authentication. |
| [Event Directory](websocket/events.en.md) | Client/server events, error codes, mapping to REST/tRPC endpoints. |
| [Reconnection & Resilience](websocket/reconnection.en.md) | Socket.IO retry strategy, debounce, room rejoining, token rotation. |

---

## 7. Security & Protection

| Document | Description |
| :--- | :--- |
| [Bot Protection](security/protection.en.md) | Proxy middleware, suspicion detector, rate limiting, Turnstile, CSRF. |
| [Security Headers & CSP](security/headers.en.md) | Content-Security-Policy, HSTS, CORS, static resource handling. |
| [Role-Based Access Control (RBAC)](security/rbac.en.md) | `user`, `support`, `admin` role models, tRPC middlewares, permission checks. |

---

## 8. Storage & Media

| Document | Description |
| :--- | :--- |
| [Storage & Media](storage/storage.en.md) | S3-compatible object storage (MinIO/AWS), Redis media cache (gzip + TTL), Rust WASM processor. |
| [Upload Pipeline](storage/upload.en.md) | Magic-byte validation, thumbhash generation, cache warm-up. |

---

## 9. Subscriptions & Payments

| Document | Description |
| :--- | :--- |
| [Subscriptions & Remnawave](subscriptions/subscriptions.en.md) | Plan catalog, Remnawave node provisioning, payment webhooks. |
| [Balance & Promo](subscriptions/balance.en.md) | Internal user balance, transaction ledger, test promo codes. |

---

## 10. Database & Migrations

| Document | Description |
| :--- | :--- |
| [Drizzle ORM Migrations](database/migrations.en.md) | Drizzle Kit workflow, custom triggers, CHECK constraints, `db:generate` and `db:migrate`. |

---

## 11. Development & Local Stack

| Document | Description |
| :--- | :--- |
| [Local Dev Stack](dev/local-stack.en.md) | Single-command local environment (Postgres + Redis + MinIO + WS), `dev/up.mjs`. |
