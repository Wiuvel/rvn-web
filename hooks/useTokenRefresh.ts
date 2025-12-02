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
        // Тихий режим - ошибки обновления токена не критичны
        return false;
      } finally {
        isRefreshingRef.current = false;
      }
    };

    // Функция для проактивного обновления токена по таймеру
    // НЕ делает проверку через API - это делает useAuth
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

      // Проверяем, прошло ли 8 минут с последнего обновления
      // Обновляем токен проактивно за 2 минуты до истечения (10 минут - 8 минут = 2 минуты)
      const timeSinceLastRefresh = now - lastRefreshRef.current;
      if (timeSinceLastRefresh > 8 * 60 * 1000) {
        // Обновляем токен проактивно
        await refreshToken();
      }
    };

    // Инициализируем время последнего обновления
    // Если это первый запуск, устанавливаем время так, чтобы проверить токен сразу
    if (lastRefreshRef.current === 0) {
      // Устанавливаем время так, чтобы проверка сработала сразу
      lastRefreshRef.current = Date.now() - 9 * 60 * 1000; // 9 минут назад, чтобы сразу проверить
    }

    // Проверяем токен каждые 2 минуты для проактивного обновления
    // Не делаем проверку через API - это делает useAuth
    intervalRef.current = setInterval(checkAndRefreshToken, 2 * 60 * 1000);

    // Проверяем СРАЗУ при монтировании (с задержкой чтобы не конфликтовать с useAuth)
    // Используем задержку чтобы дать время useAuth сделать первый запрос
    const immediateCheck = setTimeout(() => {
      checkAndRefreshToken();
    }, 2000);

    return () => {
      clearTimeout(immediateCheck);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);
}

