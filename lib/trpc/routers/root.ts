import { router } from '../init';
import { authRouter } from './auth';
import { adminRouter } from './admin';
import { supportRouter } from './support';
import { userRouter } from './user';
import { rateLimitRouter } from './rate-limit';
import { protectionRouter } from './protection';

export const appRouter = router({
  auth: authRouter,
  admin: adminRouter,
  support: supportRouter,
  user: userRouter,
  rateLimit: rateLimitRouter,
  protection: protectionRouter,
});

export type AppRouter = typeof appRouter;
