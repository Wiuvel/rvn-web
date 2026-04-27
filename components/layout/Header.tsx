'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { gsap } from 'gsap';
import { useAuth } from '@/hooks/useAuth';
import { UserMenu } from '@/components/navigation/UserMenu';
import { NotificationsWidget } from '@/components/navigation/Notifications';
import { GSAP_DEFAULT_DURATION, GSAP_DEFAULT_EASE } from '@/lib/utils/constants';
import { getStaticUrl } from '@/lib/utils';
import HeaderAvatar from './HeaderAvatar';
import { LogIn as EnterIcon } from 'lucide-react';

interface HeaderProps {
  variant?: 'main' | 'auth' | 'dashboard';
}

const DESKTOP_BREAKPOINT = '(min-width: 1024px)';

export default function Header({ variant = 'main' }: HeaderProps = {}) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false); // viewport >= lg, set after mount
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const authContainerRef = useRef<HTMLDivElement>(null);

  const { userData, loading } = useAuth({ silent: true, lightweight: true });

  // Синхронизация viewport: только на десктопе UserMenu может быть открыт
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(DESKTOP_BREAKPOINT);
    const update = () => {
      const desktop = mq.matches;
      setIsDesktop(desktop);
      if (!desktop) setUserMenuOpen(false);
    };
    update(); // run once on mount
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !headerRef.current) return;

    const header = headerRef.current;
    const headerContainer = header.querySelector('.header-container') as HTMLElement;
    if (!headerContainer) return;

    // На мобильных (< lg) просто показываем без анимации
    const isSmallScreen = window.innerWidth < 1024;
    if (isSmallScreen) {
      gsap.set(headerContainer, { opacity: 1, y: 0 });
      return;
    }

    // Плавная анимация появления header на десктопе
    gsap.fromTo(
      headerContainer,
      {
        opacity: 0,
        y: -10,
      },
      {
        opacity: 1,
        y: 0,
        duration: GSAP_DEFAULT_DURATION,
        ease: GSAP_DEFAULT_EASE,
        delay: 0.1,
        force3D: true,
      },
    );
  }, []);

  // Плавный переход между состояниями auth контейнера
  useEffect(() => {
    if (typeof window === 'undefined' || !authContainerRef.current) return;

    if (!loading) {
      gsap.to(authContainerRef.current, {
        opacity: 1,
        duration: 0.2,
        ease: 'power2.out',
      });
    }
  }, [loading]);

  // Инициализация уведомлений и загрузка из localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
  }, []);

  // Закрытие меню при навигации
  // useEffect(() => {
  //   setUserMenuOpen(false);
  // }, [pathname]);

  // Примечание: body overflow НЕ блокируем для десктоп-дропдауна — он маленький и не требует
  // блокировки скролла. Scroll lock теперь только в MobileNavigation overlay.

  // Закрытие меню при клике вне его (только на десктопе)
  useEffect(() => {
    if (typeof window === 'undefined' || !isDesktop || !userMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (userMenuButtonRef.current?.contains(target)) return;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true);
    }, 0);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [userMenuOpen, isDesktop]);

  // Stable reference — prevents useMenuAnimation effect from re-running on every render
  const closeUserMenu = useCallback(() => setUserMenuOpen(false), []);

  // Навигация для десктопа
  const getNavigation = () => {
    if (variant === 'main') {
      return (
        <>
          <Link
            href="/about"
            prefetch={false}
            className="transition hover:text-white"
            aria-current={pathname === '/about' ? 'page' : undefined}
          >
            О проекте
          </Link>
          <Link
            href="/support"
            prefetch={false}
            className="transition hover:text-white"
            aria-current={pathname === '/support' ? 'page' : undefined}
          >
            Поддержка
          </Link>
          <span className="text-neutral-500">Wiki</span>
        </>
      );
    }
    return null;
  };

  return (
    <header ref={headerRef} className="relative z-50 pt-4 lg:fixed lg:left-0 lg:right-0 lg:top-0">
      <div className="mx-auto max-w-7xl px-8">
        <div className="header-container flex items-center justify-between py-3 lg:rounded-full lg:border lg:border-white/10 lg:bg-neutral-900/40 lg:px-6 lg:py-4 lg:shadow-lg lg:backdrop-blur-md">
          {/* Logo — always visible */}
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-current={pathname === '/' ? 'page' : undefined}
          >
            <Image
              src={getStaticUrl('/static/logo.svg')}
              alt="RVN Logo"
              width={256}
              height={256}
              className="h-8 w-8"
              priority
            />
            <span className="text-lg font-semibold text-white">RVN</span>
          </Link>

          {/* Desktop navigation */}
          {variant === 'main' && (
            <nav className="hidden items-center gap-8 text-base text-neutral-300 lg:flex">
              {getNavigation()}
            </nav>
          )}

          {/* Desktop user menu area */}
          <div className="relative hidden items-center gap-2 lg:flex" ref={userMenuRef}>
            <div
              ref={authContainerRef}
              className="flex h-10 min-w-[100px] items-center justify-end transition-opacity duration-300"
              style={{ opacity: loading && !userData ? 0.7 : 1 }}
            >
              {loading && !userData ? (
                <div
                  ref={spinnerRef}
                  className="h-10 w-10 flex-shrink-0 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%]"
                ></div>
              ) : userData ? (
                <div className="flex items-center gap-2">
                  <NotificationsWidget />
                  <HeaderAvatar
                    key={userData.avatar || 'no-avatar'}
                    userData={userData}
                    onClick={(e) => {
                      e.stopPropagation();
                      setUserMenuOpen(!userMenuOpen);
                    }}
                    isOpen={userMenuOpen}
                    isDesktop={isDesktop}
                    buttonRef={userMenuButtonRef}
                  />
                  {userData && (
                    <UserMenu
                      userData={userData}
                      isOpen={userMenuOpen && isDesktop}
                      onClose={closeUserMenu}
                      showUserId={true}
                      menuRef={userMenuRef}
                      persist={isDesktop}
                    />
                  )}
                </div>
              ) : (
                <Link
                  href="/auth"
                  prefetch={false}
                  className="flex h-10 min-w-[110px] flex-shrink-0 items-center justify-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-glow transition hover:bg-primary-400"
                >
                  <EnterIcon className="h-5 w-5" />
                  <span>Войти</span>
                </Link>
              )}
            </div>
          </div>

          {/* Mobile: nothing here — navigation handled by MobileNavigation component */}
        </div>
      </div>
    </header>
  );
}
