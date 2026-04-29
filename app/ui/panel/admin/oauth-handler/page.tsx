'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function OAuthHandlerContent() {
  const searchParams = useSearchParams();
  const success = searchParams.get('success');
  const error = searchParams.get('error');
  const username = searchParams.get('username');
  const isPopup = searchParams.get('popup') === 'true';

  useEffect(() => {
    if (isPopup && window.opener) {
      if (success === 'true') {
        window.opener.postMessage({ type: 'oauth-success', username }, window.location.origin);
        window.close();
      } else if (error) {
        window.opener.postMessage({ type: 'oauth-error', error }, window.location.origin);
        window.close();
      }
    } else if (!isPopup) {
      window.location.href = '/ui/panel/admin';
    }
  }, [success, error, username, isPopup]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-white"></div>
        <p className="mt-4 text-white">Обработка авторизации...</p>
      </div>
    </div>
  );
}

export default function AdminOAuthHandler() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-white"></div>
            <p className="mt-4 text-white">Загрузка...</p>
          </div>
        </div>
      }
    >
      <OAuthHandlerContent />
    </Suspense>
  );
}
