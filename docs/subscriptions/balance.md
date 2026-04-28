# Баланс и промокоды

> **[English version](balance.en.md)**

## Обзор

Денежное состояние живёт в трёх таблицах: `users.balance` (текущий остаток), `payments` (одна строка на каждое пополнение или покупку, независимо от способа оплаты) и `balance_transactions` (append-only лог каждого зачисления/списания). Все суммы хранятся в **копейках** в виде PostgreSQL `integer` — никаких float'ов в pipeline нет. Чтобы показать 200,00 ₽, читаем `2000000` и делим на 100 в UI-слое.

Текущий баланс пользователя — единственный источник правды на строке `users`. Лог (`balance_transactions`) делает баланс восстановимым; таблица `payments` — аудитопригодными счета.

## Схема

```ts
users {
  …
  balance integer NOT NULL DEFAULT 0    -- текущий баланс, копейки
}

payments {
  id                  uuid PK
  user_id             uuid FK users(id) ON DELETE CASCADE
  subscription_id     uuid? FK subscriptions(id) ON DELETE SET NULL
  amount              integer NOT NULL   -- копейки; 0 для test promo
  currency            text NOT NULL DEFAULT 'RUB'
  status              text NOT NULL DEFAULT 'pending'   -- pending|completed|failed
  provider            text NOT NULL DEFAULT 'test'      -- test|balance|<gateway>|pending
  provider_payment_id text?
  promo_code          text?
  metadata            text?              -- JSON, специфика конкретного шлюза
  created_at, updated_at  timestamptz
}

balance_transactions {
  id                  uuid PK
  user_id             uuid FK users(id) ON DELETE CASCADE
  amount              integer NOT NULL    -- > 0: зачисление, < 0: списание
  type                text NOT NULL       -- topup|purchase|refund|…
  description         text?
  related_payment_id  uuid? FK payments(id) ON DELETE SET NULL
  created_at          timestamptz
}
```

Тройка `(payments, balance_transactions, users.balance)` сознательно избыточна: любая из трёх восстанавливается по двум другим. Сверка делается периодически, не в рантайме.

## Пополнение (test promo)

`subscription.topUp` (`lib/trpc/routers/subscription.ts`) — единственный сейчас доступный пользователю канал зачисления:

```
[Клиент]
  promoCode + amount (копейки, ≥ 10000)
        │
        ▼
[subscription.topUp]
  • getTestPromoSettings(): { enabled, code }
  • если выключено OR promoCode !== code → BAD_REQUEST
  • SELECT id FROM balance_transactions
      WHERE user_id = $1 AND type = 'topup' LIMIT 1
    если нашли → BAD_REQUEST 'Промокод уже использован'   // одноразовый на пользователя
        │
        ▼
  • UPDATE users SET balance = balance + amount       -- атомарный SQL-инкремент
  • INSERT balance_transactions (amount, type='topup')
  • invalidateUserAuthCacheByUserId(userId)
  • cache.delete('profile:<userId>')
  • setUserDataCookie(updatedUser)                    -- balance в pex-cookie актуален
```

Свойства:

- **Атомарно**: апдейт балансa — `SET balance = balance + $amount`, без read-modify-write race.
- **Идемпотентно на пользователя**: каждый пользователь может применить test-promo не больше одного раза. Повторный вызов вернёт `Промокод уже использован`.
- **Только тест**: промо включается через `panel_settings.test_promo_enabled`. Если выключить — новые пополнения недоступны; ранее зачисленные балансы не трогаются.
- **Без строки в `payments`**: пополнение по промокоду — это чисто запись в ledger, не чек. Нет «счёта», который надо выставить.

## Покупка

`subscription.purchase` — путь списания. На входе один из трёх режимов `payFrom`:

```
payFrom = 'balance' | 'promo' | 'external'
```

### `payFrom = 'balance'`

1. Отказ, если у пользователя уже есть активная подписка.
2. Резолвим план из `panel_settings.subscription_plans` (cached 60 с); план-stub или не-active отбрасываем.
3. Читаем `users.balance`; отказ если `< plan.priceKopecks`.
4. INSERT в `payments` с `provider: 'balance'`, `status: 'completed'`.
5. `UPDATE users SET balance = balance - priceKopecks` (атомарно).
6. INSERT `balance_transactions(amount = -priceKopecks, type='purchase', related_payment_id)`.
7. Прогоняем provisioning Remnawave-пользователя/squad. На фейле → `revertPayment()` отменяет и `payments` (status `failed`), и списание балансa (с компенсирующей записью `balance_transactions(type='refund')`).

### `payFrom = 'promo'`

Test-promo путь. Если test-promo включено и `promoCode` совпадает, покупка помечается `isTest`. Эффекты:

- `amount = 0` (строка `payments` создаётся с нулевой суммой для целостности учёта).
- `provider = 'test'`, `status = 'completed'`.
- Баланс **не** списывается — пользователь получает подписку «бесплатно».
- Запись `balance_transactions` для самой покупки не пишется; test-promo трактуется как out-of-band кредит.

