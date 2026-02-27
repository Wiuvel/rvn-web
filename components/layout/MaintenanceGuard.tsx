import { headers } from 'next/headers';
import { isMaintenanceActive, getMaintenanceConfig } from '@/lib/utils/maintenance';
import MaintenancePage from '@/components/layout/MaintenancePage';

export default async function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || '';

  try {
    // Исключаем админ-панель, API и статику
    const isExempt =
      pathname.startsWith('/ui/panel') ||
      pathname.startsWith('/api/admin') ||
      pathname.startsWith('/api/auth') ||
      pathname.startsWith('/auth') ||
      pathname.startsWith('/_next') ||
      pathname.startsWith('/static') ||
      pathname.includes('favicon') ||
      pathname.startsWith('/maintenance');

    if (!isExempt) {
      const isActive = await isMaintenanceActive();
      if (isActive) {
        const config = await getMaintenanceConfig();
        return <MaintenancePage message={config.message} />;
      }
    }
  } catch (error) {
    console.error('Failed to check maintenance mode:', error);
  }

  return <>{children}</>;
}
