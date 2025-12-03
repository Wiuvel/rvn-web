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
        gsap.defaults({
          duration: 0.4,
          ease: "power2.out"
        });
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
    const animation = gsap.fromTo(element, 
      { 
        opacity: 0, 
        y: 20 
      },
      { 
        opacity: 1, 
        y: 0, 
        duration: 0.5, 
        ease: "power2.out",
        delay,
        scrollTrigger: {
          trigger: element,
          start: "top 85%",
          end: "bottom 15%",
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
    if (!containerRef.current) return;

    const elements = containerRef.current.children;
    const animation = gsap.fromTo(elements, 
      { 
        opacity: 0, 
        y: 15,
        scale: 0.98
      },
      { 
        opacity: 1, 
        y: 0,
        scale: 1,
        duration: 0.4, 
        ease: "power2.out",
        delay,
        stagger,
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 85%",
          end: "bottom 15%",
          toggleActions: "play none none none"
        }
      }
    );

    return () => {
      animation.kill();
    };
  }, [delay, stagger]);

  return containerRef;
};

