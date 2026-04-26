'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMenuAnimation } from '@/hooks/useMenuAnimation';
import { useNotifications } from '@/hooks/useNotifications';
import { Bell as BellIcon, Check, CheckCheck, LifeBuoy, ExternalLink } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils/format';

interface NotificationsWidgetProps {
  isMobile?: boolean;
  /** Active ticket ID — matching notifications are auto-marked as read */
  activeTicketId?: string;
}

/** Resolves icon component by notification type */
function NotificationIcon({ type }: { type: string }) {
  if (type === 'support_reply' || type === 'ticket_status') {
    return <LifeBuoy className="h-4 w-4 text-primary-400" />;
  }
  return <BellIcon className="h-4 w-4 text-neutral-400" />;
}

/** Bell icon widget with dropdown — uses tRPC + WebSocket via useNotifications */
export function NotificationsWidget({
  isMobile = false,
  activeTicketId,
}: NotificationsWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { shouldRender, menuRef: animatedMenuRef } = useMenuAnimation(isOpen);
  const router = useRouter();

  const { unreadCount, notifications, isLoading, markRead, markAllRead } = useNotifications({
    activeTicketId,
  });

  /* Close on outside click */
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleNotificationClick = (notification: {
    id: string;
    isRead: boolean;
    relatedTicketId?: string | null;
  }) => {
    if (!notification.isRead) {
      markRead(notification.id);
    }
    setIsOpen(false);
    if (notification.relatedTicketId) {
      router.push(`/support?ticket=${notification.relatedTicketId}`);
    }
  };

  const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="relative flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-neutral-800/60 text-white/80 transition-all duration-200 hover:scale-110 hover:bg-neutral-700/60 hover:text-white"
        title="Уведомления"
        aria-label="Уведомления"
        aria-expanded={isOpen}
      >
        <div className="relative">
          <BellIcon className="h-6 w-6" />
          {unreadCount > 0 && (
            <span className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-neutral-800">
              {badgeText}
            </span>
          )}
        </div>
      </button>

      {/* Dropdown menu */}
      {shouldRender && (
        <div
          ref={animatedMenuRef}
          className={`absolute z-50 overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/95 shadow-xl backdrop-blur-xl ${
            isMobile ? 'fixed left-4 right-4 top-[70px] mt-0 w-auto' : '-right-3 top-full mt-5 w-80'
          } `}
        >
          {/* Dropdown header */}
          <div className="mx-2 flex items-center justify-between border-b border-white/10 p-4">
            <h3 className="text-sm font-semibold text-white">Уведомления</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <>
                  <span className="rounded-full bg-primary-500/20 px-2 py-0.5 text-xs font-semibold text-primary-400">
                    {unreadCount}
                  </span>
                  <button
                    onClick={() => markAllRead()}
                    className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
                    title="Прочитать все"
                    aria-label="Прочитать все"
                  >
                    <CheckCheck className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-neutral-600 border-t-primary-500" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800/50">
                  <BellIcon className="h-8 w-8 text-neutral-500" />
                </div>
                <p className="text-sm text-neutral-400">Нет уведомлений</p>
              </div>
            ) : (
              <div className="space-y-0.5 py-2">
                {notifications.map(
                  (notification: {
                    id: string;
                    type: string;
                    title: string;
                    message: string;
                    isRead: boolean;
                    count: number;
                    relatedTicketId: string | null;
                    createdAt: Date | string;
                  }) => (
                    <button
                      key={notification.id}
                      onClick={() =>
                        handleNotificationClick({
                          id: notification.id,
                          isRead: notification.isRead,
                          relatedTicketId: notification.relatedTicketId,
                        })
                      }
                      className={`mx-2 w-[calc(100%-16px)] cursor-pointer rounded-xl px-3 py-3 text-left transition-colors duration-200 ${
                        !notification.isRead
                          ? 'bg-primary-500/5 hover:bg-primary-500/10'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/5">
                          <NotificationIcon type={notification.type} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-medium ${!notification.isRead ? 'text-white' : 'text-white/80'}`}
                            >
                              {notification.title}
                            </span>
                            {!notification.isRead && (
                              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-primary-500" />
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs text-neutral-400">
                            {notification.message}
                            {notification.count > 1 && (
                              <span className="ml-1.5 inline-flex items-center rounded-full bg-primary-500/20 px-1.5 text-[10px] font-semibold text-primary-400">
                                {notification.count}
                              </span>
                            )}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-[11px] text-neutral-500">
                              {formatRelativeTime(notification.createdAt.toString())}
                            </span>
                            {!notification.isRead && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markRead(notification.id);
                                }}
                                className="rounded p-0.5 text-neutral-500 transition-colors hover:text-primary-400"
                                title="Прочитать"
                                aria-label="Прочитать"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ),
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-white/10 p-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push('/notifications');
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                Все уведомления
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
