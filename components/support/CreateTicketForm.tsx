'use client';

import { forwardRef, useRef, useImperativeHandle } from 'react';

interface CreateTicketFormProps {
  subject: string;
  message: string;
  onSubjectChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isCreating: boolean;
  maxSubjectLength: number;
  maxMessageLength: number;
  onMaxSubjectLengthExceeded?: () => void;
  onMaxMessageLengthExceeded?: () => void;
  variant?: 'inline' | 'modal';
  isVisible?: boolean;
}

export interface CreateTicketFormRef {
  focusSubject: () => void;
}

/**
 * Form for creating a new support ticket with subject and message fields.
 * Supports both inline (in sidebar) and modal variants.
 */
const CreateTicketForm = forwardRef<CreateTicketFormRef, CreateTicketFormProps>(({
  subject,
  message,
  onSubjectChange,
  onMessageChange,
  onSubmit,
  onCancel,
  isCreating,
  maxSubjectLength,
  maxMessageLength,
  onMaxSubjectLengthExceeded,
  onMaxMessageLengthExceeded,
  variant = 'inline',
  isVisible = true,
}, ref) => {
  const subjectInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focusSubject: () => subjectInputRef.current?.focus(),
  }));

  const handleSubjectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.length <= maxSubjectLength) {
      onSubjectChange(value);
    } else {
      onMaxSubjectLengthExceeded?.();
    }
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= maxMessageLength) {
      onMessageChange(value);
    } else {
      onMaxMessageLengthExceeded?.();
    }
  };

  const handleSubjectKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Don't submit on Enter in subject field
    }
  };

  const handleMessageKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const isInline = variant === 'inline';
  const containerStyle = isInline && !isVisible 
    ? { height: 0, marginBottom: 0, opacity: 0, overflow: 'hidden' as const } 
    : {};

  return (
    <div
      className={`${isInline ? 'mb-4 p-3 bg-neutral-800/50 rounded-xl flex-shrink-0' : ''} space-y-3 ${isInline && !isVisible ? 'hidden' : ''}`}
      style={containerStyle}
    >
      {/* Subject field */}
      <div>
        <input
          ref={subjectInputRef}
          type="text"
          value={subject}
          onChange={handleSubjectChange}
          onKeyPress={handleSubjectKeyPress}
          placeholder="Тема обращения.."
          className="w-full px-3 py-2 bg-neutral-900 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
          autoFocus={isInline}
        />
        <div className="text-xs text-neutral-500 mt-1 text-right">
          {subject.length}/{maxSubjectLength}
        </div>
      </div>

      {/* Message field */}
      <div>
        <textarea
          value={message}
          onChange={handleMessageChange}
          onKeyPress={handleMessageKeyPress}
          placeholder="Опишите свою проблему.."
          rows={3}
          className="w-full px-3 py-2 bg-neutral-900 border border-white/10 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-primary-500 resize-none"
        />
        <div className="text-xs text-neutral-500 mt-1 text-right">
          {message.length}/{maxMessageLength}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={onSubmit}
          disabled={!subject.trim() || !message.trim() || isCreating}
          className={`flex-1 ${isInline ? 'px-3 py-1.5' : 'px-3 py-2'} bg-primary-500 hover:bg-primary-400 disabled:bg-neutral-700 disabled:text-neutral-500 text-white text-sm rounded-lg transition-colors`}
        >
          {isCreating ? 'Создание...' : 'Создать'}
        </button>
        <button
          onClick={onCancel}
          className={`${isInline ? 'px-3 py-1.5' : 'px-3 py-2'} bg-neutral-700 hover:bg-neutral-600 text-white text-sm rounded-lg transition-colors`}
        >
          Отмена
        </button>
      </div>
    </div>
  );
});

CreateTicketForm.displayName = 'CreateTicketForm';

export default CreateTicketForm;
