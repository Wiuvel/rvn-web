# Защита от ботов и DDoS

> **[English version](protection.en.md)**

## Обзор

Слой защиты — это многоступенчатый фильтр, который выполняется **до** каждого нестатического запроса и решает: пропустить посетителя в приложение, отправить его на страницу Cloudflare Turnstile, или жёстко ограничить по rate limit. Реализован в proxy-middleware и сочетает четыре независимых сигнала: подписанная access-кука, sliding-window rate limit в Redis, многофакторный «suspicion score» и страница challenge'а.

```
                     ┌──────────────────────────────────────┐
   запрос ─────────► │ proxy.ts (Edge middleware)           │
                     │  1. shouldBypassProxy (статика, _rsc)│
                     │  2. handleProtection ◄──────────┐    │
                     │  3. handleAuth                  │    │
                     │  4. applySecurityHeaders        │    │
                     └─────────────────┬───────────────┘    │
                                       │                    │
                                       ▼                    │
                  ┌──────────────────────────────────────┐  │
                  │  handleProtection                    │  │
                  │  ──────────────────────────────────  │  │
                  │  ① access_token cookie валидна? ────►│──┘ allow
                  │     (HMAC-SHA256, ≤ 12ч)             │
                  │                                      │
                  │  ② IP rate limit (Redis sliding,     │
                  │     30 req/min) ── превышен? ───────►│ protection
                  │                                      │
                  │  ③ suspicion score ≥ 30 ────────────►│ protection
                  │     (UA, headers, IP, bot pattern)   │
                  │                                      │
                  │  ④ ничего из перечисленного ────────►│ allow
                  └──────────────────────────────────────┘
```

Защита покрывает все страницы приложения, кроме статики, OAuth-callback'ов, веток `/auth/**` и самой страницы `/protection`. У tRPC-вызовов есть собственный per-procedure rate limit, описанный ниже.

## Компоненты

### 1. Точка входа proxy

`proxy.ts` — единственный middleware в проекте. Запускается в Edge Runtime Next.js и обрабатывает запросы строго в этом порядке:

1. **`shouldBypassProxy`** — пропустить статику, API-эндпоинты, RSC-prefetch и т.п. (matcher в `proxy.ts` и `lib/proxy/utils.ts`).
2. **`handleProtection`** (`lib/proxy/protection.ts`) — слой защиты от ботов/DDoS (этот документ).
3. **`handleAuth`** (`lib/proxy/auth.ts`) — проверки авторизации/ролей для приватных маршрутов.
4. **`applySecurityHeaders`** (`lib/security/headers.ts`) — CSP, HSTS, X-Frame-Options, X-XSS-Protection.

Если `handleProtection` возвращает `NextResponse`, запрос обрывается и не доходит ни до `handleAuth`, ни до route handler'а.

### 2. Suspicion-детектор

`lib/security/suspicious-detector.ts` считает числовой **suspicion score** от 0 до 100 как сумму пяти бинарных факторов:

| Фактор | Вес | Логика |
|---|---|---|
| `suspiciousUserAgent` | 30 | Пустой/слишком короткий UA, нет `mozilla|chrome|safari|firefox|edge|opera`, или совпадение с известным regex-скрапером (`curl`, `python-requests`, `okhttp`, `headless`, `phantom`, …). |
| `missingHeaders` | 20 | Отсутствуют 2+ заголовка из `accept`, `accept-language`, `accept-encoding`, или невалидный формат (`Accept-Language` не подходит под `[a-z]{2}(-[a-z]{2})?`). |
| `suspiciousIP` | 15 | IPv4/IPv6 regex не проходит, либо IP `unknown`. |
| `botPattern` | 25 | UA совпадает с `bot|crawler|spider|scraper|headless|selenium|puppeteer|playwright`. |
| `suspiciousBehavior` | 10 | Нет `Accept-Language`, экзотический encoding и т.п. |

Вайтлист поисковых и соцсетевых ботов (`googlebot`, `yandex`, `bingbot`, `twitterbot`, `facebookexternalhit`, `telegrambot`, `discordbot`, `whatsapp`, `slurp`) обходит подсчёт полностью.

`shouldShowProtection(requestInfo, hasValidCookie)` возвращает `true`, когда **нет** валидной `access_token`-куки **и** score **≥ 30**.

