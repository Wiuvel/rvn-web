'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { decodeThumbHash } from '@/lib/utils/thumbhash-decoder';
import type { ImageWithBlurProps } from './types';

// Ограничения размеров изображения в чате (как в Telegram)
const MAX_IMAGE_WIDTH = 400; // Максимальная ширина
const MAX_IMAGE_HEIGHT = 500; // Максимальная высота
const MIN_IMAGE_WIDTH = 100; // Минимальная ширина
const MIN_IMAGE_HEIGHT = 100; // Минимальная высота

/**
 * Вычисляет размеры контейнера с сохранением aspect ratio.
 * Масштабирует изображение чтобы оно помещалось в заданные ограничения.
 */
function calculateDisplaySize(
  originalWidth?: number,
  originalHeight?: number
): { width: number; height: number } {
  // Fallback размеры если width/height неизвестны
  if (!originalWidth || !originalHeight) {
    return { width: 280, height: 200 };
  }

  const aspectRatio = originalWidth / originalHeight;
  
  let displayWidth = originalWidth;
  let displayHeight = originalHeight;

  // Ограничиваем по максимальной ширине
  if (displayWidth > MAX_IMAGE_WIDTH) {
    displayWidth = MAX_IMAGE_WIDTH;
    displayHeight = displayWidth / aspectRatio;
  }

  // Ограничиваем по максимальной высоте
  if (displayHeight > MAX_IMAGE_HEIGHT) {
    displayHeight = MAX_IMAGE_HEIGHT;
    displayWidth = displayHeight * aspectRatio;
  }

  // Устанавливаем минимальные размеры
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
    height: Math.round(displayHeight)
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
  const imgRef = useRef<HTMLDivElement>(null);

  // Вычисляем размеры контейнера (всегда возвращает валидные размеры)
  const displaySize = useMemo(() => calculateDisplaySize(width, height), [width, height]);

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
      { rootMargin: '100px' }
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
      className={`relative rounded-lg overflow-hidden bg-neutral-800 cursor-pointer ${className || ''}`}
      style={containerStyle}
      onClick={onClick}
    >
      {hasError ? (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-xs text-red-300">Ошибка загрузки</p>
          </div>
        </div>
      ) : (
        <>
          {/* Placeholder: blur preview или skeleton */}
          {showPlaceholder && (
            <div className="absolute inset-0">
              {blurUrl ? (
                <img
                  src={blurUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ filter: 'blur(20px)', transform: 'scale(1.2)' }}
                  aria-hidden="true"
                />
              ) : (
                <div
                  className="w-full h-full"
                  style={{
                    backgroundImage: skeletonGradient,
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s ease-in-out infinite'
                  }}
                />
              )}
            </div>
          )}

          {/* Реальное изображение */}
          {isInView && (
            <img
              src={src}
              alt={alt}
              loading={loading}
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                isLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setIsLoaded(true)}
              onError={() => {
                setHasError(true);
                setIsLoaded(false);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
