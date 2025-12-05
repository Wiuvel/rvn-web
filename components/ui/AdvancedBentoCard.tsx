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
    comingSoon = false
}: AdvancedBentoCardProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setIsVisible(true), delay);
        return () => clearTimeout(timer);
    }, [delay]);

    return (
        <div
            className={`group relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-6 backdrop-blur-sm transition-all duration-500 hover:border-neutral-700 hover:bg-neutral-900/80 hover:shadow-xl ${glowColor} ${mobileSpan} ${span === 'col-span-2' ? 'sm:col-span-2' : span === 'col-span-1 row-span-2' ? 'sm:col-span-1 sm:row-span-2' : `sm:${span}`} ${className} ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
            style={{ transitionDelay: `${delay}ms` }}
        >
            {comingSoon && (
                <div className="absolute top-2 right-2 z-10 px-2 py-1 bg-primary-600/80 text-white text-xs font-medium rounded-md backdrop-blur-sm">
                    Скоро
                </div>
            )}
            <div className="flex h-full flex-col">
                <div className="mb-3 sm:mb-4 flex items-center space-x-2 sm:space-x-3">
                    <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary-600/20 text-primary-400 group-hover:bg-primary-600/30 transition-colors duration-300">
                        <span className="text-base sm:text-lg group-hover:scale-110 transition-transform duration-300">{icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base sm:text-lg font-semibold text-white group-hover:text-primary-100 transition-colors duration-300 truncate">{title}</h3>
                        <p className="text-xs sm:text-sm text-neutral-400 group-hover:text-neutral-300 transition-colors duration-300 line-clamp-2">{description}</p>
                    </div>
                </div>
                {children}
            </div>

            {/* Animated background gradient */}
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

            {/* Animated border glow with custom color */}
            <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                    background: `linear-gradient(90deg, ${borderColor.replace('border-', '').replace('/30', '')}20, transparent, ${borderColor.replace('border-', '').replace('/30', '')}20)`
                }}
            />

            {/* Hover border effect */}
            <div
                className="absolute inset-0 rounded-2xl border-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                    borderColor: borderColor.replace('border-', '').replace('/30', ''),
                    boxShadow: `0 0 20px ${borderColor.replace('border-', '').replace('/30', '')}40`
                }}
            />
        </div>
    );
}
