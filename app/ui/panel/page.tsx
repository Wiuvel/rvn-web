'use client';

import { useState, useEffect } from 'react';
import AdminAuthForm from '@/components/AdminAuthForm';
import MagicBentoGrid from '@/components/ui/MagicBentoGrid';

interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  adminExists: boolean;
}

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    username: null,
    adminExists: false
  });
  const [loading, setLoading] = useState(true);
  const [showPanel, setShowPanel] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  useEffect(() => {
    if (authState.isAuthenticated) {
      const timer = setTimeout(() => setShowPanel(true), 100);
      return () => clearTimeout(timer);
    } else {
      setShowPanel(false);
    }
  }, [authState.isAuthenticated]);

  // Закрытие мобильного меню при изменении размера экрана
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/check');
      const data = await response.json();
      setAuthState(data);
    } catch (error) {
      console.error('Error checking auth status:', error);
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
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-neutral-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!authState.isAuthenticated) {
    return <AdminAuthForm onAuthSuccess={checkAuthStatus} />;
  }

  const tabs = [
    { id: 'dashboard', name: 'Обзор', icon: '📊' },
    { id: 'users', name: 'Пользователи', icon: '👥' },
    { id: 'servers', name: 'Серверы', icon: '🖥️' },
    { id: 'analytics', name: 'Аналитика', icon: '📈' },
    { id: 'settings', name: 'Настройки', icon: '⚙️' },
  ];

  return (
    <div className={`flex h-screen transition-all duration-700 ease-out ${
      showPanel ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
    }`}> 
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-50 md:z-auto
        w-64 bg-neutral-900 border-r border-neutral-800 flex flex-col
        transform transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Header */}
        <div className="p-6 border-b border-neutral-800">
          <div className="flex items-center space-x-3">
            <div>
              <h1 className="text-lg font-semibold text-white">Raven Private</h1>
              <p className="text-xs text-neutral-400">NextJS 15.5.3 / React 19.1.0</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                // Закрываем мобильное меню при выборе вкладки
                if (window.innerWidth < 768) {
                  setMobileMenuOpen(false);
                }
              }}
              className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg text-left transition-all duration-200 touch-manipulation ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-neutral-300 hover:bg-neutral-800 hover:text-white active:bg-neutral-700'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="font-medium text-sm sm:text-base">{tab.name}</span>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800">
          <div className="text-xs text-neutral-500">
            <p>Версия: 1.0.0</p>
            <p>Последний вход: сегодня</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:ml-0">
        {/* Top Bar */}
        <header className="bg-neutral-900 border-b border-neutral-800 px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors touch-manipulation"
                aria-label="Открыть меню"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              <h2 className="text-lg sm:text-xl font-semibold text-white capitalize">
                {tabs.find(tab => tab.id === activeTab)?.name}
              </h2>
            </div>
            
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="hidden sm:block text-sm text-neutral-400">
                {authState.username}
              </div>
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                {authState.username?.charAt(0).toUpperCase() || 'A'}
              </div>
              <button
                onClick={handleLogout}
                className="px-3 py-2 text-sm text-neutral-400 hover:text-white border border-neutral-600 hover:border-neutral-500 rounded-lg transition-colors touch-manipulation active:bg-neutral-800"
              >
                <span className="hidden sm:inline">Выйти</span>
                <span className="sm:hidden">🚪</span>
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <MagicBentoGrid />
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 sm:p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Управление пользователями</h3>
                <div className="h-64 sm:h-96 bg-neutral-800 rounded flex items-center justify-center">
                  <p className="text-neutral-400 text-sm sm:text-base">Таблица пользователей</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'servers' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 sm:p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Управление серверами</h3>
                <div className="h-64 sm:h-96 bg-neutral-800 rounded flex items-center justify-center">
                  <p className="text-neutral-400 text-sm sm:text-base">Список серверов</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 sm:p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Аналитика и отчеты</h3>
                <div className="h-64 sm:h-96 bg-neutral-800 rounded flex items-center justify-center">
                  <p className="text-neutral-400 text-sm sm:text-base">Аналитические данные</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 sm:p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Настройки системы</h3>
                <div className="h-64 sm:h-96 bg-neutral-800 rounded flex items-center justify-center">
                  <p className="text-neutral-400 text-sm sm:text-base">Настройки</p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
