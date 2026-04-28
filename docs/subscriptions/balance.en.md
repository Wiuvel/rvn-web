# Balance & Promo

> **[Русская версия](balance.md)**

## Overview

Money-adjacent state lives in three tables: `users.balance` (the running total), `payments` (one row per top-up or purchase, regardless of payment method), and `balance_transactions` (the append-only ledger of every credit/debit). All amounts are stored in **kopecks** as PostgreSQL `integer` — there is no floating-point math anywhere in the pipeline. To display 200.00 ₽ you read `2000000` and divide by 100 in the UI layer.

A user's balance is the sole source of truth on their `users` row. The ledger (`balance_transactions`) is what makes the balance reconstructable; the `payments` table is what makes invoices auditable.

## Schema

```ts
users {
  …
  balance integer NOT NULL DEFAULT 0    -- current balance, kopecks
}

payments {
  id                  uuid PK
  user_id             uuid FK users(id) ON DELETE CASCADE
  subscription_id     uuid? FK subscriptions(id) ON DELETE SET NULL
  amount              integer NOT NULL   -- kopecks; 0 for test promo
  currency            text NOT NULL DEFAULT 'RUB'
  status              text NOT NULL DEFAULT 'pending'   -- pending|completed|failed
  provider            text NOT NULL DEFAULT 'test'      -- test|balance|<gateway>|pending
  provider_payment_id text?
  promo_code          text?
  metadata            text?              -- JSON blob, gateway-specific
  created_at, updated_at  timestamptz
}

balance_transactions {
  id                  uuid PK
  user_id             uuid FK users(id) ON DELETE CASCADE
  amount              integer NOT NULL    -- positive = credit, negative = debit
  type                text NOT NULL       -- topup|purchase|refund|…
  description         text?
  related_payment_id  uuid? FK payments(id) ON DELETE SET NULL
  created_at          timestamptz
}
```

The triple `(payments, balance_transactions, users.balance)` is intentionally redundant: any one of the three can be reconstructed from the other two. Reconciliation is a periodic check, not a runtime invariant.

## Top-Up Flow (Test Promo)

`subscription.topUp` (`lib/trpc/routers/subscription.ts`) is the only end-user-facing crediting path right now:

```
[Client]
  promoCode + amount (kopecks, ≥ 10000)
        │
        ▼
[subscription.topUp]
  • check getTestPromoSettings(): { enabled, code }
  • if disabled OR promoCode !== code → BAD_REQUEST
  • SELECT id FROM balance_transactions
      WHERE user_id = $1 AND type = 'topup' LIMIT 1
    if exists → BAD_REQUEST 'Промокод уже использован'   // one-shot per user
        │
        ▼
  • UPDATE users SET balance = balance + amount       -- atomic SQL increment
  • INSERT balance_transactions (amount, type='topup')
  • invalidateUserAuthCacheByUserId(userId)
  • cache.delete('profile:<userId>')
  • setUserDataCookie(updatedUser)                    -- balance reflected in pex cookie
```

Properties:

- **Atomic**: balance update is `SET balance = balance + $amount` — no read-modify-write race.
- **Idempotent per user**: every user can use the test promo at most once. Repeated calls fail with `Промокод уже использован`.
- **Test-only**: the promo is gated by `panel_settings.test_promo_enabled`. If you flip it off, no further promos can be claimed; existing balances are untouched.
- **No `payments` row**: top-ups via test promo are pure ledger events, not receipts. There is no invoice to issue.

## Purchase Flow

`subscription.purchase` is the spending path. The input picks one of three `payFrom` modes:

```
payFrom = 'balance' | 'promo' | 'external'
```

### `payFrom = 'balance'`

1. Reject if user already has an active subscription.
2. Resolve plan from `panel_settings.subscription_plans` (cached 60 s); reject stub/inactive plans.
3. Read `users.balance`; reject if `< plan.priceKopecks`.
4. INSERT `payments` row with `provider: 'balance'`, `status: 'completed'`.
5. `UPDATE users SET balance = balance - priceKopecks` (atomic).
6. INSERT `balance_transactions(amount = -priceKopecks, type='purchase', related_payment_id)`.
7. Provision Remnawave user / squad. On failure → `revertPayment()` reverses both the `payments` row (status `failed`) and the balance debit (with a matching `balance_transactions(type='refund')` entry).

### `payFrom = 'promo'`

Test promo path. If the test promo is enabled and `promoCode` matches, the purchase is flagged `isTest`. Effects:

