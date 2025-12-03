import type { Metadata, Viewport } from "next";
import "../globals.css";
import { pageMetadata } from "@/lib/utils/seo";

export const metadata: Metadata = pageMetadata.support;

export const viewport: Viewport = {
  themeColor: "#0f7fdb",
};

export default function SupportLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}

