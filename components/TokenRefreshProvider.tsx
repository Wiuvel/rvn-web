'use client';

import { useTokenRefresh } from '@/hooks/useTokenRefresh';

/**
 * Глобальный провайдер для автоматического обновления токенов
 * Работает на всех страницах, где используется авторизация
 */
export function TokenRefreshProvider({ children }: { children: React.ReactNode }) {
  // Автоматическое обновление токенов перед истечением
  useTokenRefresh();
  
  return <>{children}</>;
}

