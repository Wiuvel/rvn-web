import type { Metadata } from 'next';
import '../../../globals.css';

export const metadata: Metadata = {
  title: 'Панель поддержки | RVN',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
  },
  other: {
    'googlebot': 'noindex, nofollow, noarchive, nosnippet, noimageindex',
    'bingbot': 'noindex, nofollow, noarchive, nosnippet, noimageindex',
  },
};

export default function SupportPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {children}
    </div>
  );
}

