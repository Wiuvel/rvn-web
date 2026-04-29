import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import SmoothScroll from '@/components/effects/SmoothScroll';
import ConditionalLayout from '@/components/layout/Conditional';
import { pageMetadata } from '@/lib/utils/seo';
import { exo2 } from './fonts';
import HomeStructuredData from '@/components/seo/HomeStructuredData';
import { domains, getStaticUrl } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { TRPCProvider } from '@/components/providers/TRPCProvider';
import { WebSocketProvider } from '@/components/providers/WebSocketProvider';
import SessionExpiredModal from '@/components/auth/SessionExpiredModal';

const getFaviconUrl = (path: string) => getStaticUrl(path);

export const metadata: Metadata = {
  ...pageMetadata.home,
  icons: {
    icon: [
      { url: getFaviconUrl('/favicon.ico'), type: 'image/x-icon' },
      { url: getFaviconUrl('/favicon.svg'), type: 'image/svg+xml' },
      { url: getFaviconUrl('/favicon-96x96.png'), sizes: '96x96', type: 'image/png' },
    ],
  },
  alternates: {
    canonical: domains.mainUrl,
  },
};

export const viewport: Viewport = {
  themeColor: '#0f7fdb',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`dark h-full scroll-smooth ${exo2.variable}`}
      data-scroll-behavior="smooth"
    >
      <body
        className={`relative h-full bg-neutral-950 text-neutral-100 antialiased ${exo2.className}`}
      >
        <TRPCProvider>
          <WebSocketProvider>
            <HomeStructuredData />
            <SmoothScroll />
            <Suspense fallback={<LoadingSpinner fullScreen />}>
              <SessionExpiredModal />
              <ConditionalLayout>{children}</ConditionalLayout>
            </Suspense>
          </WebSocketProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
