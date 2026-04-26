import { z } from 'zod';
import { cookies } from 'next/headers';
import { revalidateTag } from 'next/cache';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, adminPanelProcedure } from '../init';
import { checkAdminExists, invalidateUserAuthCacheByUserId } from '@/lib/auth/index';
import { SessionManager } from '@/lib/auth/session-manager';
import { db } from '@/lib/database/db';
import {
  admins,
  users,
  userRoles,
  trustedGithubDevelopers,
  panelSettings,
} from '@/lib/database/schema';
import { eq, and, or, ilike, inArray, isNull, desc } from 'drizzle-orm';
import {
  getUserRoles,
  batchGetUserRoles,
  getUsersByRole,
  grantUserRole,
  revokeUserRole,
} from '@/lib/auth/user-roles';
import type { UserRole } from '@/lib/auth/user-roles';
import { getSupportAnalytics } from '@/lib/analytics/support-analytics';
import { getMaintenanceConfig, setMaintenanceConfig } from '@/lib/utils/maintenance';
import { logger } from '@/lib/utils/secure-logger';
import { cache, cached } from '@/lib/database/cache';
import {
  adminUsersQuerySchema,
  grantRoleBodySchema,
  usersRolesQuerySchema,
  maintenanceBodySchema,
  trustedDeveloperIdQuerySchema,
} from '@/lib/validation/api-schemas';

// Helper: get admin ID from session
async function getAdminIdFromSession(sessionId: string): Promise<string | null> {
  const session = await SessionManager.getSession(sessionId);
  return session?.userId ?? null;
}

// Helper: check if admin is Root
async function isRootAdmin(adminId: string): Promise<boolean> {
  if (!db) return false;
  try {
    const rows = await db
      .select({ isRoot: admins.isRoot })
      .from(admins)
      .where(eq(admins.id, adminId))
      .limit(1);
    const admin = rows[0] ?? null;
    if (!admin) return false;
    return admin.isRoot === true;
  } catch {
    return false;
  }
}

const trustedDeveloperSchema = z.object({
  email: z.string().email().optional().or(z.literal('')),
  github_username: z.string().min(1, 'GitHub username is required'),
});

