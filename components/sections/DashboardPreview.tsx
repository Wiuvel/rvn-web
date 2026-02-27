'use client';

import Link from 'next/link';
import { useFadeIn } from '@/hooks/useGSAP';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Monitor, LogIn, Newspaper, Info } from 'lucide-react';

export default function DashboardPreviewSection() {
  const textRef = useFadeIn(0.1);
  const cardRef = useFadeIn(0.2);

  return (
    <section id="dashboard-preview" className="relative isolate z-0 hidden md:block">
      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div ref={textRef} className="order-2 space-y-6 text-left lg:order-1">
            <Badge
              variant="outline"
              className="border-neutral-700/50 bg-neutral-800/50 text-neutral-400 hover:bg-neutral-800/50"
            >
              <Monitor className="mr-2 h-4 w-4" />
              Интерфейс
            </Badge>
            <h2 className="text-2xl font-semibold leading-tight md:text-3xl lg:text-4xl">
              Профиль пользователя
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-400 md:text-base">
              Простой старт без сложных настроек: подписка и ключи — на одной странице.
              Зарегистрируйтесь и начните пользоваться сервисом.
            </p>
            <div className="mt-4 flex flex-wrap justify-start gap-3 md:mt-6 md:gap-4">
              <Button
                asChild
                variant="ghost"
                className="border border-neutral-700/50 bg-neutral-900/30 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:border-neutral-600 hover:bg-neutral-800/50"
              >
                <Link href="/auth">
                  <LogIn className="h-5 w-5 flex-shrink-0" />
                  <span className="whitespace-nowrap">Авторизация</span>
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="border border-neutral-700/50 bg-neutral-900/30 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:border-neutral-600 hover:bg-neutral-800/50"
              >
                <Link href="#">
                  <Newspaper className="h-5 w-5 flex-shrink-0" />
                  <span className="whitespace-nowrap">Новости</span>
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="border border-neutral-700/50 bg-neutral-900/30 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:border-neutral-600 hover:bg-neutral-800/50"
              >
                <Link href="#advantages">
                  <Info className="h-5 w-5 flex-shrink-0" />
                  <span className="whitespace-nowrap">О проекте</span>
                </Link>
              </Button>
            </div>
          </div>
          <div ref={cardRef} className="relative isolate order-1 hidden lg:order-2 lg:block">
            <Card className="glass-card-no-flicker relative z-10 ml-auto w-full overflow-hidden border-neutral-800/50 bg-neutral-900/60 shadow-2xl shadow-black/20 backdrop-blur-md">
              {/* Top gradient accent */}
              <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-500/30 to-transparent" />

              <CardHeader className="p-4">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <CardTitle className="text-sm font-medium text-white">Личный кабинет</CardTitle>
                  <Badge
                    variant="outline"
                    className="flex items-center gap-1.5 border-green-500/25 bg-green-500/15 text-green-400 backdrop-blur-sm"
                  >
                    <span className="pulse-ring h-2 w-2 rounded-full bg-green-400"></span>
                    Online
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-neutral-800/70 bg-neutral-950/50 p-3 transition-colors hover:border-neutral-700/50">
                    <div className="text-xs text-neutral-500">Подписка</div>
                    <div className="mt-1 text-lg font-semibold text-white">SAFE-1</div>
                  </div>
                  <div className="rounded-xl border border-neutral-800/70 bg-neutral-950/50 p-3 transition-colors hover:border-neutral-700/50">
                    <div className="text-xs text-neutral-500">Действует до</div>
                    <div className="mt-1 text-lg font-semibold text-neutral-200">—.—.25</div>
                  </div>
                  <div className="col-span-2 rounded-xl border border-neutral-800/70 bg-neutral-950/50 p-3 transition-colors hover:border-neutral-700/50">
                    <div className="text-xs text-neutral-500">Ваш ключ</div>
                    <div className="mt-1 truncate font-mono text-sm text-neutral-300">
                      vless://
                      <span className="cursor-pointer select-none blur-sm transition-all duration-300 hover:blur-none">
                        xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
                      </span>
                      @rvn.market
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  <Badge
                    variant="outline"
                    className="border-neutral-800/60 bg-neutral-950/60 py-2 text-xs transition-colors hover:border-primary-500/30"
                  >
                    DE-1
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-neutral-800/60 bg-neutral-950/60 py-2 text-xs transition-colors hover:border-primary-500/30"
                  >
                    DE-2
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-neutral-800/60 bg-neutral-950/60 py-2 text-xs transition-colors hover:border-primary-500/30"
                  >
                    SWE-1
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-neutral-800/60 bg-neutral-950/60 py-2 text-xs transition-colors hover:border-primary-500/30"
                  >
                    SWE-2
                  </Badge>
                </div>
                <Button
                  className="mt-3 w-full bg-white text-neutral-900 transition-all duration-300 hover:bg-white/90"
                  disabled
                >
                  Добавить устройство
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
