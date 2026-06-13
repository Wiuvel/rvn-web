# Админ-панель

> **[English version](admin-panel.en.md)**

Панель управления платформой по адресу `app/ui/panel/admin`: пользователи и роли, серверы и тарифы (Remnawave), аналитика поддержки, режим обслуживания. Имеет **собственную аутентификацию**, отдельную от пользовательской.

## Связанные документы

- [RBAC](../security/rbac.md) — роли `user` / `support` / `admin`, выдача/отзыв ролей, флаг `pex`.
- [Сессии и cookies](../auth/sessions.md) — `SessionManager`, на котором построена и админ-сессия.
- [OAuth-провайдеры](../auth/oauth.md) — общий OAuth-флоу (вход в админку — через GitHub).
- [Подписки и платежи](../subscriptions/subscriptions.md) — тарифы Remnawave, которые настраиваются здесь.
- [Система поддержки](../support/support.md) — данные для вкладки «Аналитика».
- [Защита от ботов](../security/protection.md) и [заголовки](../security/headers.md) — middleware и заголовки.

## Аутентификация (отдельный контур)

Админ-панель **не** использует пользовательские сессии. Она работает на своих cookies и своём middleware:

| Элемент | Значение |
|---------|----------|
| Cookies | `admin_sid`, `admin_token`, `admin_username` |
| Middleware | `adminPanelAuthed` → `adminPanelProcedure` (`lib/trpc/init.ts:104`) |
| Сессии | `SessionManager.validateSession` (тот же стор, что и у пользователей) |
| Вход | GitHub OAuth (`app/api/admin/oauth/github/callback`) |

### Вход через GitHub + доверенные разработчики

```
GitHub OAuth  ──▶  callback  ──▶  проверка trusted_github_developers
                                   (по email ИЛИ github_username)
                                          │
                              доверенный? │ да
                                          ▼
                                 upsert в admins (is_root)
                                          │
                                          ▼
                         SessionManager → admin_sid / admin_token
```

Таблица `trusted_github_developers` (email и/или `github_username`) — белый список тех, кому разрешён вход. При первом успешном входе создаётся запись в `admins`; `is_root` отмечает корневого администратора (проверяется через `checkRoot`). Управление списком — вкладка «Настройки» (`TrustedDevelopersSettings`, процедуры `admin.trustedDevs.{list,add,remove}`).

> Прагматичный вывод: перед production-деплоем нужно зарегистрировать хотя бы одну запись администратора — без неё часть системы (например, конфигурация Remnawave) остаётся ненастроенной. См. [graceful degradation в подписках](../subscriptions/subscriptions.md).

## Вкладки

`AdminPanelContent` рендерит вкладки, активная сохраняется в `localStorage` (`admin_panel_active_tab`):

| Вкладка | Содержание |
|---------|------------|
| Обзор | Сводка (`teamCount` и пр.) |
| Пользователи | Список, бан, выдача/отзыв ролей `support` / `admin` |
| Серверы | VPN-ноды Remnawave |
| Аналитика | Метрики поддержки (`SupportAnalytics`, `admin.supportAnalytics`) |
| Remnawave | Подключение к панели (`RemnawaveSettings`) |
| Подписки | Тарифные планы (`SubscriptionPlansSettings`) |
| Настройки | Доверенные разработчики, режим обслуживания |

## tRPC-роутер (`lib/trpc/routers/admin.ts`)

Все процедуры — `adminPanelProcedure` (требуют админ-сессию).

| Группа | Процедуры | Назначение |
|--------|-----------|------------|
| `checkRoot` | — | Является ли текущий админ корневым (`is_root`) |
| `users` | `list`, `roles.get`, `roles.grant`, `roles.revoke` | Пользователи и роли |
| `teamCount` | — | Размер команды (кэш `admin:team_count` + `revalidateTag`) |
| `supportAnalytics` | — | Агрегаты по тикетам для вкладки «Аналитика» |
| `trustedDevs` | `list`, `add`, `remove` | Белый список GitHub-входа |
| `remnawave` | `get`, `update`, `healthCheck`, `squads` | Конфиг панели Remnawave |
| `subscriptionPlans` | `list`, `save` | Тарифы (JSON в `panel_settings`) |
| `maintenance` | `get`, `update` | Режим обслуживания |

Конфиг Remnawave и тарифы хранятся в таблице `panel_settings` (ключ-значение), не в env. Детали интеграции и graceful degradation при ненастроенной панели — [Подписки и платежи](../subscriptions/subscriptions.md).

## Режим обслуживания

`maintenance.update` записывает конфиг (активность, окно `scheduled_start` / `scheduled_end`, сообщение) в `panel_settings`; `MaintenanceModal` редактирует его. Когда режим активен, пользовательские маршруты показывают страницу обслуживания.

## Выдача ролей и инвалидация кэша

`users.roles.grant` / `revoke` меняют роли пользователя и инвалидируют связанный кэш (`admin:team_count`, `revalidateTag('team-count')`) и аутентификационный кэш пользователя, чтобы новая роль и флаг `pex` подхватились без перелогина. Семантика ролей и `pex` — [RBAC](../security/rbac.md).

## Ключевые файлы

| Файл | Роль |
|------|------|
| `app/ui/panel/admin/page.tsx` / `layout.tsx` | Точка входа панели |
| `app/api/admin/oauth/github/callback/route.ts` | GitHub-вход админа |
| `lib/trpc/routers/admin.ts` | Роутер админ-операций |
| `lib/trpc/init.ts` | `adminPanelAuthed` / `adminPanelProcedure` |
| `components/admin/AdminPanelContent.tsx` | Вкладки и UI |
| `components/admin/RemnawaveSettings.tsx` | Подключение Remnawave |
| `components/admin/SubscriptionPlansSettings.tsx` | Тарифы |
| `components/admin/TrustedDevelopersSettings.tsx` | Белый список входа |
| `components/admin/MaintenanceModal.tsx` | Режим обслуживания |
| `components/admin/SupportAnalytics.tsx` | Аналитика поддержки |
