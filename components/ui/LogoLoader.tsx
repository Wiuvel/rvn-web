'use client';

import Image from 'next/image';
import { getStaticUrl } from '@/lib/utils';

export default function LogoLoader() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950">
      <div className="relative">
        {/* Логотип с анимацией яркости и переливания */}
        <Image
          src={getStaticUrl('/static/large-logo.webp')}
          alt="RVN"
          width={740}
          height={290}
          className="logo-pulse h-auto w-[200px]"
          priority
          fetchPriority="high"
        />
      </div>
    </div>
  );
}
