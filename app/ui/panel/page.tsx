'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const tabs = [
    { id: 'dashboard', name: 'Обзор', icon: '📊' },
    { id: 'users', name: 'Пользователи', icon: '👥' },
    { id: 'servers', name: 'Серверы', icon: '🖥️' },
    { id: 'analytics', name: 'Аналитика', icon: '📈' },
    { id: 'settings', name: 'Настройки', icon: '⚙️' },
  ];

  const stats = [
    { title: 'Всего пользователей', value: '0', change: '0%', trend: 'up' },
    { title: 'Активные сессии', value: '0', change: '0%', trend: 'up' },
    { title: 'Серверы онлайн', value: '0/0', change: '0%', trend: 'stable' },
    { title: 'Трафик за день', value: '0 GB', change: '0%', trend: 'up' },
  ];

  return (
    <div className="flex h-screen"> 
      {/* Sidebar */}
      <div className="w-64 bg-neutral-900 border-r border-neutral-800 flex flex-col">
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
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="font-medium">{tab.name}</span>
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
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <header className="bg-neutral-900 border-b border-neutral-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white capitalize">
              {tabs.find(tab => tab.id === activeTab)?.name}
            </h2>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-neutral-400">
                Администратор
              </div>
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                A
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-6 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, index) => (
                  <div key={index} className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-neutral-400">{stat.title}</p>
                        <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                      </div>
                      <div className={`text-sm ${
                        stat.trend === 'up' ? 'text-green-400' : 
                        stat.trend === 'down' ? 'text-red-400' : 
                        'text-neutral-400'
                      }`}>
                        {stat.change}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Charts Placeholder */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Активность пользователей</h3>
                  <div className="h-64 bg-neutral-800 rounded flex items-center justify-center">
                    <p className="text-neutral-400">График активности</p>
                  </div>
                </div>
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Использование серверов</h3>
                  <div className="h-64 bg-neutral-800 rounded flex items-center justify-center">
                    <p className="text-neutral-400">График серверов</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Управление пользователями</h3>
                <div className="h-96 bg-neutral-800 rounded flex items-center justify-center">
                  <p className="text-neutral-400">Таблица пользователей</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'servers' && (
            <div className="space-y-6">
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Управление серверами</h3>
                <div className="h-96 bg-neutral-800 rounded flex items-center justify-center">
                  <p className="text-neutral-400">Список серверов</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Аналитика и отчеты</h3>
                <div className="h-96 bg-neutral-800 rounded flex items-center justify-center">
                  <p className="text-neutral-400">Аналитические данные</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Настройки системы</h3>
                <div className="h-96 bg-neutral-800 rounded flex items-center justify-center">
                  <p className="text-neutral-400">Настройки</p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
