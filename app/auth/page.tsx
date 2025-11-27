import { Metadata } from 'next';
import { Suspense } from 'react';
import AuthIsolatedClient from './AuthIsolatedClient';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata.auth;

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-neutral-950"><div className="spinner"></div></div>}>
      <AuthIsolatedClient />
    </Suspense>
  );
}
