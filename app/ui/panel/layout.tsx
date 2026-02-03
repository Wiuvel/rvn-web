import type { Metadata } from 'next';
import '../../globals.css';
import './panel.css';

export const metadata: Metadata = {
  title: 'Серверная панель | RVN',
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

export default function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="admin-panel-layout">
        {children}
      </div>
    </div>
  );
}
