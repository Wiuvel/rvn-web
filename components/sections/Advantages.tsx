'use client';

import { useFadeIn } from '@/hooks/useGSAP';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, ShieldCheck, CloudDownload, Headphones, Sparkles } from "lucide-react";

export default function AdvantagesSection() {
  const leftRef = useFadeIn(0.1);
  const rightRef = useFadeIn(0.2);

  const advantages = [
    {
      icon: <Zap className="h-6 w-6 text-white" />,
      title: "Молниеносная скорость",
      description: "Высокоскоростные серверы",
      color: "bg-orange-500"
    },
    {
      icon: <ShieldCheck className="h-6 w-6 text-white" />,
      title: "Надежная защита",
      description: "Проверенная система защиты",
      color: "bg-green-500"
    },
    {
      icon: <CloudDownload className="h-6 w-6 text-white" />,
      title: "Высокая пропускная способность",
      description: "Около 25 Гбит/с на сервер",
      color: "bg-primary-500"
    },
    {
      icon: <Headphones className="h-6 w-6 text-white" />,
      title: "Круглосуточная поддержка",
      description: "Помощь в любое время",
      color: "bg-red-500"
    }
  ];

  return (
    <section id="advantages" className="fade-in">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 md:py-16">
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
              <Sparkles className="h-4 w-4 mr-2" />
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

