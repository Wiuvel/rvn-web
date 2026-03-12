import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { checkAuth } from '@/lib/auth/helper';
import { hasUserRole } from '@/lib/auth/user-roles';
import DashboardClient from '@/components/dashboard/DashboardClient';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function DashboardPage({ params }: { params: Promise<{ user_id: string }> }) {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen />}>
      <DashboardContent params={params} />
    </Suspense>
  );
}

async function DashboardContent({ params }: { params: Promise<{ user_id: string }> }) {
  const { user_id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  const authResult = await checkAuth(undefined, { readOnly: true });

  if (!authResult.isAuthenticated || !authResult.user) {
    if (token) {
      redirect(`/api/auth/restore?redirect=${encodeURIComponent(`/dashboard/${user_id}`)}`);
    }
    redirect('/auth');
  }

  const user = authResult.user;

  if (user.user_id !== user_id) {
    redirect(`/dashboard/${user.user_id}`);
  }

  const [isSupport, isAdmin] = await Promise.all([
    hasUserRole(user.id, 'support'),
    hasUserRole(user.id, 'admin'),
  ]);

  const userData = {
    id: user.id,
    user_id: user.user_id,
    username: user.username,
    created_at: user.created_at,
    last_login: user.last_login,
    avatar: user.avatar,
    banner: user.banner,
    isSupport,
    isAdmin,
    balance: user.balance,
    pex: (isAdmin ? 'a' : isSupport ? 's' : 'u') as 'u' | 's' | 'a',
  };

  return <DashboardClient key={JSON.stringify(userData)} initialUserData={userData} />;
}
