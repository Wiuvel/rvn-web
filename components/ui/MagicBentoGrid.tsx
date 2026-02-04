'use client';

import { useState, useEffect } from 'react';
import { AdvancedBentoCard } from './AdvancedBentoCard';
import MaintenanceModal from '@/components/admin/MaintenanceModal';

interface MaintenanceConfig {
  isActive: boolean;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  message: string;
}

interface MagicBentoGridProps {
  teamCount: number;
}

export default function AdvancedBentoGrid({ teamCount }: MagicBentoGridProps) {
  const [mounted, setMounted] = useState(false);
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [maintenanceConfig, setMaintenanceConfig] = useState<MaintenanceConfig>({
    isActive: false,
    scheduledStart: null,
    scheduledEnd: null,
    message: ''
  });

  const fetchMaintenanceConfig = async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/admin/maintenance', { signal });
      if (res.ok) {
        const data = await res.json();
        setMaintenanceConfig(data);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Failed to fetch maintenance config:', error);
    }
  };

  useEffect(() => {
    setMounted(true);
    const controller = new AbortController();
    
    // Небольшая задержка для предотвращения двойного запроса в React Strict Mode (Development)
    const timeoutId = setTimeout(() => {
      fetchMaintenanceConfig(controller.signal);
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  if (!mounted) return null;

  return (
    <>
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
                {teamCount}
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
        <div onClick={() => setIsMaintenanceModalOpen(true)} className="cursor-pointer">
          <AdvancedBentoCard
            title="Технические работы"
            description="Управление режимом обслуживания"
            icon="🔧"
            delay={700}
            gradient={maintenanceConfig.isActive ? "from-red-600/10 to-transparent" : "from-green-600/10 to-transparent"}
            borderColor={maintenanceConfig.isActive ? "border-red-500/30" : "border-green-500/30"}
            glowColor={maintenanceConfig.isActive ? "shadow-red-500/20" : "shadow-green-500/20"}
            comingSoon={false}
          >
            <div className="flex-1 flex flex-col items-center justify-center space-y-3 sm:space-y-4">
              <div className="text-center">
                <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3 transition-colors duration-300 ${
                  maintenanceConfig.isActive ? "bg-red-500/20 group-hover:bg-red-500/30" : "bg-green-500/20 group-hover:bg-green-500/30"
                }`}>
                  <span className={`text-lg sm:text-2xl group-hover:scale-110 transition-transform duration-300 ${
                    maintenanceConfig.isActive ? "text-red-400" : "text-green-400"
                  }`}>⚙️</span>
                </div>
                <div className="text-xs sm:text-sm text-neutral-400 mb-2">Статус системы</div>
                <div className={`text-base sm:text-lg font-semibold flex items-center justify-center mb-2 sm:mb-3 ${
                  maintenanceConfig.isActive ? "text-red-400" : "text-green-400"
                }`}>
                  <span className={`w-2 h-2 rounded-full mr-2 animate-pulse ${
                    maintenanceConfig.isActive ? "bg-red-400" : "bg-green-400"
                  }`} />
                  {maintenanceConfig.isActive ? "Обслуживание" : "Онлайн"}
                </div>
                {maintenanceConfig.scheduledStart && (
                   <div className="text-xs text-neutral-500">
                     План: {new Date(maintenanceConfig.scheduledStart).toLocaleDateString()}
                   </div>
                )}
              </div>
            </div>
          </AdvancedBentoCard>
        </div>
      </div>

      <MaintenanceModal 
        isOpen={isMaintenanceModalOpen} 
        onClose={() => {
          setIsMaintenanceModalOpen(false);
          fetchMaintenanceConfig();
        }}
        initialConfig={maintenanceConfig}
      />
    </>
  );
}
