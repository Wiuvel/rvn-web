'use client';

import { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import { truncateFileName } from '@/lib/utils/truncate';
import { BANNER_MAX_BYTES } from '@/lib/utils/constants';

interface BannerUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (bannerPath: string, bannerUrl: string) => void;
  currentBannerUrl?: string | null;
}

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_CROP_WIDTH = 400;
const MIN_CROP_HEIGHT = 100;
const ASPECT_RATIO = 4 / 1; // 4:1 для баннера

export default function BannerUploadModal({
  isOpen,
  onClose,
  onUploadComplete,
  currentBannerUrl,
}: BannerUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cropStart, setCropStart] = useState<CropArea | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Проверка на мобильные устройства
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !modalRef.current || !backdropRef.current) return;

    if (isOpen) {
      // Анимация появления
      gsap.set([backdropRef.current, modalRef.current], { opacity: 0 });
      gsap.to(backdropRef.current, { opacity: 1, duration: 0.2 });
      gsap.to(modalRef.current, {
        opacity: 1,
        scale: 1,
        duration: 0.2,
        ease: 'power2.out',
      });
    } else {
      // Анимация исчезновения
      gsap.to([backdropRef.current, modalRef.current], {
        opacity: 0,
        duration: 0.2,
        onComplete: () => {
          setSelectedFile(null);
          setImagePreview(null);
          setCropArea(null);
          setError(null);
          setIsDragging(false);
        },
      });
      gsap.to(modalRef.current, {
        scale: 0.95,
        duration: 0.2,
        ease: 'power2.in',
      });
    }
  }, [isOpen]);

  const validateAndSetFile = (file: File) => {
    // Валидация типа файла
    if (!file.type.startsWith('image/')) {
      setError('Пожалуйста, выберите изображение');
      return false;
    }

    // Запрещаем GIF для баннеров
    if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) {
      setError('GIF файлы не поддерживаются для баннеров');
      return false;
    }

    // Валидация размера (лимит из конфига)
    if (file.size > BANNER_MAX_BYTES) {
      setError('Размер файла не должен превышать 5MB');
      return false;
    }

    setError(null);
    setSelectedFile(file);
    
    // Создаем preview изображения
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImagePreview(result);
      
      // Инициализируем crop область после загрузки изображения (только на десктопе)
      if (!isMobile) {
        setTimeout(() => {
          initializeCropArea();
        }, 100);
      }
    };
    reader.readAsDataURL(file);
    
    return true;
  };

  // Вычисляем реальные размеры изображения в контейнере (с учетом object-contain)
  const getImageBounds = () => {
    if (!imageRef.current || !imageContainerRef.current) return null;
    
    const img = imageRef.current;
    const container = imageContainerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const containerAspect = containerWidth / containerHeight;
    
    let imgDisplayWidth: number;
    let imgDisplayHeight: number;
    let imgDisplayX: number;
    let imgDisplayY: number;
    
    if (imgAspect > containerAspect) {
      // Изображение шире контейнера
      imgDisplayWidth = containerWidth;
      imgDisplayHeight = containerWidth / imgAspect;
      imgDisplayX = 0;
      imgDisplayY = (containerHeight - imgDisplayHeight) / 2;
    } else {
      // Изображение выше контейнера
      imgDisplayHeight = containerHeight;
      imgDisplayWidth = containerHeight * imgAspect;
      imgDisplayX = (containerWidth - imgDisplayWidth) / 2;
      imgDisplayY = 0;
    }
    
    return { x: imgDisplayX, y: imgDisplayY, width: imgDisplayWidth, height: imgDisplayHeight };
  };

  const initializeCropArea = () => {
    if (!imageRef.current || !imageContainerRef.current) return;

    const imgBounds = getImageBounds();
    if (!imgBounds) return;
    
    const cropAspect = ASPECT_RATIO;
    
    let cropWidth: number;
    let cropHeight: number;
    
    // Используем 80% от размера изображения
    cropWidth = Math.min(imgBounds.width * 0.8, imgBounds.width);
    cropHeight = cropWidth / cropAspect;
    
    // Если высота больше доступной, уменьшаем
    if (cropHeight > imgBounds.height * 0.8) {
      cropHeight = imgBounds.height * 0.8;
      cropWidth = cropHeight * cropAspect;
    }
    
    // Убеждаемся, что размеры не меньше минимальных
    if (cropWidth < MIN_CROP_WIDTH) {
      cropWidth = MIN_CROP_WIDTH;
      cropHeight = cropWidth / cropAspect;
    }
    if (cropHeight < MIN_CROP_HEIGHT) {
      cropHeight = MIN_CROP_HEIGHT;
      cropWidth = cropHeight * cropAspect;
    }
    
    // Ограничиваем размеры в пределах изображения
    if (cropWidth > imgBounds.width) {
      cropWidth = imgBounds.width;
      cropHeight = cropWidth / cropAspect;
    }
    if (cropHeight > imgBounds.height) {
      cropHeight = imgBounds.height;
      cropWidth = cropHeight * cropAspect;
    }
    
    const x = imgBounds.x + (imgBounds.width - cropWidth) / 2;
    const y = imgBounds.y + (imgBounds.height - cropHeight) / 2;
    
    setCropArea({ x, y, width: cropWidth, height: cropHeight });
  };

  const handleCropMouseDown = (e: React.MouseEvent) => {
    if (!cropArea || !imageContainerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingCrop(true);
    const rect = imageContainerRef.current.getBoundingClientRect();
    setDragStart({
      x: e.clientX - rect.left - cropArea.x,
      y: e.clientY - rect.top - cropArea.y,
    });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, handle: string) => {
    if (!cropArea) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeHandle(handle);
    setCropStart(cropArea);
    const rect = imageContainerRef.current?.getBoundingClientRect();
    if (rect) {
      setDragStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const handleCropMouseUp = () => {
    setIsDraggingCrop(false);
    setIsResizing(false);
    setResizeHandle(null);
    setCropStart(null);
  };

  useEffect(() => {
    if (!isDraggingCrop && !isResizing) return;

    const handleMove = (e: MouseEvent) => {
      if (!cropArea || !imageContainerRef.current || !imageRef.current) return;
      
      const container = imageContainerRef.current;
      const rect = container.getBoundingClientRect();
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      
      if (isDraggingCrop) {
        // Перемещение области обрезки
        const imgBounds = getImageBounds();
        if (!imgBounds) return;
        
        let newX = e.clientX - rect.left - dragStart.x;
        let newY = e.clientY - rect.top - dragStart.y;
        
        // Ограничиваем перемещение в пределах изображения
        newX = Math.max(imgBounds.x, Math.min(newX, imgBounds.x + imgBounds.width - cropArea.width));
        newY = Math.max(imgBounds.y, Math.min(newY, imgBounds.y + imgBounds.height - cropArea.height));
        
        setCropArea(prev => prev ? { ...prev, x: newX, y: newY } : null);
      } else if (isResizing && resizeHandle && cropStart) {
        // Изменение размера области обрезки
        const imgBounds = getImageBounds();
        if (!imgBounds) return;
        
        const mouseX = Math.max(imgBounds.x, Math.min(e.clientX - rect.left, imgBounds.x + imgBounds.width));
        const mouseY = Math.max(imgBounds.y, Math.min(e.clientY - rect.top, imgBounds.y + imgBounds.height));
        
        let newCropArea = { ...cropStart };
        const startRight = cropStart.x + cropStart.width;
        const startBottom = cropStart.y + cropStart.height;
        
        // Определяем направление изменения размера
        switch (resizeHandle) {
          case 'nw': // Северо-запад (верхний левый угол)
            newCropArea.x = mouseX;
            newCropArea.y = mouseY;
            newCropArea.width = startRight - mouseX;
            newCropArea.height = newCropArea.width / ASPECT_RATIO;
            newCropArea.y = startBottom - newCropArea.height;
            break;
          case 'ne': // Северо-восток (верхний правый угол)
            newCropArea.width = mouseX - cropStart.x;
            newCropArea.height = newCropArea.width / ASPECT_RATIO;
            newCropArea.y = startBottom - newCropArea.height;
            break;
          case 'sw': // Юго-запад (нижний левый угол)
            newCropArea.x = mouseX;
            newCropArea.width = startRight - mouseX;
            newCropArea.height = newCropArea.width / ASPECT_RATIO;
            break;
          case 'se': // Юго-восток (нижний правый угол)
            newCropArea.width = mouseX - cropStart.x;
            newCropArea.height = newCropArea.width / ASPECT_RATIO;
            break;
          case 'n': // Север (верхняя сторона)
            newCropArea.y = mouseY;
            newCropArea.height = startBottom - mouseY;
            newCropArea.width = newCropArea.height * ASPECT_RATIO;
            break;
          case 's': // Юг (нижняя сторона)
            newCropArea.height = mouseY - cropStart.y;
            newCropArea.width = newCropArea.height * ASPECT_RATIO;
            break;
          case 'w': // Запад (левая сторона)
            newCropArea.x = mouseX;
            newCropArea.width = startRight - mouseX;
            newCropArea.height = newCropArea.width / ASPECT_RATIO;
            break;
          case 'e': // Восток (правая сторона)
            newCropArea.width = mouseX - cropStart.x;
            newCropArea.height = newCropArea.width / ASPECT_RATIO;
            break;
        }
        
        // Проверяем минимальный размер
        if (newCropArea.width < MIN_CROP_WIDTH) {
          newCropArea.width = MIN_CROP_WIDTH;
          newCropArea.height = newCropArea.width / ASPECT_RATIO;
        }
        if (newCropArea.height < MIN_CROP_HEIGHT) {
          newCropArea.height = MIN_CROP_HEIGHT;
          newCropArea.width = newCropArea.height * ASPECT_RATIO;
        }
        
        // Корректируем позицию при изменении размера с углов/сторон
        if (resizeHandle === 'nw' || resizeHandle === 'w' || resizeHandle === 'sw') {
          newCropArea.x = startRight - newCropArea.width;
        }
        if (resizeHandle === 'nw' || resizeHandle === 'n' || resizeHandle === 'ne') {
          newCropArea.y = startBottom - newCropArea.height;
        }
        
        // Ограничиваем в пределах изображения
        if (newCropArea.x < imgBounds.x) {
          newCropArea.x = imgBounds.x;
        }
        if (newCropArea.y < imgBounds.y) {
          newCropArea.y = imgBounds.y;
        }
        if (newCropArea.x + newCropArea.width > imgBounds.x + imgBounds.width) {
          newCropArea.width = imgBounds.x + imgBounds.width - newCropArea.x;
          newCropArea.height = newCropArea.width / ASPECT_RATIO;
        }
        if (newCropArea.y + newCropArea.height > imgBounds.y + imgBounds.height) {
          newCropArea.height = imgBounds.y + imgBounds.height - newCropArea.y;
          newCropArea.width = newCropArea.height * ASPECT_RATIO;
        }
        
        // Финальная проверка минимального размера
        if (newCropArea.width >= MIN_CROP_WIDTH && newCropArea.height >= MIN_CROP_HEIGHT) {
          setCropArea(newCropArea);
        }
      }
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleCropMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleCropMouseUp);
    };
  }, [isDraggingCrop, isResizing, cropArea, dragStart, resizeHandle, cropStart]);

  const cropImage = (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      if (!imagePreview || !cropArea || !imageRef.current || !imageContainerRef.current) {
        reject(new Error('No image or crop area'));
        return;
      }

      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Вычисляем реальные границы изображения в контейнере
        const imgBounds = getImageBounds();
        if (!imgBounds) {
          reject(new Error('Could not get image bounds'));
          return;
        }

        // Вычисляем реальные координаты и размеры на исходном изображении
        const scaleX = img.naturalWidth / imgBounds.width;
        const scaleY = img.naturalHeight / imgBounds.height;
        
        // Координаты относительно изображения (не контейнера)
        const relativeX = cropArea.x - imgBounds.x;
        const relativeY = cropArea.y - imgBounds.y;
        
        const sourceX = relativeX * scaleX;
        const sourceY = relativeY * scaleY;
        const sourceWidth = cropArea.width * scaleX;
        const sourceHeight = cropArea.height * scaleY;
        
        canvas.width = sourceWidth;
        canvas.height = sourceHeight;
        
        ctx.drawImage(
          img,
          sourceX, sourceY, sourceWidth, sourceHeight,
          0, 0, sourceWidth, sourceHeight
        );
        
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        }, 'image/jpeg', 0.9);
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imagePreview;
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    validateAndSetFile(file);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Проверяем, что мы действительно покинули зону (не перешли на дочерний элемент)
    if (e.currentTarget === dropZoneRef.current && !e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (uploading) return;

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    // Берем первый файл
    const file = files[0];
    validateAndSetFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Пожалуйста, выберите файл');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      let fileToUpload: File;
      
      // На мобильных устройствах загружаем оригинальный файл без обрезки
      if (isMobile || !cropArea) {
        fileToUpload = selectedFile;
      } else {
        // Обрезаем изображение
        const croppedBlob = await cropImage();
        fileToUpload = new File([croppedBlob], selectedFile.name, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });
      }

      const formData = new FormData();
      formData.append('banner', fileToUpload);

      const response = await fetch('/api/auth/banner', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при загрузке баннера');
      }

      onUploadComplete(data.banner, data.bannerUrl);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при загрузке баннера');
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        ref={backdropRef}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000]"
        onClick={onClose}
      />

      <div
        ref={modalRef}
        className="fixed inset-0 z-[1001] flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          className="bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between flex-shrink-0">
            <h2 className="text-lg font-semibold text-white">Изменить баннер</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Закрыть"
              disabled={uploading}
            >
              <X className="w-5 h-5 text-neutral-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                {error}
              </div>
            )}

            {!imagePreview ? (
              /* Зона перетаскивания и выбора файла */
              <div className="mb-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={uploading}
                />
                <div
                  ref={dropZoneRef}
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`w-full p-4 border-2 border-dashed rounded-lg transition-all duration-200 ${
                    isDragging
                      ? 'border-blue-500 bg-blue-500/10 scale-[1.02]'
                      : 'border-white/20 hover:border-white/40'
                  } ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  onClick={() => !uploading && fileInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center gap-2">
                    <ImageIcon className={`w-8 h-8 transition-colors ${isDragging ? 'text-blue-400' : 'text-neutral-400'}`} />
                    <span className={`text-sm transition-colors text-center whitespace-normal break-words ${isDragging ? 'text-blue-300' : 'text-neutral-300'}`}>
                      {isDragging
                        ? 'Отпустите для загрузки'
                        : 'Перетащите изображение или выберите файл'}
                    </span>
                    <span className="text-xs text-neutral-500 text-center">
                      PNG, JPG, WEBP (макс. 5MB)
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* Область обрезки изображения */
              <div className="mb-4">
                {selectedFile && (
                  <p className="text-sm text-neutral-400 truncate max-w-full mb-2" title={selectedFile.name}>
                    {truncateFileName(selectedFile.name)}
                  </p>
                )}
                <div
                  ref={imageContainerRef}
                  className="relative w-full bg-neutral-950 rounded-lg overflow-hidden border border-neutral-800"
                  style={{ minHeight: '200px', maxHeight: '400px' }}
                >
                  <img
                    ref={imageRef}
                    src={imagePreview}
                    alt="Preview"
                    className="w-full h-auto max-h-[400px] object-contain"
                    onLoad={initializeCropArea}
                  />
                  {cropArea && !isMobile && imageContainerRef.current && (() => {
                    const container = imageContainerRef.current;
                    return (
                      <>
                        {/* Затемнение вне области обрезки */}
                        <div
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            background: `linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.6) ${(cropArea.x / container.clientWidth) * 100}%, transparent ${(cropArea.x / container.clientWidth) * 100}%, transparent ${((cropArea.x + cropArea.width) / container.clientWidth) * 100}%, rgba(0,0,0,0.6) ${((cropArea.x + cropArea.width) / container.clientWidth) * 100}%, rgba(0,0,0,0.6) 100%),
                                      linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.6) ${(cropArea.y / container.clientHeight) * 100}%, transparent ${(cropArea.y / container.clientHeight) * 100}%, transparent ${((cropArea.y + cropArea.height) / container.clientHeight) * 100}%, rgba(0,0,0,0.6) ${((cropArea.y + cropArea.height) / container.clientHeight) * 100}%, rgba(0,0,0,0.6) 100%)`,
                          }}
                        />
                        
                        {/* Область обрезки */}
                        <div
                          className="absolute border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.8),0_0_20px_rgba(59,130,246,0.3)] cursor-move"
                          style={{
                            left: `${cropArea.x}px`,
                            top: `${cropArea.y}px`,
                            width: `${cropArea.width}px`,
                            height: `${cropArea.height}px`,
                          }}
                          onMouseDown={handleCropMouseDown}
                        />
                        
                        {/* Ручки для изменения размера - всегда привязаны к рамке */}
                        {/* Углы */}
                        <div
                          className="absolute w-5 h-5 bg-white border-2 border-blue-500 rounded-sm cursor-nwse-resize z-20 shadow-lg hover:bg-blue-50 active:scale-90 transition-transform"
                          style={{
                            left: `${cropArea.x - 10}px`,
                            top: `${cropArea.y - 10}px`,
                          }}
                          onMouseDown={(e) => handleResizeMouseDown(e, 'nw')}
                        />
                        <div
                          className="absolute w-5 h-5 bg-white border-2 border-blue-500 rounded-sm cursor-nesw-resize z-20 shadow-lg hover:bg-blue-50 active:scale-90 transition-transform"
                          style={{
                            left: `${cropArea.x + cropArea.width - 10}px`,
                            top: `${cropArea.y - 10}px`,
                          }}
                          onMouseDown={(e) => handleResizeMouseDown(e, 'ne')}
                        />
                        <div
                          className="absolute w-5 h-5 bg-white border-2 border-blue-500 rounded-sm cursor-nesw-resize z-20 shadow-lg hover:bg-blue-50 active:scale-90 transition-transform"
                          style={{
                            left: `${cropArea.x - 10}px`,
                            top: `${cropArea.y + cropArea.height - 10}px`,
                          }}
                          onMouseDown={(e) => handleResizeMouseDown(e, 'sw')}
                        />
                        <div
                          className="absolute w-5 h-5 bg-white border-2 border-blue-500 rounded-sm cursor-nwse-resize z-20 shadow-lg hover:bg-blue-50 active:scale-90 transition-transform"
                          style={{
                            left: `${cropArea.x + cropArea.width - 10}px`,
                            top: `${cropArea.y + cropArea.height - 10}px`,
                          }}
                          onMouseDown={(e) => handleResizeMouseDown(e, 'se')}
                        />
                        
                        {/* Стороны */}
                        <div
                          className="absolute w-5 h-5 bg-white border-2 border-blue-500 rounded-sm cursor-ns-resize z-20 shadow-lg hover:bg-blue-50 active:scale-90 transition-transform"
                          style={{
                            left: `${cropArea.x + cropArea.width / 2 - 10}px`,
                            top: `${cropArea.y - 10}px`,
                          }}
                          onMouseDown={(e) => handleResizeMouseDown(e, 'n')}
                        />
                        <div
                          className="absolute w-5 h-5 bg-white border-2 border-blue-500 rounded-sm cursor-ns-resize z-20 shadow-lg hover:bg-blue-50 active:scale-90 transition-transform"
                          style={{
                            left: `${cropArea.x + cropArea.width / 2 - 10}px`,
                            top: `${cropArea.y + cropArea.height - 10}px`,
                          }}
                          onMouseDown={(e) => handleResizeMouseDown(e, 's')}
                        />
                        <div
                          className="absolute w-5 h-5 bg-white border-2 border-blue-500 rounded-sm cursor-ew-resize z-20 shadow-lg hover:bg-blue-50 active:scale-90 transition-transform"
                          style={{
                            left: `${cropArea.x - 10}px`,
                            top: `${cropArea.y + cropArea.height / 2 - 10}px`,
                          }}
                          onMouseDown={(e) => handleResizeMouseDown(e, 'w')}
                        />
                        <div
                          className="absolute w-5 h-5 bg-white border-2 border-blue-500 rounded-sm cursor-ew-resize z-20 shadow-lg hover:bg-blue-50 active:scale-90 transition-transform"
                          style={{
                            left: `${cropArea.x + cropArea.width - 10}px`,
                            top: `${cropArea.y + cropArea.height / 2 - 10}px`,
                          }}
                          onMouseDown={(e) => handleResizeMouseDown(e, 'e')}
                        />
                      </>
                    );
                  })()}
                </div>
                <button
                  onClick={() => {
                    setImagePreview(null);
                    setCropArea(null);
                    setSelectedFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="mt-2 text-sm text-neutral-400 hover:text-neutral-300 transition-colors"
                >
                  Выбрать другое изображение
                </button>
              </div>
            )}
          </div>

          {/* Кнопки действий */}
          <div className="p-4 sm:p-6 border-t border-white/10 flex gap-3 flex-shrink-0">
            <button
              onClick={onClose}
              disabled={uploading}
              className="flex-1 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Отмена
            </button>
            <button
              onClick={handleUpload}
              disabled={!selectedFile || (!isMobile && !cropArea) || uploading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  Загрузка...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Загрузить
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
