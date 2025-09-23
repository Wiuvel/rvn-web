'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

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

  useEffect(() => {
    checkAuthStatus();
    const timer = setTimeout(() => setShowForm(true), 100);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/check');
      const data = await response.json();
      setAuthState(data);
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
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
        return;
      }

      const passwordError = validatePassword(formData.password);
      if (passwordError) {
        setError(passwordError);
        setLoading(false);
        setIsSubmitting(false);
        return;
      }

      if (!isLogin && formData.password !== formData.confirmPassword) {
        setError('Пароли не совпадают');
        setLoading(false);
        setIsSubmitting(false);
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
        return;
      }

      if (isLogin) {
        setTimeout(() => {
          setAuthState({
            isAuthenticated: true,
            username: formData.username,
            adminExists: true
          });
          
          if (onAuthSuccess) {
            onAuthSuccess();
          }
        }, 500);
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
    } finally {
      setLoading(false);
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setAuthState({
        isAuthenticated: false,
        username: null,
        adminExists: false
      });
      setFormData({
        username: '',
        password: '',
        confirmPassword: ''
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (authState.isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-900">
        <div className="max-w-md w-full space-y-8 p-8 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl">
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
          
          <h2 className="text-2xl font-bold text-white">
            Добро пожаловать, {authState.username}!
          </h2>
          <p className="mt-2 text-neutral-400">
            Вы уже вошли в систему.
          </p>
            <div className="mt-6 space-y-4">
              <button
                onClick={() => window.location.reload()}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Перейти в серверную панель
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex justify-center py-3 px-4 border border-neutral-600 rounded-md shadow-sm text-sm font-medium text-neutral-300 bg-neutral-700 hover:bg-neutral-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Выйти
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (authState.adminExists) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-900 px-4 sm:px-6 lg:px-8">
        <div className={`max-w-md w-full space-y-8 p-6 sm:p-8 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl transition-all duration-700 ease-out ${
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
              Control Panel
            </h2>
            <p className="mt-2 text-sm sm:text-base text-neutral-400">
              Войдите в систему для доступа к панели
            </p>
          </div>
          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            {error && (
              <div className="bg-red-900/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor="username" className="block text-sm font-medium text-neutral-300">
                Логин
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={formData.username}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-neutral-600 rounded-lg shadow-sm placeholder-neutral-500 bg-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-neutral-500"
                placeholder="Введите логин"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-neutral-300">
                Пароль
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-neutral-600 rounded-lg shadow-sm placeholder-neutral-500 bg-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-neutral-500"
                placeholder="Введите пароль"
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={loading || isSubmitting}
                className={`w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] ${
                  isSubmitting ? 'animate-pulse' : ''
                }`}
              >
                {loading || isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Вход...
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
    <div className="min-h-screen flex items-center justify-center bg-neutral-900 px-4 sm:px-6 lg:px-8">
      <div className={`max-w-md w-full space-y-8 p-6 sm:p-8 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl transition-all duration-700 ease-out ${
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
            {isLogin ? 'Control Room' : 'Welcome!'}
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
              <label htmlFor="username" className="block text-sm font-medium text-neutral-300">
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
              <label htmlFor="password" className="block text-sm font-medium text-neutral-300">
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
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-neutral-300">
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
            <div className="text-red-400 text-sm text-center bg-red-900/20 border border-red-800 rounded-md p-3">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading || isSubmitting}
              className={`w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] ${
                isSubmitting ? 'animate-pulse' : ''
              }`}
            >
              {loading || isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {isLogin ? 'Вход...' : 'Регистрация...'}
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
              className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
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
