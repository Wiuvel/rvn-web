'use client';

import { useRef, useEffect } from 'react';
import Image from 'next/image';
import { gsap } from 'gsap';
import { FileText } from 'lucide-react';
import { getGradientClasses, getAvatarUrl } from '@/lib/utils/avatar-gradients';
import { messageTextForBubble } from '@/lib/utils/support-messages';
import ImageWithBlur from './ImageWithBlur';
import type { Message } from './types';
import { UserData } from '@/types';

interface MessageItemProps {
  message: Message;
  showDate: boolean;
  userData: UserData | null;
  formatDate: (date: Date) => string;
  formatTime: (date: Date) => string;
  isInitialLoad?: boolean;
  onImageClick?: (url: string, alt: string) => void;
}

const SYSTEM_MESSAGE_TEXT = 'Спасибо за ваше обращение. Мы получили ваш запрос и ответим в ближайшее время.';

/**
 * Individual message bubble component with support for text, images, and documents.
 * Handles both user and support messages with different styling.
 */
export default function MessageItem({
  message,
  showDate,
  userData,
  formatDate,
  formatTime,
  isInitialLoad = false,
  onImageClick
}: MessageItemProps) {
  const messageRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  useEffect(() => {
    // При первой загрузке не анимируем, чтобы избежать дергания
    if (isInitialLoad) {
      if (messageRef.current) {
        gsap.set(messageRef.current, { opacity: 1, y: 0, scale: 1 });
      }
      return;
    }

    // Анимируем только новые сообщения (не при первой загрузке)
    if (messageRef.current && typeof window !== 'undefined' && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      gsap.fromTo(messageRef.current,
        { opacity: 0, y: 10, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "power2.out" }
      );
    }
  }, [message.id, isInitialLoad]);

  const bubbleText = messageTextForBubble(message.text || '', !!(message.attachments && message.attachments.length));
  const messageText = message.text || '';
  
  // Определяем, является ли сообщение системным
  const isStatusChangeMessage = messageText.includes('Статус тикета изменен') ||
    messageText.includes('Ваше обращение приняли в обработку') ||
    messageText.includes('Ваше обращение было закрыто');
  const isSystemMessage = messageText.trim() === SYSTEM_MESSAGE_TEXT.trim() || isStatusChangeMessage;

  // Системное сообщение
  if (isSystemMessage) {
    return (
      <div ref={messageRef}>
        {showDate && (
          <div className="text-center text-xs text-neutral-500 my-4">
            {formatDate(message.timestamp)}
          </div>
        )}
        <div className="flex flex-col items-start w-full">
          <div className="mb-1 px-1 flex items-baseline gap-1">
            <span className="text-xs sm:text-sm font-medium text-yellow-400 bg-white/10 px-1.5 sm:px-2 py-0.5 rounded">
              Система
            </span>
          </div>
          <div 
            className="max-w-[85%] sm:max-w-[70%] min-w-0 flex-shrink-0 rounded-2xl px-3 py-2 sm:px-4 bg-neutral-700/50 text-neutral-300" 
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
          >
            {bubbleText && (
              <p className="text-xs sm:text-sm whitespace-pre-wrap break-words">
                {bubbleText}
              </p>
            )}
            <div className="flex items-center gap-2 text-[10px] sm:text-xs mt-1 text-neutral-400">
              <span>{formatTime(message.timestamp)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Обычное сообщение (user или support)
  return (
    <div ref={messageRef}>
      {showDate && (
        <div className="text-center text-xs text-neutral-500 my-4">
          {formatDate(message.timestamp)}
        </div>
      )}
      <div className={`flex flex-col ${message.sender === 'user' ? 'items-end' : 'items-start'}`}>
        {/* Имя отправителя */}
        {message.sender === 'user' && userData && (
          <div className="mb-1 px-1 flex items-baseline gap-1">
            <span className="text-xs sm:text-sm font-medium text-white bg-white/10 px-1.5 sm:px-2 py-0.5 rounded">
              {userData.username}
            </span>
            <span className="text-[10px] sm:text-xs text-neutral-400">#{userData.user_id}</span>
          </div>
        )}
        {message.sender === 'support' && message.senderData && (
          <div className="mb-1 px-1 flex items-baseline gap-1">
            <span className="text-xs sm:text-sm font-medium text-white bg-white/10 px-1.5 sm:px-2 py-0.5 rounded">
              {message.senderData.username}
            </span>
            <span className="text-[10px] sm:text-xs text-white">Поддержка</span>
          </div>
        )}

        <div className={`flex items-end gap-2 ${message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'} w-full`}>
          {/* Аватар поддержки */}
          {message.sender === 'support' && (
            <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full overflow-hidden flex-shrink-0 mb-1 flex items-center justify-center">
              {message.senderData?.avatar ? (
                <Image
                  src={getAvatarUrl(message.senderData.avatar) || ''}
                  alt={message.senderData.username || 'Support'}
                  width={48}
                  height={48}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              ) : (
                <div className={`w-full h-full ${getGradientClasses(message.senderData?.avatar)} flex items-center justify-center text-white font-semibold text-xs sm:text-sm`}>
                  {message.senderData?.username ? message.senderData.username.charAt(0).toUpperCase() : 'S'}
                </div>
              )}
            </div>
          )}

          {/* Пузырь сообщения */}
          <div 
            className={`max-w-[85%] sm:max-w-[70%] min-w-0 flex-shrink-0 rounded-2xl px-3 py-2 sm:px-4 ${
              message.sender === 'user'
                ? message.isRead !== false
                  ? 'bg-primary-500 text-white rounded-br-sm'
                  : 'bg-neutral-600 text-white rounded-br-sm'
                : 'bg-neutral-800 text-neutral-100 rounded-bl-sm'
            }`} 
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
          >
            {/* Текст сообщения */}
            {bubbleText && (
              <p className="text-xs sm:text-sm whitespace-pre-wrap break-words">
                {bubbleText}
              </p>
            )}

            {/* Вложения */}
            {message.attachments && message.attachments.length > 0 && (() => {
              const images = message.attachments.filter(a => a.file_type.startsWith('image/'));
              const documents = message.attachments.filter(a => !a.file_type.startsWith('image/'));

              return (
                <div className={`space-y-2 ${bubbleText ? 'mt-2' : ''}`}>
                  {/* Изображения */}
                  {images.length > 0 && (
                    <div className={`grid gap-1.5 w-full ${images.length === 1 ? 'max-w-[29rem]' : 'max-w-[37.5rem] grid-cols-2'}`}>
                      {images.map((attachment) => (
                        <button
                          key={attachment.id}
                          onClick={() => onImageClick?.(attachment.storage_url, attachment.file_name)}
                          className="block w-full min-w-0 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                        >
                          <ImageWithBlur
                            src={attachment.storage_url}
                            alt={attachment.file_name}
                            className="rounded-lg"
                            isRead={message.isRead !== false}
                            blurHash={attachment.blur_hash}
                            width={attachment.width}
                            height={attachment.height}
                            isPending={message.isPending === true}
                          />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Документы */}
                  {documents.length > 0 && (
                    <div className="space-y-1.5">
                      {documents.map((attachment) => (
                        <a
                          key={attachment.id}
                          href={attachment.storage_url}
                          download={attachment.file_name}
                          className={`flex items-center gap-2 p-2 hover:bg-white/5 transition-colors rounded-lg cursor-pointer ${
                            message.sender === 'user' ? 'bg-white/10' : 'bg-neutral-700/50'
                          }`}
                        >
                          <FileText className="w-4 h-4 flex-shrink-0 text-neutral-300" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{attachment.file_name}</p>
                            <p className="text-[10px] text-neutral-400">{formatFileSize(attachment.file_size)}</p>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Время отправки */}
            <div className={`text-[10px] sm:text-xs mt-1 ${
              message.sender === 'user'
                ? message.isRead !== false
                  ? 'text-primary-100'
                  : 'text-neutral-300'
                : 'text-neutral-400'
            }`}>
              <span>{formatTime(message.timestamp)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
