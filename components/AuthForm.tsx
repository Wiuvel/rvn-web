'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

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

export default function AuthForm() {
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
  const [currentWidgetId, setCurrentWidgetId] = useState<string | null>(null);

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
    const passwordRegex = /^[a-zA-Z0-9!@#$%^&*()_+]+$/;
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
        [formType]: { ...prev[formType], password: 'Пароль может содержать только латиницу, цифры и спецсимволы' }
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

  const validateConfirmPassword = () => {
    if (!registerData.confirmPassword) {
      setErrors(prev => ({
        ...prev,
        register: { ...prev.register, confirmPassword: '' }
      }));
      setShowPasswordStrength(prev => ({ ...prev, register: true }));
      return true;
    }
    setShowPasswordStrength(prev => ({ ...prev, register: false }));
    if (registerData.confirmPassword !== registerData.password) {
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm('register')) return;
    setIsLoading(true);
    setErrors(prev => ({ ...prev, global: '' }));
    
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: escapeHtml(registerData.username),
          password: registerData.password,
          'cf-turnstile-response': captchaResponse.register
        })
      });
      const data = await response.json();
      if (response.ok) {
        window.location.href = '/dashboard';
      } else {
        setErrors(prev => ({ ...prev, global: escapeHtml(data.message || 'Ошибка регистрации') }));
      }
    } catch {
      setErrors(prev => ({ ...prev, global: 'API ERROR: 405.' }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm('login')) return;
    setIsLoading(true);
    setErrors(prev => ({ ...prev, global: '' }));
    
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: escapeHtml(loginData.username),
          password: loginData.password,
          'cf-turnstile-response': captchaResponse.login
        })
      });
      const data = await response.json();
      if (response.ok) {
        window.location.href = '/dashboard';
      } else {
        setErrors(prev => ({ ...prev, global: escapeHtml(data.message || 'Ошибка входа') }));
      }
    } catch {
      setErrors(prev => ({ ...prev, global: 'Ошибка сети. Попробуйте позже.' }));
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
    const hasCaptcha = !!captchaResponse[formType];
    if (!hasCaptcha) {
      setErrors(prev => ({ ...prev, global: 'Подтвердите, что вы не робот' }));
      return false;
    }
    return isValidUsername && isValidPassword && isValidConfirm;
  };

  const oauthLogin = async (provider: string) => {
    setIsLoading(true);
    try {
      window.location.href = `/auth/${provider}`;
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
  };

  const switchTab = (tab: 'login' | 'register') => {
    setCurrentTab(tab);
    resetForm();
    setTimeout(() => loadCaptcha(tab), 50);
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
        sitekey: '0x4AAAAAAB0s4O-sxm9ZnAQk',
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
                    setRegisterData(prev => ({ ...prev, password: e.target.value }));
                    validatePassword(e.target.value, 'register');
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

            {/* Password Strength */}
            {showPasswordStrength.register && registerData.password.length > 0 && !registerData.confirmPassword && (
              <div className="password-strength">
                <div className="password-strength-bar">
                  <div 
                    className={`h-1 rounded transition-all ${
                      registerData.password.length > 0 && registerData.password.length < 7
                        ? 'bg-red-500 w-1/4'
                        : registerData.password.length >= 7 && registerData.password.length < 9
                        ? 'bg-yellow-500 w-2/4'
                        : 'bg-green-500 w-full'
                    }`}
                  />
                </div>
              </div>
            )}

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
                  setRegisterData(prev => ({ ...prev, confirmPassword: e.target.value }));
                  validateConfirmPassword();
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
                <Link href="/legal/terms/" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline">
                  Пользовательским соглашением
                </Link>
                {' '}и{' '}
                <Link href="/legal/privacy/" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline">
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
              <p className="text-red-400 text-sm text-center mt-2" role="alert">
                {errors.global}
              </p>
            )}

            <div className="flex justify-center">
              <button type="submit" className="glass-btn" disabled={isLoading}>
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
              <button type="submit" className="glass-btn" disabled={isLoading}>
                {isLoading && <span className="spinner"></span>}
                <span>{isLoading ? 'Вход...' : 'Войти'}</span>
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

