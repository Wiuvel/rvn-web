'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

interface ConditionalLayoutProps {
  children: React.ReactNode;
}

export default function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();
  
  // Страницы с header и footer
  const pagesWithHeaderFooter = [
    '/',
  ];
  
  // Страницы только с header (без footer)
  const pagesWithHeaderOnly = [
    '/about',
  ];
  
  // Legal страницы - с header который скрывается при скролле
  const legalPages = [
    '/legal/privacy',
    '/legal/terms',
    '/legal/cookies',
    '/legal/offer',
    '/legal/refunds',
  ];
  
  const isLegalPage = legalPages.some(page => pathname.startsWith(page));
  const isHeaderOnlyPage = pagesWithHeaderOnly.includes(pathname);
  const shouldShowHeaderFooter = pagesWithHeaderFooter.includes(pathname) || isLegalPage || isHeaderOnlyPage;
  
  if (!shouldShowHeaderFooter) {
    return <>{children}</>;
  }
  
  return (
    <>
      <Header variant="main" />
      <main>
        {children}
      </main>
      {!isLegalPage && !isHeaderOnlyPage && <Footer />}
    </>
  );
}

