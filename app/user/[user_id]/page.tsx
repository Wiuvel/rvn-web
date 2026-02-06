'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { getGradientClasses, getAvatarUrl, getBannerUrl } from '@/lib/utils/avatar-gradients';
import { APP_VERSION } from '@/lib/utils/constants';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Header from '@/components/layout/Header';
import CommentsSection from '@/components/profile/CommentsSection';
import { Lock } from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';

interface PublicUserData {
  id: string;
  user_id: string;
  username: string;
  created_at: string;
  avatar?: string | null;
  banner?: string | null;
  isSupport?: boolean;
  isAdmin?: boolean;
}

export default function PublicProfilePage() {
  const params = useParams();
  const userId = params?.user_id as string;
  const [userData, setUserData] = useState<PublicUserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(true);
  const [currentYear] = useState(new Date().getFullYear());
  const { userData: authUserData } = useAuth({ silent: true, lightweight: true });

  useEffect(() => {
    if (!userId) {
      setError(true);
      setLoading(false);
      return;
    }

    const fetchUserData = async () => {
      try {
        const response = await fetch(`/api/user/${userId}`);

        if (response.ok) {
          const data = await response.json();
          setUserData(data);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userId]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
  };

  const getShortId = (id: string) => id;

  if (loading) {
    return <LoadingSpinner />;
  }

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

      <main className="pt-32 pb-16 relative overflow-hidden">
        <svg className="absolute inset-0 w-full h-full opacity-20 -z-10" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" aria-hidden="true">
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
        <div className="pointer-events-none absolute -top-32 -right-20 w-80 h-80 bg-primary-500/10 blur-3xl rounded-full -z-10"></div>
        <div className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 bg-white/5 blur-[100px] rounded-full -z-10"></div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative mb-8">
            <div className="relative h-40 sm:h-48 md:h-56 lg:h-64 rounded-xl overflow-hidden border border-neutral-800">
              {bannerUrl ? (
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
              )}

              {!authUserData && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-sm transition-all duration-300">
                  <div className="flex items-center gap-2 px-4 py-2 bg-neutral-900/60 border border-white/10 rounded-full backdrop-blur-md shadow-xl">
                    <Lock className="w-4 h-4 text-neutral-300" />
                    <span className="text-sm font-medium text-neutral-200">Доступ ограничен</span>
                  </div>
                </div>
              )}

              <div className="absolute top-4 right-4 backdrop-blur-xl bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 shadow-lg z-20">
                <span className="text-sm font-medium text-white">ID: {getShortId(userData.user_id)}</span>
              </div>
            </div>

            <div className="relative mt-[-40px] sm:mt-[-50px] px-4 sm:px-6 z-30">
              <div className="flex items-end gap-4 sm:gap-6">
                <div className="relative shrink-0">
                  <div className={`h-24 w-24 sm:h-28 sm:w-28 lg:h-32 lg:w-32 rounded-xl overflow-hidden border border-neutral-800 ${avatarUrl ? '' : gradientClasses} flex items-center justify-center text-white font-bold text-3xl sm:text-4xl lg:text-5xl shadow-2xl bg-neutral-900 ${!authUserData ? 'blur-[5px]' : ''}`}>
                    {avatarUrl ? (
                      <>
                        {avatarLoading && (
                          <div className="absolute inset-0 bg-neutral-800 animate-pulse rounded-xl" />
                        )}
                        <Image
                          src={avatarUrl}
                          alt={userData.username}
                          fill
                          className={`object-cover rounded-xl transition-opacity duration-300 ${avatarLoading ? 'opacity-0' : 'opacity-100'}`}
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

                <div className="flex-1 min-w-0 pb-2">
                  <h1 className={`text-xl sm:text-2xl lg:text-3xl font-bold truncate ${userData.isAdmin
                    ? 'text-orange-500'
                    : userData.isSupport
                      ? 'text-green-500'
                      : 'text-white'
                    }`}>
                    {userData.username}
                  </h1>
                </div>
              </div>
            </div>
          </div>

          {userData && (
            <CommentsSection profileId={userData.id} profileUserId={userId} />
          )}
        </div>
      </main>

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
    </div>
  );
}