### 3. Edge rate limiter (sliding window в Redis)

`handleProtection` дёргает приватный `checkRateLimit(ip)`, который через Redis sorted set реализует лимит **30 запросов в минуту на IP**:

```ts
await redis.zremrangebyscore(`rate_limit:${ip}`, 0, now - 60_000);
const count = await redis.zcard(`rate_limit:${ip}`);
if (count >= 30) return true;        // rate limited
await redis.zadd(`rate_limit:${ip}`, now, `${now}-${Math.random()}`);
await redis.expire(`rate_limit:${ip}`, 70);
```

Если Redis недоступен, проверка **деградирует «open»** (возвращает `false`) — приложение остаётся доступным, а не блокирует всех. Edge-уровень rate-лимита независим от per-procedure tRPC-лимитера и срабатывает до сопоставления маршрута.

### 4. Access-кука (`access_token`)

После того как пользователь решает Turnstile-challenge на `/protection`, tRPC-процедура `protection.verify` (`lib/trpc/routers/protection.ts`) выдаёт подписанную куку:

```
access_token = base64url({ "t": <ms since epoch> }) + "." + HMAC_SHA256(payload, TURNSTILE_SECRET_KEY)
```

Параметры куки:

| Параметр | Значение |
|---|---|
| `httpOnly` | `true` |
| `secure` | `true` (production) |
| `sameSite` | `strict` |
| `path` | `/` |
| `maxAge` | `12 * 60 * 60` (12 часов) |

`handleProtection` проверяет HMAC через Web Crypto API (`crypto.subtle.sign`) — `node:crypto` в Edge Runtime недоступен. Импортированный HMAC-ключ кэшируется в module-scope (`cachedHmacKey`), чтобы не пересоздавать его на каждом запросе.

Если HMAC сходится **и** timestamp моложе 12 ч, запрос пропускается безусловно — ни suspicion scoring, ни IP rate limit не применяются. После 12 ч кука отвергается, и пользователю снова надо пройти challenge.

### 5. Страница `/protection`

Страница challenge'а — серверный route в `app/protection/`. Клиентский скрипт лежит в `lib/scripts/protection.ts` и через `cf-turnstile` рендерит виджет с mobile-aware таймаутами (`observeDelay`, `iframeCheck`, `mainTimeout`). При успехе вызывает `protection.verify`, получает `access_token`-куку и редиректит по query-параметру `redirect=<path>` (валидируется `safeRedirect`: должен начинаться на `/`, без `//`, без `:`, без `<>`, без `javascript:`).

Если у пользователя уже есть валидная `access_token` и он зашёл на `/protection` напрямую — proxy редиректит его на `/`.

## tRPC rate limiting (per-procedure)

В дополнение к edge-уровневому Redis-лимитеру, `lib/security/rate-limit.ts` реализует in-memory класс `RateLimiter` с тремя преднастроенными экземплярами. Они подключены к tRPC-процедурам через middleware в `lib/trpc/init.ts`.

| Limiter | Окно | Лимит | Ключ | Где используется |
|---|---|---|---|---|
| `generalRateLimit` | 5 мин | 100 | IP | `protectedProcedure` (любой авторизованный tRPC-вызов), `app/api/auth/avatar`, `app/api/auth/banner`, `app/support/files/[key]`, `app/api/support/upload`. |
| `authRateLimit` | 5 мин | 10 | `${ip}-${ua.slice(0,50)}` | `auth.login`, `auth.register`, `protection.verify`, `app/api/admin/oauth/github`. |
| `messageRateLimit` | 5 мин | 50 | `message:${userId}` (custom key) | `support.sendMessage`. |

```ts
// lib/trpc/init.ts
const rateLimited = t.middleware(async ({ ctx, next }) => {
  const result = await generalRateLimit.check(ctx.req);
  if (!result.allowed) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', ... });
  return next();
});
```

### Иммунитет через CAPTCHA

Когда пользователь упирается в tRPC-лимит, клиент рендерит `RateLimitCaptcha`. Мутация `rateLimit.clear` (`lib/trpc/routers/rate-limit.ts`):

1. Верифицирует Turnstile-токен у Cloudflare.
2. Вызывает `generalRateLimit.grantImmunity(req)`, который:
   - Сбрасывает in-memory bucket для этого ключа.
   - Ставит `immuneUntil = now + RATE_LIMIT_IMMUNITY_DURATION` (`appConfig.rateLimit.immunityDuration`).
