import type { Metadata, Viewport } from "next";
import "../globals.css";
import Script from "next/script";
import { headers } from "next/headers";
import { pageMetadata } from "@/lib/utils/seo";

export const metadata: Metadata = pageMetadata.auth;

export const viewport: Viewport = {
  themeColor: "#0f7fdb",
};

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get nonce from headers for CSP
  const nonce = (await headers()).get('x-nonce');

  return (
    <div className="auth-layout">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        nonce={nonce || undefined}
      />
      {/* Pass nonce to client components via meta tag */}
      {nonce && (
        <meta name="csp-nonce" content={nonce} />
      )}
      {children}
    </div>
  );
}
