'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { trpc } from '@/lib/trpc/client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import dynamic from 'next/dynamic';
// Heavy WebGL background; load on client only.
const AuroraBackground = dynamic(() => import('@/components/ui/AuroraBackground'), {
  ssr: false,
  loading: () => null,
});
import { translateError } from '@/lib/utils/error-translations';
import { ERROR_NETWORK, ERROR_POPUP_BLOCKED } from '@/lib/utils/constants';
import {
  adminAuthSchema,
  adminRegisterSchema,
  type AdminAuthFormData,
  type AdminRegisterFormData,
} from '@/lib/validation/schemas';

interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  adminExists: boolean;
}

interface AdminAuthFormProps {
  initialAuthState?: AuthState;
  onAuthSuccess?: () => void;
}

export default function AdminAuthForm({ initialAuthState, onAuthSuccess }: AdminAuthFormProps) {
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
  const [authState, setAuthState] = useState<AuthState>(
    initialAuthState ?? {
      isAuthenticated: false,
      username: null,
      adminExists: false,
    },
  );
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(!initialAuthState);

  const { data: csrfData } = trpc.auth.csrf.useQuery({ scope: 'admin' });
  const csrfToken = csrfData?.csrfToken ?? '';

  // Update form resolver when switching between login/register
  useEffect(() => {
    form.clearErrors();
    if (isLogin) {
      form.reset({ username: '', password: '', confirmPassword: '', csrfToken: '' });
    } else {
      form.reset({ username: '', password: '', confirmPassword: '', csrfToken: '' });
    }
  }, [isLogin, form]);

  const adminCheck = trpc.admin.check.useQuery(undefined, {
    enabled: !initialAuthState,
  });

  useEffect(() => {
    if (adminCheck.data) {
      setAuthState(adminCheck.data);
      setIsCheckingAuth(false);
    }
  }, [adminCheck.data]);

  const checkAuthStatus = async () => {
    setIsCheckingAuth(true);
    try {
      const result = await adminCheck.refetch();
      if (result.data) {
        setAuthState(result.data);
      }
    } finally {
      setIsCheckingAuth(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setShowForm(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const loginMutation = trpc.auth.login.useMutation();
  const registerMutation = trpc.auth.register.useMutation();

  const handleSubmit = async (data: AdminAuthFormData | AdminRegisterFormData) => {
    setLoading(true);
    setIsSubmitting(true);
    setError('');

    try {
      if (isLogin) {
        const responseData = await loginMutation.mutateAsync({
          scope: 'admin',
          username: data.username,
          password: data.password,
          csrfToken,
        });

        setAuthState({
          isAuthenticated: true,
          username: 'username' in responseData ? responseData.username : data.username,
          adminExists: true,
        });
        setLoginSuccess(true);
        setError('');

        if (onAuthSuccess) {
          onAuthSuccess();
        } else {
          window.location.href = '/ui/panel/admin';
        }
      } else {
        await registerMutation.mutateAsync({
          scope: 'admin',
          username: data.username,
          password: data.password,
          confirmPassword: (data as AdminRegisterFormData).confirmPassword,
          csrfToken,
        });

        setError('');
        setIsTransitioning(true);
        setTimeout(() => {
          setIsLogin(true);
          form.reset();
          setIsTransitioning(false);
          alert('Запись успешно создана. Войдите в систему.');
        }, 300);
      }
    } catch (err) {
      console.error('Auth error:', err);
      const message = err instanceof Error ? err.message : ERROR_NETWORK;
      setError(translateError(message));
      setLoginSuccess(false);
    } finally {
      setLoading(false);
      setIsSubmitting(false);
    }
  };

  if (authState.adminExists) {
    return (
      <div
        className="relative flex min-h-screen items-center justify-center px-4 sm:px-6 lg:px-8"
        style={{ backgroundColor: '#060010' }}
      >
        <AuroraBackground
          colorStops={['#3B82F6', '#6366F1', '#4F46E5']}
          amplitude={0.3}
          blend={0.5}
          speed={1.0}
        />
        <div
          className={`relative z-10 w-full max-w-md space-y-8 rounded-2xl border border-neutral-800/50 bg-neutral-900/40 p-6 shadow-lg backdrop-blur-md transition-all duration-700 ease-out sm:p-8 ${
            showForm ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-8 scale-95 opacity-0'
          } ${isTransitioning ? 'scale-95 opacity-50' : ''}`}
        >
          <div
            className={`text-center transition-all duration-300 ease-in-out ${
              isTransitioning ? 'scale-95 transform opacity-0' : 'scale-100 transform opacity-100'
            }`}
          >
            {/* Logo */}
            <div className="mb-6 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center">
                <Image
                  src="/static/logo.svg"
                  alt="RVN Logo"
                  width={256}
                  height={256}
                  className="h-full w-full object-contain"
                  priority
                  placeholder="empty"
                />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-white sm:text-3xl">Raven Team</h2>
            <p className="mt-2 text-sm text-white/70 sm:text-base">
              Войдите в систему для доступа к панели
            </p>
          </div>
          <form
            className={`mt-8 space-y-6 transition-all duration-300 ease-in-out ${
              isTransitioning
                ? 'translate-y-4 transform opacity-0'
                : 'translate-y-0 transform opacity-100'
            }`}
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <div className="space-y-1">
              <label htmlFor="username" className="block text-sm font-medium text-white">
                Логин
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                {...form.register('username')}
                className="w-full rounded-xl border border-neutral-700/60 bg-neutral-800/60 px-4 py-3 text-white transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Введите логин"
              />
              {form.formState.errors.username && (
                <p className="mt-1 text-xs text-red-400" role="alert">
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
                autoComplete="current-password"
                {...form.register('password')}
                className="w-full rounded-xl border border-neutral-700/60 bg-neutral-800/60 px-4 py-3 text-white transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Введите пароль"
              />
              {form.formState.errors.password && (
                <p className="mt-1 text-xs text-red-400" role="alert">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            {error && (
              <div className="flex items-center rounded-xl border border-red-400/50 bg-red-500/20 px-4 py-3 text-sm text-red-200 backdrop-blur-sm">
                <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {error}
              </div>
            )}

            {loginSuccess && (
              <div className="flex items-center rounded-xl border border-green-400/50 bg-green-500/20 px-4 py-3 text-sm text-green-200 backdrop-blur-sm">
                <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Вход выполнен успешно. Переход в панель..
              </div>
            )}

            <div className="space-y-3">
              <button
                type="submit"
                disabled={loading || isSubmitting}
                className={`glass-btn flex w-full transform items-center justify-center px-4 py-3 text-sm font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 ${
                  isSubmitting ? 'animate-pulse' : ''
                }`}
              >
                {loading || isSubmitting ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                    {loginSuccess ? 'Успешно!' : 'Вход..'}
                  </>
                ) : (
                  'Войти'
                )}
              </button>

              <div className="relative flex items-center">
                <div className="flex-grow border-t border-neutral-600"></div>
                <span className="px-3 text-sm text-neutral-400">или</span>
                <div className="flex-grow border-t border-neutral-600"></div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const width = 600;
                  const height = 700;
                  const left = (window.screen.width - width) / 2;
                  const top = (window.screen.height - height) / 2;

                  const popup = window.open(
                    '/api/admin/oauth/github?popup=true',
                    'GitHub OAuth',
                    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`,
                  );

                  if (!popup) {
                    setError(translateError(ERROR_POPUP_BLOCKED));
                    return;
                  }

                  // Listen for OAuth success
                  const checkClosed = setInterval(() => {
                    if (popup.closed) {
                      clearInterval(checkClosed);
                      // Check auth status after popup closes
                      setTimeout(() => {
                        checkAuthStatus();
                      }, 500);
                    }
                  }, 500);

                  // Listen for messages from popup
                  const messageHandler = (event: MessageEvent) => {
                    if (event.origin !== window.location.origin) return;
                    if (event.data.type === 'oauth-success') {
                      window.removeEventListener('message', messageHandler);
                      clearInterval(checkClosed);
                      setLoginSuccess(true);
                      setTimeout(() => {
                        checkAuthStatus();
                        if (onAuthSuccess) {
                          onAuthSuccess();
                        }
                      }, 500);
                    } else if (event.data.type === 'oauth-error') {
                      window.removeEventListener('message', messageHandler);
                      setError(translateError(event.data.error || 'oauth_error'));
                    }
                  };
                  window.addEventListener('message', messageHandler);
                }}
                disabled={loading || isSubmitting}
                className="flex w-full transform items-center justify-center gap-2 rounded-xl border border-neutral-700/60 bg-neutral-800/60 px-4 py-3 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.02] hover:border-neutral-600/60 hover:bg-neutral-700/60 active:scale-[0.98] disabled:opacity-50"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.532 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
                Login via GitHub
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-4 sm:px-6 lg:px-8"
      style={{ backgroundColor: '#060010' }}
    >
      <AuroraBackground
        colorStops={['#3B82F6', '#6366F1', '#4F46E5']}
        amplitude={0.3}
        blend={0.5}
        speed={1.0}
      />
      <div
        className={`relative z-10 w-full max-w-md space-y-8 rounded-2xl border border-neutral-800/50 bg-neutral-900/40 p-6 shadow-lg backdrop-blur-md transition-all duration-700 ease-out sm:p-8 ${
          showForm ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-8 scale-95 opacity-0'
        } ${isTransitioning ? 'scale-95 opacity-50' : ''}`}
      >
        <div
          className={`text-center transition-all duration-300 ease-in-out ${
            isTransitioning ? 'scale-95 transform opacity-0' : 'scale-100 transform opacity-100'
          }`}
        >
          {/* Logo */}
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center">
              <Image
                src="/static/logo.svg"
                alt="RVN Logo"
                width={256}
                height={256}
                className="h-full w-full object-contain"
                priority
                placeholder="empty"
              />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            {isLogin ? 'Raven Team' : 'Welcome!'}
          </h2>
          <p className="mt-2 text-sm text-neutral-400 sm:text-base">
            {isLogin
              ? 'Войдите в систему для доступа к панели'
              : 'Создайте первый аккаунт для входа'}
          </p>
        </div>
        <form
          className={`mt-8 space-y-6 transition-all duration-300 ease-in-out ${
            isTransitioning
              ? 'translate-y-4 transform opacity-0'
              : 'translate-y-0 transform opacity-100'
          }`}
          onSubmit={form.handleSubmit(handleSubmit)}
        >
          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="username" className="block text-sm font-medium text-white">
                Логин
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                {...form.register('username')}
                className="block w-full rounded-lg border border-neutral-600 bg-neutral-700 px-4 py-3 text-white placeholder-neutral-500 shadow-sm transition-all duration-200 hover:border-neutral-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Введите логин"
              />
              {form.formState.errors.username && (
                <p className="mt-1 text-xs text-red-400" role="alert">
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
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                {...form.register('password')}
                className="block w-full rounded-lg border border-neutral-600 bg-neutral-700 px-4 py-3 text-white placeholder-neutral-500 shadow-sm transition-all duration-200 hover:border-neutral-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Введите пароль"
              />
              {form.formState.errors.password && (
                <p className="mt-1 text-xs text-red-400" role="alert">
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
                  autoComplete="new-password"
                  {...form.register('confirmPassword')}
                  className="block w-full rounded-lg border border-neutral-600 bg-neutral-700 px-4 py-3 text-white placeholder-neutral-500 shadow-sm transition-all duration-200 hover:border-neutral-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Подтвердите пароль"
                />
                {form.formState.errors.confirmPassword && (
                  <p className="mt-1 text-xs text-red-400" role="alert">
                    {form.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center rounded-xl border border-red-400/50 bg-red-500/20 px-4 py-3 text-sm text-red-200 backdrop-blur-sm">
              <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {error}
            </div>
          )}

          {loginSuccess && (
            <div className="flex items-center rounded-xl border border-green-400/50 bg-green-500/20 px-4 py-3 text-sm text-green-200 backdrop-blur-sm">
              <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Вход выполнен успешно! Переход в панель...
            </div>
          )}

          <div className="space-y-3">
            <button
              type="submit"
              disabled={loading || isSubmitting}
              className={`glass-btn flex w-full transform items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 ${
                isSubmitting ? 'animate-pulse' : ''
              }`}
            >
              {loading || isSubmitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                  {loginSuccess ? 'Успешно!' : isLogin ? 'Вход..' : 'Регистрация..'}
                </>
              ) : isLogin ? (
                'Войти'
              ) : (
                'Зарегистрироваться'
              )}
            </button>

            {isLogin && authState.adminExists && (
              <>
                <div className="relative flex items-center">
                  <div className="flex-grow border-t border-neutral-600"></div>
                  <span className="px-3 text-sm text-neutral-400">или</span>
                  <div className="flex-grow border-t border-neutral-600"></div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const width = 600;
                    const height = 700;
                    const left = (window.screen.width - width) / 2;
                    const top = (window.screen.height - height) / 2;

                    const popup = window.open(
                      '/api/admin/oauth/github?popup=true',
                      'GitHub OAuth',
                      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`,
                    );

                    if (!popup) {
                      setError(translateError(ERROR_POPUP_BLOCKED));
                      return;
                    }

                    // Listen for OAuth success
                    const checkClosed = setInterval(() => {
                      if (popup.closed) {
                        clearInterval(checkClosed);
                        // Check auth status after popup closes
                        setTimeout(() => {
                          checkAuthStatus();
                        }, 500);
                      }
                    }, 500);

                    // Listen for messages from popup
                    const messageHandler = (event: MessageEvent) => {
                      if (event.origin !== window.location.origin) return;
                      if (event.data.type === 'oauth-success') {
                        window.removeEventListener('message', messageHandler);
                        clearInterval(checkClosed);
                        setLoginSuccess(true);
                        setTimeout(() => {
                          checkAuthStatus();
                          if (onAuthSuccess) {
                            onAuthSuccess();
                          }
                        }, 500);
                      } else if (event.data.type === 'oauth-error') {
                        window.removeEventListener('message', messageHandler);
                        clearInterval(checkClosed);
                        setError(translateError(event.data.error || 'oauth_error'));
                      }
                    };
                    window.addEventListener('message', messageHandler);
                  }}
                  disabled={loading || isSubmitting}
                  className="flex w-full transform items-center justify-center gap-2 rounded-xl border border-neutral-700/60 bg-neutral-800/60 px-4 py-3 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.02] hover:border-neutral-600/60 hover:bg-neutral-700/60 active:scale-[0.98] disabled:opacity-50"
                >
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.532 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Login via GitHub
                </button>
              </>
            )}
          </div>
          {isCheckingAuth ? (
            <div className="text-center">
              <div className="flex items-center justify-center text-sm text-neutral-400">
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-sky-300"></div>
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
                className="text-sm font-medium text-sky-300 transition-colors duration-200 hover:underline"
              >
                {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
              </button>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
