# Admin panel

> **[Русская версия](admin-panel.md)**

Platform control panel at `app/ui/panel/admin`: users and roles, servers and plans (Remnawave), support analytics, maintenance mode. It has its **own authentication**, separate from user auth.

## Related documents

- [RBAC](../security/rbac.en.md) — `user` / `support` / `admin` roles, grant/revoke, the `pex` flag.
- [Sessions & Cookies](../auth/sessions.en.md) — `SessionManager`, which the admin session is also built on.
- [OAuth providers](../auth/oauth.en.md) — the shared OAuth flow (admin login goes through GitHub).
- [Subscriptions & Payments](../subscriptions/subscriptions.en.md) — the Remnawave plans configured here.
- [Support system](../support/support.en.md) — the data behind the "Analytics" tab.
- [Bot protection](../security/protection.en.md) and [headers](../security/headers.en.md) — middleware and headers.

## Authentication (a separate track)

The admin panel does **not** use user sessions. It runs on its own cookies and its own middleware:

| Element | Value |
|---------|-------|
| Cookies | `admin_sid`, `admin_token`, `admin_username` |
| Middleware | `adminPanelAuthed` → `adminPanelProcedure` (`lib/trpc/init.ts:104`) |
| Sessions | `SessionManager.validateSession` (same store as users) |
| Login | GitHub OAuth (`app/api/admin/oauth/github/callback`) |

### GitHub login + trusted developers

```
GitHub OAuth  ──▶  callback  ──▶  check trusted_github_developers
                                   (by email OR github_username)
                                          │
                                  trusted? │ yes
                                          ▼
                                 upsert into admins (is_root)
                                          │
                                          ▼
                         SessionManager → admin_sid / admin_token
```

The `trusted_github_developers` table (email and/or `github_username`) is the allow-list of who may log in. On the first successful login an `admins` row is created; `is_root` marks the root administrator (checked via `checkRoot`). The list is managed on the "Settings" tab (`TrustedDevelopersSettings`, procedures `admin.trustedDevs.{list,add,remove}`).

> Pragmatic takeaway: before a production deploy you must register at least one administrator — without one, parts of the system (e.g. Remnawave configuration) stay unconfigured. See [graceful degradation in subscriptions](../subscriptions/subscriptions.en.md).

## Tabs

`AdminPanelContent` renders the tabs; the active one is persisted to `localStorage` (`admin_panel_active_tab`):

| Tab | Content |
|-----|---------|
| Overview | Summary (`teamCount`, etc.) |
| Users | List, ban, grant/revoke `support` / `admin` roles |
| Servers | Remnawave VPN nodes |
| Analytics | Support metrics (`SupportAnalytics`, `admin.supportAnalytics`) |
| Remnawave | Panel connection (`RemnawaveSettings`) |
| Subscriptions | Subscription plans (`SubscriptionPlansSettings`) |
| Settings | Trusted developers, maintenance mode |

## tRPC router (`lib/trpc/routers/admin.ts`)

All procedures are `adminPanelProcedure` (require an admin session).

| Group | Procedures | Purpose |
|-------|------------|---------|
| `checkRoot` | — | Whether the current admin is root (`is_root`) |
| `users` | `list`, `roles.get`, `roles.grant`, `roles.revoke` | Users and roles |
| `teamCount` | — | Team size (cache `admin:team_count` + `revalidateTag`) |
| `supportAnalytics` | — | Ticket aggregates for the "Analytics" tab |
| `trustedDevs` | `list`, `add`, `remove` | GitHub login allow-list |
| `remnawave` | `get`, `update`, `healthCheck`, `squads` | Remnawave panel config |
| `subscriptionPlans` | `list`, `save` | Plans (JSON in `panel_settings`) |
| `maintenance` | `get`, `update` | Maintenance mode |

Remnawave config and plans are stored in the `panel_settings` key-value table, not in env. Integration details and graceful degradation when the panel is unconfigured: [Subscriptions & Payments](../subscriptions/subscriptions.en.md).

## Maintenance mode

`maintenance.update` writes the config (active flag, `scheduled_start` / `scheduled_end` window, message) to `panel_settings`; `MaintenanceModal` edits it. While active, user routes show a maintenance page.

## Role grants and cache invalidation

`users.roles.grant` / `revoke` change a user's roles and invalidate the related caches (`admin:team_count`, `revalidateTag('team-count')`) plus the user's auth cache, so the new role and `pex` flag take effect without a re-login. Role and `pex` semantics: [RBAC](../security/rbac.en.md).

## Key files

| File | Role |
|------|------|
| `app/ui/panel/admin/page.tsx` / `layout.tsx` | Panel entry point |
| `app/api/admin/oauth/github/callback/route.ts` | Admin GitHub login |
| `lib/trpc/routers/admin.ts` | Admin operations router |
| `lib/trpc/init.ts` | `adminPanelAuthed` / `adminPanelProcedure` |
| `components/admin/AdminPanelContent.tsx` | Tabs and UI |
| `components/admin/RemnawaveSettings.tsx` | Remnawave connection |
| `components/admin/SubscriptionPlansSettings.tsx` | Plans |
| `components/admin/TrustedDevelopersSettings.tsx` | Login allow-list |
| `components/admin/MaintenanceModal.tsx` | Maintenance mode |
| `components/admin/SupportAnalytics.tsx` | Support analytics |
