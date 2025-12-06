'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import AuthForm from '@/components/auth/Form';
import ParticlesBackground from '@/components/effects/Particles';

export default function AuthIsolatedClient() {
  const searchParams = useSearchParams();
  const retpatch = searchParams.get('retpatch') || '/dashboard/';
  const errorParam = searchParams.get('error');
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
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)'
          }}
        >
          <div className="text-center flex flex-col items-center">
            <div 
              className="relative inline-block overflow-hidden w-max"
              style={{
                fontSize: '1.2rem',
                color: '#b0e5ff',
                fontWeight: '500',
                letterSpacing: '0.05em',
                marginBottom: '6px'
              }}
            >
              <span 
                style={{
                  color: '#b0e5ff',
                  opacity: '0.25'
                }}
              >
                Проверяем&nbsp;доступность
              </span>
              <span 
                className="absolute left-0 top-0 whitespace-nowrap overflow-hidden pointer-events-none"
                style={{ 
                  color: '#16a3ff',
                  width: blueWidth,
                  transition: 'width 0.5s cubic-bezier(.4,0,.2,1)',
                  transitionDelay: '80ms'
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
          <div className="backdrop-blur-md bg-neutral-900/40 border border-white/10 rounded-full px-6 py-3 flex items-center justify-between shadow-lg">
            <Link href="/" className="flex items-center gap-2">
              <Image 
                src="/static/logo.svg" 
                alt="RVNPrivate" 
                width={256} 
                height={256} 
                className="w-6 h-6"
                loading="lazy"
              />
              <span className="font-semibold text-white">Raven Private</span>
            </Link>
            <div className="hidden lg:flex">
              <Link href="/support/" className="rounded-xl bg-primary-500 hover:bg-primary-400 px-4 py-2 text-sm font-medium text-white shadow-glow transition">
                Помощь
              </Link>
            </div>
          </div>
        </div>
      </header>
      {/* Main Content */}
      <section className="flex-grow flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
        <ParticlesBackground />
        <div className="z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center w-full max-w-5xl">
          <AuthForm retpatch={retpatch} initialError={errorParam || undefined} />
        </div>
        {/* Decorative Tree Image */}
        <div className="hidden md:flex pointer-events-none z-0 fixed bottom-0 left-0 right-0 items-end justify-center">
          <Image 
            src="/static/templates/overlay-login.png" 
            alt="Декоративное дерево"
            width={1320}
            height={1200}
            className="tree-glow"
            style={{ 
              height: '90vh', 
              minHeight: '480px', 
              maxHeight: '1200px', 
              width: '120vw', 
              minWidth: '720px', 
              maxWidth: 'none', 
              objectFit: 'contain',
              objectPosition: 'center bottom'
            }}
            priority
            placeholder="empty"
          />
        </div>
      </section>
    </>
  );
}
