'use client';

import { useMemo, useLayoutEffect, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { UserData } from '@/types';
import { parseUserDataCookieClient } from '@/lib/auth/user-cookie.client';

/** Response shape from /api/auth/me */
interface AuthMeResponse {
  authenticated?: boolean;
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
}

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
  };
}

async function authMeFetcher(url: string): Promise<AuthMeResponse> {
  const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed ${res.status}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return data;
}

export interface UseAuthOptions {
  requireAuth?: boolean;
  redirectOnFail?: string;
  redirectOnTimeout?: string;
  silent?: boolean;
  validateUserId?: string;
  lightweight?: boolean; // При true — только user_data из cookie, без SWR fetch (для Header и т.д.)
  onSuccess?: (data: UserData) => void;
  onError?: (error: Error) => void;
}

export interface UseAuthReturn {
  userData: UserData | null;
  loading: boolean;
  error: Error | null;
  sessionExpired: boolean;
}

const AUTH_SWR_KEY = '/api/auth/me';
const DEDUPING_INTERVAL = 5 * 60 * 1000; // 5 минут

export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const {
    requireAuth = false,
    redirectOnFail,
    redirectOnTimeout,
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

  const { data, error, isLoading } = useSWR<AuthMeResponse>(
    shouldFetch ? AUTH_SWR_KEY : null,
    authMeFetcher,
    {
      fallbackData: fallbackFromCookie ?? undefined,
      revalidateOnMount: true,
      revalidateOnFocus: false,
      dedupingInterval: DEDUPING_INTERVAL,
      onSuccess: (d) => {
        const user = toUserData(d);
        if (user && onSuccess) onSuccess(user);
      },
      onError: (err) => {
        if (onError) onError(err);
        else if (!silent) console.error('Auth fetch error:', err);
      },
      onErrorRetry: (err, _key, _config, revalidate, { retryCount }) => {
        if ((err as Error & { status?: number }).status === 401) return;
        if (retryCount >= 2) return;
        setTimeout(() => revalidate({ retryCount }), 2000);
      },
    },
  );

  const userData = useMemo(() => toUserData(data ?? fallbackFromCookie), [data, fallbackFromCookie]);

  const [sessionExpired, setSessionExpired] = useState(false);

  useLayoutEffect(() => {
    const hadCookie = !!fallbackFromCookie;
    const apiSaysUnauthenticated = data?.authenticated === false || (error && (error as Error & { status?: number }).status === 401);
    if (hadCookie && apiSaysUnauthenticated) {
      setSessionExpired(true);
    }
  }, [fallbackFromCookie, data?.authenticated, error]);

  useLayoutEffect(() => {
    if (!userData || !validateUserId || !redirectOnFail) return;
    if (userData.user_id !== validateUserId) {
      router.push(redirectOnFail);
    }
  }, [userData, validateUserId, redirectOnFail, router]);

  useEffect(() => {
    if (!requireAuth || !redirectOnFail) return;
    const unauth = data?.authenticated === false || (error && (error as Error & { status?: number }).status === 401);
    if (unauth && !isLoading) {
      document.cookie = 'user_data=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      router.push(redirectOnFail);
    }
  }, [requireAuth, redirectOnFail, data?.authenticated, error, isLoading, router]);

  const loading = lightweight ? false : isLoading;
  const displayData = lightweight ? toUserData(fallbackFromCookie) : userData;

  return {
    userData: displayData ?? userData ?? null,
    loading,
    error: error ?? null,
    sessionExpired,
  };
}
