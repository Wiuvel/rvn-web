'use client';

import Link from 'next/link';
import { useFadeIn, useStaggeredFadeIn } from '@/hooks/useGSAP';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

declare global {
  interface Window {
    opera?: unknown;
    MSStream?: unknown;
  }
}

export default function AppsSection() {
  const badgeRef = useFadeIn(0) as React.RefObject<HTMLDivElement>;
  const titleRef = useFadeIn(0.1) as React.RefObject<HTMLHeadingElement>;
  const descriptionRef = useFadeIn(0.2) as React.RefObject<HTMLParagraphElement>;
  const buttonsRef = useStaggeredFadeIn(0.3, 0.05) as React.RefObject<HTMLDivElement>;

  const openHiddify = () => {
    const ua = navigator.userAgent + navigator.vendor + (window.opera ? String(window.opera) : '');
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
      window.location.href = 'https://apps.apple.com/us/app/hiddify-proxy-vpn/id6596777532';
    } else if (/android/i.test(ua)) {
      window.location.href = 'https://play.google.com/store/apps/details?id=app.hiddify.com';
    } else {
      alert('Откройте страницу с телефона, чтобы скачать приложение.');
    }
  };

  const openV2rayTun = () => {
    const ua = navigator.userAgent + navigator.vendor + (window.opera ? String(window.opera) : '');
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
      window.location.href = 'https://apps.apple.com/us/app/v2raytun/id6476628951';
    } else if (/android/i.test(ua)) {
      window.location.href = 'https://play.google.com/store/apps/details?id=com.v2raytun.android';
    } else {
      alert('Откройте страницу с телефона, чтобы скачать приложение.');
    }
  };

  const openHapp = () => {
    const ua = navigator.userAgent + navigator.vendor + (window.opera ? String(window.opera) : '');
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
      window.location.href = 'https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973';
    } else if (/android/i.test(ua)) {
      window.location.href = 'https://play.google.com/store/apps/details?id=com.happproxy';
    } else {
      alert('Откройте страницу с телефона, чтобы скачать приложение.');
    }
  };

  const openV2Box = () => {
    const ua = navigator.userAgent + navigator.vendor + (window.opera ? String(window.opera) : '');
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
      window.location.href = 'https://apps.apple.com/ru/app/v2box-v2ray-client/id6446814690';
    } else if (/android/i.test(ua)) {
      window.location.href = 'https://play.google.com/store/apps/details?id=dev.hexasoftware.v2box';
    } else {
      alert('Откройте страницу с телефона, чтобы скачать приложение.');
    }
  };

  return (
    <section id="apps" className="fade-in relative overflow-hidden">
      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
        <div className="flex flex-col">
          <div className="w-full space-y-6">
            <div ref={badgeRef}>
              <Badge
                variant="outline"
                className="border-neutral-700/50 bg-neutral-800/50 text-neutral-400 hover:bg-neutral-800/50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="mr-2 h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                  />
                </svg>
                Software
              </Badge>
            </div>
            <h2
              ref={titleRef}
              className="text-left text-2xl font-semibold leading-tight md:text-3xl lg:text-4xl"
            >
              Поддерживаемые приложения
            </h2>
            <div ref={descriptionRef}>
              <p className="mt-2 block max-w-xl text-left text-base leading-relaxed text-neutral-400 md:mt-3 md:hidden md:text-lg">
                Наш сервис работает с множеством приложений. Выберите удобное для вас приложение и
                начните пользоваться сервисом.
              </p>
              <p className="mt-2 hidden max-w-xl text-left text-base leading-relaxed text-neutral-400 md:mt-3 md:block md:text-lg">
                Наш сервис работает с множеством приложений. Выберите удобное для вас приложение и
                начните пользоваться сервисом. Доступны для iOS, Android и других платформ.
              </p>
            </div>
            <div
              ref={buttonsRef}
              className="mt-4 flex flex-wrap justify-start gap-3 md:mt-6 md:gap-3 lg:gap-4"
            >
              <Button
                onClick={openHiddify}
                variant="ghost"
                className="!transform border border-neutral-700/50 bg-neutral-900/30 backdrop-blur-sm !transition-all hover:scale-105 hover:border-neutral-600 hover:bg-neutral-800/50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                <span className="whitespace-nowrap">Hiddify</span>
              </Button>
              <Button
                onClick={openV2rayTun}
                variant="ghost"
                className="!transform border border-neutral-700/50 bg-neutral-900/30 backdrop-blur-sm !transition-all hover:scale-105 hover:border-neutral-600 hover:bg-neutral-800/50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                <span className="whitespace-nowrap">v2RayTun</span>
              </Button>
              <Button
                onClick={openHapp}
                variant="ghost"
                className="!transform border border-neutral-700/50 bg-neutral-900/30 backdrop-blur-sm !transition-all hover:scale-105 hover:border-neutral-600 hover:bg-neutral-800/50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                <span className="whitespace-nowrap">Happ</span>
              </Button>
              <Button
                onClick={openV2Box}
                variant="ghost"
                className="!transform border border-neutral-700/50 bg-neutral-900/30 backdrop-blur-sm !transition-all hover:scale-105 hover:border-neutral-600 hover:bg-neutral-800/50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                <span className="whitespace-nowrap">V2Box</span>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="!transform border border-neutral-700/50 bg-neutral-900/30 backdrop-blur-sm !transition-all hover:scale-105 hover:border-neutral-600 hover:bg-neutral-800/50"
              >
                <Link href="">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M0 0h11.377v11.372H0zm12.623 0H24v11.372H12.623zM0 12.628h11.377V24H0zm12.623 0H24V24H12.623z" />
                  </svg>
                  <span className="whitespace-nowrap">Win</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
