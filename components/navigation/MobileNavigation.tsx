'use client';

import { trpc } from '@/lib/trpc/client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { gsap } from 'gsap';
import { useAuth } from '@/hooks/useAuth';
import { getGradientClasses, getAvatarUrl } from '@/lib/utils/avatar-gradients';
import { getStaticUrl } from '@/lib/utils';
import { clearQueryCache } from '@/components/providers/TRPCProvider';
import {
  Home,
  Info,
  Bell,
  LifeBuoy,
  Menu,
  X,
  User,
  Settings,
  Receipt,
  LogOut,
  Wallet,
  ChevronRight,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';

export default function MobileNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const hasOpened = useRef(false); // Track if overlay was ever opened
  const prevPathnameRef = useRef<string | null>(null); // Only close when pathname actually changes
  const pathname = usePathname();
  const router = useRouter();

  const { userData, loading } = useAuth({ silent: true, lightweight: true });
  const { unreadCount } = useNotifications({ enabled: true });

  // Не показываем MobileMenu для страницы /protection/
  const shouldRender = !(pathname === '/protection' || pathname?.startsWith('/protection/'));

  // ── GSAP: initialize hidden state on mount ──
  useEffect(() => {
    if (!shouldRender) return;

    // Force reset GSAP state on mount to ensure clean state
    if (overlayRef.current) {
      gsap.killTweensOf(overlayRef.current);
      gsap.set(overlayRef.current, { xPercent: 100, display: 'none' });
    }
    if (backdropRef.current) {
      gsap.killTweensOf(backdropRef.current);
      gsap.set(backdropRef.current, { opacity: 0, display: 'none', pointerEvents: 'none' });
    }
    // Also ensure body overflow is reset
    document.body.style.overflow = '';
  }, [shouldRender]);

  // ── GSAP: animate open / close ──
  useEffect(() => {
    if (typeof window === 'undefined' || !shouldRender) return;

    // Kill running tweens before starting new ones
    if (overlayRef.current) gsap.killTweensOf(overlayRef.current);
    if (backdropRef.current) gsap.killTweensOf(backdropRef.current);

    if (isOpen) {
      // Always start from a clean closed state so open works after any previous stuck state
      if (overlayRef.current) {
        gsap.set(overlayRef.current, { xPercent: 100, display: 'none' });
      }
      if (backdropRef.current) {
        gsap.set(backdropRef.current, { opacity: 0, display: 'none', pointerEvents: 'none' });
      }
      hasOpened.current = true;

      // Backdrop: show + fade in
      if (backdropRef.current) {
        gsap.set(backdropRef.current, { display: 'block', pointerEvents: 'auto' });
        gsap.to(backdropRef.current, { opacity: 1, duration: 0.25, ease: 'power2.out' });
      }

      // Overlay: show at right edge, slide to 0
      if (overlayRef.current) {
        gsap.set(overlayRef.current, { display: 'flex', xPercent: 100 });
        gsap.to(overlayRef.current, { xPercent: 0, duration: 0.32, ease: 'power3.out' });
      }

      document.body.style.overflow = 'hidden';
    } else {
      // Skip close animation if never opened (e.g. initial render)
      if (!hasOpened.current) {
        if (overlayRef.current) gsap.set(overlayRef.current, { display: 'none', xPercent: 100 });
        if (backdropRef.current)
          gsap.set(backdropRef.current, { display: 'none', opacity: 0, pointerEvents: 'none' });
        return;
      }

      // Overlay: slide out to right
      if (overlayRef.current) {
        gsap.to(overlayRef.current, {
          xPercent: 100,
          duration: 0.28,
          ease: 'power3.in',
          onComplete() {
            if (overlayRef.current) gsap.set(overlayRef.current, { display: 'none' });
          },
        });
      }

      // Backdrop: fade out
      if (backdropRef.current) {
        gsap.to(backdropRef.current, {
          opacity: 0,
          duration: 0.22,
          ease: 'power2.in',
          onComplete() {
            if (backdropRef.current)
              gsap.set(backdropRef.current, { display: 'none', pointerEvents: 'none' });
          },
        });
      }

      document.body.style.overflow = '';
    }

    return () => {
      // Clean up overflow only on unmount, NOT on every effect run
      // document.body.style.overflow = '';
    };
  }, [isOpen, shouldRender]);

  // ── Close overlay only when route actually changes (not on mount/hydration) ──
  useEffect(() => {
    if (!shouldRender) return;

    const prev = prevPathnameRef.current;
    if (prev !== null && prev !== pathname) {
      if (isOpen) setIsOpen(false);
      prevPathnameRef.current = pathname;
      // Reset GSAP and hasOpened so state is clean on next page (avoids "stuck" menu)
      hasOpened.current = false;
      if (overlayRef.current) {
        gsap.killTweensOf(overlayRef.current);
        gsap.set(overlayRef.current, { xPercent: 100, display: 'none' });
      }
      if (backdropRef.current) {
        gsap.killTweensOf(backdropRef.current);
        gsap.set(backdropRef.current, { opacity: 0, display: 'none', pointerEvents: 'none' });
      }
      document.body.style.overflow = '';
    } else {
      prevPathnameRef.current = pathname;
    }
  }, [pathname, isOpen, shouldRender]);

  // ── Close overlay when viewport becomes desktop (DevTools resize) ──
  useEffect(() => {
    if (typeof window === 'undefined' || !shouldRender) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches && isOpen) {
        setIsOpen(false);
        hasOpened.current = false;
        if (overlayRef.current) gsap.set(overlayRef.current, { xPercent: 100, display: 'none' });
        if (backdropRef.current)
          gsap.set(backdropRef.current, { opacity: 0, display: 'none', pointerEvents: 'none' });
        document.body.style.overflow = '';
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [isOpen, shouldRender]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    if (!shouldRender) return;

    const overlay = overlayRef.current;
    const backdrop = backdropRef.current;

    return () => {
      if (overlay) gsap.killTweensOf(overlay);
      if (backdrop) gsap.killTweensOf(backdrop);
      document.body.style.overflow = '';
    };
  }, [shouldRender]);

  // ── Handlers ──
  const logoutMutation = trpc.auth.logout.useMutation();

  const handleLogout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync({ scope: 'user' });
      clearQueryCache();
      setIsOpen(false);
      router.push('/auth');
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, [router, logoutMutation]);

  const closeOverlay = useCallback(() => setIsOpen(false), []);
  const toggleOverlay = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) {
        // Opening: force-clear any stuck overflow from other components
        document.body.style.overflow = '';
      }
      return !prev;
    });
  }, []);
  const getInitial = (username: string) => username.charAt(0).toUpperCase();
  const isActive = (path: string) => pathname === path;
  const isActivePrefix = (prefix: string) => pathname.startsWith(prefix);

  if (!shouldRender) return null;

  return (
    <>
      {/* ===== Backdrop =====
           z-[1000] — above page content, below overlay & bottom nav */}
      <div
        ref={backdropRef}
        className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm lg:hidden"
        style={{ display: 'none', opacity: 0, pointerEvents: 'none' }}
        onClick={closeOverlay}
        aria-hidden="true"
      />

      {/* ===== Slide-in Overlay Panel =====
           z-[1001] — above backdrop, below bottom nav */}
      <div
        ref={overlayRef}
        className="fixed bottom-0 right-0 top-0 z-[1001] w-[78%] max-w-[340px] flex-col overflow-y-auto overscroll-contain border-l border-white/[0.08] bg-[#0A0A0A]/[0.98] backdrop-blur-2xl lg:hidden"
        style={{ display: 'none' }}
        role="dialog"
        aria-modal="true"
        aria-label="Меню навигации"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-3">
          <span className="text-lg font-semibold text-white">Меню</span>
          <button
            onClick={closeOverlay}
            className="rounded-xl bg-white/5 p-2 text-neutral-400 transition-all hover:bg-white/10 hover:text-white active:scale-95"
            aria-label="Закрыть меню"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User profile card */}
        <div className="px-4 pb-2">
          {loading && !userData ? (
            <div className="flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              <div className="h-12 w-12 shrink-0 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 animate-pulse rounded bg-neutral-800" />
                <div className="h-3 w-16 animate-pulse rounded bg-neutral-800/60" />
              </div>
            </div>
          ) : userData ? (
            <Link
              href={`/dashboard/${userData.user_id}`}
              prefetch={false}
              onClick={closeOverlay}
              className="group flex items-center gap-3.5 rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-4 transition-all hover:border-white/10 active:scale-[0.98]"
            >
              <div className="relative shrink-0">
                {(() => {
                  const avatarUrl = getAvatarUrl(userData.avatar);
                  const gradientClasses = getGradientClasses(userData.avatar);
                  return (
                    <div
                      className={`h-12 w-12 overflow-hidden rounded-full ${avatarUrl ? '' : gradientClasses} flex items-center justify-center text-lg font-bold text-white shadow-lg ring-2 ring-white/10`}
                    >
                      {avatarUrl ? (
                        <Image
                          src={avatarUrl}
                          alt={userData.username}
                          width={48}
                          height={48}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        getInitial(userData.username)
                      )}
                    </div>
                  );
                })()}
                {(userData.pex === 'a' ||
                  userData.pex === 's' ||
                  userData.isAdmin ||
                  userData.isSupport) && (
                  <div className="absolute -bottom-0.5 -right-0.5 rounded-full bg-neutral-950 p-0.5 ring-2 ring-neutral-950">
                    <div
                      className={`rounded-full p-0.5 ${userData.pex === 'a' || userData.isAdmin ? 'bg-orange-500/20 text-orange-500' : 'bg-green-500/20 text-green-500'}`}
                    >
                      <ShieldCheck className="h-2.5 w-2.5" />
                    </div>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate text-[15px] font-semibold ${userData.pex === 'a' || userData.isAdmin ? 'text-orange-400' : userData.pex === 's' || userData.isSupport ? 'text-green-400' : 'text-white'}`}
                >
                  {userData.username}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-neutral-500">
                  <span className="rounded bg-white/5 px-1.5 py-0.5">ID: {userData.user_id}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-600 transition-colors group-hover:text-neutral-400" />
            </Link>
          ) : (
            <Link
              href="/auth"
              prefetch={false}
              onClick={closeOverlay}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-primary-500 py-3.5 font-medium text-white shadow-glow transition-all hover:bg-primary-400 active:scale-[0.98]"
            >
              <User className="h-5 w-5" />
              <span>Войти в аккаунт</span>
            </Link>
          )}
        </div>

        {/* Balance */}
        {userData && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] px-3 py-2.5">
              <Wallet className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">
                {userData.balance || 0} ₽
              </span>
            </div>
          </div>
        )}

        <div className="mx-6 my-1 h-px bg-white/5" />

        {/* Menu items */}
        <div className="flex-1 px-3 py-2">
          <div className="flex flex-col gap-0.5">
            {userData && (
              <>
                <OverlayMenuItem
                  href={`/dashboard/${userData.user_id}#subscriptions`}
                  onClick={closeOverlay}
                  icon={CreditCard}
                  label="Мои тарифы"
                  highlight
                />
                <OverlayMenuItem
                  href={`/dashboard/${userData.user_id}`}
                  onClick={closeOverlay}
                  icon={Receipt}
                  label="Транзакции"
                />
                <OverlayMenuItem
                  href="/user/settings"
                  onClick={closeOverlay}
                  icon={Settings}
                  label="Настройки"
                />
                <OverlayMenuItem
                  href="/notifications"
                  onClick={closeOverlay}
                  icon={Bell}
                  label="Уведомления"
                  badge={
                    unreadCount > 0 ? (unreadCount > 99 ? '99+' : String(unreadCount)) : undefined
                  }
                />
                <div className="mx-2 my-2 h-px bg-white/5" />
              </>
            )}

            <OverlayMenuItem
              href="/"
              onClick={closeOverlay}
              icon={Home}
              label="Главная"
              active={isActive('/')}
            />
            <OverlayMenuItem
              href="/about"
              onClick={closeOverlay}
              icon={Info}
              label="О проекте"
              active={isActive('/about')}
            />
            <OverlayMenuItem
              href="/support"
              onClick={closeOverlay}
              icon={LifeBuoy}
              label="Поддержка"
              active={isActivePrefix('/support')}
            />

            {userData && (
              <>
                <div className="mx-2 my-2 h-px bg-white/5" />
                <button
                  onClick={handleLogout}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-red-400 transition-all hover:bg-red-500/10 hover:text-red-300 active:scale-[0.98]"
                >
                  <span className="rounded-xl bg-red-500/10 p-2 transition-colors group-hover:bg-red-500/20">
                    <LogOut className="h-4 w-4" />
                  </span>
                  <span className="font-medium">Выйти</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="h-8 shrink-0" />
      </div>

      {/* ===== Bottom Navigation Bar =====
           z-[1002] — HIGHEST layer, always clickable even when overlay is open */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-[1002] border-t border-white/[0.08] bg-neutral-950/95 backdrop-blur-xl lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Навигация"
      >
        <div className="mx-auto flex h-[60px] max-w-lg items-center justify-around px-1">
          <NavItem href="/" icon={Home} label="Главная" active={isActive('/')} />
          {userData ? (
            <NavItem
              href="/notifications"
              icon={Bell}
              label="Уведомл."
              active={isActive('/notifications')}
              prefetch={false}
              badge={unreadCount > 0 ? (unreadCount > 99 ? '99+' : String(unreadCount)) : undefined}
            />
          ) : (
            <NavItem
              href="/about"
              icon={Info}
              label="О проекте"
              active={isActive('/about')}
              prefetch={false}
            />
          )}

          {/* Center Logo Button */}
          <div className="-mt-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-primary-500 shadow-[0_0_20px_rgba(22,163,255,0.35)]">
            <Image
              src={getStaticUrl('/static/logo.svg')}
              alt="RVN"
              width={28}
              height={28}
              className="h-6 w-6"
            />
          </div>

          <NavItem
            href="/support"
            icon={LifeBuoy}
            label="Помощь"
            active={isActivePrefix('/support')}
            prefetch={false}
          />

          {/* Menu toggle — always clickable because nav is z-[70] */}
          <button
            onClick={toggleOverlay}
            className={`flex min-w-[52px] flex-col items-center justify-center gap-0.5 py-1 transition-colors ${isOpen ? 'text-white' : 'text-neutral-500 active:text-neutral-300'}`}
            aria-label={isOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={isOpen}
          >
            {userData ? (
              (() => {
                const avatarUrl = getAvatarUrl(userData.avatar);
                const gradientClasses = getGradientClasses(userData.avatar);
                return (
                  <div
                    className={`h-6 w-6 overflow-hidden rounded-full ${avatarUrl ? '' : gradientClasses} flex items-center justify-center text-[9px] font-bold ring-[1.5px] ${isOpen ? 'ring-primary-400' : 'ring-white/15'} transition-all`}
                  >
                    {avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt=""
                        width={24}
                        height={24}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="text-white">{getInitial(userData.username)}</span>
                    )}
                  </div>
                );
              })()
            ) : (
              <Menu className="h-5 w-5" />
            )}
            <span className="text-[10px] font-medium leading-tight">Меню</span>
          </button>
        </div>
      </nav>
    </>
  );
}

/* ─── Sub-components ──────────────────────────────────── */

interface NavItemProps {
  href: string;
  icon: React.ElementType;
  label: string;
  active?: boolean;
  prefetch?: boolean;
  badge?: string;
}

function NavItem({ href, icon: Icon, label, active, prefetch, badge }: NavItemProps) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={`flex min-w-[52px] flex-col items-center justify-center gap-0.5 py-1 transition-colors ${active ? 'text-white' : 'text-neutral-500 active:text-neutral-300'}`}
    >
      <div className="relative">
        <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} />
        {badge && (
          <span className="absolute -right-2.5 -top-1.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-primary-500 px-0.5 text-[8px] font-bold leading-none text-white">
            {badge}
          </span>
        )}
      </div>
      <span className="text-[10px] font-medium leading-tight">{label}</span>
    </Link>
  );
}

interface OverlayMenuItemProps {
  href: string;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  highlight?: boolean;
  active?: boolean;
  prefetch?: boolean;
  badge?: string;
}

function OverlayMenuItem({
  href,
  onClick,
  icon: Icon,
  label,
  highlight,
  active,
  prefetch = false,
  badge,
}: OverlayMenuItemProps) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-xl px-3 py-3 transition-all active:scale-[0.98] ${active ? 'bg-white/5 text-white' : 'text-neutral-300 hover:bg-white/5 hover:text-white'}`}
    >
      <span
        className={`rounded-xl p-2 transition-colors ${highlight ? 'bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20' : active ? 'bg-primary-500/10 text-primary-400' : 'bg-white/5 text-neutral-400 group-hover:bg-white/10 group-hover:text-white'}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className={`text-[15px] font-medium ${highlight ? 'text-purple-100' : ''}`}>
        {label}
      </span>
      {badge && (
        <span className="rounded-full bg-primary-500/20 px-2 py-0.5 text-[11px] font-semibold text-primary-400">
          {badge}
        </span>
      )}
      <ChevronRight className="ml-auto h-4 w-4 text-neutral-700 opacity-0 transition-all group-hover:opacity-100" />
    </Link>
  );
}
