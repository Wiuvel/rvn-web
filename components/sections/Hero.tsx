'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStaticUrl } from "@/lib/utils";

interface HeroSectionProps {
  onLightRaysLoad?: () => void;
}

// Heavy WebGL effect — load client-side only; include gentle fade-in on mount.
const LightRays = dynamic(() => import('@/components/LightRays'), {
  ssr: false,
  loading: () => <div className="absolute inset-0" aria-hidden="true" />
});

export default function HeroSection({ onLightRaysLoad }: HeroSectionProps = {}) {
  const [ping, setPing] = useState(0);
  const [connected, setConnected] = useState(false);
  const [serverInfo, setServerInfo] = useState<{ country: string, code: string, flag: string } | null>(null);

  useEffect(() => {
    const servers = [
      { country: "Германия", code: "DE-1", flag: getStaticUrl("/static/icons/flags/de.svg") },
      { country: "Германия", code: "DE-2", flag: getStaticUrl("/static/icons/flags/de.svg") },
      { country: "Швеция", code: "SWE-1", flag: getStaticUrl("/static/icons/flags/swe.svg") },
      { country: "Швеция", code: "SWE-2", flag: getStaticUrl("/static/icons/flags/swe.svg") }
    ];

    const timer = setTimeout(() => {
      setConnected(true);
      const randomServer = servers[Math.floor(Math.random() * servers.length)];
      setServerInfo(randomServer);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!connected) return;

    const updatePing = () => {
      const change = (Math.random() * 7 + 5) * (Math.random() > 0.5 ? 1 : -1);
      setPing(prev => {
        let newPing = prev + change + (50 - prev) * 0.02;
        if (Math.random() < 0.15) newPing += Math.random() * 20;
        return Math.min(Math.max(newPing, 45), 95);
      });
    };

    const interval = setInterval(updatePing, 1200);
    return () => clearInterval(interval);
  }, [connected]);


  const getPingColor = (pingValue: number) => {
    if (pingValue <= 65) return "text-green-400";
    if (pingValue <= 80) return "text-yellow-400";
    return "text-orange-400";
  };

  // Отслеживаем загрузку LightRays
  useEffect(() => {
    if (!onLightRaysLoad) return;

    let hasCalled = false;
    
    const checkLightRaysLoaded = () => {
      if (hasCalled) return;
      
      // Ищем canvas внутри секции Hero
      const heroSection = document.querySelector('#home');
      if (!heroSection) return;
      
      const canvas = heroSection.querySelector('canvas');
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        // Canvas инициализирован и имеет размеры - LightRays загружен
        hasCalled = true;
        // Даем небольшую задержку для завершения инициализации WebGL
        setTimeout(() => {
          onLightRaysLoad();
        }, 150);
        return true;
      }
      return false;
    };

    // Используем MutationObserver для отслеживания появления canvas
    const observer = new MutationObserver(() => {
      checkLightRaysLoaded();
    });

    // Наблюдаем за изменениями в document
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['width', 'height']
    });

    // Проверяем сразу и через небольшие интервалы
    if (checkLightRaysLoaded()) {
      observer.disconnect();
      return;
    }

    const interval = setInterval(() => {
      if (checkLightRaysLoaded()) {
        clearInterval(interval);
        observer.disconnect();
      }
    }, 50);

    // Таймаут на случай если LightRays не загрузится
    const timeout = setTimeout(() => {
      if (!hasCalled && onLightRaysLoad) {
        hasCalled = true;
        onLightRaysLoad();
      }
      clearInterval(interval);
      observer.disconnect();
    }, 3000);

    return () => {
      observer.disconnect();
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [onLightRaysLoad]);

  return (
    <section id="home" className="relative overflow-visible bg-neutral-950">
      <div className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
        <LightRays
          raysOrigin="top-center"
          raysColor="#45beff"
          raysSpeed={1.0}
          lightSpread={0.8}
          rayLength={3.0}
          followMouse={false}
          mouseInfluence={0.1}
          noiseAmount={0.1}
          distortion={0.05}
          fadeDistance={2.0}
          className="custom-rays"
        />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none z-10 bg-gradient-to-t from-neutral-950 to-transparent" />
      <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12 xl:px-16 pt-24 pb-24 md:pt-32 md:pb-36 relative z-10">
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-8 md:gap-12 items-center">
          <div className="order-2 lg:order-1 text-center lg:text-left">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight">
              Свобода и безопасность в <br className="hidden sm:block" />один <u>клик</u>
            </h1>
            <p className="mt-3 md:mt-4 text-neutral-300 text-base md:text-lg max-w-xl mx-auto lg:mx-0">
              Быстрое и надежное решение с низкими тарифами и доступными серверами. Выбирайте лучшее для себя.
            </p>
            <div className="mt-6 md:mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Button asChild size="lg" className="bg-primary-400 text-black hover:bg-primary-500 shadow-lg hover:shadow-blue-500/50 hover:scale-105 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-lg">
                <Link href="#pricing">Выбрать тариф</Link>
              </Button>
              <Button asChild variant="ghost" size="lg" className="border-2 border-neutral-800/50 bg-transparent hover:bg-neutral-900/50 hover:border-neutral-700">
                <Link href="#apps">Подробнее</Link>
              </Button>
            </div>
            <div className="mt-4 md:mt-6 flex flex-wrap justify-center lg:justify-start gap-3 md:gap-4 text-xs text-neutral-400 animate-fadeIn">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse"></span>
                <span>Высокая надежность</span>
              </div>
              <div>7-дн. гарантия</div>
              <div>Поддержка 24/7</div>
            </div>
          </div>
          <div className="hidden sm:flex order-2 lg:order-1 w-full max-w-md mx-auto lg:mx-0 lg:ml-auto flex justify-center lg:justify-end">
            <div className="relative w-full">
              <div className="absolute -inset-4 md:-inset-8 rounded-full bg-gradient-to-br from-primary-500/20 to-transparent blur-2xl md:blur-3xl"></div>
              <Card className="relative border-neutral-800/50 bg-neutral-900/50 backdrop-blur-sm shadow-soft">
                <CardHeader className="p-4 md:p-6">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white">
                      {connected ? "Сеанс защищён" : "Подключение…"}
                    </span>
                    <Badge variant={connected ? "default" : "secondary"} className={`${connected ? "bg-green-500/20 text-green-400 border-green-500/30 hover:!bg-green-500/20" : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:!bg-yellow-500/20"} flex items-center gap-1`}>
                      <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-400" : "bg-yellow-400"} ${connected ? "" : "animate-ping"}`}></span>
                      {connected ? "Подключено" : "Проверка"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 md:p-6 pt-0">
                  <div className="grid grid-cols-2 gap-3 md:gap-4">
                    <div className="rounded-xl border border-neutral-800 p-3 md:p-4">
                      <div className="text-neutral-400 text-xs">Макс. скорость</div>
                      <div className="mt-1 text-xl md:text-2xl font-semibold">1 Гбит/с</div>
                    </div>
                    <div className="rounded-xl border border-neutral-800 p-3 md:p-4">
                      <div className="text-neutral-400 text-xs">Пинг</div>
                      <div className={`mt-1 text-xl md:text-2xl font-semibold ${getPingColor(ping)}`}>
                        {connected ? `${Math.round(ping)} ms` : "– ms"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-neutral-800 p-3 md:p-4 col-span-2">
                      <div className="text-neutral-400 text-xs">Текущий сервер</div>
                      {!connected ? (
                      <div className="mt-1 flex items-center gap-2 text-neutral-500 animate-pulse">
                          <span>Выбор сервера…</span>
                      </div>
                      ) : serverInfo ? (
                        <div className="mt-1 flex items-center gap-2">
                          <Image
                            src={serverInfo.flag}
                            alt={serverInfo.country}
                            width={24}
                            height={16}
                            className="h-4 w-6 rounded-sm border border-neutral-700"
                          />
                          <span className="font-medium text-sm md:text-base">
                            {serverInfo.country} · {serverInfo.code}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    className="mt-4 md:mt-6 w-full bg-white text-neutral-900 hover:bg-white/90 hover:shadow-glow"
                    disabled
                  >
                    Отключить
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
