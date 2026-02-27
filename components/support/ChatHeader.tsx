'use client';

import type { Ticket } from './types';

interface ChatHeaderProps {
  ticket: Ticket;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onBack: () => void;
  formatDateShort: (date: Date) => string;
}

/**
 * Header component for the chat area showing ticket subject, creation date, and status.
 * Includes back button for mobile and sidebar toggle for desktop.
 */
export default function ChatHeader({
  ticket,
  sidebarCollapsed,
  onToggleSidebar,
  onBack,
  formatDateShort,
}: ChatHeaderProps) {
  const handleBackClick = () => {
    if (sidebarCollapsed) {
      onToggleSidebar();
    } else {
      onBack();
    }
  };

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

  const statusBadge = getStatusBadge();

  return (
    <div className="flex-shrink-0 border-b border-white/10 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        {/* Кнопка возврата к списку на мобильных; на ПК при свёрнутой панели — развернуть список */}
        <button
          onClick={handleBackClick}
          className={`${sidebarCollapsed ? 'lg:flex' : 'lg:hidden'} mr-2 rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-white/5 hover:text-white`}
          aria-label={sidebarCollapsed ? 'Показать список тикетов' : 'Вернуться к списку тикетов'}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold sm:text-lg">{ticket.subject}</h3>
          <p className="text-xs text-neutral-400 sm:text-sm">
            Создан {formatDateShort(ticket.createdAt)}
          </p>
        </div>

        <span className={`rounded-full px-3 py-1 text-xs ${statusBadge.className}`}>
          {statusBadge.text}
        </span>
      </div>
    </div>
  );
}
