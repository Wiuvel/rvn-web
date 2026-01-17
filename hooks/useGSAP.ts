'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export const useGSAP = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ctx = gsap.context(() => {
      gsap.config({
        force3D: true,
        nullTargetWarn: false
      });

      ScrollTrigger.config({
        ignoreMobileResize: true,
        syncInterval: 60
      });

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.globalTimeline.timeScale(0);
        ScrollTrigger.getAll().forEach(trigger => trigger.disable());
      }

      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
        if (e.matches) {
          gsap.globalTimeline.timeScale(0);
          ScrollTrigger.getAll().forEach(trigger => trigger.disable());
        } else {
          gsap.globalTimeline.timeScale(1);
          ScrollTrigger.getAll().forEach(trigger => trigger.enable());
        }
      });

      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        // Отключаем все ScrollTrigger анимации на мобильных устройствах
        ScrollTrigger.getAll().forEach(trigger => trigger.disable());
        gsap.globalTimeline.timeScale(0);
      }

    }, containerRef);

    return () => ctx.revert();
  }, []);

  return containerRef;
};

export const useFadeIn = (delay: number = 0) => {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    const element = elementRef.current;
    const isMobile = window.innerWidth < 768;
    
    if (isMobile) {
      // На мобильных устройствах просто устанавливаем финальное состояние без анимации
      gsap.set(element, { opacity: 1, y: 0 });
      return;
    }

    const animation = gsap.fromTo(element, 
      { 
        opacity: 0, 
        y: 15 
      },
      { 
        opacity: 1, 
        y: 0, 
        duration: 0.4, 
        ease: "power2.out",
        delay,
        scrollTrigger: {
          trigger: element,
          start: "top 92%",
          end: "bottom 8%",
          toggleActions: "play none none none"
        }
      }
    );

    return () => {
      animation.kill();
    };
  }, [delay]);

  return elementRef;
};


export const useStaggeredFadeIn = (delay: number = 0, stagger: number = 0.05) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || typeof window === 'undefined') return;

    const isMobile = window.innerWidth < 768;
    const elements = containerRef.current.children;
    
    if (isMobile) {
      // На мобильных устройствах просто устанавливаем финальное состояние без анимации
      gsap.set(elements, { opacity: 1, y: 0, scale: 1 });
      return;
    }

    // Проверяем видимость с небольшой задержкой (чтобы DOM успел отрендериться)
    const timeout = setTimeout(() => {
      if (!containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const isAlreadyVisible = rect.top < window.innerHeight * 0.92;
      
      if (isAlreadyVisible) {
        // Если элемент уже виден, оставляем его видимым (не применяем анимацию)
        gsap.set(elements, { opacity: 1, y: 0, scale: 1 });
        return;
      }

      // Если элемент не виден, устанавливаем начальное состояние и создаем анимацию
      gsap.set(elements, { opacity: 0, y: 10, scale: 0.98 });
      
      const animation = gsap.to(elements, {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.35,
        ease: "power2.out",
        delay,
        stagger,
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 92%",
          end: "bottom 8%",
          toggleActions: "play none none none"
        }
      });

      // Сохраняем ссылку на анимацию для очистки
      (containerRef.current as any).__gsapAnimation = animation;
    }, 150);

    return () => {
      clearTimeout(timeout);
      const animation = (containerRef.current as any)?.__gsapAnimation;
      if (animation) {
        animation.kill();
      }
    };
  }, [delay, stagger]);

  return containerRef;
};

