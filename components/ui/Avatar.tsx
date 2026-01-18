'use client';

import { getGradientClasses, getAvatarUrl } from '@/lib/utils/avatar-gradients';
import Image from 'next/image';
import { useState } from 'react';

interface AvatarProps {
  username: string;
  gradient?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  loading?: boolean;
}

export function Avatar({ username, gradient, size = 'md', className = '', loading = false }: AvatarProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const getInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base'
  };

  const gradientClasses = getGradientClasses(gradient);
  const avatarUrl = getAvatarUrl(gradient);

  // Если есть URL аватара, отображаем изображение со skeleton-loader
  if (avatarUrl) {
    return (
      <div className={`${sizeClasses[size]} rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 relative ${className}`}>
        {/* Skeleton loader с shimmer-анимацией */}
        {isLoading && (
          <div 
            className="absolute inset-0 rounded-full animate-shimmer bg-[length:200%_100%]"
            style={{
              background: 'linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.15) 50%, rgba(255, 255, 255, 0.05) 100%)'
            }}
          />
        )}
        <Image
          src={avatarUrl}
          alt={username}
          width={size === 'sm' ? 32 : size === 'md' ? 40 : 48}
          height={size === 'sm' ? 32 : size === 'md' ? 40 : 48}
          className={`w-full h-full object-cover transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          unoptimized // Аватары из S3 могут быть внешними
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
        />
        {/* Fallback на градиент при ошибке загрузки */}
        {hasError && (
          <div 
            className={`absolute inset-0 rounded-full ${gradientClasses} flex items-center justify-center text-white font-semibold ${sizeClasses[size]}`}
          >
            {getInitial(username)}
          </div>
        )}
      </div>
    );
  }

  // Иначе отображаем градиент с инициалом
  return (
    <div 
      className={`${sizeClasses[size]} rounded-full ${gradientClasses} flex items-center justify-center text-white font-semibold flex-shrink-0 relative ${className}`}
    >
      {loading && (
        <div 
          className="absolute inset-0 rounded-full animate-shimmer bg-[length:200%_100%]"
          style={{
            background: 'linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.15) 50%, rgba(255, 255, 255, 0.05) 100%)'
          }}
        />
      )}
      <div className={`${loading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}>
        {getInitial(username)}
      </div>
    </div>
  );
}

