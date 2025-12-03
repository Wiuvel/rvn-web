'use client';

import { useState, useEffect } from 'react';

interface AdvancedBentoCardProps {
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

function AdvancedBentoCard({ 
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
      className={`group relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-6 backdrop-blur-sm transition-all duration-500 hover:border-neutral-700 hover:bg-neutral-900/80 hover:shadow-xl ${glowColor} ${mobileSpan} ${span === 'col-span-2' ? 'sm:col-span-2' : span === 'col-span-1 row-span-2' ? 'sm:col-span-1 sm:row-span-2' : `sm:${span}`} ${className} ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
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

export default function AdvancedBentoGrid() {
  const [mounted, setMounted] = useState(false);
  const [teamCount, setTeamCount] = useState<number | null>(null);
  const [teamLoading, setTeamLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Загружаем количество участников команды
    const fetchTeamCount = async () => {
      try {
        const response = await fetch('/api/admin/team/count', {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setTeamCount(data.count || 0);
        } else {
          setTeamCount(0);
        }
      } catch (error) {
        console.error('Error fetching team count:', error);
        setTeamCount(0);
      } finally {
        setTeamLoading(false);
      }
    };

    if (mounted) {
      fetchTeamCount();
    }
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-[minmax(200px,auto)]">
      {/* Analytics Card */}
      <AdvancedBentoCard
        title="Аналитика"
        description="Отслеживание поведения пользователей"
        icon="📊"
        delay={100}
        gradient="from-blue-600/10 to-transparent"
        borderColor="border-blue-500/30"
        glowColor="shadow-blue-500/20"
        comingSoon={true}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl sm:text-3xl font-bold text-white mb-2 animate-pulse">0</div>
            <div className="text-xs sm:text-sm text-green-400 flex items-center justify-center">
              <span className="mr-1">↗</span>
              +12% за месяц
            </div>
          </div>
        </div>
      </AdvancedBentoCard>

      {/* Dashboard Card */}
      <AdvancedBentoCard
        title="Обзор"
        description="Централизованный просмотр данных"
        icon="📈"
        delay={200}
        gradient="from-green-600/10 to-transparent"
        borderColor="border-green-500/30"
        glowColor="shadow-green-500/20"
        comingSoon={true}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full h-16 sm:h-20 bg-gradient-to-r from-primary-600/20 to-primary-400/20 rounded-lg flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
            <span className="text-primary-400 text-xs sm:text-sm font-medium relative z-10">Виджет панели</span>
          </div>
        </div>
      </AdvancedBentoCard>

      {/* Teamwork Card - Large */}
      <AdvancedBentoCard
        title="Команда"
        description="Совместная работа без проблем"
        icon="👥"
        span="col-span-1 row-span-2"
        mobileSpan="col-span-1"
        delay={300}
        gradient="from-purple-600/10 to-transparent"
        borderColor="border-purple-500/30"
        glowColor="shadow-purple-500/20"
      >
        <div className="flex-1 flex flex-col items-center justify-center space-y-3 sm:space-y-4">
          <div className="grid grid-cols-3 gap-1 sm:gap-2">
            {[...Array(9)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 sm:w-3 sm:h-3 bg-primary-600/30 rounded-full animate-pulse"
                style={{ 
                  animationDelay: `${i * 0.1}s`,
                  animationDuration: '2s'
                }}
              />
            ))}
          </div>
          <div className="text-center">
            <div className="text-xl sm:text-2xl font-bold text-white mb-1">
              {teamLoading ? (
                <span className="inline-block w-8 h-6 bg-neutral-700 rounded animate-pulse" />
              ) : (
                teamCount ?? 0
              )}
            </div>
            <div className="text-xs sm:text-sm text-neutral-400">Активные участники</div>
            <div className="w-12 sm:w-16 h-1 bg-gradient-to-r from-primary-600 to-primary-400 rounded-full mx-auto mt-2" />
          </div>
        </div>
      </AdvancedBentoCard>

      {/* Efficiency Card - Wide */}
      <AdvancedBentoCard
        title="Эффективность"
        description="Оптимизация рабочих процессов"
        icon="⚡"
        span="col-span-2"
        mobileSpan="col-span-1"
        delay={400}
        gradient="from-yellow-600/10 to-transparent"
        borderColor="border-yellow-500/30"
        glowColor="shadow-yellow-500/20"
        comingSoon={true}
      >
        <div className="flex-1 flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
          <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-8">
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-white mb-1">98%</div>
              <div className="text-sm text-neutral-400">Время работы</div>
              <div className="w-12 h-1 bg-green-500 rounded-full mx-auto mt-1" />
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-white mb-1">2.3s</div>
              <div className="text-sm text-neutral-400">Время отклика</div>
              <div className="w-12 h-1 bg-blue-500 rounded-full mx-auto mt-1" />
            </div>
          </div>
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-green-500/20 to-green-400/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <span className="text-green-400 text-xl sm:text-2xl">✓</span>
          </div>
        </div>
      </AdvancedBentoCard>

      {/* Connectivity Card */}
      <AdvancedBentoCard
        title="Подключения"
        description="Интеграция с любимыми инструментами"
        icon="🔗"
        delay={500}
        gradient="from-cyan-600/10 to-transparent"
        borderColor="border-cyan-500/30"
        glowColor="shadow-cyan-500/20"
        comingSoon={true}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-wrap gap-2 justify-center">
            {['🔧', '📱', '💻', '☁️'].map((tool, i) => (
              <div
                key={i}
                className="w-6 h-6 sm:w-8 sm:h-8 bg-neutral-800 rounded-lg flex items-center justify-center text-xs sm:text-sm hover:bg-primary-600/20 transition-all duration-300 cursor-pointer hover:scale-110"
                style={{ transitionDelay: `${i * 50}ms` }}
              >
                {tool}
              </div>
            ))}
          </div>
        </div>
      </AdvancedBentoCard>

      {/* Protection Card */}
      <AdvancedBentoCard
        title="Защита"
        description="Корпоративная безопасность"
        icon="🛡️"
        delay={600}
        gradient="from-red-600/10 to-transparent"
        borderColor="border-red-500/30"
        glowColor="shadow-red-500/20"
        comingSoon={true}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-2 group-hover:bg-red-500/30 transition-colors duration-300">
              <span className="text-red-400 text-lg sm:text-xl group-hover:scale-110 transition-transform duration-300">🔒</span>
            </div>
            <div className="text-xs sm:text-sm text-neutral-400 mb-1">Статус безопасности</div>
            <div className="text-base sm:text-lg font-semibold text-green-400 flex items-center justify-center">
              <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse" />
              Активна
            </div>
          </div>
        </div>
      </AdvancedBentoCard>

      {/* Maintenance Card */}
      <AdvancedBentoCard
        title="Технические работы"
        description="Управление режимом обслуживания"
        icon="🔧"
        delay={700}
        gradient="from-orange-600/10 to-transparent"
        borderColor="border-orange-500/30"
        glowColor="shadow-orange-500/20"
        comingSoon={true}
      >
        <div className="flex-1 flex flex-col items-center justify-center space-y-3 sm:space-y-4">
          <div className="text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3 group-hover:bg-orange-500/30 transition-colors duration-300">
              <span className="text-orange-400 text-lg sm:text-2xl group-hover:scale-110 transition-transform duration-300">⚙️</span>
            </div>
            <div className="text-xs sm:text-sm text-neutral-400 mb-2">Статус системы</div>
            <div className="text-base sm:text-lg font-semibold text-green-400 flex items-center justify-center mb-2 sm:mb-3">
              <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse" />
              Онлайн
            </div>
            <div className="w-full bg-neutral-800 rounded-full h-2 mb-2">
              <div className="bg-gradient-to-r from-orange-500 to-orange-400 h-2 rounded-full w-3/4 animate-pulse" />
            </div>
            <div className="text-xs text-neutral-500">Готовность: 75%</div>
          </div>
        </div>
      </AdvancedBentoCard>
    </div>
  );
}
