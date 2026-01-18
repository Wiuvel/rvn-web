'use client';

import { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';

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
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

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

    // Валидация размера (максимум 2MB)
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setError('Размер файла не должен превышать 2MB');
      return false;
    }

    setError(null);
    setSelectedFile(file);

    // Создаем превью
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    
    return true;
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
      const formData = new FormData();
      formData.append('avatar', selectedFile);

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
          className="bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between flex-shrink-0">
            <h2 className="text-lg font-semibold text-white">Изменить аватар</h2>
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

            {/* Превью текущего и нового аватара */}
            <div className="flex items-center justify-center gap-6 mb-6">
              <div className="text-center">
                <div className="text-sm text-neutral-400 mb-2">Текущий</div>
                {currentAvatarUrl ? (
                  <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white/20">
                    <Image
                      src={currentAvatarUrl}
                      alt="Текущий аватар"
                      width={96}
                      height={96}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-full bg-neutral-800 border-2 border-white/20 flex items-center justify-center">
                    <span className="text-2xl text-neutral-500">—</span>
                  </div>
                )}
              </div>
              
              <div className="text-neutral-500">→</div>
              
              <div className="text-center">
                <div className="text-sm text-neutral-400 mb-2">Новый</div>
                {preview ? (
                  <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white/20">
                    <Image
                      src={preview}
                      alt="Новый аватар"
                      width={96}
                      height={96}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-full bg-neutral-800 border-2 border-white/20 flex items-center justify-center">
                    <span className="text-2xl text-neutral-500">—</span>
                  </div>
                )}
              </div>
            </div>

            {/* Зона перетаскивания и выбора файла */}
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
                  <span className={`text-sm transition-colors ${isDragging ? 'text-blue-300' : 'text-neutral-300'}`}>
                    {isDragging
                      ? 'Отпустите для загрузки'
                      : selectedFile
                      ? selectedFile.name
                      : 'Перетащите изображение или выберите файл'}
                  </span>
                  <span className="text-xs text-neutral-500">
                    PNG, JPG, WEBP (макс. 2MB)
                  </span>
                </div>
              </div>
            </div>
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
              disabled={!selectedFile || uploading}
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
