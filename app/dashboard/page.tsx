import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getUserData } from '@/lib/auth/user-cookie.server';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen />}>
      <DashboardRedirect />
    </Suspense>
  );
}

async function DashboardRedirect(): Promise<React.ReactNode> {
  const userData = await getUserData();

  if (!userData) {
    redirect('/auth');
  }

  if (userData.user_id) {
    redirect(`/dashboard/${userData.user_id}`);
  }

  redirect('/auth');
}
