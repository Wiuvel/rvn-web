import { Metadata } from 'next';
import AuthIsolatedClient from './AuthIsolatedClient';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata.auth;

export default function AuthPage() {
  return <AuthIsolatedClient />;
}
