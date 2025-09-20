import type { Metadata, Viewport } from "next";
import "../globals.css";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Авторизация — RVN.GURU",
  description: "Страница входа и регистрации. Личный кабинет. Raven Private.",
  icons: {
    icon: "/static/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f7fdb",
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="auth-layout">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
      {children}
    </div>
  );
}
