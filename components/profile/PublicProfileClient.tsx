'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { getGradientClasses, getAvatarUrl, getBannerUrl } from '@/lib/utils/avatar-gradients';
import { APP_VERSION } from '@/lib/utils/constants';
import Header from '@/components/layout/Header';
import CommentsSection, { Comment } from '@/components/profile/CommentsSection';
import { Lock, ShieldCheck } from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';

export interface PublicUserData {
  id: string;
  user_id: string;
  username: string;
  created_at: string;
  avatar?: string | null;
  banner?: string | null;
  isSupport?: boolean;
  isAdmin?: boolean;
}

interface PublicProfileClientProps {
  userData: PublicUserData | null;
  error?: boolean;
  initialComments?: Comment[];
}

const EMPTY_COMMENTS: Comment[] = [];

export default function PublicProfileClient({
  userData,
  error,
  initialComments = EMPTY_COMMENTS,
}: PublicProfileClientProps) {
  const [avatarLoading, setAvatarLoading] = useState(true);
  const [currentYear] = useState(() => new Date().getFullYear());
  const { userData: authUserData } = useAuth({ silent: true, lightweight: true });

  const getShortId = (id: string) => id;

  if (error || !userData) {
    return (
      <ErrorState
        code="404"
        title="Пользователь не найден"
        description="Профиль, который вы ищете, не существует."
        showButton={false}
        showImage={false}
      />
    );
  }

  const avatarUrl = getAvatarUrl(userData.avatar);
  const bannerUrl = getBannerUrl(userData.banner);
  const gradientClasses = getGradientClasses(userData.avatar);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header variant="main" />

      <main className="relative overflow-hidden pb-16 pt-4 lg:pt-32">
        <svg
          className="absolute inset-0 -z-10 h-full w-full opacity-20"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="user-grad" cx="50%" cy="50%" r="75%" fx="50%" fy="50%">
              <stop offset="0%" stopColor="#16a3ff" stopOpacity="0.18" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#user-grad)" />
          <g stroke="rgba(255,255,255,0.04)" strokeWidth="1">
            <line x1="0" y1="25%" x2="100%" y2="25%" />
            <line x1="0" y1="50%" x2="100%" y2="50%" />
            <line x1="0" y1="75%" x2="100%" y2="75%" />
          </g>
        </svg>
        <div className="pointer-events-none absolute -right-20 -top-32 -z-10 h-80 w-80 rounded-full bg-primary-500/10 blur-3xl"></div>
        <div className="pointer-events-none absolute -bottom-24 -left-24 -z-10 h-72 w-72 rounded-full bg-white/5 blur-[100px]"></div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative mb-8">
            <div className="relative h-40 overflow-hidden rounded-xl border border-neutral-800 sm:h-48 md:h-56 lg:h-64">
              {bannerUrl ? (
                <Image
                  src={bannerUrl}
                  alt="Баннер профиля"
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 1024px"
                  className="object-cover"
                  priority
                  unoptimized
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-primary-600/30 via-neutral-900 to-neutral-950" />
              )}

              {!authUserData && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-sm transition-all duration-300">
                  <div className="flex items-center gap-2 rounded-full border border-white/10 bg-neutral-900/60 px-4 py-2 shadow-xl backdrop-blur-md">
                    <Lock className="h-4 w-4 text-neutral-300" />
                    <span className="text-sm font-medium text-neutral-200">Доступ ограничен</span>
                  </div>
                </div>
              )}

              <div className="absolute right-4 top-4 z-20 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 shadow-lg backdrop-blur-xl">
                <span className="text-sm font-medium text-white">
                  ID: {getShortId(userData.user_id)}
                </span>
              </div>
            </div>

            <div className="relative z-30 mt-[-40px] px-4 sm:mt-[-50px] sm:px-6">
              <div className="flex items-end gap-4 sm:gap-6">
                <div className="relative shrink-0">
                  <div
                    className={`h-24 w-24 overflow-hidden rounded-xl border border-neutral-800 sm:h-28 sm:w-28 lg:h-32 lg:w-32 ${avatarUrl ? '' : gradientClasses} flex items-center justify-center bg-neutral-900 text-3xl font-bold text-white shadow-2xl sm:text-4xl lg:text-5xl ${!authUserData ? 'blur-[5px]' : ''}`}
                  >
                    {avatarUrl ? (
                      <>
                        {avatarLoading && (
                          <div className="absolute inset-0 animate-pulse rounded-xl bg-neutral-800" />
                        )}
                        <Image
                          src={avatarUrl}
                          alt={userData.username}
                          fill
                          loading="eager"
                          sizes="(max-width: 640px) 96px, 128px"
                          className={`rounded-xl object-cover transition-opacity duration-300 ${avatarLoading ? 'opacity-0' : 'opacity-100'}`}
                          unoptimized
                          onLoad={() => setAvatarLoading(false)}
                          onError={() => setAvatarLoading(false)}
                        />
                      </>
                    ) : (
                      userData.username.charAt(0).toUpperCase()
                    )}
                  </div>
                </div>

                <div className="min-w-0 flex-1 pb-2">
                  <h1
                    className={`truncate text-xl font-bold sm:text-2xl lg:text-3xl ${
                      userData.isAdmin
                        ? 'text-orange-500'
                        : userData.isSupport
                          ? 'text-green-500'
                          : 'text-white'
                    }`}
                  >
                    {userData.username}
                  </h1>
                  {(userData.isAdmin || userData.isSupport) && (
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {userData.isAdmin && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-400">
                          <ShieldCheck className="h-3 w-3" />
                          Администратор
                        </span>
                      )}
                      {userData.isSupport && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-400">
                          <ShieldCheck className="h-3 w-3" />
                          Поддержка
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {userData && (
            <div className="mt-8">
              <CommentsSection
                key={userData.id}
                profileId={userData.id}
                profileUserId={userData.user_id}
                initialComments={initialComments}
              />
            </div>
          )}
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
    </div>
  );
}
