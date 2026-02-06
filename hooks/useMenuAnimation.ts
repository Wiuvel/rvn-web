'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { GSAP_DEFAULT_DURATION, GSAP_DEFAULT_EASE } from '@/lib/utils/constants';

export interface UseMenuAnimationOptions {
  blockScroll?: boolean;
  onClose?: () => void;
  persist?: boolean;
}

export function useMenuAnimation(
  isOpen: boolean,
  options: UseMenuAnimationOptions = {}
): {
  shouldRender: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
} {
  const { blockScroll = false, onClose, persist = false } = options;
  const [shouldRender, setShouldRender] = useState(persist);
  const menuRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (animationRef.current) {
      animationRef.current.kill();
      animationRef.current = null;
    }

    if (isOpen) {
      if (!shouldRender) {
        setShouldRender(true);
      }
      
      requestAnimationFrame(() => {
        if (menuRef.current) {

          gsap.killTweensOf(menuRef.current);
          
          gsap.set(menuRef.current, {
            opacity: 0,
            y: -10,
            scale: 0.95,
            pointerEvents: 'auto',
            display: 'block'
          });
          animationRef.current = gsap.to(menuRef.current, {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.2,
            ease: GSAP_DEFAULT_EASE,
            onComplete: () => {
              animationRef.current = null;
            }
          });
        }
      });
    } else {

      if (shouldRender || (persist && menuRef.current)) {
        if (menuRef.current) {

          gsap.killTweensOf(menuRef.current);
          
          animationRef.current = gsap.to(menuRef.current, {
            opacity: 0,
            y: -10,
            scale: 0.95,
            duration: 0.15,
            ease: "power2.in",
            onComplete: () => {
              if (!persist) {
                setShouldRender(false);
              } else {
                gsap.set(menuRef.current, { pointerEvents: 'none', display: 'none' });
              }
              animationRef.current = null;
              if (onClose) onClose();
            }
          });
        } else if (!persist) {
          setShouldRender(false);
          if (onClose) onClose();
        }
      }
    }
  }, [isOpen, shouldRender, onClose, persist]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        animationRef.current.kill();
        animationRef.current = null;
      }
      if (menuRef.current) {
        gsap.killTweensOf(menuRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !blockScroll) return;

    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, blockScroll]);

  return { shouldRender, menuRef };
}

