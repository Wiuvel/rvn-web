import type { Metadata } from 'next';
import './protection.css';

export const metadata: Metadata = {
  title: 'Protect — RVN.GURU',
  description: 'Защищенная страница доступа',
  robots: 'noindex, nofollow, noarchive',
  other: {
    'googlebot': 'noindex, nofollow',
  },
};

export default function ProtectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
    </>
  );
}
