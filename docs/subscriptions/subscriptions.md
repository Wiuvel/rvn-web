# Подписки и платежи

> **[English version](subscriptions.en.md)**

## Обзор

Подсистема подписок продаёт VPN-доступ, провизионируя пользователей в панели [Remnawave](https://remna.st/). Web-приложение хранит каталог тарифов, журнал платежей и баланс в PostgreSQL; собственно VPN-пользователь (squad, traffic limit, subscription URL) живёт в Remnawave. Поддерживаются три способа оплаты: с баланса, по тестовому промокоду и через внешнего провайдера (с webhook'ом).

```
┌──────────────┐  trpc.subscription.purchase  ┌─────────────────┐
│   Browser    │─────────────────────────────►│  rvn-web tRPC   │
│  /subscription│                              │ subscription.ts │
└──────────────┘                              └────┬────────────┘
                                                   │
                  ┌────────────────────────────────┤
                  ▼                                ▼
        ┌──────────────────┐            ┌────────────────────┐
        │  Postgres        │            │  Remnawave panel   │
        │  subscriptions   │  rwCreate  │  /api/users        │
        │  payments        │◄──────────►│  /api/squads/...   │
        │  balance_txns    │            └────────────────────┘
        │  panel_settings  │
        └──────────────────┘                      ▲
                  ▲                               │
                  │  webhook (paymentId, status)  │
                  │                               │
        ┌─────────┴────────────┐                  │
        │ внешний провайдер    │──────────────────┘
        │ /api/webhooks/payment│
        └──────────────────────┘
```

## База данных

`lib/database/schema.ts`:

### `subscriptions`

| Колонка | Тип | Примечания |
|---------|-----|------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → `users.id`, cascade |
| `remnawave_uuid` | TEXT | UUID пользователя в Remnawave |
| `short_uuid` | TEXT | Короткий UUID для строки подключения |
| `subscription_url` | TEXT | URL для клиентских приложений |
| `status` | TEXT | `pending` \| `active` \| `expired` \| `disabled` \| `limited` |
| `plan` | TEXT | id плана (например, `base-monthly`) |
| `expire_at` | TIMESTAMPTZ | Вычисляется из `durationDays` при покупке |
| `traffic_limit_bytes` | BIGINT | `0` = без лимита |
| `traffic_limit_strategy` | TEXT | `NO_RESET` \| `DAY` \| `WEEK` \| `MONTH` \| `MONTH_ROLLING` |

Индексы: `user_id`, `status`, `expire_at`, `remnawave_uuid`.

### `payments`

| Колонка | Тип | Примечания |
|---------|-----|------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK |
| `subscription_id` | UUID | FK (nullable, проставляется после squad assignment) |
| `amount` | INTEGER | **копейки** (без float) |
| `currency` | TEXT | `RUB` |
| `status` | TEXT | `pending` \| `completed` \| `failed` |
| `provider` | TEXT | `test` \| `balance` \| `pending` (внешний) |
| `provider_payment_id` | TEXT | id платежа во внешнем провайдере |
| `promo_code` | TEXT | Применённый промокод |

### `balance_transactions`

Append-only журнал; `amount` в копейках (положительное — credit, отрицательное — debit). `type ∈ { topup, purchase, refund }`. `related_payment_id` связывает транзакцию с платежом.

`users.balance` — кэшированный текущий баланс; источник истины — журнал.

### `panel_settings`

Key/value (`text` → `text`) для настроек, редактируемых админом через `/ui/panel/admin/Remnawave` и `/ui/panel/admin/Subscription`. Используемые этим модулем ключи:

- `remnawave_endpoint`, `remnawave_api_key` — параметры подключения к Remnawave.
- `subscription_plans` — JSON `PlanConfig[]` (см. ниже).
- `test_promo_enabled`, `test_promo_code` — feature flag тестового промо.

## Конфигурация планов

`PlanConfig` (server-side):

```ts
interface PlanConfig {
  id: string;            // 'base-monthly'
  name: string;          // 'Базовая'
  description: string;
  features: string[];
  priceKopecks: number;  // 20000 = 200 RUB
  durationDays: number;  // 30
  squadUuid: string | null; // Internal Squad в Remnawave
  active: boolean;
  isStub: boolean;       // план «затемнённый» в UI
}
```

Грузится из `panel_settings.subscription_plans` JSON, кэшируется в процессе `PLANS_CONFIG_CACHE_TTL = 60 c`. Если строки нет, отдаётся единственный fallback `base-monthly`, чтобы страница не падала. **`squadUuid` никогда не уходит на клиент** — публичные `plans` / `publicPlans` его срезают.

## tRPC роутер (`lib/trpc/routers/subscription.ts`)

| Procedure | Тип | Назначение |
|-----------|-----|------------|
| `publicPlans` | `publicProcedure.query` | Тарифы для лендинга/`/subscription` (без авторизации). |
| `publicServers` | `publicProcedure.query` | Серверы Remnawave для лендинга. |
| `list` | `protectedProcedure.query` | Подписки текущего пользователя. |
| `payments` | `protectedProcedure.query` | История платежей. |
| `balance` | `protectedProcedure.query` | Текущий баланс + последние 50 операций. |
| `promoStatus` | `protectedProcedure.query` | Показывать ли поле промокода. |
| `validatePromo` | `protectedProcedure.query` | Авто-валидация с debounce. |
| `servers` | `protectedProcedure.query` | Серверы (с server-side кэшем). |
| `plans` | `protectedProcedure.query` | Активные планы без `squadUuid`. |
| `topUp` | `protectedProcedure.mutation` | Пополнение баланса по промокоду; one-shot на пользователя. |
| `purchase` | `protectedProcedure.mutation` | Покупка плана (3 пути). |
| `sync` | `protectedProcedure.mutation` | Подтянуть актуальное состояние из Remnawave. |

## Сценарий покупки (`subscription.purchase`)

Входные данные: `{ planId, payFrom: 'balance' | 'promo' | 'external', promoCode? }`.

1. **Single-active-subscription guard** — отказ, если у пользователя уже есть строка `active`.
2. Резолвим план из `panel_settings`. Отказ, если `!plan.active || plan.isStub`.
3. **Валидация промокода** — `payFrom === 'promo'` срабатывает только при `test_promo_enabled === true` и `promoCode === test_promo_code`. Тестовая покупка использует `amount = 0`, `provider = 'test'`, `status = 'completed'`.
4. **Путь оплаты с баланса** — проверка `users.balance >= plan.priceKopecks`; иначе отказ.
5. Вставка `payments` с вычисленными `(status, provider)`:
   - `'completed' / 'test'` для промо,
   - `'completed' / 'balance'` для баланса,
   - `'pending' / 'pending'` для внешнего (отдаётся `redirectUrl`, к Remnawave ещё не идём).
6. **Внешний путь возвращает сразу** `{ paymentId, status: 'pending', redirectUrl }`. Активация — позже, в webhook'е.
7. **Списание с баланса** — атомарно `users.balance -= priceKopecks` плюс запись в `balance_transactions` типа `purchase`, привязанная к платежу.
8. **Создание пользователя в Remnawave** — `rwCreateUser({ username: 'rvn_<userId>', expireAt = now + durationDays, status: 'ACTIVE' })`.
9. Если у плана задан `squadUuid` — `addUsersToSquad(squadUuid, [rwUser.uuid])`.
10. Вставка `subscriptions`, затем `payments.subscription_id = subscription.id`.
11. Инвалидация auth-кэшей: `invalidateUserAuthCacheByUserId`, `cache.delete('profile:...')`, обновление `user_data`-cookie.

**Compensation:** любая ошибка на шагах 8/9 вызывает `revertPayment()` — платёж становится `failed`, баланс возвращается с записью `refund` в журнал, пользователь Remnawave отключается (`rwDisableUser`).

## Сценарий пополнения (`subscription.topUp`)

- Вход: `{ promoCode, amount }` (копейки, ≥ 10 000 = 100 RUB).
- Промо должно быть включено и совпадать с настроенным кодом.
- One-shot guard: отказ, если у пользователя уже есть `balance_transactions.type = 'topup'`.
- Атомарный инкремент через `sql\`${users.balance} + ${amount}\``, запись в журнал, инвалидация auth-кэша, обновление `user_data`-cookie.

## Сценарий синхронизации (`subscription.sync`)

Позволяет пользователю по требованию подтянуть состояние из Remnawave. Маппинг `RemnawaveUserStatus` → локального статуса:

| Remnawave | Локально |
|-----------|----------|
| `ACTIVE` | `active` |
| `EXPIRED` | `expired` |
| `DISABLED` | `disabled` |
| `LIMITED` (default) | `limited` |

Обновляются `expire_at`, `subscription_url`, traffic-поля; в ответе — `userTraffic`.

## Webhook оплаты (`app/api/webhooks/payment/route.ts`)

- Авторизация: заголовок `x-webhook-secret` должен совпадать с `PAYMENT_WEBHOOK_SECRET`. Иначе 401.
- Тело: `{ paymentId, status: 'completed' | 'failed', providerPaymentId? }`.
- Проверяется `payment.status === 'pending'` (идемпотентно — повторы дают 409).
- Обновляются `payments.status` и `provider_payment_id`.

> ⚠️ **Известный pending (P0 в `rvn-web-review.md`):** webhook сейчас только обновляет строку. Он **ещё не запускает** провизию Remnawave для `completed` внешних платежей — есть `TODO` со списком шагов (rwCreateUser → addUsersToSquad → обновление подписки → инвалидация кэша). До дореализации внешние оплаты остаются в `pending`.

## Remnawave-клиент (`lib/api/remnawave.ts`)

REST-обёртка, используемая и тRPC-роутером, и админ-панелью. Endpoint и API-ключ берутся из `panel_settings` (кэш 60 с в `settingsCache`), поэтому админ может ротировать ключ без рестарта.

Публичные типы:
- `RemnawaveUser`, `RemnawaveUserTraffic`, `RemnawaveUserStatus`, `TrafficLimitStrategy`.
- `CreateUserParams`.
- `RemnawaveHealthMetrics`.

Возвращаемые значения — паттерн `Result<T> = { ok: true, data: T } | { ok: false, error: string }`, благодаря чему вызывающий код реагирует без `try/catch`-обвязки (см. rollback-пути в `purchase`).

## Конфигурация

| Переменная / Настройка | Где | Назначение |
|------------------------|-----|------------|
| `PAYMENT_WEBHOOK_SECRET` | env | Секрет в заголовке для webhook'а оплаты |
| `remnawave_endpoint` | `panel_settings` | Базовый URL панели |
| `remnawave_api_key` | `panel_settings` | API-ключ панели |
| `subscription_plans` | `panel_settings` | JSON `PlanConfig[]` |
| `test_promo_enabled` | `panel_settings` | Feature flag |
| `test_promo_code` | `panel_settings` | Строка промокода |

Связанные с Remnawave переменные в `.env.example` (`REMNAWAVE_ENDPOINT`, `REMNAWAVE_API_KEY`) намеренно закомментированы — на проде всё едет через `panel_settings`, чтобы админ мог менять значения без редеплоя.

## Файлы

- `lib/trpc/routers/subscription.ts` — tRPC роутер (queries, `purchase`, `topUp`, `sync`).
- `lib/api/remnawave.ts` — клиент Remnawave Panel.
- `lib/database/schema.ts` — таблицы `subscriptions`, `payments`, `balance_transactions`, `panel_settings`.
- `app/api/webhooks/payment/route.ts` — webhook от внешнего провайдера.
- `app/subscription/page.tsx` — публичная страница тарифов.
- `app/dashboard/payment/[paymentId]/page.tsx`, `app/dashboard/payment/redirect/page.tsx` — dashboard-флоу оплаты.
- `components/modals/SubscriptionPurchaseModal.tsx`, `components/modals/BalanceTopUpModal.tsx` — UI покупки/пополнения.
- `components/admin/RemnawaveSettings.tsx`, `components/admin/SubscriptionPlansSettings.tsx` — админские настройки.
