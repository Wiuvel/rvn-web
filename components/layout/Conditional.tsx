'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MobileNavigation from '@/components/navigation/MobileNavigation';

interface ConditionalLayoutProps {
  children: React.ReactNode;
}

export default function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();
  
  // Страницы с header и footer
  const pagesWithHeaderFooter = ['/'];
  
  // Страницы только с header (без footer)
  const pagesWithHeaderOnly = ['/about'];
  
  // Legal страницы
  const legalPages = [
    '/legal/privacy',
    '/legal/terms',
    '/legal/cookies',
    '/legal/offer',
    '/legal/refunds',
  ];

  // Страницы где мобильная навигация НЕ нужна
  const noMobileNavPages = ['/auth'];
  
  const isLegalPage = legalPages.some(page => pathname.startsWith(page));
  const isHeaderOnlyPage = pagesWithHeaderOnly.includes(pathname);
  const shouldShowHeader = pagesWithHeaderFooter.includes(pathname) || isLegalPage || isHeaderOnlyPage;
  const shouldShowFooter = shouldShowHeader && !isLegalPage && !isHeaderOnlyPage;
  const shouldShowMobileNav = !noMobileNavPages.some(page => pathname.startsWith(page));

  // ─── CRITICAL: MobileNavigation is ALWAYS at the same position in the React tree
  // (last child of the root Fragment). This prevents React from remounting it
  // when switching between header / non-header pages, preserving GSAP state.
  return (
    <>
      {shouldShowHeader ? (
        <>
          <Header variant="main" />
          <main>{children}</main>
          {shouldShowFooter && <Footer />}
        </>
      ) : (
        children
      )}
      {shouldShowMobileNav && <div className="h-20 lg:hidden" />}
      {shouldShowMobileNav && <MobileNavigation />}
    </>
  );
}
