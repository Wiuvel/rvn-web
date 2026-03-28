# Архитектура аутентификации

> **[English version](architecture.en.md)**

## Обзор

Система аутентификации построена на **двухуровневой модели сессий**: долгоживущий device token (привязан к устройству) + короткоживущая серверная сессия (привязана к вкладке). Поддерживается авторизация по паролю и OAuth (Google, Telegram, Twitch, VK, Yandex). Администраторы имеют отдельный контур аутентификации.

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

## Потоки аутентификации

### Регистрация по паролю

1. Клиент отправляет `auth.register` (tRPC) с `username` + `password` + CSRF-токеном
2. Валидация: username >= 3 символов, password >= 6 символов
3. Проверка уникальности username (case-insensitive)
4. Хеширование пароля: **Argon2id** (memoryCost: 8192, timeCost: 2, parallelism: 1)
5. Генерация `userId` (7-значный ID, 0000000–9999999)
6. Создание записи в `users`
7. Регистрация устройства → `user_devices` (генерация device token, 256 бит / 64 hex символа)
8. Создание сессии → Redis / in-memory
9. Установка cookies: `session_id`, `token`, `user_data`

### Вход по паролю

```
Клиент                          Сервер
  │                                │
  │  auth.login(username, pass)    │
  │───────────────────────────────►│
  │                                ├─ Case-insensitive поиск username
  │                                ├─ Проверка is_active
  │                                ├─ Проверка password_hash != NULL (не OAuth)
  │                                ├─ Timing-safe argon2.verify + random delay
  │                                ├─ Обновление last_login
  │                                ├─ SessionManager.registerDevice()
  │                                ├─ SessionManager.createSession()
  │                                │
  │  Set-Cookie: session_id,       │
  │              token, user_data  │
  │◄───────────────────────────────│
```

**Защита от timing-атак**: даже при несуществующем пользователе выполняется вычисление хеша + случайная задержка 50–150 мс.

### Вход через OAuth

```
Клиент                  OAuth Provider           Сервер
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
  │                          │  5. Создание/поиск   │
  │                          │     пользователя     │
  │                          │  6. Регистрация      │
  │                          │     устройства       │
  │                          │  7. Создание сессии  │
  │                          │                      │
  │  Set-Cookie + redirect   │                      │
  │◄────────────────────────────────────────────────│
```

**Провайдеры**: Google, Telegram, Twitch, VK, Yandex

**Особенности**:
- CSRF-токен передаётся в `state` параметре OAuth
- Поддержка popup-окна (флаг `:popup` в state cookie)
- Username из OAuth санитизируется: только `[a-zA-Z0-9_-]`, 3–30 символов
- При коллизии username: добавляется суффикс `_1`, `_2`, ..., `_100`, fallback `_{timestamp}`
- OAuth-пользователи не могут входить по паролю (`passwordHash = NULL`)
- FPID из cookie `rvn_fpid` используется для группировки устройств (Layer 2)

### Аутентификация администратора

Администраторы имеют **отдельный контур**: своя таблица `admins`, свои cookies, своя сессия.

| Аспект | Пользователь | Администратор |
|--------|-------------|---------------|
| Таблица | `users` | `admins` |
| Cookie сессии | `session_id` | `admin_sid` |
| Cookie токена | `token` | `admin_token` |
| TTL сессии | 12 часов | 6 часов |
| OAuth | Google, Telegram, Twitch, VK, Yandex | GitHub (trusted developers) |
| Device tracking | Да (Layer 1 + 2) | Нет |

**GitHub OAuth для админов**: проверяется наличие username/email в таблице `trusted_github_developers`. Если есть — автоматическое создание/вход в админ-аккаунт. Иначе — отказ.

**Root-админ**: первый созданный админ получает `isRoot = true`. Не может быть удалён, имеет доступ к привилегированным операциям.

## Архитектура сессий

### Двухуровневая модель

