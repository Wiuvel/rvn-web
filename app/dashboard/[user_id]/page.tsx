import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { checkAuth } from '@/lib/auth/helper';
import { hasUserRole } from '@/lib/auth/user-roles';
import DashboardClient from '@/components/dashboard/DashboardClient';

export default async function DashboardPage({ params }: { params: Promise<{ user_id: string }> }) {
  const { user_id } = await params;
  const headersList = await headers();
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  const authResult = await checkAuth({ headers: headersList }, { readOnly: true });

  if (!authResult.isAuthenticated || !authResult.user) {
    if (token) {
      redirect(`/api/auth/restore?redirect=${encodeURIComponent(`/dashboard/${user_id}`)}`);
    }
    redirect('/auth');
  }

  const user = authResult.user;

  // Security check: ensure user is accessing their own dashboard
  if (user.user_id !== user_id) {
    redirect(`/dashboard/${user.user_id}`);
  }

  // Fetch roles
  const [isSupport, isAdmin] = await Promise.all([
    hasUserRole(user.id, 'support'),
    hasUserRole(user.id, 'admin'),
  ]);

  // Prepare user data for client component
  // Ensure dates are serialized to strings
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
