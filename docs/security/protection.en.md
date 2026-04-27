# Bot & DDoS Protection

> **[Русская версия](protection.md)**

## Overview

The protection layer is a multi-stage filter that runs **before** every non-static request and decides whether the visitor is allowed to reach the application, must solve a Cloudflare Turnstile challenge first, or should be hard-rate-limited. It is implemented in the proxy middleware and combines four orthogonal signals: a signed access cookie, a sliding-window Redis rate limiter, a multi-factor "suspicion score", and a manual challenge page.

```
                     ┌──────────────────────────────────────┐
   request ────────► │ proxy.ts (Edge middleware)           │
                     │  1. shouldBypassProxy (static, _rsc) │
                     │  2. handleProtection ◄──────────┐    │
                     │  3. handleAuth                  │    │
                     │  4. applySecurityHeaders        │    │
                     └─────────────────┬───────────────┘    │
                                       │                    │
                                       ▼                    │
                  ┌──────────────────────────────────────┐  │
                  │  handleProtection                    │  │
                  │  ──────────────────────────────────  │  │
                  │  ① access_token cookie valid? ──────►│──┘ allow
                  │     (HMAC-SHA256, ≤ 12h)             │
                  │                                      │
                  │  ② IP rate limit (Redis sliding,     │
                  │     30 req/min) ─── exceeded? ──────►│ protection
                  │                                      │
                  │  ③ suspicion score ≥ 30  ───────────►│ protection
                  │     (UA, headers, IP, bot pattern)   │
                  │                                      │
                  │  ④ none of the above ───────────────►│ allow
                  └──────────────────────────────────────┘
```

The system protects every page of the app except static assets, OAuth callbacks, the `/auth/**` tree, and the `/protection` page itself. tRPC API calls have their own per-procedure rate limiting layer described below.

## Components

### 1. Proxy entry point

`proxy.ts` is the only middleware in the project. It runs in the Next.js Edge Runtime and dispatches requests in this fixed order:

1. **`shouldBypassProxy`** — skip static files, API endpoints, RSC prefetch, etc. (matcher in `proxy.ts` and `lib/proxy/utils.ts`).
2. **`handleProtection`** (`lib/proxy/protection.ts`) — bot/DDoS layer (this document).
3. **`handleAuth`** (`lib/proxy/auth.ts`) — auth/role checks for private routes.
4. **`applySecurityHeaders`** (`lib/security/headers.ts`) — CSP, HSTS, X-Frame-Options, X-XSS-Protection.

If `handleProtection` returns a `NextResponse`, the request is short-circuited and never reaches `handleAuth` or the route handler.

### 2. Suspicion detector

`lib/security/suspicious-detector.ts` produces a numeric **suspicion score** from 0 to 100 by combining five binary factors:

| Factor | Weight | Logic |
|---|---|---|
| `suspiciousUserAgent` | 30 | Empty / very short UA, no `mozilla|chrome|safari|firefox|edge|opera`, or matches a known scraper regex (`curl`, `python-requests`, `okhttp`, `headless`, `phantom`, …). |
| `missingHeaders` | 20 | Missing two or more of `accept`, `accept-language`, `accept-encoding`, or invalid format (`Accept-Language` not matching `[a-z]{2}(-[a-z]{2})?`). |
| `suspiciousIP` | 15 | IPv4/IPv6 regex fails, or IP is `unknown`. |
| `botPattern` | 25 | UA matches `bot|crawler|spider|scraper|headless|selenium|puppeteer|playwright`. |
| `suspiciousBehavior` | 10 | No `Accept-Language`, exotic encodings, etc. |

A whitelist of search-engine and social-media bots (`googlebot`, `yandex`, `bingbot`, `twitterbot`, `facebookexternalhit`, `telegrambot`, `discordbot`, `whatsapp`, `slurp`) bypasses scoring entirely.

`shouldShowProtection(requestInfo, hasValidCookie)` returns `true` when there is **no** valid `access_token` cookie **and** the score is **≥ 30**.

