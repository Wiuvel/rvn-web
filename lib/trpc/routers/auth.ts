import { z } from 'zod';
import { cookies } from 'next/headers';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure, authRateLimitedProcedure } from '../init';
import { checkAuth, setUserDataCookie } from '@/lib/auth/helper';
import {
  authenticateUser,
  createUser,
  authenticateAdmin,
  createAdmin,
  checkAdminExists,
  invalidateUserTokenCache,
} from '@/lib/auth/index';
import { hasUserRole } from '@/lib/auth/user-roles';
import { generateCSRFToken, verifyCSRFToken, revokeCSRFToken } from '@/lib/security/csrf';
import { generateSessionId } from '@/lib/utils/server';
import { db } from '@/lib/database/db';
import { users, userDevices } from '@/lib/database/schema';
import { eq, desc } from 'drizzle-orm';
import { SessionManager } from '@/lib/auth/session-manager';
import { sanitizeInput } from '@/lib/security/sanitize';
import { logger } from '@/lib/utils/secure-logger';
import { SESSION_TIMEOUT } from '@/lib/utils/constants';
import { createHash, randomBytes } from 'node:crypto';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { passwordChangeSchema } from '@/lib/validation/schemas';
import { deviceIdParamSchema } from '@/lib/validation/api-schemas';
import { appConfig } from '@/lib/utils/config';

const scopeSchema = z.enum(['user', 'admin']).default('user');

const COOKIE_CONFIG = {
  user: {
    sessionCookie: 'session_id',
    tokenCookie: 'token',
    extraCookies: [] as string[],
  },
  admin: {
    sessionCookie: 'admin_sid',
    tokenCookie: 'admin_token',
    extraCookies: ['admin_username'],
  },
} as const;

function getIsLocalhost(url: string): boolean {
  const u = new URL(url);
  return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
}

