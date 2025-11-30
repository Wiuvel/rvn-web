'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useFadeIn } from '@/hooks/useGSAP';
import { gsap } from 'gsap';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function HeroSection() {
  const [ping, setPing] = useState(0);
  const [connected, setConnected] = useState(false);
  const [serverInfo, setServerInfo] = useState<{country: string, code: string, flag: string} | null>(null);
  const titleRef = useFadeIn(0.1);
  const subtitleRef = useFadeIn(0.2);
  const buttonsRef = useFadeIn(0.3);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const servers = [
      { country: "Германия", code: "DE-1", flag: "/static/icons/flags/de.svg" },
      { country: "Германия", code: "DE-2", flag: "/static/icons/flags/de.svg" },
      { country: "Швеция", code: "SWE-1", flag: "/static/icons/flags/swe.svg" },
      { country: "Швеция", code: "SWE-2", flag: "/static/icons/flags/swe.svg" }
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

  useEffect(() => {
    if (!glowRef.current || !cardRef.current) return;

    // Анимация свечения - появляется сразу
    gsap.fromTo(glowRef.current,
      {
        opacity: 0,
        scale: 0.8
      },
      {
        opacity: 1,
        scale: 1,
        duration: 0.5,
        ease: "power2.out",
        delay: 0
      }
    );

    // Анимация карточки - появляется через 0.5 секунды после свечения
    gsap.fromTo(cardRef.current,
      {
        opacity: 0,
        x: 30
      },
      {
        opacity: 1,
        x: 0,
        duration: 0.5,
        ease: "power2.out",
        delay: 0.5
      }
    );
  }, []);

  const getPingColor = (pingValue: number) => {
    if (pingValue <= 65) return "text-green-400";
    if (pingValue <= 80) return "text-yellow-400";
    return "text-orange-400";
  };

  return (
    <section id="home" className="relative">
      <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12 xl:px-16 pt-24 pb-24 md:pt-32 md:pb-36 relative z-10">
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-8 md:gap-12 items-center">
          <div className="order-2 lg:order-1 text-center lg:text-left">
            <h1 ref={titleRef} className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight">
              Свобода и безопасность в <br className="hidden sm:block" />один <u>клик</u>
            </h1>
            <p ref={subtitleRef} className="mt-3 md:mt-4 text-neutral-300 text-base md:text-lg max-w-xl mx-auto lg:mx-0">
              Быстрое и надежное решение с низкими тарифами и доступными серверами. Только сегодня на {' '}
              <a 
                href="https://rvn.market" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300 transition-colors duration-200"
              >
                rvn.market
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-3.5 w-3.5 md:h-4 md:w-4 inline-block" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor" 
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </p>
            <div ref={buttonsRef} className="mt-6 md:mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
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
            <div ref={dashboardRef} className="relative w-full">
              <div ref={glowRef} className="absolute -inset-4 md:-inset-8 rounded-full bg-gradient-to-br from-primary-500/20 to-transparent blur-2xl md:blur-3xl opacity-0"></div>
              <Card ref={cardRef} className="relative border-neutral-800/50 bg-neutral-900/50 backdrop-blur-sm shadow-soft opacity-0">
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
