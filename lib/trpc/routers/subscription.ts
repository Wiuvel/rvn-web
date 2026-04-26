import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../init';
import { db } from '@/lib/database/db';
import {
  users,
  subscriptions,
  payments,
  balanceTransactions,
  panelSettings,
} from '@/lib/database/schema';
import { eq, desc, and, inArray, sql } from 'drizzle-orm';
import { logger } from '@/lib/utils/secure-logger';
import {
  createUser as rwCreateUser,
  getUserByUuid as rwGetUser,
  disableUser as rwDisableUser,
  addUsersToSquad,
  getServerNodes,
} from '@/lib/api/remnawave';
import { invalidateUserAuthCacheByUserId } from '@/lib/auth/index';
import { cache } from '@/lib/database/cache';

/** Default monthly subscription price in kopecks (200 RUB), used as fallback */
const DEFAULT_PRICE_KOPECKS = 20000;

/** Plan config stored in panel_settings as JSON */
interface PlanConfig {
  id: string;
  name: string;
  description: string;
  features: string[];
  priceKopecks: number;
  durationDays: number;
  squadUuid: string | null;
  active: boolean;
  isStub: boolean;
}

/** Cache key and TTL for subscription plans */
const PLANS_CONFIG_CACHE_KEY = 'subscription_plans_config';
const PLANS_CONFIG_CACHE_TTL = 60_000;

/** Fetch full plan configs (with squadUuid) from panel_settings. Server-side only. */
async function getPlansConfig(): Promise<PlanConfig[]> {
  if (!db) return [];

  const cached_val = cache.get(PLANS_CONFIG_CACHE_KEY) as PlanConfig[] | undefined;
  if (cached_val) return cached_val;

  const [row] = await db
    .select()
    .from(panelSettings)
    .where(eq(panelSettings.key, 'subscription_plans'))
    .limit(1);

  let plans: PlanConfig[] = [];
  if (row) {
    try {
      const raw = JSON.parse(row.value) as Partial<PlanConfig>[];
      plans = raw.map((p) => ({
        ...p,
        description: p.description ?? '',
        features: Array.isArray(p.features) ? p.features : [],
      })) as PlanConfig[];
    } catch {
      plans = [];
    }
  }

  if (plans.length === 0) {
    plans = [
      {
        id: 'base-monthly',
        name: 'Базовая',
        description: '',
        features: [],
        priceKopecks: DEFAULT_PRICE_KOPECKS,
        durationDays: 30,
        squadUuid: null,
        active: true,
        isStub: false,
      },
    ];
  }

  cache.set(PLANS_CONFIG_CACHE_KEY, plans, PLANS_CONFIG_CACHE_TTL);
  return plans;
}

/** Cache key for test promo settings */
const PROMO_CACHE_KEY = 'test_promo_settings';
/** Promo settings cache TTL in ms */
const PROMO_CACHE_TTL = 60_000;

/**
 * Fetches test promo settings from panel_settings with 1-min cache.
 * Returns { enabled, code } or null if DB unavailable.
 */
async function getTestPromoSettings(): Promise<{ enabled: boolean; code: string } | null> {
  if (!db) return null;

  const cached_val = cache.get(PROMO_CACHE_KEY) as { enabled: boolean; code: string } | undefined;
  if (cached_val) return cached_val;

  const rows = await db
    .select()
    .from(panelSettings)
    .where(inArray(panelSettings.key, ['test_promo_enabled', 'test_promo_code']));

  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  const result = {
    enabled: map['test_promo_enabled'] === 'true',
    code: map['test_promo_code'] ?? '',
  };

  cache.set(PROMO_CACHE_KEY, result, PROMO_CACHE_TTL);
  return result;
}

