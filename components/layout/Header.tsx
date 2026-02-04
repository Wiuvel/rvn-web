'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { gsap } from 'gsap';
import { Notification } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { UserMenu } from '@/components/navigation/UserMenu';
import { NotificationsWidget } from '@/components/navigation/Notifications';
import { GSAP_DEFAULT_DURATION, GSAP_DEFAULT_EASE } from '@/lib/utils/constants';
import { getGradientClasses, getAvatarUrl } from '@/lib/utils/avatar-gradients';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { getStaticUrl } from "@/lib/utils";
import { Wallet } from 'lucide-react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface HeaderProps {
  variant?: 'main' | 'auth' | 'dashboard';
}

export default function Header({ variant = 'main' }: HeaderProps = {}) {
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(true);
  const [mobileAvatarLoading, setMobileAvatarLoading] = useState(true);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);
  const mobileSpinnerRef = useRef<HTMLDivElement>(null);
  const avatarLoadFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const authContainerRef = useRef<HTMLDivElement>(null);

  // Используем новый хук useAuth
  const { userData, loading } = useAuth({ silent: true });

  const headerRef = useRef<HTMLElement>(null);

  // Сбрасываем состояние загрузки аватара при смене аватара
  useEffect(() => {
    if (userData?.avatar) {
      const avatarUrl = getAvatarUrl(userData.avatar);
      if (avatarUrl) {
        setAvatarLoading(true);
        setMobileAvatarLoading(true);
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
      setMobileAvatarLoading(false);
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
    
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      // На мобильных устройствах просто устанавливаем финальное состояние без анимации
      gsap.set(headerContainer, { opacity: 1, y: 0 });
      return;
    }
    
    // Плавная анимация появления header без влияния на layout
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
        // Используем will-change для оптимизации, но не влияем на layout
        force3D: true
      }
    );

  }, []);

  // Плавный переход между состояниями auth контейнера
  useEffect(() => {
    if (typeof window === 'undefined' || !authContainerRef.current) return;
    
    // Плавное появление контента после загрузки
    if (!loading) {
      gsap.to(authContainerRef.current, {
        opacity: 1,
        duration: 0.2,
        ease: "power2.out"
      });
    }
  }, [loading]);

  // useAuth хук теперь обрабатывает всю логику авторизации

  // Инициализация уведомлений и загрузка из localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Загружаем прочитанные уведомления из localStorage
    const storedRead = localStorage.getItem('readNotifications');
  }, []);

  // Убрали GSAP анимации для спиннера, чтобы избежать прыжков layout

  // Блокировка скролла при открытом меню
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    if (userMenuOpen) {
      // Блокируем скролл
      document.body.style.overflow = 'hidden';
    } else {
      // Разблокируем скролл
      document.body.style.overflow = '';
    }

    // Очистка при размонтировании
    return () => {
      if (typeof window !== 'undefined') {
        document.body.style.overflow = '';
      }
    };
  }, [userMenuOpen]);

  // Закрытие меню при клике вне его
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Проверяем, был ли клик на кнопках меню - если да, не закрываем
      if (userMenuButtonRef.current && userMenuButtonRef.current.contains(target)) {
        return; // Клик на кнопке пользователя - не закрываем, onClick обработает
      }
      
      // Проверяем, что клик был вне контейнера меню
      // Закрываем только то меню, которое действительно открыто
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      // Используем небольшую задержку, чтобы onClick кнопки успел сработать первым
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside, true);
      }, 0);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('click', handleClickOutside, true);
      };
    }
  }, [userMenuOpen]);

  const getInitial = (username: string) => {
    return username.charAt(0).toUpperCase();
  };

  // Определяем навигацию в зависимости от варианта
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
    // Для auth и dashboard используем стандартную навигацию (если нужно)
    return null;
  };

  const getMobileNavigation = () => {
    if (variant === 'main') {
      return (
        <>
          <Link 
            href="/about" 
            onClick={() => setOpen(false)} 
            className="block text-white/80 hover:text-white transition-colors duration-300 py-2"
          >
            О проекте
          </Link>
          <Link 
            href="/support" 
            onClick={() => setOpen(false)} 
            className="block text-white/80 hover:text-white transition-colors duration-300 py-2"
          >
            Поддержка
          </Link>
          <span className="block text-neutral-500 cursor-not-allowed py-2">Wiki</span>
        </>
      );
    }
    return null;
  };

  return (
    <header ref={headerRef} className="fixed top-0 left-0 right-0 pt-4 z-50">
      <div className="mx-auto max-w-6xl px-4">
        <div className="header-container backdrop-blur-md bg-neutral-900/40 border border-white/10 rounded-full px-6 py-3 flex items-center justify-between shadow-lg">
          <Link
            href="/"
            className="flex items-center gap-2"
            aria-current={pathname === '/' ? 'page' : undefined}
          >
            <Image 
              src={getStaticUrl("/static/logo.svg")} 
              alt="RVNPrivate" 
              width={256} 
              height={256} 
              className="w-6 h-6"
              priority
            />
            <span className="font-semibold text-white">RVN</span>
          </Link>
          {variant === 'main' && (
            <nav className="hidden lg:flex items-center gap-8 text-sm text-neutral-300">
              {getNavigation()}
            </nav>
          )}
          <div className="hidden lg:flex items-center gap-2 relative" ref={userMenuRef}>
            {/* Единый контейнер с фиксированной минимальной шириной для предотвращения прыжков */}
            <div 
              ref={authContainerRef}
              className="h-10 min-w-[100px] flex items-center justify-end transition-opacity duration-300"
              style={{ opacity: loading ? 0.7 : 1 }}
            >
              {loading ? (
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
                        className={`w-10 h-10 rounded-full overflow-hidden ${avatarUrl ? '' : gradientClasses} flex items-center justify-center text-white font-semibold text-sm transition-transform duration-200 hover:scale-110 cursor-pointer flex-shrink-0 relative`}
                    title={userData.username}
                    aria-label="Меню пользователя"
                    aria-expanded={userMenuOpen}
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
                              width={40}
                              height={40}
                              className={`w-full h-full object-cover transition-opacity duration-300 ${avatarLoading ? 'opacity-0' : 'opacity-100'}`}
                              unoptimized
                              onLoad={() => {
                                if (avatarLoadFallbackRef.current) {
                                  clearTimeout(avatarLoadFallbackRef.current);
                                  avatarLoadFallbackRef.current = null;
                                }
                                setAvatarLoading(false);
                                setMobileAvatarLoading(false);
                              }}
                              onError={() => {
                                if (avatarLoadFallbackRef.current) {
                                  clearTimeout(avatarLoadFallbackRef.current);
                                  avatarLoadFallbackRef.current = null;
                                }
                                setAvatarLoading(false);
                                setMobileAvatarLoading(false);
                              }}
                            />
                          </>
                        ) : (
                          <>
                            {loading && (
                              <div 
                                className="absolute inset-0 rounded-full bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
                              />
                            )}
                            <div className={`${loading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}>
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
                      isOpen={userMenuOpen}
                      onClose={() => setUserMenuOpen(false)}
                      showProfile={true}
                      showUserId={true}
                      menuRef={userMenuRef}
                    />
                  )}
                </div>
              ) : (
                <Link 
                  href="/auth" 
                  className="rounded-xl bg-primary-500 hover:bg-primary-400 px-4 py-2 text-sm font-medium text-white shadow-glow transition flex items-center gap-2 h-10 flex-shrink-0 min-w-[110px] justify-center"
                >
                  <Image 
                    src={getStaticUrl("/static/icons/accounts/log-in.svg")} 
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
          <div className="lg:hidden flex items-center gap-2">
            {/* Кнопка уведомлений для мобильных - только для авторизированных пользователей */}
            {!loading && userData && (
              <NotificationsWidget isMobile={true} />
            )}
            <button 
              onClick={() => {
                setOpen(!open);
              }} 
              className="p-2 text-white/80 hover:text-white transition-colors duration-300" 
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
        </div>
        {/* Мобильное меню профиля */}
        {open && (
          <div className="lg:hidden mt-4 py-4 bg-black/50 backdrop-blur-xl rounded-2xl border border-white/10">
            <div className="px-4 space-y-2">
              {loading ? (
                <div className="h-12 flex items-center">
                  <div 
                    ref={mobileSpinnerRef}
                    className="w-10 h-10 rounded-full bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite] flex-shrink-0"
                  ></div>
                </div>
              ) : userData ? (
                <>
                  <Link
                    href={`/dashboard/${userData.dashboard_token}`}
                    onClick={() => setOpen(false)}
                    className="block p-4 border-b border-white/10 hover:bg-white/5 transition-colors duration-200 cursor-pointer mx-2 my-1 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      {(() => {
                        const avatarUrl = getAvatarUrl(userData.avatar);
                        const gradientClasses = getGradientClasses(userData.avatar);
                        
                        return (
                          <div className={`w-12 h-12 rounded-full overflow-hidden ${avatarUrl ? '' : gradientClasses} flex items-center justify-center text-white font-semibold text-base flex-shrink-0 relative`}>
                            {avatarUrl ? (
                              <>
                            {mobileAvatarLoading && (
                              <div 
                                className="absolute inset-0 rounded-full bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
                              />
                            )}
                                <Image
                                  src={avatarUrl}
                                  alt={userData.username}
                                  width={48}
                                  height={48}
                                  className={`w-full h-full object-cover transition-opacity duration-300 ${mobileAvatarLoading ? 'opacity-0' : 'opacity-100'}`}
                                  unoptimized
                                  onLoad={() => {
                                    if (avatarLoadFallbackRef.current) {
                                      clearTimeout(avatarLoadFallbackRef.current);
                                      avatarLoadFallbackRef.current = null;
                                    }
                                    setAvatarLoading(false);
                                    setMobileAvatarLoading(false);
                                  }}
                                  onError={() => {
                                    if (avatarLoadFallbackRef.current) {
                                      clearTimeout(avatarLoadFallbackRef.current);
                                      avatarLoadFallbackRef.current = null;
                                    }
                                    setAvatarLoading(false);
                                    setMobileAvatarLoading(false);
                                  }}
                                />
                              </>
                            ) : (
                              <>
                                {loading && (
                                  <div 
                                    className="absolute inset-0 rounded-full bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
                                  />
                                )}
                                <div className={`${loading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}>
                        {getInitial(userData.username)}
                      </div>
                              </>
                            )}
                          </div>
                        );
                      })()}
                      <div className="min-w-0 flex-1">
                        <div className={`font-medium truncate ${
                          userData.isAdmin 
                            ? 'text-orange-500' 
                            : userData.isSupport 
                            ? 'text-green-500' 
                            : 'text-white'
                        }`}>
                          {userData.username}
                        </div>
                        <div className="flex items-center gap-2 text-neutral-400 text-sm truncate">
                          <span>ID: {userData.user_id}</span>
                          <span className="text-neutral-500">•</span>
                          <span className="flex items-center gap-1">
                            <Wallet className="w-4 h-4 text-neutral-500" />
                            {userData.balance !== undefined ? `${userData.balance} ₽` : '0 ₽'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                  <div className="py-2">
                    <Link
                      href={`/dashboard/${userData.dashboard_token}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 mx-2 my-1 rounded-xl text-white/80 hover:text-white hover:bg-white/5 transition-colors duration-200"
                    >
                      <Image 
                        src={getStaticUrl("/static/icons/accounts/users.svg")} 
                        alt="Профиль" 
                        width={24} 
                        height={24} 
                        className="w-5 h-5"
                      />
                      <span>Профиль</span>
                    </Link>
                    <Link
                      href={`/dashboard/${userData.dashboard_token}#subscriptions`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 mx-2 my-1 rounded-xl text-white/80 hover:text-white hover:bg-white/5 transition-colors duration-200"
                    >
                      <Image 
                        src={getStaticUrl("/static/icons/accounts/wallet.svg")} 
                        alt="Мои тарифы" 
                        width={24} 
                        height={24} 
                        className="w-5 h-5"
                      />
                      <span>Мои тарифы</span>
                    </Link>
                    <Link
                      href="/support"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 mx-2 my-1 rounded-xl text-white/80 hover:text-white hover:bg-white/5 transition-colors duration-200"
                    >
                      <Image 
                        src={getStaticUrl("/static/icons/accounts/support.svg")} 
                        alt="Поддержка" 
                        width={24} 
                        height={24} 
                        className="w-5 h-5"
                      />
                      <span>Поддержка</span>
                    </Link>
                    <div className="border-t border-white/10 my-1 mx-2"></div>
                    <button
                      onClick={async () => {
                        setOpen(false);
                        try {
                          const response = await fetch('/api/auth/logout', {
                            method: 'POST'
                          });
                          if (response.ok) {
                            router.push('/auth');
                          }
                        } catch (error) {
                          console.error('Logout error:', error);
                        }
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 mx-2 my-1 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors duration-200"
                    >
                      <Image 
                        src={getStaticUrl("/static/icons/accounts/log-out.svg")} 
                        alt="Выйти" 
                        width={24} 
                        height={24} 
                        className="w-5 h-5"
                      />
                      <span>Выйти</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {variant === 'main' && getMobileNavigation()}
                  <div className="pt-4 border-t border-white/10">
                    <Link 
                      href="/auth" 
                      className="block text-white/80 hover:text-white transition-colors duration-300 py-2"
                    >
                      Войти
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

