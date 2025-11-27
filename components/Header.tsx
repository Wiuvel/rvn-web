'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { gsap } from 'gsap';
import { Notification } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { UserMenu } from '@/components/UserMenu';
import { NotificationsMenu } from '@/components/NotificationsMenu';
import { GSAP_DEFAULT_DURATION, GSAP_DEFAULT_EASE } from '@/lib/constants';

export default function Header() {
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readNotifications, setReadNotifications] = useState<Set<string>>(new Set());
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const notificationsMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const notificationsButtonRef = useRef<HTMLButtonElement | null>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);
  const mobileSpinnerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  
  // Используем новый хук useAuth
  const { userData, loading } = useAuth({ silent: true });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    gsap.fromTo('.header-container', 
      { 
        opacity: 0, 
        y: -10 
      },
      { 
        opacity: 1, 
        y: 0, 
        duration: GSAP_DEFAULT_DURATION, 
        ease: GSAP_DEFAULT_EASE,
        delay: 0.1
      }
    );
  }, []);

  // useAuth хук теперь обрабатывает всю логику авторизации

  // Инициализация уведомлений и загрузка из localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Загружаем прочитанные уведомления из localStorage
    const storedRead = localStorage.getItem('readNotifications');
    const readSet = storedRead ? new Set<string>(JSON.parse(storedRead)) : new Set<string>();
    setReadNotifications(readSet);

    // Пока уведомления пустые, в будущем можно загружать с сервера
    setNotifications([]);
  }, []);

  // GSAP анимация для спиннера
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
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

  // Блокировка скролла при открытом меню
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    if (userMenuOpen || notificationsOpen) {
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
  }, [userMenuOpen, notificationsOpen]);

  // Взаимное закрытие меню - закрываем другое меню при открытии нового
  useEffect(() => {
    // Если открывается меню уведомлений, закрываем меню пользователя
    if (notificationsOpen && userMenuOpen) {
      setUserMenuOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationsOpen]); // Срабатывает только при изменении notificationsOpen

  useEffect(() => {
    // Если открывается меню пользователя, закрываем меню уведомлений
    if (userMenuOpen && notificationsOpen) {
      setNotificationsOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userMenuOpen]); // Срабатывает только при изменении userMenuOpen
  
  // Функция для отметки уведомления как прочитанного
  const markNotificationAsRead = (notificationId: string) => {
    const newReadSet = new Set(readNotifications);
    newReadSet.add(notificationId);
    setReadNotifications(newReadSet);
    
    // Сохраняем в localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('readNotifications', JSON.stringify(Array.from(newReadSet)));
    }
  };

  // Анимации меню теперь обрабатываются в компонентах UserMenu и NotificationsMenu

  // Закрытие меню при клике вне его
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Проверяем, был ли клик на кнопках меню - если да, не закрываем
      if (userMenuButtonRef.current && userMenuButtonRef.current.contains(target)) {
        return; // Клик на кнопке пользователя - не закрываем, onClick обработает
      }
      if (notificationsButtonRef.current && notificationsButtonRef.current.contains(target)) {
        return; // Клик на кнопке уведомлений - не закрываем, onClick обработает
      }
      
      // Проверяем, что клик был вне контейнера меню
      // Закрываем только то меню, которое действительно открыто
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
      if (notificationsOpen && notificationsMenuRef.current && !notificationsMenuRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    };

    if (userMenuOpen || notificationsOpen) {
      // Используем небольшую задержку, чтобы onClick кнопки успел сработать первым
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside, true);
      }, 0);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('click', handleClickOutside, true);
      };
    }
  }, [userMenuOpen, notificationsOpen]);

  // Проверка наличия непрочитанных уведомлений
  const hasUnreadNotifications = notifications.some(n => !readNotifications.has(n.id));

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
            <Link href="/support" className="hover:text-white transition">Поддержка</Link>
            <Link href="#faq" className="hover:text-white transition">FAQ</Link>
          </nav>
          <div className="hidden lg:flex items-center gap-2 relative" ref={userMenuRef}>
            {loading ? (
              <div 
                ref={spinnerRef}
                className="w-10 h-10 rounded-full bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
              ></div>
            ) : userData ? (
              <>
                <div className="relative" ref={notificationsMenuRef}>
                  <button
                    ref={notificationsButtonRef}
                    onClick={(e) => {
                      e.stopPropagation();
                      setNotificationsOpen(!notificationsOpen);
                    }}
                    className="w-10 h-10 rounded-full bg-neutral-800/60 hover:bg-neutral-700/60 flex items-center justify-center text-white/80 hover:text-white transition-all duration-200 hover:scale-110 cursor-pointer mr-2"
                    title="Уведомления"
                    aria-label="Уведомления"
                    aria-expanded={notificationsOpen}
                  >
                    <Image 
                      src={hasUnreadNotifications ? "/static/icons/accounts/bell-dot.svg" : "/static/icons/accounts/bell.svg"} 
                      alt="Уведомления" 
                      width={18} 
                      height={18} 
                      className="w-[18px] h-[18px]"
                    />
                  </button>
                  <NotificationsMenu
                    notifications={notifications}
                    readNotifications={readNotifications}
                    isOpen={notificationsOpen}
                    onClose={() => setNotificationsOpen(false)}
                    onMarkAsRead={markNotificationAsRead}
                    menuRef={notificationsMenuRef}
                  />
                </div>
                <button
                  ref={userMenuButtonRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    setUserMenuOpen(!userMenuOpen);
                  }}
                  className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm shadow-glow transition-transform duration-200 hover:scale-110 cursor-pointer"
                  title={userData.username}
                  aria-label="Меню пользователя"
                  aria-expanded={userMenuOpen}
                >
                  {getInitial(userData.username)}
                </button>
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
            <div className="px-4 space-y-2">
              {loading ? (
                <div 
                  ref={mobileSpinnerRef}
                  className="w-10 h-10 rounded-full bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
                ></div>
              ) : userData ? (
                <>
                  <Link
                    href={`/dashboard/${userData.dashboard_token}`}
                    onClick={() => setOpen(false)}
                    className="block p-4 border-b border-white/10 hover:bg-white/5 transition-colors duration-200 cursor-pointer mx-2 my-1 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-base flex-shrink-0">
                        {getInitial(userData.username)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-white font-medium truncate">{userData.username}</div>
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
                        src="/static/icons/accounts/users.svg" 
                        alt="Профиль" 
                        width={20} 
                        height={20} 
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
                        src="/static/icons/accounts/wallet.svg" 
                        alt="Мои тарифы" 
                        width={20} 
                        height={20} 
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
                        src="/static/icons/accounts/support.svg" 
                        alt="Поддержка" 
                        width={20} 
                        height={20} 
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
                        src="/static/icons/accounts/log-out.svg" 
                        alt="Выйти" 
                        width={20} 
                        height={20} 
                        className="w-5 h-5"
                      />
                      <span>Выйти</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <Link 
                    href="#pricing" 
                    onClick={() => setOpen(false)} 
                    className="block text-white/80 hover:text-white transition-colors duration-300 py-2"
                  >
                    Тарифы
                  </Link>
                  <Link 
                    href="/support" 
                    onClick={() => setOpen(false)} 
                    className="block text-white/80 hover:text-white transition-colors duration-300 py-2"
                  >
                    Поддержка
                  </Link>
                  <Link 
                    href="#faq" 
                    onClick={() => setOpen(false)} 
                    className="block text-white/80 hover:text-white transition-colors duration-300 py-2"
                  >
                    FAQ
                  </Link>
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

