'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
import { AlertCircle } from 'lucide-react';
import { decodeThumbHash } from '@/lib/utils/thumbhash-decoder';
import type { ImageWithBlurProps } from './types';

const DESKTOP_MAX_WIDTH = 400;
const DESKTOP_MAX_HEIGHT = 500;
const MOBILE_MAX_WIDTH = 240;
const MOBILE_MAX_HEIGHT = 320;
const MIN_IMAGE_WIDTH = 100;
const MIN_IMAGE_HEIGHT = 100;

function getIsMobile() {
  return typeof window !== 'undefined' && window.innerWidth < 640;
}

/**
 * Вычисляет размеры контейнера с сохранением aspect ratio.
 * На мобильных устройствах использует уменьшенные ограничения.
 */
function calculateDisplaySize(
  originalWidth?: number,
  originalHeight?: number,
  mobile?: boolean,
): { width: number; height: number } {
  const maxW = mobile ? MOBILE_MAX_WIDTH : DESKTOP_MAX_WIDTH;
  const maxH = mobile ? MOBILE_MAX_HEIGHT : DESKTOP_MAX_HEIGHT;

  if (!originalWidth || !originalHeight) {
    return { width: mobile ? 200 : 280, height: mobile ? 140 : 200 };
  }

  const aspectRatio = originalWidth / originalHeight;

  let displayWidth = originalWidth;
  let displayHeight = originalHeight;

  if (displayWidth > maxW) {
    displayWidth = maxW;
    displayHeight = displayWidth / aspectRatio;
  }

  if (displayHeight > maxH) {
    displayHeight = maxH;
    displayWidth = displayHeight * aspectRatio;
  }

  if (displayWidth < MIN_IMAGE_WIDTH) {
    displayWidth = MIN_IMAGE_WIDTH;
    displayHeight = displayWidth / aspectRatio;
  }

  if (displayHeight < MIN_IMAGE_HEIGHT) {
    displayHeight = MIN_IMAGE_HEIGHT;
    displayWidth = displayHeight * aspectRatio;
  }

  return {
    width: Math.round(displayWidth),
    height: Math.round(displayHeight),
  };
}

/**
 * Image component with blur hash placeholder, error handling, and upload progress indicator.
 * Displays images with correct aspect ratio from the start using width/height metadata.
 */
export default function ImageWithBlur({
  src,
  alt,
  className,
  loading = 'lazy',
  isRead = false,
  blurHash,
  width,
  height,
  onClick,
}: ImageWithBlurProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [isMobile, setIsMobile] = useState(() => getIsMobile());
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(getIsMobile());
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const displaySize = useMemo(
    () => calculateDisplaySize(width, height, isMobile),
    [width, height, isMobile],
  );

  // Генерируем blur URL из ThumbHash
  const blurUrl = useMemo(() => {
    if (blurHash) {
      return decodeThumbHash(blurHash);
    }
    return null;
  }, [blurHash]);

  // Для blob URL - считаем что это локальное превью (уже загружено)
  const isBlobUrl = src.startsWith('blob:');

  // Intersection Observer для lazy loading
  useEffect(() => {
    if (!imgRef.current || loading !== 'lazy') {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '100px' },
    );

    observer.observe(imgRef.current);

    return () => observer.disconnect();
  }, [loading]);

  // Сбрасываем состояние при смене src
  useEffect(() => {
    setHasError(false);
    if (isBlobUrl) {
      // Blob URL загружается мгновенно
      setIsLoaded(true);
    } else {
      setIsLoaded(false);
    }
  }, [src, isBlobUrl]);

  // Определяем палитру skeleton-loader на основе статуса прочтения
  const skeletonGradient = isRead
    ? 'linear-gradient(90deg, rgba(59,130,246,0.3) 0%, rgba(96,165,250,0.5) 50%, rgba(59,130,246,0.3) 100%)'
    : 'linear-gradient(90deg, rgba(64,64,64,0.3) 0%, rgba(115,115,115,0.5) 50%, rgba(64,64,64,0.3) 100%)';

  // Стили контейнера - всегда используем вычисленные размеры
  const containerStyle: React.CSSProperties = {
    width: displaySize.width,
    height: displaySize.height,
    minWidth: displaySize.width,
    minHeight: displaySize.height,
  };

  // Показываем placeholder пока изображение не загружено
  const showPlaceholder = !isLoaded && !hasError;

  return (
    <div
      ref={imgRef}
      className={`relative cursor-pointer overflow-hidden rounded-lg bg-neutral-800 ${className || ''}`}
      style={containerStyle}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          onClick(e as any);
        }
      }}
    >
      {hasError ? (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="text-center">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 text-red-400" />
            <p className="text-xs text-red-300">Ошибка загрузки</p>
          </div>
        </div>
      ) : (
        <>
          {/* Placeholder: blur preview или skeleton */}
          {showPlaceholder && (
            <div className="absolute inset-0">
              {blurUrl ? (
                <Image
                  src={blurUrl}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                  style={{ filter: 'blur(10px)', transform: 'scale(1.2)' }}
                  aria-hidden="true"
                  unoptimized
                />
              ) : (
                <div
                  className="h-full w-full"
                  style={{
                    backgroundImage: skeletonGradient,
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s ease-in-out infinite',
                  }}
                />
              )}
            </div>
          )}

          {/* Реальное изображение */}
          {isInView && (
            <Image
              src={src}
              alt={alt}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              loading={loading}
              className={`object-cover transition-opacity duration-300 ${
                isLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setIsLoaded(true)}
              onError={() => {
                setHasError(true);
                setIsLoaded(false);
              }}
              unoptimized
            />
          )}
        </>
      )}
    </div>
  );
}
