# Authentication Architecture

> **[Русская версия](architecture.md)**

## Overview

The authentication system is built on a **two-tier session model**: a long-lived device token (bound to device) + a short-lived server session (bound to tab). Password-based and OAuth (Google, Telegram, Twitch, VK, Yandex) authentication are supported. Administrators have a separate authentication circuit.

```
┌──────────────┐                         ┌──────────────────┐
│   Browser    │   token (httpOnly)      │    rvn-web       │
│              │   session_id (httpOnly) │    (Next.js)     │
│  IndexedDB:  │─────────────────────────►   tRPC router    │
│  rvn_fpid    │   user_data (signed)    │                  │
│              │◄────────────────────────│                  │
└──────┬───────┘                         └────────┬─────────┘
       │                                          │
       │  OAuth redirect                          │  Drizzle ORM
       ▼                                          ▼
┌──────────────┐                         ┌──────────────────┐
│  OAuth       │                         │   PostgreSQL     │
│  Provider    │                         │                  │
│  (Google,    │                         │  users           │
│  Telegram,   │                         │  user_devices    │
│  Twitch,     │                         │  user_roles      │
│  VK, Yandex) │                         │  admins          │
└──────────────┘                         └──────────────────┘
```

## Authentication Flows

### Password Registration

1. Client sends `auth.register` (tRPC) with `username` + `password` + CSRF token
2. Validation: username >= 3 chars, password >= 6 chars
3. Username uniqueness check (case-insensitive)
4. Password hashing: **Argon2id** (memoryCost: 8192, timeCost: 2, parallelism: 1)
5. Generate `userId` (7-digit ID, 0000000–9999999)
6. Create `users` record
7. Register device → `user_devices` (generate device token, 256 bits / 64 hex chars)
8. Create session → Redis / in-memory
9. Set cookies: `session_id`, `token`, `user_data`

### Password Login

```
Client                              Server
  │                                    │
  │  auth.login(username, pass)        │
  │───────────────────────────────────►│
  │                                    ├─ Case-insensitive username lookup
  │                                    ├─ Check is_active
  │                                    ├─ Check password_hash != NULL (not OAuth)
  │                                    ├─ Timing-safe argon2.verify + random delay
  │                                    ├─ Update last_login
  │                                    ├─ SessionManager.registerDevice()
  │                                    ├─ SessionManager.createSession()
  │                                    │
  │  Set-Cookie: session_id,           │
  │              token, user_data      │
  │◄───────────────────────────────────│
```

**Timing attack protection**: even for non-existent users, hash computation + random delay of 50–150 ms is performed.

### OAuth Login

```
Client                  OAuth Provider           Server
  │                          │                      │
  │  1. auth.csrf            │                      │
  │────────────────────────────────────────────────►│
  │  ◄── csrf token ────────────────────────────────│
  │                          │                      │
  │  2. Redirect             │                      │
  │─────────────────────────►│                      │
  │  ◄── code + state ───────│                      │
  │                          │                      │
  │  3. Callback             │                      │
  │────────────────────────────────────────────────►│
  │                          │  4. Exchange code    │
  │                          │◄─────────────────────│
  │                          │──── user info ──────►│
  │                          │                      │
  │                          │  5. Find/create      │
  │                          │     user             │
  │                          │  6. Register         │
  │                          │     device           │
  │                          │  7. Create session   │
  │                          │                      │
  │  Set-Cookie + redirect   │                      │
  │◄────────────────────────────────────────────────│
```

**Providers**: Google, Telegram, Twitch, VK, Yandex

**Details**:
- CSRF token is passed in the OAuth `state` parameter
- Popup window support (`:popup` flag in state cookie)
- OAuth username is sanitized: only `[a-zA-Z0-9_-]`, 3–30 chars
- Username collision: suffix `_1`, `_2`, ..., `_100` appended, fallback `_{timestamp}`
- OAuth users cannot log in with password (`passwordHash = NULL`)
- FPID from cookie `rvn_fpid` is used for device grouping (Layer 2)

### Admin Authentication

Administrators have a **separate circuit**: own `admins` table, own cookies, own session.

