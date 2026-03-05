import { initTRPC, TRPCError } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { cookies, headers } from 'next/headers';
import { checkAuth } from '@/lib/auth/helper';
import { hasUserRole } from '@/lib/auth/user-roles';
import { generalRateLimit, authRateLimit } from '@/lib/security/rate-limit';
import { SessionManager } from '@/lib/auth/session-manager';
import { ZodError } from 'zod';

export async function createTRPCContext(opts: FetchCreateContextFnOptions) {
  const headersList = await headers();

  return {
    req: opts.req,
    headers: headersList,
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

// --- Middleware ---

const rateLimited = t.middleware(async ({ ctx, next }) => {
  const result = await generalRateLimit.check(ctx.req);
  if (!result.allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests',
    });
  }
  return next();
});

const authRateLimited = t.middleware(async ({ ctx, next }) => {
  const result = await authRateLimit.check(ctx.req);
  if (!result.allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests',
    });
  }
  return next();
});

const authed = t.middleware(async ({ ctx, next }) => {
  const authResult = await checkAuth(ctx.req);
  if (!authResult.isAuthenticated || !authResult.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: authResult.error || 'Not authenticated',
    });
  }
  return next({
    ctx: { user: authResult.user },
  });
});

const adminAuthed = t.middleware(async ({ ctx, next }) => {
  const authResult = await checkAuth(ctx.req);
  if (!authResult.isAuthenticated || !authResult.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  const isAdmin = await hasUserRole(authResult.user.id, 'admin');
  if (!isAdmin) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({
    ctx: { user: authResult.user, isAdmin: true as const },
  });
});

const supportAuthed = t.middleware(async ({ ctx, next }) => {
  const authResult = await checkAuth(ctx.req);
  if (!authResult.isAuthenticated || !authResult.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  const isSupport = await hasUserRole(authResult.user.id, 'support');
  const isAdmin = await hasUserRole(authResult.user.id, 'admin');
  if (!isSupport && !isAdmin) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Support access required' });
  }
  return next({
    ctx: { user: authResult.user, isSupport, isAdmin },
  });
});

// Admin panel session middleware (uses admin_sid/admin_token cookies, separate from user auth)
const adminPanelAuthed = t.middleware(async ({ ctx, next }) => {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('admin_sid')?.value;
  const token = cookieStore.get('admin_token')?.value;

  if (!sessionId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }

  const ipAddress = ctx.headers.get('x-forwarded-for') || 'unknown';
  const userAgent = ctx.headers.get('user-agent') || 'unknown';
  const validation = await SessionManager.validateSession(
    sessionId,
    token || '',
    ipAddress,
    userAgent,
  );

  if (!validation.valid) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }

  const adminUsername = cookieStore.get('admin_username')?.value ?? null;

  return next({
    ctx: { adminSessionId: sessionId, adminUsername },
  });
});

export const protectedProcedure = publicProcedure.use(rateLimited).use(authed);
export const adminProcedure = publicProcedure.use(rateLimited).use(adminAuthed);
export const adminPanelProcedure = publicProcedure.use(rateLimited).use(adminPanelAuthed);
export const supportProcedure = publicProcedure.use(rateLimited).use(supportAuthed);
export const authRateLimitedProcedure = publicProcedure.use(authRateLimited);
