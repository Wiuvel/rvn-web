'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect } from 'react';
// Using full gsap for ScrollTrigger plugin
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { getStaticUrl } from '@/lib/utils';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      gsap.registerPlugin(ScrollTrigger);
      const isMobile = window.innerWidth < 768;

      if (isMobile) {
        // На мобильных устройствах просто устанавливаем финальное состояние без анимации
        gsap.set('.footer-container', { opacity: 1, y: 0 });
        return;
      }

      gsap.fromTo(
        '.footer-container',
        {
          opacity: 0,
          y: 15,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '.footer-container',
            start: 'top 92%',
            end: 'bottom 8%',
            toggleActions: 'play none none none',
          },
        },
      );
    }
  }, []);

  return (
    <footer className="relative z-50 border-t border-neutral-800/70">
      <div className="footer-container mx-auto max-w-7xl px-4 py-8 text-sm text-neutral-400 sm:px-6 md:py-10 lg:px-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-8">
          <div className="md:col-span-4">
            <div className="flex items-center text-neutral-200">
              <Image
                src={getStaticUrl('/static/large-logo.webp')}
                alt="RVN"
                width={740}
                height={290}
                className="h-12 w-auto md:h-14"
                loading="eager"
              />
            </div>
            <p className="mt-3 text-sm md:mt-4 md:text-base">Приватность без компромиссов</p>
            <div className="mt-4 flex flex-wrap items-center gap-4 md:mt-5">
              <a
                href="https://t.me/"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded-lg p-2 transition-all duration-200 hover:scale-105 hover:bg-neutral-800/50 hover:text-neutral-200"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 text-neutral-400 transition-colors duration-200 group-hover:text-[#69a8f8] md:h-5 md:w-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M9.999 15.17l-.394 5.556c.562 0 .805-.241 1.099-.529l2.635-2.516 5.461 4.043c1.001.551 1.716.264 1.96-.924l3.555-16.725c.314-1.46-.527-2.03-1.49-1.675L1.51 9.043c-1.438.56-1.416 1.364-.245 1.733l5.688 1.769L18.631 5.59c.6-.394 1.149-.176.698.217" />
                </svg>
                Telegram
              </a>
              <a
                href="https://discord.gg/"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded-lg p-2 transition-all duration-200 hover:scale-105 hover:bg-neutral-800/50 hover:text-neutral-200"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-neutral-400 transition-colors duration-200 group-hover:text-[#69a8f8] md:h-6 md:w-6"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                Discord
              </a>
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="mb-3 text-base font-medium text-neutral-300 md:mb-4">ИНФО</div>
            <ul className="space-y-2 md:space-y-3">
              <li>
                <Link
                  href="/about"
                  prefetch={false}
                  className="block py-1 transition-colors duration-200 hover:text-neutral-200"
                >
                  О проекте & Roadmap
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="block py-1 transition-colors duration-200 hover:text-neutral-200"
                >
                  Контактная информация
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/cookies"
                  prefetch={false}
                  className="block py-1 transition-colors duration-200 hover:text-neutral-200"
                >
                  Cookie Policy
                </Link>
              </li>
            </ul>
          </div>
          <div className="md:col-span-2">
            <div className="mb-3 text-base font-medium text-neutral-300 md:mb-4">ПОМОЩЬ</div>
            <ul className="space-y-2 md:space-y-3">
              <li>
                <Link
                  href="/support/"
                  className="block py-1 transition-colors duration-200 hover:text-neutral-200"
                >
                  Служба поддержки
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="block py-1 transition-colors duration-200 hover:text-neutral-200"
                >
                  Информация о сайте
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="block py-1 transition-colors duration-200 hover:text-neutral-200"
                >
                  Инструкции по настройке
                </Link>
              </li>
            </ul>
          </div>
          <div className="md:col-span-4">
            <div className="mb-3 text-base font-medium text-neutral-300 md:mb-4">ПРАВОВОЕ</div>
            <ul className="space-y-2 md:space-y-3">
              <li>
                <Link
                  href="/legal/privacy"
                  prefetch={false}
                  className="block py-1 transition-colors duration-200 hover:text-neutral-200"
                >
                  Политика конфиденциальности
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/terms"
                  prefetch={false}
                  className="block py-1 transition-colors duration-200 hover:text-neutral-200"
                >
                  Пользовательское соглашение
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/offer"
                  prefetch={false}
                  className="inline-block py-1 transition-colors duration-200 hover:text-neutral-200"
                >
                  Публичная оферта
                </Link>
                <span className="mx-1">&amp;</span>
                <Link
                  href="/legal/refunds"
                  prefetch={false}
                  className="inline-block py-1 transition-colors duration-200 hover:text-neutral-200"
                >
                  Политика возвратов
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-neutral-800/50 pt-6 md:mt-10 md:pt-8">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row md:gap-6">
            <div className="order-2 text-center md:order-1 md:text-left">
              © {currentYear} RVN. Все права защищены.
            </div>
            <div className="order-1 hidden select-none flex-wrap items-center justify-center gap-3 drop-shadow-[0_0_50px_rgba(22,163,255,0.8)] md:order-2 md:flex md:gap-4">
              <Link
                href="/"
                prefetch={false}
                className="flex items-center gap-1 text-neutral-300 transition-colors duration-200 hover:text-neutral-200"
              >
                <span>Cryptobot</span>
                <svg
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  fill="currentColor"
                  className="flex h-5 w-5 shrink-0 items-center justify-center"
                >
                  <path d="M16.0037 9.41421L7.39712 18.0208L5.98291 16.6066L14.5895 8H7.00373V6H18.0037V17H16.0037V9.41421Z"></path>
                </svg>
              </Link>
              <Link
                href="/"
                prefetch={false}
                className="flex items-center gap-1 text-neutral-300 transition-colors duration-200 hover:text-neutral-200"
              >
                <span>Heleket</span>
                <svg
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  fill="currentColor"
                  className="flex h-5 w-5 shrink-0 items-center justify-center"
                >
                  <path d="M16.0037 9.41421L7.39712 18.0208L5.98291 16.6066L14.5895 8H7.00373V6H18.0037V17H16.0037V9.41421Z"></path>
                </svg>
              </Link>
              <Image
                src="/static/payments/merchant-spb.svg"
                alt="СПБ"
                width={14}
                height={14}
                className="h-12 w-12"
                loading="lazy"
              />
              <Image
                src="/static/payments/merchant-visa.svg"
                alt="Visa"
                width={14}
                height={14}
                className="h-12 w-12"
                loading="lazy"
              />
              <Image
                src="/static/payments/merchant-mcard.svg"
                alt="Mastercard"
                width={14}
                height={14}
                className="h-12 w-12"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
