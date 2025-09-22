'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function DebugPage() {
  const [cookies, setCookies] = useState<Record<string, string>>({});
  const [currentUrl, setCurrentUrl] = useState('');

  useEffect(() => {
    // Парсим куки
    const cookieString = document.cookie;
    const cookieObj: Record<string, string> = {};
    
    cookieString.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        cookieObj[name] = decodeURIComponent(value);
      }
    });
    
    setCookies(cookieObj);
    setCurrentUrl(window.location.href);
  }, []);

  const clearAllCookies = () => {
    document.cookie.split(";").forEach((c) => {
      const eqPos = c.indexOf("=");
      const name = eqPos > -1 ? c.substr(0, eqPos) : c;
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    });
    window.location.reload();
  };

  const setTestCookies = () => {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const domain = isLocalhost ? '' : '.rvn.guru';
    const secure = isLocalhost ? '' : 'Secure';
    
    const cookieOptions = `path=/; max-age=7200; ${domain ? `domain=${domain}; ` : ''}${secure}; SameSite=Strict`;
    
    document.cookie = `access_granted=true; ${cookieOptions}`;
    document.cookie = `access_hash=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef; ${cookieOptions}`;
    document.cookie = `target_path=/auth; ${cookieOptions}`;
    
    console.log('Test cookies set for domain:', domain || 'localhost');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Debug - Состояние системы защиты</h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Текущий URL</h2>
          <p className="font-mono text-sm bg-gray-100 p-2 rounded">{currentUrl}</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Куки</h2>
          {Object.keys(cookies).length === 0 ? (
            <p className="text-gray-500">Нет куки</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(cookies).map(([name, value]) => (
                <div key={name} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="font-semibold">{name}:</span>
                  <span className="font-mono text-sm">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Действия</h2>
          <div className="space-x-4">
            <button
              onClick={setTestCookies}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
            >
              Установить тестовые куки
            </button>
            <button
              onClick={clearAllCookies}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
            >
              Очистить все куки
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Тестирование редиректов</h2>
          <div className="space-x-4">
            <Link
              href="/"
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded inline-block"
            >
              Тест главной страницы
            </Link>
            <Link
              href="/auth"
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded inline-block"
            >
              Тест страницы авторизации
            </Link>
            <Link
              href="/dashboard"
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded inline-block"
            >
              Тест дашборда
            </Link>
          </div>
        </div>

        <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mt-6">
          <h3 className="text-lg font-semibold text-yellow-800">Информация о защите</h3>
          <p className="text-yellow-700 mt-2">
            Эта страница (/debug) исключена из системы защиты и доступна без прохождения капчи.
            Все остальные страницы сайта требуют прохождения защиты.
          </p>
        </div>
      </div>
    </div>
  );
}