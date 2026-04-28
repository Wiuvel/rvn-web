# OAuth Providers

> **[Русская версия](oauth.md)**

## Overview

Five user-facing OAuth providers (Google, Yandex, Twitch, VK, Telegram) and one admin-only provider (GitHub) plug into the same login and registration flow. Each provider lives under `app/api/auth/oauth/<provider>/{route,callback/route}.ts` and ends up in the shared `createUserFromOAuth` / `getUserByEmail` paths in `lib/auth/index.ts`.

The auth UI runs the OAuth dance in a popup window via `app/auth/oauth-handler/page.tsx` and the parent `components/auth/Form.tsx` listens for `postMessage` from the popup. A non-popup fallback is supported by every callback (the user is redirected directly to `/auth?error=…` or `/dashboard` instead).

```
[Auth form / Form.tsx]
       │
       ▼
window.open('/api/auth/oauth/<provider>?popup=true', '_blank')
       │
       ▼
[GET /api/auth/oauth/<provider>]
  • generate CSRF state (32 random bytes hex)
  • store oauth_state cookie (10 min, httpOnly)
  • redirect to provider authorization URL
       │
       ▼
[Provider login + consent screen]
       │
       ▼
[GET /api/auth/oauth/<provider>/callback]
  • verify state cookie ↔ state query
  • exchange code for access token
  • fetch user info
  • createUserFromOAuth() or getUserByEmail()
  • SessionManager.registerDevice() + createSession()
  • set token + session_id + user_data cookies
  • redirect to /auth/oauth-handler (popup) or /dashboard (full page)
       │
       ▼
[oauth-handler postMessage('success') → parent → reload]
```

## Provider Matrix

| Provider | Flow | Token endpoint | User-info endpoint | Identifier | Notes |
|----------|------|----------------|--------------------|------------|-------|
| Google | OAuth 2.0 (`response_type=code`, scope `openid email profile`) | `https://oauth2.googleapis.com/token` | `https://www.googleapis.com/oauth2/v2/userinfo` | `email` | `prompt=consent`, `access_type=offline` |
| Yandex | OAuth 2.0 | `https://oauth.yandex.ru/token` | `https://login.yandex.ru/info` | `default_email` (or `emails[0]`) | Verified by Yandex on their side |
| Twitch | OAuth 2.0 | `https://id.twitch.tv/oauth2/token` | `https://api.twitch.tv/helix/users` | `email` | Requires `Client-Id` header on user-info call |
| VK | OAuth 2.0 (legacy `vk.com/method/users.get`) | `https://oauth.vk.com/access_token` | `https://api.vk.com/method/users.get` | `email` returned from token endpoint | API version is pinned in the request |
| Telegram | Telegram Login Widget (HMAC-signed query, no token exchange) | n/a | n/a | `id` (Telegram numeric ID) | Hash verification with `secret_key = SHA-256(bot_token)` |
| GitHub (admin) | OAuth 2.0, restricted to `Wiuvel/rvn-web` collaborators | `https://github.com/login/oauth/access_token` | `https://api.github.com/user` | `login` checked against `trustedGithubDevelopers` table | Admin-only path under `app/api/admin/oauth/github` |

## CSRF: `oauth_state` Cookie

Every initiation route generates `state = randomBytes(32).toString('hex')` and stores it in an httpOnly cookie:

```ts
response.cookies.set('oauth_state', stateWithPopup, {
  maxAge: 10 * 60,
  httpOnly: true,
  secure: !isLocalhost && production,
  sameSite: 'lax',
  path: '/',
});
```

The `state` is also passed to the provider as a query parameter. On callback both values must match — otherwise `getErrorRedirectUrl('invalid_state', …)` is returned.

If the request was opened from the popup at `/auth/oauth-handler`, the value gets a `:popup` suffix so the callback knows to redirect back to `oauth-handler` instead of the regular `/auth` page. The suffix is stripped before comparison.

## Popup vs. Full Page

The same callback handles both flows — the difference is the final redirect target.

| Path | Used when | Redirect target |
|------|-----------|-----------------|
| Popup | Form opened the provider in `window.open(…, '_blank')`. Detected via stored `state` containing `:popup`, `referer` containing `/auth/oauth-handler`, or `?popup=true` in URL | `/auth/oauth-handler?error=<code>&popup=true` (or `?success=true`) |
| Full page | Provider was opened in the same tab (e.g. mobile fallback) | `/auth?error=<code>` or `/dashboard` |

