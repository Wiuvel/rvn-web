'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import AuthForm from '@/components/auth/Form';
import ParticlesBackground from '@/components/effects/Particles';

function AuthIsolatedClientContent() {
  const searchParams = useSearchParams();
  const retpatch = searchParams.get('retpatch') || '/dashboard/';
  const errorParam = searchParams.get('error');
  const sessionExpiredParam = searchParams.get('session_expired') === '1';
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
          {sessionExpiredParam && (
            <div
              className="col-span-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-amber-200"
              role="alert"
            >
              Сессия истекла или токен недействителен. Пожалуйста, войдите снова.
            </div>
          )}
          <AuthForm retpatch={retpatch} initialError={errorParam || undefined} />
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
