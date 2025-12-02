'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { UserData } from '@/types';
import { useMenuAnimation } from '@/hooks/useMenuAnimation';
import { getGradientClasses } from '@/lib/avatar-gradients';

interface UserMenuProps {
  userData: UserData;
  isOpen: boolean;
  onClose: () => void;
  showProfile?: boolean;
  showUserId?: boolean;
  menuRef?: React.RefObject<HTMLDivElement | null>;
}

export function UserMenu({
  userData,
  isOpen,
  onClose,
  showProfile = true,
  showUserId = true,
  menuRef: externalMenuRef
}: UserMenuProps) {
  const router = useRouter();
  const { shouldRender, menuRef: animatedMenuRef } = useMenuAnimation(isOpen);
  
  useEffect(() => {
    if (animatedMenuRef.current && externalMenuRef && 'current' in externalMenuRef) {
      (externalMenuRef as React.MutableRefObject<HTMLDivElement | null>).current = animatedMenuRef.current;
    }
  }, [shouldRender, animatedMenuRef, externalMenuRef]);

  const getInitial = (username: string) => {
    return username.charAt(0).toUpperCase();
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      if (response.ok) {
        // Очищаем localStorage от access_token
        if (typeof window !== 'undefined') {
          localStorage.removeItem('access_token');
        }
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
      className="absolute -right-3 top-full mt-4 w-64 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl overflow-hidden z-50"
    >
      <div>
        <Link
          href={`/dashboard/${userData.dashboard_token}`}
          onClick={onClose}
          className="block p-4 border-b border-white/10 hover:bg-white/5 transition-colors duration-200 cursor-pointer mx-2 my-1 rounded-xl"
        >
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full ${getGradientClasses(userData.avatar_gradient)} flex items-center justify-center text-white font-semibold text-base flex-shrink-0`}>
              {getInitial(userData.username)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-white font-medium truncate">{userData.username}</div>
              <div className="text-neutral-400 text-xs truncate">
                {showUserId ? `ID: ${userData.user_id}` : 'Пользователь'}
              </div>
            </div>
          </div>
        </Link>
        <div className="py-2">
          {showProfile && (
            <Link
              href={`/dashboard/${userData.dashboard_token}`}
              onClick={onClose}
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
          )}
          <Link
            href={`/dashboard/${userData.dashboard_token}#subscriptions`}
            onClick={onClose}
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
            prefetch={false}
            onClick={onClose}
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
            onClick={handleLogout}
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
  );
}

