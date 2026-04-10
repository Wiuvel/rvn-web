'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { Bell, CheckCheck, Check, LifeBuoy, ArrowLeft } from 'lucide-react';

/** Formats a date string as Russian relative time ("2 мин назад", "вчера") */
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  if (hours < 24) return `${hours} ч назад`;
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн назад`;

  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

/** Resolves icon component by notification type */
function NotificationIcon({ type }: { type: string }) {
  if (type === 'support_reply' || type === 'ticket_status') {
    return <LifeBuoy className="h-5 w-5 text-primary-400" />;
  }
  return <Bell className="h-5 w-5 text-neutral-400" />;
}

/** Full notifications page with infinite scroll and mark-read actions */
export default function NotificationsPageClient() {
  const router = useRouter();
  const { userData, loading: authLoading } = useAuth({ silent: true });
  const { markRead, markAllRead, unreadCount } = useNotifications({ enabled: !!userData });

  /* Infinite scroll via tRPC cursor pagination */
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.notification.list.useInfiniteQuery(
      { limit: 20 },
      {
        enabled: !!userData,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    );

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node || !hasNextPage || isFetchingNextPage) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) fetchNextPage();
        },
        { rootMargin: '200px' },
      );
      observerRef.current.observe(node);
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  /* Redirect unauthenticated users */
  useEffect(() => {
    if (!authLoading && !userData) {
      router.replace('/auth');
    }
  }, [authLoading, userData, router]);

  const allNotifications = data?.pages.flatMap((p) => p.items) ?? [];

  const handleClick = (notification: {
    id: string;
    isRead: boolean;
    relatedTicketId: string | null;
  }) => {
    if (!notification.isRead) {
      markRead(notification.id);
    }
    if (notification.relatedTicketId) {
      router.push(`/support?ticket=${notification.relatedTicketId}`);
    }
  };

  if (authLoading || !userData) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-primary-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 pb-24 lg:pb-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="rounded-xl p-2 text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Назад"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-semibold text-white">Уведомления</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary-500/20 px-2.5 py-0.5 text-xs font-semibold text-primary-400">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllRead()}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <CheckCheck className="h-4 w-4" />
            Прочитать все
          </button>
        )}
      </div>

      {/* Список */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-primary-500" />
        </div>
      ) : allNotifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-800/50">
            <Bell className="h-10 w-10 text-neutral-500" />
          </div>
          <p className="text-sm text-neutral-400">Нет уведомлений</p>
        </div>
      ) : (
        <div className="space-y-1">
          {allNotifications.map((notification) => (
            <button
              key={notification.id}
              onClick={() =>
                handleClick({
                  id: notification.id,
                  isRead: notification.isRead,
                  relatedTicketId: notification.relatedTicketId,
                })
              }
              className={`group flex w-full items-start gap-4 rounded-2xl px-4 py-4 text-left transition-colors ${
                !notification.isRead
                  ? 'bg-primary-500/5 hover:bg-primary-500/10'
                  : 'hover:bg-white/[0.03]'
              }`}
            >
              <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/5">
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
                <p className="mt-1 text-sm leading-relaxed text-neutral-400">
                  {notification.count > 1
                    ? `(${notification.count}) ${notification.message}`
                    : notification.message}
                </p>
                <span className="mt-1.5 block text-xs text-neutral-500">
                  {formatRelativeTime(notification.createdAt.toString())}
                </span>
              </div>
              {!notification.isRead && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    markRead(notification.id);
                  }}
                  className="mt-1 flex-shrink-0 rounded-lg p-1.5 text-neutral-500 opacity-0 transition-all hover:text-primary-400 group-hover:opacity-100"
                  title="Прочитать"
                  aria-label="Прочитать"
                >
                  <Check className="h-4 w-4" />
                </button>
              )}
            </button>
          ))}

          {/* Infinite scroll sentinel */}
          {hasNextPage && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              {isFetchingNextPage && (
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-600 border-t-primary-500" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
