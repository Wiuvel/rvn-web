'use client';

import { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { truncateFileName } from '@/lib/utils/truncate';
import { AVATAR_MAX_BYTES } from '@/lib/utils/constants';

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_CROP = 100;
// 1:1 для аватара (aspect ratio enforced by MIN_CROP)

interface AvatarUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (avatarPath: string, avatarUrl: string) => void;
  currentAvatarUrl?: string | null;
}

export default function AvatarUploadModal({
  isOpen,
  onClose,
  onUploadComplete,
  currentAvatarUrl,
}: AvatarUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cropStart, setCropStart] = useState<CropArea | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

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
          setPreview(null);
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

    // Запрещаем GIF для аватаров
    if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) {
      setError('GIF файлы не поддерживаются для аватаров');
      return false;
    }

    // Валидация размера (лимит из конфига)
    if (file.size > AVATAR_MAX_BYTES) {
      setError('Размер файла не должен превышать 2MB');
      return false;
    }

    setError(null);
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setPreview(result);
      if (!isMobile) {
        setTimeout(() => initializeCropArea(), 100);
      } else {
        setCropArea(null);
      }
    };
    reader.readAsDataURL(file);

    return true;
  };

  const getImageBounds = (): { x: number; y: number; width: number; height: number } | null => {
    if (!imageRef.current || !imageContainerRef.current) return null;
    const img = imageRef.current;
    const container = imageContainerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const containerAspect = containerWidth / containerHeight;
    let imgDisplayWidth: number, imgDisplayHeight: number, imgDisplayX: number, imgDisplayY: number;
    if (imgAspect > containerAspect) {
      imgDisplayWidth = containerWidth;
      imgDisplayHeight = containerWidth / imgAspect;
      imgDisplayX = 0;
      imgDisplayY = (containerHeight - imgDisplayHeight) / 2;
    } else {
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
    const size = Math.min(
      imgBounds.width * 0.8,
      imgBounds.height * 0.8,
      imgBounds.width,
      imgBounds.height,
    );
    let cropSize = Math.max(MIN_CROP, Math.min(size, imgBounds.width, imgBounds.height));
    const x = imgBounds.x + (imgBounds.width - cropSize) / 2;
    const y = imgBounds.y + (imgBounds.height - cropSize) / 2;
    setCropArea({ x, y, width: cropSize, height: cropSize });
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
      const imgBounds = getImageBounds();
      if (!imgBounds) return;

      if (isDraggingCrop) {
        let newX = e.clientX - rect.left - dragStart.x;
        let newY = e.clientY - rect.top - dragStart.y;
        newX = Math.max(
          imgBounds.x,
          Math.min(newX, imgBounds.x + imgBounds.width - cropArea.width),
        );
        newY = Math.max(
          imgBounds.y,
          Math.min(newY, imgBounds.y + imgBounds.height - cropArea.height),
        );
        setCropArea((prev) => (prev ? { ...prev, x: newX, y: newY } : null));
      } else if (isResizing && resizeHandle && cropStart) {
        const mouseX = Math.max(
          imgBounds.x,
          Math.min(e.clientX - rect.left, imgBounds.x + imgBounds.width),
        );
        const mouseY = Math.max(
          imgBounds.y,
          Math.min(e.clientY - rect.top, imgBounds.y + imgBounds.height),
        );
        const startRight = cropStart.x + cropStart.width;
        const startBottom = cropStart.y + cropStart.height;
        let newSize = cropStart.width;
        if (resizeHandle === 'nw' || resizeHandle === 'w' || resizeHandle === 'sw') {
          newSize = startRight - mouseX;
        } else if (resizeHandle === 'ne' || resizeHandle === 'e' || resizeHandle === 'se') {
          newSize = mouseX - cropStart.x;
        } else if (resizeHandle === 'n' || resizeHandle === 's') {
          newSize = Math.abs(mouseY - cropStart.y);
        }
        newSize = Math.max(MIN_CROP, Math.min(newSize, imgBounds.width, imgBounds.height));
        let newX = cropStart.x;
        let newY = cropStart.y;
        if (resizeHandle === 'nw' || resizeHandle === 'w' || resizeHandle === 'sw') {
          newX = startRight - newSize;
        }
        if (resizeHandle === 'nw' || resizeHandle === 'n' || resizeHandle === 'ne') {
          newY = startBottom - newSize;
        }
        newX = Math.max(imgBounds.x, Math.min(newX, imgBounds.x + imgBounds.width - newSize));
        newY = Math.max(imgBounds.y, Math.min(newY, imgBounds.y + imgBounds.height - newSize));
        setCropArea({ x: newX, y: newY, width: newSize, height: newSize });
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
      if (!preview || !cropArea || !imageRef.current || !imageContainerRef.current) {
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
        const imgBounds = getImageBounds();
        if (!imgBounds) {
          reject(new Error('Could not get image bounds'));
          return;
        }
        const scaleX = img.naturalWidth / imgBounds.width;
        const scaleY = img.naturalHeight / imgBounds.height;
        const sourceX = (cropArea.x - imgBounds.x) * scaleX;
        const sourceY = (cropArea.y - imgBounds.y) * scaleY;
        const sourceW = cropArea.width * scaleX;
        const sourceH = cropArea.height * scaleY;
        const size = Math.min(sourceW, sourceH);
        const srcX = sourceX + (sourceW - size) / 2;
        const srcY = sourceY + (sourceH - size) / 2;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, srcX, srcY, size, size, 0, 0, size, size);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to create blob'));
          },
          'image/jpeg',
          0.9,
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = preview;
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
    if (
      e.currentTarget === dropZoneRef.current &&
      !e.currentTarget.contains(e.relatedTarget as Node)
    ) {
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

    // Берем первый файл (для аватара только один)
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
      if (isMobile || !cropArea) {
        fileToUpload = selectedFile;
      } else {
        const croppedBlob = await cropImage();
        fileToUpload = new File([croppedBlob], selectedFile.name, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });
      }

      const formData = new FormData();
      formData.append('avatar', fileToUpload);

      const response = await fetch('/api/auth/avatar', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при загрузке аватара');
      }

      onUploadComplete(data.avatar, data.avatarUrl);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при загрузке аватара');
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  const overlayStyle =
    cropArea && imageContainerRef.current
      ? (() => {
          const c = imageContainerRef.current!;
          const w = c.clientWidth;
          const h = c.clientHeight;
          const l = (cropArea.x / w) * 100;
          const r = ((cropArea.x + cropArea.width) / w) * 100;
          const t = (cropArea.y / h) * 100;
          const b = ((cropArea.y + cropArea.height) / h) * 100;
          return {
            background: `linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.6) ${l}%, transparent ${l}%, transparent ${r}%, rgba(0,0,0,0.6) ${r}%, rgba(0,0,0,0.6) 100%), linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.6) ${t}%, transparent ${t}%, transparent ${b}%, rgba(0,0,0,0.6) ${b}%, rgba(0,0,0,0.6) 100%)`,
          };
        })()
      : null;

  return (
    <div className="contents">
      <div
        ref={backdropRef}
        className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        aria-label="Закрыть"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onClose();
          }
        }}
      />

      <div
        ref={modalRef}
        className="pointer-events-none fixed inset-0 z-[1001] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-upload-modal-title"
      >
        <div
          className="pointer-events-auto flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 p-4 sm:p-6">
            <h2 id="avatar-upload-modal-title" className="text-lg font-semibold text-white">
              Изменить аватар
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg p-2 transition-colors hover:bg-white/10"
              aria-label="Закрыть"
              disabled={uploading}
            >
              <X className="h-5 w-5 text-neutral-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {error && (
              <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {!preview ? (
              /* Зона выбора файла */
              <div className="mb-4">
                <div className="mb-6 flex items-center justify-center gap-6">
                  <div className="text-center">
                    <div className="mb-2 text-sm text-neutral-400">Текущий</div>
                    {currentAvatarUrl ? (
                      <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-white/20">
                        <Image
                          src={currentAvatarUrl}
                          alt="Текущий аватар"
                          width={96}
                          height={96}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-white/20 bg-neutral-800">
                        <span className="text-2xl text-neutral-500">—</span>
                      </div>
                    )}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  aria-label="Выбрать файл"
                  disabled={uploading}
                />
                <div
                  ref={dropZoneRef}
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`w-full rounded-lg border-2 border-dashed p-4 transition-all duration-200 ${
                    isDragging
                      ? 'scale-[1.02] border-blue-500 bg-blue-500/10'
                      : 'border-white/20 hover:border-white/40'
                  } ${uploading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                  onClick={() => !uploading && fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !uploading) {
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <div className="flex flex-col items-center gap-2">
                    <ImageIcon
                      className={`h-8 w-8 transition-colors ${isDragging ? 'text-blue-400' : 'text-neutral-400'}`}
                    />
                    <span
                      className={`max-w-full truncate text-center text-sm transition-colors ${isDragging ? 'text-blue-300' : 'text-neutral-300'}`}
                    >
                      Перетащите изображение или выберите файл
                    </span>
                    <span className="text-center text-xs text-neutral-500">
                      PNG, JPG, WEBP (макс. 2MB)
                    </span>
                  </div>
                </div>
              </div>
            ) : isMobile ? (
              /* Мобильный вид: превью без обрезки */
              <div className="mb-4">
                <div className="mb-6 flex items-center justify-center gap-6">
                  <div className="text-center">
                    <div className="mb-2 text-sm text-neutral-400">Текущий</div>
                    {currentAvatarUrl ? (
                      <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-white/20">
                        <Image
                          src={currentAvatarUrl}
                          alt="Текущий аватар"
                          width={96}
                          height={96}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-white/20 bg-neutral-800">
                        <span className="text-2xl text-neutral-500">—</span>
                      </div>
                    )}
                  </div>
                  <div className="text-2xl text-neutral-500">→</div>
                  <div className="text-center">
                    <div className="mb-2 text-sm text-neutral-400">Новый</div>
                    <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-white/20">
                      <Image
                        src={preview}
                        alt="Новый аватар"
                        width={96}
                        height={96}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    </div>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  aria-label="Выбрать файл"
                  disabled={uploading}
                />
                <div
                  ref={dropZoneRef}
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`w-full cursor-pointer rounded-lg border-2 border-dashed p-3 text-center text-sm text-neutral-400 hover:border-white/40 ${uploading ? 'opacity-50' : ''}`}
                  onClick={() => !uploading && fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (!uploading) fileInputRef.current?.click();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  Выберите другой файл
                </div>
              </div>
            ) : (
              /* Десктоп: область обрезки 1:1 */
              <div className="mb-4">
                {selectedFile && (
                  <p
                    className="mb-2 max-w-full truncate text-sm text-neutral-400"
                    title={selectedFile.name}
                  >
                    {truncateFileName(selectedFile.name)}
                  </p>
                )}
                <div
                  ref={imageContainerRef}
                  className="relative w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950"
                  style={{ minHeight: '200px', maxHeight: '400px' }}
                >
                  <img
                    ref={imageRef}
                    src={preview}
                    alt="Превью"
                    className="h-auto max-h-[400px] w-full object-contain"
                    onLoad={initializeCropArea}
                  />
                  {cropArea && overlayStyle && (
                    <>
                      <div className="pointer-events-none absolute inset-0" style={overlayStyle} />
                      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- интерактивный кроп-регион управляется мышью */}
                      <div
                        className="absolute cursor-move rounded-full border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.8),0_0_20px_rgba(59,130,246,0.3)]"
                        style={{
                          left: `${cropArea.x}px`,
                          top: `${cropArea.y}px`,
                          width: `${cropArea.width}px`,
                          height: `${cropArea.height}px`,
                        }}
                        onMouseDown={handleCropMouseDown}
                        role="application"
                        aria-label="Область обрезки"
                      />
                      {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => (
                        /* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- интерактивный кроп-регион управляется мышью */
                        <div
                          key={handle}
                          className="absolute z-20 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-blue-500 bg-white shadow-lg"
                          style={{
                            left: handle.includes('w')
                              ? `${cropArea.x - 8}px`
                              : handle.includes('e')
                                ? `${cropArea.x + cropArea.width - 8}px`
                                : `${cropArea.x + cropArea.width / 2 - 8}px`,
                            top: handle.includes('n')
                              ? `${cropArea.y - 8}px`
                              : handle.includes('s')
                                ? `${cropArea.y + cropArea.height - 8}px`
                                : `${cropArea.y + cropArea.height / 2 - 8}px`,
                            cursor:
                              handle === 'nw' || handle === 'se'
                                ? 'nwse-resize'
                                : handle === 'ne' || handle === 'sw'
                                  ? 'nesw-resize'
                                  : handle === 'n' || handle === 's'
                                    ? 'ns-resize'
                                    : 'ew-resize',
                          }}
                          onMouseDown={(e) => handleResizeMouseDown(e, handle)}
                          role="application"
                          aria-label={`Resize ${handle}`}
                        />
                      ))}
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  aria-label="Выбрать файл"
                  disabled={uploading}
                />
                <button
                  type="button"
                  className="mt-2 text-sm text-neutral-400 underline hover:text-white"
                  onClick={() => !uploading && fileInputRef.current?.click()}
                >
                  Выберите другой файл
                </button>
              </div>
            )}

            {/* Кнопки действий */}
            <div className="flex flex-shrink-0 gap-3 border-t border-white/10 p-4 sm:p-6">
              <button
                onClick={onClose}
                disabled={uploading}
                className="flex-1 rounded-lg bg-neutral-800 px-4 py-2 text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white"></div>
                    Загрузка...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Загрузить
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
