'use client';

import { normalizeLastMessageDisplayText } from '@/lib/support/messages';
import type { Ticket } from './types';

interface TicketListItemProps {
  ticket: Ticket;
  isActive: boolean;
  onClick: () => void;
  formatDate: (date: Date) => string;
  formatTime: (date: Date) => string;
}

const SYSTEM_MESSAGE_TEXT =
  'Спасибо за ваше обращение. Мы получили ваш запрос и ответим в ближайшее время.';

/**
 * Individual ticket item in the ticket list sidebar.
 * Shows ticket subject, status, creation date, and last message preview.
 */
export default function TicketListItem({
  ticket,
  isActive,
  onClick,
  formatDate,
  formatTime,
}: TicketListItemProps) {
  const getStatusBadge = () => {
    switch (ticket.status) {
      case 'open':
        return {
          className: 'bg-green-500/20 text-green-400',
          text: 'Открыт',
        };
      case 'pending':
        return {
          className: 'bg-yellow-500/20 text-yellow-400',
          text: 'В работе',
        };
      default:
        return {
          className: 'bg-neutral-700 text-neutral-400',
          text: 'Закрыт',
        };
    }
  };

  const getButtonClassName = () => {
    if (isActive) {
      switch (ticket.status) {
        case 'open':
          return 'bg-green-500/20 border border-green-500/50 cursor-default';
        case 'pending':
          return 'bg-yellow-500/20 border border-yellow-500/50 cursor-default';
        default:
          return 'bg-red-500/20 border border-red-500/50 cursor-default';
      }
    }
    return 'bg-neutral-800/50 hover:bg-neutral-800 border border-transparent';
  };

  const statusBadge = getStatusBadge();

  // Определяем тип последнего сообщения
  const lastMessage = ticket.last_message;
  const showLastMessage = lastMessage && ticket.status !== 'closed';

  let senderLabel = '';
  let isSystemMessage = false;

  if (showLastMessage && lastMessage) {
    const lastMessageText = lastMessage.message_text || '';
    const isStatusChangeMessage =
      lastMessageText.includes('Статус тикета изменен') ||
      lastMessageText.includes('Ваше обращение приняли в обработку') ||
      lastMessageText.includes('Ваше обращение было закрыто');
    isSystemMessage =
      lastMessageText.trim() === SYSTEM_MESSAGE_TEXT.trim() || isStatusChangeMessage;

    if (isSystemMessage) {
      senderLabel = 'Система:';
    } else if (lastMessage.sender_type === 'user') {
      senderLabel = 'Вы:';
    } else {
      senderLabel = 'Поддержка:';
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={isActive}
      className={`w-full rounded-xl p-3 text-left transition-colors ${getButtonClassName()}`}
    >
      <div className="mb-1 flex items-start justify-between">
        <span className="flex-1 truncate text-sm font-medium text-white">{ticket.subject}</span>
        <span className={`ml-2 rounded px-2 py-0.5 text-xs ${statusBadge.className}`}>
          {statusBadge.text}
        </span>
      </div>

      <div className="mt-1 flex items-center justify-between">
        <div className="min-w-0 flex-1 text-xs text-neutral-400">
          {formatDate(ticket.createdAt)}, {formatTime(ticket.createdAt)}
        </div>
      </div>

      {showLastMessage && lastMessage && (
        <div className="mt-1.5 text-xs text-neutral-500">
          <div className="flex items-center gap-2 truncate">
            <span className="flex-shrink-0 text-neutral-600">{senderLabel}</span>
            <span className="min-w-0 flex-1 truncate">
              {normalizeLastMessageDisplayText(lastMessage.message_text || '') || '—'}
            </span>
            {lastMessage.is_read === false &&
              lastMessage.sender_type === 'support' &&
              !isSystemMessage && (
                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500"></span>
              )}
          </div>
        </div>
      )}
    </button>
  );
}
