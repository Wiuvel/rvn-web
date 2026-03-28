'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import AuthForm from '@/components/auth/Form';
import ParticlesBackground from '@/components/effects/Particles';

const REASON_MESSAGES: Record<string, string> = {
  session_expired: 'Сессия истекла. Войдите снова.',
  access_denied: 'Требуется авторизация для доступа.',
  role_required: 'Недостаточно прав. Войдите с другим аккаунтом.',
};

function isValidReturnTo(path: string): boolean {
  if (!path) return false;
  try {
    const url = new URL(path, 'http://localhost');
    if (url.origin !== 'http://localhost') return false;
  } catch {
    return false;
  }
  return path.startsWith('/') && !path.startsWith('//');
}

function AuthIsolatedClientContent() {
  const searchParams = useSearchParams();
  const rawReturnTo = searchParams.get('return_to');
  const return_to = rawReturnTo && isValidReturnTo(rawReturnTo) ? rawReturnTo : undefined;
  const errorParam = searchParams.get('error');
  const modeParam = searchParams.get('mode') as 'login' | 'register' | null;
  const mode = modeParam === 'register' ? 'register' : undefined;

  const reasonParam = searchParams.get('reason');
  const sessionExpiredLegacy = searchParams.get('session_expired') === 'cx';
  const reasonKey = reasonParam || (sessionExpiredLegacy ? 'session_expired' : null);
  const reasonMessage = reasonKey ? REASON_MESSAGES[reasonKey] || null : null;

  const [showReason, setShowReason] = useState(!!reasonMessage);
  const [reasonFadeOut, setReasonFadeOut] = useState(false);
  const [preloaderVisible, setPreloaderVisible] = useState(true);
  const [blueWidth, setBlueWidth] = useState<'0%' | '100%'>('0%');

  useEffect(() => {
    const fillTimer = setTimeout(() => {
      setBlueWidth('100%');
    }, 60);

    const timer = setTimeout(() => {
      setPreloaderVisible(false);
    }, 1200);

    return () => {
      clearTimeout(timer);
      clearTimeout(fillTimer);
    };
  }, []);

  useEffect(() => {
    if (!showReason || !reasonMessage) return;
    setReasonFadeOut(false);
    const fadeTimer = setTimeout(() => {
      setReasonFadeOut(true);
    }, 4500);
    const hideTimer = setTimeout(() => {
      setShowReason(false);
      const url = new URL(window.location.href);
      url.searchParams.delete('reason');
      url.searchParams.delete('session_expired');
      window.history.replaceState(null, '', url.pathname + url.search);
    }, 5000);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [showReason, reasonMessage]);

  return (
    <>
      {/* Preloader */}
      {preloaderVisible && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center transition-opacity duration-500"
          style={{
            opacity: preloaderVisible ? 1 : 0,
            background: 'rgba(10,16,32,0.92)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <div className="flex flex-col items-center text-center">
            <div
              className="relative inline-block w-max overflow-hidden"
              style={{
                fontSize: '1.2rem',
                color: '#b0e5ff',
                fontWeight: '500',
                letterSpacing: '0.05em',
                marginBottom: '6px',
              }}
            >
              <span
                style={{
                  color: '#b0e5ff',
                  opacity: '0.25',
                }}
              >
                Проверяем&nbsp;доступность
              </span>
              <span
                className="pointer-events-none absolute left-0 top-0 overflow-hidden whitespace-nowrap"
                style={{
                  color: '#16a3ff',
                  width: blueWidth,
                  transition: 'width 0.5s cubic-bezier(.4,0,.2,1)',
                  transitionDelay: '80ms',
                }}
              >
                Проверяем&nbsp;доступность
              </span>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="sticky top-4 z-50">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center justify-between rounded-full border border-white/10 bg-neutral-900/40 px-6 py-3 shadow-lg backdrop-blur-md">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/static/logo.svg"
                alt="RVN"
                width={256}
                height={256}
                className="h-6 w-6"
                loading="lazy"
              />
              <span className="font-semibold text-white">RVN</span>
            </Link>
            <div className="hidden lg:flex">
              <Link
                href="/support/"
                prefetch={false}
                className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-glow transition hover:bg-primary-400"
              >
                Помощь
              </Link>
            </div>
          </div>
        </div>
      </header>
      {/* Main Content */}
      <section className="flex flex-grow items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <ParticlesBackground />
        <div className="z-10 grid w-full max-w-5xl grid-cols-1 items-center gap-12 md:grid-cols-2">
          {showReason && reasonMessage && (
            <div
              className={`fixed left-1/2 top-24 z-[100] flex -translate-x-1/2 items-center justify-center gap-3 rounded-lg border-2 border-red-500/80 bg-neutral-900 px-3 py-2 shadow-lg transition-all duration-500 ${
                reasonFadeOut ? '-translate-y-1 opacity-0' : 'translate-y-0 opacity-100'
              }`}
              role="alert"
              aria-live="polite"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/20">
                <svg
                  className="h-5 w-5 text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <span className="text-sm font-medium leading-snug text-neutral-200">
                {reasonMessage}
              </span>
            </div>
          )}
          <AuthForm return_to={return_to} initialError={errorParam || undefined} mode={mode} />
        </div>
        {/* Decorative Tree Image */}
        <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-0 hidden items-end justify-center md:flex">
          <Image
            src="/static/templates/overlay-login.webp"
            alt="Декоративное дерево"
            width={1166}
            height={878}
            className="tree-glow"
            style={{
              height: '90vh',
              minHeight: '480px',
              maxHeight: '1200px',
              width: '120vw',
              minWidth: '720px',
              maxWidth: 'none',
              objectFit: 'contain',
              objectPosition: 'center bottom',
            }}
            priority
            placeholder="empty"
          />
        </div>
      </section>
    </>
  );
}

function AuthFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950">
      <div className="spinner" />
    </div>
  );
}

export default function AuthIsolatedClient() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <AuthIsolatedClientContent />
    </Suspense>
  );
}
