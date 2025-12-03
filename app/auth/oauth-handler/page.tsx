'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

interface TelegramOAuthResult {
  success: boolean;
  redirect?: string;
  dashboard_token?: string;
  error?: string;
}

function OAuthHandlerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'processing'>('loading');
  const [handled, setHandled] = useState(false);
  const provider = searchParams.get('provider');

  useEffect(() => {
    // Prevent multiple executions
    if (handled) {
      return;
    }
    
    // Check if we're in a popup window
    // Check sessionStorage first (set when popup is opened), then URL parameter, then window.opener
    const isPopupFromStorage = sessionStorage.getItem('oauth_popup') === 'true';
    const isPopupFromUrl = searchParams.get('popup') === 'true';
    const isPopupFromOpener = window.opener !== null;
    const isPopup = isPopupFromStorage || isPopupFromUrl || isPopupFromOpener;
    
    // Save popup flag to sessionStorage if we detect it's a popup
    if (isPopup && !isPopupFromStorage) {
      sessionStorage.setItem('oauth_popup', 'true');
    }

    // Handle success callback from OAuth provider
    const success = searchParams.get('success');
    const dashboardToken = searchParams.get('dashboard_token');
    
    if (success && dashboardToken) {
      setHandled(true);
      setStatus('processing');
      // OAuth was successful - send message to parent and close
      // CRITICAL: If we're in a popup, NEVER redirect - only send message and close
      if (isPopup) {
        // Clear popup flag from sessionStorage
        sessionStorage.removeItem('oauth_popup');
        
        // Send message to parent window
        // Try multiple times in case opener is temporarily unavailable after redirect
        let messageSent = false;
        const sendMessage = () => {
          if (window.opener) {
            try {
              window.opener.postMessage(
                {
                  type: 'OAUTH_SUCCESS',
                  dashboard_token: dashboardToken,
                  redirect: `/dashboard/${dashboardToken}`
                },
                window.location.origin
              );
              messageSent = true;
              console.log('OAuth success message sent to parent window');
              return true;
            } catch (error) {
              console.error('Failed to send message to parent:', error);
              return false;
            }
          } else {
            console.warn('window.opener is null, cannot send message');
          }
          return false;
        };
        
        // Try immediately
        sendMessage();
        
        // If failed, try again after a short delay
        if (!messageSent) {
          setTimeout(() => {
            sendMessage();
          }, 50);
        }
        
        // Try one more time after longer delay, then close
        setTimeout(() => {
          if (!messageSent) {
            sendMessage();
          }
          // Close popup - this is critical, we MUST close it
          // DO NOT redirect - just close
          console.log('Closing popup window');
          window.close();
        }, 200);
        
        // Prevent any further execution that might cause redirect
        // Return early to prevent any redirect logic
        return;
      } else {
        // Not in popup - redirect normally
        sessionStorage.removeItem('oauth_popup');
        window.location.href = `/dashboard/${dashboardToken}`;
        return;
      }
    }

    // Handle error callback
    const error = searchParams.get('error');
    if (error) {
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
      
      if (isPopup) {
        // Clear popup flag
        sessionStorage.removeItem('oauth_popup');
        // Try to send message to parent window
        if (window.opener) {
          window.opener.postMessage(
            {
              type: 'OAUTH_ERROR',
              error: errorMessages[error] || 'Ошибка авторизации'
            },
            window.location.origin
          );
        }
        // Close popup (even if opener is null, we still want to close)
        setTimeout(() => {
          window.close();
        }, 100);
      } else {
        sessionStorage.removeItem('oauth_popup');
        router.push(`/auth?error=${encodeURIComponent(error)}`);
      }
      return;
    }

    if (!provider) {
      // No provider specified - error
      setHandled(true);
      if (isPopup) {
        window.opener?.postMessage(
          {
            type: 'OAUTH_ERROR',
            error: 'Провайдер не указан'
          },
          window.location.origin
        );
        window.close();
      } else {
        router.push('/auth?error=invalid_provider');
      }
      return;
    }

    // Start OAuth flow based on provider
    if (provider === 'google') {
      setStatus('redirecting');
      // Ensure popup flag is saved before redirect
      if (isPopup) {
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
            setStatus('redirecting');
            // Redirect to Telegram OAuth
            window.location.href = `https://oauth.telegram.org/auth?bot_id=${data.botId}&origin=${encodeURIComponent(window.location.origin)}&request_access=write&return_to=${encodeURIComponent(window.location.origin + '/auth/oauth-handler?provider=telegram&callback=true')}`;
          } else {
            throw new Error('Failed to initialize Telegram OAuth');
          }
        })
        .catch(error => {
          console.error('Telegram OAuth initialization error:', error);
          if (isPopup) {
            window.opener?.postMessage(
              {
                type: 'OAUTH_ERROR',
                error: 'Ошибка подключения к Telegram'
              },
              window.location.origin
            );
            window.close();
          } else {
            router.push('/auth?error=telegram_init_failed');
          }
        });
    } else {
      // Unknown provider
      if (isPopup) {
        window.opener?.postMessage(
          {
            type: 'OAUTH_ERROR',
            error: 'Неизвестный провайдер'
          },
          window.location.origin
        );
        window.close();
      } else {
        router.push('/auth?error=unknown_provider');
      }
    }
  }, [searchParams, router, provider, handled]);

  // Handle Telegram callback (when returning from Telegram OAuth)
  useEffect(() => {
    const isCallback = searchParams.get('callback') === 'true';
    const isPopup = window.opener !== null;
    const currentProvider = searchParams.get('provider');
    
    // Early return if not a callback
    if (!isCallback || currentProvider !== 'telegram') {
      return;
    }

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
            // Server returned error
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

          if (isPopup && window.opener) {
            // Send success to parent window
            window.opener.postMessage(
              {
                type: 'OAUTH_SUCCESS',
                dashboard_token: result.dashboard_token,
                redirect: result.redirect || `/dashboard/${result.dashboard_token}`
              },
              window.location.origin
            );
            // Close popup
            setTimeout(() => {
              window.close();
            }, 100);
          } else if (!isPopup) {
            // Not in popup - redirect normally
            if (result.redirect) {
              window.location.href = result.redirect;
            } else if (result.dashboard_token) {
              window.location.href = `/dashboard/${result.dashboard_token}`;
            }
          } else {
            // isPopup is true but window.opener is null - fallback to redirect
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
          
          if (isPopup && window.opener) {
            window.opener.postMessage(
              {
                type: 'OAUTH_ERROR',
                error: errorMessage
              },
              window.location.origin
            );
            setTimeout(() => {
              window.close();
            }, 100);
          } else if (!isPopup) {
            router.push(`/auth?error=${encodeURIComponent(error.error || 'telegram_auth_failed')}`);
          } else {
            // isPopup is true but window.opener is null - fallback to error page
            router.push(`/auth?error=${encodeURIComponent(error.error || 'telegram_auth_failed')}`);
          }
        });
      } catch (error) {
        console.error('Telegram OAuth processing error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ошибка обработки данных Telegram';
        if (isPopup && window.opener) {
          window.opener.postMessage(
            {
              type: 'OAUTH_ERROR',
              error: errorMessage === 'Missing required Telegram auth fields' 
                ? 'Неполные данные авторизации Telegram'
                : 'Ошибка обработки данных Telegram'
            },
            window.location.origin
          );
          setTimeout(() => {
            window.close();
          }, 100);
        } else if (!isPopup) {
          router.push('/auth?error=telegram_processing_failed');
        } else {
          // isPopup is true but window.opener is null - fallback to error page
          router.push('/auth?error=telegram_processing_failed');
        }
      }
    } else {
      // No Telegram auth result
      if (isPopup && window.opener) {
        window.opener.postMessage(
          {
            type: 'OAUTH_ERROR',
            error: 'Данные авторизации не получены'
          },
          window.location.origin
        );
        setTimeout(() => {
          window.close();
        }, 100);
      } else if (!isPopup) {
        router.push('/auth?error=telegram_no_data');
      } else {
        // isPopup is true but window.opener is null - fallback to error page
        router.push('/auth?error=telegram_no_data');
      }
    }
  }, [searchParams, router]);

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

