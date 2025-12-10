import type { Metadata } from "next";
import { generateMetadata } from "@/lib/utils/seo";

export const metadata: Metadata = generateMetadata({
  title: 'О проекте',
  description: 'Raven Private — современный сервис приватного доступа в сеть. Узнайте больше о нашем проекте,технологиях и планах развития.',
  keywords: ['о проекте', 'Raven Private', 'VPN', 'приватность', 'безопасность'],
  url: '/about',
  noindex: true
});

export default function AboutLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}

