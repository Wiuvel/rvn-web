'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { gsap } from 'gsap';
import { useAuth } from '@/hooks/useAuth';
import { getGradientClasses, getAvatarUrl } from '@/lib/utils/avatar-gradients';
import { getStaticUrl } from '@/lib/utils';
import {
  Home,
  Info,
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

export default function MobileNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const hasOpened = useRef(false); // Track if overlay was ever opened
  const prevPathnameRef = useRef<string | null>(null); // Only close when pathname actually changes
  const pathname = usePathname();
  const router = useRouter();

  const { userData, loading } = useAuth({ silent: true, lightweight: true });

  // ── GSAP: initialize hidden state on mount ──
  useEffect(() => {
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
  }, []);

  // ── GSAP: animate open / close ──
  useEffect(() => {
    if (typeof window === 'undefined') return;

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
         if (backdropRef.current) gsap.set(backdropRef.current, { display: 'none', opacity: 0, pointerEvents: 'none' });
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
            if (backdropRef.current) gsap.set(backdropRef.current, { display: 'none', pointerEvents: 'none' });
          },
        });
      }

      document.body.style.overflow = '';
    }

    return () => {
      // Clean up overflow only on unmount, NOT on every effect run
      // document.body.style.overflow = ''; 
    };
  }, [isOpen]);

  // ── Close overlay only when route actually changes (not on mount/hydration) ──
  useEffect(() => {
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
  }, [pathname, isOpen]);

  // ── Close overlay when viewport becomes desktop (DevTools resize) ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches && isOpen) {
        setIsOpen(false);
        hasOpened.current = false;
        if (overlayRef.current) gsap.set(overlayRef.current, { xPercent: 100, display: 'none' });
        if (backdropRef.current) gsap.set(backdropRef.current, { opacity: 0, display: 'none', pointerEvents: 'none' });
        document.body.style.overflow = '';
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [isOpen]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (overlayRef.current) gsap.killTweensOf(overlayRef.current);
      if (backdropRef.current) gsap.killTweensOf(backdropRef.current);
      document.body.style.overflow = '';
    };
  }, []);

  // ── Handlers ──
  const handleLogout = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (response.ok) {
        setIsOpen(false);
        router.push('/auth');
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, [router]);

  const closeOverlay = useCallback(() => setIsOpen(false), []);
  const toggleOverlay = useCallback(() => {
    setIsOpen(prev => {
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

  return (
    <>
      {/* ===== Backdrop =====
           z-[1000] — above page content, below overlay & bottom nav */}
      <div
        ref={backdropRef}
        className="lg:hidden fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm"
        style={{ display: 'none', opacity: 0, pointerEvents: 'none' }}
        onClick={closeOverlay}
        aria-hidden="true"
      />

      {/* ===== Slide-in Overlay Panel =====
           z-[1001] — above backdrop, below bottom nav */}
      <div
        ref={overlayRef}
        className="lg:hidden fixed top-0 right-0 bottom-0 z-[1001] w-[78%] max-w-[340px] bg-[#0A0A0A]/[0.98] backdrop-blur-2xl border-l border-white/[0.08] flex-col overflow-y-auto overscroll-contain"
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
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all active:scale-95"
            aria-label="Закрыть меню"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User profile card */}
        <div className="px-4 pb-2">
          {loading && !userData ? (
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite] shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 rounded bg-neutral-800 animate-pulse" />
                <div className="h-3 w-16 rounded bg-neutral-800/60 animate-pulse" />
              </div>
            </div>
          ) : userData ? (
            <Link
              href={`/dashboard/${userData.user_id}`}
              onClick={closeOverlay}
              className="group flex items-center gap-3.5 p-4 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/5 hover:border-white/10 transition-all active:scale-[0.98]"
            >
              <div className="relative shrink-0">
                {(() => {
                  const avatarUrl = getAvatarUrl(userData.avatar);
                  const gradientClasses = getGradientClasses(userData.avatar);
                  return (
                    <div className={`w-12 h-12 rounded-full overflow-hidden ${avatarUrl ? '' : gradientClasses} flex items-center justify-center text-white font-bold text-lg ring-2 ring-white/10 shadow-lg`}>
                      {avatarUrl ? (
                        <Image src={avatarUrl} alt={userData.username} width={48} height={48} className="w-full h-full object-cover" unoptimized />
                      ) : (
                        getInitial(userData.username)
                      )}
                    </div>
                  );
                })()}
                {(userData.pex === 'a' || userData.pex === 's' || userData.isAdmin || userData.isSupport) && (
                  <div className="absolute -bottom-0.5 -right-0.5 bg-neutral-950 rounded-full p-0.5 ring-2 ring-neutral-950">
                    <div className={`p-0.5 rounded-full ${userData.pex === 'a' || userData.isAdmin ? 'bg-orange-500/20 text-orange-500' : 'bg-green-500/20 text-green-500'}`}>
                      <ShieldCheck className="w-2.5 h-2.5" />
                    </div>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`font-semibold text-[15px] truncate ${userData.pex === 'a' || userData.isAdmin ? 'text-orange-400' : userData.pex === 's' || userData.isSupport ? 'text-green-400' : 'text-white'}`}>
                  {userData.username}
                </div>
                <div className="text-[11px] text-neutral-500 font-mono mt-0.5">
                  <span className="bg-white/5 px-1.5 py-0.5 rounded">ID: {userData.user_id}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-600 group-hover:text-neutral-400 transition-colors shrink-0" />
            </Link>
          ) : (
            <Link
              href="/auth"
              onClick={closeOverlay}
              className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-2xl bg-primary-500 hover:bg-primary-400 text-white font-medium transition-all active:scale-[0.98] shadow-glow"
            >
              <User className="w-5 h-5" />
              <span>Войти в аккаунт</span>
            </Link>
          )}
        </div>

        {/* Balance */}
        {userData && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15">
              <Wallet className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">{userData.balance || 0} ₽</span>
            </div>
          </div>
        )}

        <div className="h-px bg-white/5 mx-6 my-1" />

        {/* Menu items */}
        <div className="flex-1 px-3 py-2">
          <div className="flex flex-col gap-0.5">
            {userData && (
              <>
                <OverlayMenuItem href={`/dashboard/${userData.user_id}#subscriptions`} onClick={closeOverlay} icon={CreditCard} label="Мои тарифы" highlight />
                <OverlayMenuItem href={`/dashboard/${userData.user_id}`} onClick={closeOverlay} icon={Receipt} label="Транзакции" />
                <OverlayMenuItem href={`/dashboard/${userData.user_id}/settings`} onClick={closeOverlay} icon={Settings} label="Настройки" />
                <div className="h-px bg-white/5 mx-2 my-2" />
              </> 
            )}

            <OverlayMenuItem href="/" onClick={closeOverlay} icon={Home} label="Главная" active={isActive('/')} />
            <OverlayMenuItem href="/about" onClick={closeOverlay} icon={Info} label="О проекте" active={isActive('/about')} />
            <OverlayMenuItem href="/support" onClick={closeOverlay} icon={LifeBuoy} label="Поддержка" active={isActivePrefix('/support')} />

            {userData && (
              <>
                <div className="h-px bg-white/5 mx-2 my-2" />
                <button
                  onClick={handleLogout}
                  className="group w-full flex items-center gap-3 px-3 py-3 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all active:scale-[0.98]"
                >
                  <span className="p-2 rounded-xl bg-red-500/10 group-hover:bg-red-500/20 transition-colors">
                    <LogOut className="w-4 h-4" />
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
        className="lg:hidden fixed bottom-0 left-0 right-0 z-[1002] bg-neutral-950/95 backdrop-blur-xl border-t border-white/[0.08]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Навигация"
      >
        <div className="flex items-center justify-around h-[60px] px-1 max-w-lg mx-auto">
          <NavItem href="/" icon={Home} label="Главная" active={isActive('/')} />
          <NavItem href="/about" icon={Info} label="О проекте" active={isActive('/about')} />

          {/* Center Logo Button */}
          <Link
            href="/"
            className="flex items-center justify-center -mt-4 w-[52px] h-[52px] rounded-2xl bg-primary-500 shadow-[0_0_20px_rgba(22,163,255,0.35)] transition-all active:scale-90 hover:shadow-[0_0_28px_rgba(22,163,255,0.55)]"
          >
            <Image src={getStaticUrl('/static/logo.svg')} alt="RVN" width={28} height={28} className="w-6 h-6" />
          </Link>

          <NavItem href="/support" icon={LifeBuoy} label="Помощь" active={isActivePrefix('/support')} />

          {/* Menu toggle — always clickable because nav is z-[70] */}
          <button
            onClick={toggleOverlay}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] py-1 transition-colors ${isOpen ? 'text-white' : 'text-neutral-500 active:text-neutral-300'}`}
            aria-label={isOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={isOpen}
          >
            {userData ? (
              (() => {
                const avatarUrl = getAvatarUrl(userData.avatar);
                const gradientClasses = getGradientClasses(userData.avatar);
                return (
                  <div className={`w-6 h-6 rounded-full overflow-hidden ${avatarUrl ? '' : gradientClasses} flex items-center justify-center text-[9px] font-bold ring-[1.5px] ${isOpen ? 'ring-primary-400' : 'ring-white/15'} transition-all`}>
                    {avatarUrl ? (
                      <Image src={avatarUrl} alt="" width={24} height={24} className="w-full h-full object-cover" unoptimized />
                    ) : (
                      <span className="text-white">{getInitial(userData.username)}</span>
                    )}
                  </div>
                );
              })()
            ) : (
              <Menu className="w-5 h-5" />
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
}

function NavItem({ href, icon: Icon, label, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] py-1 transition-colors ${active ? 'text-white' : 'text-neutral-500 active:text-neutral-300'}`}
    >
      <Icon className="w-5 h-5" strokeWidth={active ? 2.2 : 1.8} />
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
}

function OverlayMenuItem({ href, onClick, icon: Icon, label, highlight, active }: OverlayMenuItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group flex items-center gap-3 px-3 py-3 rounded-xl transition-all active:scale-[0.98] ${active ? 'text-white bg-white/5' : 'text-neutral-300 hover:text-white hover:bg-white/5'}`}
    >
      <span className={`p-2 rounded-xl transition-colors ${highlight ? 'bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20' : active ? 'bg-primary-500/10 text-primary-400' : 'bg-white/5 text-neutral-400 group-hover:bg-white/10 group-hover:text-white'}`}>
        <Icon className="w-4 h-4" />
      </span>
      <span className={`font-medium text-[15px] ${highlight ? 'text-purple-100' : ''}`}>{label}</span>
      <ChevronRight className="w-4 h-4 text-neutral-700 ml-auto opacity-0 group-hover:opacity-100 transition-all" />
    </Link>
  );
}
