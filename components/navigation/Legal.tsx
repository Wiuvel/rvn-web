'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface LegalPage {
  path: string;
  title: string;
}

const legalPages: LegalPage[] = [
  { path: '/legal/privacy', title: 'Политика конфиденциальности' },
  { path: '/legal/terms', title: 'Пользовательское соглашение' },
  { path: '/legal/offer', title: 'Договор публичной оферты' },
  { path: '/legal/refunds', title: 'Политика возвратов' },
  { path: '/legal/cookies', title: 'Cookie Policy' },
];

export default function LegalNavigation() {
  const pathname = usePathname();

  return (
    <nav className="legal-breadcrumbs">
      {legalPages.map((page, index) => {
        const isActive = pathname === page.path;
        const isLast = index === legalPages.length - 1;

        return (
          <span key={page.path} className="legal-breadcrumb-item">
            {isActive ? (
              <span className="active">{page.title}</span>
            ) : (
              <Link href={page.path} prefetch={false}>
                {page.title}
              </Link>
            )}
            {!isLast && <span className="separator"> · </span>}
          </span>
        );
      })}
    </nav>
  );
}
