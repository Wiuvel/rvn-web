'use client';

import Link from 'next/link';
import DashboardPreviewSection from './DashboardPreviewSection';
import { useFadeIn, useBounceIn, useStaggeredFadeIn, useSlideInUp } from '@/hooks/useGSAP';

export default function PricingSection() {
  const titleRef = useFadeIn(0.1);
  const cardsRef = useStaggeredFadeIn(0.2, 0.1);
  const dashboardRef = useSlideInUp(0.4);
  const plans = [
    {
      id: 'safe-1',
      name: 'SAFE-1',
      price: '200',
      period: 'в месяц',
      features: [
        'До 3 устройств',
        '1TB трафика в месяц',
        'Оптимизированные сервера в Швеции'
      ],
      popular: false,
      available: true,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V7a4.5 4.5 0 10-9 0v3.5M6.75 10.5h10.5a1.5 1.5 0 011.5 1.5v7.5a1.5 1.5 0 01-1.5 1.5H6.75a1.5 1.5 0 01-1.5-1.5V12a1.5 1.5 0 011.5-1.5z"/>
        </svg>
      )
    },
    {
      id: 'safe-2',
      name: 'SAFE-2',
      price: '299',
      period: 'в месяц',
      features: [
        'До 3 устройств',
        'Безлимитный трафик',
        'Быстрые сервера в Германии'
      ],
      popular: true,
      available: true,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15c1.38 0 2.5-1.12 2.5-2.5S13.38 10 12 10s-2.5 1.12-2.5 2.5S10.62 15 12 15z"/>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 20h15a2 2 0 002-2v-7.586a2 2 0 00-.586-1.414L14 2.586a2 2 0 00-2.828 0L3.086 9a2 2 0 00-.586 1.414V18a2 2 0 002 2z"/>
        </svg>
      )
    },
    {
      id: 'premium',
      name: 'PREMIUM',
      price: '449',
      period: 'в месяц',
      features: [
        'До 5 устройств',
        'Безлимитный трафик',
        'Цепочка из двух серверов (Multi-Hop)'
      ],
      popular: false,
      available: false,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m2 0a8 8 0 11-16 0 8 8 0 0116 0z"/>
        </svg>
      )
    }
  ];

  return (
    <section id="pricing" className="relative border-t border-neutral-800/70 bg-neutral-950 overflow-hidden fade-in">
      <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="https://www.w3.org/2000/svg" preserveAspectRatio="none">
        <defs>
          <radialGradient id="grad" cx="50%" cy="50%" r="75%" fx="50%" fy="50%">
            <stop offset="0%" stopColor="#16a3ff" stopOpacity="0.25"/>
            <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad)" />
        <g stroke="rgba(255,255,255,0.05)" strokeWidth="1">
          <line x1="0" y1="20%" x2="100%" y2="20%"/>
          <line x1="0" y1="40%" x2="100%" y2="40%"/>
          <line x1="0" y1="60%" x2="100%" y2="60%"/>
          <line x1="0" y1="80%" x2="100%" y2="80%"/>
        </g>
      </svg>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
        <div ref={titleRef} className="text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold">Простые тарифы</h2>
          <p className="mt-2 text-neutral-400">Разные уровни защиты — один сервис. Найдите свой идеальный тариф.</p>
        </div>
        <div ref={cardsRef} className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <div 
              key={plan.id}
              className={`relative group rounded-3xl border p-6 flex flex-col text-center transition ${
                plan.popular 
                  ? 'border-primary-500/30 bg-neutral-900 shadow-soft hover:border-primary-500 hover:scale-[1.05]' 
                  : 'border-neutral-800 bg-neutral-900 hover:border-primary-500/60 hover:scale-[1.03]'
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary-500 px-3 py-1 text-xs font-medium text-neutral-900">
                  Популярно
                </span>
              )}
              <div className="flex justify-center mb-4 text-primary-400">
                {plan.icon}
              </div>
              <div className="text-sm text-neutral-400">{plan.name}</div>
              <div className="mt-2 text-4xl font-semibold">
                {plan.price}<span className="ml-1 text-2xl align-top font-light text-neutral-400">₽</span>
              </div>
              <div className="text-sm text-neutral-400">{plan.period}</div>
              <ul className="mt-6 space-y-2 text-sm text-neutral-300 text-left mx-auto w-max">
                {plan.features.map((feature, index) => (
                  <li key={index}>{feature}</li>
                ))}
              </ul>
              {plan.available ? (
                <Link 
                  href="#" 
                  className={`mt-6 rounded-xl text-center py-3 font-medium transition ${
                    plan.popular 
                      ? 'bg-primary-500 text-white hover:bg-primary-400 shadow-lg transform duration-300 hover:shadow-blue-500/50' 
                      : 'bg-white text-neutral-900 hover:opacity-90'
                  }`}
                >
                  Купить
                </Link>
              ) : (
                <button 
                  className="mt-6 rounded-xl bg-gray-300 text-neutral-500 text-center py-3 font-medium select-none pointer-events-none"
                  disabled
                >
                  Скоро
                </button>
              )}
              <div className={`absolute -inset-2 rounded-3xl blur-2xl opacity-60 group-hover:opacity-100 -z-10 transition ${
                plan.popular 
                  ? 'bg-gradient-to-tr from-primary-500/20 to-transparent' 
                  : 'bg-gradient-to-tr from-primary-500/10 to-transparent'
              }`}></div>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-xs text-neutral-500">
          * Цены указаны с НДС (если применимо). Возврат средств осуществляется в соответствии с политикой возвратов.
        </p>
      </div>
      <div ref={dashboardRef}>
        <DashboardPreviewSection />
      </div>
    </section>
  );
}
