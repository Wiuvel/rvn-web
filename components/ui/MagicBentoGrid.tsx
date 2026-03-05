'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
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

  const { data: maintenanceData } = trpc.admin.maintenance.get.useQuery(undefined, {
    staleTime: 30_000,
  });
  const maintenanceConfig: MaintenanceConfig = maintenanceData ?? {
    isActive: false,
    scheduledStart: null,
    scheduledEnd: null,
    message: '',
  };

  useEffect(() => {
    setMounted(true);

    return () => {};
  }, []);

  if (!mounted) return null;

  return (
    <>
      <div className="grid auto-rows-[minmax(200px,auto)] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="mb-2 animate-pulse text-2xl font-bold text-white sm:text-3xl">0</div>
              <div className="flex items-center justify-center text-xs text-green-400 sm:text-sm">
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
          <div className="flex flex-1 items-center justify-center">
            <div className="relative flex h-16 w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-r from-primary-600/20 to-primary-400/20 sm:h-20">
              <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <span className="relative z-10 text-xs font-medium text-primary-400 sm:text-sm">
                Виджет панели
              </span>
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
          <div className="flex flex-1 flex-col items-center justify-center space-y-3 sm:space-y-4">
            <div className="grid grid-cols-3 gap-1 sm:gap-2">
              {(
                [
                  'dot-0',
                  'dot-1',
                  'dot-2',
                  'dot-3',
                  'dot-4',
                  'dot-5',
                  'dot-6',
                  'dot-7',
                  'dot-8',
                ] as const
              ).map((dotId, i) => (
                <div
                  key={dotId}
                  className="h-2 w-2 animate-pulse rounded-full bg-primary-600/30 sm:h-3 sm:w-3"
                  style={{
                    animationDelay: `${i * 0.1}s`,
                    animationDuration: '2s',
                  }}
                />
              ))}
            </div>
            <div className="text-center">
              <div className="mb-1 text-xl font-bold text-white sm:text-2xl">{teamCount}</div>
              <div className="text-xs text-neutral-400 sm:text-sm">Активные участники</div>
              <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-primary-600 to-primary-400 sm:w-16" />
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
          <div className="flex flex-1 flex-col items-center justify-between space-y-4 sm:flex-row sm:space-y-0">
            <div className="flex flex-col space-y-4 sm:flex-row sm:space-x-8 sm:space-y-0">
              <div className="text-center">
                <div className="mb-1 text-xl font-bold text-white sm:text-2xl">98%</div>
                <div className="text-sm text-neutral-400">Время работы</div>
                <div className="mx-auto mt-1 h-1 w-12 rounded-full bg-green-500" />
              </div>
              <div className="text-center">
                <div className="mb-1 text-xl font-bold text-white sm:text-2xl">2.3s</div>
                <div className="text-sm text-neutral-400">Время отклика</div>
                <div className="mx-auto mt-1 h-1 w-12 rounded-full bg-blue-500" />
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-green-500/20 to-green-400/20 transition-transform duration-300 group-hover:scale-110 sm:h-16 sm:w-16">
              <span className="text-xl text-green-400 sm:text-2xl">✓</span>
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
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-wrap justify-center gap-2">
              {['🔧', '📱', '💻', '☁️'].map((tool, i) => (
                <div
                  key={tool}
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg bg-neutral-800 text-xs transition-all duration-300 hover:scale-110 hover:bg-primary-600/20 sm:h-8 sm:w-8 sm:text-sm"
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
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20 transition-colors duration-300 group-hover:bg-red-500/30 sm:h-12 sm:w-12">
                <span className="text-lg text-red-400 transition-transform duration-300 group-hover:scale-110 sm:text-xl">
                  🔒
                </span>
              </div>
              <div className="mb-1 text-xs text-neutral-400 sm:text-sm">Статус безопасности</div>
              <div className="flex items-center justify-center text-base font-semibold text-green-400 sm:text-lg">
                <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-green-400" />
                Активна
              </div>
            </div>
          </div>
        </AdvancedBentoCard>

        {/* Maintenance Card */}
        <div
          onClick={() => setIsMaintenanceModalOpen(true)}
          className="cursor-pointer"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setIsMaintenanceModalOpen(true);
            }
          }}
          aria-label="Открыть настройки технических работ"
        >
          <AdvancedBentoCard
            title="Технические работы"
            description="Управление режимом обслуживания"
            icon="🔧"
            delay={700}
            gradient={
              maintenanceConfig.isActive
                ? 'from-red-600/10 to-transparent'
                : 'from-green-600/10 to-transparent'
            }
            borderColor={maintenanceConfig.isActive ? 'border-red-500/30' : 'border-green-500/30'}
            glowColor={maintenanceConfig.isActive ? 'shadow-red-500/20' : 'shadow-green-500/20'}
            comingSoon={false}
          >
            <div className="flex flex-1 flex-col items-center justify-center space-y-3 sm:space-y-4">
              <div className="text-center">
                <div
                  className={`mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-300 sm:mb-3 sm:h-16 sm:w-16 ${
                    maintenanceConfig.isActive
                      ? 'bg-red-500/20 group-hover:bg-red-500/30'
                      : 'bg-green-500/20 group-hover:bg-green-500/30'
                  }`}
                >
                  <span
                    className={`text-lg transition-transform duration-300 group-hover:scale-110 sm:text-2xl ${
                      maintenanceConfig.isActive ? 'text-red-400' : 'text-green-400'
                    }`}
                  >
                    ⚙️
                  </span>
                </div>
                <div className="mb-2 text-xs text-neutral-400 sm:text-sm">Статус системы</div>
                <div
                  className={`mb-2 flex items-center justify-center text-base font-semibold sm:mb-3 sm:text-lg ${
                    maintenanceConfig.isActive ? 'text-red-400' : 'text-green-400'
                  }`}
                >
                  <span
                    className={`mr-2 h-2 w-2 animate-pulse rounded-full ${
                      maintenanceConfig.isActive ? 'bg-red-400' : 'bg-green-400'
                    }`}
                  />
                  {maintenanceConfig.isActive ? 'Обслуживание' : 'Онлайн'}
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

      {isMaintenanceModalOpen && (
        <MaintenanceModal
          isOpen={isMaintenanceModalOpen}
          onClose={() => {
            setIsMaintenanceModalOpen(false);
          }}
          initialConfig={maintenanceConfig}
        />
      )}
    </>
  );
}
