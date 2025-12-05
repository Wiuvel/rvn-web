import { getTeamCount } from '@/lib/data/team';
import AdminPanelContent from '@/components/admin/AdminPanelContent';

export default async function AdminPanelPage() {
  // Fetch data on the server
  const teamStats = await getTeamCount();

  return <AdminPanelContent teamCount={teamStats.count} />;
}
