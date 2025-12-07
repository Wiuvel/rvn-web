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

export default function RateLimitCaptcha({ isOpen, onSuccess, onClose }: RateLimitCaptchaProps) {
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isProcessingRef = useRef(false);
  const tokenSentRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      isProcessingRef.current = false;
      tokenSentRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && isScriptLoaded && containerRef.current && !widgetIdRef.current && !isProcessingRef.current) {
      loadCaptcha();
    }

    return () => {
      if (widgetIdRef.current && typeof window !== 'undefined' && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignore errors during cleanup
        }
        widgetIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isScriptLoaded]);

  const loadCaptcha = () => {
    if (!containerRef.current || !window.turnstile || isProcessingRef.current) return;

    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {

      }
      widgetIdRef.current = null;
    }

    containerRef.current.innerHTML = '';
    isProcessingRef.current = true;
    tokenSentRef.current = false;

    try {
      const widgetId = window.turnstile.render(containerRef.current, {
        sitekey: '3x00000000000000000000FF',
        theme: 'dark',
        callback: async (token: string) => {

          if (!isOpen || tokenSentRef.current) {
            return;
          }
          
          tokenSentRef.current = true;
          setIsVerifying(true);
          setError(null);

          try {
            const response = await fetch('/api/rate-limit/clear', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
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
              

              let errorMessage = data.error || 'Ошибка очистки лимитов';
              if (response.status === 400 && data.error === 'CAPTCHA verification failed') {
                errorMessage = 'Ошибка проверки капчи. Попробуйте еще раз.';
              }
              setError(errorMessage);
              
              if (isOpen && widgetIdRef.current && window.turnstile) {
                window.turnstile.remove(widgetIdRef.current);
                widgetIdRef.current = null;
                setTimeout(() => {
                  if (isOpen && isScriptLoaded && !isProcessingRef.current) {
                    loadCaptcha();
                  }
                }, 1000);
              }
            }
          } catch {
            setIsVerifying(false);
            isProcessingRef.current = false;

            tokenSentRef.current = false;
            setError('Ошибка соединения с сервером');
            
            if (isOpen && widgetIdRef.current && window.turnstile) {
              window.turnstile.remove(widgetIdRef.current);
              widgetIdRef.current = null;
              setTimeout(() => {
                if (isOpen && isScriptLoaded && !isProcessingRef.current) {
                  loadCaptcha();
                }
              }, 1000);
            }
          }
        },
        'error-callback': () => {
          if (!isOpen) return;
          setError('Ошибка загрузки капчи');
          setIsVerifying(false);
          isProcessingRef.current = false;

          if (widgetIdRef.current && window.turnstile) {
            window.turnstile.remove(widgetIdRef.current);
            widgetIdRef.current = null;
            setTimeout(() => {
              if (isOpen && isScriptLoaded && !isProcessingRef.current) {
                loadCaptcha();
              }
            }, 1000);
          }
        }
      });

      widgetIdRef.current = widgetId;
    } catch (error) {
      console.error('Error rendering Turnstile:', error);
      setError('Ошибка инициализации капчи');
      isProcessingRef.current = false;
    }
  };

  const handleScriptLoad = () => {
    setIsScriptLoaded(true);
  };

  if (!isOpen) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={handleScriptLoad}
      />
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

