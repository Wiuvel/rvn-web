'use client';

import Link from 'next/link';

export default function PanelSelection() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Admin Panel Button */}
          <Link
            href="/ui/panel/admin"
            prefetch={false}
            className="block h-64 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 hover:border-neutral-700 transition-colors relative"
          >
            <div className="absolute top-2 left-2 px-2 py-1 bg-blue-600/80 text-white text-xs font-medium rounded-md backdrop-blur-sm z-10">
              Root
            </div>
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">
                Панель администратора
              </h2>
              <p className="text-sm text-neutral-400">
                Управление пользователями и настройками
              </p>
            </div>
          </Link>

          {/* Support Panel Button */}
          <Link
            href="/ui/panel/support"
            prefetch={false}
            className="block h-64 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 hover:border-neutral-700 transition-colors"
          >
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-green-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">
                Панель поддержки
              </h2>
              <p className="text-sm text-neutral-400">
                Работа c тикетами пользователей
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