### 3. Edge rate limiter (Redis sliding window)

`handleProtection` calls a private `checkRateLimit(ip)` helper that uses Redis sorted sets to enforce **30 requests/min per IP**:

```ts
await redis.zremrangebyscore(`rate_limit:${ip}`, 0, now - 60_000);
const count = await redis.zcard(`rate_limit:${ip}`);
if (count >= 30) return true;        // rate limited
await redis.zadd(`rate_limit:${ip}`, now, `${now}-${Math.random()}`);
await redis.expire(`rate_limit:${ip}`, 70);
```

If Redis is unavailable, the check **degrades open** (returns `false`) — the application stays online instead of blocking everyone. Edge-level rate limiting is independent of the per-procedure tRPC limiter and runs before any route is matched.

### 4. Access cookie (`access_token`)

After the user solves the Turnstile challenge on `/protection`, the `protection.verify` tRPC procedure (`lib/trpc/routers/protection.ts`) issues a signed cookie:

```
access_token = base64url({ "t": <ms since epoch> }) + "." + HMAC_SHA256(payload, TURNSTILE_SECRET_KEY)
```

Cookie attributes:

| Attribute | Value |
|---|---|
| `httpOnly` | `true` |
| `secure` | `true` (production) |
| `sameSite` | `strict` |
| `path` | `/` |
| `maxAge` | `12 * 60 * 60` (12 hours) |

`handleProtection` uses the Web Crypto API (`crypto.subtle.sign`) to verify the HMAC at the edge — `node:crypto` is unavailable in the Edge Runtime. The imported HMAC key is cached in module scope (`cachedHmacKey`) to avoid re-importing on every request.

If the HMAC check passes **and** the timestamp is younger than 12 h, the request is allowed unconditionally — neither suspicion scoring nor IP rate limiting applies. After 12 h, the cookie is rejected and the user must solve the challenge again.

### 5. Protection page (`/protection`)

The challenge page is a server-rendered route under `app/protection/`. Its client-side script lives in `lib/scripts/protection.ts` and uses `cf-turnstile` to render a widget, with mobile-aware timeouts (`observeDelay`, `iframeCheck`, `mainTimeout`). On success it calls `protection.verify`, receives the `access_token` cookie, and redirects to the `redirect=<path>` query parameter (validated by `safeRedirect`: must start with `/`, no `//`, no `:`, no `<>`, no `javascript:`).

If the user already has a valid `access_token` and visits `/protection` directly, the proxy redirects them to `/`.

## tRPC rate limiting (per-procedure)

In addition to the edge-level Redis limiter, `lib/security/rate-limit.ts` implements an in-memory `RateLimiter` class with three pre-configured instances. They are wired into tRPC procedures via middleware in `lib/trpc/init.ts`.

| Limiter | Window | Limit | Key | Used by |
|---|---|---|---|---|
| `generalRateLimit` | 5 min | 100 | IP | `protectedProcedure` (every authenticated tRPC call), `app/api/auth/avatar`, `app/api/auth/banner`, `app/support/files/[key]`, `app/api/support/upload`. |
| `authRateLimit` | 5 min | 10 | `${ip}-${ua.slice(0,50)}` | `auth.login`, `auth.register`, `protection.verify`, `app/api/admin/oauth/github`. |
| `messageRateLimit` | 5 min | 50 | `message:${userId}` (custom key) | `support.sendMessage`. |

```ts
// lib/trpc/init.ts
const rateLimited = t.middleware(async ({ ctx, next }) => {
  const result = await generalRateLimit.check(ctx.req);
  if (!result.allowed) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', ... });
  return next();
});
```

### CAPTCHA-based immunity

When a user hits a tRPC limit, the client renders `RateLimitCaptcha`. The `rateLimit.clear` mutation (`lib/trpc/routers/rate-limit.ts`):

1. Verifies a Turnstile token with Cloudflare.
2. Calls `generalRateLimit.grantImmunity(req)` which:
   - Resets the in-memory bucket for that key.
   - Marks `immuneUntil = now + RATE_LIMIT_IMMUNITY_DURATION` (`appConfig.rateLimit.immunityDuration`).
