import type { Metadata } from 'next';
import './protection.css';
import { pageMetadata } from '@/lib/seo';
import { exo2 } from '../fonts';

export const metadata: Metadata = {
  ...pageMetadata.protection,
  robots: 'noindex, nofollow, noarchive',
  other: {
    'googlebot': 'noindex, nofollow',
  },
};

export default function ProtectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={exo2.className} style={{ backgroundColor: '#0a0a0a', minHeight: '100vh', color: '#ffffff' }}>
      {children}
    </div>
  );
}
