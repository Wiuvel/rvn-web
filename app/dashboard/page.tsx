'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useFadeIn, useStaggeredFadeIn } from '@/hooks/useGSAP';

export default function DashboardPage() {
  const [open, setOpen] = useState(false);
  const [currentYear] = useState(new Date().getFullYear());
  const titleRef = useFadeIn(0.1) as React.RefObject<HTMLDivElement>;
  const profileRef = useFadeIn(0.2) as React.RefObject<HTMLDivElement>;
  const cardsRef = useStaggeredFadeIn(0.3, 0.1) as React.RefObject<HTMLDivElement>;
  const serversRef = useFadeIn(0.4) as React.RefObject<HTMLDivElement>;
  const eventsRef = useFadeIn(0.5) as React.RefObject<HTMLDivElement>;
  
  return (
    <div className="dashboard-page">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 pt-4 z-[999]">
        <div className="mx-auto max-w-6xl px-4">
          <div className="backdrop-blur-lg bg-neutral-900/40 border border-white/10 rounded-full px-6 py-3 flex items-center justify-between shadow-lg">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/static/logo.svg" alt="Raven Logo" width={24} height={24} className="w-6 h-6" priority/>
              <span className="font-semibold text-white">Raven Private</span>
            </Link>
            <nav className="hidden lg:flex items-center gap-8 text-sm text-neutral-300">
              <Link href="/" className="hover:text-white transition">Главная</Link>
              <Link href="/auth/" className="hover:text-white transition">Профиль</Link>
            </nav>
            <div className="hidden lg:flex">
              <Link href="/auth/" className="rounded-xl bg-primary-500 hover:bg-primary-400 px-4 py-2 text-sm font-medium text-white shadow-glow transition">
                Выйти
              </Link>
            </div>
            <button 
              onClick={() => setOpen(!open)} className="lg:hidden p-2 text-white/80 hover:text-white transition-colors duration-300" aria-label="Открыть меню">
              {!open ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/>
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              )}
            </button>
          </div>
          {/* Mobile menu */}
          {open && (
            <div className="lg:hidden mt-4 py-4 bg-black/50 backdrop-blur-lg rounded-2xl border border-white/10"style={{animation: 'fadeIn 0.2s ease-out'}}>
              <div className="px-4 space-y-4">
                <Link href="/" onClick={() => setOpen(false)} className="block text-white/80 hover:text-white transition-colors duration-300 py-2">
                  Главная
                </Link>
                <Link href="/auth/" onClick={() => setOpen(false)} className="block text-white/80 hover:text-white transition-colors duration-300 py-2">
                  Профиль
                </Link>
              </div>
            </div>
          )}
        </div>
      </header>
      {/* Main content */}
      <main className="pt-32 pb-16 relative overflow-hidden">
        {/* Background Decoration */}
        <svg className="absolute inset-0 w-full h-full opacity-20 -z-10" xmlns="https://www.w3.org/2000/svg" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <radialGradient id="dash-grad" cx="50%" cy="50%" r="75%" fx="50%" fy="50%">
              <stop offset="0%" stopColor="#16a3ff" stopOpacity="0.18"/>
              <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#dash-grad)" />
          <g stroke="rgba(255,255,255,0.04)" strokeWidth="1">
            <line x1="0" y1="25%" x2="100%" y2="25%"/>
            <line x1="0" y1="50%" x2="100%" y2="50%"/>
            <line x1="0" y1="75%" x2="100%" y2="75%"/>
          </g>
        </svg>
        <div className="pointer-events-none absolute -top-32 -right-20 w-80 h-80 bg-primary-500/10 blur-3xl rounded-full -z-10"></div>
        <div className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 bg-white/5 blur-[100px] rounded-full -z-10"></div>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div ref={titleRef}>
            <h1 className="text-2xl md:text-3xl font-semibold">Панель управления</h1>
            <p className="mt-2 text-neutral-400">Добро пожаловать. Здесь будут ваши подписки, ключи и настройки.</p>
          </div>
          {/* Profile section */}
          <section ref={profileRef} className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-center gap-4">
              <div className="shrink-0 h-14 w-14 rounded-full border border-neutral-800 bg-neutral-800/60 grid place-items-center overflow-hidden">
                <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" className="text-neutral-400">
                  <path fill="currentColor" d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zm0 2c-4.418 0-8 2.239-8 5v1c0 .552.448 1 1 1h14c.552 0 1-.448 1-1v-1c0-2.761-3.582-5-8-5z"/>
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-lg font-medium" id="profile-username">—</div>
                <div className="mt-1 text-sm text-neutral-400 flex flex-wrap gap-x-4 gap-y-1">
                  <div><span className="text-neutral-500">ID:</span> <span id="profile-id">#0000</span></div>
                  <div><span className="text-neutral-500">Дата регистрации:</span> <span id="profile-registered">—</span></div>
                </div>
              </div>
            </div>
          </section>
          {/* Cards grid */}
          <div ref={cardsRef} className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
              <div className="text-sm text-neutral-400">Статус подписки</div>
              <div className="mt-2 text-xl font-semibold">Нет активной подписки</div>
            </section>
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
              <div className="text-sm text-neutral-400">Ваши ключи</div>
              <div className="mt-2 text-neutral-300 text-sm">Появятся после покупки.</div>
            </section>
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
              <div className="text-sm text-neutral-400">Поддержка</div>
              <Link href="/contacts" className="mt-2 inline-block text-primary-400 hover:underline hover:text-primary-300 transition-colors">
                Связаться с нами
              </Link>
            </section>
          </div>
          {/* Servers status */}
          <div ref={serversRef} className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-center justify-between">
              <div className="font-medium">Статус серверов</div>
              <div className="text-xs text-neutral-500">Скоро</div>
            </div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 flex items-center justify-between hover:bg-neutral-950/60 transition-colors">
                <div className="text-sm">DE-1</div>
                <div className="flex items-center gap-1 text-green-400">
                  <span className="h-2 w-2 rounded-full bg-green-400"></span>
                  <span className="text-xs">OK</span>
                </div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 flex items-center justify-between hover:bg-neutral-950/60 transition-colors">
                <div className="text-sm">DE-2</div>
                <div className="flex items-center gap-1 text-green-400">
                  <span className="h-2 w-2 rounded-full bg-green-400"></span>
                  <span className="text-xs">OK</span>
                </div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 flex items-center justify-between hover:bg-neutral-950/60 transition-colors">
                <div className="text-sm">SWE-1</div>
                <div className="flex items-center gap-1 text-yellow-400">
                  <span className="h-2 w-2 rounded-full bg-yellow-400"></span>
                  <span className="text-xs">LOAD</span>
                </div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 flex items-center justify-between hover:bg-neutral-950/60 transition-colors">
                <div className="text-sm">SWE-2</div>
                <div className="flex items-center gap-1 text-green-400">
                  <span className="h-2 w-2 rounded-full bg-green-400"></span>
                  <span className="text-xs">OK</span>
                </div>
              </div>
            </div>
          </div>
          {/* Recent events */}
          <div ref={eventsRef} className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-center justify-between">
              <div className="font-medium">Последние события</div>
              <div className="text-xs text-neutral-500">Скоро</div>
            </div>
            <div className="mt-3 text-neutral-400 text-sm">История активности будет доступна после интеграции API.</div>
          </div>
        </div>
      </main>
      {/* Footer */}
      <footer className="mt-20 border-t border-neutral-800/50">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-neutral-500">
              © {currentYear} RVNPrivate. Все права защищены.
            </p>
            <div className="flex items-center gap-6 text-xs text-neutral-500">
              <span>v1.0.0</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

