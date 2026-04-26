import type { Metadata } from 'next';
import { generateMetadata } from '@/lib/utils/seo';

export const metadata: Metadata = generateMetadata({
  title: 'Тарифные планы',
  description: 'Выберите подходящий тарифный план RVN для приватного доступа в сеть.',
  keywords: ['тарифы', 'подписка', 'VPN', 'RVN', 'приватность'],
  url: '/subscription',
  noindex: true,
});

export default function SubscriptionLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
