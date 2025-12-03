'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

interface TelegramOAuthResult {
  success: boolean;
  redirect?: string;
  dashboard_token?: string;
  error?: string;
}

// Helper function to check if we're in a popup
function isPopupWindow(): boolean {
  // Check sessionStorage first (most reliable after redirects)
  const fromStorage = sessionStorage.getItem('oauth_popup') === 'true';
  if (fromStorage) {
    console.log('Popup detected from sessionStorage');
    return true;
  }
  // Check window.opener
  const hasOpener = window.opener !== null;
  if (hasOpener) {
    console.log('Popup detected from window.opener');
    return true;
  }
  // Check URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const fromUrl = urlParams.get('popup') === 'true';
  if (fromUrl) {
    console.log('Popup detected from URL parameter');
    // Save to sessionStorage for future checks
    sessionStorage.setItem('oauth_popup', 'true');
    return true;
  }
  console.log('Not detected as popup');
  return false;
}

// Helper function to send message to parent and close popup
function sendMessageAndClose(
  type: 'OAUTH_SUCCESS' | 'OAUTH_ERROR', 
  data: { dashboard_token?: string; redirect?: string; error?: string }
) {
  const isPopup = isPopupWindow();
  
  if (isPopup) {
    // Clear popup flag
    sessionStorage.removeItem('oauth_popup');
    
    // Try to send message to parent window
    if (window.opener) {
      try {
        window.opener.postMessage(
          {
            type,
            ...data
          },
          window.location.origin
        );
        console.log(`OAuth ${type} message sent to parent window`);
      } catch (error) {
        console.error('Failed to send message to parent:', error);
      }
    } else {
      console.warn('window.opener is null, cannot send message');
    }
    
    // Always close popup after sending message
    setTimeout(() => {
      console.log('Closing popup window');
      window.close();
    }, 100);
    
    return true;
  }
  
  return false;
}

function OAuthHandlerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'processing'>('loading');
  const [handled, setHandled] = useState(false);
  const provider = searchParams.get('provider');

  // Initialize: mark as popup if we detect it
  useEffect(() => {
    if (isPopupWindow()) {
      sessionStorage.setItem('oauth_popup', 'true');
    }
  }, []);

  // Handle success callback from OAuth provider
  useEffect(() => {
    if (handled) return;
    
    const success = searchParams.get('success');
    const dashboardToken = searchParams.get('dashboard_token');
    
    if (success && dashboardToken) {
      setHandled(true);
      setStatus('processing');
      
      // Debug logging
      const isPopup = isPopupWindow();
      console.log('OAuth success detected:', {
        isPopup,
        hasOpener: window.opener !== null,
        sessionStorage: sessionStorage.getItem('oauth_popup'),
        urlParam: searchParams.get('popup')
      });
      
      // CRITICAL: If in popup, send message and close - NEVER redirect
      const wasHandled = sendMessageAndClose('OAUTH_SUCCESS', {
        dashboard_token: dashboardToken,
        redirect: `/dashboard/${dashboardToken}`
      });
      
      if (!wasHandled) {
        console.warn('Not in popup, redirecting normally');
        // Not in popup - redirect normally
        sessionStorage.removeItem('oauth_popup');
        window.location.href = `/dashboard/${dashboardToken}`;
      } else {
        console.log('Popup handled, should close soon');
      }
      
      return;
    }
  }, [searchParams, handled]);

  // Handle error callback
  useEffect(() => {
    if (handled) return;
    
    const error = searchParams.get('error');
    if (!error) return;
    
    setHandled(true);
    
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
    
    // CRITICAL: If in popup, send message and close - NEVER redirect
    const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
      error: errorMessages[error] || 'Ошибка авторизации'
    });
    
    if (!wasHandled) {
      // Not in popup - redirect to error page
      sessionStorage.removeItem('oauth_popup');
      router.push(`/auth?error=${encodeURIComponent(error)}`);
    }
  }, [searchParams, router, handled]);

  // Handle provider initialization
  useEffect(() => {
    if (handled) return;
    
    if (!provider) {
      setHandled(true);
      const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
        error: 'Провайдер не указан'
      });
      
      if (!wasHandled) {
        sessionStorage.removeItem('oauth_popup');
        router.push('/auth?error=invalid_provider');
      }
      return;
    }

    // Start OAuth flow based on provider
    if (provider === 'google') {
      setStatus('redirecting');
      // Ensure popup flag is saved before redirect
      if (isPopupWindow()) {
        sessionStorage.setItem('oauth_popup', 'true');
      }
      // Redirect to Google OAuth endpoint
      window.location.href = '/api/auth/oauth/google';
    } else if (provider === 'telegram') {
      setStatus('loading');
      // Initialize Telegram OAuth
      fetch('/api/auth/oauth/telegram')
        .then(response => response.json())
        .then(data => {
          if (data.botId && data.state) {
            // Store state in sessionStorage
            sessionStorage.setItem('telegram_oauth_state', data.state);
            // Ensure popup flag is saved
            if (isPopupWindow()) {
              sessionStorage.setItem('oauth_popup', 'true');
            }
            setStatus('redirecting');
            // Redirect to Telegram OAuth
            window.location.href = `https://oauth.telegram.org/auth?bot_id=${data.botId}&origin=${encodeURIComponent(window.location.origin)}&request_access=write&return_to=${encodeURIComponent(window.location.origin + '/auth/oauth-handler?provider=telegram&callback=true')}`;
          } else {
            throw new Error('Failed to initialize Telegram OAuth');
          }
        })
        .catch(error => {
          console.error('Telegram OAuth initialization error:', error);
          setHandled(true);
          const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
            error: 'Ошибка подключения к Telegram'
          });
          
          if (!wasHandled) {
            sessionStorage.removeItem('oauth_popup');
            router.push('/auth?error=telegram_init_failed');
          }
        });
    } else {
      setHandled(true);
      const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
        error: 'Неизвестный провайдер'
      });
      
      if (!wasHandled) {
        sessionStorage.removeItem('oauth_popup');
        router.push('/auth?error=unknown_provider');
      }
    }
  }, [searchParams, router, provider, handled]);

  // Handle Telegram callback (when returning from Telegram OAuth)
  useEffect(() => {
    if (handled) return;
    
    const isCallback = searchParams.get('callback') === 'true';
    const currentProvider = searchParams.get('provider');
    
    // Early return if not a callback
    if (!isCallback || currentProvider !== 'telegram') {
      return;
    }

    setHandled(true);
    setStatus('processing');
    
    // Check for Telegram hash in URL
    let tgAuthResult: string | null = null;
    
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      tgAuthResult = params.get('tgAuthResult');
      
      if (tgAuthResult) {
        sessionStorage.setItem('telegram_auth_result', tgAuthResult);
      }
    } else {
      tgAuthResult = sessionStorage.getItem('telegram_auth_result');
    }

    if (tgAuthResult) {
      try {
        // Decode and parse Telegram data
        const decodedData = JSON.parse(atob(tgAuthResult));
        
        // Validate required fields
        if (!decodedData.id || !decodedData.hash || !decodedData.auth_date) {
          throw new Error('Missing required Telegram auth fields');
        }
        
        const telegramData: Record<string, string> = {
          id: decodedData.id.toString(),
          first_name: decodedData.first_name || '',
          last_name: decodedData.last_name || '',
          username: decodedData.username || '',
          photo_url: decodedData.photo_url || '',
          auth_date: decodedData.auth_date.toString(),
          hash: decodedData.hash,
        };
        
        // Get state from sessionStorage
        const state = sessionStorage.getItem('telegram_oauth_state');
        if (state) {
          telegramData.state = state;
          sessionStorage.removeItem('telegram_oauth_state');
          sessionStorage.removeItem('telegram_auth_result');
        }

        // Send to server
        fetch('/api/auth/oauth/telegram/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(telegramData),
        })
        .then(async response => {
          const data = await response.json();
          if (response.ok) {
            return data;
          } else {
            return Promise.reject(data);
          }
        })
        .then((result: TelegramOAuthResult) => {
          // Wait a bit to ensure cookies are set
          return new Promise<TelegramOAuthResult>(resolve => setTimeout(() => resolve(result), 100));
        })
        .then((result: TelegramOAuthResult) => {
          // Validate result
          if (!result) {
            throw new Error('Empty response from server');
          }
          if (!result.dashboard_token && !result.redirect) {
            throw new Error('Missing dashboard_token and redirect in response');
          }

          // CRITICAL: If in popup, send message and close - NEVER redirect
          const wasHandled = sendMessageAndClose('OAUTH_SUCCESS', {
            dashboard_token: result.dashboard_token,
            redirect: result.redirect || `/dashboard/${result.dashboard_token}`
          });
          
          if (!wasHandled) {
            // Not in popup - redirect normally
            if (result.redirect) {
              window.location.href = result.redirect;
            } else if (result.dashboard_token) {
              window.location.href = `/dashboard/${result.dashboard_token}`;
            }
          }
        })
        .catch((error: { error?: string; message?: string }) => {
          console.error('Telegram OAuth callback error:', error);
          const errorMessage = error.error === 'user_creation_failed' ? 'Не удалось создать аккаунт' :
                               error.error === 'account_disabled' ? 'Аккаунт отключен' :
                               error.error === 'rate_limit' ? 'Превышен лимит запросов' :
                               error.error === 'invalid_state' ? 'Ошибка безопасности' :
                               error.error === 'oauth_not_configured' ? 'OAuth не настроен' :
                               error.message || 'Ошибка авторизации';
          
          // CRITICAL: If in popup, send message and close - NEVER redirect
          const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
            error: errorMessage
          });
          
          if (!wasHandled) {
            router.push(`/auth?error=${encodeURIComponent(error.error || 'telegram_auth_failed')}`);
          }
        });
      } catch (error) {
        console.error('Telegram OAuth processing error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ошибка обработки данных Telegram';
        const finalError = errorMessage === 'Missing required Telegram auth fields' 
          ? 'Неполные данные авторизации Telegram'
          : 'Ошибка обработки данных Telegram';
        
        // CRITICAL: If in popup, send message and close - NEVER redirect
        const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
          error: finalError
        });
        
        if (!wasHandled) {
          router.push('/auth?error=telegram_processing_failed');
        }
      }
    } else {
      // No Telegram auth result
      // CRITICAL: If in popup, send message and close - NEVER redirect
      const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
        error: 'Данные авторизации не получены'
      });
      
      if (!wasHandled) {
        router.push('/auth?error=telegram_no_data');
      }
    }
  }, [searchParams, router, handled]);

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-[rgba(10,16,32,0.95)] backdrop-blur-md">
      <div className="text-center">
        <div className="relative inline-block mb-6">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary-500/30 border-t-primary-500"></div>
        </div>
        <p className="text-lg font-medium text-white/90 mb-2">
          {status === 'loading' && 'Инициализация...'}
          {status === 'redirecting' && 'Перенаправление...'}
          {status === 'processing' && 'Обработка...'}
        </p>
        <p className="text-sm text-white/60">
          Авторизация через {provider === 'google' ? 'Google' : provider === 'telegram' ? 'Telegram' : 'провайдер'}...
        </p>
      </div>
    </div>
  );
}

export default function OAuthHandlerPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-[rgba(10,16,32,0.95)] backdrop-blur-md">
        <div className="text-center">
          <div className="relative inline-block mb-6">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary-500/30 border-t-primary-500"></div>
          </div>
          <p className="text-lg font-medium text-white/90 mb-2">Загрузка...</p>
          <p className="text-sm text-white/60">Инициализация авторизации...</p>
        </div>
      </div>
    }>
      <OAuthHandlerContent />
    </Suspense>
  );
}
