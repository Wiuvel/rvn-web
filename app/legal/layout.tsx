import type { Metadata, Viewport } from "next";
import "../globals.css";
import "./legal.css";

export const metadata: Metadata = {
  title: "Правовая информация — RVN.GURU",
  description: "Политики конфиденциальности, пользовательские соглашения и другие правовые документы Raven Private.",
  icons: {
    icon: "/static/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f7fdb",
};

export default function LegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="legal-layout">
      {children}
    </div>
  );
}

