'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useFadeIn, useStaggeredFadeIn } from '@/hooks/useGSAP';
import { gsap } from 'gsap';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { getGradientClasses, getAvatarUrl, getBannerUrl } from '@/lib/utils/avatar-gradients';
import { APP_VERSION } from '@/lib/utils/constants';
import AvatarUploadModal from '@/components/auth/AvatarUploadModal';
import BannerUploadModal from '@/components/auth/BannerUploadModal';
import { 
  Pencil, 
  Key, 
  Server, 
  Activity,
  ChevronRight,
  Settings,
  Zap,
  Clock,
  TrendingUp,
  CreditCard,
  Wallet,
  HeadphonesIcon,
  Hash,
  Calendar,
  Smartphone,
  ShoppingBag
} from 'lucide-react';

interface UserData {
  id: string;
  user_id: string;
  username: string;
  dashboard_token: string;
  created_at: string;
  last_login?: string;
  avatar?: string | null;
  banner?: string | null;
  isSupport?: boolean;
  isAdmin?: boolean;
  balance?: number;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
}

// Компонент карточки статистики
function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  subtext,
  gradient = 'from-primary-500/20 to-primary-600/5',
  iconColor = 'text-primary-400',
  delay = 0
}: { 
  icon: React.ElementType; 
  label: string; 
  value: string; 
  subtext?: string;
  gradient?: string;
  iconColor?: string;
  delay?: number;
}) {
  return (
    <div 
      className="group relative overflow-hidden rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4 sm:p-5 backdrop-blur-sm transition-all duration-300 hover:border-neutral-700 hover:bg-neutral-900/80 hover:shadow-lg hover:shadow-primary-500/5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-800/80 ${iconColor} group-hover:scale-110 transition-transform duration-300`}>
            <Icon className="h-5 w-5" />
          </div>
          <span className="text-sm text-neutral-400 font-medium">{label}</span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-white">{value}</div>
        {subtext && <div className="mt-1 text-xs text-neutral-500">{subtext}</div>}
      </div>
    </div>
  );
}

// Компонент статуса сервера
function ServerStatus({ name, status, ping }: { name: string; status: 'ok' | 'load' | 'down'; ping?: number }) {
  const statusConfig = {
    ok: { color: 'bg-green-500', text: 'text-green-400', label: 'Online', glow: 'shadow-green-500/50' },
    load: { color: 'bg-yellow-500', text: 'text-yellow-400', label: 'Load', glow: 'shadow-yellow-500/50' },
    down: { color: 'bg-red-500', text: 'text-red-400', label: 'Offline', glow: 'shadow-red-500/50' }
  };
  
  const config = statusConfig[status];
  
  return (
    <div className="group flex items-center justify-between rounded-xl border border-neutral-800/50 bg-neutral-950/60 p-3 sm:p-4 hover:bg-neutral-900/60 hover:border-neutral-700/50 transition-all duration-200">
      <div className="flex items-center gap-3">
        <div className={`h-2.5 w-2.5 rounded-full ${config.color} ${config.glow} shadow-lg`} />
        <span className="text-sm font-medium text-neutral-200">{name}</span>
      </div>
      <div className="flex items-center gap-3">
        {ping && <span className="text-xs text-neutral-500">{ping}ms</span>}
        <span className={`text-xs font-medium ${config.text}`}>{config.label}</span>
      </div>
    </div>
  );
}

