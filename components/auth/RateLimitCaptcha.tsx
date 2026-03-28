'use client';

import { trpc } from '@/lib/trpc/client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Script from 'next/script';

interface TurnstileInstance {
  render: (
    container: string | HTMLElement,
    options: {
      sitekey: string;
      theme?: string;
      callback?: (token: string) => void;
      'error-callback'?: () => void;
    },
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

const TURNSTILE_SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY ?? '';
const SCRIPT_CHECK_INTERVAL = 100;
const SCRIPT_CHECK_TIMEOUT = 5000;
const RETRY_DELAY = 3000;

/** Нормализует серверные ошибки в короткие пользовательские сообщения */
function normalizeError(message: string): string {
  if (message.includes('Not authenticated') || message.includes('UNAUTHORIZED')) {
    return 'Требуется авторизация';
  }
  if (
    message.includes('CAPTCHA service not configured') ||
    message.includes('configuration error')
  ) {
    return 'Сервис проверки недоступен';
  }
  if (message.includes('Token expired') || message.includes('timeout-or-duplicate')) {
    return 'Токен истек, попробуйте снова';
  }
  if (message.includes('Invalid token') || message.includes('invalid-input-response')) {
    return 'Неверный токен проверки';
  }
  if (message.includes('CAPTCHA verification failed')) {
    return 'Проверка не пройдена';
  }
  return 'Ошибка соединения';
}

export default function RateLimitCaptcha({ isOpen, onSuccess, onClose }: RateLimitCaptchaProps) {
  const clearMutation = trpc.rateLimit.clear.useMutation();
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFinalError, setIsFinalError] = useState(false);
  const widgetIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isProcessingRef = useRef(false);
  const tokenSentRef = useRef(false);
  const isOpenRef = useRef(isOpen);
  const onSuccessRef = useRef(onSuccess);
  const isScriptLoadedRef = useRef(isScriptLoaded);
  const retriedRef = useRef(false);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);
  useEffect(() => {
    isScriptLoadedRef.current = isScriptLoaded;
  }, [isScriptLoaded]);

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

  // Remove widget on cleanup
  const removeWidget = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        // Ignore errors during cleanup
      }
      widgetIdRef.current = null;
    }
  }, []);

  const loadCaptchaRef = useRef<() => void>(() => {});

  // Reload captcha once after error, then show final error
  const reloadCaptcha = useCallback(
    (errorMsg: string) => {
      if (retriedRef.current) {
        setError(errorMsg);
        setIsFinalError(true);
        return;
      }

      retriedRef.current = true;
      removeWidget();
      setTimeout(() => {
        if (isOpenRef.current && isScriptLoadedRef.current && !isProcessingRef.current) {
          setError(null);
          loadCaptchaRef.current();
        }
      }, RETRY_DELAY);
    },
    [removeWidget],
  );

  // Load and render captcha
  const loadCaptcha = useCallback(() => {
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
          if (!isOpenRef.current || tokenSentRef.current) return;

          tokenSentRef.current = true;
          setIsVerifying(true);
          setError(null);

          try {
            const data = await clearMutation.mutateAsync({ captchaToken: token });

            if (data.success) {
              setIsVerifying(false);
              isProcessingRef.current = false;
              onSuccessRef.current();
            } else {
              setIsVerifying(false);
              isProcessingRef.current = false;
              tokenSentRef.current = false;
              reloadCaptcha('Не удалось снять ограничение');
            }
          } catch (err) {
            setIsVerifying(false);
            isProcessingRef.current = false;
            tokenSentRef.current = false;
            const message =
              err instanceof Error ? normalizeError(err.message) : 'Ошибка соединения';
            reloadCaptcha(message);
          }
        },
        'error-callback': () => {
          if (!isOpenRef.current) return;
          setIsVerifying(false);
          isProcessingRef.current = false;
          reloadCaptcha('Ошибка загрузки проверки');
        },
      });

      widgetIdRef.current = widgetId;
    } catch (error) {
      console.error('Error rendering Turnstile:', error);
      setError('Ошибка инициализации проверки');
      setIsFinalError(true);
      isProcessingRef.current = false;
    }
  }, [removeWidget, reloadCaptcha, clearMutation]);

  useEffect(() => {
    loadCaptchaRef.current = loadCaptcha;
  }, [loadCaptcha]);

  // Load captcha when ready
  useEffect(() => {
    if (
      isOpen &&
      isScriptLoaded &&
      containerRef.current &&
      !widgetIdRef.current &&
      !isProcessingRef.current
    ) {
      loadCaptcha();
    }

    return removeWidget;
  }, [isOpen, isScriptLoaded, loadCaptcha, removeWidget]);

  if (!isOpen) return null;

  const shouldLoadScript = !isScriptLoaded && typeof window !== 'undefined';

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
        <div className="mx-4 w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl sm:p-8">
          <div className="mb-6 text-center">
            <h2 className="mb-2 text-xl font-bold text-white sm:text-2xl">Ограничение запросов</h2>
            <p className="text-sm text-neutral-400 sm:text-base">
              Пройдите проверку, чтобы продолжить
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
              <p className="text-center text-sm text-red-400">{error}</p>
            </div>
          )}

          {!isFinalError && (
            <div className="mb-4 flex justify-center">
              <div ref={containerRef} id="rate-limit-captcha-container" />
            </div>
          )}

          {onClose && (
            <button
              onClick={onClose}
              disabled={isVerifying}
              className="mt-4 w-full px-4 py-2 text-sm text-neutral-400 transition-colors hover:text-white disabled:opacity-50"
            >
              Отмена
            </button>
          )}
        </div>
      </div>
    </>
  );
}
