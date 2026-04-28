'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, ChevronRight } from 'lucide-react';

const INITIAL_PING = () => Math.floor(Math.random() * 15) + 48;

export default function HeroSection() {
  const [ping, setPing] = useState(INITIAL_PING);
  const [connected, setConnected] = useState(false);
  const [serverInfo, setServerInfo] = useState<{
    country: string;
    code: string;
    countryCode: string;
  } | null>(null);

  useEffect(() => {
    const servers = [
      { country: 'Германия', code: 'DE-1', countryCode: 'de' },
      { country: 'Германия', code: 'DE-2', countryCode: 'de' },
      { country: 'Швеция', code: 'SE-1', countryCode: 'se' },
      { country: 'Швеция', code: 'SE-2', countryCode: 'se' },
      { country: 'Нидерланды', code: 'NL-1', countryCode: 'nl' },
      { country: 'Нидерланды', code: 'NL-2', countryCode: 'nl' },
    ];

    const timer = setTimeout(() => {
      setConnected(true);
      setPing(INITIAL_PING);
      const randomServer = servers[Math.floor(Math.random() * servers.length)];
      setServerInfo(randomServer);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!connected) return;

    const updatePing = () => {
      const change = (Math.random() * 7 + 5) * (Math.random() > 0.5 ? 1 : -1);
      setPing((prev) => {
        let newPing = prev + change + (50 - prev) * 0.02;
        if (Math.random() < 0.15) newPing += Math.random() * 20;
        return Math.min(Math.max(newPing, 45), 95);
      });
    };

    const interval = setInterval(updatePing, 3000);
    return () => clearInterval(interval);
  }, [connected]);

  const getPingColor = (pingValue: number) => {
    if (pingValue <= 65) return 'text-green-400';
    if (pingValue <= 80) return 'text-yellow-400';
    return 'text-orange-400';
  };

  return (
    <section id="home" className="relative overflow-hidden bg-transparent">
      {/* Hero mesh gradient background */}
      <div
        className="hero-mesh pointer-events-none absolute inset-0 opacity-40"
        aria-hidden="true"
      />

      {/* Top radial glow - reduced intensity */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[min(1000px,100vw)] -translate-x-1/2 rounded-full bg-primary-500/[0.04] blur-[60px] sm:blur-[100px]"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8 lg:pb-36 lg:pt-32">
        <div className="flex flex-col items-center gap-8 md:gap-12 lg:grid lg:grid-cols-2">
          <div className="order-2 text-center lg:order-1 lg:text-left">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary-500/20 bg-primary-500/[0.06] px-4 py-1.5 text-xs text-primary-300 backdrop-blur-sm md:mb-6">
              <Shield className="h-3.5 w-3.5" />
              <span>Надёжная защита данных</span>
              <ChevronRight className="h-3 w-3 opacity-50" />
            </div>

            <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
              Свобода и безопасность в <br className="hidden sm:block" />
              один <span className="text-primary-400">клик</span>
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-neutral-400 md:mt-4 md:text-lg lg:mx-0">
              Быстрое и надежное решение с низкими тарифами и доступными серверами. Выбирайте лучшее
              для себя.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row md:mt-8 lg:justify-start">
              <Button
                asChild
                size="lg"
                className="bg-primary-500 text-white shadow-lg shadow-primary-500/20 transition-all duration-300 hover:scale-105 hover:bg-primary-400 hover:shadow-primary-500/40 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500 disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-lg"
              >
                <Link href="subscription/">Выбрать тариф</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="border border-neutral-700/50 bg-neutral-900/30 backdrop-blur-sm transition-all duration-300 hover:border-neutral-600 hover:bg-neutral-800/50"
              >
                <Link href="#apps">Подробнее</Link>
              </Button>
            </div>
            <div className="mt-5 flex animate-fadeIn flex-wrap justify-center gap-4 text-xs text-neutral-500 md:mt-7 md:gap-5 lg:justify-start">
              <div className="flex items-center gap-2">
                <span className="pulse-ring inline-block h-2 w-2 rounded-full bg-green-400"></span>
                <span>Высокая надежность</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary-400/60"></span>
                <span>7-дн. гарантия</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary-400/60"></span>
                <span>Поддержка 24/7</span>
              </div>
            </div>
          </div>
          <div className="order-2 mx-auto hidden w-full max-w-md justify-center sm:flex lg:order-1 lg:mx-0 lg:ml-auto lg:justify-end">
            <div className="relative isolate w-full" style={{ zIndex: 0 }}>
              {/* Glow строго сзади: z-[-1] */}
              <div
                className="pointer-events-none absolute -inset-4 z-[-1] rounded-full bg-gradient-to-br from-primary-500/20 to-transparent blur-2xl md:-inset-8 md:blur-3xl"
                aria-hidden="true"
              />

              {/* Отдельный контекст наложения для карточки с z-10 */}
              <div className="relative z-10">
                <Card className="glass-card-no-flicker border-neutral-800/50 bg-neutral-900/60 shadow-2xl shadow-black/20 backdrop-blur-md">
                  <CardHeader className="p-4 md:p-6">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-white">
                        {connected ? 'Сеанс защищён' : 'Подключение…'}
                      </span>
                      <Badge
                        variant={connected ? 'default' : 'secondary'}
                        className={`${connected ? 'border-green-500/25 bg-green-500/15 text-green-400 hover:!bg-green-500/15' : 'border-yellow-500/25 bg-yellow-500/15 text-yellow-400 hover:!bg-yellow-500/15'} flex items-center gap-1.5 backdrop-blur-sm`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${connected ? 'pulse-ring bg-green-400' : 'bg-yellow-400'}`}
                        ></span>
                        {connected ? 'Подключено' : 'Проверка'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 md:p-6">
                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                      <div className="rounded-xl border border-neutral-800/70 bg-neutral-950/50 p-3 md:p-4">
                        <div className="text-xs text-neutral-500">Макс. скорость</div>
                        <div className="mt-1 text-xl font-semibold text-white md:text-2xl">
                          1 Гбит/с
                        </div>
                      </div>
                      <div className="rounded-xl border border-neutral-800/70 bg-neutral-950/50 p-3 md:p-4">
                        <div className="text-xs text-neutral-500">Пинг</div>
                        <div
                          className={`mt-1 text-xl font-semibold md:text-2xl ${getPingColor(ping)}`}
                        >
                          {connected ? `${Math.round(ping)} ms` : '– ms'}
                        </div>
                      </div>
                      <div className="col-span-2 rounded-xl border border-neutral-800/70 bg-neutral-950/50 p-3 md:p-4">
                        <div className="text-xs text-neutral-500">Текущий сервер</div>
                        {!connected ? (
                          <div className="mt-1 flex animate-pulse items-center gap-2 text-neutral-500">
                            <span>Выбор сервера…</span>
                          </div>
                        ) : serverInfo ? (
                          <div className="mt-1 flex items-center gap-2">
                            <span
                              className={`fi fi-${serverInfo.countryCode} fis h-4 w-6 rounded-sm border border-neutral-700`}
                            />
                            <span className="text-sm font-medium text-white md:text-base">
                              {serverInfo.country} · {serverInfo.code}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <Button
                      className="mt-4 w-full bg-white text-neutral-900 transition-all duration-300 hover:bg-white/90 hover:shadow-glow md:mt-6"
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
      </div>
    </section>
  );
}
