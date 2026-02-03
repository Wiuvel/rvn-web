'use client';

import Image from 'next/image';
import { getStaticUrl } from '@/lib/utils';

export default function LogoLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-neutral-950 z-50">
      <div className="relative">
        {/* Логотип с анимацией яркости и переливания */}
        <Image
          src={getStaticUrl("/static/large-logo.svg")}
          alt="RVN"
          width={200}
          height={97}
          className="logo-pulse w-[200px] h-auto"
          priority
        />
      </div>
    </div>
  );
}
