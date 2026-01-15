'use client';

import Image, { ImageProps } from 'next/image';
import { useState, useEffect } from 'react';
import { getCdnAvailability } from '@/lib/utils/cdn-check';
import { domains } from '@/lib/utils/config';

interface CdnImageProps extends Omit<ImageProps, 'src'> {
  src: string;
  fallbackSrc?: string;
}

/**
 * Компонент Image с автоматическим fallback на основной домен при недоступности CDN
 */
export function CdnImage({ src, fallbackSrc, onError, ...props }: CdnImageProps) {
  const [imageSrc, setImageSrc] = useState<string>(src);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    // В dev режиме не проверяем
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    // Проверяем доступность CDN
    getCdnAvailability()
      .then((available) => {
        if (!available) {
          setUseFallback(true);
          updateImageSrc(src, true);
        }
      })
      .catch(() => {
        setUseFallback(true);
        updateImageSrc(src, true);
      });
  }, [src]);

  const updateImageSrc = (originalSrc: string, forceFallback: boolean = false) => {
    if (forceFallback || useFallback) {
      const cleanPath = originalSrc.startsWith('/') ? originalSrc : `/${originalSrc}`;
      const cleanMainUrl = domains.mainUrl.endsWith('/') ? domains.mainUrl.slice(0, -1) : domains.mainUrl;
      setImageSrc(`${cleanMainUrl}${cleanPath}`);
    } else {
      setImageSrc(originalSrc);
    }
  };

  const handleError: ImageProps['onError'] = (e) => {
    // Если изображение не загрузилось с CDN, пробуем fallback
    if (!useFallback && (imageSrc.includes(domains.cdn) || imageSrc.includes('cdn.rvn.market'))) {
      console.warn('[CDN] Ошибка загрузки изображения с CDN, переключаемся на fallback');
      setUseFallback(true);
      updateImageSrc(src, true);
      // Сбрасываем кеш CDN для следующей проверки
      if (typeof window !== 'undefined') {
        import('@/lib/utils/cdn-check').then(({ resetCdnCache }) => {
          resetCdnCache();
        });
      }
      return;
    }

    // Если уже используем fallback и ошибка повторилась, пробуем кастомный fallback
    if (useFallback && fallbackSrc) {
      setImageSrc(fallbackSrc);
      return;
    }

    // Вызываем оригинальный обработчик ошибки
    if (onError) {
      onError(e);
    }
  };

  return <Image src={imageSrc} onError={handleError} {...props} />;
}
