'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserData } from '@/types';
import { AUTH_FETCH_TIMEOUT } from '@/lib/constants';

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
          let response = await fetch('/api/auth/me', {
            signal: controller.signal,
            cache: 'no-store' // Ensure fresh data
          });

          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          if (!isMounted) return;

          // Если получили 401, пытаемся обновить токен через refresh
          if (response.status === 401) {
            try {
              // Создаем новый controller для refresh запроса, чтобы избежать конфликтов
              const refreshController = new AbortController();
              const refreshTimeout = setTimeout(() => refreshController.abort(), 10000);
              
              const refreshResponse = await fetch('/api/auth/refresh', {
                method: 'POST',
                credentials: 'include',
                signal: refreshController.signal,
              });

              clearTimeout(refreshTimeout);

              if (refreshResponse.ok) {
                // Токен обновлен, повторяем запрос с новым controller
                const retryController = new AbortController();
                const retryTimeout = setTimeout(() => retryController.abort(), 10000);
                
                response = await fetch('/api/auth/me', {
                  signal: retryController.signal,
                  cache: 'no-store',
                });
                
                clearTimeout(retryTimeout);
              } else {
                // Refresh не удался, пользователь не авторизован
                if (requireAuth && redirectOnFail) {
                  router.push(redirectOnFail);
                  return;
                }
                setUserData(null);
                return;
              }
            } catch {
              // Ошибка при обновлении токена
              if (requireAuth && redirectOnFail) {
                router.push(redirectOnFail);
                return;
              }
              setUserData(null);
              return;
            }
          }

          if (response.ok) {
            const data = await response.json();

            // Проверяем, что пользователь авторизован
            // Если есть поле authenticated: false, значит пользователь не авторизован
            if (data.authenticated === false || !data.dashboard_token || !data.id) {
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
            }
            // Тихий режим - таймауты обрабатываются через onError
            return;
          }

          // Обработка других ошибок
          const err = fetchError instanceof Error ? fetchError : new Error('Unknown error');
          setError(err);
          
          if (onError) {
            onError(err);
          }
          // Тихий режим - ошибки обрабатываются через onError

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
        }
        // Тихий режим - ошибки обрабатываются через onError

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

    // Слушаем событие обновления токена для перезапуска проверки
    // Используем debounce чтобы избежать множественных вызовов
    let refreshTimeout: NodeJS.Timeout | null = null;
    const handleTokenRefreshed = () => {
      if (isMounted) {
        // Отменяем предыдущий запрос если он еще не выполнился
        if (refreshTimeout) {
          clearTimeout(refreshTimeout);
        }
        // Небольшая задержка чтобы дать время cookie обновиться и избежать дублирования
        refreshTimeout = setTimeout(() => {
          if (isMounted) {
            fetchUserData();
          }
          refreshTimeout = null;
        }, 200);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('tokenRefreshed', handleTokenRefreshed);
    }

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      if (controller) {
        controller.abort();
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('tokenRefreshed', handleTokenRefreshed);
      }
    };
    // onSuccess и onError не должны быть в зависимостях, так как это функции,
    // которые могут меняться при каждом рендере, что приведет к бесконечным перезапросам
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requireAuth, redirectOnFail, redirectOnTimeout, silent, validateToken, router]);

  return { userData, loading, error };
}
