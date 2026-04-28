# Сессии и cookie

> **[English version](sessions.en.md)**

## Обзор

Состояние авторизации разнесено по трём cookie и одной серверной записи в session store. Каждая cookie выполняет свою задачу и живёт своё время:

| Cookie | httpOnly | Max-age | Назначение |
|--------|---------:|--------:|------------|
| `token` | да | 1 год | Долгоживущий токен устройства. Сервер хеширует его, чтобы найти пользователя на cold-start, и привязывает к активной сессии через `tokenFingerprint`. |
| `session_id` | да | 1 час | Короткий ID в Redis (или in-memory) session store. Хранит IP, User-Agent, `tokenFingerprint`, время последней активности. |
| `user_data` | нет | 1 год | HMAC-подписанный JSON-снапшот `{ user_id, username, avatar, banner, pex, balance }` для быстрой отрисовки UI до того, как ответит auth-запрос. |

Дефолты заданы в `lib/utils/config.ts` (`appConfig.session`, `appConfig.token`, `appConfig.userData`).

## Серверный session store

`lib/auth/session-store.ts` экспортирует `ResilientSessionStore`, который прозрачно переключается между Redis и in-memory map.

- **Основной backend**: Redis. Ключи: `session:<id>` (сам `SessionData`-блоб) и `user_sessions:<userId>` (Set с ID сессий для быстрого массового revoke).
- **Fallback**: in-memory `Map<string, SessionData>` с периодической очисткой. Используется только пока Redis недоступен; такие сессии видны только текущему Node-процессу и пропадают при рестарте.
- **Самовосстановление**: каждый вызов сначала пробует Redis. Когда Redis вернётся — новые сессии снова идут туда, старые in-memory просто истекут по TTL.

Структура `SessionData`:

```ts
{
  id: string;
  userId: string;
  username: string;
  tokenFingerprint: string; // HMAC(token) — пустая строка для админских сессий
  createdAt: number;        // ms epoch
  lastActivity: number;     // ms epoch, обновляется на каждый get()
  ipAddress: string;
  userAgent: string;
}
```

`get()` работает как sliding TTL: проставляет `lastActivity = now` и переуказывает Redis-TTL. Сессии, не активные дольше `SESSION_TIMEOUT` (`appConfig.session.timeout` = 1 час), удаляются на месте.

## Token binding

Токены и сессии связываются через HMAC, не через прямое равенство, чтобы ни одна сторона не раскрывала другую:

```
tokenFingerprint = HMAC-SHA256(USER_DATA_SECRET || CSRF_SECRET, token)
tokenHash        = SHA256(token)              // лежит в user_devices
```

- `tokenFingerprint` хранится внутри `SessionData`. На `validateSession()` сервер пересчитывает его из cookie `token` и отвергает запрос при несовпадении.
- `tokenHash` хранится в `user_devices`. Позволяет идентифицировать устройство, владеющее токеном, не расшифровывая сам токен.
- У админских сессий `tokenFingerprint = ''` и эта проверка пропускается (у них нет долгоживущей `token`-cookie).

## Жизненный цикл

### Логин / OAuth callback

1. `SessionManager.registerDevice(userId, ua, ip, fpid)` — INSERT (или UPDATE) в `user_devices`, возвращает raw token. Layer 2 группировка по `device_fp_hash` дедуплицирует строку при повторных входах с того же устройства — см. `docs/auth/device-fingerprint.md`.
2. `SessionManager.createSession(userId, username, ip, ua, token, 'user')` — пишет `SessionData` в Redis, возвращает `sessionId`.
3. Выставляются три cookie:
   - `token` → 1-летняя httpOnly через хелперы `app/api/auth/token/route.ts`.
   - `session_id` → 1-часовая httpOnly через `SessionManager.setSessionCookie(sessionId, isLocalhost)`.
   - `user_data` → HMAC-подписанный снапшот через `setUserDataCookie(user, isLocalhost)` из `lib/auth/helper.ts`.

### На каждом авторизованном запросе (`checkAuth`)

`lib/auth/helper.ts → checkAuth(request, options)` определяет пользователя по cookie:

