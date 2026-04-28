# Sessions & Cookies

> **[Русская версия](sessions.md)**

## Overview

Authentication state is split across three cookies and one server-side session record. The cookies do different jobs and have different lifetimes:

| Cookie | httpOnly | Max-age | Purpose |
|--------|---------:|--------:|---------|
| `token` | yes | 1 year | Long-lived device token. Server hashes it to look up the user (cold-start path) and to bind the active session via `tokenFingerprint`. |
| `session_id` | yes | 1 hour | Short-lived ID into the Redis (or in-memory) session store. Holds IP, User-Agent, `tokenFingerprint`, last activity timestamp. |
| `user_data` | no  | 1 year | HMAC-signed JSON snapshot of `{ user_id, username, avatar, banner, pex, balance }` for fast UI rendering before the auth fetch resolves. |

Defaults live in `lib/utils/config.ts` (`appConfig.session`, `appConfig.token`, `appConfig.userData`).

## Server-Side Session Store

`lib/auth/session-store.ts` exposes `ResilientSessionStore`, which transparently switches between Redis and an in-memory map.

- **Primary backend**: Redis. Keys: `session:<id>` (the `SessionData` blob) and `user_sessions:<userId>` (a Set of session IDs for fast bulk-revoke).
- **Fallback**: in-memory `Map<string, SessionData>` with periodic cleanup. Used only while Redis is unreachable; sessions created during an outage are visible only on the same Node process and disappear on restart.
- **Healing**: every call retries Redis first. Once Redis recovers, new sessions are written there again — old in-memory entries simply expire.

`SessionData` shape:

```ts
{
  id: string;
  userId: string;
  username: string;
  tokenFingerprint: string; // HMAC(token) — empty for admin sessions
  createdAt: number;        // ms epoch
  lastActivity: number;     // ms epoch, refreshed on each get()
  ipAddress: string;
  userAgent: string;
}
```

`get()` is sliding: it pushes `lastActivity` to `now` and re-issues the Redis TTL. Sessions that have been idle for longer than `SESSION_TIMEOUT` (`appConfig.session.timeout` = 1 hour) are deleted in-place.

## Token Binding

Tokens and sessions are linked by HMAC, not plain equality, so neither side reveals the other:

```
tokenFingerprint = HMAC-SHA256(USER_DATA_SECRET || CSRF_SECRET, token)
tokenHash        = SHA256(token)              // stored in user_devices
```