Some errors are popup-specific (`popup_blocked`, `popup_closed`, `popup_timeout`) and always redirect to `/auth?error=…` regardless of the original flow — see `POPUP_SPECIFIC_ERRORS` in `lib/utils/oauth-errors.ts`.

## Telegram Hash Verification

Telegram does not implement standard OAuth 2.0. Instead, the Telegram Login Widget redirects the browser to the callback with `id`, `auth_date`, `hash` (and optionally `first_name`, `last_name`, `username`, `photo_url`) in the query string.

The callback verifies the integrity of these parameters server-side:

```
secret_key      = SHA-256(bot_token)
data_check_str  = sorted("key=value\n…")  // alphabetical, excludes 'hash'
expected_hash   = HMAC-SHA-256(secret_key, data_check_str).hex()

if (expected_hash !== hash) → invalid_hash
if (now - auth_date > 24h) → auth_expired
```

The `bot_id` portion of `TELEGRAM_BOT_TOKEN` is also used during the initiation phase to build the widget URL — see `lib/utils/telegram-bot.ts`.

## Account Linking

`createUserFromOAuth` in `lib/auth/index.ts` is idempotent. The lookup order is:

1. **By OAuth `provider_id`** (`google_<sub>`, `yandex_<id>`, `twitch_<id>`, `vk_<uid>`, `telegram_<id>`) — exact match means returning user.
2. **By email** for providers that return one — links the new OAuth identity to an existing local account on first use.
3. **Create new user** — username is derived from the provider (display name or sanitized email local-part), avatar URL is copied if present, balance starts at 0, default role `user`.

Telegram has no email, so step 2 is skipped — it can only link an existing account if the same Telegram ID is already on file.

## Error Codes

All error codes (provider-side and internal) are normalized through `lib/utils/oauth-errors.ts` to short generic strings (`oauth_denied`, `rate_limit`, `invalid_state`, `token_exchange_failed`, `no_email`, `account_disabled`, `popup_blocked`, …). The mapping table is intentionally provider-agnostic so the user sees `Авторизация отменена` whether Google or Twitch returned the error.

The Russian-localized message for each code lives in `OAUTH_ERROR_MESSAGES`. Provider-specific quirks (e.g. Google's `access_denied` vs. `unauthorized_client`) are translated through `GOOGLE_ERROR_MAP` before lookup.

## Rate Limiting

Both initiation and callback go through `authRateLimit.check(request)` — 10 requests per IP per 5 minutes (`appConfig.rateLimit.auth`, see `lib/security/rate-limit.ts`). On rate-limit hit the user is redirected to `/auth?error=rate_limit` (or popup equivalent), no provider call is made.

## Environment

Each provider is opt-in: missing credentials → `oauth_not_configured` redirect. Required env vars (validated in `lib/validation/env-validation.ts`):

| Provider | Variables |
|----------|-----------|
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Yandex | `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET` |
| Twitch | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` |
| VK | `VK_CLIENT_ID`, `VK_CLIENT_SECRET` |
| Telegram | `TELEGRAM_BOT_TOKEN` |
| GitHub (admin) | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_ADMIN_ALLOWED_LOGINS` |

Redirect URIs registered with each provider must point to `https://<NEXT_PUBLIC_DOMAIN>/api/auth/oauth/<provider>/callback`. For local development, add `http://localhost:3000/api/auth/oauth/<provider>/callback` to the same OAuth app.

## Files

- `app/api/auth/oauth/<provider>/route.ts` — initiation
- `app/api/auth/oauth/<provider>/callback/route.ts` — token exchange + user info
- `app/api/admin/oauth/github/{route,callback/route}.ts` — admin-only flow
- `app/auth/oauth-handler/page.tsx` — popup-handler page (postMessage to parent)
- `lib/auth/index.ts` — `createUserFromOAuth`, `getUserByEmail`
- `lib/utils/oauth-errors.ts` — generic error codes + RU messages
- `lib/utils/telegram-bot.ts` — bot ID resolver for Telegram widget URL
