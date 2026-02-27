import type { Metadata, Viewport } from 'next';
import '../globals.css';
import './legal.css';
import { pageMetadata } from '@/lib/utils/seo';
import ScrollToTop from '@/components/layout/ScrollToTop';

export const metadata: Metadata = pageMetadata.legal;

export const viewport: Viewport = {
  themeColor: '#0f7fdb',
};

export default function LegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="legal-layout">
      <ScrollToTop />
      {children}
    </div>
  );
}
