import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { NextResponse } from 'next/server';
import { appRouter } from '@/lib/trpc/routers/root';
import { createTRPCContext } from '@/lib/trpc/init';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';

export function OPTIONS() {
  return handleCorsPreflight();
}

async function handler(req: Request) {
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext,
    onError: ({ error, path, type }) => {
      const context = {
        path,
        type,
        code: error.code,
        error: error.message,
        ...(error.cause ? { cause: String(error.cause) } : {}),
      };

      if (error.code === 'INTERNAL_SERVER_ERROR') {
        logger.error(`tRPC: Internal server error on ${path}`, context);
      } else if (error.code === 'FORBIDDEN' || error.code === 'UNAUTHORIZED') {
        logger.warn(`tRPC: Access denied on ${path}`, context);
      } else if (error.code === 'TOO_MANY_REQUESTS') {
        logger.warn(`tRPC: Rate limit hit on ${path}`, context);
      } else {
        logger.warn(`tRPC: ${error.code} on ${path}`, context);
      }
    },
  });

  return setCorsHeaders(new NextResponse(response.body, response));
}

export { handler as GET, handler as POST };
