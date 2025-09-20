'use client';

import { useFadeIn, useStaggeredFadeIn, useSlideInRight } from '@/hooks/useGSAP';

declare global {
  interface Window {
    opera?: unknown;
    MSStream?: unknown;
  }
}

export default function AppsSection() {
  const titleRef = useFadeIn(0.1) as React.RefObject<HTMLHeadingElement>;
  const descriptionRef = useFadeIn(0.2) as React.RefObject<HTMLParagraphElement>;
  const buttonsRef = useStaggeredFadeIn(0.3, 0.05) as React.RefObject<HTMLDivElement>;
  const cardsRef = useSlideInRight(0.4) as React.RefObject<HTMLDivElement>;

  const openHiddify = () => {
    const ua =
      navigator.userAgent +
      navigator.vendor +
      (window.opera ? String(window.opera) : '');
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
      window.location.href = "https://apps.apple.com/us/app/hiddify-proxy-vpn/id6596777532";
    } else if (/android/i.test(ua)) {
      window.location.href = "https://play.google.com/store/apps/details?id=app.hiddify.com";
    } else {
      alert("Откройте страницу с телефона, чтобы скачать приложение.");
    }
  };

  const openV2rayTun = () => {
    const ua =
      navigator.userAgent +
      navigator.vendor +
      (window.opera ? String(window.opera) : '');
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
      window.location.href = "https://apps.apple.com/us/app/v2raytun/id6476628951";
    } else if (/android/i.test(ua)) {
      window.location.href = "https://play.google.com/store/apps/details?id=com.v2raytun.android";
    } else {
      alert("Откройте страницу с телефона, чтобы скачать приложение.");
    }
  };

  return (
    <section id="apps" className="fade-in">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-10 items-center">
          <div>
            <h2 ref={titleRef} className="text-2xl md:text-3xl font-semibold text-center lg:text-left">Поддерживаемые приложения</h2>
            <p ref={descriptionRef} className="mt-2 md:mt-3 text-neutral-400 text-sm md:text-base text-center lg:text-left">
              Работает с Hiddify, v2RayTun и другими клиентами. Просто импортируйте профиль или отсканируйте QR-код после покупки.
            </p>
            <div ref={buttonsRef} className="mt-4 md:mt-6 flex flex-wrap gap-3 md:gap-4 justify-center lg:justify-start">
              <button 
                onClick={openHiddify}
                className="rounded-xl border border-neutral-800 px-4 py-2 md:px-5 md:py-2.5 hover:bg-neutral-900 hover:scale-105 text-sm md:text-base transition-all duration-300 min-w-[120px] text-center hover:border-neutral-700 hover:shadow-lg"
              >
                Hiddify (Android/iOS)
              </button>
              <button 
                onClick={openV2rayTun}
                className="rounded-xl border border-neutral-800 px-4 py-2 md:px-5 md:py-2.5 hover:bg-neutral-900 hover:scale-105 text-sm md:text-base transition-all duration-300 min-w-[120px] text-center hover:border-neutral-700 hover:shadow-lg"
              >
                v2RayTun (Android/iOS)
              </button>
              <a 
                href="https://storage.v2raytun.com/v2RayTun_Setup.exe" 
                className="rounded-xl border border-neutral-800 px-4 py-2 md:px-5 md:py-2.5 hover:bg-neutral-900 hover:scale-105 text-sm md:text-base transition-all duration-300 min-w-[120px] text-center hover:border-neutral-700 hover:shadow-lg" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                Windows
              </a>
            </div>
          </div>
          <div ref={cardsRef} className="relative">
            <div className="absolute -inset-4 md:-inset-6 rounded-3xl bg-gradient-to-br from-primary-500/10 to-transparent blur-xl md:blur-2xl z-0"></div>
            <div className="relative grid grid-cols-2 gap-3 md:gap-4 z-10">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3 md:p-5 text-center">
                <div className="text-lg md:text-xl lg:text-2xl font-semibold">VLESS</div>
                <div className="text-xs text-neutral-400 mt-1">Протокол</div>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3 md:p-5 text-center">
                <div className="text-sm md:text-lg lg:text-2xl font-semibold">AES-256 (TLS)</div>
                <div className="text-xs text-neutral-400 mt-1">Шифрование</div>
              </div>
              <div className="col-span-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-3 md:p-5 text-center">
                <div className="text-sm md:text-base lg:text-2xl">Сервера: Франкфурт, Стокголм, Париж и др.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

