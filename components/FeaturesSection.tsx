'use client';

import { useRotateIn, useStaggeredFadeIn } from '@/hooks/useGSAP';

export default function FeaturesSection() {
  const titleRef = useRotateIn(0.1);
  const cardsRef = useStaggeredFadeIn(0.2, 0.05);
  const features = [
    {
      title: "Молниеносная скорость",
      description: "Протоколы VLESS и Hysteria, оптимизированные маршруты и 25-Гбит сети"
    },
    {
      title: "Нулевая политика логов",
      description: "Мы не собираем и не храним журналы активности."
    },
    {
      title: "Удобная панель управления",
      description: "Ключи/сервера/инструкции — все в одном месте без лишних шагов"
    },
    {
      title: "Отзывчивая поддержка",
      description: "Оперативная помощь и рекомендации по настройке в любое время"
    },
    {
      title: "Данные под надежной защитой",
      description: "Kill-Switch, DNS-over-HTTPS, защита от утечек IPv6 и WebRTC"
    },
    {
      title: "Быстрое подключение",
      description: "От покупки к подключению — пару минут"
    },
    {
      title: "Безопасная оплата",
      description: "Популярные платежные системы и методы оплаты"
    }
  ];

  return (
    <section id="features" className="border-t border-neutral-800/70 overflow-hidden select-none">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <h2 ref={titleRef} className="text-2xl font-semibold text-center mb-10">
          <span className="inline-flex items-center justify-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-2xl">Возможности</span>
          </span>
        </h2>
        <div ref={cardsRef} className="relative" aria-label="Возможности сервиса" role="region">
          <div className="fade-mask">
            <div className="animate-marquee" role="list">
              {features.map((feature, index) => (
                <div key={index} className="card" tabIndex={-1}>
                  <h3 className="text-xl font-semibold mb-1">{feature.title}</h3>
                  <p className="mt-2 text-neutral-400">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
