'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { gsap } from 'gsap';
import { useFadeIn, useSlideInLeft, useSlideInRight } from '@/hooks/useGSAP';
import ParticlesBackground from './ParticlesBackground';

export default function HeroSection() {
  const [ping, setPing] = useState(0);
  const [connected, setConnected] = useState(false);
  const [serverInfo, setServerInfo] = useState<{country: string, code: string, flag: string} | null>(null);
  const titleRef = useFadeIn(0.1);
  const subtitleRef = useFadeIn(0.2);
  const buttonsRef = useFadeIn(0.3);
  const dashboardRef = useSlideInRight(0.5);

  const servers = [
    { country: "Германия", code: "DE-1", flag: "/static/icons/flags/de.svg" },
    { country: "Германия", code: "DE-2", flag: "/static/icons/flags/de.svg" },
    { country: "Швеция", code: "SWE-1", flag: "/static/icons/flags/swe.svg" },
    { country: "Швеция", code: "SWE-2", flag: "/static/icons/flags/swe.svg" }
  ];

  useEffect(() => {
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

  return (
    <section id="home" className="relative">
      <ParticlesBackground />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-24 pb-24 md:pt-32 md:pb-36 relative z-10">
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-8 md:gap-12 items-center">
          <div className="order-2 lg:order-1 text-center lg:text-left">
            <h1 ref={titleRef} className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight">
              Свобода и безопасность в <br className="hidden sm:block" />один <u>клик</u>
            </h1>
            <p ref={subtitleRef} className="mt-3 md:mt-4 text-neutral-300 text-base md:text-lg max-w-xl mx-auto lg:mx-0">
              Быстрое и надежное решение с нулевыми логами, шифрованием и серверами в европейских странах — <span className="text-primary-400">Raven Private</span> (VLESS PROXY).
            </p>
            <div ref={buttonsRef} className="mt-6 md:mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Link 
                href="#pricing" 
                className="rounded-2xl bg-primary-500 hover:bg-primary-400 text-white px-5 py-3 md:px-6 md:py-3 font-medium shadow-glow transition shadow-lg transform duration-300 hover:scale-105 hover:shadow-blue-500/50 text-sm md:text-base"
              >
                Выбрать тариф
              </Link>
              <Link 
                href="#apps" 
                className="rounded-2xl border border-neutral-700 px-5 py-3 md:px-6 md:py-3 font-medium hover:bg-neutral-900 transition text-sm md:text-base"
              >
                Подробнее
              </Link>
            </div>
            <div className="mt-4 md:mt-6 flex flex-wrap justify-center lg:justify-start gap-3 md:gap-4 text-xs text-neutral-400 animate-fadeIn">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse"></span>
                <span>99.4% аптайм</span>
              </div>
              <div>7-дн. гарантия</div>
              <div>Поддержка 24/7</div>
            </div>
          </div>
          <div className="hidden sm:flex order-2 lg:order-1 w-full max-w-md mx-auto lg:mx-0 lg:ml-auto flex justify-center lg:justify-end">
            <div ref={dashboardRef} className="relative rounded-3xl border border-neutral-800 bg-neutral-900 p-2 shadow-soft w-full">
              <div className="absolute -inset-4 md:-inset-8 rounded-3xl bg-gradient-to-br from-primary-500/20 to-transparent blur-xl md:blur-2xl"></div>
              <div className="relative rounded-2xl border border-neutral-800 bg-black p-4 md:p-6">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white">
                    {connected ? "Сеанс защищён" : "Подключение…"}
                  </span>
                  <span className={`flex items-center gap-1 ${connected ? "text-green-400" : "text-yellow-400"}`}>
                    <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-400" : "bg-yellow-400"} ${connected ? "" : "animate-ping"}`}></span> 
                    {connected ? "Подключено" : "Проверка"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 md:gap-4">
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
                <button 
                  className="mt-4 md:mt-6 w-full rounded-xl bg-white text-neutral-900 font-medium py-2 md:py-3 hover:shadow-glow transition text-sm md:text-base" 
                  disabled
                >
                  Отключить
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
