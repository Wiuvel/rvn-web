'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { translateError } from '@/lib/utils/error-translations';
import { getOAuthErrorMessage } from '@/lib/utils/oauth-errors';
import { loginSchema, registerSchema, type LoginFormData, type RegisterFormData } from '@/lib/validation/schemas';
import { getStaticUrl } from '@/lib/utils';

interface WindowWithPopup extends Window {
  __lastPopup?: Window & {
    __checkInterval?: NodeJS.Timeout;
  };
}

// Lazy load RateLimitCaptcha для оптимизации bundle size
// Используем eager loading для капчи, чтобы она была готова при открытии
const RateLimitCaptcha = dynamic(() => import('@/components/auth/RateLimitCaptcha'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-neutral-900 rounded-2xl p-6 sm:p-8 max-w-md w-full mx-4 border border-neutral-800 shadow-2xl">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-neutral-400">Загрузка капчи..</p>
        </div>
      </div>
    </div>
  )
});


interface AuthFormProps {
  retpatch?: string;
  initialError?: string;
}

export default function AuthForm({ retpatch = '/dashboard/', initialError }: AuthFormProps) {
  const [currentTab, setCurrentTab] = useState<'login' | 'register'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [showRateLimitCaptcha, setShowRateLimitCaptcha] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const isCaptchaOpenRef = useRef(false);
  const pendingRequestsQueueRef = useRef<Array<() => Promise<void>>>([]);
  const isProcessingCaptchaRef = useRef(false);
  
  // React Hook Form setup for login
  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
      csrfToken: '',
    },
    mode: 'onChange',
  });

  // React Hook Form setup for register
  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      password: '',
      confirmPassword: '',
      csrfToken: '',
    },
    mode: 'onChange',
  });

  const [isPasswordValid, setIsPasswordValid] = useState({
    register: false,
    login: false
  });
  const [showPasswordStrength, setShowPasswordStrength] = useState({
    register: false,
    login: false
  });
  
  // Функция для расчета силы пароля
  const calculatePasswordStrength = (password: string): {
    score: number; // 0-4
    label: string;
    color: string;
    requirements: {
      minLength: boolean;
      hasUpperCase: boolean;
      hasLowerCase: boolean;
      hasNumber: boolean;
      hasSpecialChar: boolean;
    };
  } => {
    if (!password) {
      return {
        score: 0,
        label: '',
        color: '',
        requirements: {
          minLength: false,
          hasUpperCase: false,
          hasLowerCase: false,
          hasNumber: false,
          hasSpecialChar: false
        }
      };
    }

    const requirements = {
      minLength: password.length >= 6,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecialChar: /[!@#$%^&*()_+.\-=\[\]{};':"\\|,<>\/?]/.test(password)
    };

    let score = 0;
    if (requirements.minLength) score++;
    if (requirements.hasUpperCase) score++;
    if (requirements.hasLowerCase) score++;
    if (requirements.hasNumber) score++;
    if (requirements.hasSpecialChar) score++;

    // Нормализуем score до 0-4 для визуализации
    let normalizedScore = 0;
    let label = '';
    let color = '';

    if (score === 0) {
      normalizedScore = 0;
      label = '';
      color = '';
    } else if (score <= 2) {
      normalizedScore = 1;
      label = 'Слабый';
      color = 'bg-red-500';
    } else if (score === 3) {
      normalizedScore = 2;
      label = 'Средний';
      color = 'bg-yellow-500';
    } else if (score === 4) {
      normalizedScore = 3;
      label = 'Хороший';
      color = 'bg-blue-500';
    } else {
      normalizedScore = 4;
      label = 'Отличный';
      color = 'bg-green-500';
    }

    return {
      score: normalizedScore,
      label,
      color,
      requirements
    };
  };
  
  const [showPassword, setShowPassword] = useState({
    register: false,
    login: false
  });
  const [globalError, setGlobalError] = useState('');
  const [csrfToken, setCsrfToken] = useState('');
  const [loginAttemptState, setLoginAttemptState] = useState<'idle' | 'error'>('idle');

  // Watch password changes for strength indicator
  const registerPassword = registerForm.watch('password');
  const loginPassword = loginForm.watch('password');
  
  useEffect(() => {
    if (registerPassword) {
      const strength = calculatePasswordStrength(registerPassword);
      setIsPasswordValid(prev => ({ ...prev, register: strength.score > 0 }));
      setShowPasswordStrength(prev => ({ ...prev, register: strength.score > 0 }));
    } else {
      setIsPasswordValid(prev => ({ ...prev, register: false }));
      setShowPasswordStrength(prev => ({ ...prev, register: false }));
    }
  }, [registerPassword]);

  useEffect(() => {
    if (loginPassword) {
      const strength = calculatePasswordStrength(loginPassword);
      setIsPasswordValid(prev => ({ ...prev, login: strength.score > 0 }));
      setShowPasswordStrength(prev => ({ ...prev, login: strength.score > 0 }));
    } else {
      setIsPasswordValid(prev => ({ ...prev, login: false }));
      setShowPasswordStrength(prev => ({ ...prev, login: false }));
    }
  }, [loginPassword]);

  // Обертка для fetch с обработкой rate limit
  const fetchWithRateLimit = async (
    url: string,
    options: RequestInit = {},
    retryCallback?: () => Promise<void>
  ): Promise<Response> => {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      // Добавляем callback в очередь вместо перезаписи - исправляет race condition
      if (retryCallback) {
        pendingRequestsQueueRef.current.push(retryCallback);
      }
      
      // Открываем модальное окно только если:
      // 1. Оно еще не открыто
      // 2. Капча не обрабатывается (предотвращает повторные открытия)
      if (!isCaptchaOpenRef.current && !isProcessingCaptchaRef.current) {
        isCaptchaOpenRef.current = true;
        setShowRateLimitCaptcha(true);
      }
      throw new Error('RATE_LIMIT_EXCEEDED');
    }
    
    return response;
  };

  const handleRateLimitSuccess = async () => {
    // Устанавливаем флаг обработки капчи - предотвращает повторные открытия
    isProcessingCaptchaRef.current = true;
    
    // Закрываем модальное окно
    isCaptchaOpenRef.current = false;
    setShowRateLimitCaptcha(false);
    
    // Увеличиваем задержку для гарантированного применения иммунитета на сервере
    // Cookie устанавливается сразу, но store может обновиться с небольшой задержкой
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Обрабатываем ВСЕ запросы из очереди последовательно
    const queue = [...pendingRequestsQueueRef.current];
    pendingRequestsQueueRef.current = []; // Очищаем очередь сразу
    
    for (const requestCallback of queue) {
      try {
        await requestCallback();
      } catch (error) {
        // Если запрос снова получил rate limit после иммунитета - это критическая ошибка
        // НЕ добавляем обратно в очередь и НЕ показываем капчу снова
        if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
          // Rate limit все еще активен - не логируем
        } else {
          // Ошибка при повторном запросе - не логируем
        }
      }
    }
    
    // Сбрасываем флаг обработки только после обработки всех запросов
    isProcessingCaptchaRef.current = false;
  };

  const fetchCsrfToken = async (): Promise<string | null> => {
    try {
      const response = await fetch('/api/auth/csrf', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch CSRF token');
      }
      const data = await response.json();
      const token = data?.csrfToken || '';
      setCsrfToken(token);
      return token;
    } catch (error) {
      console.error('CSRF token fetch error:', error);
      setCsrfToken('');
      setGlobalError('Не удалось получить токен безопасности.');
      return null;
    }
  };

  const handleRegister = async (data: RegisterFormData) => {
    const tokenToUse = csrfToken || (await fetchCsrfToken());
    if (!tokenToUse) {
      return;
    }
    setIsLoading(true);
    setGlobalError('');
    
    const performRegister = async () => {
      try {
        const response = await fetchWithRateLimit('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: escapeHtml(data.username),
            password: data.password,
            confirmPassword: data.confirmPassword,
            csrfToken: tokenToUse
          })
        }, performRegister);
        
        const responseData = await response.json();
        if (response.ok) {
          window.location.href = `/dashboard/${responseData.dashboard_token}`;
        } else {
          const translatedError = translateError(responseData.error || 'Ошибка регистрации');
          setGlobalError(escapeHtml(translatedError));
          if (response.status === 403) {
            fetchCsrfToken();
          }
          setIsLoading(false);
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
          // Rate limit обработан, запрос добавлен в очередь
          setIsLoading(false);
        } else {
          setGlobalError('API ERROR: 405.');
          fetchCsrfToken();
          setIsLoading(false);
        }
      }
    };

    await performRegister();
  };

  const handleLogin = async (data: LoginFormData) => {
    const tokenToUse = csrfToken || (await fetchCsrfToken());
    if (!tokenToUse) {
      return;
    }
    setIsLoading(true);
    setLoginAttemptState('idle');
    setGlobalError('');
    
    const performLogin = async () => {
      try {
        const response = await fetchWithRateLimit('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: escapeHtml(data.username),
            password: data.password,
            csrfToken: tokenToUse
          })
        }, performLogin);
        
        const responseData = await response.json();
        if (response.ok) {
          if (retpatch && retpatch !== '/dashboard/') {
            window.location.href = retpatch;
          } else {
            window.location.href = `/dashboard/${responseData.dashboard_token}`;
          }
        } else {
          setLoginAttemptState('error');
          const translatedError = translateError(responseData.error || 'Ошибка входа');
          setGlobalError(escapeHtml(translatedError));
          if (response.status === 403) {
            fetchCsrfToken();
          }
          setIsLoading(false);
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
          // Rate limit обработан, запрос добавлен в очередь
          setIsLoading(false);
        } else {
          setLoginAttemptState('error');
          setGlobalError('Ошибка сети. Попробуйте позже.');
          fetchCsrfToken();
          setIsLoading(false);
        }
      }
    };

    await performLogin();
  };


  // Handle OAuth login - opens in popup window via oauth-handler page
  const oauthLogin = async (provider: string) => {
    setIsLoading(true);
    setActiveProvider(provider);
    
    // Listen for messages from OAuth popup
    let timeoutId: NodeJS.Timeout | null = null;
    
    const handleMessage = (event: MessageEvent) => {
      // Verify origin for security
      if (event.origin !== window.location.origin) {
        return;
      }
      
      // Clear timeout if message received
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      if (event.data.type === 'OAUTH_SUCCESS') {
        // Clear any intervals
        const win = window as WindowWithPopup;
        const popupWindow = win.__lastPopup;
        if (popupWindow && popupWindow.__checkInterval) {
          clearInterval(popupWindow.__checkInterval);
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        window.removeEventListener('message', handleMessage);
        setIsLoading(false);
        setIsPopupOpen(false);
        setActiveProvider(null);
        
        // Redirect to dashboard
        if (event.data.redirect) {
          window.location.href = event.data.redirect;
        } else if (event.data.dashboard_token) {
          window.location.href = `/dashboard/${event.data.dashboard_token}`;
        }
      } else if (event.data.type === 'OAUTH_ERROR') {
        // Clear any intervals
        const win = window as WindowWithPopup;
        const popupWindow = win.__lastPopup;
        if (popupWindow && popupWindow.__checkInterval) {
          clearInterval(popupWindow.__checkInterval);
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        window.removeEventListener('message', handleMessage);
        setIsLoading(false);
        setIsPopupOpen(false);
        setActiveProvider(null);
        // Error message is already generic and provider-agnostic from handler
        setGlobalError(event.data.error || getOAuthErrorMessage('unknown_error'));
      }
    };
    
    window.addEventListener('message', handleMessage);
    
    try {
      // Open OAuth handler page in popup window
      // This page has immunity to protection proxy and handles the OAuth flow
      const width = 500;
      const height = 600;
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;
      
      const popup = window.open(
        `/auth/oauth-handler?provider=${provider}`,
        `${provider}_oauth`,
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );
      
      if (!popup) {
        setIsLoading(false);
        setActiveProvider(null);
        // Popup-specific error - show in /auth/ page
        setGlobalError(getOAuthErrorMessage('popup_blocked'));
        window.removeEventListener('message', handleMessage);
        return;
      }
      
      // Store popup reference for cleanup
      const win = window as WindowWithPopup;
      win.__lastPopup = popup as Window & { __checkInterval?: NodeJS.Timeout };
      
      // Mark popup as open
      setIsPopupOpen(true);
      
      // Check if popup was closed manually (polling since COOP may block popup.closed)
      const checkPopupClosed = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(checkPopupClosed);
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
            window.removeEventListener('message', handleMessage);
            setIsLoading(false);
            setIsPopupOpen(false);
            setActiveProvider(null);
          }
        } catch {
          // COOP may block access, but we'll try anyway
          // If it fails, timeout will handle it
        }
      }, 500); // Check every 500ms
      
      // Store interval ID to clear it on success/error
      if (win.__lastPopup) {
        win.__lastPopup.__checkInterval = checkPopupClosed;
      }
      
      // Set timeout to handle case when popup is closed without sending message
      // COOP (Cross-Origin-Opener-Policy) blocks popup.closed check, so we use timeout instead
      // If no message is received within 10 minutes, assume popup was closed
      timeoutId = setTimeout(() => {
        clearInterval(checkPopupClosed);
        window.removeEventListener('message', handleMessage);
        setIsLoading(false);
        setIsPopupOpen(false);
        setActiveProvider(null);
        setGlobalError(getOAuthErrorMessage('popup_timeout'));
      }, 10 * 60 * 1000); // 10 minutes timeout
    } catch {
      setGlobalError(getOAuthErrorMessage('network_error'));
      setIsLoading(false);
      setActiveProvider(null);
    }
  };

  const escapeHtml = (unsafe: string) => {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const resetForm = () => {
    registerForm.reset();
    loginForm.reset();
    setGlobalError('');
    setIsPasswordValid({ register: false, login: false });
    setShowPasswordStrength({ register: false, login: false });
    setIsLoading(false);
    setLoginAttemptState('idle');
  };

  const switchTab = (tab: 'login' | 'register') => {
    if (tab === currentTab) return; // Don't switch if already on this tab
    
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentTab(tab);
      resetForm();
      setIsTransitioning(false);
    }, 150);
  };

  useEffect(() => {
    fetchCsrfToken();
  }, []);

  // Handle initial error from OAuth redirect
  // Only popup-specific errors should reach /auth/ page
  // Other OAuth errors are handled in oauth-handler
  useEffect(() => {
    if (initialError) {
      // Use OAuth error messages for OAuth errors, fallback to translateError for other errors
      const errorMessage = getOAuthErrorMessage(initialError) || translateError(initialError);
      setGlobalError(errorMessage);
    }
  }, [initialError]);

  return (
    <>
      <div className="w-full max-w-md mx-auto">
        <div className={`bg-neutral-900/80 backdrop-blur-md p-8 rounded-2xl border border-neutral-800 shadow-lg animate-fadeIn overflow-hidden transition-all duration-150 ease-out ${
          isTransitioning ? 'opacity-50 scale-95' : ''
        }`}>
        <h2 className={`text-2xl font-semibold mb-6 text-center transition-all duration-150 ease-in-out ${
          isTransitioning ? 'opacity-0 transform scale-95' : 'opacity-100 transform scale-100'
        }`}>
          {currentTab === 'register' ? 'Регистрация' : 'Вход'}
        </h2>

        {/* Registration Form */}
        {currentTab === 'register' && (
          <form onSubmit={registerForm.handleSubmit(handleRegister)} className={`space-y-4 transition-all duration-150 ease-in-out ${
            isTransitioning ? 'opacity-0 transform translate-y-4' : 'opacity-100 transform translate-y-0'
          }`}>
            <label className="block">
              <span className="sr-only">Логин</span>
              <input
                type="text"
                {...registerForm.register('username')}
                placeholder="Логин"
                autoComplete="username"
                disabled={isPopupOpen}
                className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>
            {registerForm.formState.errors.username && (
              <p className="text-red-500 text-xs mt-1" role="alert">
                {registerForm.formState.errors.username.message}
              </p>
            )}

            <div className="relative">
              <label className="block">
                <span className="sr-only">Пароль</span>
                  <input
                    type={showPassword.register ? 'text' : 'password'}
                    {...registerForm.register('password')}
                    placeholder="Пароль"
                    autoComplete="new-password"
                    disabled={isPopupOpen}
                    className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white pr-10 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(prev => ({ ...prev, register: !prev.register }))}
                className="absolute right-3 top-3.5 text-gray-500 hover:text-gray-700 pass-toggle"
                aria-label={showPassword.register ? 'Скрыть пароль' : 'Показать пароль'}
              >
                <Image
                  src={showPassword.register ? getStaticUrl("/static/icons/login/pass-hide.svg") : getStaticUrl("/static/icons/login/pass-hideoff.svg")}
                  alt={showPassword.register ? "Скрыть пароль" : "Показать пароль"}
                  width={24}
                  height={24}
                  className="h-6 transition hover:brightness-75"
                />
              </button>
            </div>

            {/* Password Strength Indicator */}
            {showPasswordStrength.register && registerPassword && !registerForm.watch('confirmPassword') && (() => {
              const strength = calculatePasswordStrength(registerPassword);
              const widthPercent = strength.score === 0 ? 0 : (strength.score / 4) * 100;
              
              return (
                <div className="mt-2 space-y-2 animate-fadeIn">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-neutral-400">Надёжность пароля:</span>
                    {strength.label && (
                      <span className={`text-xs font-medium ${
                        strength.score === 1 ? 'text-red-400' :
                        strength.score === 2 ? 'text-yellow-400' :
                        strength.score === 3 ? 'text-blue-400' :
                        'text-green-400'
                      }`}>
                        {strength.label}
                      </span>
                    )}
                  </div>
                  <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${
                        strength.score === 0 ? 'bg-neutral-700' :
                        strength.score === 1 ? 'bg-red-500' :
                        strength.score === 2 ? 'bg-yellow-500' :
                        strength.score === 3 ? 'bg-blue-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            {registerForm.formState.errors.password && (
              <p className="text-red-500 text-xs mt-1" role="alert">
                {registerForm.formState.errors.password.message}
              </p>
            )}

            <label className="block">
              <span className="sr-only">Подтверждение пароля</span>
                <input
                  type="password"
                  {...registerForm.register('confirmPassword')}
                  placeholder="Подтверждение пароля"
                  autoComplete="new-password"
                  disabled={!isPasswordValid.register || isPopupOpen}
                  className={`w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white disabled:cursor-not-allowed ${
                    isPasswordValid.register && !isPopupOpen ? 'opacity-100' : 'opacity-50'
                  }`}
                />
            </label>
            {registerForm.formState.errors.confirmPassword && (
              <p className="text-red-500 text-xs mt-1" role="alert">
                {registerForm.formState.errors.confirmPassword.message}
              </p>
            )}

            <div className="flex justify-center select-none">
              <p className="text-xs text-neutral-400 text-center">
                Нажимая ‹Зарегистрироваться›, вы принимаете{' '}
                <Link
                  href="/legal/terms/"
                  target="_blank"
                  rel="noopener noreferrer"
                  prefetch={false}
                  className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                >
                  Пользовательское соглашение
                </Link>
                {' '}и{' '}
                <Link
                  href="/legal/privacy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  prefetch={false}
                  className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                >
                  Политику конфиденциальности
                </Link>
                .
              </p>
            </div>

            <div className="flex justify-center">
              <button
                type="submit"
                className="glass-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                disabled={isLoading || isPopupOpen}
              >
                {isLoading && !activeProvider && <span className="spinner"></span>}
                <span>{isLoading && !activeProvider ? 'Отправка..' : 'Зарегистрироваться'}</span>
              </button>
            </div>

            {globalError && (
              <p
                className={`auth-feedback ${globalError ? 'visible' : ''}`}
                role="alert"
                aria-live="assertive"
              >
                {globalError}
              </p>
            )}

            <div className="divider">
              <span className="text-neutral-400">или авторизация через</span>
            </div>

            <div className="oauth-grid">
              <button
                type="button"
                className="oauth-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                onClick={() => oauthLogin('vk')}
                disabled={isLoading || isPopupOpen}
                title="Войти через VK ID"
                aria-label="Войти через VK ID"
              >
                {activeProvider === 'vk' ? (
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Image src="/static/icons/oauth/vk.svg" alt="VK" width={20} height={20} className="oauth-icon" />
                )}
              </button>
              <button
                type="button"
                className="oauth-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                onClick={() => oauthLogin('yandex')}
                disabled={isLoading || isPopupOpen}
                title="Войти через Yandex ID"
                aria-label="Войти через Yandex ID"
              >
                {activeProvider === 'yandex' ? (
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Image src="/static/icons/oauth/yandex.svg" alt="Yandex" width={20} height={20} className="oauth-icon" />
                )}
              </button>              
              <button
                type="button"
                className="oauth-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                onClick={() => oauthLogin('telegram')}
                disabled={isLoading || isPopupOpen}
                title="Войти через Telegram"
                aria-label="Войти через Telegram"
              >
                {activeProvider === 'telegram' ? (
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Image src="/static/icons/oauth/telegram.svg" alt="Telegram" width={20} height={20} className="oauth-icon" />
                )}
              </button>              
              <button
                type="button"
                className="oauth-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                onClick={() => oauthLogin('google')}
                disabled={isLoading || isPopupOpen}
                title="Войти через Google"
                aria-label="Войти через Google"
              >
                {activeProvider === 'google' ? (
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Image src="/static/icons/oauth/google.svg" alt="Google" width={20} height={20} className="oauth-icon" />
                )}
              </button>
              <button
                type="button"
                className="oauth-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                onClick={() => oauthLogin('twitch')}
                disabled={isLoading || isPopupOpen}
                title="Войти через Twitch"
                aria-label="Войти через Twitch"
              >
                {activeProvider === 'twitch' ? (
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Image src="/static/icons/oauth/twitch.svg" alt="Twitch" width={20} height={20} className="oauth-icon" />
                )}
              </button>
            </div>

            <div className="mt-4">
              <p className="text-center text-sm">
                <span className="text-neutral-400 font-semibold underline underline-offset-4">Уже есть аккаунт?</span>{' '}
                <button
                  type="button"
                  onClick={() => switchTab('login')}
                  className="text-white bg-white/10 px-1.5 sm:px-2 py-0.5 rounded font-medium hover:bg-white/15 transition-colors"
                >
                  Вход
                </button>
              </p>
            </div>
          </form>
        )}

        {/* Authorization Form */}
        {currentTab === 'login' && (
          <form onSubmit={loginForm.handleSubmit(handleLogin)} className={`space-y-4 transition-all duration-150 ease-in-out ${
            isTransitioning ? 'opacity-0 transform translate-y-4' : 'opacity-100 transform translate-y-0'
          }`}>
            <label className="block">
              <span className="sr-only">Логин</span>
                <input
                  type="text"
                  {...loginForm.register('username', {
                    onChange: () => {
                      // Clear errors when user starts typing
                      if (globalError) {
                        setGlobalError('');
                      }
                      if (loginAttemptState === 'error') {
                        setLoginAttemptState('idle');
                      }
                    },
                  })}
                  placeholder="Логин"
                  autoComplete="username"
                  disabled={isPopupOpen}
                  className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                />
            </label>
            {loginForm.formState.errors.username && (
              <p className="text-red-500 text-xs mt-1" role="alert">
                {loginForm.formState.errors.username.message}
              </p>
            )}

            <div className="relative">
              <label className="block">
                <span className="sr-only">Пароль</span>
                  <input
                    type={showPassword.login ? 'text' : 'password'}
                    {...loginForm.register('password', {
                      onChange: () => {
                        if (globalError) {
                          setGlobalError('');
                        }
                        if (loginAttemptState === 'error') {
                          setLoginAttemptState('idle');
                        }
                      },
                    })}
                    placeholder="Пароль"
                    autoComplete="current-password"
                    disabled={isPopupOpen}
                    className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white pr-10 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(prev => ({ ...prev, login: !prev.login }))}
                className="absolute right-3 top-3.5 text-gray-500 hover:text-gray-700 pass-toggle"
                aria-label={showPassword.login ? 'Скрыть пароль' : 'Показать пароль'}
              >
                <Image
                  src={showPassword.login ? getStaticUrl("/static/icons/login/pass-hide.svg") : getStaticUrl("/static/icons/login/pass-hideoff.svg")}
                  alt={showPassword.login ? "Скрыть пароль" : "Показать пароль"}
                  width={24}
                  height={24}
                  className="h-6 transition hover:brightness-75"
                />
              </button>
            </div>
            {loginForm.formState.errors.password && (
              <p className="text-red-500 text-xs mt-1" role="alert">
                {loginForm.formState.errors.password.message}
              </p>
            )}

            <div className="flex justify-center select-none">
              <p className="text-xs text-neutral-400 text-center">
                Нажимая ‹Войти›, вы принимаете{' '}
                <Link
                  href="/legal/terms/"
                  target="_blank"
                  rel="noopener noreferrer"
                  prefetch={false}
                  className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                >
                  Пользовательское соглашение
                </Link>
                {' '}и{' '}
                <Link
                  href="/legal/privacy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  prefetch={false}
                  className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                >
                  Политику конфиденциальности
                </Link>
                .
              </p>
            </div>

            <div className="flex justify-center">
              <button
                type="submit"
                className={`glass-btn ${loginAttemptState === 'error' ? 'btn-shake' : ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900`}
                disabled={isLoading || isPopupOpen}
              >
                {isLoading && !activeProvider && <span className="spinner"></span>}
                <span>{isLoading && !activeProvider ? 'Вход..' : 'Войти'}</span>
              </button>
            </div>

            {globalError && (
              <p
                className={`auth-feedback ${globalError ? 'visible' : ''}`}
                role="alert"
                aria-live="assertive"
              >
                {globalError}
              </p>
            )}

            <div className="divider">
              <span className="text-neutral-400">или авторизация через</span>
            </div>

            <div className="oauth-grid">
              <button
                type="button"
                className="oauth-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                onClick={() => oauthLogin('vk')}
                disabled={isLoading || isPopupOpen}
                title="Войти через VK ID"
                aria-label="Войти через VK ID"
              >
                {activeProvider === 'vk' ? (
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Image src="/static/icons/oauth/vk.svg" alt="VK" width={20} height={20} className="oauth-icon" />
                )}
              </button>
              <button
                type="button"
                className="oauth-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                onClick={() => oauthLogin('yandex')}
                disabled={isLoading || isPopupOpen}
                title="Войти через Yandex ID"
                aria-label="Войти через Yandex ID"
              >
                {activeProvider === 'yandex' ? (
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Image src="/static/icons/oauth/yandex.svg" alt="Yandex" width={20} height={20} className="oauth-icon" />
                )}
              </button>              
              <button
                type="button"
                className="oauth-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                onClick={() => oauthLogin('telegram')}
                disabled={isLoading || isPopupOpen}
                title="Войти через Telegram"
                aria-label="Войти через Telegram"
              >
                {activeProvider === 'telegram' ? (
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Image src="/static/icons/oauth/telegram.svg" alt="Telegram" width={20} height={20} className="oauth-icon" />
                )}
              </button>
              <button
                type="button"
                className="oauth-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                onClick={() => oauthLogin('google')}
                disabled={isLoading || isPopupOpen}
                title="Войти через Google"
                aria-label="Войти через Google"
              >
                {activeProvider === 'google' ? (
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Image src="/static/icons/oauth/google.svg" alt="Google" width={20} height={20} className="oauth-icon" />
                )}
              </button>
              <button
                type="button"
                className="oauth-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                onClick={() => oauthLogin('twitch')}
                disabled={isLoading || isPopupOpen}
                title="Войти через Twitch"
                aria-label="Войти через Twitch"
              >
                {activeProvider === 'twitch' ? (
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Image src="/static/icons/oauth/twitch.svg" alt="Twitch" width={20} height={20} className="oauth-icon" />
                )}
              </button>
            </div>

            <div className="mt-4">
              <p className="text-center text-sm">
                <span className="text-neutral-400 font-semibold underline underline-offset-4">Нет учетной записи?</span>{' '}
                <button
                  type="button"
                  onClick={() => switchTab('register')}
                  className="text-white bg-white/10 px-1.5 sm:px-2 py-0.5 rounded font-medium hover:bg-white/15 transition-colors"
                >
                  Регистрация
                </button>
              </p>
            </div>
          </form>
        )}
        </div>
      </div>

      <RateLimitCaptcha
        isOpen={showRateLimitCaptcha}
        onSuccess={handleRateLimitSuccess}
        onClose={() => {
          // При закрытии очищаем очередь и сбрасываем все флаги
          isCaptchaOpenRef.current = false;
          isProcessingCaptchaRef.current = false;
          setShowRateLimitCaptcha(false);
          pendingRequestsQueueRef.current = [];
        }}
      />
    </>
  );
}

