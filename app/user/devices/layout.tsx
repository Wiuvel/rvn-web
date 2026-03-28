import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Мои устройства | RVN',
  description: 'Управление VPN-устройствами',
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#0f7fdb',
};

export default function DevicesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