- `tokenFingerprint` is stored inside `SessionData`. On `validateSession()`, the server recomputes it from the request's `token` cookie and rejects on mismatch.
- `tokenHash` is stored on `user_devices`. It lets the server identify the device that owns this token without ever decrypting it.
- Admin sessions have `tokenFingerprint = ''` and skip this check (they don't get a long-lived `token` cookie).

## Lifecycle

### Login / OAuth callback

1. `SessionManager.registerDevice(userId, ua, ip, fpid)` — INSERT (or UPDATE) into `user_devices`, returns the raw token. Layer 2 grouping by `device_fp_hash` deduplicates the row when the same device logs in again — see `docs/auth/device-fingerprint.en.md`.
2. `SessionManager.createSession(userId, username, ip, ua, token, 'user')` — writes `SessionData` to Redis, returns `sessionId`.
3. Three cookies are set:
   - `token` → 1-year httpOnly cookie via `app/api/auth/token/route.ts` helpers.
   - `session_id` → 1-hour httpOnly cookie via `SessionManager.setSessionCookie(sessionId, isLocalhost)`.
   - `user_data` → HMAC-signed snapshot via `setUserDataCookie(user, isLocalhost)` in `lib/auth/helper.ts`.

### Each authenticated request (`checkAuth`)

`lib/auth/helper.ts → checkAuth(request, options)` resolves the user using the cookies:

1. **No `token`** → unauthenticated.
2. **`token` only (no `session_id`)** → cold-start. Look up the user by `tokenHash`, then auto-create a new session (`refresh flow`) and re-set `session_id`. Skipped if `options.readOnly` is true (Server Components can read the user but cannot mint cookies).
3. **`token` + `session_id`** → call `SessionManager.validateSession(sessionId, token, ip, ua)`. Validation enforces:
   - Token binding equality (`tokenFingerprint` must match HMAC of the current `token`).
   - User-Agent normalized to `<browser>:<os>`. Mismatch triggers a `WARN` log and the stored UA is updated; the request is **not** rejected.
   - IP. By default flexible: same `/24` (IPv4) or first 4 segments (IPv6). Strict IP can be enabled with `validateSession(..., { strictIP: true })` — used for sensitive admin operations.

If validation fails, the server clears `session_id` (and may clear `token`) and the client is treated as unauthenticated.

### Refresh

The `session_id` cookie naturally expires after 1 hour of inactivity. The very next request still has `token`, so `checkAuth` falls through into the refresh path and mints a new session. The user does not see a logout.

`SessionManager.refreshSessionCookie()` is also called from the rate-limit-aware paths to keep the cookie alive while a session is still warm in Redis.

### Logout

- **Single device**: `SessionManager.destroySession(sessionId)` + `clearSessionCookie('session_id')` + delete the `user_devices` row by `tokenHash` (`SessionManager.revokeDevice(token)`) + clear `token` and `user_data` cookies.
- **All other devices**: `SessionManager.revokeOtherDevices(userId, currentToken)` (deletes every `user_devices` row whose `tokenHash !== currentTokenHash`) and `destroyAllUserSessions(userId)` minus the current `sessionId`. Useful from `/user/settings/security` "Sign out everywhere".
- **Admin invalidate**: `destroyAllUserSessions(userId)` is also called when an admin disables an account or revokes a role, so the next request from that user is force-logged-out.

## `user_data` Cookie

`lib/auth/user-cookie.server.ts` builds a non-httpOnly cookie that the React tree can read at SSR or first paint:

```
value = base64url(JSON) + "." + base64url(HMAC-SHA256(USER_DATA_SECRET, base64url(JSON)))
```

Verified server-side in `parseUserDataCookie()` with `timingSafeEqual`. Tampering produces `null` and the UI falls back to a logged-out state until the auth fetch returns. The signing key is `USER_DATA_SECRET` (validated as `min(32)` and required in production by `lib/validation/env-validation.ts`); a missing key falls back to `CSRF_SECRET` only outside production.

The payload is intentionally tiny — `{ user_id, username, avatar, banner, pex, balance }` — and is regenerated by every endpoint that mutates one of those fields (avatar upload, balance top-up, role change, etc.) via `setUserDataCookie(user, isLocalhost)`.

## Cookie Settings

```ts
// session_id (lib/auth/session-manager.ts)
{
  maxAge: SESSION_TIMEOUT / 1000,  // 1 hour
  httpOnly: true,
  secure: production && !isLocalhost,
  sameSite: 'strict',
  path: '/',
}

// token (lib/auth/index.ts via setAuthCookie)
{
  maxAge: appConfig.token.maxAge,  // 1 year
  httpOnly: true,
  secure: production && !isLocalhost,
  sameSite: 'lax',                 // 'lax' so OAuth redirects keep the cookie
  path: '/',
  domain: getCookieDomain(host),   // e.g. .rvn.market for cross-subdomain SSO
}

// user_data (lib/auth/user-cookie.server.ts → getUserDataCookieOptions)
{
  maxAge: appConfig.userData.maxAge,
  httpOnly: false,
  secure: production && !isLocalhost,
  sameSite: 'lax',
  path: '/',
  domain: getCookieDomain(host),
}
```

`getCookieDomain()` (`lib/utils/index.ts`) returns the registrable domain (e.g. `.rvn.market`) when the request runs on the production host, and `undefined` for `localhost` so Chrome accepts the cookie.

## Files

- `lib/auth/session-manager.ts` — `registerDevice`, `createSession`, `validateSession`, `refreshSessionCookie`, `destroyAllUserSessions`.
- `lib/auth/session-store.ts` — `ResilientSessionStore`, `RedisSessionStore`, `MemorySessionStore`.
- `lib/auth/user-cookie.server.ts` — HMAC builder/parser for the `user_data` cookie.
- `lib/auth/helper.ts` — `checkAuth`, `setUserDataCookie`.
- `lib/auth/index.ts` — `getUserByToken` (cold-start lookup), `setAuthCookie`/`clearAuthCookie`.
- `lib/utils/config.ts` — `appConfig.session`, `appConfig.token`, `appConfig.userData`.
- `lib/validation/env-validation.ts` — required `USER_DATA_SECRET` / `CSRF_SECRET`.
