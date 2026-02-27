import { redirect } from 'next/navigation';
import { getUserData } from '@/lib/auth/user-cookie.server';

export default async function DashboardPage() {
  const userData = await getUserData();

  if (!userData) {
    redirect('/auth');
  }

  if (userData.user_id) {
    redirect(`/dashboard/${userData.user_id}`);
  }

  // Fallback if user_id is missing but userData exists (should not happen normally)
  redirect('/auth');
}
