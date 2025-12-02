import type { Metadata, Viewport } from "next";
import "./globals.css";
import SmoothScroll from "@/components/SmoothScroll";
import ConditionalLayout from "@/components/ConditionalLayout";
import { TokenRefreshProvider } from "@/components/TokenRefreshProvider";
import { pageMetadata } from "@/lib/seo";
import { exo2 } from "./fonts";

export const metadata: Metadata = {
  ...pageMetadata.home,
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
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
        <TokenRefreshProvider>
          <SmoothScroll />
          <ConditionalLayout>
            {children}
          </ConditionalLayout>
        </TokenRefreshProvider>
      </body>
    </html>
  );
}
