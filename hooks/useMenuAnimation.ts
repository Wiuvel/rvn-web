'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { GSAP_DEFAULT_EASE } from '@/lib/utils/constants';

export interface UseMenuAnimationOptions {
  blockScroll?: boolean;
  onClose?: () => void;
  persist?: boolean;
  externalRef?: React.RefObject<HTMLDivElement | null>;
}

export function useMenuAnimation(
  isOpen: boolean,
  options: UseMenuAnimationOptions = {},
): {
  shouldRender: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
} {
  const { blockScroll = false, onClose, persist = false, externalRef } = options;
  const [shouldRender, setShouldRender] = useState(persist);
  const internalMenuRef = useRef<HTMLDivElement>(null);
  const menuRef = (externalRef ?? internalMenuRef) as React.RefObject<HTMLDivElement | null>;
  const animationRef = useRef<gsap.core.Tween | null>(null);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen && !shouldRender) {
      setShouldRender(true);
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (animationRef.current) {
      animationRef.current.kill();
      animationRef.current = null;
    }

    if (isOpen) {

      requestAnimationFrame(() => {
        if (menuRef.current) {
          gsap.killTweensOf(menuRef.current);

          gsap.set(menuRef.current, {
            opacity: 0,
            y: -10,
            scale: 0.95,
            pointerEvents: 'auto',
            display: 'block',
          });
          animationRef.current = gsap.to(menuRef.current, {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.2,
            ease: GSAP_DEFAULT_EASE,
            onComplete: () => {
              animationRef.current = null;
            },
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
            ease: 'power2.in',
            onComplete: () => {
              if (!persist) {
                setShouldRender(false);
              } else {
                gsap.set(menuRef.current, { pointerEvents: 'none', display: 'none' });
              }
              animationRef.current = null;
              if (onClose) onClose();
            },
          });
        } else if (!persist) {
          requestAnimationFrame(() => {
            setShouldRender(false);
            if (onClose) onClose();
          });
        }
      }
    }
  }, [isOpen, shouldRender, onClose, persist, menuRef]);

  useEffect(() => {
    const menu = menuRef.current;

    return () => {
      if (animationRef.current) {
        animationRef.current.kill();
        animationRef.current = null;
      }
      if (menu) {
        gsap.killTweensOf(menu);
      }
    };
  }, [menuRef]);

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