3. Ставит куку `rate_limit_immunity` (`maxAge: 15 мин`, `sameSite: lax`, `httpOnly: true`) с тем же таймстампом истечения.

`RateLimiter.check()` учитывает иммунитет двумя способами: (1) читает куку прямо из запроса — переживает рестарт процесса; (2) читает in-memory `immuneUntil` — fast path для горячих запросов на той же ноде.

> **Ограничение.** Хранилище `RateLimiter` — **per-process in-memory**. Несколько инстансов `rvn-web` не делят счётчики — кука позволяет иммунитету работать кросс-инстансно, но базовые счётчики остаются per-pod. Единственный горизонтально консистентный лимитер сегодня — Redis sliding window в `handleProtection`.

## CSRF-защита

CSRF-токены защищают неидемпотентные мутации: login, register, отправку сообщения в support. Реализация — в `lib/security/csrf.ts` + `lib/security/csrf-store.ts`.

### Формат токена

```
${sessionId}-${timestamp}-${nonce}-${signature}
```

- `sessionId` — id текущей серверной сессии (он же ключ хранения).
- `timestamp` — `Date.now()`.
- `nonce` — `randomBytes(16).toString('hex')` (32 hex-символа).
- `signature` — `HMAC_SHA256(getCSRFSecret(), \`${sessionId}-${timestamp}-${nonce}\`)`.

Время жизни — `CSRF_TOKEN_LIFETIME_MS = 1 час`.

### Хранилище

```ts
interface ICsrfStore {
  get(sessionId): Promise<{ token, createdAt } | null>;
  set(sessionId, data, ttlMs): Promise<void>;
  delete(sessionId): Promise<boolean>;
}
```

`getCsrfStore()` возвращает `RedisCsrfStore`, если `getRedisClient()` доступен, иначе `MemoryCsrfStore` (`Map` с ручным expiration). В Redis ключи имеют префикс `csrf:` и сохраняются через `SETEX`.

### Верификация (one-time use)

`verifyCSRFToken(token, sessionId, detailed?)` (`lib/security/csrf.ts`) — асинхронная:

1. Разбивает токен, проверяет структуру и совпадение `sessionId`.
2. Проверяет `now - timestamp < 1 час`.
3. Пересчитывает HMAC и сравнивает через `crypto.timingSafeEqual`.
4. **Защита от replay.** Если в хранилище токен отличается от полученного — верификация падает (`reason: 'Token already used'`). При успехе только что проверенный токен пересохраняется с новым `createdAt`, поэтому повторная попытка с **тем же** токеном пройдёт только до его замены.

`revokeCSRFToken(sessionId)` удаляет токен из хранилища; вызывается явно после успешного логина (`auth.login`, `auth.register`).

### Где применяется

| Процедура | Файл | Поведение при отсутствии/невалидности CSRF |
|---|---|---|
| `auth.csrf` | `lib/trpc/routers/auth.ts` | Выдаёт свежий токен, привязанный к текущему session id. |
| `auth.login` | `lib/trpc/routers/auth.ts` | `BAD_REQUEST`, если `verifyCSRFToken` вернул false. |
| `auth.register` | `lib/trpc/routers/auth.ts` | То же, что и `login`. |
| `auth.adminLogin` | `lib/trpc/routers/auth.ts` | То же. |
| `support.sendMessage` | `lib/trpc/routers/support.ts` | То же. |

Авторизованные tRPC-процедуры **без** явного CSRF в нём не нуждаются: они уже требуют куку `token` с `httpOnly`+`sameSite=strict`, которая сама по себе является эффективной CSRF-защитой.

## Security headers (CSP / HSTS / прочее)

`applySecurityHeaders(response, isStaticFile, request?)` вызывается на каждом не-обойдённом запросе и на статических файлах (с урезанным набором заголовков, чтобы не ломать HTTP/2).

