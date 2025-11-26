'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function SupportHelpPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center py-8 px-4">
      <div className="max-w-md w-full mx-auto text-center">
        <h1 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6 text-white">Требуется авторизация</h1>
        <p className="text-sm sm:text-base text-neutral-400 mb-6 sm:mb-8 px-2">
          Не можете войти в аккаунт? Проблемы с оплатой? Мы также предоставляем поддержку в Telegram.
        </p>
        <div className="flex flex-col gap-3">
          <a
            href="https://t.me/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-neutral-800/60 hover:bg-neutral-700/60 border border-white/10 rounded-xl text-white transition-colors text-sm sm:text-base"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9.999 15.17l-.394 5.556c.562 0 .805-.241 1.099-.529l2.635-2.516 5.461 4.043c1.001.551 1.716.264 1.96-.924l3.555-16.725c.314-1.46-.527-2.03-1.49-1.675L1.51 9.043c-1.438.56-1.416 1.364-.245 1.733l5.688 1.769L18.631 5.59c.6-.394 1.149-.176.698.217"/>
            </svg>
            <span>Телеграм</span>
          </a>
          <Link
            href="/auth"
            className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-primary-500 hover:bg-primary-400 rounded-xl text-white transition-colors text-sm sm:text-base"
          >
            <Image 
              src="/static/icons/accounts/log-in.svg" 
              alt="Авторизация" 
              width={18} 
              height={18} 
              className="w-[18px] h-[18px] flex-shrink-0"
            />
            <span>Авторизация</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