### `payFrom = 'external'`

1. Отказ, если уже есть активная подписка; затем резолвим план.
2. INSERT в `payments` с `provider: 'pending'`, `status: 'pending'`.
3. Возвращаем `{ paymentId, status: 'pending', redirectUrl: '/dashboard/payment/redirect?paymentId=…' }`.
4. Внешний платёжный шлюз позже зовёт `/api/webhooks/payment`, чтобы пометить платёж `completed` и триггернуть Remnawave-provisioning. **Оговорка:** webhook-обработчик сейчас не финализирует подписку — открытый P0-пункт в `rvn-web-review.md`.

`revertPayment()` шарится между balance и external путями; ставит `payments.status = 'failed'`, и только когда платёж был списан с балансa, добавляет refund-запись в `balance_transactions`.

## Промокоды

Сегодня в системе есть один промокод — «test», хранится в `panel_settings`:

```
panel_settings:
  test_promo_enabled  -> 'true' | 'false'
  test_promo_code     -> '<любая строка>'
```

Обе строки читаются вместе через `getTestPromoSettings()` и кэшируются на 60 с в `lib/database/cache`. `subscription.validatePromo` — это read-only чек для UI (live-валидация при вводе), state он не меняет. `subscription.promoStatus` возвращает `{ enabled }`, чтобы UI мог скрыть поле для промокода целиком, когда test-режим выключен.

У промокода сейчас два эффекта:

| Где используется | Эффект |
|------------------|--------|
| `topUp({ promoCode, amount })` | Зачисляет `amount` копеек один раз на пользователя, type `'topup'`. |
| `purchase({ payFrom: 'promo', promoCode })` | Выдаёт подписку по цене 0 (`isTest` flow). |

Универсальной системы скидок, персональных кодов, истечения срока и usage-cap (кроме per-user one-shot для `topUp`) нет. Что-то амбициознее (многоуровневые купоны, реферальные коды, gift cards) потребует новой схемы — таких таблиц пока нет.

## Чтение

`subscription.balance` (protected procedure):

```ts
{
  balance: number,                        // текущий баланс, копейки
  transactions: Array<{
    id, amount, type, description, createdAt
  }>                                      // последние 50 записей, новые сверху
}
```

`subscription.payments` возвращает историю платежей пользователя (`payments`, все статусы, новые сверху) — используется на вкладке биллинга.

Обе процедуры protected и берут `ctx.user.id` сами; `userId` из input они не принимают.

## Инвалидация кэша и cookie

Cookie `user_data` (см. `docs/auth/sessions.md`, `docs/security/rbac.md`) несёт в себе `balance` для мгновенной отрисовки UI. Любой эндпоинт, который меняет баланс, обязан:

1. Делать SQL-апдейт одной командой (без read-modify-write).
2. Звать `invalidateUserAuthCacheByUserId(userId)`, чтобы сбросить per-user auth-кэш `getUserByToken`.
3. Звать `cache.delete('profile:<userId>')`, чтобы сбросить кэш profile-router'а.
4. Звать `setUserDataCookie(freshUser, isLocalhost)`, чтобы браузер увидел новый баланс на следующем рендере.

`subscription.topUp` делает все четыре; `subscription.purchase` делает (1)–(3) и полагается на следующий auth-refresh, чтобы cookie обновилась. Если добавляете новый путь, который трогает баланс, повторите все четыре шага — иначе UI-компоненты, читающие `pex.balance`, будут отставать от БД до следующей полной авторизации.

## Открытые вопросы

- **Финализация webhook'а** для `payFrom='external'` не реализована — шлюз может пометить платёж `completed`, но провижн Remnawave + активация подписки ещё не подключены. Отслеживается как P0 в security/quality-ревью.
- **Сверка возвратов** работает best-effort: если Remnawave-provisioning упал, баланс возвращается, payment ставится в `failed`, но если процесс крашнулся между INSERT в `payments` и вызовом Remnawave, строка останется `completed` без подписки. Фонового реконсайлера сейчас нет.
- **Multi-currency** сделан только на уровне схемы — `payments.currency` есть, но все пути захардкожены на `'RUB'` и копейки.

## Файлы

- `lib/trpc/routers/subscription.ts` — `payments`, `balance`, `promoStatus`, `validatePromo`, `topUp`, `purchase`.
- `lib/database/schema.ts` — `payments`, `balanceTransactions`, `subscriptions`, `panelSettings`, `users.balance`.
- `lib/api/remnawave.ts` — клиент Remnawave-provisioning, который зовёт `purchase`.
- `lib/auth/helper.ts` — `setUserDataCookie` (перевыставляет cookie с новым балансом).
- `lib/auth/index.ts` — `invalidateUserAuthCacheByUserId`.
- `app/api/webhooks/payment/route.ts` — webhook внешнего шлюза (незавершённый).
