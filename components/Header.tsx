'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { gsap } from 'gsap';

export default function Header() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    gsap.fromTo('.header-container', 
      { 
        opacity: 0, 
        y: -10 
      },
      { 
        opacity: 1, 
        y: 0, 
        duration: 0.5, 
        ease: "power2.out",
        delay: 0.1
      }
    );
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 pt-4 z-50">
      <div className="mx-auto max-w-6xl px-4">
        <div className="header-container backdrop-blur-md bg-neutral-900/40 border border-white/10 rounded-full px-6 py-3 flex items-center justify-between shadow-lg">
          <Link href="/" className="flex items-center gap-2">
            <Image 
              src="/static/logo.svg" 
              alt="RVNPrivate" 
              width={24} 
              height={24} 
              className="w-6 h-6"
              priority
            />
            <span className="font-semibold text-white">Raven Private</span>
          </Link>
          <nav className="hidden lg:flex items-center gap-8 text-sm text-neutral-300">
            <Link href="#pricing" className="hover:text-white transition">Тарифы</Link>
            <Link href="#apps" className="hover:text-white transition">Приложения</Link>
            <Link href="#faq" className="hover:text-white transition">FAQ</Link>
          </nav>
          <div className="hidden lg:flex">
            <Link 
              href="/auth" 
              className="rounded-xl bg-primary-500 hover:bg-primary-400 px-4 py-2 text-sm font-medium text-white shadow-glow transition"
            >
              Войти
            </Link>
          </div>
          <button 
            onClick={() => setOpen(!open)} 
            className="lg:hidden p-2 text-white/80 hover:text-white transition-colors duration-300" 
            aria-label="Открыть меню"
          >
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
        {open && (
          <div className="lg:hidden mt-4 py-4 bg-black/50 backdrop-blur-xl rounded-2xl border border-white/10">
            <div className="px-4 space-y-4">
              <Link 
                href="#pricing" 
                onClick={() => setOpen(false)} 
                className="block text-white/80 hover:text-white transition-colors duration-300 py-2"
              >
                Тарифы
              </Link>
              <Link 
                href="#apps" 
                onClick={() => setOpen(false)} 
                className="block text-white/80 hover:text-white transition-colors duration-300 py-2"
              >
                Приложения
              </Link>
              <Link 
                href="#faq" 
                onClick={() => setOpen(false)} 
                className="block text-white/80 hover:text-white transition-colors duration-300 py-2"
              >
                FAQ
              </Link>
              <div className="pt-4 border-t border-white/10 space-y-3">
                <Link 
                  href="/auth" 
                  className="block text-white/80 hover:text-white transition-colors duration-300 py-2"
                >
                  Войти
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

