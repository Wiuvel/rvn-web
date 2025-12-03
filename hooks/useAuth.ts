'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserData } from '@/types';
import { AUTH_FETCH_TIMEOUT } from '@/lib/utils/constants';

export interface UseAuthOptions {
  requireAuth?: boolean;
  redirectOnFail?: string;
  redirectOnTimeout?: string;
  silent?: boolean; // Не выводить ошибки в консоль
  validateToken?: string; // Проверять совпадение токена
  onSuccess?: (data: UserData) => void;
  onError?: (error: Error) => void;
}

export interface UseAuthReturn {
  userData: UserData | null;
  loading: boolean;
  error: Error | null;
}

export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const {
    requireAuth = false,
    redirectOnFail,
    redirectOnTimeout,
    silent = false,
    validateToken,
    onSuccess,
    onError
  } = options;

  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    let controller: AbortController | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const fetchUserData = async () => {
      try {
        controller = new AbortController();
        timeoutId = setTimeout(() => controller!.abort(), AUTH_FETCH_TIMEOUT);

        try {
          const response = await fetch('/api/auth/me', {
            signal: controller.signal,
            cache: 'no-store' // Ensure fresh data
          });

          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          if (!isMounted) return;

          if (response.ok) {
            const data = await response.json();

            // Проверяем, что пользователь авторизован
            if (data.authenticated === false || !data.dashboard_token) {
              if (requireAuth && redirectOnFail) {
                router.push(redirectOnFail);
                return;
              }
              setUserData(null);
              return;
            }

            // Проверяем совпадение токена, если требуется
            if (validateToken && data.dashboard_token !== validateToken) {
              if (redirectOnFail) {
                router.push(redirectOnFail);
                return;
              }
              setUserData(null);
              return;
            }

            setUserData(data);
            if (onSuccess) {
              onSuccess(data);
            }
          } else {
            if (requireAuth && redirectOnFail) {
              router.push(redirectOnFail);
              return;
            }
            setUserData(null);
          }
        } catch (fetchError: unknown) {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          if (!isMounted) return;

          // Обработка таймаута
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            const timeoutError = new Error('Request timeout');
            setError(timeoutError);
            
            if (redirectOnTimeout) {
              router.push(redirectOnTimeout);
              return;
            }
            
            if (onError) {
              onError(timeoutError);
            } else if (!silent) {
              console.error('Auth check timeout');
            }
            return;
          }

          // Обработка других ошибок
          const err = fetchError instanceof Error ? fetchError : new Error('Unknown error');
          setError(err);
          
          if (onError) {
            onError(err);
          } else if (!silent) {
            console.error('Failed to fetch user data:', err);
          }

          if (requireAuth && redirectOnFail) {
            router.push(redirectOnFail);
            return;
          }
          
          setUserData(null);
        }
      } catch (error) {
        if (!isMounted) return;

        const err = error instanceof Error ? error : new Error('Unknown error');
        setError(err);

        if (onError) {
          onError(err);
        } else if (!silent) {
          console.error('Failed to check auth:', err);
        }

        if (requireAuth && redirectOnFail) {
          router.push(redirectOnFail);
          return;
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchUserData();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (controller) {
        controller.abort();
      }
    };
    
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requireAuth, redirectOnFail, redirectOnTimeout, silent, validateToken, router]);

  return { userData, loading, error };
}