| Заголовок | Значение |
|---|---|
| `Content-Security-Policy` | Генерируется `generateCSPHeader(isDev)` — см. ниже. На статике не ставится. |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` (только в production). |
| `X-XSS-Protection` | `1; mode=block`. |
| `X-Content-Type-Options` | `nosniff` (ставится в `next.config.ts:headers()`). |
| `X-Frame-Options` | `DENY` (ставится в `next.config.ts:headers()`). |
| `Referrer-Policy` | `strict-origin-when-cross-origin` (ставится в `next.config.ts:headers()`). |

На ответы со статикой дополнительно добавляются `Access-Control-Allow-*` заголовки, если запрос пришёл с основного домена или с одного из его поддоменов (`isSubdomain` / `isValidOrigin`).

### CSP-директивы

CSP разрешает `'self'`, основной домен (`MAIN_DOMAIN` = `domains.main`) и его поддомены, `localhost:*` в dev и `https://challenges.cloudflare.com` для виджета Turnstile. Заметные директивы:

- `script-src` содержит `'unsafe-eval' 'unsafe-inline'` — необходимо для текущего загрузчика Turnstile.
- `connect-src` и `img-src` содержат `*` — чтобы пускать сторонние картинки (аватарки через S3) и исходящие API-запросы.
- `frame-ancestors 'none'` соответствует `X-Frame-Options: DENY`.
- `upgrade-insecure-requests` добавляется в production.

## Конфигурация

| Env var | Где | Назначение |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | `protection.verify`, `rateLimit.clear`, HMAC в `proxy/protection.ts` | Серверный ключ Turnstile; одновременно — HMAC-ключ для куки `access_token`. |
| `NEXT_PUBLIC_TURNSTILE_SITEKEY` | клиентский виджет на `/protection` и `RateLimitCaptcha` | Site key Cloudflare Turnstile. |
| `CSRF_SECRET` | `lib/security/csrf.ts` | HMAC-секрет для CSRF-токенов (валидируется в `env-validation.ts`, ≥ 32 символа, не дефолтная заглушка). |
| `REDIS_URL` | `lib/proxy/protection.ts`, `lib/security/csrf-store.ts` | Опциональный. Без Redis edge-rate-limit становится no-op'ом, а CSRF откатывается на in-memory. |
| `appConfig.rateLimit.immunityDuration` | `lib/utils/constants.ts` | Длительность пост-CAPTCHA иммунитета. |

## Файлы

| Файл | Назначение |
|---|---|
| `proxy.ts` | Точка входа middleware. |
| `lib/proxy/protection.ts` | Edge-проверка ботов/DDoS, валидация `access_token`, Redis sliding-window rate limit. |
| `lib/proxy/auth.ts` | Проверки авторизации/ролей (отдельный документ: [Архитектура аутентификации](../auth/architecture.md)). |
| `lib/proxy/utils.ts` | `isStaticFile`, `shouldBypassProxy`. |
| `lib/security/suspicious-detector.ts` | Многофакторный scoring (`detectSuspiciousVisitor`, `shouldShowProtection`). |
| `lib/security/rate-limit.ts` | In-memory `RateLimiter`, три преднастроенных экземпляра, `grantImmunity`. |
| `lib/security/csrf.ts` | `generateCSRFToken`, `verifyCSRFToken`, `revokeCSRFToken`. |
| `lib/security/csrf-store.ts` | `RedisCsrfStore` + `MemoryCsrfStore` + `getCsrfStore()`. |
| `lib/security/headers.ts` | `applySecurityHeaders`, `generateCSPHeader`, `isSubdomain`, `isValidOrigin`. |
| `lib/security/cors.ts` | CORS-хелпер. |
| `lib/security/sanitize.ts` | `sanitizeInput` (используется в `auth.login`/`register`). |
| `lib/security/timing-safe.ts` | Timing-safe сравнение + рандомные задержки. |
| `lib/scripts/protection.ts` | Браузерная оркестрация Turnstile на `/protection`. |
| `lib/trpc/routers/protection.ts` | `protection.verify`, `protection.getIp`. |
| `lib/trpc/routers/rate-limit.ts` | `rateLimit.clear` (CAPTCHA-иммунитет). |
| `components/protection/ProtectionClient.tsx` | UI `/protection`. |
| `components/auth/RateLimitCaptcha.tsx` | Inline CAPTCHA-модалка по `TOO_MANY_REQUESTS`. |
| `__tests__/unit/security/suspicious-detector.test.ts` | Юнит-тесты детектора. |
| `__tests__/unit/security/security-headers.test.ts` | Тесты заголовков. |
| `__tests__/integration/api/protection.test.ts` | End-to-end сценарий защиты. |
