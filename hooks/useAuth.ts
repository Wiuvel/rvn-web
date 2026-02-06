'use client';

import { useState, useEffect, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserData } from '@/types';
import { AUTH_FETCH_TIMEOUT } from '@/lib/utils/constants';
import { parseUserDataCookieClient } from '@/lib/auth/user-cookie.client';

export interface UseAuthOptions {
  requireAuth?: boolean;
  redirectOnFail?: string;
  redirectOnTimeout?: string;
  silent?: boolean; // Не выводить ошибки в консоль
  validateUserId?: string; // Проверять совпадение user_id (для страницы дашборда)
  lightweight?: boolean; // Использовать только данные из cookie, без запроса к API
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
    validateUserId,
    lightweight = false,
    onSuccess,
    onError
  } = options;

  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const router = useRouter();

  // Мгновенное отображение аватара/username из user_data cookie до первого paint
  useLayoutEffect(() => {
    const payload = parseUserDataCookieClient();
    if (payload) {
      setUserData({ ...payload } as UserData);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let controller: AbortController | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const fetchUserData = async () => {
      // Если включен lightweight режим, используем данные из cookie (уже установлены в useLayoutEffect)
      // и не делаем запрос к API
      if (lightweight) {
        setLoading(false);
        // Если данные есть, вызываем onSuccess
        if (userData && onSuccess) {
          onSuccess(userData);
        }
        return;
      }

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
            if (data.authenticated === false || !data.user_id) {
              if (requireAuth && redirectOnFail) {
                // Clear potentially invalid cookies on client side before redirecting
                document.cookie = 'user_data=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
                router.push(redirectOnFail);
                return;
              }
              setUserData(null);
              return;
            }

            // Проверяем совпадение user_id, если требуется (для страницы дашборда)
            if (validateUserId && data.user_id !== validateUserId) {
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
  }, [requireAuth, redirectOnFail, redirectOnTimeout, silent, validateUserId, router]);

  return { userData, loading, error };
}

