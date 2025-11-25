'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { gsap } from 'gsap';

interface UserData {
  id: string;
  user_id: string;
  username: string;
  dashboard_token: string;
  created_at: string;
  last_login?: string;
}

export default function Header() {
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [shouldRenderMenu, setShouldRenderMenu] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);
  const mobileSpinnerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

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

  useEffect(() => {
    checkAuth();
  }, []);

  // GSAP анимация для спиннера
  useEffect(() => {
    if (loading) {
      const elements = [spinnerRef.current, mobileSpinnerRef.current].filter(Boolean);
      
      elements.forEach((element) => {
        if (!element) return;
        
        // Анимация появления с плавным fade-in и scale
        gsap.fromTo(element,
          { opacity: 0, scale: 0.85 },
          { 
            opacity: 0.7, 
            scale: 1, 
            duration: 0.4, 
            ease: "power2.out"
          }
        );
      });
    } else {
      // Плавное исчезновение при завершении загрузки
      [spinnerRef.current, mobileSpinnerRef.current].forEach((element) => {
        if (element) {
          gsap.to(element, {
            opacity: 0,
            scale: 0.9,
            duration: 0.2,
            ease: "power2.in",
            onComplete: () => {
              gsap.set(element, { clearProps: "all" });
            }
          });
        }
      });
    }
  }, [loading]);

  // Управление рендерингом и анимацией меню
  useEffect(() => {
    if (userMenuOpen) {
      // Показываем меню
      setShouldRenderMenu(true);
      // Небольшая задержка для применения начальных стилей
      requestAnimationFrame(() => {
        if (menuRef.current) {
          // Устанавливаем начальное состояние
          gsap.set(menuRef.current, {
            opacity: 0,
            y: -10,
            scale: 0.95
          });
          // Анимация появления
          gsap.to(menuRef.current, {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.2,
            ease: "power2.out"
          });
        }
      });
    } else if (shouldRenderMenu && menuRef.current) {
      // Анимация исчезновения
      gsap.to(menuRef.current, {
        opacity: 0,
        y: -10,
        scale: 0.95,
        duration: 0.15,
        ease: "power2.in",
        onComplete: () => {
          setShouldRenderMenu(false);
        }
      });
    }
  }, [userMenuOpen, shouldRenderMenu]);

  // Закрытие меню при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setUserData(data);
      }
    } catch (error) {
      console.error('Failed to check auth:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST'
      });
      if (response.ok) {
        setUserData(null);
        setUserMenuOpen(false);
        router.push('/auth');
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const getInitial = (username: string) => {
    return username.charAt(0).toUpperCase();
  };

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
          <div className="hidden lg:flex relative" ref={userMenuRef}>
            {loading ? (
              <div 
                ref={spinnerRef}
                className="w-10 h-10 rounded-full bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
              ></div>
            ) : userData ? (
              <>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="w-10 h-10 rounded-full bg-primary-500 hover:bg-primary-400 flex items-center justify-center text-white font-semibold text-sm shadow-glow transition cursor-pointer"
                  title={userData.username}
                  aria-label="Меню пользователя"
                  aria-expanded={userMenuOpen}
                >
                  {getInitial(userData.username)}
                </button>
                {shouldRenderMenu && (
                  <div 
                    ref={menuRef}
                    className="absolute -right-3 top-full mt-4 w-64 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl overflow-hidden z-50"
                  >
                    <div className="p-4 border-b border-white/10">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-primary-500 flex items-center justify-center text-white font-semibold text-base flex-shrink-0">
                          {getInitial(userData.username)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-white font-medium truncate">{userData.username}</div>
                          <div className="text-neutral-400 text-xs truncate">ID: {userData.user_id}</div>
                        </div>
                      </div>
                    </div>
                    <div className="py-2">
                      <Link
                        href={`/dashboard/${userData.dashboard_token}`}
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-white/80 hover:text-white hover:bg-white/5 transition-colors duration-200"
                      >
                        <Image 
                          src="/static/icons/accounts/user.svg" 
                          alt="Личный кабинет" 
                          width={20} 
                          height={20} 
                          className="w-5 h-5"
                        />
                        <span>Личный кабинет</span>
                      </Link>
                      <Link
                        href="/contacts"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-white/80 hover:text-white hover:bg-white/5 transition-colors duration-200"
                      >
                        <Image 
                          src="/static/icons/accounts/support.svg" 
                          alt="Поддержка" 
                          width={20} 
                          height={20} 
                          className="w-5 h-5"
                        />
                        <span>Поддержка</span>
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors duration-200"
                      >
                        <Image 
                          src="/static/icons/accounts/log-out.svg" 
                          alt="Выйти" 
                          width={20} 
                          height={20} 
                          className="w-5 h-5"
                        />
                        <span>Выйти</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <Link 
                href="/auth" 
                className="rounded-xl bg-primary-500 hover:bg-primary-400 px-4 py-2 text-sm font-medium text-white shadow-glow transition flex items-center gap-2"
              >
                <Image 
                  src="/static/icons/accounts/log-in.svg" 
                  alt="Войти" 
                  width={16} 
                  height={16} 
                  className="w-4 h-4"
                />
                <span>Войти</span>
              </Link>
            )}
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
                {loading ? (
                  <div 
                    ref={mobileSpinnerRef}
                    className="w-10 h-10 rounded-full bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
                  ></div>
                ) : userData ? (
                  <Link 
                    href={`/dashboard/${userData.dashboard_token}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 text-white/80 hover:text-white transition-colors duration-300 py-2"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-white font-semibold text-sm">
                      {getInitial(userData.username)}
                    </div>
                    <span>{userData.username}</span>
                  </Link>
                ) : (
                  <Link 
                    href="/auth" 
                    className="block text-white/80 hover:text-white transition-colors duration-300 py-2"
                  >
                    Войти
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

