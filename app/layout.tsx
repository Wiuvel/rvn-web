import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import SmoothScroll from "@/components/utils/SmoothScroll";
import ConditionalLayout from "@/components/layout/Conditional";
import { pageMetadata } from "@/lib/utils/seo";
import { exo2 } from "./fonts";
import HomeStructuredData from "@/components/seo/HomeStructuredData";
import { domains, getStaticUrl } from "@/lib/utils";
import MaintenanceGuard from "@/components/layout/MaintenanceGuard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

// Force dynamic rendering to support maintenance mode checks via headers/cookies
export const dynamic = 'force-dynamic';

// Generate favicon URLs
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
  themeColor: "#0f7fdb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`h-full scroll-smooth dark ${exo2.variable}`} data-scroll-behavior="smooth">
      <body className={`h-full bg-neutral-950 text-neutral-100 antialiased relative ${exo2.className}`}>
        <Suspense fallback={<LoadingSpinner fullScreen />}>
          <MaintenanceGuard>
            <HomeStructuredData />
            <SmoothScroll />
            <Suspense fallback={<main className="min-h-screen" />}>
              <ConditionalLayout>
                {children}
              </ConditionalLayout>
            </Suspense>
          </MaintenanceGuard>
        </Suspense>
      </body>
    </html>
  );
}
