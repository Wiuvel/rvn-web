'use client';

import { useFadeIn, useStaggeredFadeIn } from '@/hooks/useGSAP';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// Heavy WebGL effect — load client-side only
const LightRays = dynamic(() => import('@/components/LightRays'), {
  ssr: false,
  loading: () => <div className="absolute inset-0" aria-hidden="true" />
});

export default function AboutPage() {
  const titleRef = useFadeIn(0.1);
  const contentRef = useStaggeredFadeIn(0.2, 0.1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 relative overflow-hidden">
      {/* LightRays эффект */}
      <div className="absolute inset-0 w-full h-full pointer-events-none">
        <LightRays
          raysOrigin="top-center"
          raysColor="#16a3ff"
          raysSpeed={1}
          lightSpread={1.2}
          rayLength={2}
          pulsating={true}
          fadeDistance={1.0}
          saturation={1.0}
          followMouse={true}
          mouseInfluence={0.15}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
        {/* Hero Section */}
        <div ref={titleRef} className="text-center mb-20">
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
            О проекте
          </h1>
          <p className="text-xl sm:text-2xl text-neutral-400 max-w-3xl mx-auto">
            Современный сервис приватного доступа в сеть
          </p>
        </div>

        {/* Content Section */}
        <div ref={contentRef} className="space-y-12 max-w-4xl mx-auto">
          <div className="bg-neutral-900/50 backdrop-blur-sm border border-white/10 rounded-2xl p-6 sm:p-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-white">
              О сервисе
            </h2>
            <p className="text-neutral-300 text-base sm:text-lg leading-relaxed mb-4" style={{ textAlign: 'justify', textJustify: 'inter-word', hyphens: 'auto', wordSpacing: 'normal' }}>
              Raven Private — это современный сервис приватного доступа в сеть, созданный с целью обеспечения 
              анонимности и безопасности пользователей в цифровом пространстве.
            </p>
            <p className="text-neutral-300 text-base sm:text-lg leading-relaxed" style={{ textAlign: 'justify', textJustify: 'inter-word', hyphens: 'auto', wordSpacing: 'normal' }}>
              Наша главная цель — предоставить надежный инструмент для защиты приватности, который позволит 
              каждому пользователю свободно и безопасно работать в интернете без компромиссов в скорости и качестве соединения.
            </p>
          </div>

          <div className="bg-neutral-900/50 backdrop-blur-sm border border-white/10 rounded-2xl p-6 sm:p-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-white">
              Наша команда
            </h2>
            <p className="text-neutral-300 text-base sm:text-lg leading-relaxed" style={{ textAlign: 'justify', textJustify: 'inter-word', hyphens: 'auto', wordSpacing: 'normal' }}>
              Мы — небольшая, но увлеченная команда разработчиков и специалистов по безопасности, 
              объединенных общей идеей создания качественного сервиса для защиты приватности. 
              Каждый из нас вносит свой вклад в развитие проекта, работая над улучшением функциональности, 
              безопасности и пользовательского опыта.
            </p>
          </div>

          <div className="bg-neutral-900/50 backdrop-blur-sm border border-white/10 rounded-2xl p-6 sm:p-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-white">
              Roadmap
            </h2>
            <div className="relative">
              {/* Цепочка Roadmap */}
              <div className="space-y-8">
                {/* Первый этап */}
                <div className="relative flex items-start gap-4">
                  <div className="flex-shrink-0 relative z-10">
                    <div className="w-12 h-12 rounded-full bg-primary-500/20 border-2 border-primary-500 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-primary-500"></div>
                    </div>
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="text-lg font-semibold text-primary-400 mb-1">2026 Q1</div>
                    <div className="text-neutral-300">Запуск проекта и базового функционала</div>
                  </div>
                  {/* Линия соединения */}
                  <div className="absolute left-6 top-12 w-0.5 h-8 bg-gradient-to-b from-primary-500/50 to-primary-500/20"></div>
                </div>
                
                {/* Второй этап */}
                <div className="relative flex items-start gap-4">
                  <div className="flex-shrink-0 relative z-10">
                    <div className="w-12 h-12 rounded-full bg-primary-500/10 border-2 border-primary-500/50 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-primary-500/50"></div>
                    </div>
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="text-lg font-semibold text-primary-400/80 mb-1">2026 Q4</div>
                    <div className="text-neutral-300">Запуск собственного приложения на мобильной платформе</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