// Компонент быстрого действия
function QuickAction({ 
  icon: Icon, 
  label, 
  href, 
  onClick,
  variant = 'default'
}: { 
  icon: React.ElementType; 
  label: string; 
  href?: string;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger';
}) {
  const variants = {
    default: 'border-neutral-800/50 bg-neutral-900/50 hover:bg-neutral-800/80 hover:border-neutral-700 text-neutral-300 hover:text-white',
    primary: 'border-primary-500/30 bg-primary-500/10 hover:bg-primary-500/20 hover:border-primary-500/50 text-primary-400 hover:text-primary-300',
    danger: 'border-red-500/30 bg-red-500/10 hover:bg-red-500/20 hover:border-red-500/50 text-red-400 hover:text-red-300'
  };
  
  const content = (
    <>
      <Icon className="h-5 w-5" />
      <span className="text-sm font-medium">{label}</span>
      <ChevronRight className="h-4 w-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
    </>
  );
  
  const className = `group flex items-center gap-3 rounded-xl border p-3 sm:p-4 transition-all duration-200 ${variants[variant]}`;
  
  if (href) {
    return <Link href={href} className={className}>{content}</Link>;
  }
  
  return <button onClick={onClick} className={className}>{content}</button>;
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
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showBannerModal, setShowBannerModal] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(true);
  const router = useRouter();
  const params = useParams();
  const token = params?.token as string;
  const userMenuRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const notificationsMenuRef = useRef<HTMLDivElement>(null);
  const notificationsMenuContainerRef = useRef<HTMLDivElement>(null);
  
  const heroRef = useFadeIn(0.1) as React.RefObject<HTMLDivElement>;
  const statsRef = useStaggeredFadeIn(0.2, 0.08) as React.RefObject<HTMLDivElement>;
  const actionsRef = useFadeIn(0.3) as React.RefObject<HTMLDivElement>;
  const serversRef = useFadeIn(0.4) as React.RefObject<HTMLDivElement>;

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
            if (data.authenticated === false || !data.dashboard_token) {
              try {
                await fetch('/api/auth/logout', {
                  method: 'POST',
                  credentials: 'include'
                });
              } catch {
                // Ignore logout errors
              }
              router.push('/auth');
              return;
            }
            if (data.dashboard_token !== token) {
              router.push(`/dashboard/${data.dashboard_token}`);
              return;
            }
            setUserData(data);
            setAvatarLoading(true);
          } else if (response.status === 404) {
            try {
              await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
              });
            } catch {
              // Ignore logout errors
            }
            router.push('/auth');
            return;
          } else {
            router.push('/auth');
          }
        } catch (fetchError: unknown) {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          if (!isMounted) return;

          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            router.push('/error/500');
            return;
          }
          throw fetchError;
        }
      } catch (error) {
        if (!isMounted) return;

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
  }, [token, router]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      window.location.href = '/auth/';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
  };

  const getShortId = (userId: string) => {
    return userId;
  };

  const getInitial = (username: string) => {
    return username.charAt(0).toUpperCase();
  };

  // Получение информации о роли
  const getRoleInfo = () => {
    if (userData?.isAdmin) {
      return { label: 'Администратор', color: 'text-orange-500' };
    }
    if (userData?.isSupport) {
      return { label: 'Поддержка', color: 'text-green-500' };
    }
    return { label: 'Пользователь', color: 'text-neutral-400' };
  };

  // Инициализация уведомлений
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedRead = localStorage.getItem('readNotifications');
    const readSet = storedRead ? new Set<string>(JSON.parse(storedRead)) : new Set<string>();
    setReadNotifications(readSet);
    setNotifications([]);
  }, []);

  // Обработка меню пользователя
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
      document.body.style.overflow = 'hidden';
    } else {
      if (menuRef.current) {
        gsap.to(menuRef.current, {
          opacity: 0,
          y: -10,
          scale: 0.95,
          duration: 0.15,
          ease: "power2.in",
          onComplete: () => setShouldRenderMenu(false)
        });
      } else {
        setShouldRenderMenu(false);
      }
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [userMenuOpen]);

  // Блокировка скролла
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

  // Взаимное закрытие меню
  useEffect(() => {
    if (notificationsOpen && userMenuOpen) {
      setUserMenuOpen(false);
    }
  }, [notificationsOpen, userMenuOpen]);

  useEffect(() => {
    if (userMenuOpen && notificationsOpen) {
      setNotificationsOpen(false);
    }
  }, [userMenuOpen, notificationsOpen]);

  // Анимация меню уведомлений
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
        onComplete: () => setShouldRenderNotificationsMenu(false)
      });
    }
  }, [notificationsOpen, shouldRenderNotificationsMenu]);

  // Клики вне меню
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
      if (notificationsOpen && notificationsMenuRef.current && !notificationsMenuRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    };

    if (userMenuOpen || notificationsOpen) {
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [userMenuOpen, notificationsOpen]);

  const markNotificationAsRead = (notificationId: string) => {
    const newReadSet = new Set(readNotifications);
    newReadSet.add(notificationId);
    setReadNotifications(newReadSet);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('readNotifications', JSON.stringify(Array.from(newReadSet)));
    }
  };

  const hasUnreadNotifications = notifications.some(n => !readNotifications.has(n.id));

  if (loading) {
    return <LoadingSpinner />;
  }

  const roleInfo = getRoleInfo();

  return (
    <div className="dashboard-page">
      {/* Header - старый стиль */}
      <header className="fixed top-0 left-0 right-0 pt-4 z-[999]">
        <div className="mx-auto max-w-6xl px-4">
          <div className="backdrop-blur-lg bg-neutral-900/40 border border-white/10 rounded-full px-6 py-3 flex items-center justify-between shadow-lg">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/static/logo.svg" alt="Raven Logo" width={256} height={256} className="w-6 h-6" priority/>
              <span className="font-semibold text-white">RVN</span>
            </Link>
            <nav className="hidden lg:flex items-center gap-8 text-sm text-neutral-300">
              <Link href="/" className="hover:text-white transition">Главная</Link>
              <Link href={`/dashboard/${userData?.dashboard_token}`} className="hover:text-white transition">Профиль</Link>
              <Link href="/support" className="hover:text-white transition">Поддержка</Link>
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
                {(() => {
                  const avatarUrl = getAvatarUrl(userData?.avatar);
                  const gradientClasses = getGradientClasses(userData?.avatar);
                  
                  return (
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className={`w-10 h-10 rounded-full overflow-hidden ${avatarUrl ? '' : gradientClasses} flex items-center justify-center text-white font-semibold text-sm transition-transform duration-200 hover:scale-110 cursor-pointer`}
                  title={userData.username}
                  aria-label="Меню пользователя"
                  aria-expanded={userMenuOpen}
                >
                      {avatarUrl ? (
                        <Image
                          src={avatarUrl}
                          alt={userData.username}
                          width={40}
                          height={40}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      ) : (
                        getInitial(userData.username)
                      )}
                </button>
                  );
                })()}
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
                        {(() => {
                          const avatarUrl = getAvatarUrl(userData?.avatar);
                          const gradientClasses = getGradientClasses(userData?.avatar);
                          
                          return (
                            <div className={`w-12 h-12 rounded-full overflow-hidden ${avatarUrl ? '' : gradientClasses} flex items-center justify-center text-white font-semibold text-base flex-shrink-0`}>
                              {avatarUrl ? (
                                <Image
                                  src={avatarUrl}
                                  alt={userData.username}
                                  width={48}
                                  height={48}
                                  className="w-full h-full object-cover"
                                  unoptimized
                                />
                              ) : (
                                getInitial(userData.username)
                              )}
                        </div>
                          );
                        })()}
                        <div className="min-w-0 flex-1">
                          <div className="text-white font-medium truncate">{userData.username}</div>
                          <div className={`text-sm truncate ${roleInfo.color}`}>{roleInfo.label}</div>
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
                    {(() => {
                      const avatarUrl = getAvatarUrl(userData?.avatar);
                      const gradientClasses = getGradientClasses(userData?.avatar);
                      
                      return (
                        <div className={`w-12 h-12 rounded-full overflow-hidden ${avatarUrl ? '' : gradientClasses} flex items-center justify-center text-white font-semibold text-base flex-shrink-0`}>
                          {avatarUrl ? (
                            <Image
                              src={avatarUrl}
                              alt={userData.username}
                              width={48}
                              height={48}
                              className="w-full h-full object-cover"
                              unoptimized
                            />
                          ) : (
                            getInitial(userData.username)
                          )}
                    </div>
                      );
                    })()}
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
        <svg className="absolute inset-0 w-full h-full opacity-20 -z-10" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" aria-hidden="true">
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
          {/* Hero Section with Banner */}
          <div ref={heroRef} className="relative mb-8">
            {/* Banner */}
            <div className="relative h-40 sm:h-48 md:h-56 lg:h-64 rounded-xl overflow-hidden border border-neutral-800">
              {(() => {
                const bannerUrl = userData ? getBannerUrl(userData.banner) : null;
                return bannerUrl ? (
                  <Image
                    src={bannerUrl}
                    alt="Баннер профиля"
                    fill
                    className="object-cover"
                    priority
                    unoptimized
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-primary-600/30 via-neutral-900 to-neutral-950" />
                );
              })()}
              
              {/* Edit Banner Button */}
              <button
                onClick={() => setShowBannerModal(true)}
                className="absolute top-4 right-4 px-3 py-1.5 text-xs font-medium text-white/80 bg-black/30 hover:bg-black/50 backdrop-blur-md rounded-lg transition-all duration-200 flex items-center gap-1.5 border-0"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Изменить баннер</span>
              </button>
            </div>

            {/* Profile Info - под баннером */}
            <div className="relative mt-[-40px] sm:mt-[-50px] px-4 sm:px-6">
              <div className="flex items-end gap-4 sm:gap-6">
                {/* Avatar - выступает над нижним краем баннера */}
                {(() => {
                  const avatarUrl = getAvatarUrl(userData?.avatar);
                  const gradientClasses = getGradientClasses(userData?.avatar);
                  
                  return (
                    <div 
                      className="relative group cursor-pointer shrink-0"
                      onClick={() => setShowAvatarModal(true)}
                    >
                      <div className={`h-24 w-24 sm:h-28 sm:w-28 lg:h-32 lg:w-32 rounded-xl overflow-hidden border border-neutral-800 ${avatarUrl ? '' : gradientClasses} flex items-center justify-center text-white font-bold text-3xl sm:text-4xl lg:text-5xl shadow-2xl transition-all duration-200 group-hover:scale-105 bg-neutral-900`}>
                        {avatarUrl ? (
                          <>
                            {avatarLoading && (
                              <div className="absolute inset-0 bg-neutral-800 animate-pulse rounded-xl" />
                            )}
                            <Image
                              src={avatarUrl}
                              alt={userData?.username || ''}
                              fill
                              className={`object-cover rounded-xl transition-opacity duration-300 ${avatarLoading ? 'opacity-0' : 'opacity-100'}`}
                              unoptimized
                              onLoad={() => setAvatarLoading(false)}
                              onError={() => setAvatarLoading(false)}
                            />
                          </>
                        ) : (
                          userData?.username ? userData.username.charAt(0).toUpperCase() : '—'
                        )}
                        {/* Dark overlay on hover */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center rounded-xl">
                          <Pencil className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* User Info - справа от аватарки */}
                <div className="flex-1 min-w-0 pb-2">
                  <h1 className={`text-xl sm:text-2xl lg:text-3xl font-bold truncate mb-1 ${
                    userData?.isAdmin 
                      ? 'text-orange-500' 
                      : userData?.isSupport 
                      ? 'text-green-500' 
                      : 'text-white'
                  }`}>
                    {userData?.username || '—'}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-sm sm:text-base text-neutral-400">
                    <div className="group/info relative" title="Ваш ID">
                      <span className="cursor-help">ID: {userData ? getShortId(userData.user_id) : '—'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 group/info relative" title="Дата регистрации">
                      <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-500" />
                      <span className="cursor-help">{userData ? formatDate(userData.created_at) : '—'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 group/info relative" title="Ваш баланс">
                      <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-500" />
                      <span className="cursor-help">{userData?.balance !== undefined ? `${userData.balance} ₽` : '0 ₽'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div ref={statsRef} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
            <StatCard
              icon={CreditCard}
              label="Подписка"
              value="Нет"
              subtext="Не активна"
              delay={0}
            />
            <StatCard
              icon={Smartphone}
              label="Устройства"
              value="0"
              subtext="Нет активных"
              gradient="from-purple-500/20 to-purple-600/5"
              iconColor="text-purple-400"
              delay={80}
            />
            <StatCard
              icon={Clock}
              label="Осталось"
              value="—"
              subtext="Дней подписки"
              gradient="from-emerald-500/20 to-emerald-600/5"
              iconColor="text-emerald-400"
              delay={160}
            />
            <StatCard
              icon={TrendingUp}
              label="Трафик"
              value="∞"
              subtext="Безлимитный"
              gradient="from-amber-500/20 to-amber-600/5"
              iconColor="text-amber-400"
              delay={240}
            />
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* Left Column - Quick Actions */}
            <div ref={actionsRef} className="lg:col-span-2 space-y-6">
              {/* Quick Actions */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">Быстрые действия</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <QuickAction
                    icon={CreditCard}
                    label="Приобрести подписку"
                    href="/#pricing"
                    variant="primary"
                  />
                  <QuickAction
                    icon={Smartphone}
                    label="Мои устройства"
                    href={`/dashboard/${userData?.dashboard_token}#keys`}
                  />
                  <QuickAction
                    icon={HeadphonesIcon}
                    label="Связаться с поддержкой"
                    href="/support"
                  />
                  <QuickAction
                    icon={Settings}
                    label="Настройки аккаунта"
                    href={`/dashboard/${userData?.dashboard_token}#settings`}
                  />
                </div>
              </div>

              {/* Subscription Info */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">Мои покупки</h2>
                  <span className="text-xs text-neutral-500">0 из 3</span>
                </div>
                <div className="rounded-xl border border-dashed border-neutral-700/50 bg-neutral-950/30 p-8 text-center">
                  <div className="w-12 h-12 rounded-xl bg-neutral-800/50 flex items-center justify-center mx-auto mb-4">
                    <ShoppingBag className="w-6 h-6 text-neutral-500" />
                  </div>
                  <p className="text-neutral-400 text-sm">У вас пока нет покупок</p>
                </div>
              </div>
            </div>

            {/* Right Column - Server Status */}
            <div ref={serversRef} className="space-y-6">
              {/* Server Status */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-neutral-400" />
                    <h2 className="text-lg font-semibold text-white">Серверы</h2>
                  </div>
                  <span className="text-xs text-neutral-500">Скоро</span>
                </div>
                <div className="rounded-xl border border-dashed border-neutral-700/50 bg-neutral-950/30 p-6 text-center">
                  <p className="text-neutral-500 text-sm">
                    Информация о серверах недоступна
                  </p>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-neutral-400" />
                    <h2 className="text-lg font-semibold text-white">Активность</h2>
                  </div>
                  <span className="text-xs text-neutral-500">Скоро</span>
                </div>
                <div className="rounded-xl border border-dashed border-neutral-700/50 bg-neutral-950/30 p-6 text-center">
                  <p className="text-neutral-500 text-sm">
                    История активности недоступна
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer - старый стиль */}
      <footer className="mt-20 border-t border-neutral-800/50">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-neutral-500">
              © {currentYear} RVN. Все права защищены.
            </p>
            <div className="flex items-center gap-6 text-xs text-neutral-500">
              <span>v{APP_VERSION}</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <AvatarUploadModal
        isOpen={showAvatarModal}
        onClose={() => setShowAvatarModal(false)}
        onUploadComplete={(avatarPath) => {
          setAvatarLoading(true);
          if (userData) {
            setUserData({
              ...userData,
              avatar: avatarPath,
            });
          }
          setShowAvatarModal(false);
        }}
        currentAvatarUrl={userData ? getAvatarUrl(userData.avatar) : null}
      />

      <BannerUploadModal
        isOpen={showBannerModal}
        onClose={() => setShowBannerModal(false)}
        onUploadComplete={(bannerPath) => {
          if (userData) {
            setUserData({
              ...userData,
              banner: bannerPath,
            });
          }
          setShowBannerModal(false);
        }}
        currentBannerUrl={userData ? getBannerUrl(userData.banner) : null}
      />
    </div>
  );
}
