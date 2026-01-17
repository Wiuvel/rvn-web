import { getGradientClasses, getAvatarUrl } from '@/lib/utils/avatar-gradients';
import Image from 'next/image';

interface AvatarProps {
  username: string;
  gradient?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Avatar({ username, gradient, size = 'md', className = '' }: AvatarProps) {
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

  // Если есть URL аватара, отображаем изображение
  if (avatarUrl) {
    return (
      <div className={`${sizeClasses[size]} rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${className}`}>
        <Image
          src={avatarUrl}
          alt={username}
          width={size === 'sm' ? 32 : size === 'md' ? 40 : 48}
          height={size === 'sm' ? 32 : size === 'md' ? 40 : 48}
          className="w-full h-full object-cover"
          unoptimized // Аватары из S3 могут быть внешними
        />
      </div>
    );
  }

  // Иначе отображаем градиент с инициалом
  return (
    <div 
      className={`${sizeClasses[size]} rounded-full ${gradientClasses} flex items-center justify-center text-white font-semibold flex-shrink-0 ${className}`}
    >
      {getInitial(username)}
    </div>
  );
}

