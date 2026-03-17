import DashboardClient from '@/components/dashboard/DashboardClient';

export default async function DashboardPage({ params }: { params: Promise<{ user_id: string }> }) {
  const { user_id } = await params;

  return <DashboardClient userId={user_id} />;
}
