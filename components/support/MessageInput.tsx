'use client';

import { useRef, forwardRef, useImperativeHandle } from 'react';
import { Paperclip, X, Image as ImageIcon, FileText } from 'lucide-react';
import type { UploadedFile } from './types';

interface MessageInputProps {
  messageText: string;
  onMessageChange: (text: string) => void;
  onSend: () => void;
  onAttachClick: () => void;
  uploadedFiles: UploadedFile[];
  onRemoveFile: (index: number) => void;
  isSending: boolean;
  timeoutSeconds: number;
  isTicketClosed: boolean;
  isSupportOwnTicket?: boolean;
  maxLength: number;
  onMaxLengthExceeded?: () => void;
}

export interface MessageInputRef {
  focus: () => void;
}

/**
 * Message input component with file attachments, character counter, and send button.
 * Supports timeout countdown and handles message validation.
 */
const MessageInput = forwardRef<MessageInputRef, MessageInputProps>(
  (
    {
      messageText,
      onMessageChange,
      onSend,
      onAttachClick,
      uploadedFiles,
      onRemoveFile,
      isSending,
      timeoutSeconds,
      isTicketClosed,
      isSupportOwnTicket = false,
      maxLength,
      onMaxLengthExceeded,
    },
    ref,
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !isSending) {
        onSend();
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (value.length <= maxLength) {
        onMessageChange(value);
      } else {
        onMaxLengthExceeded?.();
      }
    };

    if (isTicketClosed) {
      return (
        <div className="flex-shrink-0 border-t border-white/10 p-2 sm:p-4">
          <div className="rounded-xl border border-neutral-700 bg-neutral-800/50 px-4 py-4 text-center">
            <p className="text-sm text-neutral-400">
              Этот тикет закрыт. Вы не можете отправлять сообщения в закрытые тикеты.
            </p>
          </div>
        </div>
      );
    }

    if (isSupportOwnTicket) {
      return (
        <div className="flex-shrink-0 border-t border-white/10 p-2 sm:p-4">
          <div className="rounded-xl border border-neutral-700 bg-neutral-800/50 px-4 py-4 text-center">
            <p className="text-sm text-neutral-400">
              Вы не можете отправлять сообщения в свои старые тикеты.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-shrink-0 border-t border-white/10 p-2 sm:p-4">
        {/* Список загруженных файлов */}
        {uploadedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {uploadedFiles.map((file, index) => {
              const isImage = file.fileType.startsWith('image/');

              return (
                <div
                  key={file.storageUrl || index}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-800/50 px-3 py-1.5 text-sm"
                >
                  {isImage ? (
                    <ImageIcon className="h-4 w-4 flex-shrink-0 text-blue-400" />
                  ) : (
                    <FileText className="h-4 w-4 flex-shrink-0 text-neutral-400" />
                  )}
                  <span className="max-w-[150px] truncate text-neutral-300">{file.fileName}</span>
                  <button
                    onClick={() => onRemoveFile(index)}
                    className="rounded p-1 transition-colors hover:bg-red-500/20"
                    aria-label="Удалить файл"
                  >
                    <X className="h-3 w-3 text-red-400" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          {/* Кнопка прикрепления */}
          <button
            onClick={onAttachClick}
            disabled={timeoutSeconds > 0 || isSending || uploadedFiles.length >= 2}
            className="flex-shrink-0 rounded-xl bg-neutral-700 px-3 py-2 text-sm text-white transition-colors hover:bg-neutral-600 disabled:bg-neutral-800 disabled:text-neutral-500 sm:text-base"
            title="Прикрепить файл"
            aria-label="Прикрепить файл"
          >
            <Paperclip className="h-5 w-5" />
          </button>

          {/* Поле ввода */}
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={messageText}
              onChange={handleChange}
              onKeyPress={handleKeyPress}
              placeholder={timeoutSeconds > 0 ? 'Ожидание..' : 'Напишите сообщение...'}
              aria-label="Введите сообщение"
              disabled={timeoutSeconds > 0}
              className="w-full min-w-0 rounded-xl border border-white/10 bg-neutral-800 px-3 py-2 pr-10 text-sm text-white focus:border-primary-500 focus:outline-none disabled:opacity-50 sm:px-4 sm:text-base"
            />

            {/* Счетчик символов */}
            {timeoutSeconds === 0 && (
              <div className="absolute bottom-1 right-3 text-[10px] text-neutral-500">
                {messageText.length}/{maxLength}
              </div>
            )}

            {/* Таймер ожидания */}
            {timeoutSeconds > 0 && (
              <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-neutral-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-xs font-medium">{timeoutSeconds}с</span>
              </div>
            )}
          </div>

          {/* Кнопка отправки */}
          <button
            onClick={onSend}
            disabled={
              (!messageText.trim() && uploadedFiles.length === 0) || timeoutSeconds > 0 || isSending
            }
            className="rounded-xl bg-primary-500 px-4 py-2 text-sm text-white transition-colors hover:bg-primary-400 disabled:bg-neutral-700 sm:px-6 sm:text-base"
          >
            {isSending ? 'Отправка...' : 'Отправить'}
          </button>
        </div>
      </div>
    );
  },
);

MessageInput.displayName = 'MessageInput';

export default MessageInput;
