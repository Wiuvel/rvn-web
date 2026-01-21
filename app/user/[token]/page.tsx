'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getGradientClasses, getAvatarUrl, getBannerUrl } from '@/lib/utils/avatar-gradients';
import { APP_VERSION } from '@/lib/utils/constants';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Header from '@/components/layout/Header';

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
  const token = params?.token as string;
  const [userData, setUserData] = useState<PublicUserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(true);
  const [currentYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (!token) {
      setError(true);
      setLoading(false);
      return;
    }

    const fetchUserData = async () => {
      try {
        const response = await fetch(`/api/user/${token}`);
        
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
  }, [token]);

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

  if (loading) {
    return <LoadingSpinner />;
  }

  // Страница ошибки - пользователь не найден
  if (error || !userData) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
        {/* Background effects */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-lg mx-auto relative z-10">
            {/* 404 */}
            <div className="relative mb-8">
              <h1 className="text-[10rem] sm:text-[12rem] font-black leading-none tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-primary-400 via-primary-500 to-purple-600 select-none">
                404
              </h1>
              <div className="absolute -top-4 -left-4 w-8 h-8 border-l-2 border-t-2 border-primary-500/50" />
              <div className="absolute -bottom-4 -right-4 w-8 h-8 border-r-2 border-b-2 border-purple-500/50" />
            </div>

            {/* Message */}
            <div className="space-y-4 mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-white">
                Пользователь не найден
              </h2>
            </div>

            {/* Actions */}
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-400 text-white font-medium rounded-full transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-primary-500/25"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              На главную
            </Link>
          </div>
        </div>

        <footer className="py-6 text-center text-sm text-neutral-600">
          <p>© {currentYear} RVNPrivate</p>
        </footer>
      </div>
    );
  }

  const avatarUrl = getAvatarUrl(userData.avatar);
  const bannerUrl = getBannerUrl(userData.banner);
  const gradientClasses = getGradientClasses(userData.avatar);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Header из главной страницы */}
      <Header variant="main" />

      {/* Main content */}
      <main className="pt-32 pb-16 relative overflow-hidden">
        {/* Background Decoration */}
        <svg className="absolute inset-0 w-full h-full opacity-20 -z-10" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <radialGradient id="user-grad" cx="50%" cy="50%" r="75%" fx="50%" fy="50%">
              <stop offset="0%" stopColor="#16a3ff" stopOpacity="0.18"/>
              <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#user-grad)" />
          <g stroke="rgba(255,255,255,0.04)" strokeWidth="1">
            <line x1="0" y1="25%" x2="100%" y2="25%"/>
            <line x1="0" y1="50%" x2="100%" y2="50%"/>
            <line x1="0" y1="75%" x2="100%" y2="75%"/>
          </g>
        </svg>
        <div className="pointer-events-none absolute -top-32 -right-20 w-80 h-80 bg-primary-500/10 blur-3xl rounded-full -z-10"></div>
        <div className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 bg-white/5 blur-[100px] rounded-full -z-10"></div>
        
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Profile Card - новая структура как на скриншоте */}
          <div className="relative mb-8">
            {/* Banner */}
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
              
              {/* ID в glass-карточке слева вверху */}
              <div className="absolute top-4 left-4 backdrop-blur-xl bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 shadow-lg">
                <span className="text-sm font-medium text-white">ID: {getShortId(userData.user_id)}</span>
              </div>
            </div>

            {/* Profile Info - под баннером */}
            <div className="relative mt-[-40px] sm:mt-[-50px] px-4 sm:px-6">
              <div className="flex items-end gap-4 sm:gap-6">
                {/* Avatar - выступает над нижним краем баннера */}
                <div className="relative shrink-0">
                  <div className={`h-24 w-24 sm:h-28 sm:w-28 lg:h-32 lg:w-32 rounded-xl overflow-hidden border border-neutral-800 ${avatarUrl ? '' : gradientClasses} flex items-center justify-center text-white font-bold text-3xl sm:text-4xl lg:text-5xl shadow-2xl bg-neutral-900`}>
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

                {/* User Info - справа от аватарки, на уровне нижней части */}
                <div className="flex-1 min-w-0 pb-2">
                  <h1 className={`text-xl sm:text-2xl lg:text-3xl font-bold truncate ${
                    userData.isAdmin 
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

          {/* Заглушка для комментариев */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 backdrop-blur-sm text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-neutral-800/50 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Комментарии</h3>
              <p className="text-sm text-neutral-400">Функция комментариев будет доступна в ближайшее время</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
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
