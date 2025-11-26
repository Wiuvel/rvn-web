import type { Metadata, Viewport } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata.supportHelp;

export const viewport: Viewport = {
  themeColor: "#0f7fdb",
};

export default function SupportHelpLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}