3. Sets a `rate_limit_immunity` cookie (`maxAge: 15 min`, `sameSite: lax`, `httpOnly: true`) carrying the same expiry timestamp.

`RateLimiter.check()` honours the immunity in two ways: (1) reading the cookie directly from the request — survives process restarts, (2) reading the in-memory `immuneUntil` field — fast path for hot requests on the same instance.

> **Limitation.** The `RateLimiter` store is **per-process in-memory**. Multiple instances of `rvn-web` do not share counters — the cookie path makes immunity work across instances, but baseline counters remain per-pod. The Redis sliding window in `handleProtection` is the only horizontally consistent limiter today.

## CSRF protection

CSRF tokens guard non-idempotent mutations: login, register, support message submission. The implementation is in `lib/security/csrf.ts` + `lib/security/csrf-store.ts`.

### Token format

```
${sessionId}-${timestamp}-${nonce}-${signature}
```

- `sessionId` — current server session id (also used as the storage key).
- `timestamp` — `Date.now()`.
- `nonce` — `randomBytes(16).toString('hex')` (32 hex chars).
- `signature` — `HMAC_SHA256(getCSRFSecret(), \`${sessionId}-${timestamp}-${nonce}\`)`.

The lifetime is `CSRF_TOKEN_LIFETIME_MS = 1 hour`.

### Storage

```ts
interface ICsrfStore {
  get(sessionId): Promise<{ token, createdAt } | null>;
  set(sessionId, data, ttlMs): Promise<void>;
  delete(sessionId): Promise<boolean>;
}
```

`getCsrfStore()` returns `RedisCsrfStore` when `getRedisClient()` is available, otherwise `MemoryCsrfStore` (a `Map` with manual expiration). Redis keys are prefixed with `csrf:` and stored via `SETEX`.

### Verification (one-time use)

`verifyCSRFToken(token, sessionId, detailed?)` (in `lib/security/csrf.ts`) is asynchronous:

1. Splits the token, validates structure and `sessionId` match.
2. Checks `now - timestamp < 1 hour`.
3. Recomputes the HMAC and compares with `crypto.timingSafeEqual`.
4. **Replay protection.** If the stored entry's token differs from the supplied token, verification fails (`reason: 'Token already used'`). On success the freshly verified token is re-saved with a new `createdAt`, so the next attempt with the **same** token will pass only as long as it has not been replaced.

`revokeCSRFToken(sessionId)` deletes the stored token and is called explicitly after successful login (`auth.login`, `auth.register`).

### Where it is required

| Procedure | File | Behaviour on missing/invalid CSRF |
|---|---|---|
| `auth.csrf` | `lib/trpc/routers/auth.ts` | Issues a fresh token bound to the current session id. |
| `auth.login` | `lib/trpc/routers/auth.ts` | `BAD_REQUEST` if `verifyCSRFToken` returns false. |
| `auth.register` | `lib/trpc/routers/auth.ts` | Same as `login`. |
| `auth.adminLogin` | `lib/trpc/routers/auth.ts` | Same. |
| `support.sendMessage` | `lib/trpc/routers/support.ts` | Same. |

Authenticated tRPC procedures **without** explicit CSRF do not need it because they already require a `httpOnly`+`sameSite=strict` `token` cookie, which is itself an effective CSRF defence.

## Security headers (CSP / HSTS / etc.)

`applySecurityHeaders(response, isStaticFile, request?)` is called on every non-bypassed request and on static files (with a reduced header set to avoid HTTP/2 protocol errors).

