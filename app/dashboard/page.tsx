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
      // Redirect to the dashboard with the user_id
      if (data.user_id) {
        router.push(`/dashboard/${data.user_id}`);
      }
    }
  });

  if (loading) {
    return <LoadingSpinner />;
  }

  return null;
}