- `amount = 0` (the `payments` row is created at zero kopecks for accounting parity).
- `provider = 'test'`, `status = 'completed'`.
- Balance is **not** debited — the user gets the subscription on the house.
- No `balance_transactions` row is written for the purchase itself; the test promo is treated as an out-of-band credit.

### `payFrom = 'external'`

1. Reject if user already has an active subscription, then resolve the plan as above.
2. INSERT `payments` row with `provider: 'pending'`, `status: 'pending'`.
3. Return `{ paymentId, status: 'pending', redirectUrl: '/dashboard/payment/redirect?paymentId=…' }`.
4. The external gateway eventually calls `/api/webhooks/payment` to mark the payment `completed` and trigger Remnawave provisioning. **Caveat:** the webhook handler currently does not finalize the subscription — see `rvn-web-review.md` (P0 item) for the open task.

`revertPayment()` is shared between balance and external paths; it sets `payments.status = 'failed'` and, only when the payment was deducted from balance, inserts a refund `balance_transactions` entry.

## Promo Codes

There is a single promo code today: a "test" code stored in `panel_settings`:

```
panel_settings:
  test_promo_enabled  -> 'true' | 'false'
  test_promo_code     -> '<arbitrary string>'
```

Both rows are read together by `getTestPromoSettings()` and cached for 60 s in `lib/database/cache`. `subscription.validatePromo` is a read-only check used by the UI for live validation while the user types — it never mutates state. `subscription.promoStatus` returns `{ enabled }` so the UI can hide the promo input entirely when test mode is off.

The promo currently has two effects:

| Used in | Effect |
|---------|--------|
| `topUp({ promoCode, amount })` | Credits `amount` kopecks once per user, type `'topup'`. |
| `purchase({ payFrom: 'promo', promoCode })` | Issues the subscription at price 0 (`isTest` flow). |

There is no general-purpose discount system, no per-user code, no expiration, no usage cap beyond the per-user one-shot for `topUp`. Anything more ambitious (multi-tier coupons, referral codes, gift cards) would require a new schema — none of those tables exist yet.

## Reads

`subscription.balance` (protected procedure):

```ts
{
  balance: number,                        // current balance, kopecks
  transactions: Array<{
    id, amount, type, description, createdAt
  }>                                      // last 50 entries, newest first
}
```

`subscription.payments` returns the user's payment history (`payments` table, all statuses, newest first) — used by the billing tab.

Both procedures are protected and trust `ctx.user.id` for scoping; they never accept a `userId` from input.

## Cache & Cookie Invalidation

The `pex` cookie (`docs/auth/sessions.md`, `docs/security/rbac.md`) carries `balance` for instant UI rendering. Any endpoint that mutates balance must:

1. Run the SQL update inside a single statement (no read-modify-write).
2. Call `invalidateUserAuthCacheByUserId(userId)` to flush the per-user auth cache used by `getUserByToken`.
3. Call `cache.delete('profile:<userId>')` to flush the profile-router cache.
4. Call `setUserDataCookie(freshUser, isLocalhost)` so the browser sees the new balance immediately on the next render.

`subscription.topUp` does all four; `subscription.purchase` does (1)–(3) and relies on the next auth refresh to update the cookie. If you add a new path that touches balance, replicate the four steps — otherwise UI components that read `pex.balance` will lag behind the DB until the next full re-auth.

## Open Items

- **Webhook finalization** for `payFrom='external'` is not implemented — the gateway can mark a payment `completed`, but Remnawave provisioning + subscription activation is not wired up yet. Tracked as a P0 in the security/quality review.
- **Refund reconciliation** is best-effort: a failed Remnawave provisioning will refund the balance and mark the payment `failed`, but if the process crashes between the `payments` insert and the Remnawave call, the row stays `completed` with no subscription. There is no background reconciler today.
- **Multi-currency** is schema-level only — `payments.currency` exists but every code path hard-codes `'RUB'` and kopecks.

## Files

- `lib/trpc/routers/subscription.ts` — `payments`, `balance`, `promoStatus`, `validatePromo`, `topUp`, `purchase`.
- `lib/database/schema.ts` — `payments`, `balanceTransactions`, `subscriptions`, `panelSettings`, `users.balance`.
- `lib/api/remnawave.ts` — Remnawave provisioning client used by `purchase`.
- `lib/auth/helper.ts` — `setUserDataCookie` (rewrites cookie with new balance).
- `lib/auth/index.ts` — `invalidateUserAuthCacheByUserId`.
- `app/api/webhooks/payment/route.ts` — external-gateway webhook (incomplete).
