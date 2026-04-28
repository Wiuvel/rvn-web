# Role-Based Access Control (RBAC)

> **[English version](rbac.en.md)**

## Обзор

В приложении три роли уровня application: `user`, `support`, `admin`. Существует ещё **отдельная** админская система авторизации (таблица `admins`, заполняемая через GitHub OAuth), которой пользуется панель `/ui/panel/admin` — она описана в `docs/security/protection.md`. Этот документ — про user-facing RBAC: кто может вызывать какую tRPC-процедуру, кто видит admin/support UI и как работает cookie-флаг `pex`.

Модель такая:

- У пользователя есть одна или несколько строк в `user_roles`. По умолчанию только `'user'`.
- `tRPC` middleware (`adminProcedure`, `supportProcedure`) проверяет `hasUserRole()` на каждый запрос, **до** тела процедуры.
- Подписанная cookie `user_data` несёт однобуквенный `pex`, отражающий старшую активную роль. UI использует его для мгновенных решений рендера; security-решения **никогда** не используют `pex`, они всегда идут через tRPC middleware.

## Модель данных

```ts
user_roles {
  id           uuid PK
  user_id      uuid FK users(id) ON DELETE CASCADE
  role         text   -- 'user' | 'support' | 'admin'
  granted_by   uuid?  -- FK admins(id), nullable для system-granted ролей
  granted_at   timestamptz
  revoked_at   timestamptz?
  is_active    boolean -- денормализованный convenience-флаг
  created_at   timestamptz
  updated_at   timestamptz
}
```

Строка считается «активной», если `is_active = true AND revoked_at IS NULL`. Роли append-only — отзыв это soft delete (`is_active = false`, `revoked_at = now()`).

Роль `'user'` неявная: она есть у каждого авторизованного пользователя независимо от наличия строки. `getUserRoles(userId)` всегда добавляет `'user'` в результат.

## Выдача и отзыв

`lib/auth/user-roles.ts`:

| Функция | Что делает |
|---------|------------|
| `hasUserRole(userId, role)` | Один булев чек, кэшируется на 5 секунд in-process. |
| `getUserRoles(userId)` | Все активные роли пользователя. |
| `batchHasUserRole(userIds, role)` / `batchGetUserRoles(userIds)` | Batch-запросы одной SQL для admin-листингов. |
| `grantUserRole(userId, role, grantedBy)` | UPSERT активной строки. Не даёт выдать `'user'` (она неявная) и не даёт повторно выдать уже активную роль. Чистит «мёртвые» неактивные строки для той же `(userId, role)`, чтобы избежать гонок по unique-constraint. |
| `revokeUserRole(userId, role, revokedBy)` | Ставит `is_active = false`, `revoked_at = now()` на всех активных строках. Чистит кэш `user_role:<userId>:<role>`. |
| `getUsersByRole(role)` | Список активных носителей роли (для админского UI). |

Все grant/revoke операции после себя делают `cache.delete('user_role:<userId>:<role>')`, чтобы следующий вызов `hasUserRole` ушёл в БД.

## tRPC middleware

`lib/trpc/init.ts` определяет фабрики процедур:

```ts
export const protectedProcedure  = publicProcedure.use(rateLimited).use(authed);
export const adminProcedure      = publicProcedure.use(rateLimited).use(adminAuthed);
export const supportProcedure    = publicProcedure.use(rateLimited).use(supportAuthed);
```

| Процедура | Требование |
|-----------|------------|
| `publicProcedure` | Нет (но rate-limit всё равно работает). |
| `protectedProcedure` | Авторизованный пользователь любой роли. |
| `supportProcedure` | Авторизован и `hasUserRole(user.id, 'support')` **или** `hasUserRole(user.id, 'admin')`. Админы могут всё, что могут support. |
| `adminProcedure` | Авторизован и `hasUserRole(user.id, 'admin')`. |

`adminAuthed` и `supportAuthed` сначала резолвят пользователя через `checkAuth(ctx.req)`, потом делают role check. Если что-то из этого падает, процедура бросает `TRPCError({ code: 'UNAUTHORIZED' })` или `'FORBIDDEN'`, и тело обработчика не выполняется. Middleware также добавляет в `ctx` флаги `isAdmin` / `isSupport`, чтобы handler'ы могли ветвиться без второго похода в БД.

