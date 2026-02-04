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
const MessageInput = forwardRef<MessageInputRef, MessageInputProps>(({
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
}, ref) => {
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
      <div className="p-2 sm:p-4 border-t border-white/10 flex-shrink-0">
        <div className="text-center py-4 px-4 bg-neutral-800/50 border border-neutral-700 rounded-xl">
          <p className="text-neutral-400 text-sm">
            Этот тикет закрыт. Вы не можете отправлять сообщения в закрытые тикеты.
          </p>
        </div>
      </div>
    );
  }

  if (isSupportOwnTicket) {
    return (
      <div className="p-2 sm:p-4 border-t border-white/10 flex-shrink-0">
        <div className="text-center py-4 px-4 bg-neutral-800/50 border border-neutral-700 rounded-xl">
          <p className="text-neutral-400 text-sm">
            Вы не можете отправлять сообщения в свои старые тикеты.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 border-t border-white/10 flex-shrink-0">
      {/* Список загруженных файлов */}
      {uploadedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {uploadedFiles.map((file, index) => {
            const isImage = file.fileType.startsWith('image/');

            return (
              <div
                key={index}
                className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800/50 rounded-lg border border-white/10 text-sm"
              >
                {isImage ? (
                  <ImageIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                )}
                <span className="text-neutral-300 truncate max-w-[150px]">
                  {file.fileName}
                </span>
                <button
                  onClick={() => onRemoveFile(index)}
                  className="p-1 hover:bg-red-500/20 rounded transition-colors"
                  aria-label="Удалить файл"
                >
                  <X className="w-3 h-3 text-red-400" />
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
          className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 disabled:bg-neutral-800 disabled:text-neutral-500 text-white rounded-xl transition-colors text-sm sm:text-base flex-shrink-0"
          title="Прикрепить файл"
          aria-label="Прикрепить файл"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* Поле ввода */}
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={messageText}
            onChange={handleChange}
            onKeyPress={handleKeyPress}
            placeholder={timeoutSeconds > 0 ? "Ожидание.." : "Напишите сообщение..."}
            disabled={timeoutSeconds > 0}
            className="w-full min-w-0 px-3 py-2 sm:px-4 text-sm sm:text-base bg-neutral-800 border border-white/10 rounded-xl text-white focus:outline-none focus:border-primary-500 disabled:opacity-50 pr-10"
          />

          {/* Счетчик символов */}
          {timeoutSeconds === 0 && (
            <div className="absolute bottom-1 right-3 text-[10px] text-neutral-500">
              {messageText.length}/{maxLength}
            </div>
          )}

          {/* Таймер ожидания */}
          {timeoutSeconds > 0 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-neutral-400">
              <svg 
                className="w-4 h-4" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
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
          disabled={(!messageText.trim() && uploadedFiles.length === 0) || timeoutSeconds > 0 || isSending}
          className="px-4 sm:px-6 py-2 bg-primary-500 hover:bg-primary-400 disabled:bg-neutral-700 text-white rounded-xl transition-colors text-sm sm:text-base"
        >
          {isSending ? 'Отправка...' : 'Отправить'}
        </button>
      </div>
    </div>
  );
});

MessageInput.displayName = 'MessageInput';

export default MessageInput;
