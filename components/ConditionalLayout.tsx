'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';
import Footer from './Footer';

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

