'use client';

import { useEffect, useRef } from 'react';

/**
 * Хук для автоматического обновления access token перед истечением
 * Проверяет время до истечения токена через API и обновляет его заранее (за 2 минуты до истечения)
 */
export function useTokenRefresh() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef(false);
  const lastRefreshRef = useRef<number>(0);
  const lastCheckRef = useRef<number>(0);

  useEffect(() => {
    // Функция для обновления токена
    const refreshToken = async (): Promise<boolean> => {
      if (isRefreshingRef.current) {
        return false; // Уже обновляется
      }

      try {
        isRefreshingRef.current = true;
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });

        if (response.ok) {
          lastRefreshRef.current = Date.now();
          return true;
        }
        return false;
      } catch (error) {
        console.error('Error refreshing token:', error);
        return false;
      } finally {
        isRefreshingRef.current = false;
      }
    };

    // Функция для проверки и обновления токена через API
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

      // Проверяем, прошло ли 8 минут с последнего обновления
      // Обновляем токен проактивно за 2 минуты до истечения (10 минут - 8 минут = 2 минуты)
      const timeSinceLastRefresh = now - lastRefreshRef.current;
      if (timeSinceLastRefresh > 8 * 60 * 1000) {
        // Обновляем токен проактивно
        await refreshToken();
        lastCheckRef.current = now;
        return;
      }

      try {
        // Делаем запрос к /api/auth/me для проверки токена
        const response = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        lastCheckRef.current = now;

        // Если получили 401, токен истек - обновляем
        if (response.status === 401) {
          await refreshToken();
        }
      } catch (error) {
        // Игнорируем ошибки сети
        console.error('Error checking token:', error);
      }
    };

    // Инициализируем время последнего обновления (текущее время минус 1 минута, чтобы не обновлять сразу)
    if (lastRefreshRef.current === 0) {
      lastRefreshRef.current = Date.now() - 60 * 1000;
    }

    // Проверяем токен каждые 2 минуты (120 секунд)
    // Это позволяет обновить токен за 2 минуты до истечения (10 минут - 8 минут = 2 минуты)
    intervalRef.current = setInterval(checkAndRefreshToken, 2 * 60 * 1000);

    // Проверяем сразу при монтировании (с небольшой задержкой, чтобы не блокировать рендер)
    const initialTimeout = setTimeout(() => {
      checkAndRefreshToken();
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      clearTimeout(initialTimeout);
    };
  }, []);
}

