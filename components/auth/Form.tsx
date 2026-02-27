'use client';

import { useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { translateError } from '@/lib/utils/error-translations';
import { ERROR_NETWORK } from '@/lib/utils/constants';
import { getOAuthErrorMessage } from '@/lib/utils/oauth-errors';
import {
  loginSchema,
  registerSchema,
  type LoginFormData,
  type RegisterFormData,
} from '@/lib/validation/schemas';
import { calculatePasswordStrength } from '@/lib/utils/password';
import { useRateLimitedFetch } from '@/hooks/useRateLimitedFetch';
import { useAuthForm } from '@/hooks/useAuthForm';
import { OAuthButtons } from './OAuthButtons';
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator';
import { EyeOff as EyeNoneIcon, Eye as EyeOpenIcon } from 'lucide-react';

interface WindowWithPopup extends Window {
  __lastPopup?: Window & {
    __checkInterval?: NodeJS.Timeout;
  };
}

// Lazy load RateLimitCaptcha для оптимизации bundle size
const RateLimitCaptcha = dynamic(() => import('@/components/auth/RateLimitCaptcha'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl sm:p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-white/20 border-t-white"></div>
          <p className="text-sm text-neutral-400">Загрузка капчи..</p>
        </div>
      </div>
    </div>
  ),
});

interface AuthFormProps {
  retpatch?: string;
  initialError?: string;
}

