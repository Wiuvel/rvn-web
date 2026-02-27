'use client';

import { useState, useEffect } from 'react';

export interface AdvancedBentoCardProps {
  title: string;
  description: string;
  icon: string;
  className?: string;
  span?: 'col-span-1' | 'col-span-2' | 'row-span-1' | 'row-span-2' | 'col-span-1 row-span-2';
  children?: React.ReactNode;
  gradient?: string;
  delay?: number;
  borderColor?: string;
  glowColor?: string;
  mobileSpan?: string;
  comingSoon?: boolean;
}

export function AdvancedBentoCard({
  title,
  description,
  icon,
  className = '',
  span = 'col-span-1',
  children,
  gradient = 'from-primary-600/10 to-transparent',
  delay = 0,
  borderColor = 'border-primary-600/30',
  glowColor = 'shadow-primary-600/20',
  mobileSpan = 'col-span-1',
  comingSoon = false,
}: AdvancedBentoCardProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 backdrop-blur-sm transition-all duration-500 hover:border-neutral-700 hover:bg-neutral-900/80 hover:shadow-xl sm:p-6 ${glowColor} ${mobileSpan} ${span === 'col-span-2' ? 'sm:col-span-2' : span === 'col-span-1 row-span-2' ? 'sm:col-span-1 sm:row-span-2' : `sm:${span}`} ${className} ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {comingSoon && (
        <div className="absolute right-2 top-2 z-10 rounded-md bg-primary-600/80 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
          Скоро
        </div>
      )}
      <div className="flex h-full flex-col">
        <div className="mb-3 flex items-center space-x-2 sm:mb-4 sm:space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600/20 text-primary-400 transition-colors duration-300 group-hover:bg-primary-600/30 sm:h-10 sm:w-10">
            <span className="text-base transition-transform duration-300 group-hover:scale-110 sm:text-lg">
              {icon}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-white transition-colors duration-300 group-hover:text-primary-100 sm:text-lg">
              {title}
            </h3>
            <p className="line-clamp-2 text-xs text-neutral-400 transition-colors duration-300 group-hover:text-neutral-300 sm:text-sm">
              {description}
            </p>
          </div>
        </div>
        {children}
      </div>

      {/* Animated background gradient */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
      />

      {/* Animated border glow with custom color */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `linear-gradient(90deg, ${borderColor.replace('border-', '').replace('/30', '')}20, transparent, ${borderColor.replace('border-', '').replace('/30', '')}20)`,
        }}
      />

      {/* Hover border effect */}
      <div
        className="absolute inset-0 rounded-2xl border-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          borderColor: borderColor.replace('border-', '').replace('/30', ''),
          boxShadow: `0 0 20px ${borderColor.replace('border-', '').replace('/30', '')}40`,
        }}
      />
    </div>
  );
}
