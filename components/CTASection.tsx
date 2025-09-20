'use client';

import Link from 'next/link';
import { useFadeIn, useBounceIn, useElasticIn } from '@/hooks/useGSAP';

export default function CTASection() {
  // GSAP refs
  const titleRef = useFadeIn(0.1);
  const descriptionRef = useFadeIn(0.2);
  const buttonRef = useElasticIn(0.3);
  const containerRef = useBounceIn(0.05);

  return (
    <section className="border-t border-neutral-800/70 fade-in">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16">
        <div ref={containerRef} className="rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-8 text-center">
          <h3 ref={titleRef} className="text-2xl font-semibold">Готовы начать?</h3>
          <p ref={descriptionRef} className="mt-2 text-neutral-400">Оформите подписку и получите мгновенный доступ ко всему интернету.</p>
          <div ref={buttonRef}>
            <Link 
              href="/auth" 
              className="mt-6 inline-block rounded-2xl bg-primary-500 text-white px-6 py-3 font-medium hover:bg-primary-400 transition shadow-lg transform duration-300 hover:shadow-blue-500/50 hover:scale-105"
            >
              Купить сейчас
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

