'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function OAuthCallbackContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check if we're in a popup window
    if (window.opener) {
      const error = searchParams.get('error');
      const success = searchParams.get('success');
      const dashboardToken = searchParams.get('dashboard_token');
      
      if (error) {
        // Send error to parent window
        const errorMessages: Record<string, string> = {
          'user_creation_failed': 'Не удалось создать аккаунт',
          'oauth_denied': 'Авторизация отменена',
          'invalid_state': 'Ошибка безопасности',
          'token_exchange_failed': 'Ошибка обмена токена',
          'invalid_request': 'Неверный запрос',
          'rate_limit': 'Превышен лимит запросов',
          'oauth_not_configured': 'OAuth не настроен',
          'no_access_token': 'Не получен токен доступа',
          'user_info_failed': 'Ошибка получения информации о пользователе',
          'no_email': 'Email не предоставлен',
          'email_not_verified': 'Email не подтвержден',
          'account_disabled': 'Аккаунт отключен',
        };
        
        window.opener.postMessage(
          {
            type: 'OAUTH_ERROR',
            error: errorMessages[error] || 'Ошибка авторизации'
          },
          window.location.origin
        );
      } else if (success && dashboardToken) {
        // Send success message to parent window
        window.opener.postMessage(
          {
            type: 'OAUTH_SUCCESS',
            dashboard_token: dashboardToken,
            redirect: `/dashboard/${dashboardToken}`
          },
          window.location.origin
        );
      } else {
        // No success or token - error
        window.opener.postMessage(
          {
            type: 'OAUTH_ERROR',
            error: 'Ошибка авторизации'
          },
          window.location.origin
        );
      }
      
      // Close popup after a short delay
      setTimeout(() => {
        window.close();
      }, 100);
    } else {
      // Not in popup - redirect normally
      const dashboardToken = searchParams.get('dashboard_token');
      if (dashboardToken) {
        window.location.href = `/dashboard/${dashboardToken}`;
      } else {
        window.location.href = '/auth';
      }
    }
  }, [searchParams]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
        <p className="text-gray-400">Завершение авторизации...</p>
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Загрузка...</p>
        </div>
      </div>
    }>
      <OAuthCallbackContent />
    </Suspense>
  );
}

