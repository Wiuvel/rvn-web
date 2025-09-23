'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import AuroraBackground from './ui/AuroraBackground';

interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  adminExists: boolean;
}

interface AdminAuthFormProps {
  onAuthSuccess?: () => void;
}

export default function AdminAuthForm({ onAuthSuccess }: AdminAuthFormProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    username: null,
    adminExists: false
  });
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);

  const validateUsername = (username: string): string | null => {
    if (!username) return 'Логин обязателен';
    if (username.length < 3) return 'Логин должен содержать минимум 3 символа';
    if (username.length > 20) return 'Логин должен содержать максимум 20 символов';
    if (!/^[a-zA-Z0-9]+$/.test(username)) return 'Логин может содержать только английские буквы и цифры';
    return null;
  };

  const validatePassword = (password: string): string | null => {
    if (!password) return 'Пароль обязателен';
    if (password.length < 6) return 'Пароль должен содержать минимум 6 символов';
    if (password.length > 50) return 'Пароль должен содержать максимум 50 символов';
    if (/\s/.test(password)) return 'Пароль не должен содержать пробелы';
    if (!/^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/.test(password)) {
      return 'Пароль может содержать только английские буквы, цифры и спецсимволы';
    }
    return null;
  };

  const checkAuthStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/check');
      const data = await response.json();
      setAuthState(data);
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
    const timer = setTimeout(() => setShowForm(true), 100);
    return () => clearTimeout(timer);
  }, [checkAuthStatus]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
    setLoginSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setIsSubmitting(true);
    setError('');

    try {
      const usernameError = validateUsername(formData.username);
      if (usernameError) {
        setError(usernameError);
        setLoading(false);
        setIsSubmitting(false);
        setLoginSuccess(false);
        return;
      }

      const passwordError = validatePassword(formData.password);
      if (passwordError) {
        setError(passwordError);
        setLoading(false);
        setIsSubmitting(false);
        setLoginSuccess(false);
        return;
      }

      if (!isLogin && formData.password !== formData.confirmPassword) {
        setError('Пароли не совпадают');
        setLoading(false);
        setIsSubmitting(false);
        setLoginSuccess(false);
        return;
      }

      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'An error occurred');
        setLoading(false);
        setLoginSuccess(false);
        return;
      }

      if (isLogin) {
        setLoginSuccess(true);
        setError('');
        setTimeout(() => {
          if (onAuthSuccess) {
            onAuthSuccess();
          }
        }, 2000);
      } else {
        setError('');
        setIsLogin(true);
        setFormData({
          username: '',
          password: '',
          confirmPassword: ''
        });
        alert('Admin created successfully! Please log in.');
      }
    } catch (error) {
      console.error('Auth error:', error);
      setError('Network error. Please try again.');
      setLoginSuccess(false);
    } finally {
      setLoading(false);
      setIsSubmitting(false);
    }
  };

  if (authState.adminExists) {
    return (
      <div className="min-h-screen flex items-center justify-center relative px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#060010' }}>
        <AuroraBackground 
          colorStops={['#5227FF', '#16A3FF', '#5227FF']} 
          amplitude={0.3} 
          blend={0.5}
          speed={1.0}
        />
        <div className={`relative z-10 max-w-md w-full space-y-8 p-6 sm:p-8 bg-neutral-900/40 backdrop-blur-md border border-neutral-800/50 rounded-2xl shadow-lg transition-all duration-700 ease-out ${
          showForm ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'
        }`}>
          <div className="text-center">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 flex items-center justify-center">
                <Image
                  src="/static/logo.svg"
                  alt="Raven Private Logo"
                  width={64}
                  height={64}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              Raven Private
            </h2>
            <p className="mt-2 text-sm sm:text-base text-white/70">
              Войдите в систему для доступа к панели
            </p>
          </div>
          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            {error && (
              <div className="bg-red-500/20 backdrop-blur-sm border border-red-400/50 text-red-200 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}
            
            {loginSuccess && (
              <div className="bg-green-500/20 backdrop-blur-sm border border-green-400/50 text-green-200 px-4 py-3 rounded-xl text-sm flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Вход выполнен успешно! Переход в панель...
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor="username" className="block text-sm font-medium text-white">
                Логин
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={formData.username}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl bg-neutral-800/60 border border-neutral-700/60 text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                placeholder="Введите логин"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-white">
                Пароль
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl bg-neutral-800/60 border border-neutral-700/60 text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                placeholder="Введите пароль"
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={loading || isSubmitting}
                className={`glass-btn w-full flex justify-center items-center py-3 px-4 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] ${
                  isSubmitting ? 'animate-pulse' : ''
                }`}
              >
                {loading || isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {loginSuccess ? 'Успешно!' : 'Вход...'}
                  </>
                ) : (
                  'Войти'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex items-center justify-center relative px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#060010' }}>
      <AuroraBackground 
        colorStops={['#5227FF', '#16A3FF', '#5227FF']} 
        amplitude={0.3} 
        blend={0.5}
        speed={1.0}
      />
      <div className={`relative z-10 max-w-md w-full space-y-8 p-6 sm:p-8 bg-neutral-900/40 backdrop-blur-md border border-neutral-800/50 rounded-2xl shadow-lg transition-all duration-700 ease-out ${
        showForm ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'
      }`}>
        <div className="text-center">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 flex items-center justify-center">
              <Image 
                src="/static/logo.svg" 
                alt="Raven Private Logo" 
                width={64}
                height={64}
                className="w-full h-full object-contain"
              />
            </div>
          </div>
          
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            {isLogin ? 'Admin Room' : 'Welcome!'}
          </h2>
          <p className="mt-2 text-sm sm:text-base text-neutral-400">
            {isLogin 
              ? 'Войдите в систему для доступа к панели' 
              : 'Создайте первый аккаунт для входа'
            }
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="username" className="block text-sm font-medium text-white">
                Логин
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={formData.username}
                onChange={handleChange}
                className="block w-full px-4 py-3 border border-neutral-600 rounded-lg shadow-sm placeholder-neutral-500 bg-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-neutral-500"
                placeholder="Введите логин"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-white">
                Пароль
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="block w-full px-4 py-3 border border-neutral-600 rounded-lg shadow-sm placeholder-neutral-500 bg-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-neutral-500"
                placeholder="Введите пароль"
              />
            </div>
            {!isLogin && (
              <div className="space-y-1">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-white">
                  Подтвердите пароль
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required={!isLogin}
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="block w-full px-4 py-3 border border-neutral-600 rounded-lg shadow-sm placeholder-neutral-500 bg-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-neutral-500"
                  placeholder="Подтвердите пароль"
                />
              </div>
            )}
          </div>
          {error && (
            <div className="text-red-200 text-sm text-center bg-red-500/20 backdrop-blur-sm border border-red-400/50 rounded-xl p-3">
              {error}
            </div>
          )}

          {loginSuccess && (
            <div className="text-green-200 text-sm text-center bg-green-500/20 backdrop-blur-sm border border-green-400/50 rounded-xl p-3 flex items-center justify-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Вход выполнен успешно! Переход в панель...
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading || isSubmitting}
              className={`glass-btn w-full flex justify-center items-center py-3 px-4 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] ${
                isSubmitting ? 'animate-pulse' : ''
              }`}
            >
              {loading || isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {loginSuccess ? 'Успешно!' : (isLogin ? 'Вход...' : 'Регистрация...')}
                </>
              ) : (
                isLogin ? 'Войти' : 'Зарегистрироваться'
              )}
            </button>
          </div>
          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setFormData({
                  username: '',
                  password: '',
                  confirmPassword: ''
                });
              }}
              className="text-sky-300 hover:underline text-sm font-medium transition-colors duration-200"
            >
              {isLogin 
                ? "Нет аккаунта? Зарегистрироваться" 
                : "Уже есть аккаунт? Войти"
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
