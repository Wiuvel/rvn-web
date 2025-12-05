import { getGradientClasses } from '@/lib/utils/avatar-gradients';

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

  return (
    <div 
      className={`${sizeClasses[size]} rounded-full ${gradientClasses} flex items-center justify-center text-white font-semibold flex-shrink-0 ${className}`}
    >
      {getInitial(username)}
    </div>
  );
}

