'use client';

import Link from 'next/link';

export default function PanelSelection() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4 text-neutral-100">
      <div className="w-full max-w-4xl">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Admin Panel Button */}
          <Link
            href="/ui/panel/admin"
            className="relative block h-64 rounded-xl border border-neutral-800 bg-neutral-900 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
          >
            <div className="absolute left-2 top-2 z-10 rounded-md bg-blue-600/80 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
              Root
            </div>
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-blue-500/20">
                <svg
                  className="h-8 w-8 text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <h2 className="mb-2 text-xl font-semibold text-white">Панель администратора</h2>
              <p className="text-sm text-neutral-400">Управление пользователями и настройками</p>
            </div>
          </Link>

          {/* Support Panel Button */}
          <Link
            href="/ui/panel/support"
            className="block h-64 rounded-xl border border-neutral-800 bg-neutral-900 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
          >
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-green-500/20">
                <svg
                  className="h-8 w-8 text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
              </div>
              <h2 className="mb-2 text-xl font-semibold text-white">Панель поддержки</h2>
              <p className="text-sm text-neutral-400">Работа c тикетами пользователей</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
