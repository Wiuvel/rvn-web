'use client';

import { useFadeIn } from '@/hooks/useGSAP';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, ShieldCheck, CloudDownload, Headphones, Sparkles } from 'lucide-react';

export default function AdvantagesSection() {
  const leftRef = useFadeIn(0.1);
  const rightRef = useFadeIn(0.2);

  const advantages = [
    {
      icon: <Zap className="h-5 w-5" />,
      title: 'Молниеносная скорость',
      description: 'Высокоскоростные серверы',
      gradient: 'from-orange-500/20 to-amber-500/20',
      iconBg: 'bg-orange-500/10 ring-orange-500/20',
      iconColor: 'text-orange-400',
    },
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: 'Надежная защита',
      description: 'Проверенная система защиты',
      gradient: 'from-green-500/20 to-emerald-500/20',
      iconBg: 'bg-green-500/10 ring-green-500/20',
      iconColor: 'text-green-400',
    },
    {
      icon: <CloudDownload className="h-5 w-5" />,
      title: 'Высокая пропускная способность',
      description: 'Около 25 Гбит/с на сервер',
      gradient: 'from-primary-500/20 to-blue-500/20',
      iconBg: 'bg-primary-500/10 ring-primary-500/20',
      iconColor: 'text-primary-400',
    },
    {
      icon: <Headphones className="h-5 w-5" />,
      title: 'Круглосуточная поддержка',
      description: 'Помощь в любое время',
      gradient: 'from-red-500/20 to-rose-500/20',
      iconBg: 'bg-red-500/10 ring-red-500/20',
      iconColor: 'text-red-400',
    },
  ];

  return (
    <section id="advantages" className="fade-in relative overflow-hidden">
      <div
        className="pointer-events-none absolute left-0 top-1/2 hidden h-[300px] w-[300px] -translate-y-1/2 rounded-full bg-primary-500/[0.03] blur-[100px] md:block"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div ref={leftRef} className="order-2 grid grid-cols-2 gap-4 lg:order-1">
            {advantages.map((advantage) => (
              <Card
                key={advantage.title}
                className="group relative overflow-hidden border-neutral-800/60 bg-neutral-900/40 backdrop-blur-sm transition-colors duration-200 hover:border-neutral-700"
              >
                {/* Top gradient accent line */}
                <div
                  className={`absolute left-0 right-0 top-0 h-px bg-gradient-to-r ${advantage.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
                />

                <CardContent className="p-4 md:p-5">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${advantage.iconBg} icon-float mb-3 ring-1`}
                  >
                    <div className={advantage.iconColor}>{advantage.icon}</div>
                  </div>
                  <h3 className="mb-1 text-base font-semibold text-white md:text-lg">
                    {advantage.title}
                  </h3>
                  <p className="text-xs text-neutral-500 md:text-sm">{advantage.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div ref={rightRef} className="order-1 space-y-6 lg:order-2">
            <Badge
              variant="outline"
              className="border-neutral-700/50 bg-neutral-800/50 text-neutral-400 hover:bg-neutral-800/50"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Преимущества
            </Badge>
            <h2 className="text-2xl font-semibold leading-tight text-white md:text-3xl lg:text-4xl">
              Почему именно <span className="text-primary-400">мы</span>?
            </h2>
            <p className="text-base leading-relaxed text-neutral-400 md:text-lg">
              Сервис на базе современных технологий, пропускная способность каждого сервера до 25
              Гбит/с, надежная защита данных. Безопасный и быстрый доступ к интернету для вас.
            </p>

            {/* Decorative stats */}
            <div className="grid grid-cols-3 gap-4 pt-4">
              <div className="text-center lg:text-left">
                <div className="text-2xl font-bold text-white md:text-3xl">
                  25<span className="text-primary-400">+</span>
                </div>
                <div className="mt-1 text-xs text-neutral-500">Гбит/с на сервер</div>
              </div>
              <div className="text-center lg:text-left">
                <div className="text-2xl font-bold text-white md:text-3xl">
                  99.9<span className="text-primary-400">%</span>
                </div>
                <div className="mt-1 text-xs text-neutral-500">Аптайм серверов</div>
              </div>
              <div className="text-center lg:text-left">
                <div className="text-2xl font-bold text-white md:text-3xl">
                  24<span className="text-primary-400">/7</span>
                </div>
                <div className="mt-1 text-xs text-neutral-500">Поддержка</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