| Aspect | User | Admin |
|--------|------|-------|
| Table | `users` | `admins` |
| Session cookie | `session_id` | `admin_sid` |
| Token cookie | `token` | `admin_token` |
| Session TTL | 12 hours | 6 hours |
| OAuth | Google, Telegram, Twitch, VK, Yandex | GitHub (trusted developers) |
| Device tracking | Yes (Layer 1 + 2) | No |

**GitHub OAuth for admins**: checks if username/email exists in `trusted_github_developers` table. If found — auto-create/login admin account. Otherwise — denied.

**Root admin**: the first created admin gets `isRoot = true`. Cannot be deleted, has access to privileged operations.

## Session Architecture

### Two-Tier Model

```
┌──────────────────────────────────────────────────┐
│                    Browser                       │
│                                                  │
│  Cookie: token ──────┐   Cookie: session_id ──┐  │
│  (7 days, httpOnly)  │   (12 hours, httpOnly) │  │
└──────────────────────┼────────────────────────┼──┘
                       │                        │
                       ▼                        ▼
              ┌────────────────┐      ┌──────────────────┐
              │  user_devices  │      │   Session Store  │
              │  (PostgreSQL)  │      │  (Redis/Memory)  │
              │                │      │                  │
              │  tokenHash     │      │  userId          │
              │  deviceName    │      │  username        │
              │  ipAddress     │      │  tokenFingerprint│
              │  deviceFpHash  │      │  ip, userAgent   │
              │  lastActive    │      │  createdAt       │
              └────────────────┘      └──────────────────┘
```

**Token** — long-lived (7 days). Bound to device via `user_devices`. Used for session recovery.

**Session** — short-lived (12 hours, sliding). Stores request context. Bound to token via `tokenFingerprint` (HMAC-SHA256).

### Request Validation

```
1. Has token + session_id?
   ├─ Yes → Validate session (IP, UA, tokenFingerprint)
   │        ├─ Valid → ✓ Authenticated
   │        └─ Invalid → Attempt recovery (refresh)
   └─ No session_id, but has token?
      ├─ Token valid → Create new session (refresh)
      └─ Token invalid → ✗ Not authenticated
```

**Token Binding**: session contains `tokenFingerprint = HMAC-SHA256(token, CSRF_SECRET)`. On each request, the session fingerprint is verified against the current token's fingerprint. This prevents token substitution.

### Sliding Expiration

Each successful request extends session TTL by the full `SESSION_TIMEOUT` (12 hours). Redis: `SETEX`, in-memory: update `expiresAt`.

## Device Tracking

### Layer 1: Client-Side FPID

```
IndexedDB: rvn_device
├── fpid store
│   └── { fpid: "MP_XXXXXXXXXXXXXX", time: "2025-01-01T..." }
└── rb_sync store
    └── { hash: MD5(fpid:time), lastSentTime: ... }
```

- Generated once on first visit
- Format: `MP_` + 12 random characters
- Sent to server via cookie `rvn_fpid` (5 min TTL, OAuth only)
- Deleted from cookie after use

### Layer 2: Server-Side Grouping

```
deviceFpHash = SHA256(normalizeUA(userAgent) + normalizeIP(ip) + fpid)
```

