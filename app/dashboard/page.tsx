'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function DashboardPage() {
  const router = useRouter();
  const { loading } = useAuth({
    requireAuth: true,
    redirectOnFail: '/auth',
    redirectOnTimeout: '/error/500',
    onSuccess: (data) => {
      // Редиректим на правильный URL с токеном
      if (data.dashboard_token) {
        router.push(`/dashboard/${data.dashboard_token}`);
      }
    }
  });

  if (loading) {
    return <LoadingSpinner />;
  }

  return null; // Компонент редиректит, поэтому ничего не рендерим
}
