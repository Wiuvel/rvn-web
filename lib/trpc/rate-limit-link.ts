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
      let currentUnsub: (() => void) | null = null;

      const execute = () => {
        // Cancel previous subscription before creating a new one
        currentUnsub?.();

        const subscription = next(op).subscribe({
          next: observer.next,
          error(err) {
            if (err instanceof TRPCClientError && err.data?.code === 'TOO_MANY_REQUESTS') {
              if (rateLimitListener) {
                rateLimitListener(() => execute());
              } else {
                observer.error(err);
              }
            } else {
              observer.error(err);
            }
          },
          complete: observer.complete,
        });

        currentUnsub = subscription.unsubscribe.bind(subscription);
      };

      execute();

      return () => {
        currentUnsub?.();
      };
    });
  };
};
