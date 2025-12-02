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
          cache: 'no-store',
        });

        if (response.ok) {
          lastRefreshRef.current = Date.now();
          // После успешного обновления, триггерим событие для других компонентов
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tokenRefreshed'));
          }
          return true;
        }
        return false;
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error refreshing token:', error);
        }
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
      
      // Проверяем не чаще чем раз в 10 секунд (уменьшили для более быстрой реакции)
      if (now - lastCheckRef.current < 10 * 1000) {
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

        // Если получили 401, токен истек - обновляем НЕМЕДЛЕННО
        if (response.status === 401) {
          await refreshToken();
          // После обновления токена, повторяем проверку через небольшую задержку
          // чтобы убедиться что токен обновился
          setTimeout(() => {
            checkAndRefreshToken();
          }, 500);
        }
      } catch (error) {
        // Игнорируем ошибки сети, но логируем для отладки
        if (process.env.NODE_ENV === 'development') {
          console.error('Error checking token:', error);
        }
      }
    };

    // Инициализируем время последнего обновления
    // Если это первый запуск, устанавливаем время так, чтобы проверить токен сразу
    if (lastRefreshRef.current === 0) {
      // Устанавливаем время так, чтобы проверка сработала сразу
      lastRefreshRef.current = Date.now() - 9 * 60 * 1000; // 9 минут назад, чтобы сразу проверить
    }

    // Проверяем токен каждые 30 секунд для более частых проверок
    // Это позволяет быстрее обнаружить истекший токен
    intervalRef.current = setInterval(checkAndRefreshToken, 30 * 1000);

    // Проверяем СРАЗУ при монтировании (с минимальной задержкой) - критично для работы после долгого отсутствия
    // Используем небольшую задержку только чтобы не блокировать первый рендер
    const immediateCheck = setTimeout(() => {
      checkAndRefreshToken();
    }, 100);

    return () => {
      clearTimeout(immediateCheck);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);
}