export const authRouter = router({
  me: publicProcedure.query(async ({ ctx }) => {
    const authResult = await checkAuth(ctx.req);
    const isLocalhost = getIsLocalhost(ctx.req.url);

    if (!authResult.isAuthenticated || !authResult.user) {
      const cookieStore = await cookies();
      cookieStore.set('user_data', '', {
        maxAge: 0,
        path: '/',
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'strict',
      });
      // Не сбрасываем session_id для неавторизованных — сессия нужна для CSRF и повторного входа
      return { authenticated: false as const };
    }

    const user = authResult.user;
    const cookieStore = await cookies();
    const currentSessionId = cookieStore.get('session_id')?.value;
    const currentToken = cookieStore.get('token')?.value;

    let isSupport = false;
    let isAdmin = false;
    try {
      isSupport = await hasUserRole(user.id, 'support');
      isAdmin = await hasUserRole(user.id, 'admin');
    } catch (error) {
      logger.error('Error checking user roles', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: user.id,
      });
    }

    await setUserDataCookie(user, isLocalhost);

    if (currentSessionId) {
      cookieStore.set('session_id', currentSessionId, {
        maxAge: SESSION_TIMEOUT / 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'strict',
        path: '/',
      });
    }

    return {
      authenticated: true as const,
      id: user.id,
      user_id: user.userId,
      username: user.username,
      token: currentToken,
      created_at: user.createdAt,
      last_login: user.lastLogin,
      avatar: user.avatar,
      banner: user.banner || null,
      isSupport,
      isAdmin,
      balance: user.balance ?? 0,
    };
  }),

  csrf: publicProcedure
    .input(z.object({ scope: scopeSchema }).optional().default({ scope: 'user' }))
    .query(async ({ ctx, input }) => {
      const scope = input.scope;
      const cfg = COOKIE_CONFIG[scope];
      const cookieStore = await cookies();
      let sessionId = cookieStore.get(cfg.sessionCookie)?.value;
      const isLocalhost = getIsLocalhost(ctx.req.url);

      if (!sessionId) {
        sessionId = generateSessionId();
        cookieStore.set(cfg.sessionCookie, sessionId, {
          maxAge: 60 * 60 * 24,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production' && !isLocalhost,
          sameSite: 'lax',
          path: '/',
        });
      }

      const csrfToken = await generateCSRFToken(sessionId);
      return { csrfToken };
    }),

  login: authRateLimitedProcedure
    .input(
      z.object({
        scope: scopeSchema,
        username: z.string().min(3),
        password: z.string().min(6),
        csrfToken: z.string().optional(),
        fpid: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { scope, username, password, csrfToken, fpid } = input;
      const cfg = COOKIE_CONFIG[scope];
      const isLocalhost = getIsLocalhost(ctx.req.url);
      const cookieStore = await cookies();
      const currentSessionId = cookieStore.get(cfg.sessionCookie)?.value;

      if (currentSessionId && csrfToken) {
        if (scope === 'user') {
          const csrfValid = await verifyCSRFToken(csrfToken, currentSessionId, true);
          if (!csrfValid.valid) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Invalid request. Please refresh the page.',
            });
          }
        } else {
          const csrfValid = await verifyCSRFToken(csrfToken, currentSessionId);
          if (!csrfValid) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid request' });
          }
        }
      } else if (scope === 'user' && currentSessionId && !csrfToken) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Invalid request. Please refresh the page.',
        });
      }

      if (scope === 'user') {
        const result = await authenticateUser(username, password);
        if (!result.success || !result.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: result.error || 'Authentication failed',
          });
        }

        const user = result.user;
        const ipAddress = ctx.headers.get('x-forwarded-for') || 'unknown';
        const userAgent = ctx.headers.get('user-agent') || 'unknown';

        if (currentSessionId) {
          await SessionManager.destroySession(currentSessionId);
          await revokeCSRFToken(currentSessionId);
        }

        const token = await SessionManager.registerDevice(
          user.id,
          userAgent,
          ipAddress,
          fpid ?? null,
        );
        const sessionId = await SessionManager.createSession(
          user.id,
          sanitizeInput(username),
          ipAddress,
          userAgent,
          token,
          'user',
        );

        await revokeCSRFToken(sessionId);
        await SessionManager.setSessionCookie(sessionId, isLocalhost);

        cookieStore.set('token', token, {
          maxAge: appConfig.token.maxAge,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production' && !isLocalhost,
          sameSite: 'strict',
          path: '/',
        });

        const isAdmin = await hasUserRole(user.id, 'admin');
        const isSupport = await hasUserRole(user.id, 'support');

        const { createUserDataCookie, USER_DATA_COOKIE_NAME, getUserDataCookieOptions } =
          await import('@/lib/auth/user-cookie.server');
        cookieStore.set(
          USER_DATA_COOKIE_NAME,
          createUserDataCookie({
            user_id: user.userId,
            username: user.username,
            avatar: user.avatar ?? null,
            banner: user.banner ?? null,
            pex: isAdmin ? 'a' : isSupport ? 's' : 'u',
            balance: user.balance ?? 0,
          }),
          getUserDataCookieOptions(isLocalhost),
        );

        return { message: 'Login successful', user_id: user.userId };
      }

      // Admin scope
      const result = await authenticateAdmin(username, password);
      if (!result.success || !result.admin) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: result.error || 'Authentication failed',
        });
      }

      const token = randomBytes(32).toString('hex');

      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
      }

      /*
       * Admin auth state lives in two places:
       *   - the cookie pair (admin_sid, admin_token)
       *   - the session entry in SessionManager (with tokenFingerprint = HMAC(token))
       * The raw token is intentionally NOT persisted to the DB.
       */

      const ipAddress = ctx.headers.get('x-forwarded-for') || 'unknown';
      const userAgent = ctx.headers.get('user-agent') || 'unknown';

      const sessionId = await SessionManager.createSession(
        result.admin.id,
        sanitizeInput(username),
        ipAddress,
        userAgent,
        token,
        'admin',
      );

      await revokeCSRFToken(sessionId);
      await SessionManager.setSessionCookie(sessionId, isLocalhost, cfg.sessionCookie);

      const cookieOptions = {
        maxAge: 60 * 60 * 6,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'strict' as const,
        path: '/',
      };

      cookieStore.set(cfg.tokenCookie, token, cookieOptions);
      cookieStore.set('admin_username', sanitizeInput(username), cookieOptions);

      logger.info('Admin login success', {
        username: sanitizeInput(username),
        sessionId: sessionId.substring(0, 8) + '...',
        ip: ipAddress,
      });

      return { message: 'Admin login successful', username: sanitizeInput(username) };
    }),

  register: authRateLimitedProcedure
    .input(
      z.object({
        scope: scopeSchema,
        username: z.string().min(3),
        password: z.string().min(6),
        confirmPassword: z.string().optional(),
        csrfToken: z.string().optional(),
        fpid: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { scope, username, password, confirmPassword, csrfToken, fpid } = input;
      const cfg = COOKIE_CONFIG[scope];
      const isLocalhost = getIsLocalhost(ctx.req.url);
      const cookieStore = await cookies();
      const currentSessionId = cookieStore.get(cfg.sessionCookie)?.value;

      if (currentSessionId && csrfToken && !(await verifyCSRFToken(csrfToken, currentSessionId))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid request' });
      }

      if (scope === 'admin') {
        const adminAlreadyExists = await checkAdminExists();
        if (adminAlreadyExists) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin account already exists' });
        }

        if (confirmPassword && password !== confirmPassword) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Пароли не совпадают' });
        }

        const result = await createAdmin(username, password);
        if (!result.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: result.error || 'Failed to create account',
          });
        }

        logger.info('Admin account created', {
          username: sanitizeInput(username),
          ip: ctx.headers.get('x-forwarded-for'),
        });

        return { message: 'Admin created successfully' };
      }

      // User scope
      if (confirmPassword && password !== confirmPassword) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Пароли не совпадают' });
      }

      const result = await createUser(username, password);
      if (!result.success || !result.user) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error || 'Failed to create account',
        });
      }

      const user = result.user;
      const ipAddress = ctx.headers.get('x-forwarded-for') || 'unknown';
      const userAgent = ctx.headers.get('user-agent') || 'unknown';

      const token = await SessionManager.registerDevice(
        user.id,
        userAgent,
        ipAddress,
        fpid ?? null,
      );
      const sessionId = await SessionManager.createSession(
        user.id,
        sanitizeInput(username),
        ipAddress,
        userAgent,
        token,
        'user',
      );

      await SessionManager.setSessionCookie(sessionId, isLocalhost);

      cookieStore.set('token', token, {
        maxAge: appConfig.token.maxAge,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && !isLocalhost,
        sameSite: 'strict',
        path: '/',
      });

      const { createUserDataCookie, USER_DATA_COOKIE_NAME, getUserDataCookieOptions } =
        await import('@/lib/auth/user-cookie.server');
      cookieStore.set(
        USER_DATA_COOKIE_NAME,
        createUserDataCookie({
          user_id: user.userId,
          username: user.username,
          avatar: user.avatar ?? null,
          banner: user.banner ?? null,
          pex: 'u',
          balance: user.balance ?? 0,
        }),
        getUserDataCookieOptions(isLocalhost),
      );

      return { message: 'User created successfully', user_id: user.userId };
    }),

  logout: publicProcedure
    .input(z.object({ scope: scopeSchema }).optional().default({ scope: 'user' }))
    .mutation(async ({ ctx, input }) => {
      const scope = input.scope;
      const cfg = COOKIE_CONFIG[scope];
      const cookieStore = await cookies();
      const sessionId = cookieStore.get(cfg.sessionCookie)?.value;

      if (sessionId) {
        await SessionManager.destroySession(sessionId);
        await revokeCSRFToken(sessionId);
      }

      await SessionManager.clearSessionCookie(cfg.sessionCookie);
      cookieStore.delete(cfg.tokenCookie);

      if (scope === 'user') {
        const token = cookieStore.get('token')?.value;
        if (token) {
          await SessionManager.revokeDevice(token);
          await invalidateUserTokenCache(token);
        }
        cookieStore.delete('user_data');
        cookieStore.delete('oauth_state');
      } else {
        cookieStore.delete('admin_username');
        const username = cookieStore.get('admin_username')?.value;
        if (username) {
          logger.info('Admin logout', {
            username,
            sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'none',
            ip: ctx.headers.get('x-forwarded-for'),
          });
        }
      }

      return { success: true };
    }),

  devices: protectedProcedure.query(async ({ ctx }) => {
    if (!db) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database error' });
    }

    try {
      const devices = await db
        .select()
        .from(userDevices)
        .where(eq(userDevices.userId, ctx.user.id))
        .orderBy(desc(userDevices.lastActive));

      const currentToken = (await cookies()).get('token')?.value;
      const currentTokenHash = currentToken
        ? createHash('sha256').update(currentToken).digest('hex')
        : null;

      const devicesWithCurrent = devices.map((d) => ({
        id: d.id,
        device_name: d.deviceName,
        ip_address: d.ipAddress,
        location: d.location,
        last_active: d.lastActive,
        created_at: d.createdAt,
        is_current: d.tokenHash === currentTokenHash,
      }));

      return { devices: devicesWithCurrent };
    } catch (error) {
      logger.error('Failed to fetch devices', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: ctx.user.id,
      });
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch devices' });
    }
  }),

  revokeDevice: protectedProcedure.input(deviceIdParamSchema).mutation(async ({ ctx, input }) => {
    await SessionManager.revokeDeviceById(input.deviceId, ctx.user.id);
    return { success: true };
  }),

  changePassword: protectedProcedure
    .input(passwordChangeSchema)
    .mutation(async ({ ctx, input }) => {
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not configured' });
      }

      const user = ctx.user;
      const { oldPassword, newPassword } = input;

      try {
        const rows = await db
          .select({ passwordHash: users.passwordHash })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);
        const userData = rows[0];

        if (!userData) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to verify password',
          });
        }

        if (!userData.passwordHash) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot change password for OAuth account',
          });
        }

        const isValidPassword = await argon2Verify(userData.passwordHash, oldPassword);
        if (!isValidPassword) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Неверный текущий пароль' });
        }

        const newPasswordHash = await argon2Hash(newPassword, {
          memoryCost: 8192,
          timeCost: 2,
          parallelism: 1,
        });

        await db.update(users).set({ passwordHash: newPasswordHash }).where(eq(users.id, user.id));

        const currentToken = (await cookies()).get('token')?.value;
        if (currentToken) {
          await SessionManager.revokeOtherDevices(user.id, currentToken);
        }

        logger.info('Password changed successfully', { userId: user.id });
        return { message: 'Password changed successfully' };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update password',
        });
      }
    }),
});
