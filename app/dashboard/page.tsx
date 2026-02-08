'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useEffect } from 'react';

export default function DashboardPage() {
  const router = useRouter();
  const { loading, userData } = useAuth({
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

  useEffect(() => {
    if (!loading && !userData) {
      router.push('/auth');
    }
  }, [loading, userData, router]);

  if (loading) {
    return <LoadingSpinner />;
  }

  // Fallback return if not loading but no userData
  if (!userData) {
      return null;
  }

  return null;
}
