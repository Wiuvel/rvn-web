'use client';

import { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { X, Upload, FileText, Image as ImageIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { SUPPORT_ATTACHMENT_MAX_BYTES, SUPPORT_ATTACHMENT_MAX_MB, SUPPORT_FILE_SIZE_LIMIT_ERROR } from '@/lib/utils/constants';

// Lazy load RateLimitCaptcha для оптимизации bundle size
const RateLimitCaptcha = dynamic(() => import('@/components/auth/RateLimitCaptcha'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-neutral-900 rounded-2xl p-6 sm:p-8 max-w-md w-full mx-4 border border-neutral-800 shadow-2xl">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-neutral-400">Загрузка капчи..</p>
        </div>
      </div>
    </div>
  )
});

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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
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
  const pendingUploadRef = useRef<{ files: File[] } | null>(null);
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
        }
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
  const [imageMeta, setImageMeta] = useState<Map<string, { width: number; height: number; previewUrl: string }>>(new Map());

  useEffect(() => {
    const newPreviews = new Map<string, string>();
    
    selectedFiles.forEach((file) => {
      if (file.type.startsWith('image/')) {
        // Создаём blob URL для превью
        const blobUrl = URL.createObjectURL(file);
        newPreviews.set(file.name, blobUrl);
        setPreviews(new Map(newPreviews));
        
        // Получаем width/height изображения
        const img = new Image();
        img.onload = () => {
          setImageMeta(prev => {
            const updated = new Map(prev);
            updated.set(file.name, {
              width: img.naturalWidth,
              height: img.naturalHeight,
              previewUrl: blobUrl
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

    const allowedImageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
    const allowedDocumentTypes = ['application/pdf', 'text/plain'];

    const sizeLimitExceeded: boolean[] = [];
    const invalidFormatFiles: string[] = [];
    const newFiles: File[] = [];
    const existingFileNames = new Set(selectedFiles.map(f => f.name.toLowerCase()));
    
    filesArray.forEach((file) => {
      // Проверка на дубликаты
      if (existingFileNames.has(file.name.toLowerCase())) {
        // Автоматическое исправление - добавляем номер
        let counter = 1;
        let newName = file.name;
        const nameParts = file.name.split('.');
        const extension = nameParts.pop();
        const baseName = nameParts.join('.');
        
        while (existingFileNames.has(newName.toLowerCase()) || 
               selectedFiles.some(f => f.name.toLowerCase() === newName.toLowerCase())) {
          newName = `${baseName} (${counter}).${extension}`;
          counter++;
        }
        
        // Создаем новый File объект с исправленным именем
        const blob = file.slice(0, file.size, file.type);
        const renamedFile = new File([blob], newName, { type: file.type, lastModified: file.lastModified });
        newFiles.push(renamedFile);
        existingFileNames.add(newName.toLowerCase());
      } else {
        newFiles.push(file);
        existingFileNames.add(file.name.toLowerCase());
      }
      
      // Валидация размера и типа
      if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
        sizeLimitExceeded.push(true);
      } else {
        sizeLimitExceeded.push(false);
        if (!allowedImageTypes.includes(file.type) && !allowedDocumentTypes.includes(file.type) && 
            !file.name.toLowerCase().endsWith('.pdf') && !file.name.toLowerCase().endsWith('.txt')) {
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
    if (e.currentTarget === dropZoneRef.current && !e.currentTarget.contains(e.relatedTarget as Node)) {
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

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => {
      const newFiles = prev.filter((_, i) => i !== index);
      if (prev[index] && prev[index].type.startsWith('image/')) {
        const newPreviews = new Map(previews);
        newPreviews.delete(prev[index].name);
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

  const performUpload = async (filesToUpload: File[]) => {
    const formData = new FormData();
    const localFileData: Record<string, { previewUrl: string; width?: number; height?: number }> = {};

    for (const file of filesToUpload) {
      formData.append('files', file);

      // Собираем локальные данные изображения (превью + размеры)
      if (file.type.startsWith('image/')) {
        const meta = imageMeta.get(file.name);
        if (meta) {
          localFileData[file.name] = {
            previewUrl: meta.previewUrl,
            width: meta.width,
            height: meta.height
          };
        } else {
          // Fallback если meta еще не загружена
          localFileData[file.name] = {
            previewUrl: URL.createObjectURL(file)
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
      data.files = data.files.map((f: any) => {
        const localData = localFileData[f.fileName];
        return {
          ...f,
          previewUrl: localData?.previewUrl,
          // Используем локальные размеры если сервер не вернул
          width: f.width || localData?.width,
          height: f.height || localData?.height
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
    await new Promise(resolve => setTimeout(resolve, 1000));
    
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
            <h2 className="text-lg font-semibold text-white">Прикрепить файлы</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5 text-neutral-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div
              ref={dropZoneRef}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !uploading && selectedFiles.length < maxFiles && fileInputRef.current?.click()}
              className={`w-full p-8 border-2 border-dashed rounded-xl transition-all duration-200 mb-4 ${
                isDragging
                  ? 'border-blue-500 bg-blue-500/10 scale-[1.02]'
                  : 'border-white/20 hover:border-primary-500/50'
              } ${uploading || selectedFiles.length >= maxFiles ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex flex-col items-center gap-2">
                <Upload className={`w-8 h-8 transition-colors ${isDragging ? 'text-blue-400' : 'text-neutral-400'}`} />
                <span className={`text-sm transition-colors text-center whitespace-normal break-words ${isDragging ? 'text-blue-300' : 'text-neutral-300'}`}>
                  {isDragging
                    ? 'Отпустите для загрузки'
                    : selectedFiles.length >= maxFiles
                    ? 'Достигнут лимит'
                    : 'Перетащите файлы или выберите их'}
                </span>
                <span className="text-xs text-neutral-500 text-center">
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
            />

            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                {selectedFiles.map((file, index) => {
                  const preview = previews.get(file.name);
                  const isImage = file.type.startsWith('image/');

                  return (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-lg border border-white/10"
                    >
                      <div className="flex-shrink-0">
                        {isImage && preview ? (
                          <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-neutral-700">
                            <img
                              src={preview}
                              alt={file.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-neutral-700 flex items-center justify-center">
                            {file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? (
                              <FileText className="w-6 h-6 text-red-400" />
                            ) : (
                              <FileText className="w-6 h-6 text-neutral-400" />
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{file.name}</p>
                        <p className="text-xs text-neutral-400">{formatFileSize(file.size)}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        disabled={uploading}
                        className="flex-shrink-0 p-2 hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50"
                        aria-label="Удалить файл"
                      >
                        <X className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}
          </div>

          <div className="p-4 sm:p-6 border-t border-white/10 flex items-center justify-end gap-3 flex-shrink-0">
            <button
              onClick={onClose}
              disabled={uploading}
              className="px-4 py-2 text-neutral-300 hover:text-white transition-colors disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || selectedFiles.length === 0}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-400 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
    </>
  );
}
