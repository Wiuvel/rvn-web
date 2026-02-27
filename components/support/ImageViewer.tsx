'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import { gsap } from 'gsap';

interface ImageViewerProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  alt: string;
}

export default function ImageViewer({ isOpen, onClose, imageUrl, alt }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !modalRef.current || !backdropRef.current) return;

    if (isOpen) {
      gsap.set([backdropRef.current, modalRef.current], { opacity: 0 });
      gsap.to(backdropRef.current, {
        opacity: 1,
        duration: 0.2,
        ease: 'power2.out',
      });
      gsap.to(modalRef.current, {
        opacity: 1,
        scale: 1,
        duration: 0.3,
        ease: 'power2.out',
      });
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      gsap.to([backdropRef.current, modalRef.current], {
        opacity: 0,
        duration: 0.2,
        ease: 'power2.in',
      });
    }
  }, [isOpen]);

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Используем нативный addEventListener с passive: false для preventDefault
  useEffect(() => {
    if (!modalRef.current || !isOpen) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale((prev) => Math.max(0.5, Math.min(3, prev + delta)));
    };

    const element = modalRef.current;
    // passive: false required for preventDefault() to block page scroll while zooming image
    // eslint-disable-next-line react-doctor/client-passive-event-listeners -- zoom requires preventDefault()
    element.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div
        ref={backdropRef}
        className="fixed inset-0 z-[2000] bg-black/90 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onClose();
          }
        }}
        aria-label="Close image viewer"
      />

      <div
        ref={modalRef}
        className="pointer-events-none fixed inset-0 z-[2001] flex items-center justify-center p-4"
      >
        <div
          className="pointer-events-auto relative max-h-[95vh] max-w-[95vw]"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
          }}
          role="presentation"
        >
          {/* Панель управления */}
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
            <button
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              className="rounded-lg bg-black/60 p-2 transition-colors hover:bg-black/80 disabled:opacity-50"
              aria-label="Уменьшить"
            >
              <ZoomOut className="h-5 w-5 text-white" />
            </button>
            <button
              onClick={handleZoomIn}
              disabled={scale >= 3}
              className="rounded-lg bg-black/60 p-2 transition-colors hover:bg-black/80"
              aria-label="Увеличить"
            >
              <ZoomIn className="h-5 w-5 text-white" />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg bg-black/60 p-2 transition-colors hover:bg-black/80"
              aria-label="Закрыть"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>

          {/* Изображение */}
          <div
            className="relative cursor-move overflow-hidden"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            role="presentation"
          >
            <Image
              ref={imageRef}
              src={imageUrl}
              alt={alt}
              width={1920}
              height={1080}
              sizes="95vw"
              className="max-h-[95vh] max-w-full select-none object-contain"
              style={{
                transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                transition: isDragging ? 'none' : 'transform 0.2s ease-out',
              }}
              draggable={false}
              unoptimized
              onError={() => {
                // Обработка ошибки загрузки изображения
              }}
            />
          </div>

          {/* Информация */}
          {scale !== 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-black/60 px-3 py-1.5">
              <p className="text-sm text-white">{Math.round(scale * 100)}%</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
