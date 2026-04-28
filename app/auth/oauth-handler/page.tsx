'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getOAuthErrorMessage, isPopupSpecificError } from '@/lib/auth/oauth-errors';

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
  data: { user_id?: string; redirect?: string; error?: string },
  setError?: (message: string | null) => void,
  setStatus?: (status: 'loading' | 'redirecting' | 'processing' | 'error') => void,
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
              ...data,
            },
            window.location.origin,
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
            ...data,
          },
          window.location.origin,
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
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'processing' | 'error'>(
    'loading',
  );
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
    const userId = searchParams.get('user_id');

    if (success && userId) {
      setHandled(true);
      setStatus('processing');

      // CRITICAL: If in popup, send message and close - NEVER redirect
      const wasHandled = sendMessageAndClose(
        'OAUTH_SUCCESS',
        {
          user_id: userId,
          redirect: `/dashboard/${userId}`,
        },
        setErrorMessage,
        setStatus,
      );

      if (!wasHandled) {
        // Not in popup - redirect normally
        try {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('oauth_popup');
          }
        } catch {
          // sessionStorage may be unavailable
        }
        window.location.href = `/dashboard/${userId}`;
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
    const wasHandled = sendMessageAndClose(
      'OAUTH_ERROR',
      {
        error: errorMessage,
      },
      setErrorMessage,
      setStatus,
    );

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

      const wasHandled = sendMessageAndClose(
        'OAUTH_ERROR',
        {
          error: errorMsg,
        },
        setErrorMessage,
        setStatus,
      );

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
      // Redirect to Telegram OAuth endpoint (similar to Google)
      if (typeof window !== 'undefined') {
        window.location.href = '/api/auth/oauth/telegram';
      }
    } else if (provider === 'yandex') {
      setStatus('redirecting');
      // Ensure popup flag is saved before redirect
      try {
        if (typeof sessionStorage !== 'undefined' && isPopupWindow()) {
          sessionStorage.setItem('oauth_popup', 'true');
        }
      } catch {
        // sessionStorage may be unavailable
      }
      // Redirect to Yandex OAuth endpoint
      if (typeof window !== 'undefined') {
        window.location.href = '/api/auth/oauth/yandex';
      }
    } else if (provider === 'vk') {
      setStatus('redirecting');
      // Ensure popup flag is saved before redirect
      try {
        if (typeof sessionStorage !== 'undefined' && isPopupWindow()) {
          sessionStorage.setItem('oauth_popup', 'true');
        }
      } catch {
        // sessionStorage may be unavailable
      }
      // Redirect to VK OAuth endpoint
      if (typeof window !== 'undefined') {
        window.location.href = '/api/auth/oauth/vk';
      }
    } else if (provider === 'twitch') {
      setStatus('redirecting');
      try {
        if (typeof sessionStorage !== 'undefined' && isPopupWindow()) {
          sessionStorage.setItem('oauth_popup', 'true');
        }
      } catch {}
      if (typeof window !== 'undefined') {
        window.location.href = '/api/auth/oauth/twitch';
      }
    } else {
      setHandled(true);
      const errorMsg = getOAuthErrorMessage('invalid_provider');
      // Always set error in state to display it
      setErrorMessage(errorMsg);
      setStatus('error');

      const wasHandled = sendMessageAndClose(
        'OAUTH_ERROR',
        {
          error: errorMsg,
        },
        setErrorMessage,
        setStatus,
      );

      if (!wasHandled) {
        sessionStorage.removeItem('oauth_popup');
        router.push('/auth?error=invalid_provider');
      }
    }
  }, [searchParams, router, provider, handled]);

  // Error state
  if (status === 'error' && errorMessage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
        <div className="w-full max-w-md animate-fadeIn text-center">
          <div className="mb-6">
            <div className="animate-scaleIn mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20">
              <svg
                className="h-10 w-10 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <p className="animate-slideUp text-lg font-medium text-red-400">{errorMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950">
      <div className="text-center">
        <div className="relative mb-6 inline-block">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-white/20 border-t-white"></div>
        </div>
        <p
          className={`mb-2 text-lg font-medium text-white/90 transition-all duration-300 ${
            status === 'loading' || status === 'redirecting'
              ? 'translate-y-0 opacity-100'
              : 'translate-y-2 opacity-0'
          }`}
          aria-live="polite"
        >
          {status === 'loading' && 'Перенаправляем..'}
          {status === 'redirecting' && 'Перенаправляем..'}
        </p>
        <p
          className={`mb-2 text-lg font-medium text-white/90 transition-all duration-300 ${
            status === 'processing' ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
          }`}
          aria-live="polite"
        >
          {status === 'processing' && 'Авторизация..'}
        </p>
      </div>
    </div>
  );
}

export default function OAuthHandlerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-neutral-950">
          <div className="text-center">
            <div className="relative mb-6 inline-block">
              <div className="h-16 w-16 animate-spin rounded-full border-4 border-white/20 border-t-white"></div>
            </div>
            <p className="mb-2 text-lg font-medium text-white/90">Перенаправляем..</p>
          </div>
        </div>
      }
    >
      <OAuthHandlerContent />
    </Suspense>
  );
}
