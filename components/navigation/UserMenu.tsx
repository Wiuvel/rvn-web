'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { UserData } from '@/types';
import { useMenuAnimation } from '@/hooks/useMenuAnimation';
import { getGradientClasses, getAvatarUrl } from '@/lib/utils/avatar-gradients';
import {
  User,
  Settings,
  Receipt,
  LogOut,
  LifeBuoy,
  Wallet,
  ChevronRight,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';

interface UserMenuProps {
  userData: UserData;
  isOpen: boolean;
  onClose: () => void;
  showUserId?: boolean;
  hideBalance?: boolean;
  menuRef?: React.RefObject<HTMLDivElement | null>;
  persist?: boolean;
}

export function UserMenu({
  userData,
  isOpen,
  onClose,
  showUserId = true,
  hideBalance = false,
  menuRef: externalMenuRef,
  persist = true,
}: UserMenuProps) {
  const router = useRouter();
  const { shouldRender, menuRef: animatedMenuRef } = useMenuAnimation(isOpen, {
    onClose,
    persist,
  });
  const [avatarLoading, setAvatarLoading] = useState(true);

  useEffect(() => {
    if (animatedMenuRef.current && externalMenuRef && 'current' in externalMenuRef) {
      (externalMenuRef as React.MutableRefObject<HTMLDivElement | null>).current =
        animatedMenuRef.current;
    }
  }, [shouldRender, animatedMenuRef, externalMenuRef]);

  useEffect(() => {
    if (userData?.avatar) {
      const avatarUrl = getAvatarUrl(userData.avatar);
      if (avatarUrl) {
        setAvatarLoading(true);
        // Preload image
        const img = new window.Image();
        img.src = avatarUrl;
        img.onload = () => setAvatarLoading(false);
        img.onerror = () => setAvatarLoading(false);
      }
    }
  }, [userData?.avatar]);

  const getInitial = (username: string) => username.charAt(0).toUpperCase();

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (response.ok) {
        onClose();
        router.push('/auth');
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (!shouldRender) return null;

  return (
    <div
      ref={animatedMenuRef}
      className="absolute -right-[25px] top-full z-50 mt-5 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-[#0A0A0A]/95 shadow-2xl ring-1 ring-black/5 backdrop-blur-2xl"
    >
      {/* User Header Card */}
      <div className="p-2">
        <Link
          href={`/dashboard/${userData.user_id}`}
          onClick={onClose}
          className="group relative block rounded-xl border border-white/5 bg-gradient-to-br from-white/5 to-white/[0.02] p-4 transition-all duration-300 hover:border-white/10"
        >
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="relative shrink-0">
              {(() => {
                const avatarUrl = getAvatarUrl(userData.avatar);
                const gradientClasses = getGradientClasses(userData.avatar);

                return (
                  <div
                    className={`h-14 w-14 overflow-hidden rounded-full ${avatarUrl ? '' : gradientClasses} flex items-center justify-center text-xl font-bold text-white shadow-lg ring-2 ring-white/10 transition-all duration-300 group-hover:ring-white/20`}
                  >
                    {avatarUrl ? (
                      <>
                        {avatarLoading && (
                          <div className="absolute inset-0 animate-pulse rounded-full bg-neutral-800" />
                        )}
                        <Image
                          src={avatarUrl}
                          alt={userData.username}
                          width={56}
                          height={56}
                          className={`h-full w-full object-cover transition-opacity duration-300 ${avatarLoading ? 'opacity-0' : 'opacity-100'}`}
                          unoptimized
                          onLoad={() => setAvatarLoading(false)}
                          onError={() => setAvatarLoading(false)}
                        />
                      </>
                    ) : (
                      getInitial(userData.username)
                    )}
                  </div>
                );
              })()}
              {/* Role Badge */}
              {(userData.pex === 'a' ||
                userData.pex === 's' ||
                userData.isAdmin ||
                userData.isSupport) && (
                <div className="absolute -bottom-1 -right-1 rounded-full bg-neutral-900 p-0.5 ring-2 ring-neutral-900">
                  <div
                    className={`rounded-full p-1 ${userData.pex === 'a' || userData.isAdmin ? 'bg-orange-500/20 text-orange-500' : 'bg-green-500/20 text-green-500'}`}
                  >
                    <ShieldCheck className="h-3 w-3" />
                  </div>
                </div>
              )}
            </div>

            {/* User Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <div
                  className={`truncate pr-2 text-lg font-semibold ${
                    userData.pex === 'a' || userData.isAdmin
                      ? 'text-orange-400'
                      : userData.pex === 's' || userData.isSupport
                        ? 'text-green-400'
                        : 'text-white'
                  }`}
                >
                  {userData.username}
                </div>
              </div>

              <div className="mt-0.5 flex items-center gap-2 font-mono text-xs text-neutral-400">
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-neutral-500">
                  ID: {userData.user_id}
                </span>
              </div>

              {!hideBalance && (
                <div className="mt-2 flex items-center gap-1.5 text-sm">
                  <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-400">
                    <Wallet className="h-3.5 w-3.5" />
                    <span className="font-medium">{userData.balance || 0} ₽</span>
                  </div>
                </div>
              )}
            </div>

            <ChevronRight className="h-5 w-5 text-neutral-600 transition-colors group-hover:text-neutral-400" />
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <div className="px-2 pb-2">
        <div className="flex flex-col gap-0.5">
          <MenuItem
            href={`/dashboard/${userData.user_id}#subscriptions`}
            onClick={onClose}
            icon={CreditCard}
            label="Мои тарифы"
            highlight
          />

          <div className="mx-2 my-2 h-px bg-white/5" />

          <MenuItem
            href={`/dashboard/${userData.user_id}`}
            onClick={onClose}
            icon={Receipt}
            label="Транзакции"
          />

          <MenuItem href="/user/settings" onClick={onClose} icon={Settings} label="Настройки" />

          <div className="mx-2 my-2 h-px bg-white/5" />

          <MenuItem href="/support" onClick={onClose} icon={LifeBuoy} label="Поддержка" />

          <button
            onClick={handleLogout}
            className="group mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-red-400 transition-all duration-200 hover:bg-red-500/10 hover:text-red-300"
          >
            <span className="flex items-center gap-3 font-medium">
              <span className="rounded-lg bg-red-500/10 p-1.5 transition-colors group-hover:bg-red-500/20">
                <LogOut className="h-4 w-4" />
              </span>
              Выйти
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface MenuItemProps {
  href: string;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  highlight?: boolean;
}

function MenuItem({ href, onClick, icon: Icon, label, highlight }: MenuItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="group flex items-center justify-between rounded-xl px-3 py-2.5 text-neutral-300 transition-all duration-200 hover:bg-white/5 hover:text-white"
    >
      <div className="flex items-center gap-3">
        <span
          className={`rounded-lg p-1.5 transition-colors ${
            highlight
              ? 'bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20'
              : 'bg-white/5 text-neutral-400 group-hover:bg-white/10 group-hover:text-white'
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className={`font-medium ${highlight ? 'text-purple-100' : ''}`}>{label}</span>
      </div>
      <ChevronRight className="h-4 w-4 -translate-x-1 text-neutral-700 opacity-0 transition-colors group-hover:translate-x-0 group-hover:text-neutral-500 group-hover:opacity-100" />
    </Link>
  );
}