1. **Нет `token`** → не авторизован.
2. **Есть только `token`, нет `session_id`** → cold-start. Ищем пользователя по `tokenHash`, затем автоматически создаём новую сессию (`refresh flow`) и переустанавливаем `session_id`. Пропускается, если `options.readOnly = true` (Server Components могут прочитать пользователя, но не могут выставлять cookie).
3. **Есть `token` + `session_id`** → вызов `SessionManager.validateSession(sessionId, token, ip, ua)`. Проверки:
   - Token binding (`tokenFingerprint` должен совпасть с HMAC текущего `token`).
   - User-Agent, нормализованный до `<browser>:<os>`. При несовпадении пишется WARN-лог, сохранённый UA обновляется, но запрос **не** отклоняется.
   - IP. По умолчанию мягко: тот же `/24` (IPv4) или первые 4 сегмента (IPv6). Строгий IP включается через `validateSession(..., { strictIP: true })` — используется для чувствительных админских операций.

Если валидация провалилась, сервер чистит `session_id` (и при необходимости `token`), клиент считается неавторизованным.

### Refresh

Cookie `session_id` естественным образом истекает после 1 часа неактивности. Следующий запрос всё ещё содержит `token`, поэтому `checkAuth` уходит в refresh-ветку и создаёт новую сессию. Пользователь не видит логаута.

`SessionManager.refreshSessionCookie()` дополнительно вызывается из путей с rate-limit, чтобы продлевать cookie, пока сессия ещё жива в Redis.

### Logout

- **Одно устройство**: `SessionManager.destroySession(sessionId)` + `clearSessionCookie('session_id')` + удаление строки `user_devices` по `tokenHash` (`SessionManager.revokeDevice(token)`) + чистка cookie `token` и `user_data`.
- **Все остальные устройства**: `SessionManager.revokeOtherDevices(userId, currentToken)` (удаляет все строки `user_devices`, у которых `tokenHash !== currentTokenHash`) и `destroyAllUserSessions(userId)` за вычетом текущего `sessionId`. Используется в `/user/settings/security` («Выйти везде»).
- **Принудительная инвалидация админом**: `destroyAllUserSessions(userId)` также вызывается, когда админ блокирует аккаунт или забирает роль — следующий запрос пользователя приведёт к разлогину.

## Cookie `user_data`

`lib/auth/user-cookie.server.ts` собирает не-httpOnly cookie, которую React-дерево читает на SSR или при первой отрисовке:

```
value = base64url(JSON) + "." + base64url(HMAC-SHA256(USER_DATA_SECRET, base64url(JSON)))
```

Проверяется на сервере через `parseUserDataCookie()` с `timingSafeEqual`. Подделка вернёт `null` и UI остаётся в logged-out до ответа auth-запроса. Ключ подписи — `USER_DATA_SECRET` (валидируется как `min(32)` и обязателен в production по zod-схеме `lib/validation/env-validation.ts`); если он отсутствует, в не-production fallback используется `CSRF_SECRET`.

Payload намеренно маленький — `{ user_id, username, avatar, banner, pex, balance }` — и обновляется каждым эндпоинтом, который меняет одно из этих полей (загрузка аватарки, пополнение баланса, выдача роли и т.д.) через `setUserDataCookie(user, isLocalhost)`.

## Опции cookie

```ts
// session_id (lib/auth/session-manager.ts)
{
  maxAge: SESSION_TIMEOUT / 1000,  // 1 час
  httpOnly: true,
  secure: production && !isLocalhost,
  sameSite: 'strict',
  path: '/',
}

// token (lib/auth/index.ts → setAuthCookie)
{
  maxAge: appConfig.token.maxAge,  // 1 год
  httpOnly: true,
  secure: production && !isLocalhost,
  sameSite: 'lax',                 // 'lax', чтобы cookie выживала в OAuth-редиректах
  path: '/',
  domain: getCookieDomain(host),   // например, .rvn.market для cross-subdomain SSO
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

`getCookieDomain()` (`lib/utils/index.ts`) возвращает регистрируемый домен (например, `.rvn.market`), когда запрос идёт с production-хоста, и `undefined` для `localhost`, чтобы Chrome принял cookie.

## Файлы

- `lib/auth/session-manager.ts` — `registerDevice`, `createSession`, `validateSession`, `refreshSessionCookie`, `destroyAllUserSessions`.
- `lib/auth/session-store.ts` — `ResilientSessionStore`, `RedisSessionStore`, `MemorySessionStore`.
- `lib/auth/user-cookie.server.ts` — HMAC builder/parser для cookie `user_data`.
- `lib/auth/helper.ts` — `checkAuth`, `setUserDataCookie`.
- `lib/auth/index.ts` — `getUserByToken` (cold-start lookup), `setAuthCookie`/`clearAuthCookie`.
- `lib/utils/config.ts` — `appConfig.session`, `appConfig.token`, `appConfig.userData`.
- `lib/validation/env-validation.ts` — обязательные `USER_DATA_SECRET` / `CSRF_SECRET`.