export const adminRouter = router({
  // Auth check (public, admin-specific: checks if admin exists + admin session validity)
  check: publicProcedure.query(async ({ ctx }) => {
    const adminExists = await checkAdminExists();
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('admin_sid')?.value;
    const token = cookieStore.get('admin_token')?.value;

    let isAuthenticated = false;
    if (sessionId) {
      const ipAddress = ctx.headers.get('x-forwarded-for') || 'unknown';
      const userAgent = ctx.headers.get('user-agent') || 'unknown';
      const validation = await SessionManager.validateSession(
        sessionId,
        token || '',
        ipAddress,
        userAgent,
      );
      isAuthenticated = validation.valid;
    }

    const username = cookieStore.get('admin_username')?.value ?? null;

    return {
      isAuthenticated,
      username: isAuthenticated ? username : null,
      adminExists,
    };
  }),

  checkRoot: adminPanelProcedure.query(async ({ ctx }) => {
    if (!db) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
    }
    const session = await SessionManager.getSession(ctx.adminSessionId);
    if (!session) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid session' });
    }
    try {
      const rows = await db
        .select({ isRoot: admins.isRoot })
        .from(admins)
        .where(eq(admins.id, session.userId))
        .limit(1);
      const admin = rows[0] ?? null;
      if (!admin) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Admin not found' });
      }
      return { isRoot: admin.isRoot === true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Admin not found' });
    }
  }),

  // --- Users ---
  users: router({
    list: adminPanelProcedure.input(adminUsersQuerySchema).query(async ({ input }) => {
      if (!db) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database not configured',
        });
      }

      const { q, limit, order } = input;
      const sanitizedQuery = q.replace(/[%_]/g, (char) => `\\${char}`);

      try {
        const conditions = [];
        if (sanitizedQuery) {
          conditions.push(
            or(
              ilike(users.username, `%${sanitizedQuery}%`),
              ilike(users.userId, `%${sanitizedQuery}%`),
            ),
          );
        }

        const data = await db
          .select({
            id: users.id,
            userId: users.userId,
            username: users.username,
            isActive: users.isActive,
            lastLogin: users.lastLogin,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(order === 'asc' ? users.createdAt : desc(users.createdAt))
          .limit(limit);

        // Batch запрос ролей (1 SQL вместо N)
        const rolesMap = await batchGetUserRoles(data.map((u) => u.id));
        const usersWithRoles = data.map((user) => ({
          ...user,
          roles: rolesMap.get(user.id) ?? (['user'] as UserRole[]),
        }));

        return { users: usersWithRoles };
      } catch (error) {
        logger.error('Failed to fetch users list', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch users' });
      }
    }),

    roles: router({
      get: adminPanelProcedure.input(usersRolesQuerySchema).query(async ({ input }) => {
        const { userId, role } = input;

        if (userId) {
          const roles = await getUserRoles(userId);
          return { roles };
        }

        if (role && ['support', 'admin'].includes(role)) {
          const users = await getUsersByRole(role);
          return { users };
        }

        throw new TRPCError({ code: 'BAD_REQUEST', message: 'userId or role is required' });
      }),

      grant: adminPanelProcedure.input(grantRoleBodySchema).mutation(async ({ ctx, input }) => {
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Database not configured',
          });
        }

        try {
          const rows = await db
            .select({ id: admins.id })
            .from(admins)
            .where(eq(admins.username, ctx.adminUsername ?? ''))
            .limit(1);
          const admin = rows[0];

          if (!admin) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Admin not found' });
          }

          const result = await grantUserRole(input.userId, input.role as UserRole, admin.id);
          if (!result.success) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: result.error || 'Failed to grant role',
            });
          }

          revalidateTag('team-count', 'max');
          cache.delete('admin:team_count');
          await invalidateUserAuthCacheByUserId(input.userId);
          return { success: true, message: 'Role granted successfully' };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Admin not found' });
        }
      }),

      revoke: adminPanelProcedure
        .input(
          z.object({
            userId: z.string(),
            role: z.enum(['support', 'admin']),
          }),
        )
        .mutation(async ({ input }) => {
          const result = await revokeUserRole(input.userId, input.role);
          if (!result.success) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: result.error || 'Failed to revoke role',
            });
          }
          revalidateTag('team-count', 'max');
          cache.delete('admin:team_count');
          await invalidateUserAuthCacheByUserId(input.userId);
          return { success: true, message: 'Role revoked successfully' };
        }),
    }),
  }),

  // --- Team ---
  teamCount: adminPanelProcedure.query(async () => {
    if (!db) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
    }

    try {
      return await cached(
        'admin:team_count',
        async () => {
          const roleData = await db!
            .select({ userId: userRoles.userId, role: userRoles.role })
            .from(userRoles)
            .where(
              and(
                inArray(userRoles.role, ['support', 'admin']),
                eq(userRoles.isActive, true),
                isNull(userRoles.revokedAt),
              ),
            );

          const uniqueUserIds = new Set<string>();
          const supportCount = roleData.filter((r) => r.role === 'support').length || 0;
          const adminCount = roleData.filter((r) => r.role === 'admin').length || 0;
          roleData.forEach((role) => uniqueUserIds.add(role.userId));

          return { count: uniqueUserIds.size, support: supportCount, admin: adminCount };
        },
        300,
      );
    } catch (error) {
      logger.error('Error fetching team roles', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch team roles',
      });
    }
  }),

  // --- Analytics ---
  supportAnalytics: adminPanelProcedure
    .input(
      z.object({
        period: z.enum(['hour', 'day', 'week', 'month']).default('month'),
      }),
    )
    .query(async ({ input }) => {
      const analytics = await getSupportAnalytics(input.period);
      return { analytics };
    }),

  // --- Trusted Developers ---
  trustedDevs: router({
    list: adminPanelProcedure.query(async () => {
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
      }
      try {
        const developers = await db
          .select({
            id: trustedGithubDevelopers.id,
            email: trustedGithubDevelopers.email,
            githubUsername: trustedGithubDevelopers.githubUsername,
            createdAt: trustedGithubDevelopers.createdAt,
            updatedAt: trustedGithubDevelopers.updatedAt,
          })
          .from(trustedGithubDevelopers)
          .orderBy(desc(trustedGithubDevelopers.createdAt));

        return { developers: developers || [] };
      } catch (error) {
        logger.error('Error fetching trusted developers', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch developers',
        });
      }
    }),

    add: adminPanelProcedure.input(trustedDeveloperSchema).mutation(async ({ ctx, input }) => {
      if (!db) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database not configured',
        });
      }

      const adminId = await getAdminIdFromSession(ctx.adminSessionId);
      if (!adminId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid session' });
      }

      const isRoot = await isRootAdmin(adminId);
      if (!isRoot) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only Root admin can manage trusted developers',
        });
      }

      const normalizedEmail =
        input.email && input.email.trim() !== '' ? input.email.trim().toLowerCase() : null;
      const normalizedUsername = input.github_username.trim().toLowerCase();

      try {
        // Check if developer already exists
        const existingCondition = normalizedEmail
          ? or(
              eq(trustedGithubDevelopers.email, normalizedEmail),
              eq(trustedGithubDevelopers.githubUsername, normalizedUsername),
            )
          : eq(trustedGithubDevelopers.githubUsername, normalizedUsername);

        const existingRows = await db
          .select({ id: trustedGithubDevelopers.id })
          .from(trustedGithubDevelopers)
          .where(existingCondition)
          .limit(1);

        if (existingRows[0]) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Developer already exists' });
        }

        const [newDeveloper] = await db
          .insert(trustedGithubDevelopers)
          .values({
            email: normalizedEmail,
            githubUsername: normalizedUsername,
            createdBy: adminId,
          })
          .returning();

        logger.info('Trusted developer added', {
          github_username: normalizedUsername,
          email: normalizedEmail || 'not provided',
          adminId,
        });

        return { message: 'Developer added successfully', developer: newDeveloper };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error('Error adding trusted developer', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to add developer',
        });
      }
    }),

    remove: adminPanelProcedure
      .input(trustedDeveloperIdQuerySchema)
      .mutation(async ({ ctx, input }) => {
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Database not configured',
          });
        }

        const adminId = await getAdminIdFromSession(ctx.adminSessionId);
        if (!adminId) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid session' });
        }

        const isRoot = await isRootAdmin(adminId);
        if (!isRoot) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only Root admin can manage trusted developers',
          });
        }

        try {
          await db.delete(trustedGithubDevelopers).where(eq(trustedGithubDevelopers.id, input.id));
        } catch (error) {
          logger.error('Error deleting trusted developer', {
            error: error instanceof Error ? error.message : 'Unknown error',
            id: input.id,
          });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete developer',
          });
        }

        logger.info('Trusted developer deleted', { id: input.id });
        return { message: 'Developer deleted successfully' };
      }),
  }),

  /** Remnawave panel connection settings */
  remnawave: router({
    get: adminPanelProcedure.query(async () => {
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not configured' });

      const rows = await db.select().from(panelSettings);
      const settings: Record<string, string> = {};
      for (const row of rows) {
        settings[row.key] = row.value;
      }
      return {
        endpoint: settings['remnawave_endpoint'] ?? '',
        apiKey: settings['remnawave_api_key'] ?? '',
        testPromoEnabled: settings['test_promo_enabled'] === 'true',
        testPromoCode: settings['test_promo_code'] ?? '',
      };
    }),

    update: adminPanelProcedure
      .input(
        z.object({
          endpoint: z.string().url().min(1),
          apiKey: z.string().min(1),
          testPromoEnabled: z.boolean().optional(),
          testPromoCode: z.string().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (!db)
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not configured' });

        const adminRow = ctx.adminUsername
          ? await db
              .select({ id: admins.id })
              .from(admins)
              .where(eq(admins.username, ctx.adminUsername))
              .limit(1)
          : [];
        const adminId = adminRow[0]?.id ?? null;
        const now = new Date();

        /** Build key-value pairs to upsert */
        const entries: [string, string][] = [
          ['remnawave_endpoint', input.endpoint.replace(/\/$/, '')],
          ['remnawave_api_key', input.apiKey],
        ];
        if (input.testPromoEnabled !== undefined) {
          entries.push(['test_promo_enabled', String(input.testPromoEnabled)]);
        }
        if (input.testPromoCode !== undefined) {
          entries.push(['test_promo_code', input.testPromoCode]);
        }

        for (const [key, value] of entries) {
          await db
            .insert(panelSettings)
            .values({ key, value, updatedBy: adminId, createdAt: now, updatedAt: now })
            .onConflictDoUpdate({
              target: panelSettings.key,
              set: { value, updatedBy: adminId, updatedAt: now },
            });
        }

        const { invalidateSettingsCache } = await import('@/lib/api/remnawave');
        invalidateSettingsCache();

        logger.info('Remnawave settings updated', { adminId });
        return { success: true };
      }),

    healthCheck: adminPanelProcedure.query(async () => {
      const { healthCheck } = await import('@/lib/api/remnawave');
      const result = await healthCheck();
      if (!result.ok) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
      }
      return { connected: true, metrics: result.data.runtimeMetrics };
    }),

    /** Fetch internal squads from Remnawave panel. */
    squads: adminPanelProcedure.query(async () => {
      const { getInternalSquads } = await import('@/lib/api/remnawave');
      const result = await getInternalSquads();
      if (!result.ok) {
        logger.warn('Failed to fetch squads', { error: result.error });
        return [];
      }
      return Array.isArray(result.data) ? result.data : [];
    }),
  }),

  /** Subscription plans stored as JSON in panel_settings. */
  subscriptionPlans: router({
    /** Fetch current plans configuration. */
    list: adminPanelProcedure.query(async () => {
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not configured' });

      const [row] = await db
        .select()
        .from(panelSettings)
        .where(eq(panelSettings.key, 'subscription_plans'))
        .limit(1);

      if (!row) {
        /** Return default plan if nothing configured yet */
        return [
          {
            id: 'base-monthly',
            name: 'Базовая',
            description: '',
            features: [] as string[],
            priceKopecks: 20000,
            durationDays: 30,
            squadUuid: null as string | null,
            active: true,
            isStub: false,
          },
        ];
      }

      try {
        const raw = JSON.parse(row.value) as Record<string, unknown>[];
        return raw.map((p) => ({
          ...(p as {
            id: string;
            name: string;
            priceKopecks: number;
            durationDays: number;
            squadUuid: string | null;
            active: boolean;
            isStub: boolean;
          }),
          description: typeof p.description === 'string' ? p.description : '',
          features: Array.isArray(p.features) ? (p.features as string[]) : [],
        }));
      } catch {
        return [];
      }
    }),

    /** Save plans configuration. Handles mass squad update when squad changes. */
    save: adminPanelProcedure
      .input(
        z.object({
          plans: z.array(
            z.object({
              id: z.string().min(1),
              name: z.string().min(1),
              description: z.string().default(''),
              features: z.array(z.string()).default([]),
              priceKopecks: z.number().int().min(0),
              durationDays: z.number().int().min(0),
              squadUuid: z.string().nullable(),
              active: z.boolean(),
              isStub: z.boolean(),
            }),
          ),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (!db)
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not configured' });

        const realPlans = input.plans.filter((p) => !p.isStub);
        if (realPlans.length > 3) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Максимум 3 тарифных плана (не считая заглушки)',
          });
        }
        if (input.plans.length === 0 || input.plans[0]?.isStub) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Первый план должен быть базовым (не заглушкой)',
          });
        }

        /** Detect squad changes for mass update */
        const [existingRow] = await db
          .select()
          .from(panelSettings)
          .where(eq(panelSettings.key, 'subscription_plans'))
          .limit(1);

        let oldPlansMap: Record<string, string | null> = {};
        if (existingRow) {
          try {
            const oldPlans = JSON.parse(existingRow.value) as {
              id: string;
              squadUuid: string | null;
            }[];
            for (const p of oldPlans) oldPlansMap[p.id] = p.squadUuid;
          } catch {
            /* ignore parse errors */
          }
        }

        const adminRow = ctx.adminUsername
          ? await db
              .select({ id: admins.id })
              .from(admins)
              .where(eq(admins.username, ctx.adminUsername))
              .limit(1)
          : [];
        const adminId = adminRow[0]?.id ?? null;
        const now = new Date();

        await db
          .insert(panelSettings)
          .values({
            key: 'subscription_plans',
            value: JSON.stringify(input.plans),
            updatedBy: adminId,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: panelSettings.key,
            set: { value: JSON.stringify(input.plans), updatedBy: adminId, updatedAt: now },
          });

        /** Mass squad update for plans where squadUuid changed */
        const { addUsersToSquad } = await import('@/lib/api/remnawave');
        const { subscriptions } = await import('@/lib/database/schema');

        for (const plan of input.plans) {
          if (plan.isStub || !plan.squadUuid) continue;
          const oldSquad = oldPlansMap[plan.id];
          if (oldSquad === plan.squadUuid) continue;

          /** Squad changed — find all active subscriptions with this planId */
          const activeSubs = await db
            .select({ remnawaveUuid: subscriptions.remnawaveUuid })
            .from(subscriptions)
            .where(and(eq(subscriptions.plan, plan.id), eq(subscriptions.status, 'active')));

          const uuids = activeSubs
            .map((s) => s.remnawaveUuid)
            .filter((u): u is string => u !== null);

          if (uuids.length > 0) {
            const result = await addUsersToSquad(plan.squadUuid, uuids);
            if (!result.ok) {
              logger.warn('Failed to mass-update squad for plan', {
                planId: plan.id,
                squadUuid: plan.squadUuid,
                error: result.error,
                userCount: uuids.length,
              });
            } else {
              logger.info('Mass squad update completed', {
                planId: plan.id,
                squadUuid: plan.squadUuid,
                userCount: uuids.length,
              });
            }
          }
        }

        /** Invalidate plans cache used by getPlansConfig() and subscription.plans */
        cache.delete('subscription_plans_config');

        logger.info('Subscription plans updated', { adminId, planCount: input.plans.length });
        return { success: true };
      }),
  }),

  maintenance: router({
    get: adminPanelProcedure.query(async () => {
      const config = await getMaintenanceConfig();
      return config;
    }),

    update: adminPanelProcedure.input(maintenanceBodySchema).mutation(async ({ input }) => {
      const config = {
        isActive: Boolean(input.isActive),
        scheduledStart: input.scheduledStart ?? null,
        scheduledEnd: input.scheduledEnd ?? null,
        message: input.message ?? '',
      };
      await setMaintenanceConfig(config);
      logger.info('Maintenance config updated', { config });
      return { success: true, config };
    }),
  }),
});
