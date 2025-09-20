'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';
import Footer from './Footer';

interface ConditionalLayoutProps {
  children: React.ReactNode;
}

export default function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();
  const isAuthPage = pathname.startsWith('/auth');
  const isProtectionPage = pathname.startsWith('/protection');
  const isDashboardPage = pathname.startsWith('/dashboard');
  const isLegalPage = pathname.startsWith('/legal');
  
  if (isAuthPage || isProtectionPage || isDashboardPage || isLegalPage) {
    return <>{children}</>;
  }
  
  return (
    <>
      <Header />
      <main>
        {children}
      </main>
      <Footer />
    </>
  );
}

