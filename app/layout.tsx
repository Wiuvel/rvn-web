import type { Metadata, Viewport } from "next";
import "./globals.css";
import SmoothScroll from "@/components/SmoothScroll";
import ConditionalLayout from "@/components/ConditionalLayout";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata.home;

export const viewport: Viewport = {
  themeColor: "#0f7fdb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full scroll-smooth" data-scroll-behavior="smooth">
      <body className="h-full bg-neutral-950 text-neutral-100 antialiased relative">
        <SmoothScroll />
        <ConditionalLayout>
          {children}
        </ConditionalLayout>
      </body>
    </html>
  );
}
