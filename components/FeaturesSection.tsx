'use client';

import { useStaggeredFadeIn } from '@/hooks/useGSAP';

export default function FeaturesSection() {
  const cardsRef = useStaggeredFadeIn(0.2, 0.05);
  const features = [
    {
      title: "Нулевая политика логов",
      description: "Мы не собираем и не храним журналы активности"
    },
    {
      title: "Удобная панель управления",
      description: "Ключи, сервера и инструкции в одном месте"
    },
    {
      title: "Быстрое подключение",
      description: "От покупки к подключению за пару минут"
    },
    {
      title: "Безопасная оплата",
      description: "Популярные платежные системы"
    },
    {
      title: "Защита от утечек",
      description: "Kill-Switch и защита от утечек IPv6 и WebRTC"
    },
    {
      title: "Современные технологии",
      description: "Оптимизированные маршруты и серверы"
    }
  ];

  return (
    <section id="features" className="overflow-hidden select-none relative hidden md:block">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl px-6 sm:px-8 lg:px-12 xl:px-16 h-px" style={{
        backgroundImage: 'radial-gradient(circle, rgb(115 115 115 / 0.4) 1.5px, transparent 1.5px)',
        backgroundSize: '12px 1px',
        backgroundRepeat: 'repeat-x',
        backgroundPosition: '0 0'
      }}></div>
      <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12 xl:px-16 py-12">
        <div ref={cardsRef} className="relative" aria-label="Возможности сервиса" role="region">
          <div className="fade-mask">
            <div className="animate-marquee" role="list">
              {features.map((feature, index) => (
                <div key={index} className="card" tabIndex={-1}>
                  <h3 className="text-xl font-semibold mb-1">{feature.title}</h3>
                  <p className="mt-2 text-neutral-400">{feature.description}</p>
                </div>
              ))}
              {features.map((feature, index) => (
                <div key={`duplicate-${index}`} className="card" tabIndex={-1} aria-hidden="true">
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
