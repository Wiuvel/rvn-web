'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { gsap } from 'gsap';
import { X, Upload, FileText } from 'lucide-react';
import dynamic from 'next/dynamic';
import {
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MAX_MB,
  SUPPORT_FILE_SIZE_LIMIT_ERROR,
} from '@/lib/utils/constants';

// Lazy load RateLimitCaptcha для оптимизации bundle size
const RateLimitCaptcha = dynamic(() => import('@/components/auth/RateLimitCaptcha'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl sm:p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-white/20 border-t-white"></div>
          <p className="text-sm text-neutral-400">Загрузка капчи..</p>
        </div>
      </div>
    </div>
  ),
});

/** UUID v4; works in browsers where crypto.randomUUID is missing (e.g. insecure context). */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface UploadedFile {
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  storageUrl: string;
  blur_hash?: string;
  width?: number;
  height?: number;
  previewUrl?: string; // Для локального отображения
}

interface SelectedFile {
  file: File;
  id: string;
}

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (files: UploadedFile[]) => void;
  ticketId: string;
  maxFiles?: number;
}

export default function FileUploadModal({
  isOpen,
  onClose,
  onUploadComplete,
  ticketId,
  maxFiles = 2,
}: FileUploadModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Map<string, string>>(new Map());
  const [showRateLimitCaptcha, setShowRateLimitCaptcha] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const isCaptchaOpenRef = useRef(false);
  const isProcessingCaptchaRef = useRef(false);
  const pendingUploadRef = useRef<{ files: SelectedFile[] } | null>(null);
  // Убрали предзагрузку WASM на клиенте, чтобы избежать проблем с Turbopack и node-модулем `fs` в браузерном бандле.
  // thumbhash/blur теперь не генерируется на клиенте (можно реализовать серверную генерацию при необходимости).

  useEffect(() => {
    if (typeof window === 'undefined' || !modalRef.current || !backdropRef.current) return;

    if (isOpen) {
      // Сбрасываем состояние при открытии модального окна
      setUploading(false);
      setError(null);
      setIsDragging(false);
      isCaptchaOpenRef.current = false;
      isProcessingCaptchaRef.current = false;
      setShowRateLimitCaptcha(false);
      pendingUploadRef.current = null;

      gsap.set([backdropRef.current, modalRef.current], { opacity: 0 });
      gsap.to(backdropRef.current, {
        opacity: 1,
        duration: 0.2,
        ease: 'power2.out',
      });
      gsap.fromTo(
        modalRef.current,
        { opacity: 0, scale: 0.95, y: 20 },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.3,
          ease: 'power2.out',
        },
      );
    } else {
      gsap.to([backdropRef.current, modalRef.current], {
        opacity: 0,
        duration: 0.2,
        ease: 'power2.in',
        onComplete: () => {
          setSelectedFiles([]);
          setPreviews(new Map());
          setError(null);
          setIsDragging(false);
          // Сбрасываем состояние captcha при закрытии модального окна
          isCaptchaOpenRef.current = false;
          isProcessingCaptchaRef.current = false;
          setShowRateLimitCaptcha(false);
          pendingUploadRef.current = null;
        },
      });
    }
  }, [isOpen]);

  // Храним метаданные изображений (width, height, previewUrl)
  const [imageMeta, setImageMeta] = useState<
    Map<string, { width: number; height: number; previewUrl: string }>
  >(new Map());

  useEffect(() => {
    const newPreviews = new Map<string, string>();

    selectedFiles.forEach(({ file }) => {
      if (file.type.startsWith('image/')) {
        // Создаём blob URL для превью
        const blobUrl = URL.createObjectURL(file);
        newPreviews.set(file.name, blobUrl);
        setPreviews(new Map(newPreviews));

        // Получаем width/height изображения
        const img = new window.Image();
        img.onload = () => {
          setImageMeta((prev) => {
            const updated = new Map(prev);
            updated.set(file.name, {
              width: img.naturalWidth,
              height: img.naturalHeight,
              previewUrl: blobUrl,
            });
            return updated;
          });
        };
        img.src = blobUrl;
      }
    });

    // Cleanup old blob URLs
    return () => {
      newPreviews.forEach((url) => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [selectedFiles]);

  const processFiles = (files: FileList | File[]) => {
    const filesArray = Array.from(files);

    if (selectedFiles.length + filesArray.length > maxFiles) {
      setError(`Можно загрузить максимум ${maxFiles} файла`);
      return;
    }

    const allowedImageTypes = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ];
    const allowedDocumentTypes = ['application/pdf', 'text/plain'];

    const sizeLimitExceeded: boolean[] = [];
    const invalidFormatFiles: string[] = [];
    const newFiles: SelectedFile[] = [];
    const existingFileNames = new Set(selectedFiles.map((f) => f.file.name.toLowerCase()));

    filesArray.forEach((file) => {
      // Проверка на дубликаты
      if (existingFileNames.has(file.name.toLowerCase())) {
        // Автоматическое исправление - добавляем номер
        let counter = 1;
        let newName = file.name;
        const nameParts = file.name.split('.');
        const extension = nameParts.pop();
        const baseName = nameParts.join('.');

        while (
          existingFileNames.has(newName.toLowerCase()) ||
          selectedFiles.some((f) => f.file.name.toLowerCase() === newName.toLowerCase())
        ) {
          newName = `${baseName} (${counter}).${extension}`;
          counter++;
        }

        // Создаем новый File объект с исправленным именем
        const blob = file.slice(0, file.size, file.type);
        const renamedFile = new File([blob], newName, {
          type: file.type,
          lastModified: file.lastModified,
        });
        newFiles.push({ file: renamedFile, id: generateId() });
        existingFileNames.add(newName.toLowerCase());
      } else {
        newFiles.push({ file, id: generateId() });
        existingFileNames.add(file.name.toLowerCase());
      }

      // Валидация размера и типа
      if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
        sizeLimitExceeded.push(true);
      } else {
        sizeLimitExceeded.push(false);
        if (
          !allowedImageTypes.includes(file.type) &&
          !allowedDocumentTypes.includes(file.type) &&
          !file.name.toLowerCase().endsWith('.pdf') &&
          !file.name.toLowerCase().endsWith('.txt')
        ) {
          invalidFormatFiles.push(`${file.name} (неподдерживаемый формат)`);
        }
      }
    });

    if (sizeLimitExceeded.some(Boolean) || invalidFormatFiles.length > 0) {
      const parts: string[] = [];
      if (sizeLimitExceeded.some(Boolean)) parts.push(SUPPORT_FILE_SIZE_LIMIT_ERROR);
      if (invalidFormatFiles.length > 0) parts.push(`Ошибка: ${invalidFormatFiles.join(', ')}`);
      setError(parts.join('. '));
      return;
    }

    setSelectedFiles((prev) => [...prev, ...newFiles]);
    setError(null);

    // Сбрасываем input для возможности повторного выбора того же файла
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    processFiles(files);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading && selectedFiles.length < maxFiles) {
      setIsDragging(true);
    }
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

    if (uploading || selectedFiles.length >= maxFiles) return;

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    processFiles(files);
  };

  const removeFile = (id: string) => {
    setSelectedFiles((prev) => {
      const fileToRemove = prev.find((f) => f.id === id);
      const newFiles = prev.filter((f) => f.id !== id);
      if (fileToRemove && fileToRemove.file.type.startsWith('image/')) {
        const newPreviews = new Map(previews);
        newPreviews.delete(fileToRemove.file.name);
        setPreviews(newPreviews);
      }
      return newFiles;
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  const performUpload = async (filesToUpload: SelectedFile[]) => {
    const formData = new FormData();
    const localFileData: Record<string, { previewUrl: string; width?: number; height?: number }> =
      {};

    for (const { file } of filesToUpload) {
      formData.append('files', file);

      // Собираем локальные данные изображения (превью + размеры)
      if (file.type.startsWith('image/')) {
        const meta = imageMeta.get(file.name);
        if (meta) {
          localFileData[file.name] = {
            previewUrl: meta.previewUrl,
            width: meta.width,
            height: meta.height,
          };
        } else {
          // Fallback если meta еще не загружена
          localFileData[file.name] = {
            previewUrl: URL.createObjectURL(file),
          };
        }
      }
    }

    const response = await fetch(`/api/support/upload?ticketId=${ticketId}`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    // Обработка rate limit
    if (response.status === 429) {
      // Сохраняем файлы для повторной попытки после captcha
      pendingUploadRef.current = { files: filesToUpload };

      // Показываем captcha только если она еще не открыта
      if (!isCaptchaOpenRef.current && !isProcessingCaptchaRef.current) {
        isCaptchaOpenRef.current = true;
        setShowRateLimitCaptcha(true);
      }

      throw new Error('RATE_LIMIT_EXCEEDED');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Ошибка загрузки файлов');
    }

    // Обогащаем ответ локальными данными (превью + размеры для мгновенного отображения)
    if (data.success && data.files) {
      data.files = (data.files as (UploadedFile & { fileName?: string })[]).map((f) => {
        const localData = localFileData[f.fileName];
        return {
          ...f,
          previewUrl: localData?.previewUrl,
          // Используем локальные размеры если сервер не вернул
          width: f.width || localData?.width,
          height: f.height || localData?.height,
        };
      });
    }

    return data;
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      const data = await performUpload(selectedFiles);

      if (data.success && data.files) {
        onUploadComplete(data.files);
        // Очищаем выбранные файлы после успешной загрузки
        setSelectedFiles([]);
        setPreviews(new Map());
        setError(null);
        pendingUploadRef.current = null;
        setUploading(false); // Сбрасываем состояние загрузки перед закрытием
        setTimeout(() => {
          onClose();
        }, 300);
      } else {
        throw new Error('Неожиданный формат ответа');
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'RATE_LIMIT_EXCEEDED') {
        // Не показываем ошибку, так как показываем captcha
        setError(null);
        // Не сбрасываем uploading, так как будет повторная попытка после captcha
      } else {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки файлов');
        setUploading(false);
      }
    }
  };

  const handleRateLimitSuccess = async () => {
    // Устанавливаем флаг обработки капчи
    isProcessingCaptchaRef.current = true;

    // Закрываем модальное окно captcha
    isCaptchaOpenRef.current = false;
    setShowRateLimitCaptcha(false);

    // Ждем применения иммунитета на сервере
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Повторяем загрузку, если есть отложенные файлы
    if (pendingUploadRef.current) {
      setUploading(true);
      setError(null);

      try {
        const data = await performUpload(pendingUploadRef.current.files);

        if (data.success && data.files) {
          onUploadComplete(data.files);
          setSelectedFiles([]);
          setPreviews(new Map());
          setError(null);
          pendingUploadRef.current = null;
          setUploading(false); // Сбрасываем состояние загрузки перед закрытием
          setTimeout(() => {
            onClose();
          }, 300);
        } else {
          throw new Error('Неожиданный формат ответа');
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'RATE_LIMIT_EXCEEDED') {
          // Если снова rate limit, показываем captcha снова
          if (!isCaptchaOpenRef.current && !isProcessingCaptchaRef.current) {
            isCaptchaOpenRef.current = true;
            setShowRateLimitCaptcha(true);
          }
          // Не сбрасываем uploading, так как будет повторная попытка
        } else {
          setError(err instanceof Error ? err.message : 'Ошибка загрузки файлов');
          setUploading(false);
        }
      } finally {
        isProcessingCaptchaRef.current = false;
      }
    } else {
      isProcessingCaptchaRef.current = false;
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        ref={backdropRef}
        className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onClose();
          }
        }}
        aria-label="Close modal"
      />

      <div
        ref={modalRef}
        className="pointer-events-none fixed inset-0 z-[1001] flex items-center justify-center p-4"
      >
        <div
          className="pointer-events-auto flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
          }}
          role="presentation"
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Прикрепить файлы</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-2 transition-colors hover:bg-white/10"
              aria-label="Закрыть"
            >
              <X className="h-5 w-5 text-neutral-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div
              ref={dropZoneRef}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (!uploading && selectedFiles.length < maxFiles) fileInputRef.current?.click();
                }
              }}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() =>
                !uploading && selectedFiles.length < maxFiles && fileInputRef.current?.click()
              }
              className={`mb-4 w-full rounded-xl border-2 border-dashed p-8 transition-all duration-200 ${
                isDragging
                  ? 'scale-[1.02] border-blue-500 bg-blue-500/10'
                  : 'border-white/20 hover:border-primary-500/50'
              } ${uploading || selectedFiles.length >= maxFiles ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            >
              <div className="flex flex-col items-center gap-2">
                <Upload
                  className={`h-8 w-8 transition-colors ${isDragging ? 'text-blue-400' : 'text-neutral-400'}`}
                />
                <span
                  className={`whitespace-normal break-words text-center text-sm transition-colors ${isDragging ? 'text-blue-300' : 'text-neutral-300'}`}
                >
                  {isDragging
                    ? 'Отпустите для загрузки'
                    : selectedFiles.length >= maxFiles
                      ? 'Достигнут лимит'
                      : 'Перетащите файлы или выберите их'}
                </span>
                <span className="text-center text-xs text-neutral-500">
                  До {maxFiles} файлов, максимум {SUPPORT_ATTACHMENT_MAX_MB} МБ каждый
                </span>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt"
              onChange={handleFileSelect}
              className="hidden"
              aria-label="Выбрать файл"
            />

            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                {selectedFiles.map(({ file, id }) => {
                  const preview = previews.get(file.name);
                  const isImage = file.type.startsWith('image/');

                  return (
                    <div
                      key={id}
                      className="flex items-center gap-3 rounded-lg border border-white/10 bg-neutral-800/50 p-3"
                    >
                      <div className="flex-shrink-0">
                        {isImage && preview ? (
                          <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-neutral-700">
                            <Image
                              src={preview}
                              alt={file.name}
                              fill
                              sizes="48px"
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-neutral-700">
                            {file.type === 'application/pdf' ||
                            file.name.toLowerCase().endsWith('.pdf') ? (
                              <FileText className="h-6 w-6 text-red-400" />
                            ) : (
                              <FileText className="h-6 w-6 text-neutral-400" />
                            )}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{file.name}</p>
                        <p className="text-xs text-neutral-400">{formatFileSize(file.size)}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFile(id)}
                        disabled={uploading}
                        className="flex-shrink-0 rounded-lg p-2 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                        aria-label="Удалить файл"
                      >
                        <X className="h-4 w-4 text-red-400" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-white/10 p-4 sm:p-6">
            <button
              onClick={onClose}
              disabled={uploading}
              className="px-4 py-2 text-neutral-300 transition-colors hover:text-white disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || selectedFiles.length === 0}
              className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-white transition-colors hover:bg-primary-400 disabled:bg-neutral-700 disabled:text-neutral-500"
            >
              {uploading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
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

      {showRateLimitCaptcha && (
        <RateLimitCaptcha
          isOpen={showRateLimitCaptcha}
          onSuccess={handleRateLimitSuccess}
          onClose={() => {
            // При закрытии очищаем состояние и сбрасываем флаги
            isCaptchaOpenRef.current = false;
            isProcessingCaptchaRef.current = false;
            setShowRateLimitCaptcha(false);
            pendingUploadRef.current = null;
            setUploading(false);
          }}
        />
      )}
    </>
  );
}
