'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function DashboardPage() {
  const router = useRouter();
  const hasRedirectedRef = useRef(false);
  const [isChecking, setIsChecking] = useState(true);
  
  const { userData, loading } = useAuth({
    requireAuth: true,
    redirectOnFail: '/auth',
    redirectOnTimeout: '/error/500',
    onSuccess: (data) => {
      // Редиректим на правильный URL с токеном
      if (data.dashboard_token && !hasRedirectedRef.current) {
        hasRedirectedRef.current = true;
        setIsChecking(false);
        router.replace(`/dashboard/${data.dashboard_token}`);
      }
    }
  });

  // Дополнительная проверка: если данные получены, но редирект не произошел
  useEffect(() => {
    if (userData && userData.dashboard_token && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      setIsChecking(false);
      router.replace(`/dashboard/${userData.dashboard_token}`);
    } else if (!loading && !userData && !isChecking) {
      // Если загрузка завершена, но данных нет - редиректим на auth
      router.replace('/auth');
    }
  }, [userData, loading, router, isChecking]);

  // Слушаем событие обновления токена для повторной проверки
  useEffect(() => {
    const handleTokenRefreshed = () => {
      // После обновления токена, просто ждем - useAuth сам перезапросит данные
      // через событие tokenRefreshed
      setIsChecking(true);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('tokenRefreshed', handleTokenRefreshed);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('tokenRefreshed', handleTokenRefreshed);
      }
    };
  }, []);

  if (loading || isChecking) {
    return <LoadingSpinner />;
  }

  return null; // Компонент редиректит, поэтому ничего не рендерим
}
