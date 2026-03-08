import { Suspense } from 'react';
import { headers } from 'next/headers';
import ProtectionClient from '@/components/protection/ProtectionClient';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export const dynamic = 'force-dynamic';

export default function ProtectionPage() {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen />}>
      <ProtectionContent />
    </Suspense>
  );
}

async function ProtectionContent() {
  const headersList = await headers();
  const forwardedFor = headersList.get('x-forwarded-for');
  const realIp = headersList.get('x-real-ip');
  const cfConnectingIp = headersList.get('cf-connecting-ip');

  const ip = forwardedFor?.split(',')[0]?.trim() || realIp || cfConnectingIp || null;

  return <ProtectionClient initialIp={ip} />;
}
