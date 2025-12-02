'use client';

import Link from 'next/link';
import { useFadeIn } from '@/hooks/useGSAP';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Monitor, LogIn, Newspaper, Info } from "lucide-react";

export default function DashboardPreviewSection() {
  const textRef = useFadeIn(0.1);
  const cardRef = useFadeIn(0.2);

  return (
    <section id="dashboard-preview" className="isolate relative z-0 hidden md:block">
      <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12 xl:px-16 py-12 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div ref={textRef} className="order-2 lg:order-1 text-left space-y-6">
            <Badge variant="outline" className="bg-neutral-800/50 border-neutral-700/50 text-neutral-400 hover:bg-neutral-800/50">
              <Monitor className="h-4 w-4 mr-2" />
              Интерфейс
            </Badge>
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-semibold leading-tight">
              Профиль пользователя
            </h2>
            <p className="mt-3 text-neutral-400 text-sm md:text-base max-w-xl">
              Простой старт без сложных настроек: подписка и ключи — на одной странице. Зарегистрируйтесь и начните пользоваться сервисом.
            </p>
            <div className="mt-4 md:mt-6 flex flex-wrap gap-3 md:gap-4 justify-start">
              <Button asChild variant="ghost" className="border-2 border-neutral-800/50 bg-transparent hover:bg-neutral-900/50 hover:border-neutral-700 hover:scale-105">
                <Link href="/auth" prefetch={false}>
                  <LogIn className="h-5 w-5 flex-shrink-0" />
                  <span className="whitespace-nowrap">Авторизация</span>
                </Link>
              </Button>
              <Button asChild variant="ghost" className="border-2 border-neutral-800/50 bg-transparent hover:bg-neutral-900/50 hover:border-neutral-700 hover:scale-105">
                <Link href="#" prefetch={false}>
                  <Newspaper className="h-5 w-5 flex-shrink-0" />
                  <span className="whitespace-nowrap">Новости</span>
                </Link>
              </Button>
              <Button asChild variant="ghost" className="border-2 border-neutral-800/50 bg-transparent hover:bg-neutral-900/50 hover:border-neutral-700 hover:scale-105">
                <Link href="#advantages" prefetch={false}>
                  <Info className="h-5 w-5 flex-shrink-0" />
                  <span className="whitespace-nowrap">О проекте</span>
                </Link>
              </Button>
            </div>
          </div>
          <div ref={cardRef} className="order-1 lg:order-2 hidden lg:block">
            <Card className="border-neutral-800 bg-black w-full ml-auto">
              <CardHeader className="p-4">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <CardTitle className="text-white text-sm">Личный кабинет</CardTitle>
                  <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30 flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-green-400"></span>
                    Online
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                  <div className="text-neutral-400 text-xs">Подписка</div>
                  <div className="mt-1 text-lg font-semibold">SAFE-1</div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                  <div className="text-neutral-400 text-xs">Действует до</div>
                  <div className="mt-1 text-lg font-semibold text-neutral-200">—.—.25</div>
                </div>
                  <div className="col-span-2 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                    <div className="text-neutral-400 text-xs">Ваш ключ</div>
                    <div className="mt-1 font-mono text-sm truncate">
                      vless://<span className="blur-sm hover:blur-none transition cursor-pointer select-none">xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</span>@rvn.market
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  <Badge variant="outline" className="bg-neutral-950/60 border-neutral-800 py-2 text-xs">DE-1</Badge>
                  <Badge variant="outline" className="bg-neutral-950/60 border-neutral-800 py-2 text-xs">DE-2</Badge>
                  <Badge variant="outline" className="bg-neutral-950/60 border-neutral-800 py-2 text-xs">SWE-1</Badge>
                  <Badge variant="outline" className="bg-neutral-950/60 border-neutral-800 py-2 text-xs">SWE-2</Badge>
                </div>
                <Button className="mt-2 w-full bg-white text-neutral-900 hover:bg-white/90" disabled>
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