Side-channel-атаки (вызов admin-процедуры с подделанным `pex` в `user_data`) не работают: cookie не используется для авторизации. Авторизация всегда идёт из `user_roles` через `hasUserRole`.

## Доступ на уровне прокси

Edge-прокси `lib/proxy/auth.ts` **не** энфорсит RBAC для самого SPA `/ui/panel/admin` — комментарии в коде явно сообщают, что HTML-страница панели пропускается, а проверка авторизации происходит внутри страницы (server component → tRPC). Что прокси действительно проверяет:

- `/auth/...` пропускается без авторизации.
- Публичные API и публичная страница support пропускаются без авторизации.
- Остальные защищённые роуты редиректят анонимов на `/auth`.

Это сделано намеренно: client-side роутинг внутри admin-панели хочет показать «загрузка… проверяем доступ», поэтому прокси не должен возвращать 401 на сам HTML-shell. Все реальные data-запросы внутри панели идут через `adminProcedure` и получат 403/401, если пользователь не админ.

## Cookie-флаг `pex`

Подписанная cookie `user_data` (см. `docs/auth/sessions.md`) содержит:

```ts
{
  user_id, username, avatar, banner,
  pex: 'u' | 's' | 'a',  // старшая роль: u = user, s = support, a = admin
  balance,
}
```

`pex` выставляется в `setUserDataCookie(user, isLocalhost)` из `lib/auth/helper.ts`:

```ts
const isAdmin   = await hasUserRole(user.id, 'admin');
const isSupport = await hasUserRole(user.id, 'support');
const pex = isAdmin ? 'a' : isSupport ? 's' : 'u';
```

Так как cookie HMAC-подписана (`USER_DATA_SECRET`), клиент не может «накрутить» себе `pex` — подделка ломает проверку подписи и `parseUserDataCookie` возвращает null.

`pex` используется навигационными компонентами для мгновенного рендера:

- Показать ссылку «Admin Panel», если `pex === 'a'`.
- Показать значок «Support», если `pex === 's'`.
- Подобрать иконку/цвет в user-menu.

`pex` **не** используется tRPC-handler'ами, route-handler'ами или прокси. Это чисто UX-подсказка. Источник правды для авторизации — таблица `user_roles`.

## Инвалидация кэша при смене роли

Когда админ выдаёт или отзывает роль, активные сессии пользователя ещё держат старый `pex` и могут хранить устаревший `user_data` cookie. Решение двуногое:

1. `grantUserRole` / `revokeUserRole` делают `cache.delete('user_role:<userId>:<role>')`, чтобы следующий tRPC-вызов увидел свежую роль.
2. `setUserDataCookie` переустанавливается каждым эндпоинтом, которому важен актуальный snapshot (эндпоинты смены роли, обновление профиля, пополнение баланса и т.д.). Cookie пересобирается на сервере по текущим ролям.

Глобальной «выкини из всех сессий при смене роли» нет — следующий запрос, проходящий через `setUserDataCookie`, обновит cookie на месте. tRPC-процедуры остаются безопасными в любом случае: middleware читает `user_roles` напрямую и игнорирует `pex`.

## Файлы

- `lib/auth/user-roles.ts` — тип `UserRole`, `hasUserRole`, `grantUserRole`, `revokeUserRole`, batch-хелперы.
- `lib/trpc/init.ts` — middleware `authed`, `supportAuthed`, `adminAuthed`; фабрики `protectedProcedure`, `supportProcedure`, `adminProcedure`.
- `lib/auth/helper.ts` — `setUserDataCookie` (считает `pex`).
- `lib/auth/user-cookie.server.ts` — `createUserDataCookie` / `parseUserDataCookie`.
- `lib/proxy/auth.ts` — решения уровня прокси (роль НЕ проверяет).
- `components/navigation/UserMenu.tsx`, `components/navigation/MobileNavigation.tsx` — пример потребителей `pex`.