| Header | Value |
|---|---|
| `Content-Security-Policy` | Generated by `generateCSPHeader(isDev)` — see below. Not set on static files. |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` (production only). |
| `X-XSS-Protection` | `1; mode=block`. |
| `X-Content-Type-Options` | `nosniff` (set by `next.config.ts:headers()`). |
| `X-Frame-Options` | `DENY` (set by `next.config.ts:headers()`). |
| `Referrer-Policy` | `strict-origin-when-cross-origin` (set by `next.config.ts:headers()`). |

Static-file responses additionally receive `Access-Control-Allow-*` headers when the request originates from the main domain or one of its subdomains (`isSubdomain` / `isValidOrigin`).

### CSP directives

Generated CSP allows `'self'`, the main domain (`MAIN_DOMAIN` = `domains.main`) and its subdomains, `localhost:*` in dev, and `https://challenges.cloudflare.com` for the Turnstile widget. Notable directives:

- `script-src` includes `'unsafe-eval' 'unsafe-inline'` — required for the current Turnstile loader.
- `connect-src` and `img-src` include `*` to allow third-party images (avatars proxied via S3) and outbound API calls.
- `frame-ancestors 'none'` matches `X-Frame-Options: DENY`.
- `upgrade-insecure-requests` is appended in production.

## Configuration

| Env var | Where | Purpose |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | `protection.verify`, `rateLimit.clear`, `proxy/protection.ts` HMAC | Server-side Turnstile key; doubles as the HMAC key for the `access_token` cookie. |
| `NEXT_PUBLIC_TURNSTILE_SITEKEY` | client widget on `/protection` and `RateLimitCaptcha` | Cloudflare Turnstile site key. |
| `CSRF_SECRET` | `lib/security/csrf.ts` | HMAC secret for CSRF tokens (validated by `env-validation.ts`, must be ≥ 32 chars and not the placeholder default). |
| `REDIS_URL` | `lib/proxy/protection.ts`, `lib/security/csrf-store.ts` | Optional. Without Redis the edge rate limiter becomes a no-op and CSRF falls back to in-memory. |
| `appConfig.rateLimit.immunityDuration` | `lib/utils/constants.ts` | Length of the post-CAPTCHA immunity window. |

## Files

| File | Purpose |
|---|---|
| `proxy.ts` | Middleware entry point. |
| `lib/proxy/protection.ts` | Edge bot/DDoS check, `access_token` validation, Redis sliding-window rate limit. |
| `lib/proxy/auth.ts` | Auth/role checks (separate document: [Authentication architecture](../auth/architecture.en.md)). |
| `lib/proxy/utils.ts` | `isStaticFile`, `shouldBypassProxy`. |
| `lib/security/suspicious-detector.ts` | Multi-factor scoring (`detectSuspiciousVisitor`, `shouldShowProtection`). |
| `lib/security/rate-limit.ts` | In-memory `RateLimiter`, three pre-configured instances, `grantImmunity`. |
| `lib/security/csrf.ts` | `generateCSRFToken`, `verifyCSRFToken`, `revokeCSRFToken`. |
| `lib/security/csrf-store.ts` | `RedisCsrfStore` + `MemoryCsrfStore` + `getCsrfStore()`. |
| `lib/security/headers.ts` | `applySecurityHeaders`, `generateCSPHeader`, `isSubdomain`, `isValidOrigin`. |
| `lib/security/cors.ts` | CORS helper. |
| `lib/security/sanitize.ts` | `sanitizeInput` (used in `auth.login`/`register`). |
| `lib/security/timing-safe.ts` | Timing-safe equality + random delay helpers. |
| `lib/scripts/protection.ts` | Browser-side Turnstile orchestration on `/protection`. |
| `lib/trpc/routers/protection.ts` | `protection.verify`, `protection.getIp`. |
| `lib/trpc/routers/rate-limit.ts` | `rateLimit.clear` (CAPTCHA-based immunity). |
| `components/protection/ProtectionClient.tsx` | UI of `/protection`. |
| `components/auth/RateLimitCaptcha.tsx` | Inline CAPTCHA modal triggered by `TOO_MANY_REQUESTS`. |
| `__tests__/unit/security/suspicious-detector.test.ts` | Detector unit tests. |
| `__tests__/unit/security/security-headers.test.ts` | Header tests. |
| `__tests__/integration/api/protection.test.ts` | End-to-end protection flow. |
