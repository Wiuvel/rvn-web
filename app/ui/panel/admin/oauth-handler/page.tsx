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
        // Send success message to parent window
        window.opener.postMessage(
          { type: 'oauth-success', username },
          window.location.origin
        );
        window.close();
      } else if (error) {
        // Send error message to parent window
        window.opener.postMessage(
          { type: 'oauth-error', error },
          window.location.origin
        );
        window.close();
      }
    } else if (!isPopup) {
      // Not a popup, redirect to admin panel
      window.location.href = '/ui/panel/admin';
    }
  }, [success, error, username, isPopup]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
        <p className="mt-4 text-white">Обработка авторизации...</p>
      </div>
    </div>
  );
}

export default function AdminOAuthHandler() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
          <p className="mt-4 text-white">Загрузка...</p>
        </div>
      </div>
    }>
      <OAuthHandlerContent />
    </Suspense>
  );
}

