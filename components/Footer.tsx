'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      gsap.registerPlugin(ScrollTrigger);
      gsap.fromTo('.footer-container', 
        { 
          opacity: 0, 
          y: 15 
        },
        { 
          opacity: 1, 
          y: 0, 
          duration: 0.5, 
          ease: "power2.out",
          scrollTrigger: {
            trigger: '.footer-container',
            start: "top 90%",
            end: "bottom 10%",
            toggleActions: "play none none none"
          }
        }
      );
    }
  }, []);

  return (
    <footer className="border-t border-neutral-800/70 relative z-50">
      <div className="footer-container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 md:py-10 text-sm text-neutral-400">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
          <div className="md:col-span-4">
            <div className="flex items-center gap-2 text-neutral-200 drop-shadow-[0_0_8px_rgba(22,163,255,0.8)]">
              <Image 
                src="/static/icons/main/footer-logo.svg" 
                alt="Raven Private" 
                width={20} 
                height={20} 
                className="w-7 h-7"
              />
              <span className="text-base md:text-lg font-medium">Raven Private</span>
            </div>
            <p className="mt-3 md:mt-4 text-sm md:text-base">Приватность без компромиссов</p>
            <div className="mt-4 md:mt-5 flex items-center gap-4 flex-wrap">
              <Link 
                href="/contacts" 
                className="flex items-center gap-2 hover:text-neutral-200 transition-all duration-200 p-2 rounded-lg hover:bg-neutral-800/50 hover:scale-105"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z"/>
                </svg>
                Контакты
              </Link>
              <a 
                href="https://t.me/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="flex items-center gap-2 hover:text-neutral-200 transition-all duration-200 p-2 rounded-lg hover:bg-neutral-800/50 hover:scale-105"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5 text-neutral-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9.999 15.17l-.394 5.556c.562 0 .805-.241 1.099-.529l2.635-2.516 5.461 4.043c1.001.551 1.716.264 1.96-.924l3.555-16.725c.314-1.46-.527-2.03-1.49-1.675L1.51 9.043c-1.438.56-1.416 1.364-.245 1.733l5.688 1.769L18.631 5.59c.6-.394 1.149-.176.698.217"/>
                </svg>
                Telegram
              </a>
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-neutral-300 font-medium text-base mb-3 md:mb-4">Информация</div>
            <ul className="space-y-2 md:space-y-3">
              <li><Link href="#" className="hover:text-neutral-200 transition-colors duration-200 block py-1">О проекте</Link></li>
              <li><Link href="/legal/cookies" className="hover:text-neutral-200 transition-colors duration-200 block py-1">Cookie Policy</Link></li>
            </ul>
          </div>
          <div className="md:col-span-2">
            <div className="text-neutral-300 font-medium text-base mb-3 md:mb-4">Поддержка</div>
            <ul className="space-y-2 md:space-y-3">
              <li><Link href="#" className="hover:text-neutral-200 transition-colors duration-200 block py-1">Центр помощи</Link></li>
              <li><Link href="#" className="hover:text-neutral-200 transition-colors duration-200 block py-1">Информация о сайте</Link></li>
            </ul>
          </div>
          <div className="md:col-span-4">
            <div className="text-neutral-300 font-medium text-base mb-3 md:mb-4">Правовое</div>
            <ul className="space-y-2 md:space-y-3">
              <li><Link href="/legal/privacy" className="hover:text-neutral-200 transition-colors duration-200 block py-1">Политика конфиденциальности</Link></li>
              <li><Link href="/legal/terms" className="hover:text-neutral-200 transition-colors duration-200 block py-1">Пользовательское соглашение</Link></li>
              <li>
                <Link href="/legal/offer" className="hover:text-neutral-200 transition-colors duration-200 inline-block py-1">Публичная оферта</Link>
                <span className="mx-1">&amp;</span>
                <Link href="/legal/refunds" className="hover:text-neutral-200 transition-colors duration-200 inline-block py-1">Политика возвратов</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 md:mt-10 pt-6 md:pt-8 border-t border-neutral-800/50">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6">
            <div className="text-center md:text-left order-2 md:order-1">
              © {currentYear} RVNPrivate. Все права защищены.
            </div>
            <div className="hidden md:flex items-center gap-3 md:gap-4 flex-wrap justify-center lg:mr-20 order-1 md:order-2 select-none drop-shadow-[0_0_50px_rgba(22,163,255,0.8)]">
              <Image src="/static/payments/merchant-spb.svg" alt="СПБ" width={70} height={70} className="h-8" />
              <Image src="/static/payments/merchant-mir.svg" alt="МИР" width={70} height={70} className="h-5" />
              <Image src="/static/payments/merchant-visa.svg" alt="Visa" width={40} height={40} className="h-10" />
              <Image src="/static/payments/merchant-mcard.svg" alt="Mastercard" width={40} height={40} className="h-10" />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