```
┌──────────────────────────────────────────────────┐
│                    Browser                       │
│                                                  │
│  Cookie: token ──────┐   Cookie: session_id ──┐  │
│  (7 дней, httpOnly)  │   (12 часов, httpOnly) │  │
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

**Token** — долгоживущий (7 дней). Привязан к устройству через `user_devices`. Используется для восстановления сессии.

**Session** — короткоживущая (12 часов, sliding). Хранит контекст запроса. Привязана к token через `tokenFingerprint` (HMAC-SHA256).

### Валидация запроса

```
1. Есть token + session_id?
   ├─ Да → Валидация сессии (IP, UA, tokenFingerprint)
   │        ├─ Валидна → ✓ Аутентифицирован
   │        └─ Невалидна → Попытка recovery (refresh)
   └─ Нет session_id, но есть token?
      ├─ Token валиден → Создать новую сессию (refresh)
      └─ Token невалиден → ✗ Не аутентифицирован
```

**Token Binding**: сессия содержит `tokenFingerprint = HMAC-SHA256(token, CSRF_SECRET)`. При каждом запросе проверяется, что fingerprint сессии совпадает с fingerprint текущего token. Это предотвращает подмену токена.

### Sliding Expiration

Каждый успешный запрос продлевает TTL сессии на полный `SESSION_TIMEOUT` (12 часов). Redis: `SETEX`, in-memory: обновление `expiresAt`.

## Отслеживание устройств

### Layer 1: Client-Side FPID

```
IndexedDB: rvn_device
├── fpid store
│   └── { fpid: "MP_XXXXXXXXXXXXXX", time: "2025-01-01T..." }
└── rb_sync store
    └── { hash: MD5(fpid:time), lastSentTime: ... }
