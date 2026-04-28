# Role-Based Access Control (RBAC)

> **[Русская версия](rbac.md)**

## Overview

The app has three application-level roles: `user`, `support`, `admin`. There is also a **separate** admin auth system (the `admins` table populated via GitHub OAuth), used for the `/ui/panel/admin` panel — that is documented in `docs/security/protection.md`. This document is about user-facing RBAC: who can call which tRPC procedure, who sees the admin/support UI, and how the cookie-level `pex` flag works.

The mental model:

- A user owns one or more rows in `user_roles`. The default is just `'user'`.
- `tRPC` middleware (`adminProcedure`, `supportProcedure`) checks `hasUserRole()` per request before the procedure body runs.
- The signed `user_data` cookie carries a single-letter `pex` that mirrors the highest active role. UI uses it for instant rendering decisions; security decisions never use `pex`, they always go through tRPC middleware.

## Data Model

```ts
user_roles {
  id           uuid PK
  user_id      uuid FK users(id) ON DELETE CASCADE
  role         text   -- 'user' | 'support' | 'admin'
  granted_by   uuid?  -- FK admins(id), nullable for system-granted roles
  granted_at   timestamptz
  revoked_at   timestamptz?
  is_active    boolean  -- denormalized; convenience flag
  created_at   timestamptz
  updated_at   timestamptz
}
```

A row counts as "active" when `is_active = true AND revoked_at IS NULL`. Roles are append-only — revocation is a soft delete (sets `is_active = false` and `revoked_at`).

The `'user'` role is implicit: every authenticated user has it whether or not a row exists. `getUserRoles(userId)` always includes `'user'` in the result.

## Granting & Revoking

`lib/auth/user-roles.ts` exposes:

| Function | What it does |
|----------|--------------|
| `hasUserRole(userId, role)` | Single boolean check, cached 5 s in-process. |
| `getUserRoles(userId)` | All active roles for a user. |
| `batchHasUserRole(userIds, role)` / `batchGetUserRoles(userIds)` | Single-query batch lookups for admin lists. |
| `grantUserRole(userId, role, grantedBy)` | UPSERTs an active row. Refuses to grant `'user'` (it's implicit) or duplicate-grant an active role. Cleans up stale inactive rows for the same `(userId, role)` to prevent unique-constraint races. |
| `revokeUserRole(userId, role, revokedBy)` | Sets `is_active = false`, `revoked_at = now()` on every active matching row. Cache-invalidates `user_role:<userId>:<role>`. |
| `getUsersByRole(role)` | Lists active holders of a role (admin UI). |

All grant/revoke operations are followed by a cache.delete on `user_role:<userId>:<role>` so the next `hasUserRole` call hits the DB.

## tRPC Middleware

`lib/trpc/init.ts` defines the procedure factories:

```ts
export const protectedProcedure  = publicProcedure.use(rateLimited).use(authed);
export const adminProcedure      = publicProcedure.use(rateLimited).use(adminAuthed);
export const supportProcedure    = publicProcedure.use(rateLimited).use(supportAuthed);
```

| Procedure | Requirement |
|-----------|-------------|
| `publicProcedure` | None (still rate-limited). |
| `protectedProcedure` | Authenticated user (any role). |
| `supportProcedure` | Authenticated and `hasUserRole(user.id, 'support')` **or** `hasUserRole(user.id, 'admin')`. Admins can do everything support can. |
| `adminProcedure` | Authenticated and `hasUserRole(user.id, 'admin')`. |

`adminAuthed` and `supportAuthed` look up the user via `checkAuth(ctx.req)` first, then perform the role check. If either fails, the procedure throws `TRPCError({ code: 'UNAUTHORIZED' })` or `'FORBIDDEN'` and the handler body never runs. The middleware also enriches `ctx` with `isAdmin` / `isSupport` flags so handlers can branch without a second DB hit.

Side-channel attempts (calling an admin procedure with a forged `pex` in `user_data`) don't help: the cookie is not consulted for authorization. Authorization always comes from `user_roles` via `hasUserRole`.

## Proxy-Level Access

The Edge proxy at `lib/proxy/auth.ts` does **not** enforce RBAC for the `/ui/panel/admin` SPA itself — comments in the code state explicitly that the panel page is allowed through and authentication happens inside the page (server component → tRPC). What the proxy does enforce:

- Auth pages (`/auth/...`) bypass auth.
- Public APIs and the public support page bypass auth.
- Other protected routes redirect anonymous users to `/auth`.

This is intentional: client-side routing in the admin panel needs to render a "loading… checking access" state, so the proxy doesn't 401 the HTML shell. The actual data fetches inside the panel all go through `adminProcedure` and 403/401 if the user is not an admin.

## The `pex` Cookie Flag

The signed `user_data` cookie (see `docs/auth/sessions.md`) contains:

```ts
{
  user_id, username, avatar, banner,
  pex: 'u' | 's' | 'a',  // highest role: u = user, s = support, a = admin
  balance,
}
```

`pex` is set in `setUserDataCookie(user, isLocalhost)` in `lib/auth/helper.ts`:

```ts
const isAdmin   = await hasUserRole(user.id, 'admin');
const isSupport = await hasUserRole(user.id, 'support');
const pex = isAdmin ? 'a' : isSupport ? 's' : 'u';
```

Since the cookie is HMAC-signed (`USER_DATA_SECRET`), a client cannot bump their own `pex` — tampering breaks signature verification and `parseUserDataCookie` returns null.

`pex` is consumed by the navigation components for instant rendering:

- Show "Admin Panel" link when `pex === 'a'`.
- Show "Support" badge when `pex === 's'`.
- Branch user-menu icon/colors.

`pex` is **not** consumed by tRPC handlers, route handlers, or the proxy. It is purely a UX hint. The single source of truth for authorization is the `user_roles` table.

## Cache Invalidation on Role Change

When an admin grants or revokes a role, the user's open sessions still hold a stale `pex` and may have a stale `user_data` cookie. The fix is two-fold:

1. `grantUserRole` / `revokeUserRole` call `cache.delete('user_role:<userId>:<role>')` so the next tRPC call sees the fresh role.
2. `setUserDataCookie` is re-issued on every endpoint that needs an up-to-date snapshot (admin role-change endpoints, profile updates, balance top-up, etc.). The cookie is regenerated server-side using the user's current roles.

There is no global "force log out on role change" — the next request that goes through `setUserDataCookie` updates the cookie in place. tRPC procedures are always safe because middleware reads `user_roles` directly and ignores `pex`.

## Files

- `lib/auth/user-roles.ts` — `UserRole` type, `hasUserRole`, `grantUserRole`, `revokeUserRole`, batch helpers.
- `lib/trpc/init.ts` — `authed`, `supportAuthed`, `adminAuthed` middleware; `protectedProcedure`, `supportProcedure`, `adminProcedure` factories.
- `lib/auth/helper.ts` — `setUserDataCookie` (computes `pex`).
- `lib/auth/user-cookie.server.ts` — `createUserDataCookie` / `parseUserDataCookie`.
- `lib/proxy/auth.ts` — proxy-level routing decisions (does NOT enforce role).
- `components/navigation/UserMenu.tsx`, `components/navigation/MobileNavigation.tsx` — example consumers of `pex`.
