'use client';

import { useEffect } from 'react';
import ServerError from '@/components/error/ServerError';

export default function Error({
  error,
  reset: _reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Error boundary caught:', error);
  }, [error]);

  return <ServerError />;
}
