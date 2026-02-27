'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { getAvatarUrl, getGradientClasses } from '@/lib/utils/avatar-gradients';
import { UserData } from '@/types';

interface HeaderAvatarProps {
  userData: UserData;
  onClick: (e: React.MouseEvent) => void;
  isOpen: boolean;
  isDesktop: boolean;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}

export default function HeaderAvatar({
  userData,
  onClick,
  isOpen,
  isDesktop,
  buttonRef,
}: HeaderAvatarProps) {
  const [loading, setLoading] = useState(true);
  const avatarLoadFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avatarUrl = getAvatarUrl(userData.avatar);
  const gradientClasses = getGradientClasses(userData.avatar);

  // Handle fallback for image loading
  const AVATAR_LOAD_FALLBACK_MS = 800;

  useEffect(() => {
    if (!avatarUrl) {
      setLoading(false);
      return;
    }

    avatarLoadFallbackRef.current = setTimeout(() => {
      avatarLoadFallbackRef.current = null;
      setLoading(false);
    }, AVATAR_LOAD_FALLBACK_MS);

    return () => {
      if (avatarLoadFallbackRef.current) {
        clearTimeout(avatarLoadFallbackRef.current);
        avatarLoadFallbackRef.current = null;
      }
    };
  }, [avatarUrl]);

  const handleLoad = () => {
    if (avatarLoadFallbackRef.current) {
      clearTimeout(avatarLoadFallbackRef.current);
      avatarLoadFallbackRef.current = null;
    }
    setLoading(false);
  };

  const handleError = () => {
    if (avatarLoadFallbackRef.current) {
      clearTimeout(avatarLoadFallbackRef.current);
      avatarLoadFallbackRef.current = null;
    }
    setLoading(false);
  };

  const getInitial = (username: string) => {
    return username.charAt(0).toUpperCase();
  };

  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      className={`h-11 w-11 overflow-hidden rounded-full ${avatarUrl ? '' : gradientClasses} relative flex flex-shrink-0 cursor-pointer items-center justify-center text-base font-semibold text-white transition-transform duration-200 hover:scale-110`}
      title={userData.username}
      aria-label="Меню пользователя"
      aria-expanded={isOpen && isDesktop}
    >
      {avatarUrl ? (
        <>
          {loading && (
            <div className="absolute inset-0 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%]" />
          )}
          <Image
            src={avatarUrl}
            alt={userData.username}
            width={44}
            height={44}
            className={`h-full w-full object-cover transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}
            loading="eager"
            unoptimized
            onLoad={handleLoad}
            onError={handleError}
          />
        </>
      ) : (
        <div className="opacity-100 transition-opacity duration-300">
          {getInitial(userData.username)}
        </div>
      )}
    </button>
  );
}
