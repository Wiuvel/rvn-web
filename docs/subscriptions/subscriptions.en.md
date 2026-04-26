# Subscriptions & Payments

> **[Русская версия](subscriptions.md)**

## Overview

The subscription subsystem sells VPN access by provisioning users in a [Remnawave](https://remna.st/) panel. The web app stores plan catalogue, payment ledger and balance in PostgreSQL; Remnawave owns the actual VPN user (squad assignment, traffic limit, subscription URL). Three payment paths are supported: balance, test promo code, and external provider (with webhook).

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
        │ external provider    │──────────────────┘
        │ /api/webhooks/payment│
        └──────────────────────┘
```

## Database

`lib/database/schema.ts`:

### `subscriptions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → `users.id`, cascade |
| `remnawave_uuid` | TEXT | Remnawave user UUID |
| `short_uuid` | TEXT | Short UUID used in connection string |
| `subscription_url` | TEXT | URL handed to client apps |
| `status` | TEXT | `pending` \| `active` \| `expired` \| `disabled` \| `limited` |
| `plan` | TEXT | Plan id (e.g. `base-monthly`) |
| `expire_at` | TIMESTAMPTZ | Computed from `durationDays` at purchase |
| `traffic_limit_bytes` | BIGINT | `0` = unlimited |
| `traffic_limit_strategy` | TEXT | `NO_RESET` \| `DAY` \| `WEEK` \| `MONTH` \| `MONTH_ROLLING` |

Indexes: `user_id`, `status`, `expire_at`, `remnawave_uuid`.

### `payments`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `user_id` | UUID | FK |
| `subscription_id` | UUID | FK (nullable, set after squad assignment) |
| `amount` | INTEGER | **kopecks** (avoids floats) |
| `currency` | TEXT | `RUB` |
| `status` | TEXT | `pending` \| `completed` \| `failed` |
| `provider` | TEXT | `test` \| `balance` \| `pending` (external) |
| `provider_payment_id` | TEXT | External payment provider id |
| `promo_code` | TEXT | Applied promo (if any) |

### `balance_transactions`

Append-only ledger; `amount` in kopecks (positive = credit, negative = debit). `type ∈ { topup, purchase, refund }`. `related_payment_id` ties transactions to payments.

`users.balance` is the cached current balance; the ledger is the source of truth.

### `panel_settings`

Key/value store (`text` → `text`) used for runtime configuration that admins may edit through `/ui/panel/admin/Remnawave` and `/ui/panel/admin/Subscription`. Keys consumed by this module:

- `remnawave_endpoint`, `remnawave_api_key` — Remnawave Panel connection.
- `subscription_plans` — JSON `PlanConfig[]` (see below).
- `test_promo_enabled`, `test_promo_code` — feature flag for test promo flow.

## Plan configuration

`PlanConfig` (server-side):

```ts
interface PlanConfig {
  id: string;            // 'base-monthly'
  name: string;          // 'Базовая'
  description: string;
  features: string[];
  priceKopecks: number;  // 20000 = 200 RUB
  durationDays: number;  // 30
  squadUuid: string | null; // Remnawave Internal Squad
  active: boolean;
  isStub: boolean;       // grayed-out plan in UI
}
```

Loaded from `panel_settings.subscription_plans` JSON, cached in-process for `PLANS_CONFIG_CACHE_TTL = 60s`. If the row is missing, a single fallback `base-monthly` is returned so the page still renders. **`squadUuid` is never sent to the client** — the public `plans` / `publicPlans` queries strip it.

## tRPC router (`lib/trpc/routers/subscription.ts`)

| Procedure | Type | Purpose |
|-----------|------|---------|
| `publicPlans` | `publicProcedure.query` | Plans for landing/`/subscription` page (no auth). |
| `publicServers` | `publicProcedure.query` | Remnawave server nodes for landing UI. |
| `list` | `protectedProcedure.query` | User's subscriptions. |
| `payments` | `protectedProcedure.query` | Payment history. |
| `balance` | `protectedProcedure.query` | Current balance + last 50 ledger entries. |
| `promoStatus` | `protectedProcedure.query` | Whether promo input is shown. |
| `validatePromo` | `protectedProcedure.query` | Debounced auto-validation. |
| `servers` | `protectedProcedure.query` | Server nodes (cached). |
| `plans` | `protectedProcedure.query` | Active plans without `squadUuid`. |
| `topUp` | `protectedProcedure.mutation` | Promo-based balance top-up; one-shot per user. |
| `purchase` | `protectedProcedure.mutation` | Purchase a plan (3 paths). |
| `sync` | `protectedProcedure.mutation` | Pull latest state from Remnawave for a subscription. |

## Purchase flow (`subscription.purchase`)

Inputs: `{ planId, payFrom: 'balance' | 'promo' | 'external', promoCode? }`.

1. **Single-active-subscription guard** — reject if user already has an `active` row.
2. Resolve plan from `panel_settings`. Reject if `!plan.active || plan.isStub`.
3. **Promo validation** — `payFrom === 'promo'` only counts if `test_promo_enabled === true` and `promoCode === test_promo_code`. Test purchases use `amount = 0`, `provider = 'test'`, `status = 'completed'`.
4. **Balance path** — verify `users.balance >= plan.priceKopecks`, otherwise reject.
5. Insert `payments` row with computed `(status, provider)`:
   - `'completed' / 'test'` for promo,
   - `'completed' / 'balance'` for balance,
   - `'pending' / 'pending'` for external (returns `redirectUrl`, no Remnawave call yet).
6. **External path returns early** with `{ paymentId, status: 'pending', redirectUrl }`. Activation happens later in the webhook.
7. **Balance debit** — atomic `users.balance -= priceKopecks` plus a `balance_transactions` row of type `purchase` linked to the payment.
8. **Remnawave provisioning** — `rwCreateUser({ username: 'rvn_<userId>', expireAt = now + durationDays, status: 'ACTIVE' })`.
9. If `plan.squadUuid` is set, `addUsersToSquad(squadUuid, [rwUser.uuid])`.
10. Insert `subscriptions` row, then `payments.subscription_id = subscription.id`.
11. Invalidate auth caches: `invalidateUserAuthCacheByUserId`, `cache.delete('profile:...')`, refresh `user_data` cookie.

**Compensation:** any failure during step 8/9 calls `revertPayment()` — payment → `failed`, balance refunded with a `refund` ledger entry, Remnawave user disabled (`rwDisableUser`).

## Top-up flow (`subscription.topUp`)

- Inputs: `{ promoCode, amount }` (kopecks, ≥ 10 000 = 100 RUB).
- Promo must be enabled and match the configured code.
- One-shot guard: rejects if any prior `balance_transactions` row of type `topup` exists for the user.
- Atomic balance increment via `sql\`${users.balance} + ${amount}\``, ledger row recorded, auth cache invalidated, `user_data` cookie refreshed.

## Sync flow (`subscription.sync`)

For users to refresh their subscription state from Remnawave on demand. Maps `RemnawaveUserStatus` → local status:

| Remnawave | Local |
|-----------|-------|
| `ACTIVE` | `active` |
| `EXPIRED` | `expired` |
| `DISABLED` | `disabled` |
| `LIMITED` (default) | `limited` |

Updates `expire_at`, `subscription_url`, traffic fields and returns `userTraffic`.

## Payment webhook (`app/api/webhooks/payment/route.ts`)

- Auth: `x-webhook-secret` header must equal `PAYMENT_WEBHOOK_SECRET`. Mismatch → 401.
- Body: `{ paymentId, status: 'completed' | 'failed', providerPaymentId? }`.
- Validates `payment.status === 'pending'` (idempotent — repeats return 409).
- Updates `payments.status` and `provider_payment_id`.

> ⚠️ **Known gap (P0 in `rvn-web-review.md`):** the webhook currently only updates the row. It does **not** yet trigger Remnawave provisioning for `completed` external payments — there is a `TODO` comment with the required steps (rwCreateUser → addUsersToSquad → subscription update → cache invalidation). Until this is wired up, external-provider purchases stay in `pending`.

## Remnawave client (`lib/api/remnawave.ts`)

REST wrapper used by both the subscription router and admin panel. Endpoint and API key are read from `panel_settings` (cached for 60 s in `settingsCache`), so an admin can rotate the key without restarting.

Public types:
- `RemnawaveUser`, `RemnawaveUserTraffic`, `RemnawaveUserStatus`, `TrafficLimitStrategy`.
- `CreateUserParams`.
- `RemnawaveHealthMetrics`.

Returned values use the `Result<T> = { ok: true, data: T } | { ok: false, error: string }` pattern, so callers can react without `try/catch` boilerplate (see `purchase` rollback paths).

## Configuration

| Variable / Setting | Where | Purpose |
|--------------------|-------|---------|
| `PAYMENT_WEBHOOK_SECRET` | env | HMAC-style header secret for the payment webhook |
| `remnawave_endpoint` | `panel_settings` | Panel base URL |
| `remnawave_api_key` | `panel_settings` | Panel API key |
| `subscription_plans` | `panel_settings` | JSON `PlanConfig[]` |
| `test_promo_enabled` | `panel_settings` | Feature flag |
| `test_promo_code` | `panel_settings` | Promo string |

The Remnawave-specific environment variables in `.env.example` (`REMNAWAVE_ENDPOINT`, `REMNAWAVE_API_KEY`) are intentionally commented — production is driven by `panel_settings` so admins can update them without redeploying.

## Files

- `lib/trpc/routers/subscription.ts` — tRPC router (queries, `purchase`, `topUp`, `sync`).
- `lib/api/remnawave.ts` — Remnawave Panel client.
- `lib/database/schema.ts` — `subscriptions`, `payments`, `balance_transactions`, `panel_settings` tables.
- `app/api/webhooks/payment/route.ts` — external provider webhook.
- `app/subscription/page.tsx` — public subscription landing page.
- `app/dashboard/payment/[paymentId]/page.tsx`, `app/dashboard/payment/redirect/page.tsx` — dashboard payment flows.
- `components/modals/SubscriptionPurchaseModal.tsx`, `components/modals/BalanceTopUpModal.tsx` — purchase / top-up UI.
- `components/admin/RemnawaveSettings.tsx`, `components/admin/SubscriptionPlansSettings.tsx` — admin configuration UIs.
