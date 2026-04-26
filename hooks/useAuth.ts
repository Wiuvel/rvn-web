'use client';

import { useMemo, useLayoutEffect, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { UserData } from '@/types';
import { parseUserDataCookieClient } from '@/lib/auth/user-cookie.client';

/**
 * Represents the expected response structure from the `auth.me` tRPC endpoint.
 */
type AuthMeResponse = {
  authenticated: boolean;
  id?: string;
  user_id?: string;
  username?: string;
  token?: string;
  created_at?: string;
  last_login?: string;
  avatar?: string | null;
  banner?: string | null;
  isSupport?: boolean;
  isAdmin?: boolean;
  balance?: number;
};

function toUserData(data: AuthMeResponse | null): UserData | null {
  if (!data || data.authenticated === false || !data.user_id) return null;
  const pex = data.isAdmin ? 'a' : data.isSupport ? 's' : 'u';
  return {
    id: data.id || data.user_id,
    user_id: data.user_id,
    username: data.username || '',
    created_at: data.created_at || '',
    last_login: data.last_login,
    avatar: data.avatar ?? null,
    banner: data.banner ?? null,
    token: data.token,
    isSupport: data.isSupport,
    isAdmin: data.isAdmin,
    balance: data.balance ?? 0,
    pex,
  };
}

function cookieToFallbackData(): AuthMeResponse | null {
  const payload = parseUserDataCookieClient();
  if (!payload) return null;
  const pex = payload.pex ?? 'u';
  return {
    authenticated: true,
    id: payload.user_id,
    user_id: payload.user_id,
    username: payload.username,
    created_at: '',
    avatar: payload.avatar ?? null,
    banner: payload.banner ?? null,
    isSupport: pex === 's' || pex === 'a',
    isAdmin: pex === 'a',
    balance: payload.balance ?? 0,
  };
}

export interface UseAuthOptions {
  requireAuth?: boolean;
  redirectOnFail?: string;
  redirectOnTimeout?: string;
  silent?: boolean;
  validateUserId?: string;
  /**
   * Bypasses the network request and relies strictly on the client-side cookie.
   * Useful for lightweight components like headers that only need basic user metadata.
   */
  lightweight?: boolean;
  onSuccess?: (data: UserData) => void;
  onError?: (error: Error) => void;
}

export interface UseAuthReturn {
  userData: UserData | null;
  loading: boolean;
  error: Error | null;
  sessionExpired: boolean;
}

const STALE_TIME = 60 * 1000;

/**
 * Hook for managing authentication state and fetching the current user.
 * Combines client-side cookie parsing for immediate feedback with a tRPC call
 * for verified data. Can optionally redirect unauthenticated users.
 *
 * @param options Configuration options for authentication behavior.
 * @returns The current authentication state, including user data, loading status, and errors.
 */
export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const {
    requireAuth = false,
    redirectOnFail,
    redirectOnTimeout: _redirectOnTimeout,
    silent = false,
    validateUserId,
    lightweight = false,
    onSuccess,
    onError,
  } = options;

  const router = useRouter();
  const [cookieFallback, setCookieFallback] = useState<AuthMeResponse | null>(null);

  useLayoutEffect(() => {
    setCookieFallback(cookieToFallbackData());
  }, []);

  const fallbackFromCookie = cookieFallback;
  const shouldFetch = !!fallbackFromCookie && !lightweight;

  const {
    data,
    error: trpcError,
    isLoading,
  } = trpc.auth.me.useQuery(undefined, {
    enabled: shouldFetch,
    staleTime: STALE_TIME,
    placeholderData: (fallbackFromCookie ?? undefined) as any,
    refetchOnWindowFocus: !lightweight,
    retry: (failureCount, error) => {
      if ((error as any)?.data?.httpStatus === 401) return false;
      return failureCount < 2;
    },
  });

  useEffect(() => {
    if (data && (data as AuthMeResponse).authenticated !== false) {
      const user = toUserData(data as AuthMeResponse);
      if (user && onSuccess) onSuccess(user);
    }
  }, [data, onSuccess]);

  useEffect(() => {
    if (trpcError) {
      const err = new Error(trpcError.message);
      (err as any).status = (trpcError as any)?.data?.httpStatus;
      if (onError) onError(err);
      else if (!silent) console.error('Auth fetch error:', trpcError);
    }
  }, [trpcError, onError, silent]);

  const error: Error | null = trpcError
    ? Object.assign(new Error(trpcError.message), { data: (trpcError as any).data })
    : null;

  const userData = useMemo(
    () => toUserData((data as AuthMeResponse | undefined) ?? fallbackFromCookie),
    [data, fallbackFromCookie],
  );

  const [sessionExpired, setSessionExpired] = useState(false);

  useLayoutEffect(() => {
    const apiData = data as AuthMeResponse | undefined;
    const isAuthenticated = apiData?.authenticated === true && !!apiData?.user_id;
    const apiSaysUnauthenticated =
      apiData?.authenticated === false ||
      (trpcError && (trpcError as any)?.data?.httpStatus === 401);

    if (isAuthenticated) {
      setSessionExpired(false);
      return;
    }

    /**
     * Mark the session as expired strictly when:
     * 1. A valid cookie previously existed.
     * 2. The API explicitly returns an unauthenticated status.
     * 3. A fetch was actively requested and completed.
     */
    const hadCookie = !!fallbackFromCookie;
    if (hadCookie && apiSaysUnauthenticated && !isLoading && shouldFetch) {
      setSessionExpired(true);
    }
  }, [fallbackFromCookie, data, trpcError, isLoading, shouldFetch]);

  useLayoutEffect(() => {
    if (!userData || !validateUserId || !redirectOnFail) return;
    if (userData.user_id !== validateUserId) {
      router.push(redirectOnFail);
    }
  }, [userData, validateUserId, redirectOnFail, router]);

  useEffect(() => {
    if (!requireAuth || !redirectOnFail) return;
    const unauth =
      (data as AuthMeResponse | undefined)?.authenticated === false ||
      (trpcError && (trpcError as any)?.data?.httpStatus === 401);
    if (unauth && !isLoading) {
      document.cookie = 'user_data=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      router.push(redirectOnFail);
    }
  }, [requireAuth, redirectOnFail, data, trpcError, isLoading, router]);

  const loading = lightweight ? false : isLoading;
  const displayData = lightweight ? toUserData(fallbackFromCookie) : userData;

  return {
    userData: displayData ?? userData ?? null,
    loading,
    error,
    sessionExpired,
  };
}
