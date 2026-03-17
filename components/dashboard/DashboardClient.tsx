'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useFadeIn, useStaggeredFadeIn } from '@/hooks/useGSAP';
import { getGradientClasses, getAvatarUrl, getBannerUrl } from '@/lib/utils/avatar-gradients';
import { APP_VERSION } from '@/lib/utils/constants';
import AvatarUploadModal from '@/components/auth/AvatarUploadModal';
import BannerUploadModal from '@/components/auth/BannerUploadModal';
import {
  Pencil,
  Monitor as Server,
  Activity,
  ChevronRight,
  Settings,
  Clock,
  TrendingUp,
  CreditCard,
  Wallet,
  Headphones as HeadphonesIcon,
  Calendar,
  Smartphone,
  ShoppingBag,
} from 'lucide-react';
import Header from '@/components/layout/Header';

export interface UserData {
  id: string;
  user_id: string;
  username: string;
  created_at: string;
  last_login?: string;
  avatar?: string | null;
  banner?: string | null;
  isSupport?: boolean;
  isAdmin?: boolean;
  balance?: number;
  pex?: 'u' | 's' | 'a';
}

// Компонент карточки статистики
function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  gradient = 'from-primary-500/20 to-primary-600/5',
  iconColor = 'text-primary-400',
  delay = 0,
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
      className="group relative overflow-hidden rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4 backdrop-blur-sm transition-all duration-300 hover:border-neutral-700 hover:bg-neutral-900/80 hover:shadow-lg hover:shadow-primary-500/5 sm:p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
      />
      <div className="relative z-10">
        <div className="mb-3 flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-800/80 ${iconColor} transition-transform duration-300 group-hover:scale-110`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <span className="text-sm font-medium text-neutral-400">{label}</span>
        </div>
        <div className="text-xl font-bold text-white sm:text-2xl">{value}</div>
        {subtext && <div className="mt-1 text-xs text-neutral-500">{subtext}</div>}
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
  variant = 'default',
}: {
  icon: React.ElementType;
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger';
}) {
  const variants = {
    default:
      'border-neutral-800/50 bg-neutral-900/50 hover:bg-neutral-800/80 hover:border-neutral-700 text-neutral-300 hover:text-white',
    primary:
      'border-primary-500/30 bg-primary-500/10 hover:bg-primary-500/20 hover:border-primary-500/50 text-primary-400 hover:text-primary-300',
    danger:
      'border-red-500/30 bg-red-500/10 hover:bg-red-500/20 hover:border-red-500/50 text-red-400 hover:text-red-300',
  };

  const content = (
    <>
      <Icon className="h-5 w-5" />
      <span className="text-sm font-medium">{label}</span>
      <ChevronRight className="ml-auto h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
    </>
  );

  const className = `group flex items-center gap-3 rounded-xl border p-3 sm:p-4 transition-all duration-200 ${variants[variant]}`;

  if (href) {
    return (
      <Link href={href} prefetch={false} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={className}>
      {content}
    </button>
  );
}

interface DashboardClientProps {
  userId: string;
}

export default function DashboardClient({ userId }: DashboardClientProps) {
  const utils = trpc.useUtils();
  const { userData: authData, loading } = useAuth({
    requireAuth: true,
    redirectOnFail: '/auth',
    validateUserId: userId,
    redirectOnTimeout: '/auth',
  });

  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const [bannerOverride, setBannerOverride] = useState<string | null>(null);

  const userData = useMemo<UserData | null>(() => {
    if (!authData) return null;
    return {
      id: authData.id,
      user_id: authData.user_id,
      username: authData.username,
      created_at: authData.created_at,
      last_login: authData.last_login,
      avatar: avatarOverride ?? authData.avatar,
      banner: bannerOverride ?? authData.banner,
      isSupport: authData.isSupport,
      isAdmin: authData.isAdmin,
      balance: authData.balance,
      pex: authData.pex as 'u' | 's' | 'a',
    };
  }, [authData, avatarOverride, bannerOverride]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const [currentYear] = useState(() => new Date().getFullYear());
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showBannerModal, setShowBannerModal] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(true);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement>(null);

  const heroRef = useFadeIn(0.1) as React.RefObject<HTMLDivElement>;
  const statsRef = useStaggeredFadeIn(0.2, 0.08) as React.RefObject<HTMLDivElement>;
  const actionsRef = useFadeIn(0.3) as React.RefObject<HTMLDivElement>;
  const serversRef = useFadeIn(0.4) as React.RefObject<HTMLDivElement>;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
  };

  const getShortId = (id: string) => id;

  // Закрытие десктоп-меню при переключении viewport (DevTools / resize)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => {
      if (!e.matches) setUserMenuOpen(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Проверяем, был ли клик на кнопке меню - если да, не закрываем (onClick обработает)
      if (userMenuButtonRef.current && userMenuButtonRef.current.contains(target)) {
        return;
      }

      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [userMenuOpen]);

  if (loading || !userData) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="dashboard-page">
      <Header />

      <main className="relative overflow-hidden pb-16 pt-4 lg:pt-32">
        <svg
          className="absolute inset-0 -z-10 h-full w-full opacity-20"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="dash-grad" cx="50%" cy="50%" r="75%" fx="50%" fy="50%">
              <stop offset="0%" stopColor="#16a3ff" stopOpacity="0.18" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#dash-grad)" />
          <g stroke="rgba(255,255,255,0.04)" strokeWidth="1">
            <line x1="0" y1="25%" x2="100%" y2="25%" />
            <line x1="0" y1="50%" x2="100%" y2="50%" />
            <line x1="0" y1="75%" x2="100%" y2="75%" />
          </g>
        </svg>
        <div className="pointer-events-none absolute -right-20 -top-32 -z-10 h-80 w-80 rounded-full bg-primary-500/10 blur-3xl"></div>
        <div className="pointer-events-none absolute -bottom-24 -left-24 -z-10 h-72 w-72 rounded-full bg-white/5 blur-[100px]"></div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div ref={heroRef} className="relative mb-8">
            <div className="relative h-40 overflow-hidden rounded-xl border border-neutral-800 sm:h-48 md:h-56 lg:h-64">
              {(() => {
                const bannerUrl = userData ? getBannerUrl(userData.banner) : null;
                return bannerUrl ? (
                  <Image
                    src={bannerUrl}
                    alt="Баннер профиля"
                    fill
                    sizes="100vw"
                    className="object-cover"
                    priority
                    unoptimized
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-primary-600/30 via-neutral-900 to-neutral-950" />
                );
              })()}

              <button
                onClick={() => setShowBannerModal(true)}
                className="absolute right-4 top-4 flex items-center gap-1.5 rounded-lg border-0 bg-black/30 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-md transition-all duration-200 hover:bg-black/50"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Изменить баннер</span>
              </button>
            </div>

            <div className="relative mt-[-40px] px-4 sm:mt-[-50px] sm:px-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
                <div className="flex w-full items-end gap-4 sm:w-auto">
                  {(() => {
                    const avatarUrl = getAvatarUrl(userData?.avatar);
                    const gradientClasses = getGradientClasses(userData?.avatar);

                    return (
                      <div
                        className="group relative shrink-0 cursor-pointer"
                        onClick={() => setShowAvatarModal(true)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setShowAvatarModal(true);
                          }
                        }}
                      >
                        <div
                          className={`relative h-24 w-24 overflow-hidden rounded-xl ring-1 ring-neutral-800 sm:h-28 sm:w-28 lg:h-32 lg:w-32 ${avatarUrl ? '' : gradientClasses} flex items-center justify-center bg-neutral-900 text-3xl font-bold text-white shadow-2xl transition-all duration-200 group-hover:scale-105 sm:text-4xl lg:text-5xl`}
                        >
                          {avatarUrl ? (
                            <>
                              {avatarLoading && (
                                <div className="absolute inset-0 animate-pulse rounded-xl bg-neutral-800" />
                              )}
                              <Image
                                src={avatarUrl}
                                alt={userData?.username || ''}
                                fill
                                loading="eager"
                                sizes="(max-width: 640px) 96px, (max-width: 1024px) 112px, 128px"
                                className={`rounded-xl object-cover transition-opacity duration-300 ${avatarLoading ? 'opacity-0' : 'opacity-100'}`}
                                unoptimized
                                onLoad={() => setAvatarLoading(false)}
                                onError={() => setAvatarLoading(false)}
                              />
                            </>
                          ) : userData?.username ? (
                            userData.username.charAt(0).toUpperCase()
                          ) : (
                            '—'
                          )}
                          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                            <Pencil className="h-5 w-5 text-white" />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="min-w-0 flex-1 pb-1 sm:hidden">
                    <h1
                      className={`truncate text-xl font-bold ${
                        userData?.isAdmin
                          ? 'text-orange-500'
                          : userData?.isSupport
                            ? 'text-green-500'
                            : 'text-white'
                      }`}
                    >
                      {userData?.username || '—'}
                    </h1>
                  </div>
                </div>

                <div className="w-full min-w-0 flex-1">
                  <div className="hidden sm:block">
                    <h1
                      className={`mb-1.5 truncate text-2xl font-bold lg:text-3xl ${
                        userData?.isAdmin
                          ? 'text-orange-500'
                          : userData?.isSupport
                            ? 'text-green-500'
                            : 'text-white'
                      }`}
                    >
                      {userData?.username || '—'}
                    </h1>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400 sm:gap-5 sm:text-base">
                    <div className="group/info relative" title="Ваш ID">
                      <span className="cursor-help rounded-md bg-white/5 px-2 py-1 font-mono text-sm text-neutral-400">
                        ID: {userData ? getShortId(userData.user_id) : '—'}
                      </span>
                    </div>
                    <div
                      className="group/info relative flex items-center gap-1.5 sm:gap-2"
                      title="Дата регистрации"
                    >
                      <Calendar className="h-4 w-4 text-neutral-500 sm:h-5 sm:w-5" />
                      <span className="cursor-help">
                        {userData ? formatDate(userData.created_at) : '—'}
                      </span>
                    </div>
                    <div
                      className="group/info relative flex items-center gap-1.5 sm:gap-2"
                      title="Ваш баланс"
                    >
                      <Wallet className="h-4 w-4 text-neutral-500 sm:h-5 sm:w-5" />
                      <span className="cursor-help">
                        {userData?.balance !== undefined ? `${userData.balance} ₽` : '0 ₽'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div ref={statsRef} className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
            <div ref={actionsRef} className="space-y-6 lg:col-span-2">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 backdrop-blur-sm sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">Быстрые действия</h2>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <QuickAction
                    icon={CreditCard}
                    label="Приобрести подписку"
                    href="/#pricing"
                    variant="primary"
                  />
                  <QuickAction icon={Smartphone} label="Мои устройства" href="/user/settings" />
                  <QuickAction
                    icon={HeadphonesIcon}
                    label="Связаться с поддержкой"
                    href="/support"
                  />
                  <QuickAction icon={Settings} label="Настройки аккаунта" href="/user/settings" />
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 backdrop-blur-sm sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">Мои покупки</h2>
                  <span className="text-xs text-neutral-500">0 из 3</span>
                </div>
                <div className="rounded-xl border border-dashed border-neutral-700/50 bg-neutral-950/30 p-8 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-800/50">
                    <ShoppingBag className="h-6 w-6 text-neutral-500" />
                  </div>
                  <p className="text-sm text-neutral-400">У вас пока нет покупок</p>
                </div>
              </div>
            </div>

            <div ref={serversRef} className="space-y-6">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 backdrop-blur-sm sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-neutral-400" />
                    <h2 className="text-lg font-semibold text-white">Серверы</h2>
                  </div>
                  <span className="text-xs text-neutral-500">Скоро</span>
                </div>
                <div className="rounded-xl border border-dashed border-neutral-700/50 bg-neutral-950/30 p-6 text-center">
                  <p className="text-sm text-neutral-500">Информация о серверах недоступна</p>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 backdrop-blur-sm sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-neutral-400" />
                    <h2 className="text-lg font-semibold text-white">Активность</h2>
                  </div>
                  <span className="text-xs text-neutral-500">Скоро</span>
                </div>
                <div className="rounded-xl border border-dashed border-neutral-700/50 bg-neutral-950/30 p-6 text-center">
                  <p className="text-sm text-neutral-500">История активности недоступна</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-20 border-t border-neutral-800/50">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <p className="text-sm text-neutral-500">© {currentYear} RVN. Все права защищены.</p>
            <div className="flex items-center gap-6 text-xs text-neutral-500">
              <span>v{APP_VERSION}</span>
            </div>
          </div>
        </div>
      </footer>

      <AvatarUploadModal
        isOpen={showAvatarModal}
        onClose={() => setShowAvatarModal(false)}
        onUploadComplete={(avatarPath) => {
          setAvatarLoading(true);
          setAvatarOverride(avatarPath);
          setShowAvatarModal(false);
          void utils.auth.me.invalidate();
        }}
        currentAvatarUrl={userData ? getAvatarUrl(userData.avatar) : null}
      />

      <BannerUploadModal
        isOpen={showBannerModal}
        onClose={() => setShowBannerModal(false)}
        onUploadComplete={(bannerPath) => {
          setBannerOverride(bannerPath);
          setShowBannerModal(false);
          void utils.auth.me.invalidate();
        }}
        currentBannerUrl={userData ? getBannerUrl(userData.banner) : null}
      />
    </div>
  );
}
