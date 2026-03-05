'use client';

import { TRPCClientError, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from './routers/root';

type RetryFn = () => void;
type RateLimitListener = (retry: RetryFn) => void;

let rateLimitListener: RateLimitListener | null = null;

/** Subscribe to rate limit events from tRPC. Returns unsubscribe fn. */
export function onRateLimited(listener: RateLimitListener) {
  rateLimitListener = listener;
  return () => {
    rateLimitListener = null;
  };
}

/** tRPC link that intercepts TOO_MANY_REQUESTS, emits event for captcha UI, and retries. */
export const rateLimitLink: TRPCLink<AppRouter> = () => {
  return ({ next, op }) => {
    return observable((observer) => {
      const execute = () => {
        const unsubscribe = next(op).subscribe({
          next: observer.next,
          error(err) {
            if (err instanceof TRPCClientError && err.data?.code === 'TOO_MANY_REQUESTS') {
              if (rateLimitListener) {
                rateLimitListener(() => {
                  // Retry after captcha success
                  execute();
                });
              } else {
                observer.error(err);
              }
            } else {
              observer.error(err);
            }
          },
          complete: observer.complete,
        });
        return unsubscribe;
      };
      return execute();
    });
  };
};
