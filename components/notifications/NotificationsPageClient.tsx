'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import Header from '@/components/layout/Header';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { Bell, CheckCheck, Check, LifeBuoy, ArrowLeft } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils/format';

/**
 * Resolves the appropriate icon component based on the notification type.
 *
 * @param props Component properties containing the notification type.
 * @returns React node representing the icon.
 */
function GroupIcon({ type }: { type: string }) {
  if (type === 'support_reply' || type === 'ticket_status') {
    return <LifeBuoy className="h-5 w-5 text-primary-400" />;
  }
  return <Bell className="h-5 w-5 text-neutral-400" />;
}

/**
 * Main component for the notifications page.
 * Displays a paginated, grouped list of user notifications using an accordion layout.
 *
 * @returns React component.
 */
export default function NotificationsPageClient() {
  const router = useRouter();
  const { userData, loading: authLoading } = useAuth({
    requireAuth: true,
    redirectOnFail: '/auth',
  });
  const { markRead, markAllRead, markGroupRead, unreadCount } = useNotifications({
    enabled: !!userData,
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.notification.groupedList.useInfiniteQuery(
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

  const allGroups = data?.pages.flatMap((p) => p.groups) ?? [];

  const handleItemClick = (item: { id: string; isRead: boolean }, ticketId: string | null) => {
    if (!item.isRead) markRead(item.id);
    if (ticketId) router.push(`/support?ticket=${ticketId}`);
  };

  if (authLoading || !userData) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-primary-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-primary-500/30">
      <Header />
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-24 lg:pb-8 lg:pt-32">
        <button
          onClick={() => router.back()}
          className="mb-8 inline-flex items-center gap-2 text-base text-neutral-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
          Назад
        </button>

        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
                Уведомления
              </h1>
              {unreadCount > 0 && (
                <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-primary-500 px-2 text-xs font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <p className="mt-3 text-sm text-neutral-400">Ответы поддержки и системные события</p>
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

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-primary-500" />
          </div>
        ) : allGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.03]">
              <Bell className="h-10 w-10 text-neutral-500" />
            </div>
            <p className="text-sm text-neutral-400">Нет уведомлений</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Accordion type="multiple">
              {allGroups.map((group, idx) => {
                const groupKey = group.relatedTicketId ?? `group-${idx}`;
                const mainType = group.items[0]?.type ?? 'other';
                const groupTitle = group.ticketSubject ? group.ticketSubject : 'Уведомление';

                return (
                  <AccordionItem
                    key={groupKey}
                    value={groupKey}
                    className="mb-2 overflow-hidden rounded-2xl border !border-b border-white/[0.06] bg-white/[0.02]"
                  >
                    <AccordionTrigger className="gap-3 px-4 py-3 hover:bg-white/[0.03] hover:no-underline">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/5">
                          <GroupIcon type={mainType} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-white">
                              {groupTitle}
                            </span>
                            {group.unreadCount > 0 && (
                              <span className="flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-full bg-primary-500 px-1.5 text-[11px] font-bold text-white">
                                {group.unreadCount}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-neutral-500">
                            {formatRelativeTime(group.latestAt)}
                            {group.totalCount > 1 && (
                              <span className="text-neutral-600">
                                {' · '}
                                {group.totalCount} сообщ.
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </AccordionTrigger>

                    <AccordionContent className="px-4 pb-3">
                      <div className="space-y-0.5">
                        {group.items.map(
                          (item: {
                            id: string;
                            type: string;
                            title: string;
                            message: string;
                            isRead: boolean;
                            count: number;
                            createdAt: string;
                          }) => (
                            <button
                              key={item.id}
                              onClick={() =>
                                handleItemClick(
                                  { id: item.id, isRead: item.isRead },
                                  group.relatedTicketId,
                                )
                              }
                              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                                !item.isRead
                                  ? 'bg-primary-500/[0.04] hover:bg-primary-500/[0.08]'
                                  : 'hover:bg-white/[0.03]'
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                                  !item.isRead ? 'bg-primary-500' : 'bg-neutral-700'
                                }`}
                              />
                              <span
                                className={`flex-1 text-sm ${!item.isRead ? 'text-neutral-200' : 'text-neutral-500'}`}
                              >
                                {item.message}
                              </span>
                              <span className="flex-shrink-0 text-xs text-neutral-600">
                                {formatRelativeTime(item.createdAt)}
                              </span>
                              {!item.isRead && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markRead(item.id);
                                  }}
                                  className="flex-shrink-0 rounded-lg p-1 text-neutral-600 opacity-0 transition-all hover:text-primary-400 group-hover:opacity-100"
                                  title="Прочитать"
                                  aria-label="Прочитать"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </button>
                          ),
                        )}
                      </div>

                      {group.unreadCount > 0 && group.relatedTicketId && (
                        <button
                          onClick={() => markGroupRead(group.relatedTicketId!)}
                          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium text-neutral-500 transition-colors hover:bg-white/[0.03] hover:text-neutral-300"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          Прочитать все в группе
                        </button>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            {hasNextPage && (
              <div ref={sentinelRef} className="flex justify-center py-4">
                {isFetchingNextPage && (
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-600 border-t-primary-500" />
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
