import type { Metadata, Viewport } from "next";
import "./globals.css";
import SmoothScroll from "@/components/utils/SmoothScroll";
import ConditionalLayout from "@/components/layout/Conditional";
import { pageMetadata } from "@/lib/utils/seo";
import { exo2 } from "./fonts";
import HomeStructuredData from "@/components/seo/HomeStructuredData";
import CdnInit from "@/components/utils/CdnInit";
import { domains, getStaticUrl } from "@/lib/utils";

// Генерируем URL для favicon с поддержкой CDN
const faviconUrl = process.env.NODE_ENV === 'production' 
  ? getStaticUrl('/favicon.ico')
  : '/favicon.ico';

export const metadata: Metadata = {
  ...pageMetadata.home,
  icons: {
    icon: [
      { url: faviconUrl, sizes: '48x48', type: 'image/x-icon' },
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
        <CdnInit />
        <HomeStructuredData />
        <SmoothScroll />
        <ConditionalLayout>
          {children}
        </ConditionalLayout>
      </body>
    </html>
  );
}
