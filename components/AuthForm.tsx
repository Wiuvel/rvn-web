'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { translateError } from '@/lib/error-translations';

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
}

export default function AuthForm({ retpatch = '/dashboard/' }: AuthFormProps) {
  const [currentTab, setCurrentTab] = useState<'login' | 'register'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [registerData, setRegisterData] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [loginData, setLoginData] = useState({
    username: '',
    password: ''
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
  const [errors, setErrors] = useState({
    global: '',
    register: { username: '', password: '', confirmPassword: '' },
    login: { username: '', password: '' }
  });
  const [captchaResponse, setCaptchaResponse] = useState({
    register: '',
    login: ''
  });
  const [csrfToken, setCsrfToken] = useState('');
  const [currentWidgetId, setCurrentWidgetId] = useState<string | null>(null);
  const [loginAttemptState, setLoginAttemptState] = useState<'idle' | 'error'>('idle');

  const validateUsername = (username: string, formType: 'login' | 'register') => {
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
      setErrors(prev => ({
        ...prev,
        [formType]: { ...prev[formType], username: 'Логин может содержать только латиницу и цифры' }
      }));
      return false;
    }
    if (username.length < 3) {
      setErrors(prev => ({
        ...prev,
        [formType]: { ...prev[formType], username: 'Логин должен быть не короче 3 символов' }
      }));
      return false;
    }
    setErrors(prev => ({
      ...prev,
      [formType]: { ...prev[formType], username: '' }
    }));
    return true;
  };

  const validatePassword = (password: string, formType: 'login' | 'register') => {
    const passwordRegex = /^[a-zA-Z0-9!@#$%^&*()_+.\-=\[\]{};':"\\|,<>\/?]+$/;
    if (password.length === 0) {
      setErrors(prev => ({
        ...prev,
        [formType]: { ...prev[formType], password: '' }
      }));
      setIsPasswordValid(prev => ({ ...prev, [formType]: false }));
      setShowPasswordStrength(prev => ({ ...prev, [formType]: false }));
      if (formType === 'register') {
        setRegisterData(prev => ({ ...prev, confirmPassword: '' }));
        setErrors(prev => ({
          ...prev,
          register: { ...prev.register, confirmPassword: '' }
        }));
      }
      return false;
    }
    if (!passwordRegex.test(password)) {
      setErrors(prev => ({
        ...prev,
        [formType]: { ...prev[formType], password: 'Пароль может содержать только латиницу, цифры и спецсимволы (включая точку)' }
      }));
      setIsPasswordValid(prev => ({ ...prev, [formType]: false }));
      setShowPasswordStrength(prev => ({ ...prev, [formType]: false }));
      if (formType === 'register') {
        setRegisterData(prev => ({ ...prev, confirmPassword: '' }));
        setErrors(prev => ({
          ...prev,
          register: { ...prev.register, confirmPassword: '' }
        }));
      }
      return false;
    }
    if (password.length < 6) {
      setErrors(prev => ({
        ...prev,
        [formType]: { ...prev[formType], password: 'Пароль должен быть не менее 6 символов' }
      }));
      setIsPasswordValid(prev => ({ ...prev, [formType]: false }));
      setShowPasswordStrength(prev => ({ ...prev, [formType]: false }));
      if (formType === 'register') {
        setRegisterData(prev => ({ ...prev, confirmPassword: '' }));
        setErrors(prev => ({
          ...prev,
          register: { ...prev.register, confirmPassword: '' }
        }));
      }
      return false;
    }
    setErrors(prev => ({
      ...prev,
      [formType]: { ...prev[formType], password: '' }
    }));
    setIsPasswordValid(prev => ({ ...prev, [formType]: true }));
    setShowPasswordStrength(prev => ({ ...prev, [formType]: true }));
    return true;
  };

  const validateConfirmPassword = (
    confirmValue?: string,
    passwordValue?: string
  ) => {
    const password = passwordValue ?? registerData.password;
    const confirmation = confirmValue ?? registerData.confirmPassword;

    if (!password) {
      setErrors(prev => ({
        ...prev,
        register: { ...prev.register, confirmPassword: '' }
      }));
      return true;
    }
    
    if (!confirmation) {
      setErrors(prev => ({
        ...prev,
        register: { ...prev.register, confirmPassword: '' }
      }));
      return true;
    }
    
    setShowPasswordStrength(prev => ({ ...prev, register: false }));
    
    if (confirmation !== password) {
      setErrors(prev => ({
        ...prev,
        register: { ...prev.register, confirmPassword: 'Пароли не совпадают' }
      }));
      return false;
    }
    
    setErrors(prev => ({
      ...prev,
      register: { ...prev.register, confirmPassword: '' }
    }));
    return true;
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
    } catch {
      // Тихий режим - ошибка обрабатывается через UI
      setCsrfToken('');
      setErrors(prev => ({
        ...prev,
        global: 'Не удалось получить токен безопасности. Обновите страницу.'
      }));
      return null;
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm('register')) return;
    const tokenToUse = csrfToken || (await fetchCsrfToken());
    if (!tokenToUse) {
      return;
    }
    setIsLoading(true);
    setErrors(prev => ({ ...prev, global: '' }));
    
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: escapeHtml(registerData.username),
          password: registerData.password,
          confirmPassword: registerData.confirmPassword,
          csrfToken: tokenToUse
        })
      });
      const data = await response.json();
      if (response.ok) {
        // Перенаправляем на dashboard с токеном
        window.location.href = `/dashboard/${data.dashboard_token}`;
      } else {
        const translatedError = translateError(data.error || 'Ошибка регистрации');
        setErrors(prev => ({ ...prev, global: escapeHtml(translatedError) }));
        if (response.status === 403) {
          fetchCsrfToken();
        }
      }
    } catch {
      setErrors(prev => ({ ...prev, global: 'API ERROR: 405.' }));
      fetchCsrfToken();
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm('login')) return;
    const tokenToUse = csrfToken || (await fetchCsrfToken());
    if (!tokenToUse) {
      return;
    }
    setIsLoading(true);
    setLoginAttemptState('idle');
    setErrors(prev => ({ ...prev, global: '' }));
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: escapeHtml(loginData.username),
          password: loginData.password,
          csrfToken: tokenToUse
        })
      });
      const data = await response.json();
      if (response.ok) {
        // Перенаправляем с учетом retpatch
        if (retpatch && retpatch !== '/dashboard/') {
          // Если retpatch указан и это не дефолтный путь, используем его
          window.location.href = retpatch;
        } else {
          // По умолчанию - dashboard с токеном
          window.location.href = `/dashboard/${data.dashboard_token}`;
        }
      } else {
        setLoginAttemptState('error');
        const translatedError = translateError(data.error || 'Ошибка входа');
        setErrors(prev => ({ ...prev, global: escapeHtml(translatedError) }));
        if (response.status === 403) {
          fetchCsrfToken();
        }
      }
    } catch {
      setLoginAttemptState('error');
      setErrors(prev => ({ ...prev, global: 'Ошибка сети. Попробуйте позже.' }));
      fetchCsrfToken();
    } finally {
      setIsLoading(false);
    }
  };

  const validateForm = (formType: 'login' | 'register') => {
    const isValidUsername = validateUsername(
      formType === 'register' ? registerData.username : loginData.username, 
      formType
    );
    const isValidPassword = validatePassword(
      formType === 'register' ? registerData.password : loginData.password, 
      formType
    );
    let isValidConfirm = true;
    if (formType === 'register') {
      isValidConfirm = validateConfirmPassword();
    }
    // const hasCaptcha = !!captchaResponse[formType];
    // if (!hasCaptcha) {
    //   setErrors(prev => ({ ...prev, global: 'Подтвердите, что вы не робот' }));
    //   return false;
    // }
    return isValidUsername && isValidPassword && isValidConfirm;
  };

  const oauthLogin = async (provider: string) => {
    setIsLoading(true);
    try {
      // Перенаправляем на API route для инициации OAuth
      window.location.href = `/api/auth/oauth/${provider}`;
    } catch {
      setErrors(prev => ({ ...prev, global: 'Ошибка подключения к провайдеру' }));
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
    setRegisterData({ username: '', password: '', confirmPassword: '' });
    setLoginData({ username: '', password: '' });
    setErrors({
      global: '',
      register: { username: '', password: '', confirmPassword: '' },
      login: { username: '', password: '' }
    });
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
          setErrors(prev => ({ ...prev, global: '' }));
        },
        'error-callback': () => {
          setCaptchaResponse(prev => ({ ...prev, [formType]: '' }));
          setErrors(prev => ({ ...prev, global: 'Ошибка загрузки капчи' }));
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

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-neutral-900/80 backdrop-blur-md p-8 rounded-2xl border border-neutral-800 shadow-lg animate-fadeIn overflow-hidden">
        <h2 className="text-2xl font-semibold mb-6 text-center">
          {currentTab === 'register' ? 'Регистрация' : 'Вход'}
        </h2>

        {/* Registration Form */}
        {currentTab === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <label className="block">
              <span className="sr-only">Логин</span>
              <input
                type="text"
                value={registerData.username}
                onChange={(e) => {
                  if (errors.global) {
                    setErrors(prev => ({ ...prev, global: '' }));
                  }
                  setRegisterData(prev => ({ ...prev, username: e.target.value }));
                  validateUsername(e.target.value, 'register');
                }}
                placeholder="Логин"
                required
                autoComplete="username"
                className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white"
              />
            </label>
            {errors.register.username && (
              <p className="text-red-500 text-sm mt-1" role="alert">
                {errors.register.username}
              </p>
            )}

            <div className="relative">
              <label className="block">
                <span className="sr-only">Пароль</span>
                <input
                  type={showPassword.register ? 'text' : 'password'}
                  value={registerData.password}
                  onChange={(e) => {
                  const nextValue = e.target.value;
                  setRegisterData(prev => ({ ...prev, password: nextValue }));
                  validatePassword(nextValue, 'register');
                  if (registerData.confirmPassword) {
                    validateConfirmPassword(registerData.confirmPassword, nextValue);
                  }
                  }}
                  placeholder="Пароль"
                  required
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
            {showPasswordStrength.register && registerData.password.length > 0 && !registerData.confirmPassword && (() => {
              const strength = calculatePasswordStrength(registerData.password);
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

            {errors.register.password && (
              <p className="text-red-400 text-xs mt-1" role="alert">
                {errors.register.password}
              </p>
            )}

            <label className="block">
              <span className="sr-only">Подтверждение пароля</span>
              <input
                type="password"
                value={registerData.confirmPassword}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setRegisterData(prev => ({ ...prev, confirmPassword: nextValue }));
                  validateConfirmPassword(nextValue);
                }}
                placeholder="Подтверждение пароля"
                required
                autoComplete="new-password"
                disabled={!isPasswordValid.register}
                className={`w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white ${
                  isPasswordValid.register ? 'opacity-100' : 'opacity-50'
                }`}
              />
            </label>
            {errors.register.confirmPassword && (
              <p className="text-red-400 text-xs mt-1" role="alert">
                {errors.register.confirmPassword}
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

            {errors.global && (
              <p
                className={`auth-feedback ${errors.global ? 'visible' : ''}`}
                role="alert"
                aria-live="assertive"
              >
                {errors.global}
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
          <form onSubmit={handleLogin} className="space-y-4">
            <label className="block">
              <span className="sr-only">Логин</span>
              <input
                type="text"
                value={loginData.username}
                onChange={(e) => {
                  if (errors.global) {
                    setErrors(prev => ({ ...prev, global: '' }));
                  }
                  if (loginAttemptState === 'error') {
                    setLoginAttemptState('idle');
                  }
                  setLoginData(prev => ({ ...prev, username: e.target.value }));
                  validateUsername(e.target.value, 'login');
                }}
                placeholder="Логин"
                required
                autoComplete="username"
                className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white"
              />
            </label>
            {errors.login.username && (
              <p className="text-red-500 text-sm mt-1" role="alert">
                {errors.login.username}
              </p>
            )}

            <div className="relative">
              <label className="block">
                <span className="sr-only">Пароль</span>
                <input
                  type={showPassword.login ? 'text' : 'password'}
                  value={loginData.password}
                  onChange={(e) => {
                  if (errors.global) {
                    setErrors(prev => ({ ...prev, global: '' }));
                  }
                  if (loginAttemptState === 'error') {
                    setLoginAttemptState('idle');
                  }
                    setLoginData(prev => ({ ...prev, password: e.target.value }));
                    validatePassword(e.target.value, 'login');
                  }}
                  placeholder="Пароль"
                  required
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
            {errors.login.password && (
              <p className="text-red-500 text-xs mt-1" role="alert">
                {errors.login.password}
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

            {errors.global && (
              <p
                className={`auth-feedback ${errors.global ? 'visible' : ''}`}
                role="alert"
                aria-live="assertive"
              >
                {errors.global}
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
