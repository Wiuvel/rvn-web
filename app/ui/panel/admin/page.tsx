import { getTeamCount } from '@/lib/utils/team';
import AdminPanelContent from '@/components/admin/AdminPanelContent';

export default async function AdminPanelPage() {
  const teamStats = await getTeamCount();

  return <AdminPanelContent teamCount={teamStats.count} />;
}