export default function AuthForm({ retpatch = '/dashboard/', initialError }: AuthFormProps) {
  const { state, dispatch } = useAuthForm();

  const { showRateLimitCaptcha, fetchWithRateLimit, handleRateLimitSuccess, handleRateLimitClose } =
    useRateLimitedFetch();

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '', csrfToken: '' },
    mode: 'onChange',
  });

  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: '', password: '', confirmPassword: '', csrfToken: '' },
    mode: 'onChange',
  });

  const handleRegisterPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const password = e.target.value;
    if (password) {
      const strength = calculatePasswordStrength(password);
      dispatch({
        type: 'SET_PASSWORD_VALID',
        payload: { form: 'register', isValid: strength.score > 0 },
      });
      dispatch({
        type: 'SET_SHOW_PASSWORD_STRENGTH',
        payload: { form: 'register', show: strength.score > 0 },
      });
    } else {
      dispatch({ type: 'SET_PASSWORD_VALID', payload: { form: 'register', isValid: false } });
      dispatch({ type: 'SET_SHOW_PASSWORD_STRENGTH', payload: { form: 'register', show: false } });
    }
  };

  const handleLoginPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const password = e.target.value;
    if (password) {
      const strength = calculatePasswordStrength(password);
      dispatch({
        type: 'SET_PASSWORD_VALID',
        payload: { form: 'login', isValid: strength.score > 0 },
      });
      dispatch({
        type: 'SET_SHOW_PASSWORD_STRENGTH',
        payload: { form: 'login', show: strength.score > 0 },
      });
    } else {
      dispatch({ type: 'SET_PASSWORD_VALID', payload: { form: 'login', isValid: false } });
      dispatch({ type: 'SET_SHOW_PASSWORD_STRENGTH', payload: { form: 'login', show: false } });
    }
  };

  const registerPassword = registerForm.watch('password');

  const fetchCsrfToken = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch('/api/auth/csrf', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Failed to fetch CSRF token');
      const data = await response.json();
      const token = data?.csrfToken || '';
      dispatch({ type: 'SET_CSRF_TOKEN', payload: token });
      return token;
    } catch (error) {
      console.error('CSRF token fetch error:', error);
      dispatch({ type: 'SET_CSRF_TOKEN', payload: '' });
      dispatch({ type: 'SET_GLOBAL_ERROR', payload: 'Не удалось получить токен безопасности.' });
      return null;
    }
  }, [dispatch]);

  const handleRegister = async (data: RegisterFormData) => {
    const tokenToUse = state.csrfToken || (await fetchCsrfToken());
    if (!tokenToUse) return;

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_GLOBAL_ERROR', payload: '' });

    const performRegister = async () => {
      try {
        const response = await fetchWithRateLimit(
          '/api/auth/register',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: escapeHtml(data.username),
              password: data.password,
              confirmPassword: data.confirmPassword,
              csrfToken: tokenToUse,
            }),
          },
          performRegister,
        );

        const responseData = await response.json();
        if (response.ok) {
          window.location.href = `/dashboard/${responseData.user_id}`;
        } else {
          const translatedError = translateError(responseData.error || 'Ошибка регистрации');
          dispatch({ type: 'SET_GLOBAL_ERROR', payload: escapeHtml(translatedError) });
          if (response.status === 403) fetchCsrfToken();
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
          dispatch({ type: 'SET_LOADING', payload: false });
        } else {
          dispatch({ type: 'SET_GLOBAL_ERROR', payload: translateError(ERROR_NETWORK) });
          fetchCsrfToken();
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      }
    };

    await performRegister();
  };

  const handleLogin = async (data: LoginFormData) => {
    const tokenToUse = state.csrfToken || (await fetchCsrfToken());
    if (!tokenToUse) return;

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_LOGIN_ATTEMPT_STATE', payload: 'idle' });
    dispatch({ type: 'SET_GLOBAL_ERROR', payload: '' });

    const performLogin = async () => {
      try {
        const response = await fetchWithRateLimit(
          '/api/auth/login',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: escapeHtml(data.username),
              password: data.password,
              csrfToken: tokenToUse,
            }),
          },
          performLogin,
        );

        const responseData = await response.json();
        if (response.ok) {
          window.location.href =
            retpatch && retpatch !== '/dashboard/'
              ? retpatch
              : `/dashboard/${responseData.user_id}`;
        } else {
          dispatch({ type: 'SET_LOGIN_ATTEMPT_STATE', payload: 'error' });
          const translatedError = translateError(responseData.error || 'Ошибка входа');
          dispatch({ type: 'SET_GLOBAL_ERROR', payload: escapeHtml(translatedError) });
          if (response.status === 403) fetchCsrfToken();
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
          dispatch({ type: 'SET_LOADING', payload: false });
        } else {
          dispatch({ type: 'SET_LOGIN_ATTEMPT_STATE', payload: 'error' });
          dispatch({ type: 'SET_GLOBAL_ERROR', payload: translateError(ERROR_NETWORK) });
          fetchCsrfToken();
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      }
    };

    await performLogin();
  };

  const oauthLogin = async (provider: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ACTIVE_PROVIDER', payload: provider });

    let timeoutId: NodeJS.Timeout | null = null;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (event.data.type === 'OAUTH_SUCCESS') {
        const win = window as WindowWithPopup;
        if (win.__lastPopup?.__checkInterval) clearInterval(win.__lastPopup.__checkInterval);

        window.removeEventListener('message', handleMessage);
        dispatch({ type: 'SET_LOADING', payload: false });
        dispatch({ type: 'SET_POPUP_OPEN', payload: false });
        dispatch({ type: 'SET_ACTIVE_PROVIDER', payload: null });

        if (event.data.redirect) {
          window.location.href = event.data.redirect;
        } else if (event.data.user_id) {
          window.location.href = `/dashboard/${event.data.user_id}`;
        }
      } else if (event.data.type === 'OAUTH_ERROR') {
        const win = window as WindowWithPopup;
        if (win.__lastPopup?.__checkInterval) clearInterval(win.__lastPopup.__checkInterval);

        window.removeEventListener('message', handleMessage);
        dispatch({ type: 'SET_LOADING', payload: false });
        dispatch({ type: 'SET_POPUP_OPEN', payload: false });
        dispatch({ type: 'SET_ACTIVE_PROVIDER', payload: null });
        dispatch({
          type: 'SET_GLOBAL_ERROR',
          payload: event.data.error || getOAuthErrorMessage('unknown_error'),
        });
      }
    };

    window.addEventListener('message', handleMessage);

    try {
      const width = 500;
      const height = 600;
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;

      const popup = window.open(
        `/auth/oauth-handler?provider=${provider}`,
        `${provider}_oauth`,
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
      );

      if (!popup) {
        dispatch({ type: 'SET_LOADING', payload: false });
        dispatch({ type: 'SET_ACTIVE_PROVIDER', payload: null });
        dispatch({ type: 'SET_GLOBAL_ERROR', payload: getOAuthErrorMessage('popup_blocked') });
        window.removeEventListener('message', handleMessage);
        return;
      }

      const win = window as WindowWithPopup;
      win.__lastPopup = popup as Window & { __checkInterval?: NodeJS.Timeout };
      dispatch({ type: 'SET_POPUP_OPEN', payload: true });

      const checkPopupClosed = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(checkPopupClosed);
            if (timeoutId) clearTimeout(timeoutId);
            window.removeEventListener('message', handleMessage);
            dispatch({ type: 'SET_LOADING', payload: false });
            dispatch({ type: 'SET_POPUP_OPEN', payload: false });
            dispatch({ type: 'SET_ACTIVE_PROVIDER', payload: null });
          }
        } catch {}
      }, 500);

      if (win.__lastPopup) win.__lastPopup.__checkInterval = checkPopupClosed;

      timeoutId = setTimeout(
        () => {
          clearInterval(checkPopupClosed);
          window.removeEventListener('message', handleMessage);
          dispatch({ type: 'SET_LOADING', payload: false });
          dispatch({ type: 'SET_POPUP_OPEN', payload: false });
          dispatch({ type: 'SET_ACTIVE_PROVIDER', payload: null });
          dispatch({ type: 'SET_GLOBAL_ERROR', payload: getOAuthErrorMessage('popup_timeout') });
        },
        10 * 60 * 1000,
      );
    } catch {
      dispatch({ type: 'SET_GLOBAL_ERROR', payload: getOAuthErrorMessage('network_error') });
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_ACTIVE_PROVIDER', payload: null });
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
    dispatch({ type: 'RESET_FORM' });
  };

  const switchTab = (tab: 'login' | 'register') => {
    if (tab === state.currentTab) return;

    dispatch({ type: 'SET_TRANSITIONING', payload: true });
    setTimeout(() => {
      dispatch({ type: 'SET_TAB', payload: tab });
      resetForm();
      dispatch({ type: 'SET_TRANSITIONING', payload: false });
    }, 150);
  };

  useEffect(() => {
    fetchCsrfToken();
  }, [fetchCsrfToken]);

  useEffect(() => {
    if (initialError) {
      const errorMessage = getOAuthErrorMessage(initialError) || translateError(initialError);
      dispatch({ type: 'SET_GLOBAL_ERROR', payload: errorMessage });
    }
  }, [initialError, dispatch]);

  return (
    <>
      <div className="mx-auto w-full max-w-md">
        <div
          className={`animate-fadeIn overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/80 p-8 shadow-lg backdrop-blur-md transition-all duration-150 ease-out ${
            state.isTransitioning ? 'scale-95 opacity-50' : ''
          }`}
        >
          <h2
            className={`mb-6 text-center text-2xl font-semibold transition-all duration-150 ease-in-out ${
              state.isTransitioning
                ? 'scale-95 transform opacity-0'
                : 'scale-100 transform opacity-100'
            }`}
          >
            {state.currentTab === 'register' ? 'Регистрация' : 'Вход'}
          </h2>

          {state.currentTab === 'register' && (
            <form
              onSubmit={registerForm.handleSubmit(handleRegister)}
              className={`space-y-4 transition-all duration-150 ease-in-out ${
                state.isTransitioning
                  ? 'translate-y-4 transform opacity-0'
                  : 'translate-y-0 transform opacity-100'
              }`}
            >
              <label className="block">
                <span className="sr-only">Логин</span>
                <input
                  type="text"
                  {...registerForm.register('username')}
                  placeholder="Логин"
                  autoComplete="username"
                  disabled={state.isPopupOpen}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              {registerForm.formState.errors.username && (
                <p className="mt-1 text-xs text-red-500" role="alert">
                  {registerForm.formState.errors.username.message}
                </p>
              )}

              <div className="relative">
                <label className="block">
                  <span className="sr-only">Пароль</span>
                  <input
                    type={state.showPassword.register ? 'text' : 'password'}
                    {...registerForm.register('password', {
                      onChange: handleRegisterPasswordChange,
                    })}
                    placeholder="Пароль"
                    autoComplete="new-password"
                    disabled={state.isPopupOpen}
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 pr-10 text-white disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'TOGGLE_SHOW_PASSWORD', payload: 'register' })}
                  className="pass-toggle absolute right-3 top-3.5 text-gray-500 hover:text-gray-700"
                  aria-label={state.showPassword.register ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {state.showPassword.register ? (
                    <EyeNoneIcon className="h-6 w-6 transition hover:brightness-75" />
                  ) : (
                    <EyeOpenIcon className="h-6 w-6 transition hover:brightness-75" />
                  )}
                </button>
              </div>

              {state.showPasswordStrength.register && !registerForm.watch('confirmPassword') && (
                <PasswordStrengthIndicator password={registerPassword} />
              )}

              {registerForm.formState.errors.password && (
                <p className="mt-1 text-xs text-red-500" role="alert">
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
                  disabled={!state.isPasswordValid.register || state.isPopupOpen}
                  className={`w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-white disabled:cursor-not-allowed ${
                    state.isPasswordValid.register && !state.isPopupOpen
                      ? 'opacity-100'
                      : 'opacity-50'
                  }`}
                />
              </label>
              {registerForm.formState.errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-500" role="alert">
                  {registerForm.formState.errors.confirmPassword.message}
                </p>
              )}

              <div className="flex select-none justify-center">
                <p className="text-center text-xs text-neutral-400">
                  Нажимая ‹Зарегистрироваться›, вы принимаете{' '}
                  <Link
                    href="/legal/terms/"
                    target="_blank"
                    rel="noopener noreferrer"
                    prefetch={false}
                    className="text-blue-400 transition-colors hover:text-blue-300 hover:underline"
                  >
                    Пользовательское соглашение
                  </Link>{' '}
                  и{' '}
                  <Link
                    href="/legal/privacy/"
                    target="_blank"
                    rel="noopener noreferrer"
                    prefetch={false}
                    className="text-blue-400 transition-colors hover:text-blue-300 hover:underline"
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
                  disabled={state.isLoading || state.isPopupOpen}
                >
                  {state.isLoading && !state.activeProvider && <span className="spinner"></span>}
                  <span>
                    {state.isLoading && !state.activeProvider ? 'Отправка..' : 'Зарегистрироваться'}
                  </span>
                </button>
              </div>

              {state.globalError && (
                <p
                  className={`auth-feedback ${state.globalError ? 'visible' : ''}`}
                  role="alert"
                  aria-live="assertive"
                >
                  {state.globalError}
                </p>
              )}

              <div className="divider">
                <span className="text-neutral-400">или авторизация через</span>
              </div>

              <OAuthButtons
                isLoading={state.isLoading}
                isPopupOpen={state.isPopupOpen}
                activeProvider={state.activeProvider}
                onOAuthLogin={oauthLogin}
              />

              <div className="mt-4">
                <p className="text-center text-sm">
                  <span className="font-semibold text-neutral-400 underline underline-offset-4">
                    Уже есть аккаунт?
                  </span>{' '}
                  <button
                    type="button"
                    onClick={() => switchTab('login')}
                    className="rounded bg-white/10 px-1.5 py-0.5 font-medium text-white transition-colors hover:bg-white/15 sm:px-2"
                  >
                    Вход
                  </button>
                </p>
              </div>
            </form>
          )}

          {state.currentTab === 'login' && (
            <form
              onSubmit={loginForm.handleSubmit(handleLogin)}
              className={`space-y-4 transition-all duration-150 ease-in-out ${
                state.isTransitioning
                  ? 'translate-y-4 transform opacity-0'
                  : 'translate-y-0 transform opacity-100'
              }`}
            >
              <label className="block">
                <span className="sr-only">Логин</span>
                <input
                  type="text"
                  {...loginForm.register('username', {
                    onChange: () => {
                      if (state.globalError) dispatch({ type: 'SET_GLOBAL_ERROR', payload: '' });
                      if (state.loginAttemptState === 'error')
                        dispatch({ type: 'SET_LOGIN_ATTEMPT_STATE', payload: 'idle' });
                    },
                  })}
                  placeholder="Логин"
                  autoComplete="username"
                  disabled={state.isPopupOpen}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              {loginForm.formState.errors.username && (
                <p className="mt-1 text-xs text-red-500" role="alert">
                  {loginForm.formState.errors.username.message}
                </p>
              )}

              <div className="relative">
                <label className="block">
                  <span className="sr-only">Пароль</span>
                  <input
                    type={state.showPassword.login ? 'text' : 'password'}
                    {...loginForm.register('password', {
                      onChange: (e) => {
                        if (state.globalError) dispatch({ type: 'SET_GLOBAL_ERROR', payload: '' });
                        if (state.loginAttemptState === 'error')
                          dispatch({ type: 'SET_LOGIN_ATTEMPT_STATE', payload: 'idle' });
                        handleLoginPasswordChange(e);
                      },
                    })}
                    placeholder="Пароль"
                    autoComplete="current-password"
                    disabled={state.isPopupOpen}
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 pr-10 text-white disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'TOGGLE_SHOW_PASSWORD', payload: 'login' })}
                  className="pass-toggle absolute right-3 top-3.5 text-gray-500 hover:text-gray-700"
                  aria-label={state.showPassword.login ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {state.showPassword.login ? (
                    <EyeNoneIcon className="h-6 w-6 transition hover:brightness-75" />
                  ) : (
                    <EyeOpenIcon className="h-6 w-6 transition hover:brightness-75" />
                  )}
                </button>
              </div>
              {loginForm.formState.errors.password && (
                <p className="mt-1 text-xs text-red-500" role="alert">
                  {loginForm.formState.errors.password.message}
                </p>
              )}

              <div className="flex select-none justify-center">
                <p className="text-center text-xs text-neutral-400">
                  Нажимая ‹Войти›, вы принимаете{' '}
                  <Link
                    href="/legal/terms/"
                    target="_blank"
                    rel="noopener noreferrer"
                    prefetch={false}
                    className="text-blue-400 transition-colors hover:text-blue-300 hover:underline"
                  >
                    Пользовательское соглашение
                  </Link>{' '}
                  и{' '}
                  <Link
                    href="/legal/privacy/"
                    target="_blank"
                    rel="noopener noreferrer"
                    prefetch={false}
                    className="text-blue-400 transition-colors hover:text-blue-300 hover:underline"
                  >
                    Политику конфиденциальности
                  </Link>
                  .
                </p>
              </div>

              <div className="flex justify-center">
                <button
                  type="submit"
                  className={`glass-btn ${state.loginAttemptState === 'error' ? 'btn-shake' : ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900`}
                  disabled={state.isLoading || state.isPopupOpen}
                >
                  {state.isLoading && !state.activeProvider && <span className="spinner"></span>}
                  <span>{state.isLoading && !state.activeProvider ? 'Вход..' : 'Войти'}</span>
                </button>
              </div>

              {state.globalError && (
                <p
                  className={`auth-feedback ${state.globalError ? 'visible' : ''}`}
                  role="alert"
                  aria-live="assertive"
                >
                  {state.globalError}
                </p>
              )}

              <div className="divider">
                <span className="text-neutral-400">или авторизация через</span>
              </div>

              <OAuthButtons
                isLoading={state.isLoading}
                isPopupOpen={state.isPopupOpen}
                activeProvider={state.activeProvider}
                onOAuthLogin={oauthLogin}
              />

              <div className="mt-4">
                <p className="text-center text-sm">
                  <span className="font-semibold text-neutral-400 underline underline-offset-4">
                    Нет учетной записи?
                  </span>{' '}
                  <button
                    type="button"
                    onClick={() => switchTab('register')}
                    className="rounded bg-white/10 px-1.5 py-0.5 font-medium text-white transition-colors hover:bg-white/15 sm:px-2"
                  >
                    Регистрация
                  </button>
                </p>
              </div>
            </form>
          )}
        </div>
      </div>

      {showRateLimitCaptcha && (
        <RateLimitCaptcha
          isOpen={showRateLimitCaptcha}
          onSuccess={handleRateLimitSuccess}
          onClose={handleRateLimitClose}
        />
      )}
    </>
  );
}
