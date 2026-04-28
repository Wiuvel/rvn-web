'use client';

import { memo, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { gsap } from 'gsap';
import { FileText } from 'lucide-react';
import { getAvatarUrl, getGradientClasses } from '@/lib/utils/avatar-gradients';
import { messageTextForBubble } from '@/lib/support/messages';
import ImageWithBlur from '@/components/support/ImageWithBlur';

export interface AdminMessageAttachment {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_url: string;
  storage_path?: string;
  blur_hash?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface AdminMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_type: 'user' | 'support';
  message_text: string;
  is_read: boolean;
  created_at: string;
  /** Стабильный ключ для React-списка (чтобы не переигрывать анимацию) */
  _renderKey?: string;
  isPending?: boolean;
  sender?: {
    id: string;
    username: string;
    user_id: string | null;
    avatar?: string | null;
  } | null;
  attachments?: AdminMessageAttachment[];
}

interface AdminMessageItemProps {
  message: AdminMessage;
  showDate: boolean;
  isSystemMessage: boolean;
  isSupport: boolean;
  isUser: boolean;
  formatDate: (date: string) => string;
  formatTime: (date: string) => string;
  getInitial: (username: string) => string;
  isInitialLoad?: boolean;
  onImageClick?: (url: string, alt: string) => void;
  formatFileSize: (bytes: number) => string;
}

/**
 * Single message bubble in the admin support panel. Renders user, support, and
 * system messages, with attachments grouped into image grids and document
 * cards. Animates entry with GSAP unless `isInitialLoad` is set.
 *
 * Kept distinct from the user-facing `MessageItem` because the admin variant
 * accepts the role classification (`isSupport` / `isUser` / `isSystemMessage`)
 * as props from the parent's filter rather than computing it from `userData`,
 * and uses string-typed `formatDate` / `formatTime` matching the admin
 * formatters.
 */
export const AdminMessageItem = memo(function AdminMessageItem({
  message,
  showDate,
  isSystemMessage,
  isSupport,
  isUser,
  formatDate,
  formatTime,
  getInitial,
  isInitialLoad = false,
  onImageClick,
  formatFileSize,
}: AdminMessageItemProps) {
  const messageRef = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);

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

  return (
    <div ref={messageRef}>
      {showDate && (
        <div className="my-4 text-center text-xs text-neutral-500">
          {formatDate(message.created_at)}
        </div>
      )}
      {/* Логика: саппорт справа (items-end), пользователь слева (items-start), системные сообщения слева */}
      {isSystemMessage ? (
        <div className="flex w-full flex-col items-start">
          {/* Заголовок с именем "Система" */}
          <div className="mb-1.5 flex items-baseline gap-1.5 px-1">
            <span className="rounded bg-white/10 px-2 py-1 text-sm font-medium text-yellow-400">
              Система
            </span>
          </div>

          {/* Сообщение */}
          <div
            className="min-w-0 max-w-[70%] flex-shrink-0 rounded-2xl bg-neutral-700/50 px-4 py-3 text-neutral-300"
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
          >
            {(() => {
              const bubbleText = messageTextForBubble(
                message.message_text || '',
                !!(message.attachments && message.attachments.length),
              );
              return bubbleText ? (
                <p className="whitespace-pre-wrap break-words text-sm">{bubbleText}</p>
              ) : null;
            })()}
            <div className="mt-1.5 flex items-center gap-2 text-xs text-neutral-400">
              <span>{formatTime(message.created_at)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`flex flex-col ${isSupport ? 'items-end' : 'items-start'} ${isSupport ? 'ml-auto max-w-[75%]' : ''}`}
        >
          {/* Заголовок с именем */}
          {isUser && message.sender && (
            <div className="mb-1.5 flex items-baseline gap-1.5 px-1">
              <span className="rounded bg-white/10 px-2 py-1 text-sm font-medium text-white">
                {message.sender.username}
              </span>
              <span className="text-xs text-neutral-400">#{message.sender.user_id}</span>
            </div>
          )}
          {isSupport && message.sender && (
            <div className="mb-1.5 flex items-baseline gap-1.5 px-1">
              <span className="rounded bg-white/10 px-2 py-1 text-sm font-medium text-white">
                {message.sender.username}
              </span>
              <span className="text-xs text-white">Поддержка</span>
            </div>
          )}

          {/* Сообщение с аватаркой */}
          <div
            className={`flex items-end gap-3 ${isSupport ? 'flex-row-reverse' : 'flex-row'} ${isSupport ? 'w-full' : 'w-full'}`}
          >
            {/* Аватарка для пользователя (слева) */}
            {isUser &&
              message.sender &&
              (() => {
                const avatarUrl = getAvatarUrl(message.sender.avatar);
                const gradientClasses = getGradientClasses(message.sender.avatar);

                const avatarEl = (
                  <div
                    className={`h-10 w-10 overflow-hidden rounded-full ${avatarUrl ? '' : gradientClasses} mb-1 flex flex-shrink-0 items-center justify-center text-sm font-semibold text-white`}
                  >
                    {avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt={message.sender.username}
                        width={40}
                        height={40}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    ) : (
                      getInitial(message.sender.username)
                    )}
                  </div>
                );
                return message.sender.user_id ? (
                  <Link
                    href={`/user/${message.sender.user_id}`}
                    prefetch={false}
                    className="transition-opacity hover:opacity-80"
                  >
                    {avatarEl}
                  </Link>
                ) : (
                  avatarEl
                );
              })()}

            {/* Пузырь сообщения */}
            <div
              className={`${isSupport ? 'max-w-[60%]' : 'max-w-[70%]'} min-w-0 flex-shrink-0 rounded-2xl px-4 py-3 ${
                isSupport
                  ? message.is_read
                    ? 'rounded-br-sm bg-blue-600 text-white'
                    : 'rounded-br-sm bg-neutral-800 text-neutral-100'
                  : 'rounded-bl-sm bg-neutral-800 text-neutral-100'
              }`}
              style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
            >
              {(() => {
                const bubbleText = messageTextForBubble(
                  message.message_text || '',
                  !!(message.attachments && message.attachments.length),
                );
                return bubbleText ? (
                  <p className="whitespace-pre-wrap break-words text-sm">{bubbleText}</p>
                ) : null;
              })()}

              {/* Вложения */}
              {message.attachments &&
                message.attachments.length > 0 &&
                (() => {
                  const images = message.attachments!.filter((a) =>
                    a.file_type.startsWith('image/'),
                  );
                  const documents = message.attachments!.filter(
                    (a) => !a.file_type.startsWith('image/'),
                  );
                  const bubbleText = messageTextForBubble(message.message_text || '', true);

                  return (
                    <div className={`space-y-2 ${bubbleText ? 'mt-2' : ''}`}>
                      {/* Группировка изображений */}
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
                                isRead={message.is_read}
                                blurHash={attachment.blur_hash ?? undefined}
                                width={attachment.width ?? undefined}
                                height={attachment.height ?? undefined}
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
                              className="flex cursor-pointer items-center gap-2 rounded-lg bg-neutral-700/50 p-2 transition-colors hover:bg-neutral-700/70"
                            >
                              <FileText className="h-4 w-4 flex-shrink-0 text-neutral-300" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">
                                  {attachment.file_name}
                                </p>
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

              <div
                className={`mt-1.5 flex items-center gap-2 text-xs ${
                  isSupport
                    ? message.is_read
                      ? 'text-blue-100'
                      : 'text-neutral-400'
                    : 'text-neutral-400'
                }`}
              >
                <span>{formatTime(message.created_at)}</span>
                {/* Индикация прочитанных сообщений саппорта пользователем */}
                {isSupport && message.is_read && (
                  <svg
                    className="h-3.5 w-3.5 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
