'use client';

import Link from 'next/link';
import { useFadeIn, useStaggeredFadeIn } from '@/hooks/useGSAP';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function PricingSection() {
  const titleRef = useFadeIn(0.1);
  const cardsRef = useStaggeredFadeIn(0.2, 0.1);
  const footnoteRef = useFadeIn(0.5);
  const plans = [
    {
      id: 'safe-1',
      name: 'SAFE-1',
      price: '200',
      period: 'в месяц',
      features: [
        'До 3 устройств',
        '1ТБ трафика',
        'Протоколы: VLESS'
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
        'Протоколы: VLESS или Hysteria'
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
        'Протоколы: VLESS, Hysteria'
      ],
      popular: false,
      available: true,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m2 0a8 8 0 11-16 0 8 8 0 0116 0z"/>
        </svg>
      )
    }
  ];

  return (
    <section id="pricing" className="relative bg-neutral-950 overflow-hidden fade-in">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl px-6 sm:px-8 lg:px-12 xl:px-16 h-px z-10" style={{
        backgroundImage: 'radial-gradient(circle, rgb(115 115 115 / 0.4) 1.5px, transparent 1.5px)',
        backgroundSize: '12px 1px',
        backgroundRepeat: 'repeat-x',
        backgroundPosition: '0 0'
      }}></div>
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
      <div className="relative mx-auto max-w-7xl px-6 sm:px-8 lg:px-12 xl:px-16 py-12 md:py-16">
        <div ref={titleRef} className="text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold">Простые тарифы</h2>
          <p className="mt-2 text-neutral-400">Разные уровни защиты — один сервис. Найдите свой идеальный тариф.</p>
        </div>
        <div ref={cardsRef} className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <Card 
              key={plan.id}
              className={`relative group border transition ${
                plan.popular 
                  ? 'border-primary-500/30 bg-neutral-900 shadow-soft hover:border-primary-500 hover:scale-[1.05]' 
                  : 'border-neutral-800 bg-neutral-900 hover:border-primary-500/60 hover:scale-[1.03]'
              }`}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-500 text-neutral-900 hover:bg-primary-500">
                  Популярно
                </Badge>
              )}
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4 text-primary-400">
                  {plan.icon}
                </div>
                <CardDescription className="text-sm">{plan.name}</CardDescription>
                <div className="mt-2 text-4xl font-semibold">
                  {plan.price}<span className="ml-1 text-2xl align-top font-light text-neutral-400">₽</span>
                </div>
                <CardDescription className="text-sm">{plan.period}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-neutral-300 text-left mx-auto w-max">
                  {plan.features.map((feature, index) => {
                    // Обрабатываем строки с протоколами для добавления blur эффекта
                    if (feature.includes('VLESS') || feature.includes('Hysteria')) {
                      const parts = feature.split(/(VLESS|Hysteria)/);
                      return (
                        <li key={index}>
                          {parts.map((part, i) => {
                            if (part === 'VLESS' || part === 'Hysteria') {
                              return (
                                <span key={i} className="blur-sm group-hover:blur-none transition cursor-pointer select-none">
                                  {part}
                                </span>
                              );
                            }
                            return <span key={i}>{part}</span>;
                          })}
                        </li>
                      );
                    }
                    return <li key={index}>{feature}</li>;
                  })}
                </ul>
              </CardContent>
              <CardFooter className="flex justify-center">
                {plan.available ? (
                  <Button 
                    asChild
                    className={`w-full ${
                      plan.popular 
                        ? 'bg-primary-500 hover:bg-primary-400 shadow-lg transform duration-300 hover:shadow-blue-500/50' 
                        : '!bg-white !text-neutral-900 hover:!bg-neutral-200 hover:!text-neutral-900 !border-0'
                    }`}
                  >
                    <Link href="#">Купить</Link>
                  </Button>
                ) : (
                  <Button 
                    disabled
                    variant="secondary"
                    className="w-full bg-gray-300 text-neutral-500"
                  >
                    Скоро
                  </Button>
                )}
              </CardFooter>
              <div className={`absolute -inset-2 rounded-3xl blur-2xl opacity-60 group-hover:opacity-100 -z-10 transition ${
                plan.popular 
                  ? 'bg-gradient-to-tr from-primary-500/20 to-transparent' 
                  : 'bg-gradient-to-tr from-primary-500/10 to-transparent'
              }`}></div>
            </Card>
          ))}
        </div>
        <p ref={footnoteRef} className="mt-10 text-center text-xs text-neutral-500">
          * Некоторая информация скрыта для безопасности сервиса. Подробности о каждом тарифе откроются после регистрации.
        </p>
      </div>
    </section>
  );
}
