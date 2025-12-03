import type { Metadata, Viewport } from "next";
import "../globals.css";
import { pageMetadata } from "@/lib/utils/seo";

export const metadata: Metadata = {
  ...pageMetadata.dashboard,
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0f7fdb",
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <div className="dashboard-layout">
        {children}
      </div>
    </>
  );
}

