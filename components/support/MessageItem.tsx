'use client';

import { useRef, useEffect, memo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
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

const SYSTEM_MESSAGE_TEXT =
  'Спасибо за ваше обращение. Мы получили ваш запрос и ответим в ближайшее время.';

/**
 * Individual message bubble component with support for text, images, and documents.
 * Handles both user and support messages with different styling.
 */
function MessageItem({
  message,
  showDate,
  userData,
  formatDate,
  formatTime,
  isInitialLoad = false,
  onImageClick,
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
      gsap.fromTo(
        messageRef.current,
        { opacity: 0, y: 10, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'power2.out' },
      );
    }
  }, [message.id, isInitialLoad]);

  const bubbleText = messageTextForBubble(
    message.text || '',
    !!(message.attachments && message.attachments.length),
  );
  const messageText = message.text || '';

  // Определяем, является ли сообщение системным
  const isStatusChangeMessage =
    messageText.includes('Статус тикета изменен') ||
    messageText.includes('Ваше обращение приняли в обработку') ||
    messageText.includes('Ваше обращение было закрыто');
  const isSystemMessage =
    messageText.trim() === SYSTEM_MESSAGE_TEXT.trim() || isStatusChangeMessage;

  // Системное сообщение
  if (isSystemMessage) {
    return (
      <div ref={messageRef}>
        {showDate && (
          <div className="my-4 text-center text-xs text-neutral-500">
            {formatDate(message.timestamp)}
          </div>
        )}
        <div className="flex w-full flex-col items-start">
          <div className="mb-1 flex items-baseline gap-1 px-1">
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-medium text-yellow-400 sm:px-2 sm:text-sm">
              Система
            </span>
          </div>
          <div
            className="min-w-0 max-w-[85%] flex-shrink-0 rounded-2xl bg-neutral-700/50 px-3 py-2 text-neutral-300 sm:max-w-[70%] sm:px-4"
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
          >
            {bubbleText && (
              <p className="whitespace-pre-wrap break-words text-xs sm:text-sm">{bubbleText}</p>
            )}
            <div className="mt-1 flex items-center gap-2 text-[10px] text-neutral-400 sm:text-xs">
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
        <div className="my-4 text-center text-xs text-neutral-500">
          {formatDate(message.timestamp)}
        </div>
      )}
      <div className={`flex flex-col ${message.sender === 'user' ? 'items-end' : 'items-start'}`}>
        {/* Имя отправителя */}
        {message.sender === 'user' && userData && (
          <div className="mb-1 flex items-baseline gap-1 px-1">
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-medium text-white sm:px-2 sm:text-sm">
              {userData.username}
            </span>
            <span className="text-[10px] text-neutral-400 sm:text-xs">#{userData.user_id}</span>
          </div>
        )}
        {message.sender === 'support' && message.senderData && (
          <div className="mb-1 flex items-baseline gap-1 px-1">
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-medium text-white sm:px-2 sm:text-sm">
              {message.senderData.username}
            </span>
            <span className="text-[10px] text-white sm:text-xs">Поддержка</span>
          </div>
        )}

        <div
          className={`flex items-end gap-2 ${message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'} w-full`}
        >
          {/* Аватар поддержки */}
          {message.sender === 'support' &&
            (() => {
              const avatarContent = (
                <div className="mb-1 flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full sm:h-12 sm:w-12">
                  {message.senderData?.avatar && getAvatarUrl(message.senderData.avatar) ? (
                    <Image
                      src={getAvatarUrl(message.senderData.avatar)!}
                      alt={message.senderData.username || 'Support'}
                      width={48}
                      height={48}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div
                      className={`h-full w-full ${getGradientClasses(message.senderData?.avatar)} flex items-center justify-center text-xs font-semibold text-white sm:text-sm`}
                    >
                      {message.senderData?.username
                        ? message.senderData.username.charAt(0).toUpperCase()
                        : 'S'}
                    </div>
                  )}
                </div>
              );
              return message.senderData?.user_id ? (
                <Link
                  href={`/user/${message.senderData.user_id}`}
                  prefetch={false}
                  className="transition-opacity hover:opacity-80"
                >
                  {avatarContent}
                </Link>
              ) : (
                avatarContent
              );
            })()}

          {/* Пузырь сообщения */}
          <div
            className={`min-w-0 max-w-[85%] flex-shrink-0 rounded-2xl px-3 py-2 sm:max-w-[70%] sm:px-4 ${
              message.sender === 'user'
                ? message.isRead !== false
                  ? 'rounded-br-sm bg-primary-500 text-white'
                  : 'rounded-br-sm bg-neutral-600 text-white'
                : 'rounded-bl-sm bg-neutral-800 text-neutral-100'
            }`}
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
          >
            {/* Текст сообщения */}
            {bubbleText && (
              <p className="whitespace-pre-wrap break-words text-xs sm:text-sm">{bubbleText}</p>
            )}

            {/* Вложения */}
            {message.attachments &&
              message.attachments.length > 0 &&
              (() => {
                const images = message.attachments.filter((a) => a.file_type.startsWith('image/'));
                const documents = message.attachments.filter(
                  (a) => !a.file_type.startsWith('image/'),
                );

                return (
                  <div className={`space-y-2 ${bubbleText ? 'mt-2' : ''}`}>
                    {/* Изображения */}
                    {images.length > 0 && (
                      <div
                        className={`grid w-full gap-1.5 ${images.length === 1 ? 'max-w-[29rem]' : 'max-w-[37.5rem] grid-cols-2'}`}
                      >
                        {images.map((attachment) => (
                          <button
                            key={attachment.id}
                            onClick={() =>
                              onImageClick?.(attachment.storage_url, attachment.file_name)
                            }
                            className="block w-full min-w-0 cursor-pointer overflow-hidden rounded-lg transition-opacity hover:opacity-90"
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
                            className={`flex cursor-pointer items-center gap-2 rounded-lg p-2 transition-colors hover:bg-white/5 ${
                              message.sender === 'user' ? 'bg-white/10' : 'bg-neutral-700/50'
                            }`}
                          >
                            <FileText className="h-4 w-4 flex-shrink-0 text-neutral-300" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium">{attachment.file_name}</p>
                              <p className="text-[10px] text-neutral-400">
                                {formatFileSize(attachment.file_size)}
                              </p>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

            {/* Время отправки */}
            <div
              className={`mt-1 text-[10px] sm:text-xs ${
                message.sender === 'user'
                  ? message.isRead !== false
                    ? 'text-primary-100'
                    : 'text-neutral-300'
                  : 'text-neutral-400'
              }`}
            >
              <span>{formatTime(message.timestamp)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(MessageItem);
