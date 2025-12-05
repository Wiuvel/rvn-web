'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import AuroraBackground from '@/components/ui/AuroraBackground';
import { translateError } from '@/lib/utils/error-translations';
import { adminAuthSchema, adminRegisterSchema, type AdminAuthFormData, type AdminRegisterFormData } from '@/lib/validation/schemas';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // React Hook Form setup
  const form = useForm<AdminAuthFormData | AdminRegisterFormData>({
    resolver: zodResolver(isLogin ? adminAuthSchema : adminRegisterSchema),
    defaultValues: {
      username: '',
      password: '',
      confirmPassword: '',
      csrfToken: '',
    },
    mode: 'onChange',
  });
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    username: null,
    adminExists: false
  });
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [csrfToken, setCsrfToken] = useState('');

  // Update form resolver when switching between login/register
  useEffect(() => {
    form.clearErrors();
    if (isLogin) {
      form.reset({ username: '', password: '', confirmPassword: '', csrfToken: '' });
    } else {
      form.reset({ username: '', password: '', confirmPassword: '', csrfToken: '' });
    }
  }, [isLogin, form]);

  const getCsrfToken = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/csrf');
      const data = await response.json();
      setCsrfToken(data.csrfToken);
    } catch (error) {
      console.error('Error getting CSRF token:', error);
    }
  }, []);

  const checkAuthStatus = useCallback(async () => {
    try {
      setIsCheckingAuth(true);
      const response = await fetch('/api/admin/check');
      const data = await response.json();
      setAuthState(data);
    } catch (error) {
      console.error('Error checking auth status:', error);
    } finally {
      setIsCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
    getCsrfToken();
    const timer = setTimeout(() => setShowForm(true), 100);
    return () => clearTimeout(timer);
  }, [checkAuthStatus, getCsrfToken]);

  const handleSubmit = async (data: AdminAuthFormData | AdminRegisterFormData) => {
    setLoading(true);
    setIsSubmitting(true);
    setError('');

    try {
      const endpoint = isLogin ? '/api/admin/login' : '/api/admin/register';

      const response: Response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: data.username,
          password: data.password,
          confirmPassword: data.confirmPassword,
          csrfToken
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        const translatedError = translateError(responseData.error || 'An error occurred');
        setError(translatedError);
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
        setIsTransitioning(true);
        setTimeout(() => {
          setIsLogin(true);
          form.reset();
          setIsTransitioning(false);
          alert('Запись успешно создана. Войдите в систему.');
        }, 300);
      }
    } catch (error) {
      console.error('Auth error:', error);
      setError('Ошибка сети. Попробуйте позже.');
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
        } ${isTransitioning ? 'opacity-50 scale-95' : ''}`}>
          <div className={`text-center transition-all duration-300 ease-in-out ${
            isTransitioning ? 'opacity-0 transform scale-95' : 'opacity-100 transform scale-100'
          }`}>
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 flex items-center justify-center">
                <Image
                  src="/static/logo.svg"
                  alt="Raven Private Logo"
                  width={256}
                  height={256}
                  className="w-full h-full object-contain"
                  priority
                  placeholder="empty"
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
          <form className={`mt-8 space-y-6 transition-all duration-300 ease-in-out ${
            isTransitioning ? 'opacity-0 transform translate-y-4' : 'opacity-100 transform translate-y-0'
          }`} onSubmit={form.handleSubmit(handleSubmit)}>
            <div className="space-y-1">
              <label htmlFor="username" className="block text-sm font-medium text-white">
                Логин
              </label>
              <input
                id="username"
                type="text"
                {...form.register('username')}
                className="w-full px-4 py-3 rounded-xl bg-neutral-800/60 border border-neutral-700/60 text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                placeholder="Введите логин"
              />
              {form.formState.errors.username && (
                <p className="text-red-400 text-xs mt-1" role="alert">
                  {form.formState.errors.username.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-white">
                Пароль
              </label>
              <input
                id="password"
                type="password"
                {...form.register('password')}
                className="w-full px-4 py-3 rounded-xl bg-neutral-800/60 border border-neutral-700/60 text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                placeholder="Введите пароль"
              />
              {form.formState.errors.password && (
                <p className="text-red-400 text-xs mt-1" role="alert">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>
            
            {error && (
              <div className="bg-red-500/20 backdrop-blur-sm border border-red-400/50 text-red-200 px-4 py-3 rounded-xl text-sm flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}
            
            {loginSuccess && (
              <div className="bg-green-500/20 backdrop-blur-sm border border-green-400/50 text-green-200 px-4 py-3 rounded-xl text-sm flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Вход выполнен успешно. Переход в панель..
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading || isSubmitting}
                className={`glass-btn w-full flex justify-center items-center py-3 px-4 text-sm font-medium disabled:opacity-50 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] ${
                  isSubmitting ? 'animate-pulse' : ''
                }`}
              >
                {loading || isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {loginSuccess ? 'Успешно!' : 'Вход..'}
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
      } ${isTransitioning ? 'opacity-50 scale-95' : ''}`}>
        <div className={`text-center transition-all duration-300 ease-in-out ${
          isTransitioning ? 'opacity-0 transform scale-95' : 'opacity-100 transform scale-100'
        }`}>
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 flex items-center justify-center">
              <Image 
                src="/static/logo.svg" 
                alt="Raven Private Logo" 
                width={256}
                height={256}
                className="w-full h-full object-contain"
                priority
                placeholder="empty"
              />
            </div>
          </div>
          
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            {isLogin ? 'Raven Private' : 'Welcome!'}
          </h2>
          <p className="mt-2 text-sm sm:text-base text-neutral-400">
            {isLogin 
              ? 'Войдите в систему для доступа к панели' 
              : 'Создайте первый аккаунт для входа'
            }
          </p>
        </div>
        <form className={`mt-8 space-y-6 transition-all duration-300 ease-in-out ${
          isTransitioning ? 'opacity-0 transform translate-y-4' : 'opacity-100 transform translate-y-0'
        }`} onSubmit={form.handleSubmit(handleSubmit)}>
          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="username" className="block text-sm font-medium text-white">
                Логин
              </label>
              <input
                id="username"
                type="text"
                {...form.register('username')}
                className="block w-full px-4 py-3 border border-neutral-600 rounded-lg shadow-sm placeholder-neutral-500 bg-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-neutral-500"
                placeholder="Введите логин"
              />
              {form.formState.errors.username && (
                <p className="text-red-400 text-xs mt-1" role="alert">
                  {form.formState.errors.username.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-white">
                Пароль
              </label>
              <input
                id="password"
                type="password"
                {...form.register('password')}
                className="block w-full px-4 py-3 border border-neutral-600 rounded-lg shadow-sm placeholder-neutral-500 bg-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-neutral-500"
                placeholder="Введите пароль"
              />
              {form.formState.errors.password && (
                <p className="text-red-400 text-xs mt-1" role="alert">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>
            {!isLogin && (
              <div className="space-y-1">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-white">
                  Подтвердите пароль
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  {...form.register('confirmPassword')}
                  className="block w-full px-4 py-3 border border-neutral-600 rounded-lg shadow-sm placeholder-neutral-500 bg-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-neutral-500"
                  placeholder="Подтвердите пароль"
                />
                {form.formState.errors.confirmPassword && (
                  <p className="text-red-400 text-xs mt-1" role="alert">
                    {form.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
            )}
          </div>
          
          {error && (
            <div className="bg-red-500/20 backdrop-blur-sm border border-red-400/50 text-red-200 px-4 py-3 rounded-xl text-sm flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
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

          <div>
            <button
              type="submit"
              disabled={loading || isSubmitting}
              className={`glass-btn w-full flex justify-center items-center gap-2 py-3 px-4 text-sm font-medium disabled:opacity-50 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] ${
                isSubmitting ? 'animate-pulse' : ''
              }`}
            >
              {loading || isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  {loginSuccess ? 'Успешно!' : (isLogin ? 'Вход..' : 'Регистрация..')}
                </>
              ) : (
                isLogin ? 'Войти' : 'Зарегистрироваться'
              )}
            </button>
          </div>
          {isCheckingAuth ? (
            <div className="text-center">
              <div className="flex items-center justify-center text-neutral-400 text-sm">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-300 mr-2"></div>
                Проверка статуса...
              </div>
            </div>
          ) : !authState.adminExists ? (
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setIsTransitioning(true);
                  setTimeout(() => {
                    setIsLogin(!isLogin);
                    setError('');
                    form.reset();
                    setIsTransitioning(false);
                  }, 300);
                }}
                className="text-sky-300 hover:underline text-sm font-medium transition-colors duration-200"
              >
                {isLogin 
                  ? "Нет аккаунта? Зарегистрироваться" 
                  : "Уже есть аккаунт? Войти"
                }
              </button>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
