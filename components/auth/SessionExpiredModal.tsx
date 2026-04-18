'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { AlertTriangle } from 'lucide-react';

export default function SessionExpiredModal() {
  const pathname = usePathname();
  const isAdminPanel = pathname?.startsWith('/ui/panel');
  const { sessionExpired } = useAuth({
    silent: true,
    lightweight: isAdminPanel,
  });
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    /** Don't show expired-session modal on the login page itself */
    if (pathname === '/auth') {
      setIsOpen(false);
    } else {
      setIsOpen(sessionExpired);
    }
  }, [sessionExpired, pathname]);

  const handleLogin = () => {
    setIsOpen(false);
    window.location.href =
      '/auth?reason=session_expired&return_to=' + encodeURIComponent(window.location.pathname);
  };

  const handleHome = () => {
    setIsOpen(false);
    window.location.href = '/';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl">
        <div className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/10 text-yellow-500">
            <AlertTriangle className="h-8 w-8" />
          </div>

          <h2 className="mb-2 text-xl font-bold text-white">Сессия истекла</h2>
          <p className="mb-6 text-neutral-400">
            Ваша сессия завершена или недействительна. Пожалуйста, войдите снова, чтобы продолжить.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={handleHome}
              className="flex-1 rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 font-medium text-white transition-colors hover:bg-neutral-700"
            >
              На главную
            </button>
            <button
              onClick={handleLogin}
              className="flex-1 rounded-xl bg-primary-500 px-4 py-3 font-medium text-white shadow-lg shadow-primary-500/20 transition-all hover:bg-primary-400 hover:shadow-primary-500/30"
            >
              Войти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
