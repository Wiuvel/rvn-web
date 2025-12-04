'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getOAuthErrorMessage, isPopupSpecificError } from '@/lib/utils/oauth-errors';

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
  // SSR check
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return false;
  }
  
  // Check sessionStorage first (most reliable after redirects)
  try {
    const fromStorage = sessionStorage.getItem('oauth_popup') === 'true';
    if (fromStorage) {
      return true;
    }
  } catch {
    // sessionStorage may be unavailable
  }
  
  // Check window.opener
  const hasOpener = window.opener !== null;
  if (hasOpener) {
    return true;
  }
  
  // Check URL parameter
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const fromUrl = urlParams.get('popup') === 'true';
    if (fromUrl) {
      // Save to sessionStorage for future checks
      sessionStorage.setItem('oauth_popup', 'true');
      return true;
    }
  } catch {
    // sessionStorage may be unavailable
  }
  
  return false;
}

// Helper function to send message to parent and close popup
function sendMessageAndClose(
  type: 'OAUTH_SUCCESS' | 'OAUTH_ERROR', 
  data: { dashboard_token?: string; redirect?: string; error?: string },
  setError?: (message: string | null) => void,
  setStatus?: (status: 'loading' | 'redirecting' | 'processing' | 'error') => void
): boolean {
  // SSR check
  if (typeof window === 'undefined') {
    return false;
  }
  
  const isPopup = isPopupWindow();
  
  if (isPopup) {
    // Clear popup flag
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('oauth_popup');
      }
    } catch {
      // sessionStorage may be unavailable
    }
    
    if (type === 'OAUTH_ERROR' && setError && setStatus) {
      // Show error in popup instead of closing immediately
      setError(data.error || getOAuthErrorMessage('unknown_error'));
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
        } catch {
          // Silent fail - error already displayed in popup
        }
      }
      
      // Close popup after 3 seconds
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.close();
        }
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
      } catch {
        // Silent fail - popup will close anyway
      }
    }
    
    // Always close popup after sending message
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.close();
      }
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
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      if (isPopupWindow()) {
        try {
          sessionStorage.setItem('oauth_popup', 'true');
        } catch {
          // sessionStorage may be unavailable
        }
      }
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
      
      // CRITICAL: If in popup, send message and close - NEVER redirect
      const wasHandled = sendMessageAndClose('OAUTH_SUCCESS', {
        dashboard_token: dashboardToken,
        redirect: `/dashboard/${dashboardToken}`
      }, setErrorMessage, setStatus);
      
      if (!wasHandled) {
        // Not in popup - redirect normally
        try {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('oauth_popup');
          }
        } catch {
          // sessionStorage may be unavailable
        }
        window.location.href = `/dashboard/${dashboardToken}`;
      }
      
      return;
    }
  }, [searchParams, handled]);

  // Handle error callback from URL parameters (including provider errors like Google's ?error=...)
  useEffect(() => {
    if (handled) return;
    
    const error = searchParams.get('error');
    if (!error) return;
    
    setHandled(true);
    
    // Check if this is a popup-specific error (should redirect to /auth/)
    if (isPopupSpecificError(error)) {
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('oauth_popup');
        }
      } catch {
        // sessionStorage may be unavailable
      }
      router.push(`/auth?error=${encodeURIComponent(error)}`);
      return;
    }
    
    // Get generic error message (no provider mentions)
    const errorMessage = getOAuthErrorMessage(error);
    
    // CRITICAL: If in popup, show error in popup - NEVER redirect
    const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
      error: errorMessage
    }, setErrorMessage, setStatus);
    
    if (!wasHandled) {
      // Not in popup - redirect to error page
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('oauth_popup');
        }
      } catch {
        // sessionStorage may be unavailable
      }
      router.push(`/auth?error=${encodeURIComponent(error)}`);
    }
  }, [searchParams, router, handled]);

  // Function to create Telegram Widget
  const createTelegramWidget = useCallback((botUsername: string, state: string) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    
    setStatus('processing');
    
    // Define callback function globally before creating widget
    const win = window as WindowWithTelegram;
    win.onTelegramAuth = (user: TelegramUser) => {
      // Remove widget container
      const container = document.getElementById('telegram-login-container');
      if (container) {
        container.remove();
      }
      
        // Validate required fields
        if (!user.id || !user.hash || !user.auth_date) {
          console.error('Missing required Telegram auth fields:', { 
            hasId: !!user.id, 
            hasHash: !!user.hash, 
            hasAuthDate: !!user.auth_date 
          });
          setHandled(true);
          const errorMsg = getOAuthErrorMessage('telegram_incomplete_data');
          
          // Always set error in state to display it
          setErrorMessage(errorMsg);
          setStatus('error');
          
          const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
            error: errorMsg
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
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('telegram_oauth_state');
        }
      } catch {
        // sessionStorage may be unavailable
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
      .catch((error: unknown) => {
        console.error('Telegram OAuth callback error:', error);
        setHandled(true);
        
        // Handle network errors
        let errorCode: string;
        if (error instanceof Error) {
          const errorMessage = error.message || '';
          if (errorMessage.includes('Failed to fetch') || errorMessage.includes('failed to fetch') || errorMessage.includes('NetworkError')) {
            errorCode = 'network_error';
          } else {
            errorCode = 'telegram_auth_failed';
          }
        } else if (error && typeof error === 'object' && 'error' in error) {
          const errorObj = error as { error?: string };
          errorCode = errorObj.error || 'telegram_auth_failed';
        } else {
          errorCode = 'telegram_auth_failed';
        }
        
        // Get generic error message (no provider mentions)
        const errorMsg = getOAuthErrorMessage(errorCode);
        
        // CRITICAL: If in popup, send message and close - NEVER redirect
        const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
          error: errorMsg
        }, setErrorMessage, setStatus);
        
        if (!wasHandled) {
          router.push(`/auth?error=${encodeURIComponent(errorCode)}`);
        }
      });
    };
    
    // Cleanup previous container if exists
    const existingContainer = document.getElementById('telegram-login-container');
    if (existingContainer) {
      existingContainer.remove();
    }
    
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
    // Telegram Login Widget requires bot username (without @)
    const widgetScript = document.createElement('script');
    widgetScript.async = true;
    widgetScript.src = 'https://telegram.org/js/telegram-widget.js?22';
    widgetScript.setAttribute('data-telegram-login', botUsername);
    widgetScript.setAttribute('data-size', 'large');
    widgetScript.setAttribute('data-onauth', 'onTelegramAuth(user)');
    widgetScript.setAttribute('data-request-access', 'write');
    
    container.appendChild(widgetScript);
  }, [router]);

  // Function to load Telegram Widget and handle callback
  const loadTelegramWidget = useCallback((botUsername: string, state: string) => {
    if (typeof document === 'undefined') {
      return;
    }
    
    // Check if script already loaded
    if (document.getElementById('telegram-widget-script')) {
      createTelegramWidget(botUsername, state);
      return;
    }

    // Load Telegram Widget script
    const script = document.createElement('script');
    script.id = 'telegram-widget-script';
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.onload = () => {
      createTelegramWidget(botUsername, state);
    };
    script.onerror = (error) => {
      console.error('Failed to load Telegram Widget script:', error);
      setHandled(true);
      const errorMsg = getOAuthErrorMessage('telegram_widget_load_failed');
      
      // Always set error in state to display it
      setErrorMessage(errorMsg);
      setStatus('error');
      
      const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
        error: errorMsg
      }, setErrorMessage, setStatus);
      
      if (!wasHandled) {
        try {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('oauth_popup');
          }
        } catch {
          // sessionStorage may be unavailable
        }
        router.push('/auth?error=telegram_widget_load_failed');
      }
    };
    document.head.appendChild(script);
  }, [createTelegramWidget, router]);

  // Handle provider initialization
  useEffect(() => {
    if (handled) return;
    
    // If there's an error in URL, don't process provider initialization
    // Error handling is done in separate useEffect
    const error = searchParams.get('error');
    if (error) {
      return;
    }
    
    // If there's a success in URL, don't process provider initialization
    // Success handling is done in separate useEffect
    const success = searchParams.get('success');
    if (success) {
      return;
    }
    
    if (!provider) {
      setHandled(true);
      const errorMsg = getOAuthErrorMessage('invalid_provider');
      // Always set error in state to display it
      setErrorMessage(errorMsg);
      setStatus('error');
      
      const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
        error: errorMsg
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
      try {
        if (typeof sessionStorage !== 'undefined' && isPopupWindow()) {
          sessionStorage.setItem('oauth_popup', 'true');
        }
      } catch {
        // sessionStorage may be unavailable
      }
      // Redirect to Google OAuth endpoint
      if (typeof window !== 'undefined') {
        window.location.href = '/api/auth/oauth/google';
      }
    } else if (provider === 'telegram') {
      setStatus('loading');
      // Initialize Telegram OAuth using Login Widget
      fetch('/api/auth/oauth/telegram')
        .then(async response => {
          const data = await response.json();
          if (!response.ok) {
            // If response is not OK, throw error with error details
            throw { error: data.error || 'telegram_init_failed', message: data.message || 'Ошибка инициализации Telegram OAuth' };
          }
          return data;
        })
        .then(data => {
          if (data.botUsername && data.state) {
            // Store state in sessionStorage
            try {
              if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('telegram_oauth_state', data.state);
                // Ensure popup flag is saved
                if (isPopupWindow()) {
                  sessionStorage.setItem('oauth_popup', 'true');
                }
              }
            } catch {
              // sessionStorage may be unavailable
            }
            
            // Load Telegram Widget script and create widget
            loadTelegramWidget(data.botUsername, data.state);
          } else {
            throw { 
              error: 'telegram_init_failed', 
              message: 'Неполные данные от сервера. Проверьте настройки TELEGRAM_BOT_USERNAME.' 
            };
          }
        })
        .catch(error => {
          console.error('Telegram OAuth initialization error:', error);
          setHandled(true);
          
          // Determine error code
          let errorCode: string;
          if (error && typeof error === 'object' && 'error' in error) {
            const errorObj = error as { error?: string; message?: string };
            errorCode = errorObj.error || 'telegram_init_failed';
          } else if (error instanceof Error) {
            // Handle network errors
            if (error.message.includes('Failed to fetch') || error.message.includes('failed to fetch') || error.message.includes('NetworkError')) {
              errorCode = 'network_error';
            } else {
              errorCode = 'telegram_init_failed';
            }
          } else {
            errorCode = 'telegram_init_failed';
          }
          
          // Get generic error message (no provider mentions)
          const errorMessage = getOAuthErrorMessage(errorCode);
          
          // Always set error in state to display it
          setErrorMessage(errorMessage);
          setStatus('error');
          
          const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
            error: errorMessage
          }, setErrorMessage, setStatus);
          
          if (!wasHandled) {
            try {
              if (typeof sessionStorage !== 'undefined') {
                sessionStorage.removeItem('oauth_popup');
              }
            } catch {
              // sessionStorage may be unavailable
            }
            router.push(`/auth?error=${encodeURIComponent(errorCode)}`);
          }
        });
    } else {
      setHandled(true);
      const errorMsg = getOAuthErrorMessage('invalid_provider');
      // Always set error in state to display it
      setErrorMessage(errorMsg);
      setStatus('error');
      
      const wasHandled = sendMessageAndClose('OAUTH_ERROR', {
        error: errorMsg
      }, setErrorMessage, setStatus);
      
      if (!wasHandled) {
        sessionStorage.removeItem('oauth_popup');
        router.push('/auth?error=invalid_provider');
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
