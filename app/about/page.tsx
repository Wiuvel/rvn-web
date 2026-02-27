'use client';

import { useFadeIn, useStaggeredFadeIn } from '@/hooks/useGSAP';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const MOBILE_BREAKPOINT_PX = 768;

// Heavy WebGL effect — load client-side only; disabled on mobile
const LightRays = dynamic(() => import('@/components/LightRays'), {
  ssr: false,
  loading: () => <div className="absolute inset-0" aria-hidden="true" />,
});

export default function AboutPage() {
  const titleRef = useFadeIn(0.1);
  const contentRef = useStaggeredFadeIn(0.2, 0.1);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const check = () =>
      setIsMobile(typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT_PX);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      {!isMobile && (
        <div className="pointer-events-none absolute inset-0 h-full w-full">
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
      )}

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8 lg:pb-32 lg:pt-32">
        {/* Hero Section */}
        <div ref={titleRef} className="mb-20 text-center">
          <h1 className="mb-6 bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-5xl font-bold text-transparent sm:text-6xl md:text-7xl">
            О проекте
          </h1>
          <p className="mx-auto max-w-3xl text-xl text-neutral-400 sm:text-2xl">
            Современный сервис приватного доступа в сеть
          </p>
        </div>

        {/* Content Section */}
        <div ref={contentRef} className="mx-auto max-w-4xl space-y-12">
          <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-6 backdrop-blur-sm sm:p-8">
            <h2 className="mb-4 text-2xl font-bold text-white sm:text-3xl">О сервисе</h2>
            <p
              className="mb-4 text-base leading-relaxed text-neutral-300 sm:text-lg"
              style={{
                textAlign: 'justify',
                textJustify: 'inter-word',
                hyphens: 'auto',
                wordSpacing: 'normal',
              }}
            >
              RVN — это современный сервис приватного доступа в сеть, созданный с целью обеспечения
              анонимности и безопасности пользователей в цифровом пространстве.
            </p>
            <p
              className="text-base leading-relaxed text-neutral-300 sm:text-lg"
              style={{
                textAlign: 'justify',
                textJustify: 'inter-word',
                hyphens: 'auto',
                wordSpacing: 'normal',
              }}
            >
              Наша главная цель — предоставить надежный инструмент для защиты приватности, который
              позволит каждому пользователю свободно и безопасно работать в интернете без
              компромиссов в скорости и качестве соединения.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-6 backdrop-blur-sm sm:p-8">
            <h2 className="mb-4 text-2xl font-bold text-white sm:text-3xl">Наша команда</h2>
            <p
              className="text-base leading-relaxed text-neutral-300 sm:text-lg"
              style={{
                textAlign: 'justify',
                textJustify: 'inter-word',
                hyphens: 'auto',
                wordSpacing: 'normal',
              }}
            >
              Мы — небольшая, но увлеченная команда разработчиков и специалистов по безопасности,
              объединенных общей идеей создания качественного сервиса для защиты приватности. Каждый
              из нас вносит свой вклад в развитие проекта, работая над улучшением функциональности,
              безопасности и пользовательского опыта.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-6 backdrop-blur-sm sm:p-8">
            <h2 className="mb-4 text-2xl font-bold text-white sm:text-3xl">Roadmap</h2>
            <div className="relative">
              {/* Цепочка Roadmap */}
              <div className="space-y-8">
                {/* Первый этап */}
                <div className="relative flex items-start gap-4">
                  <div className="relative z-10 flex-shrink-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary-500 bg-primary-500/20">
                      <div className="h-6 w-6 rounded-full bg-primary-500"></div>
                    </div>
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="mb-1 text-lg font-semibold text-primary-400">2026 Q1</div>
                    <div className="text-neutral-300">Запуск проекта и базового функционала</div>
                  </div>
                  {/* Линия соединения */}
                  <div className="absolute left-6 top-12 h-8 w-0.5 bg-gradient-to-b from-primary-500/50 to-primary-500/20"></div>
                </div>

                {/* Второй этап */}
                <div className="relative flex items-start gap-4">
                  <div className="relative z-10 flex-shrink-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary-500/50 bg-primary-500/10">
                      <div className="h-6 w-6 rounded-full bg-primary-500/50"></div>
                    </div>
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="mb-1 text-lg font-semibold text-primary-400/80">2026 Q4</div>
                    <div className="text-neutral-300">
                      Запуск собственного приложения на мобильной платформе
                    </div>
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
