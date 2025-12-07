import type { Metadata, Viewport } from "next";
import "./globals.css";
import SmoothScroll from "@/components/utils/SmoothScroll";
import ConditionalLayout from "@/components/layout/Conditional";
import { pageMetadata } from "@/lib/utils/seo";
import { exo2 } from "./fonts";
import HomeStructuredData from "@/components/seo/HomeStructuredData";

export const metadata: Metadata = {
  ...pageMetadata.home,
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '192x192',
        url: '/android-chrome-192x192.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '512x512',
        url: '/android-chrome-512x512.png',
      },
    ],
  },
  manifest: '/manifest.json',
  alternates: {
    canonical: 'https://rvn.market',
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
        <HomeStructuredData />
        <SmoothScroll />
        <ConditionalLayout>
          {children}
        </ConditionalLayout>
      </body>
    </html>
  );
}