On device registration:
1. If FPID exists → compute `deviceFpHash`
2. Find existing device with same `userId` + `deviceFpHash`
3. If found → update (don't create duplicate)
4. If not found → create new device

**Result**: one physical browser = one `user_devices` record, even with multiple OAuth logins.

## Cookies

### User

| Cookie | Value | httpOnly | Secure | SameSite | TTL |
|--------|-------|----------|--------|----------|-----|
| `session_id` | Random ID | Yes | prod | strict | 12 hours (sliding) |
| `token` | Device token (generated in `SessionManager.registerDevice()`) | Yes | prod | strict | 7 days |
| `user_data` | `{payload}.{hmac}` (base64url) | No | prod | lax | 7 days |
| `rvn_fpid` | `MP_XXXX...` | No | — | lax | 5 minutes |
| `oauth_state` | CSRF token (`:popup` optional) | No | — | lax | Session |
| `access_token` | `{base64url_payload}.{hmac_hex}` | Yes | prod | strict | 12 hours |

### Admin

| Cookie | Value | httpOnly | TTL |
|--------|-------|----------|-----|
| `admin_sid` | Random ID | Yes | 6 hours |
| `admin_token` | 64-char hex | Yes | 6 hours |
| `admin_username` | Sanitized username | Yes | 6 hours |

### `user_data` Structure

Cookie `user_data` is the only client-readable cookie. Contains an HMAC-SHA256 signed payload:

```json
{
  "user_id": "1234567",
  "username": "john_doe",
  "avatar": "s3:avatars/uuid/ts.webp",
  "banner": "s3:banners/uuid/ts.webp",
  "pex": "u"
}
```

`pex` (permissions): `"u"` — user, `"s"` — support, `"a"` — admin.

## Role System

### Available Roles

| Role | Description | Assignment |
|------|-------------|------------|
| `user` | Base (default) | Automatic on registration |
| `support` | Support agent | Manually by admin |
| `admin` | Administrator | Manually by admin |

### Storage

Table `user_roles`:
```
id, userId, role, grantedBy, grantedAt, revokedAt, isActive
```

Active role: `isActive = true AND revokedAt IS NULL`.

### Role Checking

- `hasUserRole(userId, role)` — cached for 5 seconds
- `batchHasUserRole(userIds[], role)` — batch check for lists (N+1 optimization)
- Role `user` cannot be granted/revoked (always present)

### tRPC Middleware

| Procedure | Middleware | Access |
|-----------|-----------|--------|
| `publicProcedure` | — | Everyone |
| `authRateLimitedProcedure` | authRateLimit | `/login`, `/register` (10 req/5 min) |
| `protectedProcedure` | rateLimited + authed | Authenticated users |
| `adminProcedure` | rateLimited + adminAuthed | Users with `admin` role |
| `supportProcedure` | rateLimited + supportAuthed | Users with `support` or `admin` role |
| `adminPanelProcedure` | rateLimited + adminPanelAuthed | Separate auth via `admin_sid` |

## Rate Limiting

| Limiter | Window | Max requests | Key | Application |
|---------|--------|--------------|-----|-------------|
| `authRateLimit` | 5 min | 10 | IP + UA (50 chars) | Login, registration, OAuth |
| `generalRateLimit` | 5 min | 100 | IP | All protected endpoints |
| `messageRateLimit` | 5 min | 50 | IP or userId | Sending messages |

**Immunity**: after passing CAPTCHA, rate limit is bypassed for `RATE_LIMIT_IMMUNITY_DURATION`.

## Security

| Measure | Implementation |
|---------|----------------|
| Password hashing | Argon2id (memoryCost: 8192, timeCost: 2, parallelism: 1) |
| Timing-safe verification | Dummy hash + random delay 50–150 ms |
| CSRF protection | Token in OAuth state + tRPC mutations |
| Token Binding | HMAC-SHA256 fingerprint binds session to token |
| Session Fixation | Old session destroyed on login |
| XSS protection | httpOnly cookies for token/session_id |
| SameSite | strict for auth cookies, lax for user_data |
| updated_at | Managed by DB trigger `update_updated_at_column()` (BEFORE UPDATE) |

## Key Files

| File | Description |
|------|-------------|
| `lib/auth/index.ts` | Registration, login, user creation, hashing |
| `lib/auth/session-manager.ts` | Session management, devices, fingerprinting |
| `lib/auth/helper.ts` | `getCurrentUser()`, authentication checks |
| `lib/auth/user-roles.ts` | Role granting/revoking/checking |
| `lib/auth/user-cookie.server.ts` | Cookie set/read/delete |
| `lib/trpc/routers/auth.ts` | tRPC authentication endpoints |
| `lib/trpc/init.ts` | Middleware: authed, adminAuthed, supportAuthed |
| `app/api/auth/oauth/*/callback/route.ts` | OAuth callbacks for each provider |

## Database Schema

```sql
-- Users
users (id, user_id, username, password_hash, avatar, banner, is_active,
       last_login, created_at, updated_at)

-- User devices (store device token)
user_devices (id, user_id→users, token_hash, device_name, ip_address,
              location, device_fp_hash, last_active, created_at, updated_at)

-- Roles
user_roles (id, user_id→users, role, granted_by→admins, granted_at,
            revoked_at, is_active, created_at, updated_at)

-- Administrators (separate table)
admins (id, username, password_hash, token, is_root, created_at, updated_at)

-- Trusted GitHub developers (for admin OAuth)
trusted_github_developers (id, email, github_username, created_by→admins,
                           created_at, updated_at)
```
