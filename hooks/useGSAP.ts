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
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    const element = elementRef.current;
    
    gsap.fromTo(element, 
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
  }, [delay]);

  return elementRef;
};

export const useSlideInLeft = (delay: number = 0) => {
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    const element = elementRef.current;
    
    gsap.fromTo(element, 
      { 
        opacity: 0, 
        x: -30 
      },
      { 
        opacity: 1, 
        x: 0, 
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
  }, [delay]);

  return elementRef;
};

export const useSlideInRight = (delay: number = 0) => {
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    const element = elementRef.current;
    
    gsap.fromTo(element, 
      { 
        opacity: 0, 
        x: 30 
      },
      { 
        opacity: 1, 
        x: 0, 
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
  }, [delay]);

  return elementRef;
};

export const useScaleIn = (delay: number = 0) => {
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    const element = elementRef.current;
    
    gsap.fromTo(element, 
      { 
        opacity: 0, 
        scale: 0.95 
      },
      { 
        opacity: 1, 
        scale: 1, 
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
  }, [delay]);

  return elementRef;
};

export const useStaggeredFadeIn = (delay: number = 0, stagger: number = 0.05) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const elements = containerRef.current.children;
    
    gsap.fromTo(elements, 
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
  }, [delay, stagger]);

  return containerRef;
};

export const useRotateIn = (delay: number = 0) => {
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    const element = elementRef.current;
    
    gsap.fromTo(element, 
      { 
        opacity: 0, 
        rotation: 5,
        scale: 0.95
      },
      { 
        opacity: 1, 
        rotation: 0,
        scale: 1,
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
  }, [delay]);

  return elementRef;
};

export const useSlideInUp = (delay: number = 0) => {
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    const element = elementRef.current;
    
    gsap.fromTo(element, 
      { 
        opacity: 0, 
        y: 25
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
  }, [delay]);

  return elementRef;
};

export const useBounceIn = (delay: number = 0) => {
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    const element = elementRef.current;
    
    gsap.fromTo(element, 
      { 
        opacity: 0, 
        scale: 0.8,
        y: 20
      },
      { 
        opacity: 1, 
        scale: 1,
        y: 0,
        duration: 0.5, 
        ease: "back.out(1.2)",
        delay,
        scrollTrigger: {
          trigger: element,
          start: "top 85%",
          end: "bottom 15%",
          toggleActions: "play none none none"
        }
      }
    );
  }, [delay]);

  return elementRef;
};

export const useElasticIn = (delay: number = 0) => {
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    const element = elementRef.current;
    
    gsap.fromTo(element, 
      { 
        opacity: 0, 
        scale: 0.8,
        rotation: -5
      },
      { 
        opacity: 1, 
        scale: 1,
        rotation: 0,
        duration: 0.6, 
        ease: "elastic.out(1, 0.5)",
        delay,
        scrollTrigger: {
          trigger: element,
          start: "top 85%",
          end: "bottom 15%",
          toggleActions: "play none none none"
        }
      }
    );
  }, [delay]);

  return elementRef;
};

