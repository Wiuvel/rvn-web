'use client';

import { useEffect, useRef } from 'react';
import type { gsap as GsapType } from 'gsap';

type ScrollTriggerType = typeof import('gsap/ScrollTrigger').ScrollTrigger;

interface GsapBundle {
  gsap: typeof GsapType;
  ScrollTrigger: ScrollTriggerType;
}

let gsapPromise: Promise<GsapBundle> | null = null;

/**
 * Lazy-loads GSAP + ScrollTrigger on first call.
 * Cached as a singleton to avoid duplicate downloads.
 */
function loadGsap(): Promise<GsapBundle> {
  if (!gsapPromise) {
    gsapPromise = Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(
      ([gsapMod, stMod]) => {
        const { gsap } = gsapMod;
        const { ScrollTrigger } = stMod;
        gsap.registerPlugin(ScrollTrigger);
        return { gsap, ScrollTrigger };
      },
    );
  }
  return gsapPromise;
}

/** Initializes GSAP context for a container with reduced-motion + mobile guards. */
export const useGSAP = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cleanup: (() => void) | null = null;

    loadGsap().then(({ gsap, ScrollTrigger }) => {
      if (!containerRef.current) return;

      const ctx = gsap.context(() => {
        gsap.config({ force3D: true, nullTargetWarn: false });

        const isMobile = window.innerWidth < 768;
        ScrollTrigger.config({
          ignoreMobileResize: true,
          syncInterval: isMobile ? 120 : 60,
        });

        const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
        const applyReducedMotion = (reduced: boolean) => {
          gsap.globalTimeline.timeScale(reduced ? 0 : 1);
          ScrollTrigger.getAll().forEach((t) => (reduced ? t.disable() : t.enable()));
        };
        applyReducedMotion(mql.matches);
        const onChange = (e: MediaQueryListEvent) => applyReducedMotion(e.matches);
        mql.addEventListener('change', onChange);

        if (isMobile) ScrollTrigger.getAll().forEach((t) => t.disable());

        cleanup = () => mql.removeEventListener('change', onChange);
      }, containerRef);

      const prev = cleanup;
      cleanup = () => {
        prev?.();
        ctx.revert();
      };
    });

    return () => cleanup?.();
  }, []);

  return containerRef;
};

/** Fades an element in on scroll with an optional delay. */
export const useFadeIn = (delay: number = 0) => {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    let killed = false;
    let animation: gsap.core.Tween | null = null;
    const element = elementRef.current;
    const isMobile = window.innerWidth < 768;

    loadGsap().then(({ gsap }) => {
      if (killed || !element) return;

      if (isMobile) {
        gsap.set(element, { opacity: 1, y: 0 });
        return;
      }

      animation = gsap.fromTo(
        element,
        { opacity: 0, y: 15 },
        {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: 'power2.out',
          delay,
          scrollTrigger: {
            trigger: element,
            start: 'top 92%',
            end: 'bottom 8%',
            toggleActions: 'play none none none',
          },
        },
      );
    });

    return () => {
      killed = true;
      animation?.kill();
    };
  }, [delay]);

  return elementRef;
};

/** Fades container children in sequence on scroll. */
export const useStaggeredFadeIn = (delay: number = 0, stagger: number = 0.05) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || typeof window === 'undefined') return;

    let killed = false;
    let animation: gsap.core.Tween | null = null;
    let raf = 0;
    const container = containerRef.current;
    const isMobile = window.innerWidth < 768;

    loadGsap().then(({ gsap }) => {
      if (killed) return;
      const elements = container.children;

      if (isMobile) {
        gsap.set(elements, { opacity: 1, y: 0, scale: 1 });
        return;
      }

      raf = requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect();
        const visible = rect.top < window.innerHeight * 0.92;

        if (visible) {
          gsap.set(elements, { opacity: 1, y: 0, scale: 1 });
          return;
        }

        gsap.set(elements, { opacity: 0, y: 10, scale: 0.98 });
        animation = gsap.to(elements, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.35,
          ease: 'power2.out',
          delay,
          stagger,
          scrollTrigger: {
            trigger: container,
            start: 'top 92%',
            end: 'bottom 8%',
            toggleActions: 'play none none none',
          },
        });
      });
    });

    return () => {
      killed = true;
      cancelAnimationFrame(raf);
      animation?.kill();
    };
  }, [delay, stagger]);

  return containerRef;
};
