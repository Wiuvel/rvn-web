'use client';

import { useFadeIn } from '@/hooks/useGSAP';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AdvantagesSection() {
  const leftRef = useFadeIn(0.1);
  const rightRef = useFadeIn(0.2);

  const advantages = [
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      title: "Молниеносная скорость",
      description: "Высокоскоростные серверы",
      color: "bg-orange-500"
    },
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      title: "Надежная защита",
      description: "Проверенная система защиты",
      color: "bg-green-500"
    },
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      ),
      title: "Высокая пропускная способность",
      description: "Около 25 Гбит/с на сервер",
      color: "bg-primary-500"
    },
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      title: "Круглосуточная поддержка",
      description: "Помощь в любое время",
      color: "bg-red-500"
    }
  ];

  return (
    <section id="advantages" className="fade-in">
      <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12 xl:px-16 py-12 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Левая часть - карточки */}
          <div ref={leftRef} className="grid grid-cols-2 gap-4 order-2 lg:order-1">
            {advantages.map((advantage, index) => (
              <Card
                key={index}
                className="border-neutral-800 bg-neutral-900/50 transition-colors duration-200 hover:border-neutral-700"
              >
                <CardContent className="p-4 md:p-5">
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-neutral-800 border border-neutral-700 mb-3">
                    <div className="text-white">
                      {advantage.icon}
                    </div>
                  </div>
                  <h3 className="text-base md:text-lg font-semibold text-white mb-1">
                    {advantage.title}
                  </h3>
                  <p className="text-xs md:text-sm text-neutral-400">
                    {advantage.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Правая часть - текст и кнопка */}
          <div ref={rightRef} className="space-y-6 order-1 lg:order-2">
            <Badge variant="outline" className="bg-neutral-800/50 border-neutral-700/50 text-neutral-400 hover:bg-neutral-800/50">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              Преимущества
            </Badge>
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-white leading-tight">
              Почему именно мы?
            </h2>
            <p className="text-base md:text-lg text-neutral-300 leading-relaxed">
              Сервис на базе современных технологий, пропускная способность каждого сервера до 25 Гбит/с, надежная защита данных. Безопасный и быстрый доступ к интернету для вас.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

