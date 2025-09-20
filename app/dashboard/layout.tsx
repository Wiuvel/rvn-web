import type { Metadata, Viewport } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Личный кабинет — Raven Private",
  description: "Панель управления аккаунтом Raven Private.",
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: "/static/favicon.ico",
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

