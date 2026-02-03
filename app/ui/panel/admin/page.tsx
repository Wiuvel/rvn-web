import { cacheLife, cacheTag } from 'next/cache';
import { getTeamCount } from '@/lib/data/team';
import AdminPanelContent from '@/components/admin/AdminPanelContent';

export default async function AdminPanelPage() {
  'use cache';
  cacheLife('minutes');
  cacheTag('admin-team');

  const teamStats = await getTeamCount();

  return <AdminPanelContent teamCount={teamStats.count} />;
}
