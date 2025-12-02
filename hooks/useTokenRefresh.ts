'use client';

import { useEffect, useRef } from 'react';

/**
 * Хук для автоматического обновления access token перед истечением
 * Обновляет токен проактивно только если пользователь авторизован
 */
export function useTokenRefresh() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef(false);
  const lastRefreshRef = useRef<number>(0);
  const lastCheckRef = useRef<number>(0);
  const isAuthenticatedRef = useRef<boolean>(false);
  const consecutiveFailuresRef = useRef<number>(0);

  useEffect(() => {
    // Проверяем авторизацию через /api/auth/me перед обновлением
    const checkAuthentication = async (): Promise<boolean> => {
      try {
        const response = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        // Если получили 200, пользователь авторизован
        if (response.ok) {
          isAuthenticatedRef.current = true;
          consecutiveFailuresRef.current = 0;
          return true;
        }

        // Если получили 401, проверяем есть ли refresh token
        // Делаем это через попытку refresh, но только если не было много неудач
        if (response.status === 401) {
          // Если было много неудач подряд, не проверяем refresh token
          if (consecutiveFailuresRef.current >= 2) {
            isAuthenticatedRef.current = false;
            return false;
          }
          // Пытаемся обновить токен - если получим 401, значит нет refresh token
          return false; // Вернем false, но refreshToken сам проверит
        }

        isAuthenticatedRef.current = false;
        return false;
      } catch {
        isAuthenticatedRef.current = false;
        return false;
      }
    };

    // Функция для обновления токена
    const refreshToken = async (): Promise<boolean> => {
      if (isRefreshingRef.current) {
        return false; // Уже обновляется
      }

      // Если пользователь не авторизован и было много неудач, не делаем запрос
      if (!isAuthenticatedRef.current && consecutiveFailuresRef.current >= 2) {
        return false;
      }

      try {
        isRefreshingRef.current = true;
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
        });

        if (response.ok) {
          lastRefreshRef.current = Date.now();
          consecutiveFailuresRef.current = 0;
          isAuthenticatedRef.current = true;
          // После успешного обновления, триггерим событие для других компонентов
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tokenRefreshed'));
          }
          return true;
        }

        // Если получили 401, значит нет валидного refresh token
        if (response.status === 401) {
          consecutiveFailuresRef.current += 1;
          isAuthenticatedRef.current = false;
          // Останавливаем интервал если пользователь не авторизован
          if (consecutiveFailuresRef.current >= 2 && intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }

        return false;
      } catch (error) {
        consecutiveFailuresRef.current += 1;
        // Останавливаем интервал если было много ошибок
        if (consecutiveFailuresRef.current >= 3 && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return false;
      } finally {
        isRefreshingRef.current = false;
      }
    };

    // Функция для проактивного обновления токена по таймеру
    const checkAndRefreshToken = async () => {
      // Пропускаем проверку, если уже обновляется
      if (isRefreshingRef.current) {
        return;
      }

      const now = Date.now();
      
      // Проверяем не чаще чем раз в 30 секунд
      if (now - lastCheckRef.current < 30 * 1000) {
        return;
      }

      lastCheckRef.current = now;

      // Если было много неудач, проверяем авторизацию перед обновлением
      if (consecutiveFailuresRef.current >= 2) {
        const isAuth = await checkAuthentication();
        if (!isAuth) {
          return; // Пользователь не авторизован, не обновляем
        }
      }

      // Проверяем, прошло ли 8 минут с последнего обновления
      // Обновляем токен проактивно за 2 минуты до истечения (10 минут - 8 минут = 2 минуты)
      const timeSinceLastRefresh = now - lastRefreshRef.current;
      if (timeSinceLastRefresh > 8 * 60 * 1000) {
        // Обновляем токен проактивно
        await refreshToken();
      }
    };

    // Инициализируем время последнего обновления
    if (lastRefreshRef.current === 0) {
      lastRefreshRef.current = Date.now() - 9 * 60 * 1000; // 9 минут назад
    }

    // Слушаем событие успешной авторизации от useAuth
    const handleAuthSuccess = () => {
      isAuthenticatedRef.current = true;
      consecutiveFailuresRef.current = 0;
      // Перезапускаем интервал если он был остановлен
      if (!intervalRef.current) {
        intervalRef.current = setInterval(checkAndRefreshToken, 2 * 60 * 1000);
      }
    };

    // Слушаем событие обновления токена (от других компонентов)
    const handleTokenRefreshed = () => {
      isAuthenticatedRef.current = true;
      consecutiveFailuresRef.current = 0;
      lastRefreshRef.current = Date.now();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('authSuccess', handleAuthSuccess);
      window.addEventListener('tokenRefreshed', handleTokenRefreshed);
    }

    // Проверяем токен каждые 2 минуты для проактивного обновления
    intervalRef.current = setInterval(checkAndRefreshToken, 2 * 60 * 1000);

    // Проверяем СРАЗУ при монтировании (с задержкой чтобы не конфликтовать с useAuth)
    const immediateCheck = setTimeout(() => {
      checkAndRefreshToken();
    }, 3000);

    return () => {
      clearTimeout(immediateCheck);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('authSuccess', handleAuthSuccess);
        window.removeEventListener('tokenRefreshed', handleTokenRefreshed);
      }
    };
  }, []);
}

