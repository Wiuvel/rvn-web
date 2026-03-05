import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/lib/trpc/routers/root';
import { createTRPCContext } from '@/lib/trpc/init';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return handleCorsPreflight();
}

async function handler(req: Request) {
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext,
    onError: ({ error, path }) => {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        logger.error(`tRPC error on '${path}'`, {
          error: error.message,
        });
      }
    },
  });

  return setCorsHeaders(response as any);
}

export { handler as GET, handler as POST };
