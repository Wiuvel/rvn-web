import { z } from 'zod';
import { cookies } from 'next/headers';
import { revalidateTag } from 'next/cache';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, adminPanelProcedure } from '../init';
import { checkAdminExists } from '@/lib/auth/index';
import { SessionManager } from '@/lib/auth/session-manager';
import { supabaseAdmin } from '@/lib/database/supabase';
import { getUserRoles, getUsersByRole, grantUserRole, revokeUserRole } from '@/lib/auth/user-roles';
import type { UserRole } from '@/lib/auth/user-roles';
import { getSupportAnalytics } from '@/lib/analytics/support-analytics';
import { getMaintenanceConfig, setMaintenanceConfig } from '@/lib/utils/maintenance';
import { logger } from '@/lib/utils/secure-logger';
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
  if (!supabaseAdmin) return false;
  const { data: admin, error } = await supabaseAdmin
    .from('admins')
    .select('is_root')
    .eq('id', adminId)
    .maybeSingle();
  if (error || !admin) return false;
  return admin.is_root === true;
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
    if (!supabaseAdmin) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
    }
    const session = await SessionManager.getSession(ctx.adminSessionId);
    if (!session) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid session' });
    }
    const { data: admin, error } = await supabaseAdmin
      .from('admins')
      .select('is_root')
      .eq('id', session.userId)
      .maybeSingle();
    if (error || !admin) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Admin not found' });
    }
    return { isRoot: admin.is_root === true };
  }),

  // --- Users ---
  users: router({
    list: adminPanelProcedure.input(adminUsersQuerySchema).query(async ({ input }) => {
      if (!supabaseAdmin) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database not configured',
        });
      }

      const { q, limit, order } = input;
      const sanitizedQuery = q.replace(/[%_]/g, (char) => `\\${char}`);

      let supabaseQuery = supabaseAdmin
        .from('users')
        .select('id,user_id,username,is_active,last_login,created_at,token')
        .order('created_at', { ascending: order === 'asc' })
        .limit(limit);

      if (sanitizedQuery) {
        supabaseQuery = supabaseQuery.or(
          `username.ilike.%${sanitizedQuery}%,user_id.ilike.%${sanitizedQuery}%`,
        );
      }

      const { data, error } = await supabaseQuery;

      if (error) {
        logger.error('Failed to fetch users list', { error: error.message, code: error.code });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch users' });
      }

      const usersWithRoles = await Promise.allSettled(
        (data ?? []).map(async (user) => {
          try {
            const rolesPromise = getUserRoles(user.id);
            const timeoutPromise = new Promise<UserRole[]>((_, reject) => {
              setTimeout(() => reject(new Error('Timeout')), 2000);
            });
            const roles = await Promise.race([rolesPromise, timeoutPromise]);
            return { ...user, roles };
          } catch {
            return { ...user, roles: ['user'] as UserRole[] };
          }
        }),
      ).then((results) =>
        results.map((result, index) =>
          result.status === 'fulfilled'
            ? result.value
            : { ...(data ?? [])[index], roles: ['user'] as UserRole[] },
        ),
      );

      return { users: usersWithRoles };
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
        if (!supabaseAdmin) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Database not configured',
          });
        }

        const { data: admin, error: adminError } = await supabaseAdmin
          .from('admins')
          .select('id')
          .eq('username', ctx.adminUsername)
          .single();

        if (adminError || !admin) {
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
        return { success: true, message: 'Role granted successfully' };
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
          return { success: true, message: 'Role revoked successfully' };
        }),
    }),
  }),

  // --- Team ---
  teamCount: adminPanelProcedure.query(async () => {
    if (!supabaseAdmin) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
    }

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, role')
      .in('role', ['support', 'admin'])
      .eq('is_active', true)
      .is('revoked_at', null);

    if (roleError) {
      logger.error('Error fetching team roles', { error: roleError.message, code: roleError.code });
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch team roles',
      });
    }

    const uniqueUserIds = new Set<string>();
    const supportCount = roleData?.filter((r) => r.role === 'support').length || 0;
    const adminCount = roleData?.filter((r) => r.role === 'admin').length || 0;
    roleData?.forEach((role) => uniqueUserIds.add(role.user_id));

    return { count: uniqueUserIds.size, support: supportCount, admin: adminCount };
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
      if (!supabaseAdmin) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
      }
      const { data: developers, error } = await supabaseAdmin
        .from('trusted_github_developers')
        .select('id, email, github_username, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error fetching trusted developers', {
          error: error.message,
          code: error.code,
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch developers',
        });
      }
      return { developers: developers || [] };
    }),

    add: adminPanelProcedure.input(trustedDeveloperSchema).mutation(async ({ ctx, input }) => {
      if (!supabaseAdmin) {
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

      const { data: existing } = await supabaseAdmin
        .from('trusted_github_developers')
        .select('id')
        .or(
          normalizedEmail
            ? `email.eq.${normalizedEmail},github_username.eq.${normalizedUsername}`
            : `github_username.eq.${normalizedUsername}`,
        )
        .limit(1)
        .single();

      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Developer already exists' });
      }

      const { data: newDeveloper, error: insertError } = await supabaseAdmin
        .from('trusted_github_developers')
        .insert({
          email: normalizedEmail,
          github_username: normalizedUsername,
          created_by: adminId,
        })
        .select()
        .single();

      if (insertError) {
        logger.error('Error adding trusted developer', {
          error: insertError.message,
          code: insertError.code,
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to add developer',
        });
      }

      logger.info('Trusted developer added', {
        github_username: normalizedUsername,
        email: normalizedEmail || 'not provided',
        adminId,
      });

      return { message: 'Developer added successfully', developer: newDeveloper };
    }),

    remove: adminPanelProcedure
      .input(trustedDeveloperIdQuerySchema)
      .mutation(async ({ ctx, input }) => {
        if (!supabaseAdmin) {
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

        const { error: deleteError } = await supabaseAdmin
          .from('trusted_github_developers')
          .delete()
          .eq('id', input.id);

        if (deleteError) {
          logger.error('Error deleting trusted developer', {
            error: deleteError.message,
            code: deleteError.code,
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

  // --- Maintenance ---
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