export const subscriptionRouter = router({
  /** Public: available plans (no auth required, for /subscription page). */
  publicPlans: publicProcedure.query(async () => {
    const allPlans = await getPlansConfig();
    return allPlans
      .filter((p) => p.active)
      .map(({ id, name, description, features, priceKopecks, durationDays, isStub }) => ({
        id,
        name,
        description,
        features,
        priceKopecks,
        durationDays,
        isStub,
      }));
  }),

  /** Public: VPN server nodes (no auth required, for /subscription page). */
  publicServers: publicProcedure.query(async () => {
    const result = await getServerNodes();
    if (!result.ok) return [];
    return result.data;
  }),

  /** List current user's subscriptions. */
  list: protectedProcedure.query(async ({ ctx }) => {
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not configured' });

    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .orderBy(desc(subscriptions.createdAt));

    return rows.map((s) => ({
      id: s.id,
      status: s.status,
      plan: s.plan,
      expireAt: s.expireAt?.toISOString() ?? null,
      subscriptionUrl: s.subscriptionUrl,
      remnawaveUuid: s.remnawaveUuid,
      trafficLimitBytes: s.trafficLimitBytes,
      trafficLimitStrategy: s.trafficLimitStrategy,
      createdAt: s.createdAt.toISOString(),
    }));
  }),

  /** List current user's payment history. */
  payments: protectedProcedure.query(async ({ ctx }) => {
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not configured' });

    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.userId, ctx.user.id))
      .orderBy(desc(payments.createdAt));

    return rows.map((p) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      provider: p.provider,
      promoCode: p.promoCode,
      createdAt: p.createdAt.toISOString(),
    }));
  }),

  /** Get current user's balance and transaction history. */
  balance: protectedProcedure.query(async ({ ctx }) => {
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not configured' });

    const [user] = await db
      .select({ balance: users.balance })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    const txns = await db
      .select()
      .from(balanceTransactions)
      .where(eq(balanceTransactions.userId, ctx.user.id))
      .orderBy(desc(balanceTransactions.createdAt))
      .limit(50);

    return {
      balance: user?.balance ?? 0,
      transactions: txns.map((t) => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        description: t.description,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }),

  /** Check whether test promo code input should be shown to users. */
  promoStatus: protectedProcedure.query(async () => {
    const promo = await getTestPromoSettings();
    return { enabled: promo?.enabled ?? false };
  }),

  /** Validate a promo code without applying it. Used for auto-validation with debounce. */
  validatePromo: protectedProcedure
    .input(z.object({ promoCode: z.string().min(1) }))
    .query(async ({ input }) => {
      const promo = await getTestPromoSettings();
      const valid = promo?.enabled === true && input.promoCode === promo.code;
      return { valid, type: valid ? ('coupon' as const) : null };
    }),

  /** Fetch VPN server nodes (cached 5 min on server side). */
  servers: protectedProcedure.query(async () => {
    const result = await getServerNodes();
    if (!result.ok) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error });
    }
    return result.data;
  }),

  /** Fetch available subscription plans (active only, no squadUuid exposed). */
  plans: protectedProcedure.query(async () => {
    const allPlans = await getPlansConfig();
    return allPlans
      .filter((p) => p.active)
      .map(({ id, name, description, features, priceKopecks, durationDays, isStub }) => ({
        id,
        name,
        description,
        features,
        priceKopecks,
        durationDays,
        isStub,
      }));
  }),

  /** Top up user balance via test promo code. Credits user-specified amount. */
  topUp: protectedProcedure
    .input(z.object({ promoCode: z.string().min(1), amount: z.number().int().min(10000) }))
    .mutation(async ({ ctx, input }) => {
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not configured' });

      const promo = await getTestPromoSettings();
      if (!promo?.enabled || input.promoCode !== promo.code) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Недействительный промокод' });
      }

      const userId = ctx.user.id;

      /** Prevent promo code reuse — each user can only top up via promo once */
      const [alreadyUsed] = await db
        .select({ id: balanceTransactions.id })
        .from(balanceTransactions)
        .where(and(eq(balanceTransactions.userId, userId), eq(balanceTransactions.type, 'topup')))
        .limit(1);
      if (alreadyUsed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Промокод уже использован' });
      }

      const amount = input.amount;

      /** Atomic balance increment */
      const [updated] = await db
        .update(users)
        .set({ balance: sql`${users.balance} + ${amount}` })
        .where(eq(users.id, userId))
        .returning({ balance: users.balance });

      /** Record transaction */
      await db.insert(balanceTransactions).values({
        userId,
        amount,
        type: 'topup',
        description: 'Пополнение по промокоду',
      });

      /** Invalidate caches so auth.me returns fresh balance */
      try {
        await invalidateUserAuthCacheByUserId(userId);
      } catch {
        /** Redis may be unavailable — not fatal */
      }
      cache.delete(`profile:${ctx.user.userId}`);

      /** Re-set user_data cookie with updated balance */
      const { setUserDataCookie } = await import('@/lib/auth/helper');
      const freshUser = { ...ctx.user, balance: updated?.balance ?? 0 };
      const host = ctx.req.headers.get('host') ?? '';
      const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
      await setUserDataCookie(freshUser, isLocalhost);

      logger.info('Balance topped up via promo', { userId, amount });

      return { balance: updated?.balance ?? 0 };
    }),

  /**
   * Purchase a subscription.
   * Resolves plan from panel_settings, assigns Remnawave Internal Squad.
   * Supports balance payment, promo code, or external payment flow.
   */
  purchase: protectedProcedure
    .input(
      z.object({
        planId: z.string().min(1),
        payFrom: z.enum(['balance', 'promo', 'external']).default('external'),
        promoCode: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not configured' });

      const userId = ctx.user.id;

      /** Prevent multiple active subscriptions per user */
      const [existingActive] = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
        .limit(1);
      if (existingActive) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'У вас уже есть активная подписка' });
      }

      /** Resolve plan config from panel_settings */
      const allPlans = await getPlansConfig();
      const plan = allPlans.find((p) => p.id === input.planId);
      if (!plan || !plan.active || plan.isStub) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Тарифный план недоступен' });
      }

      /** Determine if promo code is valid */
      const promo = await getTestPromoSettings();
      const isTest =
        input.payFrom === 'promo' &&
        promo?.enabled &&
        !!input.promoCode &&
        input.promoCode === promo.code;

      /** Determine payment amount from plan config */
      const amount = isTest ? 0 : plan.priceKopecks;

      /** Balance payment path */
      if (input.payFrom === 'balance') {
        const [user] = await db
          .select({ balance: users.balance })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!user || user.balance < plan.priceKopecks) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Недостаточно средств на балансе' });
        }
      }

      /** Create payment record */
      const paymentStatus = isTest || input.payFrom === 'balance' ? 'completed' : 'pending';
      const paymentProvider = isTest ? 'test' : input.payFrom === 'balance' ? 'balance' : 'pending';

      const [payment] = await db
        .insert(payments)
        .values({
          userId,
          amount,
          currency: 'RUB',
          status: paymentStatus,
          provider: paymentProvider,
          promoCode: input.promoCode || null,
        })
        .returning();

      /** External payment: return pending status with redirect */
      if (input.payFrom === 'external' && !isTest) {
        return {
          paymentId: payment.id,
          status: 'pending' as const,
          redirectUrl: `/dashboard/payment/redirect?paymentId=${payment.id}`,
        };
      }

      /** Deduct balance if paying from balance */
      if (input.payFrom === 'balance') {
        await db
          .update(users)
          .set({ balance: sql`${users.balance} - ${plan.priceKopecks}` })
          .where(eq(users.id, userId));

        await db.insert(balanceTransactions).values({
          userId,
          amount: -plan.priceKopecks,
          type: 'purchase',
          description: `Оплата подписки «${plan.name}»`,
          relatedPaymentId: payment.id,
        });
      }

      /** Helper to revert payment + balance on failure. db is guaranteed non-null here. */
      const revertPayment = async () => {
        await db!
          .update(payments)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(payments.id, payment.id));

        if (input.payFrom === 'balance') {
          await db!
            .update(users)
            .set({ balance: sql`${users.balance} + ${plan.priceKopecks}` })
            .where(eq(users.id, userId));
          await db!.insert(balanceTransactions).values({
            userId,
            amount: plan.priceKopecks,
            type: 'refund',
            description: 'Возврат за неудачную операцию',
            relatedPaymentId: payment.id,
          });
        }
      };

      /** Create Remnawave user */
      const expireAt = new Date();
      expireAt.setDate(expireAt.getDate() + plan.durationDays);

      const rwResult = await rwCreateUser({
        username: `rvn_${ctx.user.userId}`,
        expireAt: expireAt.toISOString(),
        status: 'ACTIVE',
        trafficLimitBytes: 0,
        trafficLimitStrategy: 'MONTH',
        description: `RVN user ${ctx.user.username}`,
      });

      if (!rwResult.ok) {
        await revertPayment();
        logger.warn('Remnawave user creation failed during purchase', {
          userId,
          planId: input.planId,
          error: rwResult.error,
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Не удалось создать подписку в панели',
        });
      }

      const rwUser = rwResult.data;

      /** Assign Internal Squad if configured for this plan */
      if (plan.squadUuid) {
        const squadResult = await addUsersToSquad(plan.squadUuid, [rwUser.uuid]);
        if (!squadResult.ok) {
          /** Rollback: disable Remnawave user + revert payment */
          await rwDisableUser(rwUser.uuid);
          await revertPayment();
          logger.warn('Squad assignment failed during purchase', {
            userId,
            planId: input.planId,
            squadUuid: plan.squadUuid,
            remnawaveUuid: rwUser.uuid,
            error: squadResult.error,
          });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Не удалось назначить доступ к VPN',
          });
        }
      }

      /** Create local subscription record */
      const [subscription] = await db
        .insert(subscriptions)
        .values({
          userId,
          remnawaveUuid: rwUser.uuid,
          shortUuid: rwUser.shortUuid,
          subscriptionUrl: rwUser.subscriptionUrl,
          status: 'active',
          plan: plan.id,
          expireAt,
          trafficLimitBytes: rwUser.trafficLimitBytes,
          trafficLimitStrategy: rwUser.trafficLimitStrategy,
        })
        .returning();

      /** Link payment to subscription */
      await db
        .update(payments)
        .set({ subscriptionId: subscription.id, updatedAt: new Date() })
        .where(eq(payments.id, payment.id));

      /** Record balance transaction for test promo purchase */
      if (isTest) {
        await db.insert(balanceTransactions).values({
          userId,
          amount: 0,
          type: 'purchase',
          description: 'Тестовая подписка',
          relatedPaymentId: payment.id,
        });
      }

      /** Invalidate auth caches so the dashboard shows fresh data */
      await invalidateUserAuthCacheByUserId(userId);
      cache.delete(`profile:${ctx.user.userId}`);

      logger.info('Subscription created', {
        userId,
        planId: plan.id,
        subscriptionId: subscription.id,
        remnawaveUuid: rwUser.uuid,
        squadUuid: plan.squadUuid,
      });

      return {
        paymentId: payment.id,
        status: 'completed' as const,
        subscription: {
          id: subscription.id,
          subscriptionUrl: rwUser.subscriptionUrl,
          expireAt: expireAt.toISOString(),
        },
      };
    }),

  /** Sync subscription status with Remnawave panel. */
  sync: protectedProcedure
    .input(z.object({ subscriptionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not configured' });

      const [sub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, input.subscriptionId))
        .limit(1);

      if (!sub || sub.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Подписка не найдена' });
      }

      if (!sub.remnawaveUuid) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Подписка не привязана к панели' });
      }

      const rwResult = await rwGetUser(sub.remnawaveUuid);
      if (!rwResult.ok) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: rwResult.error });
      }

      const rwUser = rwResult.data;
      const newStatus =
        rwUser.status === 'ACTIVE'
          ? 'active'
          : rwUser.status === 'EXPIRED'
            ? 'expired'
            : rwUser.status === 'DISABLED'
              ? 'disabled'
              : 'limited';

      await db
        .update(subscriptions)
        .set({
          status: newStatus,
          expireAt: new Date(rwUser.expireAt),
          trafficLimitBytes: rwUser.trafficLimitBytes,
          trafficLimitStrategy: rwUser.trafficLimitStrategy,
          subscriptionUrl: rwUser.subscriptionUrl,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, sub.id));

      return {
        status: newStatus,
        expireAt: rwUser.expireAt,
        subscriptionUrl: rwUser.subscriptionUrl,
        traffic: rwUser.userTraffic,
      };
    }),
});
