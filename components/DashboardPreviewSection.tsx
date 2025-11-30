'use client';

import Link from 'next/link';
import { useFadeIn } from '@/hooks/useGSAP';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DashboardPreviewSection() {
  const textRef = useFadeIn(0.1);
  const cardRef = useFadeIn(0.2);

  return (
    <section id="dashboard-preview" className="isolate relative z-0 hidden md:block">
      <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12 xl:px-16 py-12 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div ref={textRef} className="order-2 lg:order-1 text-left space-y-6">
            <Badge variant="outline" className="bg-neutral-800/50 border-neutral-700/50 text-neutral-400 hover:bg-neutral-800/50">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
              </svg>
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
                <Link href="/auth">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  <span className="whitespace-nowrap">Авторизация</span>
                </Link>
              </Button>
              <Button asChild variant="ghost" className="border-2 border-neutral-800/50 bg-transparent hover:bg-neutral-900/50 hover:border-neutral-700 hover:scale-105">
                <Link href="#">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v4.5H6v-4.5z" />
                  </svg>
                  <span className="whitespace-nowrap">Новости</span>
                </Link>
              </Button>
              <Button asChild variant="ghost" className="border-2 border-neutral-800/50 bg-transparent hover:bg-neutral-900/50 hover:border-neutral-700 hover:scale-105">
                <Link href="#advantages">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                  </svg>
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
                  <div className="mt-1 text-lg font-semibold">SAFE-2</div>
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

