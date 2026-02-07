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
import { getGradientClasses, getAvatarUrl } from '@/lib/utils/avatar-gradients';
import { getStaticUrl } from "@/lib/utils";

interface HeaderProps {
  variant?: 'main' | 'auth' | 'dashboard';
}

const DESKTOP_BREAKPOINT = '(min-width: 1024px)';

export default function Header({ variant = 'main' }: HeaderProps = {}) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false); // viewport >= lg, set after mount
  const [avatarLoading, setAvatarLoading] = useState(true);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);
  const avatarLoadFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Сбрасываем состояние загрузки аватара при смене аватара
  useEffect(() => {
    if (userData?.avatar) {
      const avatarUrl = getAvatarUrl(userData.avatar);
      if (avatarUrl) {
        setAvatarLoading(true);
      }
    }
  }, [userData?.avatar]);

  // Страховка: при кешированном изображении onLoad может не сработать при навигации — снимаем скелетон по таймауту
  const AVATAR_LOAD_FALLBACK_MS = 800;
  useEffect(() => {
    if (!userData?.avatar) return;
    const avatarUrl = getAvatarUrl(userData.avatar);
    if (!avatarUrl) return;

    avatarLoadFallbackRef.current = setTimeout(() => {
      avatarLoadFallbackRef.current = null;
      setAvatarLoading(false);
    }, AVATAR_LOAD_FALLBACK_MS);

    return () => {
      if (avatarLoadFallbackRef.current) {
        clearTimeout(avatarLoadFallbackRef.current);
        avatarLoadFallbackRef.current = null;
      }
    };
  }, [userData?.avatar]);

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
    gsap.fromTo(headerContainer, 
      { 
        opacity: 0, 
        y: -10 
      },
      { 
        opacity: 1, 
        y: 0, 
        duration: GSAP_DEFAULT_DURATION, 
        ease: GSAP_DEFAULT_EASE,
        delay: 0.1,
        force3D: true
      }
    );

  }, []);

  // Плавный переход между состояниями auth контейнера
  useEffect(() => {
    if (typeof window === 'undefined' || !authContainerRef.current) return;
    
    if (!loading) {
      gsap.to(authContainerRef.current, {
        opacity: 1,
        duration: 0.2,
        ease: "power2.out"
      });
    }
  }, [loading]);

  // Инициализация уведомлений и загрузка из localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedRead = localStorage.getItem('readNotifications');
  }, []);

  // Закрытие меню при навигации
  useEffect(() => {
    setUserMenuOpen(false);
  }, [pathname]);

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

  const getInitial = (username: string) => {
    return username.charAt(0).toUpperCase();
  };

  // Навигация для десктопа
  const getNavigation = () => {
    if (variant === 'main') {
      return (
        <>
          <Link href="/about" className="hover:text-white transition" aria-current={pathname === '/about' ? 'page' : undefined}>
            О проекте
          </Link>
          <Link
            href="/support"
            className="hover:text-white transition"
            aria-current={pathname === '/support' ? 'page' : undefined}
          >
            Поддержка
          </Link>
          <span className="text-neutral-500 cursor-not-allowed">Wiki</span>
        </>
      );
    }
    return null;
  };

  return (
    <header
      ref={headerRef}
      className="relative lg:fixed lg:top-0 lg:left-0 lg:right-0 pt-4 z-50"
    >
      <div className="mx-auto max-w-7xl px-3">
        <div className="header-container flex items-center justify-between px-3 py-3 lg:backdrop-blur-md lg:bg-neutral-900/40 lg:border lg:border-white/10 lg:rounded-full lg:px-6 lg:py-4 lg:shadow-lg">
          {/* Logo — always visible */}
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-current={pathname === '/' ? 'page' : undefined}
          >
            <Image 
              src={getStaticUrl("/static/logo.svg")} 
              alt="RVNPrivate" 
              width={256} 
              height={256} 
              className="w-8 h-8"
              priority
            />
            <span className="font-semibold text-lg text-white">RVN</span>
          </Link>

          {/* Desktop navigation */}
          {variant === 'main' && (
            <nav className="hidden lg:flex items-center gap-8 text-base text-neutral-300">
              {getNavigation()}
            </nav>
          )}

          {/* Desktop user menu area */}
          <div className="hidden lg:flex items-center gap-2 relative" ref={userMenuRef}>
            <div 
              ref={authContainerRef}
              className="h-10 min-w-[100px] flex items-center justify-end transition-opacity duration-300"
              style={{ opacity: loading && !userData ? 0.7 : 1 }}
            >
              {loading && !userData ? (
                <div 
                  ref={spinnerRef}
                  className="w-10 h-10 rounded-full bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite] flex-shrink-0"
                ></div>
              ) : userData ? (
                <div className="flex items-center gap-2">
                  <NotificationsWidget />
                  {(() => {
                    const avatarUrl = getAvatarUrl(userData.avatar);
                    const gradientClasses = getGradientClasses(userData.avatar);
                    
                    return (
                  <button
                    ref={userMenuButtonRef}
                    onClick={(e) => {
                      e.stopPropagation();
                      setUserMenuOpen(!userMenuOpen);
                    }}
                        className={`w-11 h-11 rounded-full overflow-hidden ${avatarUrl ? '' : gradientClasses} flex items-center justify-center text-white font-semibold text-base transition-transform duration-200 hover:scale-110 cursor-pointer flex-shrink-0 relative`}
                    title={userData.username}
                    aria-label="Меню пользователя"
                    aria-expanded={userMenuOpen && isDesktop}
                  >
                        {avatarUrl ? (
                          <>
                            {avatarLoading && (
                              <div 
                                className="absolute inset-0 rounded-full bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
                              />
                            )}
                            <Image
                              src={avatarUrl}
                              alt={userData.username}
                              width={44}
                              height={44}
                              className={`w-full h-full object-cover transition-opacity duration-300 ${avatarLoading ? 'opacity-0' : 'opacity-100'}`}
                              unoptimized
                              onLoad={() => {
                                if (avatarLoadFallbackRef.current) {
                                  clearTimeout(avatarLoadFallbackRef.current);
                                  avatarLoadFallbackRef.current = null;
                                }
                                setAvatarLoading(false);
                              }}
                              onError={() => {
                                if (avatarLoadFallbackRef.current) {
                                  clearTimeout(avatarLoadFallbackRef.current);
                                  avatarLoadFallbackRef.current = null;
                                }
                                setAvatarLoading(false);
                              }}
                            />
                          </>
                        ) : (
                          <>
                            {loading && !userData?.id && (
                              <div 
                                className="absolute inset-0 rounded-full bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
                              />
                            )}
                            <div className={`${loading && !userData?.id ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}>
                    {getInitial(userData.username)}
                            </div>
                          </>
                        )}
                  </button>
                    );
                  })()}
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
                  className="rounded-xl bg-primary-500 hover:bg-primary-400 px-4 py-2 text-sm font-medium text-white shadow-glow transition flex items-center gap-2 h-10 flex-shrink-0 min-w-[110px] justify-center"
                >
                  <Image 
                    src={getStaticUrl("/static/icons/accounts/4d660.login.svg")} 
                    alt="Войти" 
                    width={24} 
                    height={24} 
                    className="w-5 h-5"
                  />
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
