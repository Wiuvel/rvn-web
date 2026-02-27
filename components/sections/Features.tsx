'use client';

import { useStaggeredFadeIn } from '@/hooks/useGSAP';
import { ShieldOff, LayoutDashboard, Zap, CreditCard, ShieldAlert, Cpu } from 'lucide-react';

const FEATURE_ICONS = [ShieldOff, LayoutDashboard, Zap, CreditCard, ShieldAlert, Cpu];

export default function FeaturesSection() {
  const cardsRef = useStaggeredFadeIn(0.2, 0.05);
  const features = [
    {
      title: 'Нулевая политика логов',
      description: 'Мы не собираем и не храним журналы активности',
    },
    {
      title: 'Удобная панель управления',
      description: 'Ключи, сервера и инструкции в одном месте',
    },
    {
      title: 'Быстрое подключение',
      description: 'От покупки к подключению за пару минут',
    },
    {
      title: 'Безопасная оплата',
      description: 'Популярные платежные системы',
    },
    {
      title: 'Защита от утечек',
      description: 'Kill-Switch и защита от утечек IPv6 и WebRTC',
    },
    {
      title: 'Современные технологии',
      description: 'Оптимизированные маршруты и серверы',
    },
  ];

  return (
    <section id="features" className="relative hidden select-none overflow-hidden md:block">
      <div
        className="absolute left-1/2 top-0 h-px w-full max-w-7xl -translate-x-1/2 px-4 sm:px-6 lg:px-8"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgb(115 115 115 / 0.4) 1.5px, transparent 1.5px)',
          backgroundSize: '12px 1px',
          backgroundRepeat: 'repeat-x',
          backgroundPosition: '0 0',
        }}
      ></div>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div ref={cardsRef} className="relative" aria-label="Возможности сервиса" role="region">
          <div className="fade-mask">
            <div className="animate-marquee" role="list">
              {features.map((feature, idx) => {
                const Icon = FEATURE_ICONS[idx];
                return (
                  <div key={feature.title} className="card group" tabIndex={-1}>
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500/[0.07] text-primary-400 ring-1 ring-primary-500/15 transition-colors group-hover:bg-primary-500/10">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <h3 className="mb-1 text-lg font-semibold">{feature.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
              {features.map((feature, idx) => {
                const Icon = FEATURE_ICONS[idx];
                return (
                  <div
                    key={`duplicate-${feature.title}`}
                    className="card group"
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500/[0.07] text-primary-400 ring-1 ring-primary-500/15 transition-colors group-hover:bg-primary-500/10">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <h3 className="mb-1 text-lg font-semibold">{feature.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
