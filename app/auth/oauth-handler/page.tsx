'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

interface TelegramOAuthResult {
  success: boolean;
  redirect?: string;
  dashboard_token?: string;
  error?: string;
}

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

interface WindowWithTelegram extends Window {
  onTelegramAuth?: (user: TelegramUser) => void;
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
  data: { dashboard_token?: string; redirect?: string; error?: string },
  setError?: (message: string | null) => void,
  setStatus?: (status: 'loading' | 'redirecting' | 'processing' | 'error') => void
) {
  const isPopup = isPopupWindow();
  
  if (isPopup) {
    // Clear popup flag
    sessionStorage.removeItem('oauth_popup');
    
    if (type === 'OAUTH_ERROR' && setError && setStatus) {
      // Show error in popup instead of closing immediately
      setError(data.error || 'Ошибка авторизации');
      setStatus('error');
      
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
      }
      
      // Close popup after 3 seconds
      setTimeout(() => {
        console.log('Closing popup window after error');
        window.close();
      }, 3000);
      
      return true;
    }
    
    // For success, send message and close immediately
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
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'processing' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
      }, setErrorMessage, setStatus);
      
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
    }, setErrorMessage, setStatus);
    
    if (!wasHandled) {
      // Not in popup - redirect to error page
      sessionStorage.removeItem('oauth_popup');
      router.push(`/auth?error=${encodeURIComponent(error)}`);
    }
  }, [searchParams, router, handled]);

  // Function to create Telegram Widget
  const createTelegramWidget = useCallback((botId: string, state: string) => {
    setStatus('processing');
    
    // Define callback function globally before creating widget
    const win = window as WindowWithTelegram;
    win.onTelegramAuth = (user: TelegramUser) => {
      console.log('Telegram auth callback received:', user);
      
      // Remove widget container
      const container = document.getElementById('telegram-login-container');
      if (container) {
        container.remove();
      }
      
        // Validate required fields
        if (!user.id || !user.hash || !user.auth_date) {
          console.error('Missing required Telegram auth fields');
          setHandled(true);
          const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
            error: 'Неполные данные авторизации Telegram'
          }, setErrorMessage, setStatus);
          
          if (!wasHandled) {
            router.push('/auth?error=telegram_incomplete_data');
          }
          return;
        }
      
      // Prepare data for server
      const telegramData: Record<string, string> = {
        id: user.id.toString(),
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        username: user.username || '',
        photo_url: user.photo_url || '',
        auth_date: user.auth_date.toString(),
        hash: user.hash,
        state: state,
      };
      
      // Clear state from sessionStorage
      sessionStorage.removeItem('telegram_oauth_state');
      
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

        setHandled(true);
        // CRITICAL: If in popup, send message and close - NEVER redirect
        const wasHandled = sendMessageAndClose('OAUTH_SUCCESS', {
          dashboard_token: result.dashboard_token,
          redirect: result.redirect || `/dashboard/${result.dashboard_token}`
        }, setErrorMessage, setStatus);
        
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
        setHandled(true);
        const errorMsg = error.error === 'user_creation_failed' ? 'Не удалось создать аккаунт' :
                             error.error === 'account_disabled' ? 'Аккаунт отключен' :
                             error.error === 'rate_limit' ? 'Превышен лимит запросов' :
                             error.error === 'invalid_state' ? 'Ошибка безопасности' :
                             error.error === 'oauth_not_configured' ? 'OAuth не настроен' :
                             error.message || 'Ошибка авторизации';
        
        // CRITICAL: If in popup, send message and close - NEVER redirect
        const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
          error: errorMsg
        }, setErrorMessage, setStatus);
        
        if (!wasHandled) {
          router.push(`/auth?error=${encodeURIComponent(error.error || 'telegram_auth_failed')}`);
        }
      });
    };
    
    // Create container for widget
    const container = document.createElement('div');
    container.id = 'telegram-login-container';
    container.style.position = 'fixed';
    container.style.top = '50%';
    container.style.left = '50%';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.zIndex = '999999';
    container.style.backgroundColor = 'rgba(10, 16, 32, 0.95)';
    container.style.padding = '2rem';
    container.style.borderRadius = '0.5rem';
    document.body.appendChild(container);

    // Create widget script
    const widgetScript = document.createElement('script');
    widgetScript.async = true;
    widgetScript.src = 'https://telegram.org/js/telegram-widget.js?22';
    widgetScript.setAttribute('data-telegram-login', botId);
    widgetScript.setAttribute('data-size', 'large');
    widgetScript.setAttribute('data-onauth', 'onTelegramAuth(user)');
    widgetScript.setAttribute('data-request-access', 'write');
    
    container.appendChild(widgetScript);
  }, [setStatus, setHandled, setErrorMessage, router]);

  // Function to load Telegram Widget and handle callback
  const loadTelegramWidget = useCallback((botId: string, state: string) => {
    // Check if script already loaded
    if (document.getElementById('telegram-widget-script')) {
      createTelegramWidget(botId, state);
      return;
    }

    // Load Telegram Widget script
    const script = document.createElement('script');
    script.id = 'telegram-widget-script';
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.onload = () => {
      createTelegramWidget(botId, state);
    };
    script.onerror = () => {
      console.error('Failed to load Telegram Widget script');
      setHandled(true);
      const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
        error: 'Ошибка загрузки виджета Telegram'
      }, setErrorMessage, setStatus);
      
      if (!wasHandled) {
        sessionStorage.removeItem('oauth_popup');
        router.push('/auth?error=telegram_widget_load_failed');
      }
    };
    document.head.appendChild(script);
  }, [createTelegramWidget, setHandled, setErrorMessage, setStatus, router]);

  // Handle provider initialization
  useEffect(() => {
    if (handled) return;
    
    if (!provider) {
      setHandled(true);
      const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
        error: 'Провайдер не указан'
      }, setErrorMessage, setStatus);
      
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
      // Initialize Telegram OAuth using Login Widget
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
            
            // Load Telegram Widget script and create widget
            loadTelegramWidget(data.botId, data.state);
          } else {
            throw new Error('Failed to initialize Telegram OAuth');
          }
        })
        .catch(error => {
          console.error('Telegram OAuth initialization error:', error);
          setHandled(true);
          const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
            error: 'Ошибка подключения к Telegram'
          }, setErrorMessage, setStatus);
          
          if (!wasHandled) {
            sessionStorage.removeItem('oauth_popup');
            router.push('/auth?error=telegram_init_failed');
          }
        });
    } else {
      setHandled(true);
      const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
        error: 'Неизвестный провайдер'
      }, setErrorMessage, setStatus);
      
      if (!wasHandled) {
        sessionStorage.removeItem('oauth_popup');
        router.push('/auth?error=unknown_provider');
      }
    }
  }, [searchParams, router, provider, handled, loadTelegramWidget]);

  // Error state
  if (status === 'error' && errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 p-4">
        <div className="max-w-md w-full text-center animate-fadeIn">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-red-500/20 flex items-center justify-center mb-4 animate-scaleIn">
              <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-red-400 animate-slideUp">
              {errorMessage}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      <div className="text-center">
        <div className="relative inline-block mb-6">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
        </div>
        <p className={`text-lg font-medium text-white/90 mb-2 transition-all duration-300 ${
          status === 'loading' || status === 'redirecting' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}>
          {status === 'loading' && 'Перенаправляем..'}
          {status === 'redirecting' && 'Перенаправляем..'}
        </p>
        <p className={`text-lg font-medium text-white/90 mb-2 transition-all duration-300 ${
          status === 'processing' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}>
          {status === 'processing' && 'Авторизация..'}
        </p>
      </div>
    </div>
  );
}

export default function OAuthHandlerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="text-center">
          <div className="relative inline-block mb-6">
            <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
          </div>
          <p className="text-lg font-medium text-white/90 mb-2">Перенаправляем..</p>
        </div>
      </div>
    }>
      <OAuthHandlerContent />
    </Suspense>
  );
}
