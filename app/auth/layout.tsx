import type { Metadata, Viewport } from "next";
import "../globals.css";
import Script from "next/script";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata.auth;

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
