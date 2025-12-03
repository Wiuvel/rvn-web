'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { translateError } from '@/lib/utils/error-translations';
import { loginSchema, registerSchema, type LoginFormData, type RegisterFormData } from '@/lib/validation/schemas';

interface Turnstile {
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
    turnstile?: Turnstile;
  }
}

interface AuthFormProps {
  retpatch?: string;
  initialError?: string;
}

export default function AuthForm({ retpatch = '/dashboard/', initialError }: AuthFormProps) {
  const [currentTab, setCurrentTab] = useState<'login' | 'register'>('login');
  const [isLoading, setIsLoading] = useState(false);
  
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
  const [captchaResponse, setCaptchaResponse] = useState({
    register: '',
    login: ''
  });
  const [csrfToken, setCsrfToken] = useState('');
  const [currentWidgetId, setCurrentWidgetId] = useState<string | null>(null);
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
      setGlobalError('Не удалось получить токен безопасности. Обновите страницу.');
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
    
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: escapeHtml(data.username),
          password: data.password,
          confirmPassword: data.confirmPassword,
          csrfToken: tokenToUse
        })
      });
      const responseData = await response.json();
      if (response.ok) {
        window.location.href = `/dashboard/${responseData.dashboard_token}`;
      } else {
        const translatedError = translateError(responseData.error || 'Ошибка регистрации');
        setGlobalError(escapeHtml(translatedError));
        if (response.status === 403) {
          fetchCsrfToken();
        }
      }
    } catch {
      setGlobalError('API ERROR: 405.');
      fetchCsrfToken();
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (data: LoginFormData) => {
    const tokenToUse = csrfToken || (await fetchCsrfToken());
    if (!tokenToUse) {
      return;
    }
    setIsLoading(true);
    setLoginAttemptState('idle');
    setGlobalError('');
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: escapeHtml(data.username),
          password: data.password,
          csrfToken: tokenToUse
        })
      });
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
      }
    } catch {
      setLoginAttemptState('error');
      setGlobalError('Ошибка сети. Попробуйте позже.');
      fetchCsrfToken();
    } finally {
      setIsLoading(false);
    }
  };


  // Handle OAuth login - opens in popup window via oauth-handler page
  const oauthLogin = async (provider: string) => {
    setIsLoading(true);
    
    // Listen for messages from OAuth popup
    const handleMessage = (event: MessageEvent) => {
      // Verify origin for security
      if (event.origin !== window.location.origin) {
        return;
      }
      
      if (event.data.type === 'OAUTH_SUCCESS') {
        window.removeEventListener('message', handleMessage);
        setIsLoading(false);
        
        // Redirect to dashboard
        if (event.data.redirect) {
          window.location.href = event.data.redirect;
        } else if (event.data.dashboard_token) {
          window.location.href = `/dashboard/${event.data.dashboard_token}`;
        }
      } else if (event.data.type === 'OAUTH_ERROR') {
        window.removeEventListener('message', handleMessage);
        setIsLoading(false);
        setGlobalError(event.data.error || 'Ошибка авторизации');
      }
    };
    
    window.addEventListener('message', handleMessage);
    
    try {
      // Open OAuth handler page in popup window
      // This page has immunity to protection middleware and handles the OAuth flow
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
        setGlobalError('Пожалуйста, разрешите всплывающие окна для авторизации');
        window.removeEventListener('message', handleMessage);
        return;
      }
      
      // Check if popup was closed manually
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handleMessage);
          setIsLoading(false);
        }
      }, 500);
    } catch {
      setGlobalError('Ошибка подключения к провайдеру');
      setIsLoading(false);
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
    setCaptchaResponse({ register: '', login: '' });
    setIsLoading(false);
    setLoginAttemptState('idle');
  };

  const switchTab = (tab: 'login' | 'register') => {
    setCurrentTab(tab);
    resetForm();
    setTimeout(() => loadCaptcha(tab), 50);
    fetchCsrfToken();
  };

  const loadCaptcha = (formType: 'login' | 'register') => {
    if (
      currentWidgetId &&
      typeof window !== 'undefined' &&
      window.turnstile
    ) {
      window.turnstile.remove(currentWidgetId);
    }

    const containerId = `${formType}-captcha-container`;
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';

    if (typeof window !== 'undefined' && window.turnstile) {
      const widgetId = window.turnstile.render('#' + containerId, {
        sitekey: '3x00000000000000000000FF',
        theme: 'dark',
        callback: (token: string) => {
          setCaptchaResponse(prev => ({ ...prev, [formType]: token })); 
          setGlobalError('');
        },
        'error-callback': () => {
          setCaptchaResponse(prev => ({ ...prev, [formType]: '' }));
          setGlobalError('Ошибка загрузки капчи');
        }
      });
      setCurrentWidgetId(widgetId);
    } else {
      setTimeout(() => loadCaptcha(formType), 100);
    }
  };

  useEffect(() => {
    loadCaptcha(currentTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab]);

  useEffect(() => {
    fetchCsrfToken();
  }, []);

  // Handle initial error from OAuth redirect
  useEffect(() => {
    if (initialError) {
      const translatedError = translateError(initialError);
      setGlobalError(translatedError);
    }
  }, [initialError]);

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-neutral-900/80 backdrop-blur-md p-8 rounded-2xl border border-neutral-800 shadow-lg animate-fadeIn overflow-hidden">
        <h2 className="text-2xl font-semibold mb-6 text-center">
          {currentTab === 'register' ? 'Регистрация' : 'Вход'}
        </h2>

        {/* Registration Form */}
        {currentTab === 'register' && (
          <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
            <label className="block">
              <span className="sr-only">Логин</span>
              <input
                type="text"
                {...registerForm.register('username')}
                placeholder="Логин"
                autoComplete="username"
                className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white"
              />
            </label>
            {registerForm.formState.errors.username && (
              <p className="text-red-500 text-sm mt-1" role="alert">
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
                  className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white pr-10"
                />
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(prev => ({ ...prev, register: !prev.register }))}
                className="absolute right-3 top-3.5 text-gray-500 hover:text-gray-700 pass-toggle"
                aria-label={showPassword.register ? 'Скрыть пароль' : 'Показать пароль'}
              >
                <Image
                  src={showPassword.register ? "/static/icons/login/pass-hide.svg" : "/static/icons/login/pass-hideoff.svg"}
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
              <p className="text-red-400 text-xs mt-1" role="alert">
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
                disabled={!isPasswordValid.register}
                className={`w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white ${
                  isPasswordValid.register ? 'opacity-100' : 'opacity-50'
                }`}
              />
            </label>
            {registerForm.formState.errors.confirmPassword && (
              <p className="text-red-400 text-xs mt-1" role="alert">
                {registerForm.formState.errors.confirmPassword.message}
              </p>
            )}

            <div className="flex justify-center select-none">
              <p className="text-xs text-neutral-400 text-center">
                При регистрации вы соглашаетесь с{' '}
                <Link
                  href="/legal/terms/"
                  target="_blank"
                  rel="noopener noreferrer"
                  prefetch={false}
                  className="text-primary-400 hover:underline"
                >
                  Пользовательским соглашением
                </Link>
                {' '}и{' '}
                <Link
                  href="/legal/privacy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  prefetch={false}
                  className="text-primary-400 hover:underline"
                >
                  Политикой конфиденциальности
                </Link>
                .
              </p>
            </div>

            <div className="flex justify-center mt-4">
              <div id="register-captcha-container"></div>
            </div>
            <input type="hidden" name="cf-turnstile-response" value={captchaResponse.register} />

            {globalError && (
              <p
                className={`auth-feedback ${globalError ? 'visible' : ''}`}
                role="alert"
                aria-live="assertive"
              >
                {globalError}
              </p>
            )}

            <div className="flex justify-center">
              <button
                type="submit"
                className="glass-btn"
                disabled={isLoading || !captchaResponse.register}
              >
                {isLoading && <span className="spinner"></span>}
                <span>{isLoading ? 'Отправка...' : 'Зарегистрироваться'}</span>
              </button>
            </div>

            <div className="divider">
              <span>или авторизироваться через</span>
            </div>

            <div className="oauth-grid">
              <button
                type="button"
                className="oauth-btn"
                onClick={() => oauthLogin('google')}
                disabled={isLoading}
                title="Войти через Google"
                aria-label="Войти через Google"
              >
                <Image src="/static/icons/oauth/google.svg" alt="Google" width={20} height={20} />
              </button>
              <button
                type="button"
                className="oauth-btn"
                onClick={() => oauthLogin('telegram')}
                disabled={isLoading}
                title="Войти через Telegram"
                aria-label="Войти через Telegram"
              >
                <Image src="/static/icons/oauth/telegram.svg" alt="Telegram" width={20} height={20} />
              </button>
              <button
                type="button"
                className="oauth-btn"
                onClick={() => oauthLogin('twitch')}
                disabled={isLoading}
                title="Войти через Twitch"
                aria-label="Войти через Twitch"
              >
                <Image src="/static/icons/oauth/twitch.svg" alt="Twitch" width={20} height={20} />
              </button>
            </div>

            <p className="text-center text-sm">
              Уже есть аккаунт?{' '}
              <button
                type="button"
                onClick={() => switchTab('login')}
                className="text-sky-300 hover:underline"
              >
                Войти
              </button>
            </p>
          </form>
        )}

        {/* Authorization Form */}
        {currentTab === 'login' && (
          <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
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
                className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white"
              />
            </label>
            {loginForm.formState.errors.username && (
              <p className="text-red-500 text-sm mt-1" role="alert">
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
                  className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white pr-10"
                />
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(prev => ({ ...prev, login: !prev.login }))}
                className="absolute right-3 top-3.5 text-gray-500 hover:text-gray-700 pass-toggle"
                aria-label={showPassword.login ? 'Скрыть пароль' : 'Показать пароль'}
              >
                <Image
                  src={showPassword.login ? "/static/icons/login/pass-hide.svg" : "/static/icons/login/pass-hideoff.svg"}
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

            <div className="flex justify-center mt-4">
              <div id="login-captcha-container"></div>
            </div>
            <input type="hidden" name="cf-turnstile-response" value={captchaResponse.login} />

            <div className="flex justify-center">
              <button
                type="submit"
                className={`glass-btn ${loginAttemptState === 'error' ? 'btn-shake' : ''}`}
                disabled={isLoading || !captchaResponse.login}
              >
                {isLoading && <span className="spinner"></span>}
                <span>{isLoading ? 'Вход...' : 'Войти'}</span>
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
              <span>или авторизироваться через</span>
            </div>

            <div className="oauth-grid">
              <button
                type="button"
                className="oauth-btn"
                onClick={() => oauthLogin('google')}
                disabled={isLoading}
                title="Войти через Google"
                aria-label="Войти через Google"
              >
                <Image src="/static/icons/oauth/google.svg" alt="Google" width={20} height={20} />
              </button>
              <button
                type="button"
                className="oauth-btn"
                onClick={() => oauthLogin('telegram')}
                disabled={isLoading}
                title="Войти через Telegram"
                aria-label="Войти через Telegram"
              >
                <Image src="/static/icons/oauth/telegram.svg" alt="Telegram" width={20} height={20} />
              </button>
              <button
                type="button"
                className="oauth-btn"
                onClick={() => oauthLogin('twitch')}
                disabled={isLoading}
                title="Войти через Twitch"
                aria-label="Войти через Twitch"
              >
                <Image src="/static/icons/oauth/twitch.svg" alt="Twitch" width={20} height={20} />
              </button>
            </div>

            <p className="text-center text-sm">
              Нет аккаунта?{' '}
              <button
                type="button"
                onClick={() => switchTab('register')}
                className="text-sky-300 hover:underline"
              >
                Зарегистрироваться
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
