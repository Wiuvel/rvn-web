'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

interface ConditionalLayoutProps {
  children: React.ReactNode;
}

export default function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();
  const pagesWithHeaderFooter = [
    '/',
  ];
  
  const shouldShowHeaderFooter = pagesWithHeaderFooter.includes(pathname);
  
  if (!shouldShowHeaderFooter) {
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

