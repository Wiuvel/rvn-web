'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useFadeIn, useStaggeredFadeIn } from '@/hooks/useGSAP';
import { gsap } from 'gsap';
import LoadingSpinner from '@/components/LoadingSpinner';

interface UserData {
  id: string;
  user_id: string;
  username: string;
  dashboard_token: string;
  created_at: string;
  last_login?: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
}

export default function DashboardPage() {
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [shouldRenderMenu, setShouldRenderMenu] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [shouldRenderNotificationsMenu, setShouldRenderNotificationsMenu] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentYear] = useState(new Date().getFullYear());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readNotifications, setReadNotifications] = useState<Set<string>>(new Set());
  const router = useRouter();
  const params = useParams();
  const token = params?.token as string;
  const userMenuRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const notificationsMenuRef = useRef<HTMLDivElement>(null);
  const notificationsMenuContainerRef = useRef<HTMLDivElement>(null);
  
  const titleRef = useFadeIn(0.1) as React.RefObject<HTMLDivElement>;
  const profileRef = useFadeIn(0.2) as React.RefObject<HTMLDivElement>;
  const cardsRef = useStaggeredFadeIn(0.3, 0.1) as React.RefObject<HTMLDivElement>;
  const serversRef = useFadeIn(0.4) as React.RefObject<HTMLDivElement>;
  const eventsRef = useFadeIn(0.5) as React.RefObject<HTMLDivElement>;

  useEffect(() => {
    if (!token) {
      router.push('/auth');
      return;
    }

    let isMounted = true;
    let controller: AbortController | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const fetchUserData = async () => {
      try {
        // Создаем AbortController для таймаута
        controller = new AbortController();
        timeoutId = setTimeout(() => controller!.abort(), 10000);

        try {
          const response = await fetch('/api/auth/me', {
            signal: controller.signal
          });
          
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          if (!isMounted) return;

          if (response.ok) {
            const data = await response.json();
            // Проверяем, что пользователь авторизован
            if (data.authenticated === false || !data.dashboard_token) {
              router.push('/auth');
              return;
            }
            // Проверяем что токен совпадает
            if (data.dashboard_token !== token) {
              router.push('/auth');
              return;
            }
            setUserData(data);
          } else {
            router.push('/auth');
          }
        } catch (fetchError: unknown) {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          if (!isMounted) return;

          // Если запрос был прерван из-за таймаута
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            // Перенаправляем на страницу 500
            router.push('/error/500');
            return;
          }
          throw fetchError;
        }
      } catch (error) {
        if (!isMounted) return;

        console.error('Failed to fetch user data:', error);
        // Проверяем, не является ли это таймаутом
        if (error instanceof Error && error.name === 'AbortError') {
          router.push('/error/500');
        } else {
          router.push('/auth');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchUserData();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (controller) {
        controller.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleLogout = async () => {
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
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getShortId = (userId: string) => {
    return `#${userId}`;
  };

  const getInitial = (username: string) => {
    return username.charAt(0).toUpperCase();
  };

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

  // Обработка открытия/закрытия меню
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (userMenuOpen) {
      setShouldRenderMenu(true);
      if (menuRef.current) {
        gsap.fromTo(menuRef.current,
          { opacity: 0, y: -10, scale: 0.95 },
          { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: "power2.out" }
        );
      }
      // Блокируем скролл
      document.body.style.overflow = 'hidden';
    } else {
      if (menuRef.current) {
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
      } else {
        setShouldRenderMenu(false);
      }
      // Разблокируем скролл
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [userMenuOpen]);

  // Блокировка скролла при открытом меню уведомлений
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    if (notificationsOpen) {
      document.body.style.overflow = 'hidden';
    } else if (!userMenuOpen) {
      document.body.style.overflow = '';
    }

    return () => {
      if (!userMenuOpen) {
        document.body.style.overflow = '';
      }
    };
  }, [notificationsOpen, userMenuOpen]);

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

  // Управление рендерингом и анимацией меню уведомлений
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    if (notificationsOpen) {
      setShouldRenderNotificationsMenu(true);
      requestAnimationFrame(() => {
        if (notificationsMenuContainerRef.current) {
          gsap.set(notificationsMenuContainerRef.current, {
            opacity: 0,
            y: -10,
            scale: 0.95
          });
          gsap.to(notificationsMenuContainerRef.current, {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.2,
            ease: "power2.out"
          });
        }
      });
    } else if (shouldRenderNotificationsMenu && notificationsMenuContainerRef.current) {
      gsap.to(notificationsMenuContainerRef.current, {
        opacity: 0,
        y: -10,
        scale: 0.95,
        duration: 0.15,
        ease: "power2.in",
        onComplete: () => {
          setShouldRenderNotificationsMenu(false);
        }
      });
    }
  }, [notificationsOpen, shouldRenderNotificationsMenu]);

  // Обработка кликов вне меню
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
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
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [userMenuOpen, notificationsOpen]);

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

  // Проверка наличия непрочитанных уведомлений
  const hasUnreadNotifications = notifications.some(n => !readNotifications.has(n.id));

  if (loading) {
    return <LoadingSpinner />;
  }

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
            {userData && (
              <div className="hidden lg:flex items-center gap-2 relative" ref={userMenuRef}>
                <div className="relative" ref={notificationsMenuRef}>
                  <button
                    onClick={() => setNotificationsOpen(!notificationsOpen)}
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
                  {shouldRenderNotificationsMenu && (
                    <div 
                      ref={notificationsMenuContainerRef}
                      className="absolute -right-3 top-full mt-4 w-80 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl overflow-hidden z-50"
                    >
                      <div className="p-4 border-b border-white/10 mx-2">
                        <h3 className="text-white font-semibold text-sm">Уведомления</h3>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-4 text-center text-neutral-400 text-sm">
                            Нет уведомлений
                          </div>
                        ) : (
                          <div className="py-2">
                            {notifications.map((notification) => {
                              const isRead = readNotifications.has(notification.id);
                              return (
                                <div
                                  key={notification.id}
                                  onClick={() => markNotificationAsRead(notification.id)}
                                  className={`px-4 py-3 mx-2 my-1 rounded-xl cursor-pointer transition-colors duration-200 ${
                                    !isRead 
                                      ? 'bg-blue-500/10 hover:bg-blue-500/20 border-l-2 border-blue-500' 
                                      : 'hover:bg-white/5'
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    {!isRead && (
                                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0"></div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="text-white font-medium text-sm mb-1">
                                        {notification.title}
                                      </div>
                                      <div className="text-neutral-400 text-xs">
                                        {notification.message}
                                      </div>
                                      <div className="text-neutral-500 text-xs mt-1">
                                        {new Date(notification.created_at).toLocaleDateString('ru-RU', {
                                          day: 'numeric',
                                          month: 'short',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm shadow-glow transition-transform duration-200 hover:scale-110 cursor-pointer"
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
                    <Link
                      href={`/dashboard/${userData.dashboard_token}`}
                      onClick={() => setUserMenuOpen(false)}
                      className="block p-4 border-b border-white/10 hover:bg-white/5 transition-colors duration-200 cursor-pointer mx-2 my-1 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-base flex-shrink-0">
                          {getInitial(userData.username)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-white font-medium truncate">{userData.username}</div>
                          <div className="text-neutral-400 text-xs truncate">Пользователь</div>
                        </div>
                      </div>
                    </Link>
                    <div className="py-2">
                      <Link
                        href={`/dashboard/${userData.dashboard_token}#subscriptions`}
                        onClick={() => setUserMenuOpen(false)}
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
                        onClick={() => setUserMenuOpen(false)}
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
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleLogout();
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
                  </div>
                )}
              </div>
            )}
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
          {open && userData && (
            <div className="lg:hidden mt-4 py-4 bg-black/50 backdrop-blur-lg rounded-2xl border border-white/10"style={{animation: 'fadeIn 0.2s ease-out'}}>
              <div className="px-4 space-y-2">
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
                    href="/contacts"
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
                    onClick={() => {
                      setOpen(false);
                      handleLogout();
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
                <div className="text-lg font-medium">{userData?.username || '—'}</div>
                <div className="mt-1 text-sm text-neutral-400 flex flex-wrap gap-x-4 gap-y-1">
                  <div><span className="text-neutral-500">ID:</span> {userData ? getShortId(userData.user_id) : '—'}</div>
                  <div><span className="text-neutral-500">Дата регистрации:</span> {userData ? formatDate(userData.created_at) : '—'}</div>
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
              <Link href="/support" className="mt-2 inline-block text-primary-400 hover:underline hover:text-primary-300 transition-colors">
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

