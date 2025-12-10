'use client';

import { useState, useEffect, useRef } from 'react';
import Script from 'next/script';

interface TurnstileInstance {
  render: (
    container: string | HTMLElement,
    options: {
      sitekey: string;
      theme?: string;
      callback?: (token: string) => void;
      'error-callback'?: () => void;
    }
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileInstance;
  }
}

interface RateLimitCaptchaProps {
  isOpen: boolean;
  onSuccess: () => void;
  onClose?: () => void;
}

const TURNSTILE_SITEKEY = '0x4AAAAAACDQkGbAxIWAKp08';
const SCRIPT_CHECK_INTERVAL = 100;
const SCRIPT_CHECK_TIMEOUT = 5000;
const RETRY_DELAY = 5000;

export default function RateLimitCaptcha({ isOpen, onSuccess, onClose }: RateLimitCaptchaProps) {
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isProcessingRef = useRef(false);
  const tokenSentRef = useRef(false);

  // Check if Turnstile is already loaded (from layout) or wait for it
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.turnstile) {
      setIsScriptLoaded(true);
      return;
    }

    const checkInterval = setInterval(() => {
      if (window.turnstile) {
        setIsScriptLoaded(true);
        clearInterval(checkInterval);
      }
    }, SCRIPT_CHECK_INTERVAL);

    const timeout = setTimeout(() => clearInterval(checkInterval), SCRIPT_CHECK_TIMEOUT);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
    };
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      isProcessingRef.current = false;
      tokenSentRef.current = false;
    }
  }, [isOpen]);

  // Remove widget on cleanup
  const removeWidget = () => {
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        // Ignore errors during cleanup
      }
      widgetIdRef.current = null;
    }
  };

  // Reload captcha after error
  const reloadCaptcha = () => {
    removeWidget();
    setTimeout(() => {
      if (isOpen && isScriptLoaded && !isProcessingRef.current) {
        loadCaptcha();
      }
    }, RETRY_DELAY);
  };

  // Load and render captcha
  const loadCaptcha = () => {
    if (!containerRef.current || !window.turnstile || isProcessingRef.current) return;

    removeWidget();
    containerRef.current.innerHTML = '';
    isProcessingRef.current = true;
    tokenSentRef.current = false;

    try {
      const widgetId = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITEKEY,
        theme: 'dark',
        callback: async (token: string) => {
          if (!isOpen || tokenSentRef.current) return;

          tokenSentRef.current = true;
          setIsVerifying(true);
          setError(null);

          try {
            const response = await fetch('/api/rate-limit/clear', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ captchaToken: token })
            });

            const data = await response.json();

            if (response.ok && data.success) {
              setIsVerifying(false);
              isProcessingRef.current = false;
              onSuccess();
            } else {
              setIsVerifying(false);
              isProcessingRef.current = false;
              tokenSentRef.current = false;

              const errorMessage = response.status === 400 && data.error === 'CAPTCHA verification failed'
                ? 'Ошибка проверки капчи. Попробуйте еще раз.'
                : data.error || 'Ошибка очистки лимитов';
              
              setError(errorMessage);
              reloadCaptcha();
            }
          } catch {
            setIsVerifying(false);
            isProcessingRef.current = false;
            tokenSentRef.current = false;
            setError('Ошибка соединения с сервером');
            reloadCaptcha();
          }
        },
        'error-callback': () => {
          if (!isOpen) return;
          setError('Ошибка загрузки капчи');
          setIsVerifying(false);
          isProcessingRef.current = false;
          reloadCaptcha();
        }
      });

      widgetIdRef.current = widgetId;
    } catch (error) {
      console.error('Error rendering Turnstile:', error);
      setError('Ошибка инициализации капчи');
      isProcessingRef.current = false;
    }
  };

  // Load captcha when ready
  useEffect(() => {
    if (isOpen && isScriptLoaded && containerRef.current && !widgetIdRef.current && !isProcessingRef.current) {
      loadCaptcha();
    }

    return removeWidget;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isScriptLoaded]);

  if (!isOpen) return null;

  const shouldLoadScript = !isScriptLoaded && typeof window !== 'undefined' && !window.turnstile;

  return (
    <>
      {shouldLoadScript && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          onLoad={() => setIsScriptLoaded(true)}
        />
      )}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="bg-neutral-900 rounded-2xl p-6 sm:p-8 max-w-md w-full mx-4 border border-neutral-800 shadow-2xl">
          <div className="text-center mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
              Ограничение запросов
            </h2>
            <p className="text-sm sm:text-base text-neutral-400">
              Пожалуйста, пройдите проверку, чтобы продолжить
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400 text-center">{error}</p>
            </div>
          )}

          <div className="flex justify-center mb-4">
            <div ref={containerRef} id="rate-limit-captcha-container" />
          </div>

          {onClose && (
            <button
              onClick={onClose}
              disabled={isVerifying}
              className="w-full mt-4 px-4 py-2 text-sm text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
            >
              Отмена
            </button>
          )}
        </div>
      </div>
    </>
  );
}

