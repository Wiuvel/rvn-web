'use client';

import { useState, useEffect, useRef } from 'react';
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
  const imageRef = useRef<HTMLImageElement>(null);

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
    setScale(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
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

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => Math.max(0.5, Math.min(3, prev + delta)));
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        ref={backdropRef}
        className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[2000]"
        onClick={onClose}
      />

      <div
        ref={modalRef}
        className="fixed inset-0 z-[2001] flex items-center justify-center p-4 pointer-events-none"
        onWheel={handleWheel}
      >
        <div
          className="relative max-w-[95vw] max-h-[95vh] pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Панель управления */}
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            <button
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              className="p-2 bg-black/60 hover:bg-black/80 rounded-lg transition-colors disabled:opacity-50"
              aria-label="Уменьшить"
            >
              <ZoomOut className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={handleZoomIn}
              disabled={scale >= 3}
              className="p-2 bg-black/60 hover:bg-black/80 rounded-lg transition-colors"
              aria-label="Увеличить"
            >
              <ZoomIn className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-black/60 hover:bg-black/80 rounded-lg transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Изображение */}
          <div
            className="relative overflow-hidden cursor-move"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img
              ref={imageRef}
              src={imageUrl}
              alt={alt}
              className="max-w-full max-h-[95vh] object-contain select-none"
              style={{
                transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                transition: isDragging ? 'none' : 'transform 0.2s ease-out',
              }}
              draggable={false}
              onError={() => {
                // Обработка ошибки загрузки изображения
              }}
            />
          </div>

          {/* Информация */}
          {scale !== 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/60 rounded-lg">
              <p className="text-white text-sm">{Math.round(scale * 100)}%</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
