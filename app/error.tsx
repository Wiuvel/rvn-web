'use client';

import { useEffect } from 'react';
import ServerError from '@/components/error/ServerError';

export default function Error({
  error,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

