'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  adminExists: boolean;
}

export default function AdminAuthForm() {
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
  const router = useRouter();

  useEffect(() => {
    checkAuthStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/check');
      const data = await response.json();
      setAuthState(data);
      
      if (data.isAuthenticated) {
        router.push('/ui/panel');
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    setError('');

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      
      if (!isLogin && formData.password !== formData.confirmPassword) {
        setError('Passwords do not match');
        setLoading(false);
        return;
      }

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
        // После успешного входа перенаправляем
        router.push('/ui/panel');
      } else {
        // После регистрации переключаемся на форму входа
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
              <img 
                src="/static/logo.svg" 
                alt="Raven Private Logo" 
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
                onClick={() => router.push('/ui/panel')}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Перейти в админ панель
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-900">
      <div className="max-w-md w-full space-y-8 p-8 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl">
        <div className="text-center">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 flex items-center justify-center">
              <img 
                src="/static/logo.svg" 
                alt="Raven Private Logo" 
                className="w-full h-full object-contain"
              />
            </div>
          </div>
          
          <h2 className="text-3xl font-bold text-white">
            {isLogin ? 'Вход' : 'Регистрация'}
          </h2>
          <p className="mt-2 text-neutral-400">
            {isLogin 
              ? 'Войдите в систему для доступа к странице' 
              : 'Создайте первый аккаунт администратора'
            }
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-neutral-300">
                Имя пользователя
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={formData.username}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-3 border border-neutral-600 rounded-md shadow-sm placeholder-neutral-500 bg-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Введите имя пользователя"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-neutral-300">
                Пароль
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-3 border border-neutral-600 rounded-md shadow-sm placeholder-neutral-500 bg-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Введите пароль"
              />
            </div>

            {!isLogin && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-neutral-300">
                  Подтвердите пароль
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required={!isLogin}
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="mt-1 block w-full px-3 py-3 border border-neutral-600 rounded-md shadow-sm placeholder-neutral-500 bg-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Обработка...' : (isLogin ? 'Войти' : 'Зарегистрироваться')}
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
