import type { Metadata } from 'next';
import './protection.css';
import { pageMetadata } from '@/lib/seo';

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
    <>
      {children}
    </>
  );
}
