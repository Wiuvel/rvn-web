import type { Metadata, Viewport } from "next";
import "./globals.css";
import SmoothScroll from "@/components/SmoothScroll";
import ConditionalLayout from "@/components/ConditionalLayout";

export const metadata: Metadata = {
  title: "Raven Private — безопасный доступ в сеть через VLESS и PROXY",
  description: "RVN.GURU — современный сервис приватного доступа в сеть. Высокая скорость и полная анонимность. Стабильные сервера с минимальным пингом.",
  keywords: "Raven Private, RVN.GURU, VLESS, VPN, прокси, безопасность",
  openGraph: {
    siteName: "Raven Private",
    type: "website",
    url: "https://rvn.guru/",
    title: "Raven Private — безопасный доступ в сеть",
    description: "Современный сервис приватного доступа в сеть. Высокая скорость, полная анонимность и стабильные сервера с минимальным пингом.",
    locale: "ru_RU",
  },
  twitter: {
    title: "Raven Private — безопасный доступ в сеть",
    description: "Современный сервис приватного доступа в сеть. Высокая скорость и полная анонимность.",
  },
  robots: {
    index: true,
    follow: true,
    "max-snippet": -1,
    "max-image-preview": "large",
  },
  alternates: {
    canonical: "https://rvn.guru/",
  },
  icons: {
    icon: "/static/favicon.ico",
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
    <html lang="ru" className="h-full scroll-smooth">
      <body className="h-full bg-neutral-950 text-neutral-100 antialiased relative">
        <SmoothScroll />
        <ConditionalLayout>
          {children}
        </ConditionalLayout>
      </body>
    </html>
  );
}
