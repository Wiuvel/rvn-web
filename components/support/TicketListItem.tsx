'use client';

import { normalizeLastMessageDisplayText } from '@/lib/utils/support-messages';
import type { Ticket } from './types';

interface TicketListItemProps {
  ticket: Ticket;
  isActive: boolean;
  onClick: () => void;
  formatDate: (date: Date) => string;
  formatTime: (date: Date) => string;
}

const SYSTEM_MESSAGE_TEXT = 'Спасибо за ваше обращение. Мы получили ваш запрос и ответим в ближайшее время.';

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
          text: 'Открыт'
        };
      case 'pending':
        return {
          className: 'bg-yellow-500/20 text-yellow-400',
          text: 'В работе'
        };
      default:
        return {
          className: 'bg-neutral-700 text-neutral-400',
          text: 'Закрыт'
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
    const isStatusChangeMessage = lastMessageText.includes('Статус тикета изменен') ||
      lastMessageText.includes('Ваше обращение приняли в обработку') ||
      lastMessageText.includes('Ваше обращение было закрыто');
    isSystemMessage = lastMessageText.trim() === SYSTEM_MESSAGE_TEXT.trim() || isStatusChangeMessage;
    
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
      className={`w-full text-left p-3 rounded-xl transition-colors ${getButtonClassName()}`}
    >
      <div className="flex items-start justify-between mb-1">
        <span className="text-sm font-medium text-white truncate flex-1">
          {ticket.subject}
        </span>
        <span className={`ml-2 px-2 py-0.5 text-xs rounded ${statusBadge.className}`}>
          {statusBadge.text}
        </span>
      </div>
      
      <div className="flex items-center justify-between mt-1">
        <div className="text-xs text-neutral-400 flex-1 min-w-0">
          {formatDate(ticket.createdAt)}, {formatTime(ticket.createdAt)}
        </div>
      </div>
      
      {showLastMessage && lastMessage && (
        <div className="text-xs text-neutral-500 mt-1.5">
          <div className="truncate flex items-center gap-2">
            <span className="flex-shrink-0 text-neutral-600">
              {senderLabel}
            </span>
            <span className="truncate flex-1 min-w-0">
              {normalizeLastMessageDisplayText(lastMessage.message_text || '') || '—'}
            </span>
            {lastMessage.is_read === false && lastMessage.sender_type === 'support' && !isSystemMessage && (
              <span className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full"></span>
            )}
          </div>
        </div>
      )}
    </button>
  );
}