```

- Генерируется один раз при первом посещении
- Формат: `MP_` + 12 случайных символов
- Передаётся серверу через cookie `rvn_fpid` (5 мин TTL, только при OAuth)
- Удаляется из cookie после использования

### Layer 2: Server-Side Grouping

```
deviceFpHash = SHA256(normalizeUA(userAgent) + normalizeIP(ip) + fpid)
```

При регистрации устройства:
1. Если есть FPID → вычислить `deviceFpHash`
2. Найти существующее устройство с тем же `userId` + `deviceFpHash`
3. Если найдено → обновить (не создавать дубликат)
4. Если не найдено → создать новое устройство

**Результат**: один физический браузер = одна запись в `user_devices`, даже при многократных OAuth-входах.

## Cookies

### Пользовательские

| Cookie | Значение | httpOnly | Secure | SameSite | Время жизни |
|--------|----------|----------|--------|----------|-------------|
| `session_id` | Random ID | Да | prod | strict | 12 часов (sliding) |
| `token` | Device token (генерируется в `SessionManager.registerDevice()`) | Да | prod | strict | 7 дней |
| `user_data` | `{payload}.{hmac}` (base64url) | Нет | prod | lax | 7 дней |
| `rvn_fpid` | `MP_XXXX...` | Нет | — | lax | 5 минут |
| `oauth_state` | CSRF token (`:popup` опционально) | Нет | — | lax | Сессия |
| `access_token` | `{base64url_payload}.{hmac_hex}` | Да | prod | strict | 12 часов |

### Администраторские

| Cookie | Значение | httpOnly | Время жизни |
|--------|----------|----------|-------------|
| `admin_sid` | Random ID | Да | 6 часов |
| `admin_token` | 64-char hex | Да | 6 часов |
| `admin_username` | Sanitized username | Да | 6 часов |

### Структура `user_data`

Cookie `user_data` — единственная, читаемая клиентом. Содержит подписанный HMAC-SHA256 payload:

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

## Система ролей

### Доступные роли

| Роль | Описание | Выдача |
|------|----------|--------|
| `user` | Базовая (по умолчанию) | Автоматически при регистрации |
| `support` | Поддержка | Вручную админом |
| `admin` | Администратор | Вручную админом |

### Хранение

Таблица `user_roles`:
```
id, userId, role, grantedBy, grantedAt, revokedAt, isActive
```

Активная роль: `isActive = true AND revokedAt IS NULL`.

### Проверка ролей

- `hasUserRole(userId, role)` — кешируется на 5 секунд
- `batchHasUserRole(userIds[], role)` — batch-проверка для списков (N+1 оптимизация)
- Роль `user` не может быть выдана/отозвана (всегда есть)

### tRPC Middleware

| Процедура | Middleware | Доступ |
|-----------|-----------|--------|
| `publicProcedure` | — | Все |
| `authRateLimitedProcedure` | authRateLimit | `/login`, `/register` (10 запросов/5 мин) |
| `protectedProcedure` | rateLimited + authed | Авторизованные пользователи |
| `adminProcedure` | rateLimited + adminAuthed | Пользователи с ролью `admin` |
| `supportProcedure` | rateLimited + supportAuthed | Пользователи с ролью `support` или `admin` |
| `adminPanelProcedure` | rateLimited + adminPanelAuthed | Отдельная авторизация через `admin_sid` |

## Rate Limiting

| Лимитер | Окно | Макс. запросов | Ключ | Применение |
|---------|------|----------------|------|------------|
| `authRateLimit` | 5 мин | 10 | IP + UA (50 символов) | Вход, регистрация, OAuth |
| `generalRateLimit` | 5 мин | 100 | IP | Все защищённые эндпоинты |
| `messageRateLimit` | 5 мин | 50 | IP или userId | Отправка сообщений |

**Иммунитет**: после прохождения CAPTCHA rate limit пропускается на `RATE_LIMIT_IMMUNITY_DURATION`.

## Безопасность

| Мера | Реализация |
|------|------------|
| Хеширование паролей | Argon2id (memoryCost: 8192, timeCost: 2, parallelism: 1) |
| Timing-safe верификация | Фиктивный хеш + random delay 50–150 мс |
| CSRF-защита | Токен в OAuth state + tRPC мутациях |
| Token Binding | HMAC-SHA256 fingerprint привязывает сессию к токену |
| Session Fixation | Уничтожение старой сессии при входе |
| XSS-защита | httpOnly cookies для token/session_id |
| SameSite | strict для auth cookies, lax для user_data |
| updated_at | Управляется триггером БД `update_updated_at_column()` (BEFORE UPDATE) |

## Ключевые файлы

| Файл | Описание |
|------|----------|
| `lib/auth/index.ts` | Регистрация, вход, создание пользователей, хеширование |
| `lib/auth/session-manager.ts` | Управление сессиями, устройства, fingerprinting |
| `lib/auth/helper.ts` | `getCurrentUser()`, проверка аутентификации |
| `lib/auth/user-roles.ts` | Выдача/отзыв/проверка ролей |
| `lib/auth/user-cookie.server.ts` | Установка/чтение/удаление cookies |
| `lib/trpc/routers/auth.ts` | tRPC эндпоинты аутентификации |
| `lib/trpc/init.ts` | Middleware: authed, adminAuthed, supportAuthed |
| `app/api/auth/oauth/*/callback/route.ts` | OAuth callback'и для каждого провайдера |

## Схема БД

```sql
-- Пользователи
users (id, user_id, username, password_hash, avatar, banner, is_active,
       last_login, created_at, updated_at)

-- Устройства пользователей (хранят device token)
user_devices (id, user_id→users, token_hash, device_name, ip_address,
              location, device_fp_hash, last_active, created_at, updated_at)

-- Роли
user_roles (id, user_id→users, role, granted_by→admins, granted_at,
            revoked_at, is_active, created_at, updated_at)

-- Администраторы (отдельная таблица)
admins (id, username, password_hash, token, is_root, created_at, updated_at)

-- Доверенные GitHub-разработчики (для OAuth админов)
trusted_github_developers (id, email, github_username, created_by→admins,
                           created_at, updated_at)
```
