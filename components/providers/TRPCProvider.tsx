'use client';

import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { httpBatchLink } from '@trpc/client';
import { TRPCClientError } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { TRPCLink } from '@trpc/client';
import type { AppRouter } from '@/lib/trpc/routers/root';
import { trpc } from '@/lib/trpc/client';
import { rateLimitLink } from '@/lib/trpc/rate-limit-link';

const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000; // 24h
const PERSIST_CACHE_KEY = 'REACT_QUERY_OFFLINE_CACHE';

/** Singleton ref for clearing in-memory cache from outside React tree */
let queryClientRef: QueryClient | null = null;

/**
 * Clears the tRPC/React Query cache and localStorage when changing accounts/logging out.
 * Call before redirecting to /auth.
 */
export function clearQueryCache() {
  if (typeof window === 'undefined') return;
  /** Clear the in-memory React Query cache */
  queryClientRef?.clear();
  /** Clear the persisted React Query cache */
  try {
    window.localStorage.removeItem(PERSIST_CACHE_KEY);
  } catch {}
  /** Clear the support-related cache */
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && (key.startsWith('support_') || key.startsWith('support_panel_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch {}
}

function handleTRPCError(err: unknown) {
  if (err instanceof TRPCClientError && err.data?.code === 'UNAUTHORIZED') {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname || '';
      if (path !== '/auth' && !path.startsWith('/ui/panel/admin')) {
        const return_to = path && path !== '/' ? `&return_to=${encodeURIComponent(path)}` : '';
        window.location.href = `/auth?reason=session_expired${return_to}`;
      }
    }
    return;
  }
  if (typeof console !== 'undefined' && console.error) {
    console.error('[tRPC error]', err);
  }
}

/** Link: error logging and redirect on 401 */
const errorHandlerLink: TRPCLink<AppRouter> = () => {
  return ({ next, op }) => {
    return observable((observer) => {
      const unsub = next(op).subscribe({
        next: observer.next,
        error(err) {
          handleTRPCError(err);
          observer.error(err);
        },
        complete: observer.complete,
      });
      return unsub;
    });
  };
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: PERSIST_MAX_AGE,
        retry: (failureCount, error) => {
          if ((error as { data?: { httpStatus?: number } })?.data?.httpStatus === 401) return false;
          if ((error as { data?: { httpStatus?: number } })?.data?.httpStatus === 403) return false;
          return failureCount < 2;
        },
      },
    },
  });
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client = makeQueryClient();
    queryClientRef = client;
    return client;
  });
  /**
   * Defer persister creation to useEffect to avoid hydration mismatch:
   ^ Server always renders null, client initializes after mount.
   */
  const [persister, setPersister] = useState<ReturnType<typeof createAsyncStoragePersister> | null>(
    null,
  );

  useEffect(() => {
    setPersister(createAsyncStoragePersister({ storage: window.localStorage }));
  }, []);

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        errorHandlerLink,
        rateLimitLink,
        httpBatchLink({
          url: '/api/trpc',
          fetch(url, options) {
            return fetch(url, { ...options, credentials: 'include' });
          },
        }),
      ],
    }),
  );

  const content = (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );

  /** Wrap with PersistQueryClientProvider only after client-side mount */
  if (persister) {
    return (
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: PERSIST_MAX_AGE,
        }}
      >
        {content}
      </PersistQueryClientProvider>
    );
  }

  return content;
}
