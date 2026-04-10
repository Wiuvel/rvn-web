import type { Metadata, Viewport } from 'next';
import NotificationsPageClient from '@/components/notifications/NotificationsPageClient';

export const metadata: Metadata = {
  title: 'Уведомления — RVN',
  description: 'Ваши уведомления.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0f7fdb',
};

export default function NotificationsPage() {
  return <NotificationsPageClient />;
}
